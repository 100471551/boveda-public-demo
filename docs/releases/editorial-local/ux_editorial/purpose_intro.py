"""Presentation-only introduction and its canonical S1 provenance."""
import copy

SOURCE_KEYS=('core_purpose','subject','output_claim','intended_use','secondary_purposes')

def statements(value):
    if isinstance(value,list):return [statements(v) for v in value]
    if isinstance(value,dict):return {k:v for k,v in value.items() if k in ('text','status')}
    return value

def attach(record):
    core=record.get('core_purpose',{})
    if not isinstance(core.get('text'),str) or not core['text'].strip():return
    sources=[];evidence=[];seen=set()
    for key in SOURCE_KEYS:
        value=record.get(key,[])
        for index,item in enumerate(value if isinstance(value,list) else [value]):
            if not isinstance(item,dict) or not item.get('text'):continue
            sources.append({'field':'S1.'+key,'pointer':'/'+key+('/'+str(index) if isinstance(value,list) else '')+'/text',**statements(item),'evidence':[{k:ref[k] for k in ('evidence_id','artifact','location') if k in ref} for ref in item.get('evidence',[])]})
            for ref in item.get('evidence',[]):
                clean={k:ref[k] for k in ('evidence_id','artifact','location') if k in ref}
                identity=tuple(sorted(clean.items()))
                if identity not in seen:evidence.append(clean);seen.add(identity)
    record['_purpose_intro']={'text':core['text'],'status':'INTERPRETED','evidence':evidence,
        'canonical_sources':sources,'supporting_statements':{k:statements(record.get(k)) for k in SOURCE_KEYS[1:]},'purpose_status':core.get('status')}
