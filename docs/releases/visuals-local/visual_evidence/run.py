"""Explicit offline pilot generation. Never runs within an audit or page request."""
import argparse
import hashlib
import json
import re
import threading
import time
from pathlib import Path
from .computed import candidates as computed_candidates
from .inventory import inventory,shortlist
from .provider import Provider,context
from .service import VERSION,digest,fingerprint,source_root

SAFE_ID=re.compile(r'^[A-Za-z0-9_-]{1,80}$')

def validate_answer(answer,images,refs):
    if not isinstance(answer,dict) or set(answer)!={'items'} or not isinstance(answer['items'],list) or len(answer['items'])>3:raise ValueError('Invalid visual response')
    indexed={c['id']:c for c in images};used=set();items=[]
    for n,item in enumerate(answer['items']):
        ids=item['image_ids'];links=item['audit_refs']
        if not 1<=len(ids)<=3 or any(i not in indexed or i in used for i in ids) or len(set(ids))!=len(ids):raise ValueError('Invalid image linkage')
        if not 1<=len(links)<=4 or any(r not in refs for r in links):raise ValueError('Unknown audit reference')
        if item['section'] not in ('overview','evidence','construction'):raise ValueError('Invalid placement')
        for key,limit in [('title',140),('caption',700),('caveat',500)]:
            if not isinstance(item[key],str) or len(item[key])>limit or any(ord(c)<32 and c not in '\n\t' for c in item[key]):raise ValueError('Invalid copy')
        if not item['caption'].strip() or not item['title'].strip():raise ValueError('Empty copy')
        used.update(ids)
        items.append({'id':'visual-'+str(n),'kind':'project_authored','section':item['section'],'title':item['title'],'caption':item['caption'],'caveat':item['caveat'],
                      'sources':[{'path':indexed[i]['source_path'],'locator':indexed[i]['locator']} for i in ids],
                      'images':[{'asset_sha256':indexed[i]['asset_sha256'],'alt':item['title']} for i in ids],
                      'audit_refs':links})
    if len(used)>6:raise ValueError('Visual count exceeds pilot limit')
    return items

def generate(library,aid,destination,provider=None):
    if not SAFE_ID.fullmatch(aid):raise ValueError('Invalid audit id')
    destination.mkdir(parents=True,exist_ok=True)
    if (destination/'manifest.json').exists():raise ValueError('Preserve existing generation; choose a new output directory')
    start=time.monotonic();payload=library.audit(aid)
    if not payload.get('available'):raise ValueError('Unavailable audits are excluded')
    source=source_root(library,aid)
    inv=inventory(source,destination)
    (destination/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2))
    # Start with at most six actual images, diversified deterministically across source families.
    selected=shortlist(inv['candidates'],limit=6)
    refs=context(payload)
    readme=source/'README.md';readme_text=''
    if readme.is_file() and not readme.is_symlink() and readme.resolve().is_relative_to(source) and readme.stat().st_size<=1024*1024:
        readme_text=readme.read_text(errors='replace')[:5000]
    packet={'audit_id':aid,'audit_title':payload['title'],'audit_refs':refs,'source_readme_excerpt':readme_text,
            'candidates':[{k:c[k] for k in ('id','source_path','locator','context') if k in c} for c in selected],
            'coverage':{'total_candidates':len(inv['candidates']),'images_supplied':len(selected),'selection_is_exhaustive':False,'inventory_truncated':inv['truncated'],'supported_formats':['PNG','JPEG','saved notebook raster outputs','embedded HTML raster images']}}
    (destination/'packet.json').write_text(json.dumps(packet,ensure_ascii=False,indent=2))
    items=[];event={'status':'NO_MODEL_CALL','cost_usd':0};error=None
    if selected and provider and time.monotonic()-start<115:
        answer,event=provider.generate(aid,packet,selected,destination,120-(time.monotonic()-start))
        if answer is not None:
            try:items=validate_answer(answer,selected,refs)
            except (ValueError,KeyError,TypeError) as ex:error=str(ex)[:150]
    items+=computed_candidates(payload)
    assets={c['asset_sha256']:{'file':c['asset_file'],'mime':c['mime']} for c in selected}
    manifest={'version':VERSION,'audit_id':aid,'canonical_fingerprint':fingerprint(payload),'created_unix':time.time(),
              'source_root':str(source),'status':'PARTIAL' if items and len(selected)<len(inv['candidates']) else 'READY' if items else 'NOT_AVAILABLE',
              'review_status':'DRAFT','items':items,'assets':assets,'coverage':packet['coverage'],'api':{k:v for k,v in event.items() if k not in ('output','usage')},'validation_error':error,'seconds':round(time.monotonic()-start,3)}
    (destination/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    return manifest

def main():
    from apps.primitive_probe.product import ProductLibrary
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True,type=Path);parser.add_argument('--audit',action='append');parser.add_argument('--with-model',action='store_true');parser.add_argument('--budget',type=float,default=5.)
    args=parser.parse_args();workspace=Path(__file__).resolve().parents[2]
    output=args.output.resolve()
    if not output.is_relative_to(workspace/'outputs') or output.exists():parser.error('Choose a new directory inside outputs')
    if not 0<args.budget<=12:parser.error('Pilot budget must be positive and at most $12')
    output.mkdir(parents=True)
    runtime=type('ReadOnlyRuntime',(),{'workspace':workspace,'current':None,'lock':threading.RLock()})()
    library=ProductLibrary(runtime)
    provider=Provider(workspace,output/'api_events.jsonl',args.budget) if args.with_model else None
    ids=args.audit or [a['id'] for a in library.list() if a.get('available')]
    if not ids:ids=[a['id'] for a in library.list() if a['id'] not in ('R10','R20')]
    summary=[]
    for aid in ids:
        try:
            result=generate(library,aid,output/aid,provider)
            summary.append({'audit_id':aid,**{k:result[k] for k in ('status','coverage','api','seconds')},'items':len(result['items'])})
        except (ValueError,OSError,KeyError,TypeError) as ex:summary.append({'audit_id':aid,'status':'UNAVAILABLE','error':str(ex)[:150]})
        (output/'summary.json').write_text(json.dumps(summary,indent=2))
        print(json.dumps(summary[-1]),flush=True)
if __name__=='__main__':main()
