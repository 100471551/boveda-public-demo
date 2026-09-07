"""Fixed product composition, downstream of the completed canonical report."""
import copy
import html
import json
from .prompts import PROFILES
from .editor import parent_at, locate, original_content


def clean_metadata(parent):
    return {k:copy.deepcopy(parent[k]) for k in ('label','status','answer','canonical_sources') if k in parent} | {
        'evidence': [{k:e[k] for k in ('evidence_id','artifact','location','stage') if k in e} for e in parent.get('evidence', [])]}


def component_records(records, results):
    selected = {(r['stage'],r['pointer']):r for r in results}
    components = []
    for p in PROFILES:
        if p.stage not in records:
            continue
        entries = []
        for pointer,text in locate(records[p.stage],p.path.split('.')):
            parent,_=parent_at(records[p.stage],pointer)
            r=selected.get((p.stage,pointer), {})
            content=r.get('content', original_content({'shape':p.shape,'canonical_text':text}))
            entries.append({'pointer':pointer,'decision':r.get('decision','FALLBACK'),
                            'content':content,'metadata':clean_metadata(parent), 'canonical_text':text, 'effective_source':'CANONICAL' if r.get('decision','FALLBACK')=='FALLBACK' else 'C1', 'editorial_reason':r.get('reason','NO_EDITORIAL_OUTPUT'), **({'display_unavailable':True} if r.get('reason')=='SOURCE_REVIEW_REQUIRED' else {})})
        label = {'S4.canonical_explanation': 'Canonical Model Status',
                 'S4.models': 'Models or Capabilities'}.get(p.id, p.name)
        components.append({'field':p.id,'stage':p.stage,'label':label,'question':p.question,
                           'component':p.component,'entries':entries})
    primary = next((c for c in components if c['field']=='S4.primary'), None)
    explanation = next((c for c in components if c['field']=='S4.primary_explanation'), None)
    if primary is not None and explanation is not None:
        primary['explanation'] = explanation
        components.remove(explanation)
    return components


def refs(metadata):
    return ' '.join('['+e['evidence_id']+']' for e in metadata.get('evidence',[]))


def metadata_text(metadata):
    return ' · '.join(x for x in (metadata.get('status',''),refs(metadata)) if x)


def markdown_content(content):
    if 'text' in content:
        return content['text']
    if 'items' in content:
        return '\n'.join('- '+t for t in content['items'])
    lines=[]
    for flow in content['flows']:
        if flow['label']:
            lines.append('**'+flow['label']+'**')
        lines.append(' → '.join(flow['nodes']))
    lines.extend(content.get('notes', content.get('caveats', [])))
    return '\n\n'.join(lines)


def table_cell(text):
    return text.replace('|','\\|').replace('\n',' ')


def render_stage(stage, record, selected, original):
    components=component_records({stage:record},list(selected.values()))
    lines=[original.splitlines()[0]]
    for c in components:
        lines += ['', '## '+c['label'], '', '*'+c['question']+'*', '']
        if c['component']=='TABLE':
            lines += ['| Model or Capability | Role and Established State | Status | Evidence |', '|---|---|---|---|']
            for entry in c['entries']:
                meta=entry['metadata']
                lines.append('| '+' | '.join(table_cell(x) for x in [meta.get('label',''), markdown_content(entry['content']),meta.get('status',''),refs(meta)])+' |')
        else:
            for entry in c['entries']:
                meta=entry['metadata']
                if c['field']=='S4.learning_approach':
                    lines += ['**'+meta.get('label','')+'**','']
                if c['component']=='INDICATOR':
                    lines += ['**'+meta.get('answer','')+'**','']
                body=markdown_content(entry['content'])
                if c['component']=='LIST' and 'items' not in entry['content']:
                    body='- '+body
                lines += [body,'',metadata_text(meta),'']
        if c.get('explanation'):
            explanation = c['explanation']
            lines += ['', '### '+explanation['question'], '']
            for entry in explanation['entries']:
                lines += [markdown_content(entry['content']), '', metadata_text(entry['metadata']), '']
        if not c['entries']:
            lines.append('None recorded.')
    # These exact original sections remain unchanged, including references and
    # quantitative facts. Only the preceding human prose is newly composed.
    for heading in ('## Q1 Quantitative Profile','## Evidence References'):
        if heading in original:
            start=original.index(heading)
            following=original.find('\n## ',start+len(heading))
            lines += ['',original[start:following if following>=0 else None].rstrip()]
    return '\n'.join(lines).rstrip()


