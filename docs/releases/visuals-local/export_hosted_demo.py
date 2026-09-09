"""Export only the preserved product views to an encrypted hosted-demo bundle.

Run locally. This has no provider/runtime imports and never reads R10/R20 data.
The Node encryptor receives plaintext via stdin, never via a repository file.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import threading

WORKSPACE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WORKSPACE))
from apps.primitive_probe.product import ProductLibrary, FINAL_IDS, NO_CONTENT, STAGES


def references(value, stage=None):
    if isinstance(value, list):
        for item in value:
            yield from references(item, stage)
    elif isinstance(value, dict):
        stage = value.get('stage', stage)
        evidence_id = value.get('evidence_id')
        if stage in STAGES and isinstance(evidence_id, str) and re.fullmatch(r'E[0-9]{4,}', evidence_id):
            yield stage, evidence_id
        for key, item in value.items():
            yield from references(item, key if key in STAGES else stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', type=Path, required=True)
    parser.add_argument('--key-file', type=Path, required=True)
    args = parser.parse_args()
    checkout = args.checkout.resolve()
    encryptor = checkout / 'demo-v2/scripts/encrypt.mjs'
    if not encryptor.is_file() or not args.key_file.is_file():
        parser.error('Provide the deployment checkout and an existing private encryption key')
    runtime = type('ReadOnlyRuntime', (), {'workspace': WORKSPACE, 'current': None,
                                          'lock': threading.RLock()})()
    library = ProductLibrary(runtime)
    catalogue = [{**entry, 'hidden': False, 'removable': False} for entry in library.list()]
    ids = [entry['id'] for entry in catalogue]
    files = {}
    counts = {'audits': 0, 'unavailable_entries': 0, 'evidence_records': 0, 'unavailable_references': 0, 'visual_items': 0, 'additional_images': 0, 'visual_assets': 0}
    reports = {}

    def add(name, value):
        data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
        # Refuse recognizable credentials rather than silently modifying evidence.
        forbidden = rb'(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)'
        if re.search(forbidden, data):
            raise ValueError('Potential credential in export: ' + name)
        files[name] = base64.b64encode(data).decode()

    add('library.json', catalogue)
    for aid in ids:
        # NO_CONTENT returns only in-code publication metadata, never its directories.
        view = library.audit(aid)
        # Only hash-bound, explicitly reviewed supplements can reach this export.
        from apps.visual_evidence.service import asset as reviewed_asset
        from urllib.parse import urlparse, parse_qs
        visual_assets = {}
        supplement = view.get('visual_evidence', {})
        counts['visual_items'] += len(supplement.get('items', []))
        counts['additional_images'] += len(supplement.get('additional_images', []))
        for item in supplement.get('items', []) + supplement.get('additional_images', []):
            for image in item.get('images', []):
                url = urlparse(image['url']); params = parse_qs(url.query)
                if url.path != '/api/visual-asset' or params.get('audit') != [aid] or len(params.get('asset', [])) != 1:
                    raise ValueError('Invalid reviewed visual URL')
                sha = params['asset'][0]
                blob, mime = reviewed_asset(library, aid, sha)
                if len(blob) > 4 * 1024 * 1024:
                    raise ValueError('Reviewed image exceeds hosted response limit')
                name = 'visual-' + sha + ('.png' if mime == 'image/png' else '.jpg')
                if name not in files:
                    add(name, blob)
                    counts['visual_assets'] += 1
                visual_assets[sha] = {'name': name, 'mime': mime}
        if visual_assets:
            view['visual_assets'] = visual_assets
        add(aid + '.json', view)
        if aid in NO_CONTENT:
            counts['unavailable_entries'] += 1
            continue
        if view.get('available') is not True:
            raise ValueError('Expected preserved audit unavailable: ' + aid)
        report, digest = library.report(aid)
        if hashlib.sha256(report).hexdigest() != digest:
            raise ValueError('Canonical report digest mismatch: ' + aid)
        add(aid + '.canonical.md', report)
        reports[aid] = digest
        refs = set(references(view))
        # Retain the complete established evidence registry, including entries not
        # cited by a shortened editorial field. Export never traverses source repos.
        binding = library._binding(aid)
        pid = binding['project_id'] if binding['kind']=='runtime' else library._fresh_project_id(aid) or aid
        root = Path(binding['output_root'])/'projects'/pid if binding['kind']=='runtime' else library._project_root(aid)
        for stage in STAGES:
            path = root/'runs'/(stage+'__'+pid)/'evidence_registry.json'
            if not path.is_file(): continue
            registry = json.loads(library._safe_file(path, root).read_text())
            if isinstance(registry, list):
                refs.update((stage, entry['evidence_id']) for entry in registry
                            if isinstance(entry, dict) and isinstance(entry.get('evidence_id'), str)
                            and re.fullmatch(r'E[0-9]{4,}', entry['evidence_id']))
        records = {}
        for stage, eid in sorted(refs):
            try:
                record = library.evidence(aid, stage, eid)
            except (ValueError, OSError, KeyError, TypeError):
                # Mirror the local UI's unavailable-reference fallback, not an invented finding.
                counts['unavailable_references'] += 1
                continue
            records[stage + ':' + eid] = record
        add(aid + '.evidence.json', records)
        counts['audits'] += 1
        counts['evidence_records'] += len(records)
    result = subprocess.run(['node', str(encryptor), str(args.key_file.resolve()),
                             str(checkout / 'demo-v2/data')],
                            input=json.dumps(files).encode(), capture_output=True, check=True)
    print(result.stdout.decode().strip())
    print(json.dumps({**counts, 'canonical_sha256': reports}, indent=2))


if __name__ == '__main__':
    main()
