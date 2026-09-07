"""Final-copy editing and faithful reuse of the existing final presentation."""
import copy
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from .prompts import CONTRACT, PROFILES, VERSION, BY_ID

WORKSPACE = Path(__file__).resolve().parents[2]
RECORDS = {'S1': 'purpose_record', 'S2': 'evidence_record', 'S3': 'construction_record', 'S4': 'learning_record'}
RENDERERS = {
 'S1': 'sandboxes/S1_Purpose/purpose_analyst/rendering.py',
 'S2': 'sandboxes/S2_Evidence/evidence_analyst/rendering.py',
 'S3': 'sandboxes/S3_Construction/construction_analyst/rendering.py',
 'S4': 'sandboxes/S4_Learning/learning_analyst/rendering.py',
}
NUMBER = re.compile(r'(?<![\w])[-+−]?\d+(?:[.,]\d+)*(?:%?)')
def response_schema(shape='text', keep_allowed=True):
    string = {'type': 'string'}
    array = {'type': 'array', 'items': string}
    props = {'decision': {'type': 'string', 'enum': ['KEEP', 'REWRITE', 'FALLBACK'] if keep_allowed else ['REWRITE', 'FALLBACK']}}
    if shape == 'items':
        props['items'] = array
    elif shape == 'flow':
        props['flows'] = {'type': 'array', 'items': {'type': 'object', 'properties': {'label': string, 'nodes': array}, 'required': ['label', 'nodes'], 'additionalProperties': False}}
        props['notes'] = array
    else:
        props['text'] = string
    return {'type': 'object', 'properties': props, 'required': list(props), 'additionalProperties': False}


def empty_answer(field, decision='KEEP'):
    shape = field.get('shape', 'text')
    return {'decision': decision, **({'items': []} if shape == 'items' else {'flows': [], 'notes': []} if shape == 'flow' else {'text': ''})}


def content_text(content):
    if 'text' in content:
        return content['text']
    if 'items' in content:
        return '\n'.join('- ' + t for t in content['items'])
    flows = [(f['label'] + ': ' if f['label'] else '') + ' → '.join(f['nodes']) for f in content['flows']]
    return '\n\n'.join(flows + content['notes'])


def original_content(field):
    text = field['canonical_text']
    return {'items': [text]} if field.get('shape') == 'items' else {'flows': [], 'notes': [text]} if field.get('shape') == 'flow' else {'text': text}


def number_values(text):
    # Repeating a number across flow branches is legitimate; inventing or losing
    # a numeric value is not. This is not a check of number-to-object relations.
    return {n.replace(',', '').replace('−', '-') for n in NUMBER.findall(text)}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def locate(value, parts, pointer=''):
    if not parts:
        yield pointer, value
    elif parts[0] == '*':
        if isinstance(value, list):
            for i, item in enumerate(value):
                yield from locate(item, parts[1:], pointer + '/' + str(i))
    elif isinstance(value, dict) and parts[0] in value:
        yield from locate(value[parts[0]], parts[1:], pointer + '/' + parts[0])


def parent_at(record, pointer):
    node = record
    parts = pointer.strip('/').split('/')
    for key in parts[:-1]:
        node = node[int(key)] if isinstance(node, list) else node[key]
    return node, parts[-1]


def fields(stage, record):
    for profile in PROFILES:
        if profile.stage != stage:
            continue
        for pointer, text in locate(record, profile.path.split('.')):
            if not isinstance(text, str):
                continue
            parent, _ = parent_at(record, pointer)
            context = {k: parent[k] for k in ('label', 'status') if k in parent}
            if profile.id == 'S1.purpose_intro':
                context={'status':parent.get('purpose_status'),'supporting_statements':parent['supporting_statements']}
            if profile.id == 'S4.construction_intro':
                context={'status':parent.get('source_status'),'supporting_statements':parent['supporting_statements']}
            if profile.id == 'S4.models':
                # The label already sits beside the description in the table.
                # A variant name must not become inferred training/evaluation scope.
                context.pop('label', None)
            if profile.id == 'S4.canonical_explanation':
                context['canonical_designation'] = parent.get('answer')
            if profile.id == 'S4.primary_explanation':
                context['primary_identity'] = parent.get('answer')
            yield {'profile_id': profile.id, 'stage': stage, 'pointer': pointer,
                   'canonical_text': text, 'context': context,
                   'shape': profile.shape, 'keep_allowed': profile.id not in ('S1.purpose_intro','S4.construction_intro') and (profile.shape != 'items' or '*' in profile.path), 'component': profile.component, 'question': profile.question,
                   'instructions': CONTRACT + '\n\n' + profile.prompt + '\nFor KEEP or FALLBACK, return empty text or empty arrays. REWRITE must use the requested content shape.'}