def passthrough_content(root,pid):
    def thin(value):
        if isinstance(value,list):return [thin(v) for v in value]
        if not isinstance(value,dict):return value
        # Exact text and values, with evidence identity kept. Excerpts remain in
        # the canonical evidence trail rather than being copied into UX payloads.
        return {k:thin(v) for k,v in value.items() if k not in ('excerpt','artifact_sha256','excerpt_sha256')}
    output={}
    for stage,file,component in [('Q1','data_shape_profile.json','STRUCTURED FACTS'),('Q2','performance_record.json','TABLE'),('S5','signal_index.json','TABLE'),('S6','audit_confidence_record.json','INDICATOR')]:
        path=root/'runs'/(stage+'__'+pid)/file
        if path.is_file():
            output[stage]={'component':component,'content':thin(json.loads(path.read_text()))}
            if stage == 'S5':
                records=[]
                for signal in output[stage]['content'].get('signals', []):
                    record_path=path.parent/signal['record']
                    if not record_path.resolve().is_relative_to(path.parent.resolve()):
                        raise ValueError('Signal record is outside the selected final stage')
                    if record_path.is_file():records.append(thin(json.loads(record_path.read_text())))
                output[stage]['records']=records
    return output


def html_content(content):
    esc=html.escape
    if 'text' in content:return '<p>'+esc(content['text'])+'</p>'
    if 'items' in content:return '<ul>'+''.join('<li>'+esc(t)+'</li>' for t in content['items'])+'</ul>'
    out=[]
    for f in content['flows']:
        out.append('<p class="route-label">'+esc(f['label'])+'</p><ol class="flow">'+''.join('<li>'+esc(t)+'</li>' for t in f['nodes'])+'</ol>')
    out.extend('<p class="caveat">'+esc(t)+'</p>' for t in content.get('notes', content.get('caveats', [])))
    return ''.join(out)


CSS='''body{font:15px/1.5 system-ui;color:#172c3b;background:#f4f6f8;margin:0;padding:28px}main{max-width:1150px;margin:auto}header{margin:0 0 30px}article{background:white;border:1px solid #d9e1e6;border-radius:8px;padding:22px;margin:18px 0}h1{font-size:26px}h2{font-size:18px;margin:0 0 4px}h3{font-size:16px}p{margin:8px 0}small,.metadata{font-size:12px;color:#5a6874}.question{color:#425564;margin-bottom:18px}.entry{margin:14px 0}li{margin:7px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e0e6eb;padding:12px}th{font-size:13px;background:#f2f5f7}.flow{display:flex;flex-wrap:wrap;list-style:none;padding:0;gap:8px}.flow li{background:#edf3f7;border:1px solid #d0dce5;border-radius:5px;padding:9px 12px;max-width:240px}.flow li:not(:last-child)::after{content:" →";color:#637787}.caveat{border-left:3px solid #b48a47;padding-left:12px}.route-label{font-weight:600}.tag{font-size:11px;letter-spacing:.04em;color:#6a7b87}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.grid article{margin:0}code{overflow-wrap:anywhere}'''


