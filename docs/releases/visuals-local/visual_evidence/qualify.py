"""Materialize explicit, hash-bound editorial decisions without changing audit data."""
import argparse
import copy
import json
from pathlib import Path
from .service import VERSION, digest, read_json


def qualify(source, destination, review):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.exists():
        raise ValueError('Preserve previous qualification; choose a new directory')
    draft_path = source / 'manifest.json'
    draft = read_json(draft_path, source)
    if draft.get('review_status') != 'DRAFT' or draft.get('version') != VERSION:
        raise ValueError('Expected a pilot draft')
    if review.get('audit_id') != draft['audit_id'] or review.get('draft_sha256') != digest(draft_path.read_bytes()):
        raise ValueError('Review does not match this draft')
    decisions = review['decisions']
    by_id = {d['item_id']: d for d in decisions}
    if len(by_id) != len(decisions) or set(by_id) != {i['id'] for i in draft['items']}:
        raise ValueError('Every draft item needs exactly one decision')
    result = copy.deepcopy(draft)
    result['items'] = []
    for original in draft['items']:
        decision = by_id[original['id']]
        if type(decision.get('accept')) is not bool or not decision.get('reason', '').strip():
            raise ValueError('Explicit decision and reason required')
        if not decision['accept']:
            continue
        item = copy.deepcopy(original)
        if 'section' in decision:
            if decision['section'] not in ('overview', 'evidence', 'construction'):
                raise ValueError('Invalid reviewed placement')
            item['section'] = decision['section']
        result['items'].append(item)
    wanted = {im['asset_sha256'] for item in result['items'] for im in item.get('images', [])}
    blobs = {}
    for sha in wanted:
        info = draft['assets'][sha]
        path = source / info['file']
        if path.is_symlink() or not path.resolve().is_relative_to(source) or path.stat().st_size > 8 * 1024 * 1024:
            raise ValueError('Invalid draft asset')
        blob = path.read_bytes()
        if digest(blob) != sha:
            raise ValueError('Draft asset changed since review')
        if not ((info['mime'] == 'image/png' and blob.startswith(b'\x89PNG\r\n\x1a\n')) or
                (info['mime'] == 'image/jpeg' and blob.startswith(b'\xff\xd8\xff'))):
            raise ValueError('Unsupported reviewed asset')
        blobs[sha] = (blob, info['mime'])
    result['assets'] = {}
    result['review_status'] = 'REVIEWED'
    result['review'] = review
    # A curated supplement is a selection, never an exhaustive repository catalog.
    result['status'] = 'PARTIAL' if result['items'] else 'NOT_AVAILABLE'
    destination.mkdir(parents=True)
    (destination / 'assets').mkdir()
    for sha, (blob, mime) in blobs.items():
        filename = 'assets/' + sha + ('.png' if mime == 'image/png' else '.jpg')
        (destination / filename).write_bytes(blob)
        result['assets'][sha] = {'file': filename, 'mime': mime}
    path = destination / 'manifest.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return path


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--destination', required=True, type=Path)
    parser.add_argument('--review', required=True, type=Path)
    args = parser.parse_args()
    qualify(args.source, args.destination, json.loads(args.review.read_text()))
