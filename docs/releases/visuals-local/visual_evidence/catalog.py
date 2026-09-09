"""A source-image inventory, independent of contextual interpretation or LLM selection."""
import copy
import json
import re
from collections import Counter
from pathlib import Path, PurePosixPath

from .service import HEX, digest

MAX_ASSET_BYTES = 4 * 1024 * 1024
DECORATIVE = re.compile(r'(?:^|[^a-z])(logo|icon|favicon|avatar|badge)(?:[^a-z]|$)', re.I)

def natural_key(value):
    return tuple((1, int(part)) if part.isdigit() else (0, part.casefold()) for part in re.split(r'(\d+)', value))


def attach_catalog(manifest, inventory, folder):
    """Retain every eligible distinct image, with literal source locators and no claims.

    Contextual items remain unchanged. Exact duplicate bytes share one gallery entry;
    every discovered locator remains available. Scan/storage limits remain explicit.
    """
    result = copy.deepcopy(manifest)
    folder = Path(folder).resolve()
    contextual = {im['asset_sha256'] for item in result['items'] for im in item.get('images', [])}
    groups = {}
    excluded = Counter()
    for candidate in inventory['candidates']:
        sha = candidate.get('asset_sha256', '')
        if not HEX.fullmatch(sha):
            raise ValueError('Invalid catalog digest')
        path = PurePosixPath(candidate['source_path'])
        if path.is_absolute() or '..' in path.parts:
            raise ValueError('Catalog requires relative source paths')
        group = groups.setdefault(sha, {'candidate': candidate, 'sources': []})
        locator = {'path': str(path), 'locator': candidate['locator']}
        if locator not in group['sources']:
            group['sources'].append(locator)
        # A real image file is easier to identify than an embedded duplicate.
        if candidate['locator'] == candidate['source_path']:
            group['candidate'] = candidate
    additional = []
    for item in result['items']:
        for image in item.get('images', []):
            for locator in groups.get(image['asset_sha256'], {}).get('sources', []):
                if locator not in item.setdefault('sources', []):
                    item['sources'].append(locator)
    for sha, group in sorted(groups.items(), key=lambda pair: (
            pair[1]['candidate']['locator'] != pair[1]['candidate']['source_path'],
            natural_key(pair[1]['candidate']['source_path']), natural_key(pair[1]['candidate']['locator']))):
        if sha in contextual:
            continue
        c = group['candidate']
        name = PurePosixPath(c['source_path']).name
        if c['locator'] == c['source_path'] and DECORATIVE.search(PurePosixPath(name).stem):
            excluded['decorative_filename'] += 1
            continue
        blob_path = folder / c['asset_file']
        if blob_path.is_symlink() or not blob_path.resolve().is_relative_to(folder):
            raise ValueError('Catalog asset outside inventory')
        if blob_path.stat().st_size > MAX_ASSET_BYTES:
            excluded['image_size_limit'] += 1
            continue
        blob = blob_path.read_bytes()
        if digest(blob) != sha:
            raise ValueError('Catalog asset changed')
        mime = c['mime']
        if not ((mime == 'image/png' and blob.startswith(b'\x89PNG\r\n\x1a\n')) or
                (mime == 'image/jpeg' and blob.startswith(b'\xff\xd8\xff'))):
            raise ValueError('Unsupported catalog asset')
        title = name
        match = re.search(r'#cell=(\d+)/output=(\d+)', c['locator'])
        if match:
            title += f" · Cell {int(match[1]) + 1}, output {int(match[2]) + 1}"
        elif c['locator'] != c['source_path']:
            title += ' · Saved image'
        additional.append({'id': 'source-' + sha, 'kind': 'source_image', 'title': title,
                           'sources': group['sources'],
                           'images': [{'asset_sha256': sha, 'alt': title}]})
        result['assets'][sha] = {'file': c['asset_file'], 'mime': mime}
    result['additional_images'] = additional
    result['catalog_coverage'] = {
        'unique_images_found': len(groups), 'additional_images': len(additional),
        'contextual_images': len(contextual), 'scan_truncated': inventory['truncated'],
        'excluded': dict(excluded), 'scan_skipped': inventory.get('skipped', {}),
        'supported_formats': ['PNG', 'JPEG', 'saved notebook raster outputs', 'embedded HTML raster images'],
    }
    result['status'] = 'PARTIAL' if result['items'] or additional else 'NOT_AVAILABLE'
    return result


def refresh(library, aid, destination):
    """Build a new immutable supplement around an already reviewed contextual selection."""
    from .inventory import inventory
    from .service import _load, source_root, fingerprint, VERSION
    destination = Path(destination)
    if destination.exists():
        raise ValueError('Choose a new catalog destination')
    payload = library.audit(aid)
    if not payload.get('available'):
        raise ValueError('Audit unavailable')
    loaded = _load(library, aid, payload)
    if loaded:
        original, old_folder = loaded
    else:
        original = {'version': VERSION, 'audit_id': aid, 'review_status': 'REVIEWED',
                    'canonical_fingerprint': fingerprint(payload), 'items': [], 'assets': {}}
        old_folder = None
    source = source_root(library, aid)
    inv = inventory(source, destination)
    # Copy the reviewed assets first; the inventory can add source-only images.
    for sha, info in original['assets'].items():
        path = old_folder / info['file']
        if path.is_symlink() or not path.resolve().is_relative_to(old_folder.resolve()):
            raise ValueError('Invalid previous asset path')
        blob = path.read_bytes()
        if digest(blob) != sha:
            raise ValueError('Reviewed asset changed')
        target = destination / info['file']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)
    result = attach_catalog(original, inv, destination)
    result['catalog_source'] = 'saved_project_snapshot'
    (destination / 'inventory.json').write_text(json.dumps(inv, ensure_ascii=False, indent=2))
    path = destination / 'manifest.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return path


if __name__ == '__main__':
    import argparse
    import threading
    from .service import VERSION
    from apps.primitive_probe.product import ProductLibrary
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    workspace = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    if output.exists() or not output.is_relative_to(workspace / 'outputs'):
        parser.error('Choose a new directory inside outputs')
    runtime = type('ReadOnlyRuntime', (), {'workspace': workspace, 'current': None, 'lock': threading.RLock()})()
    library = ProductLibrary(runtime)
    config = {'version': VERSION, 'audits': {}}
    summary = []
    for row in library.list():
        if not row.get('available'):
            continue
        aid = row['id']
        path = refresh(library, aid, output / aid)
        config['audits'][aid] = {'reviewed': True, 'manifest': str(path.relative_to(workspace)), 'sha256': digest(path.read_bytes())}
        data = json.loads(path.read_text())
        summary.append({'audit_id': aid, 'contextual_items': len(data['items']), **data['catalog_coverage']})
        print(json.dumps(summary[-1]), flush=True)
    (output / 'activation.json').write_text(json.dumps(config, indent=2))
    (output / 'summary.json').write_text(json.dumps(summary, indent=2))
