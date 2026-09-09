"""Bounded extraction of PNG and JPEG evidence from a frozen source tree.

The extractor deliberately reads only saved bytes.  It never executes notebooks,
HTML, or Office documents, and it does not fetch remote resources.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import re
import struct
import time
from html import unescape
from pathlib import Path
from typing import Any, Iterable


MAX_FILES = 25_000
MAX_INPUT_FILE_BYTES = 20 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000
DEFAULT_MAX_READ_BYTES = 200 * 1024 * 1024
DEFAULT_MAX_SCAN_SECONDS = 15.0
MAX_CONTEXT_READ_BYTES = 4 * 1024
_IMAGE_SUFFIXES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
_SKIP_DIRS = {
    "node_modules", "vendor", "deps", "dependencies", "third_party", "third-party",
    "venv", "env", "site-packages", "__pycache__", ".git",
}
_KEYWORDS = re.compile(
    r"\b(audit|evidence|result|results|output|figure|plot|chart|metric|accuracy|"
    r"precision|recall|auc|benchmark|evaluation|experiment|analysis|validation|"
    r"finding|report|score|performance)\w*\b",
    re.IGNORECASE,
)
_LOW_VALUE = re.compile(r"\b(logo|icon|favicon|avatar|badge|thumbnail)\b", re.IGNORECASE)
_DATA_URI = re.compile(
    r"data:(image/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)", re.IGNORECASE
)
_TAG = re.compile(r"<[^>]+>")


def inventory(
    source: Path,
    destination: Path,
    max_candidates: int = 500,
    max_total_bytes: int = 80 * 1024 * 1024,
    *,
    max_read_bytes: int = DEFAULT_MAX_READ_BYTES,
    max_scan_seconds: float = DEFAULT_MAX_SCAN_SECONDS,
) -> dict[str, Any]:
    """Copy validated visual assets to *destination* and return their inventory.

    ``max_total_bytes`` applies to distinct saved asset bytes, so byte-identical
    candidates can retain each locator and context without consuming the budget
    repeatedly.  The returned order is stable across runs on unchanged input.
    """
    if max_candidates < 0 or max_total_bytes < 0 or max_read_bytes < 0 or max_scan_seconds < 0:
        raise ValueError("candidate, byte, and time limits must be non-negative")
    source_input = Path(source).absolute()
    if _has_symlink_component(source_input):
        raise ValueError("source must not contain a symlink")
    source = source_input.resolve()
    destination = Path(destination).resolve()
    if not source.is_dir():
        raise ValueError("source must be an existing directory")
    if source == destination:
        raise ValueError("destination must differ from source")

    assets_dir = destination / "assets"
    if assets_dir.is_symlink():
        raise ValueError("destination assets directory must not be a symlink")
    assets_dir.mkdir(parents=True, exist_ok=True)

    candidates: list[dict[str, Any]] = []
    seen_assets: set[str] = set()
    total_bytes = 0
    scanned_files = 0
    truncated = False
    skipped: dict[str, int] = {}
    skipped_formats: dict[str, int] = {}
    budget = _ScanBudget(max_read_bytes, max_scan_seconds)
    source_files = _iter_source_files(source, destination, skipped)

    for path in source_files:
        if budget.expired:
            truncated = True
            _increment(skipped, "scan_deadline")
            break
        if scanned_files >= MAX_FILES:
            truncated = True
            _increment(skipped, "file_limit")
            break
        scanned_files += 1
        try:
            size = path.stat().st_size
        except OSError:
            _increment(skipped, "unreadable")
            continue
        if size > MAX_INPUT_FILE_BYTES:
            _increment(skipped, "input_file_too_large")
            continue

        suffix = path.suffix.lower()
        relative = path.relative_to(source).as_posix()
        if suffix in _IMAGE_SUFFIXES:
            data = _read_input(path, size, budget, skipped)
            if data is None:
                if budget.exhausted:
                    truncated = True
                    break
                continue
            item = _make_item(
                data=data,
                mime=_IMAGE_SUFFIXES[suffix],
                source_path=relative,
                locator=relative,
                context=_file_context(path, source, budget, skipped),
                family=_family(relative),
            )
            if not item:
                _increment(skipped, "invalid_image")
                continue
            total_bytes, added, stopped = _accept(
                item, candidates, seen_assets, total_bytes, max_candidates, max_total_bytes, assets_dir
            )
            if stopped:
                truncated = True
                break
            if added:
                continue
        elif suffix == ".ipynb":
            data = _read_input(path, size, budget, skipped)
            if data is None:
                if budget.exhausted:
                    truncated = True
                    break
                continue
            try:
                notebook = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                _increment(skipped, "malformed_notebook")
                continue
            for item in _notebook_items(notebook, relative):
                if budget.expired:
                    truncated = True
                    _increment(skipped, "scan_deadline")
                    break
                total_bytes, _, stopped = _accept(
                    item, candidates, seen_assets, total_bytes, max_candidates, max_total_bytes, assets_dir
                )
                if stopped:
                    truncated = True
                    break
            if truncated:
                break
        elif suffix in {".html", ".htm"}:
            data = _read_input(path, size, budget, skipped)
            if data is None:
                if budget.exhausted:
                    truncated = True
                    break
                continue
            try:
                html = data.decode("utf-8")
            except UnicodeDecodeError:
                _increment(skipped, "malformed_html")
                continue
            for item in _html_items(html, relative):
                if budget.expired:
                    truncated = True
                    _increment(skipped, "scan_deadline")
                    break
                total_bytes, _, stopped = _accept(
                    item, candidates, seen_assets, total_bytes, max_candidates, max_total_bytes, assets_dir
                )
                if stopped:
                    truncated = True
                    break
            if truncated:
                break
        else:
            _increment(skipped_formats, suffix or "[no extension]")

    return {
        "candidates": candidates,
        "truncated": truncated,
        "limits": {
            "max_candidates": max_candidates,
            "max_total_bytes": max_total_bytes,
            "max_files": MAX_FILES,
            "max_input_file_bytes": MAX_INPUT_FILE_BYTES,
            "max_image_bytes": MAX_IMAGE_BYTES,
            "max_pixels": MAX_PIXELS,
            "max_read_bytes": max_read_bytes,
            "max_scan_seconds": max_scan_seconds,
        },
        "scanned_files": scanned_files,
        "total_asset_bytes": total_bytes,
        "input_bytes_read": budget.read_bytes,
        "skipped": dict(sorted(skipped.items())),
        "skipped_formats": dict(sorted(skipped_formats.items())),
    }


def shortlist(candidates: Iterable[dict[str, Any]], limit: int = 12) -> list[dict[str, Any]]:
    """Return a deterministic, bounded selection that favors source diversity."""
    if limit < 0:
        raise ValueError("limit must be non-negative")
    remaining = sorted(
        (dict(item) for item in candidates),
        key=lambda item: (-int(item.get("score", 0)), str(item.get("id", ""))),
    )
    selected: list[dict[str, Any]] = []
    sources: set[str] = set()
    families: set[str] = set()
    assets: set[str] = set()
    while remaining and len(selected) < limit:
        def priority(item: dict[str, Any]) -> tuple[int, int, str]:
            diversity = 18 * (item.get("source_path") not in sources)
            diversity += 7 * (item.get("family") not in families)
            return (int(item.get("score", 0)) + diversity, int(item.get("score", 0)), str(item.get("id", "")))

        # Reverse score order, with id ascending as a stable final tie-breaker.
        best = min(remaining, key=lambda item: (-priority(item)[0], -priority(item)[1], priority(item)[2]))
        remaining.remove(best)
        asset_key = str(best.get("asset_sha256") or best.get("id", ""))
        if asset_key in assets:
            continue
        selected.append(best)
        sources.add(str(best.get("source_path", "")))
        families.add(str(best.get("family", "")))
        assets.add(asset_key)
    return selected


def _iter_source_files(source: Path, destination: Path, skipped: dict[str, int]) -> Iterable[Path]:
    """Yield regular, non-hidden files without following symlinks or dependencies."""
    destination_inside_source = _is_relative_to(destination, source)
    for root, directories, files in os.walk(source, topdown=True, followlinks=False):
        root_path = Path(root)
        original_directories = list(directories)
        directories[:] = sorted(
            directory
            for directory in directories
            if not directory.startswith(".")
            and directory not in _SKIP_DIRS
            and not (destination_inside_source and (root_path / directory).resolve() == destination)
            and not (root_path / directory).is_symlink()
        )
        for directory in original_directories:
            if directory.startswith(".") or directory in _SKIP_DIRS:
                _increment(skipped, "hidden_or_dependency_directory")
            elif (root_path / directory).is_symlink():
                _increment(skipped, "symlink")
        for filename in sorted(files):
            if filename.startswith("."):
                _increment(skipped, "hidden_file")
                continue
            path = root_path / filename
            try:
                if path.is_symlink():
                    _increment(skipped, "symlink")
                    continue
                if not path.is_file():
                    continue
                path.resolve().relative_to(source)
            except (OSError, ValueError):
                _increment(skipped, "outside_source")
                continue
            yield path


def _notebook_items(notebook: Any, source_path: str) -> Iterable[dict[str, Any]]:
    if not isinstance(notebook, dict) or not isinstance(notebook.get("cells"), list):
        return []
    cells = notebook["cells"]
    items: list[dict[str, Any]] = []
    for cell_index, cell in enumerate(cells):
        if not isinstance(cell, dict) or not isinstance(cell.get("outputs"), list):
            continue
        context = _notebook_context(cells, cell_index)
        for output_index, output in enumerate(cell["outputs"]):
            if not isinstance(output, dict) or not isinstance(output.get("data"), dict):
                continue
            for mime in ("image/png", "image/jpeg"):
                encoded = output["data"].get(mime)
                data = _decode_base64(encoded)
                if data is None:
                    continue
                locator = f"{source_path}#cell={cell_index}/output={output_index}/mime={mime}"
                items.append(
                    _make_item(data, mime, source_path, locator, context, _family(source_path))
                )
    return items


def _html_items(html: str, source_path: str) -> Iterable[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, match in enumerate(_DATA_URI.finditer(html)):
        mime = match.group(1).lower()
        data = _decode_base64(match.group(2))
        if data is None:
            continue
        before = max(0, match.start() - 1250)
        after = min(len(html), match.end() + 1250)
        context = _clean_context(html[before:after])
        locator = f"{source_path}#data-uri={index}/mime={mime}"
        items.append(_make_item(data, mime, source_path, locator, context, _family(source_path)))
    return items


def _make_item(data: bytes, mime: str, source_path: str, locator: str, context: str, family: str) -> dict[str, Any]:
    info = _image_info(data, mime)
    if info is None:
        return {}
    width, height = info
    digest = hashlib.sha256(data).hexdigest()
    candidate_id = hashlib.sha256(locator.encode("utf-8")).hexdigest()[:24]
    return {
        "id": candidate_id,
        "asset_sha256": digest,
        "asset_file": f"assets/{digest}.{'png' if mime == 'image/png' else 'jpg'}",
        "mime": mime,
        "source_path": source_path,
        "locator": locator,
        "context": context[:2500],
        "width": width,
        "height": height,
        "family": family,
        "score": _score(source_path, locator, context, family),
        "_data": data,
    }


def _accept(
    item: dict[str, Any], candidates: list[dict[str, Any]], seen_assets: set[str], total_bytes: int,
    max_candidates: int, max_total_bytes: int, assets_dir: Path,
) -> tuple[int, bool, bool]:
    """Return (total_bytes, added, terminal_limit_reached)."""
    if not item:
        return total_bytes, False, False
    if len(candidates) >= max_candidates:
        return total_bytes, False, True
    digest = item["asset_sha256"]
    data = item.pop("_data")
    new_asset = digest not in seen_assets
    if new_asset and total_bytes + len(data) > max_total_bytes:
        return total_bytes, False, True
    if new_asset:
        _save_asset(assets_dir / Path(item["asset_file"]).name, data)
        seen_assets.add(digest)
        total_bytes += len(data)
    candidates.append(item)
    return total_bytes, True, False


def _save_asset(path: Path, data: bytes) -> None:
    if path.is_symlink():
        raise ValueError("destination asset must not be a symlink")
    if path.exists():
        # The content-addressed filename makes an existing matching asset safe to reuse.
        if path.read_bytes() == data:
            return
    path.write_bytes(data)


def _image_info(data: bytes, mime: str) -> tuple[int, int] | None:
    if not data or len(data) > MAX_IMAGE_BYTES:
        return None
    if mime == "image/png":
        if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
            return None
        width, height = struct.unpack(">II", data[16:24])
    elif mime == "image/jpeg":
        dimensions = _jpeg_dimensions(data)
        if dimensions is None:
            return None
        width, height = dimensions
    else:
        return None
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        return None
    return width, height


def _jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    offset = 2
    while offset + 9 <= len(data):
        if data[offset] != 0xFF:
            return None
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            return None
        marker = data[offset]
        offset += 1
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            return None
        length = struct.unpack(">H", data[offset:offset + 2])[0]
        if length < 2 or offset + length > len(data):
            return None
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            if length < 7:
                return None
            height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
            return width, height
        offset += length
    return None


def _decode_base64(value: Any) -> bytes | None:
    if isinstance(value, list):
        value = "".join(str(part) for part in value)
    if not isinstance(value, str):
        return None
    try:
        return base64.b64decode(re.sub(r"\s+", "", value), validate=True)
    except (binascii.Error, ValueError):
        return None


def _file_context(path: Path, source: Path, budget: "_ScanBudget", skipped: dict[str, int]) -> str:
    """Read a small, local reference window without searching the whole tree."""
    candidates = [
        path.with_suffix(".md"), path.with_suffix(".py"), path.with_suffix(".r"),
        path.with_suffix(".R"), path.with_suffix(".js"), path.parent / "README.md",
        source / "README.md",
    ]
    parts: list[str] = []
    seen: set[Path] = set()
    image_name = path.name
    image_stem = path.stem
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            if candidate.is_file() and not candidate.is_symlink() and candidate.stat().st_size <= MAX_INPUT_FILE_BYTES:
                size = min(candidate.stat().st_size, MAX_CONTEXT_READ_BYTES)
                if not budget.reserve(size):
                    _increment(skipped, "read_budget")
                    break
                with candidate.open("rb") as stream:
                    text = stream.read(size).decode("utf-8", errors="replace")
                reference = text.lower().find(image_name.lower())
                if reference < 0:
                    reference = text.lower().find(image_stem.lower())
                if reference >= 0:
                    parts.append(text[max(0, reference - 600):reference + 1200])
                elif candidate.name.lower().startswith("readme") or candidate == path.with_suffix(".md"):
                    parts.append(text[:1200])
        except OSError:
            continue
    return _clean_context("\n".join(parts))


class _ScanBudget:
    def __init__(self, max_read_bytes: int, max_scan_seconds: float) -> None:
        self.max_read_bytes = max_read_bytes
        self.deadline = time.monotonic() + max_scan_seconds
        self.read_bytes = 0

    @property
    def expired(self) -> bool:
        return time.monotonic() > self.deadline

    @property
    def exhausted(self) -> bool:
        return self.read_bytes >= self.max_read_bytes

    def reserve(self, size: int) -> bool:
        if self.expired or size < 0 or self.read_bytes + size > self.max_read_bytes:
            return False
        self.read_bytes += size
        return True


def _read_input(path: Path, size: int, budget: _ScanBudget, skipped: dict[str, int]) -> bytes | None:
    if not budget.reserve(size):
        _increment(skipped, "scan_deadline" if budget.expired else "read_budget")
        return None
    try:
        data = path.read_bytes()
    except OSError:
        budget.read_bytes -= size
        _increment(skipped, "unreadable")
        return None
    # A changing file can grow after stat(). Keep accounting truthful and do not
    # process data that would have exceeded the cumulative input budget.
    if len(data) != size:
        budget.read_bytes += len(data) - size
    if len(data) > size:
        _increment(skipped, "changed_while_reading")
        return None
    return data


def _increment(values: dict[str, int], key: str) -> None:
    values[key] = values.get(key, 0) + 1


def _has_symlink_component(path: Path) -> bool:
    current = Path(path.anchor)
    for component in path.parts[1:]:
        current /= component
        if current.is_symlink():
            return True
    return False


def _notebook_context(cells: list[Any], index: int) -> str:
    parts: list[str] = []
    for nearby in cells[max(0, index - 1): min(len(cells), index + 2)]:
        if isinstance(nearby, dict) and nearby.get("cell_type") in {"markdown", "code"}:
            value = nearby.get("source", "")
            parts.append("".join(value) if isinstance(value, list) else str(value))
    return _clean_context("\n".join(parts))


def _clean_context(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(_TAG.sub(" ", value))).strip()[:2500]


def _family(source_path: str) -> str:
    parent = Path(source_path).parent.as_posix()
    return parent if parent != "." else "root"


def _score(source_path: str, locator: str, context: str, family: str) -> int:
    text = " ".join((source_path, locator, family, context))
    keyword_hits = len(_KEYWORDS.findall(text))
    result_directory = any(part.lower() in {"result", "results", "output", "outputs", "figure", "figures", "report", "reports", "analysis"} for part in Path(source_path).parts)
    score = min(keyword_hits, 20) * 4
    if result_directory:
        score += 20
    if _LOW_VALUE.search(text):
        score -= 8
    return int(score)


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False