def component_html(c):
    esc=html.escape
    parts=['<article><span class="tag">'+esc(c['stage']+' · '+c['component'])+'</span><h2>'+esc(c['label'])+'</h2><p class="question">'+esc(c['question'])+'</p>']
    if c['component']=='TABLE':
        parts.append('<table><thead><tr><th>Model or Capability</th><th>Role and Established State</th><th>Status / Evidence</th></tr></thead><tbody>')
        for e in c['entries']:
            m=e['metadata'];parts.append('<tr><td>'+esc(m.get('label',''))+'</td><td>'+html_content(e['content'])+'</td><td class="metadata">'+esc(metadata_text(m))+'</td></tr>')
        parts.append('</tbody></table>')
    else:
        for e in c['entries']:
            m=e['metadata'];parts.append('<div class="entry">')
            if c['field']=='S4.learning_approach':parts.append('<h3>'+esc(m.get('label',''))+'</h3>')
            if c['component']=='INDICATOR':parts.append('<strong>'+esc(m.get('answer',''))+'</strong>')
            parts.append(html_content(e['content'])+'<p class="metadata">'+esc(metadata_text(m))+'</p></div>')
    if c.get('explanation'):
        parts.append('<h3>'+esc(c['explanation']['question'])+'</h3>')
        for e in c['explanation']['entries']:
            parts.append(html_content(e['content'])+'<p class="metadata">'+esc(metadata_text(e['metadata']))+'</p>')
    if not c['entries']:parts.append('<p>None recorded.</p>')
    return ''.join(parts)+'</article>'


def preview_html(content, display_url='display.md', canonical_url=None, css_url=None, q3=None):
    esc=html.escape
    style='<link rel="stylesheet" href="'+esc(css_url)+'">' if css_url else '<style>'+CSS+'</style>'
    parts=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bóveda — Editorial Inspection</title>'+style+'<main><header><h1>Bóveda · '+esc(content['project_id'])+'</h1><p>Editorial / product inspection · '+esc(content['publication']['status'] if content.get('publication') else 'Canonical status unavailable')+'</p><p>Working inspection surface. Final product design remains open.</p>']
    publication=content.get('publication') or {}
    if publication.get('reason'):
        parts.append('<p>'+esc(publication['reason'])+'</p>')
    if publication.get('declared_limitations'):
        parts.append('<p class="metadata">Declared limitations: '+esc(', '.join(publication['declared_limitations']))+'</p>')
    if canonical_url:
        parts.append('<p><a href="'+esc(canonical_url)+'">Download canonical Markdown</a></p>')
    parts.append('</header>')
    parts.extend(component_html(c) for c in content['components'])
    parts.append(passthrough_html(content.get('passthrough', {}), q3=q3))
    parts.append('<p><a href="'+esc(display_url)+'">Full display report, including Data Shape, Performance, Signals and Audit Confidence</a></p></main></html>')
    return ''.join(parts)


def preview(destination,content):
    destination.write_text(preview_html(content))


