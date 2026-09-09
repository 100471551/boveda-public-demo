"""Small comparisons from explicit, compatible native numbers; never OCR."""
import hashlib
import json
import math
from collections import defaultdict

def candidates(payload):
    groups=defaultdict(list)
    cards=payload.get('passthrough',{}).get('Q2',{}).get('content',{}).get('performance_cards',[])
    for index,card in enumerate(cards):
        evaluation=card.get('evaluation',{}).get('text','')
        model=card.get('model_or_capability',{}).get('text','')
        if not evaluation or not model:continue
        for m in card.get('metrics',[]):
            v=m.get('value')
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):continue
            if m.get('status') not in ('DOCUMENTED','DERIVED'):continue
            for e in m.get('evidence',[]):
                path=e.get('artifact','');loc=e.get('location','')
                if not path.lower().endswith(('.csv','.tsv')) or not loc:continue
                key=(evaluation,m.get('label'),m.get('unit'),path,loc)
                groups[key].append({'label':model,'value':v,'card_index':index})
    valid=[]
    for key,rows in groups.items():
        unique={json.dumps(r,sort_keys=True):r for r in rows};rows=list(unique.values())
        if not 2<=len(rows)<=12 or len({r['label'] for r in rows})!=len(rows):continue
        valid.append((key,rows))
    if not valid:return []
    key,rows=sorted(valid,key=lambda pair:(-len(pair[1]),str(pair[0])))[0]
    evaluation,metric,unit,path,loc=key
    return [{'id':'computed-'+hashlib.sha256(str(key).encode()).hexdigest()[:16],
             'kind':'boveda_computed','section':'overview','title':str(metric)+' comparison',
             'caption':evaluation,'caveat':'Only the models listed here are included. Values come from the same documented table and evaluation; this is not a new analysis.',
             'series':[{'label':r['label'],'value':r['value']} for r in rows], 'metric':metric,'unit':unit or '',
             'sources':[{'path':path,'locator':loc}],'images':[]}]