def resolve(field, answer):
    source = field['canonical_text']
    result = {k: v for k, v in field.items() if k != 'instructions'}
    result.update(decision='FALLBACK', display_text=source, content=original_content(field), reason='INVALID_OUTPUT')
    shape = field.get('shape', 'text')
    schema = response_schema(shape)
    if not isinstance(answer, dict) or set(answer) != set(schema['required']):
        return result
    decision = answer['decision']
    if decision not in ('KEEP', 'REWRITE', 'FALLBACK') or (decision == 'KEEP' and field.get('keep_allowed') is False):
        return result
    content = {k:v for k,v in answer.items() if k != 'decision'}
    if shape == 'text':
        valid = isinstance(content['text'], str)
        strings = [content['text']] if valid else []
    elif shape == 'items':
        valid = isinstance(content['items'], list) and all(isinstance(t, str) for t in content['items'])
        strings = content['items'] if valid else []
    else:
        valid = (isinstance(content['flows'], list) and isinstance(content['notes'], list)
                 and all(isinstance(t, str) for t in content['notes'])
                 and all(isinstance(f, dict) and set(f) == {'label', 'nodes'}
                         and isinstance(f['label'], str) and isinstance(f['nodes'], list)
                         and len(f['nodes']) >= 1 and all(isinstance(t,str) and t.strip() for t in f['nodes'])
                         for f in content['flows']))
        strings = [t for f in content['flows'] for t in [f['label'], *f['nodes']]] + content['notes'] if valid else []
    if not valid:
        return result
    if decision in ('KEEP', 'FALLBACK'):
        if any(strings) and content != original_content(field):
            return result
        if decision == 'KEEP' and shape == 'flow':
            result['reason'] = 'FLOW_NOT_COMPOSED'
            return result
        result.update(decision=decision, reason='ALREADY_APPROPRIATE' if decision == 'KEEP' else 'UNSAFE_TO_COMPOSE')
        return result
    text = content_text(content)
    result.update(candidate_text=text, candidate_content=content)
    if not text.strip() or len(text) > max(1500, len(source) * 4) or (shape == 'flow' and not content['flows']):
        result['reason'] = 'INVALID_LENGTH_OR_SHAPE'
    elif field['stage'] == 'Q1' and any(re.search(pattern, source, re.I) and not re.search(pattern, text, re.I) for pattern in (r'\brandom', r'\bstratifi', r'\bchronolog', r'\b(?:primary|main)\b', r'\bsecondary\b')):
        result['reason'] = 'Q1_SCOPE_QUALIFIER_LOST'
    elif shape == 'flow' and any(re.search(r'→|⟶|->', node) for flow in content['flows'] for node in flow['nodes']):
        result['reason'] = 'MULTIPLE_OPERATIONS_IN_NODE'
    elif re.search(r'\b(?:we|our)\b', text, re.I) and not re.search(r'\b(?:we|our)\b', source, re.I):
        result['reason'] = 'EDITORIAL_FIRST_PERSON'
    elif any(not t.strip() for t in (content.get('items') or [])):
        result['reason'] = 'EMPTY_ITEM'
    elif any(re.match(r'^(KEEP|REWRITE|FALLBACK)(?:\s|:)', t) for t in strings) and not re.match(r'^(KEEP|REWRITE|FALLBACK)(?:\s|:)', source):
        result['reason'] = 'EDITORIAL_CONTROL_TOKEN'
    elif any(re.search(r'\[E\d{4}\]|\]\(|<\s*/?\s*[A-Za-z]+\b|https?://|^\s*[#*>]|[\r\n]', t) for t in strings):
        result['reason'] = 'NOT_PLAIN_CONTENT'
    elif (field['profile_id'] != 'S1.display_title' and not number_values(source).issubset(number_values(text))) or not number_values(text).issubset(number_values(source + ' ' + json.dumps(field.get('context', {}), ensure_ascii=False))):
        result['reason'] = 'NUMBERS_CHANGED'
    else:
        result.update(decision='KEEP' if content == original_content(field) else 'REWRITE',
                      display_text=text, content=content, reason='CONTENT_CONTRACT_VALID')
    return result


