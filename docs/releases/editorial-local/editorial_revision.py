"""Opt-in, hash-bound final presentation revision. Never changes canonical data."""
import copy
import hashlib
import json
from pathlib import Path


def load_revision(library, audit_id):
    activation = library.outputs / 'Primitive_Product_UX' / 'editorial_revision.json'
    if not activation.is_file():
        return None
    config = json.loads(activation.read_text())
    if config.get('qualified') is not True:
        return None
    item = config.get('audits', {}).get(audit_id)
    if not item:
        return None
    def read(relative, expected=None):
        path = library._safe_file(library.workspace / relative, library.outputs)
        data = path.read_bytes()
        if expected and hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('Editorial revision checksum differs')
        return json.loads(data)
    content = read(item['content'], item['content_sha256'])
    inputs = read(item['inputs'], item['inputs_sha256'])
    binding = library._binding(audit_id)
    root = (Path(binding['output_root']) / 'projects' / binding['project_id']
            if binding['kind'] == 'runtime' else library._project_root(audit_id))
    if Path(inputs['canonical_root']) != root:
        raise ValueError('Editorial revision canonical binding differs')
    if content['project_id'] != (binding['project_id'] if binding['kind']=='runtime' else library._fresh_project_id(audit_id) or audit_id):
        raise ValueError('Editorial revision project identity differs')
    hashes = inputs.get('source_sha256', {})
    if str(root / 'S1_S6_Q1_Q2_Aggregate_Report.md') not in hashes:
        raise ValueError('Editorial revision lacks report binding')
    for name, expected in hashes.items():
        path = library._safe_file(Path(name), root)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Editorial revision source changed')
    return content


def title_from(content):
    component = next((c for c in content.get('components', []) if c['field']=='S1.display_title'), {})
    entries = component.get('entries', [])
    if entries and not entries[0].get('display_unavailable') and entries[0].get('decision') != 'FALLBACK':
        return entries[0]['content'].get('text')
    return None


def apply_revision(library, payload):
    if not payload.get('available'):
        return payload
    try:
        revision = load_revision(library, payload['id'])
    except (OSError, ValueError, KeyError, TypeError):
        return {**payload, 'editorial_revision_status':'VALIDATION_FAILED_USING_PRESERVED'}
    if not revision:
        return payload
    # Source records / metrics / outcomes stay from the verified legacy adapter.
    revised = copy.deepcopy(payload)
    original = {c['field']:c for c in payload['components']}
    for component in revision['components']:
        original_entries = {e['pointer']:e for e in original.get(component['field'],{}).get('entries',[])}
        for entry in component.get('entries',[]):
            if entry['pointer'] in original_entries:
                entry['canonical_text'] = original_entries[entry['pointer']].get('canonical_text')
            elif component['stage']=='Q1':
                key = component['field'].split('.')[1]
                entry['canonical_text'] = payload['passthrough']['Q1']['content']['profile'][key]['statement']
            entry.setdefault('effective_source', 'CANONICAL' if entry['decision']=='FALLBACK' else 'C1')
    revised.update(components=revision['components'], editorial_qualified=True,
                   editorial_mode='PRESERVED',editorial_revision=revision['content_contract_version'])
    title = title_from(revision)
    if title:
        revised.update(title=title, display_title=title)
    return revised
