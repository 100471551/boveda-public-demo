"""Passive, hash-bound visual supplement. Reading it never calls an LLM."""
import copy
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlencode

VERSION='0.1-pilot'
HEX=re.compile(r'^[a-f0-9]{64}$')

def digest(data):return hashlib.sha256(data).hexdigest()

def fingerprint(payload):
    fields=[{'field':c['field'],'entries':[{'pointer':e.get('pointer'),'text':e.get('canonical_text'),'metadata':e.get('metadata')} for e in c.get('entries',[])]} for c in payload.get('components',[])]
    return digest(json.dumps({'passthrough':payload.get('passthrough'),'record_context':payload.get('record_context'),'fields':fields},sort_keys=True,ensure_ascii=False).encode())

def read_json(path,boundary,limit=2*1024*1024):
    path,boundary=Path(path),Path(boundary).resolve()
    if path.is_symlink() or not path.resolve().is_relative_to(boundary) or path.stat().st_size>limit:raise ValueError('Invalid supplement path')
    return json.loads(path.read_text())

def source_root(library,aid):
    binding=library._binding(aid)
    pid=binding['project_id'] if binding['kind']=='runtime' else library._fresh_project_id(aid) or aid
    root=Path(binding['output_root'])/'projects'/pid if binding['kind']=='runtime' else library._project_root(aid)
    sources=set()
    for f in (root/'runs').glob('*/run_metadata.json'):
        d=read_json(f,root)
        if d.get('project_id')==pid and isinstance(d.get('project_root'),str):sources.add((library.workspace/d['project_root']).resolve())
    if len(sources)!=1:raise ValueError('Source binding unavailable or ambiguous')
    source=sources.pop()
    if not source.is_relative_to(library.workspace) or not source.is_dir():raise ValueError('Source outside workspace')
    return source

def _load(library,aid,payload):
    config=read_json(library.outputs/'Primitive_Product_UX/visual_evidence_pilot.json',library.outputs)
    if config.get('version')!=VERSION:return None
    entry=config.get('audits',{}).get(aid)
    if not entry or entry.get('reviewed') is not True:return None
    path=library.workspace/entry['manifest']
    data=read_json(path,library.outputs)
    if digest(path.read_bytes())!=entry['sha256'] or data.get('audit_id')!=aid or data.get('canonical_fingerprint')!=fingerprint(payload):raise ValueError('Stale visual supplement')
    if data.get('version')!=VERSION or data.get('review_status')!='REVIEWED' or data.get('status') not in ('READY','PARTIAL','NOT_AVAILABLE'):raise ValueError('Unqualified supplement')
    return data,path.parent

def supplement(library,aid,payload):
    absent={'status':'NOT_AVAILABLE','items':[]}
    if not payload.get('available'):return absent
    try:
        loaded=_load(library,aid,payload)
        if loaded is None:return absent
        data,folder=loaded
        result={'status':data['status'],'items':copy.deepcopy(data['items'])}
        for item in result['items']:
            for image in item.get('images',[]):
                sha=image.pop('asset_sha256')
                if not HEX.fullmatch(sha):raise ValueError('Invalid asset')
                image['url']='/api/visual-asset?'+urlencode({'audit':aid,'asset':sha})
        return result
    except (OSError,ValueError,KeyError,TypeError,AttributeError):return absent

def asset(library,aid,sha):
    if not isinstance(sha,str) or not HEX.fullmatch(sha):raise ValueError('Invalid asset identifier')
    # Verify the audit and review binding on every asset read. No raw source path is accepted.
    payload=library.audit(aid)
    loaded=_load(library,aid,payload)
    if not loaded:raise ValueError('Visual unavailable')
    data,folder=loaded
    if sha not in {im['asset_sha256'] for item in data['items'] for im in item.get('images',[])}:raise ValueError('Asset outside reviewed supplement')
    info=data['assets'][sha];path=folder/info['file']
    if path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()) or path.stat().st_size>8*1024*1024:raise ValueError('Invalid retained asset')
    blob=path.read_bytes()
    if digest(blob)!=sha:raise ValueError('Retained asset changed')
    mime=info['mime']
    if not ((mime=='image/png' and blob.startswith(b'\x89PNG\r\n\x1a\n')) or (mime=='image/jpeg' and blob.startswith(b'\xff\xd8\xff'))):raise ValueError('Unsupported image format')
    return blob,mime
