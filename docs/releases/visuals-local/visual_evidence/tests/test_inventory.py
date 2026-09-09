from __future__ import annotations

import base64
import hashlib
import importlib
import json
import os
import struct
from pathlib import Path

from apps.visual_evidence.inventory import inventory, shortlist


def png(width: int = 1, height: int = 1, tail: bytes = b"") -> bytes:
    # The inventory validates the PNG signature and IHDR dimensions; arbitrary
    # tail bytes make intentionally distinct, compact fixtures.
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", width, height) + b"\x08\x02\x00\x00\x00" + tail


def write_png(root: Path, relative: str, data: bytes | None = None) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data or png())
    return path


def test_malformed_data_and_limits_are_skipped(tmp_path: Path) -> None:
    source, destination = tmp_path / "source", tmp_path / "out"
    source.mkdir()
    write_png(source, "broken.png", b"not an image")
    write_png(source, "huge.png", png(5000, 5000))
    html = '<img src="data:image/png;base64,this-is-not-base64">'
    (source / "saved.html").write_text(html)

    result = inventory(source, destination)

    assert result["candidates"] == []
    assert list((destination / "assets").iterdir()) == []


def test_symlinks_and_hidden_or_dependency_directories_are_not_read(tmp_path: Path) -> None:
    source, destination, outside = tmp_path / "source", tmp_path / "out", tmp_path / "outside"
    source.mkdir()
    outside.mkdir()
    write_png(outside, "escaped.png")
    write_png(source, ".hidden/no.png")
    write_png(source, "node_modules/no.png")
    write_png(source, "kept.png")
    os.symlink(outside / "escaped.png", source / "linked.png")
    os.symlink(outside, source / "linked-dir")

    result = inventory(source, destination)

    assert [item["source_path"] for item in result["candidates"]] == ["kept.png"]


def test_candidate_and_distinct_asset_budgets_set_truncated(tmp_path: Path) -> None:
    source, destination = tmp_path / "source", tmp_path / "out"
    source.mkdir()
    first, second = png(tail=b"a"), png(tail=b"b")
    write_png(source, "a.png", first)
    write_png(source, "b.png", second)

    byte_limited = inventory(source, destination, max_total_bytes=len(first))
    candidate_limited = inventory(source, tmp_path / "out-2", max_candidates=1)

    assert len(byte_limited["candidates"]) == 1
    assert byte_limited["truncated"] is True
    assert len(candidate_limited["candidates"]) == 1
    assert candidate_limited["truncated"] is True


def test_cumulative_read_budget_and_deadline_are_reported(tmp_path: Path, monkeypatch) -> None:
    source, destination = tmp_path / "source", tmp_path / "out"
    source.mkdir()
    first, second = png(tail=b"a"), png(tail=b"b")
    write_png(source, "a.png", first)
    write_png(source, "b.png", second)

    read_limited = inventory(source, destination, max_read_bytes=len(first))
    assert read_limited["input_bytes_read"] == len(first)
    assert read_limited["truncated"] is True
    assert read_limited["skipped"]["read_budget"] == 1

    inventory_module = importlib.import_module("apps.visual_evidence.inventory")

    moments = iter((0.0, 16.0))
    monkeypatch.setattr(inventory_module.time, "monotonic", lambda: next(moments, 16.0))
    timed_out = inventory(source, tmp_path / "out-time", max_scan_seconds=15.0)
    assert timed_out["truncated"] is True
    assert timed_out["input_bytes_read"] == 0
    assert timed_out["skipped"]["scan_deadline"] == 1


def test_notebook_context_and_saved_bytes_are_inventoryed(tmp_path: Path) -> None:
    source, destination = tmp_path / "source", tmp_path / "out"
    source.mkdir()
    data = png(tail=b"notebook")
    notebook = {
        "cells": [
            {"cell_type": "markdown", "source": ["# Evaluation findings\n", "Audit evidence"]},
            {"cell_type": "code", "source": "plot(metric)", "outputs": [{"data": {"image/png": base64.b64encode(data).decode()}}]},
        ]
    }
    (source / "report.ipynb").write_text(json.dumps(notebook))

    item = inventory(source, destination)["candidates"][0]

    assert item["mime"] == "image/png"
    assert item["locator"] == "report.ipynb#cell=1/output=0/mime=image/png"
    assert "Evaluation findings" in item["context"]
    assert (destination / item["asset_file"]).read_bytes() == data


def test_saved_html_data_uri_is_read_without_execution(tmp_path: Path) -> None:
    source, destination = tmp_path / "source", tmp_path / "out"
    source.mkdir()
    data = png(tail=b"saved-html")
    encoded = base64.b64encode(data).decode()
    (source / "results.html").write_text(
        f"<h1>Benchmark results</h1><img src='data:image/png;base64,{encoded}'>"
    )

    item = inventory(source, destination)["candidates"][0]

    assert item["locator"] == "results.html#data-uri=0/mime=image/png"
    assert item["width"] == 1 and item["height"] == 1
    assert "Benchmark results" in item["context"]


def test_ids_are_stable_and_duplicate_bytes_keep_separate_contexts(tmp_path: Path) -> None:
    source, destination = tmp_path / "source", tmp_path / "out"
    source.mkdir()
    data = png(tail=b"same")
    write_png(source, "results/one.png", data)
    write_png(source, "reports/two.png", data)
    (source / "results/README.md").write_text("First audit chart")
    (source / "reports/README.md").write_text("Second result figure")

    first = inventory(source, destination)
    second = inventory(source, destination)
    candidates = first["candidates"]

    assert [item["id"] for item in candidates] == [item["id"] for item in second["candidates"]]
    assert candidates[0]["id"] == hashlib.sha256(
        b"reports/two.png"
    ).hexdigest()[:24]
    assert len({item["id"] for item in candidates}) == 2
    assert len({item["asset_sha256"] for item in candidates}) == 1
    assert len(list((destination / "assets").iterdir())) == 1
    assert {item["context"] for item in candidates} == {"First audit chart", "Second result figure"}
    assert len(shortlist(candidates)) == 1


def test_shortlist_is_bounded_and_diversifies_sources_and_families() -> None:
    candidates = [
        {"id": "a", "score": 10, "source_path": "x/a.png", "family": "x"},
        {"id": "b", "score": 10, "source_path": "x/b.png", "family": "x"},
        {"id": "c", "score": 8, "source_path": "y/c.png", "family": "y"},
    ]
    selected = shortlist(candidates, limit=2)
    assert [item["id"] for item in selected] == ["a", "c"]