def render(stage, record):
    spec = importlib.util.spec_from_file_location('_editorial_renderer_' + stage, WORKSPACE / RENDERERS[stage])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.render_record(record).rstrip()


class Package:
    """Read one explicitly selected final package; no project discovery."""
    def __init__(self, root):
        self.root = Path(root).resolve(strict=True)
        summary = self.root / 'execution_summary.json'
        self.summary = json.loads(summary.read_text())
        self.pid = self.summary['project_id']
        aggregates = [self.root / n for n in ('S1_S6_Q1_Q2_Aggregate_Report.md', 'S1_S4_Q1_Aggregate_Report.md')]
        self.aggregate = next((p for p in aggregates if p.is_file()), None)
        if self.aggregate is None:
            raise ValueError('No preserved final composition')
        self.original = self.aggregate.read_text()
        self.sources = {str(self.aggregate): digest(self.aggregate.read_bytes()), str(summary): digest(summary.read_bytes())}
        self.records, self.original_stages, self.degradations = {}, {}, []
        for stage, name in RECORDS.items():
            path = self.root / 'runs' / (stage + '__' + self.pid) / (name + '.json')
            md = path.with_suffix('.md')
            if not path.is_file() or not md.is_file():
                continue
            for file in (path, md):
                if file.resolve() != file:
                    raise ValueError('Source artifact redirects through a symlink')
                self.sources[str(file)] = digest(file.read_bytes())
            record = json.loads(path.read_text())
            if record.get('project_id') != self.pid:
                raise ValueError('Record identity mismatch')
            preserved = md.read_text().rstrip()
            if render(stage, record) != preserved or self.original.count(preserved) != 1:
                self.degradations.append({'stage': stage, 'reason': 'PRESERVED_RENDERER_MISMATCH'})
                continue
            self.records[stage], self.original_stages[stage] = record, preserved

        # Presentation-only source fields. No canonical record is written.
        if 'S1' in self.records:
            self.records['S1']['_display_title'] = ' '.join(self.records['S1'].get(k, {}).get('text', '') for k in ('core_purpose', 'subject', 'output_claim'))
            from .purpose_intro import attach
            attach(self.records['S1'])
        from .construction_intro import attach as attach_construction
        attach_construction(self.records)
        q1 = self.root / 'runs' / ('Q1__' + self.pid) / 'data_shape_profile.json'
        if q1.is_file():
            self.sources[str(q1)] = digest(q1.read_bytes())
            self.records['Q1'] = json.loads(q1.read_text())

    def fields(self):
        for stage, record in self.records.items():
            for item in fields(stage, record):
                yield {**item, 'project_id': self.pid}

    def compose(self, results):
        allowed = {(f['stage'], f['pointer']): f for f in self.fields()}
        selected = {}
        for result in results:
            key = result['stage'], result['pointer']
            if key not in allowed or key in selected:
                raise ValueError('Editorial field is not authorized or is duplicated')
            if result['canonical_text'] != allowed[key]['canonical_text']:
                raise ValueError('Canonical field changed')
            selected[key] = result
        self.verify_unchanged()
        from .presentation import render_stage
        display = self.original
        for stage, record in self.records.items():
            if stage not in self.original_stages: continue
            display = display.replace(self.original_stages[stage], render_stage(stage, record, selected, self.original_stages[stage]), 1)
        return display

    def content(self, results):
        from .presentation import component_records, passthrough_content
        return {'project_id': self.pid, 'content_contract_version': VERSION,
                'publication': self.summary.get('publication_eligibility'),
                'components': component_records(self.records, results),
                'passthrough': passthrough_content(self.root, self.pid)}

    def verify_unchanged(self):
        if any(digest(Path(p).read_bytes()) != expected for p, expected in self.sources.items()):
            raise ValueError('Canonical source changed during editorial work')