def passthrough_html(surfaces, q3=None):
    esc=lambda v: html.escape(str(v))
    parts=[]
    if 'Q1' in surfaces:
        profile=surfaces['Q1']['content'].get('profile', {})
        parts.append('<article><span class="tag">Q1 · STRUCTURED FACTS</span><h2>Data Shape</h2><dl>')
        for key,label in [('unit','Unit'),('n','N'),('target','Target'),('split','Split'),('representation','Representation')]:
            f=profile.get(key,{})
            parts.append('<dt><strong>'+label+'</strong></dt><dd>'+esc(f.get('statement','Not available'))+'<p class="metadata">'+esc(metadata_text(f))+'</p></dd>')
        parts.append('</dl></article>')
    if q3 is not None:
        try:
            from apps.q3_data_preview.presentation import render
            parts.append(render(q3))
        except Exception:
            parts.append('<article><h2>Data Preview</h2><p>Not available</p></article>')
    if 'Q2' in surfaces:
        record=surfaces['Q2']['content'];parts.append('<article><span class="tag">Q2 · PERFORMANCE CARDS</span><h2>Model Performance</h2><p>'+esc(record.get('record_status',''))+'</p>')
        if record.get('record_status')=='PARTIAL':parts.append('<p class="caveat">This record is partial: material performance work remains unresolved.</p>')
        for c in record.get('performance_cards',[]):
            parts.append('<h3>Model / Capability</h3><p>'+esc(c['model_or_capability']['text'])+'</p><p class="metadata">'+esc(metadata_text(c['model_or_capability']))+'</p><h3>Evaluation</h3><p>'+esc(c['evaluation']['text'])+'</p><p class="metadata">'+esc(metadata_text(c['evaluation']))+'</p><table><tr><th>Metric</th><th>Value</th><th>Unit</th><th>Status / Evidence</th></tr>')
            for m in c['metrics']:
                parts.append('<tr><td>'+esc(m['label'])+'</td><td>'+esc(m['value'] if m['value'] is not None else 'Not found')+'</td><td>'+esc(m.get('unit') or '—')+'</td><td class="metadata">'+esc(metadata_text(m))+'</td></tr>')
            parts.append('</table>')
        if not record.get('performance_cards'):parts.append('<p>No validated Performance Cards established.</p>')
        parts.append('</article>')
    if 'S5' in surfaces:
        surface=surfaces['S5'];parts.append('<article><span class="tag">S5 · TABLE</span><h2>Signals</h2><table><tr><th>Signal</th><th>Outcome</th></tr>')
        by_id={x['signal_id']:x for x in surface.get('records',[])}
        for signal in surface['content'].get('signals',[]):
            r=by_id.get(signal['signal_id'],{})
            parts.append('<tr><td>'+esc(r.get('name',signal['signal_id']))+'<p class="metadata">'+esc(signal['signal_id'])+'</p></td><td>'+esc(signal['outcome'])+'</td></tr>')
        parts.append('</table>')
        for r in surface.get('records',[]):
            applicability=r.get('applicability',{})
            parts.append('<details><summary>'+esc(r.get('name',r['signal_id']))+'</summary><h3>Applicability</h3><p>'+esc(applicability.get('status',''))+' · '+esc(applicability.get('explanation',''))+'</p><h3>Why this outcome occurred</h3><p>'+esc(r.get('explanation',''))+'</p></details>')
        parts.append('</article>')
    if 'S6' in surfaces:
        r=surfaces['S6']['content'];o=r['overall'];score='Not available' if o['score_percent'] is None else str(o['score_percent'])+'%'
        parts.append('<article><span class="tag">S6 · INDICATOR</span><h2>Audit Confidence</h2><h3>'+esc(score)+' · '+esc(o.get('band') or '')+'</h3><p>'+esc(o['status'])+'</p><table><tr><th>Dimension</th><th>Score</th><th>Band</th><th>Status</th></tr>')
        for key,label in [('coverage','Coverage'),('evidence_strength','Evidence strength'),('traceability','Traceability'),('evaluability','Evaluability')]:
            d=r['dimensions'][key];value='Not available' if d['score_percent'] is None else str(d['score_percent'])+'%'
            parts.append('<tr><td>'+label+'</td><td>'+esc(value)+'</td><td>'+esc(d.get('band') or '—')+'</td><td>'+esc(d['status'])+'</td></tr>')
        parts.append('</table><p>Execution status: '+esc(r['execution']['status'])+'</p><p class="caveat">High Audit Confidence does not mean the model is good. It means Bóveda has strong evidence from which to understand and supervise it.</p>')
        if r['execution'].get('dimension_failures'):
            parts.append('<h3>Processing findings</h3><ul>')
            parts.extend('<li>'+esc(k)+': '+esc(v)+'</li>' for k,v in r['execution']['dimension_failures'].items());parts.append('</ul>')
        parts.append('</article>')
    return ''.join(parts)
