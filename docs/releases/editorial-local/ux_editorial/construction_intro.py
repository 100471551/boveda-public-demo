"""Opening synthesis from retained construction and learning statements only."""
PATHS=(('S3','construction_path'),('S3','material_changes'),('S3','effective_representation'),('S3','construction_gaps'),('S4','learning_task'),('S4','learning_approach'),('S4','resulting_model_landscape.primary_model_or_capability'),('S4','resulting_model_landscape.canonical_model_status'),('S4','learning_gaps'))

def attach(records):
    core=records.get('S4',{}).get('learning_task',{})
    if not isinstance(core.get('text'),str) or not core['text'].strip():return
    sources=[];refs=[];seen=set()
    def collect(value,stage,field,pointer):
        if isinstance(value,list):
            for i,item in enumerate(value):collect(item,stage,field,pointer+'/'+str(i))
        elif isinstance(value,dict):
            evidence=[{'stage':stage,**{k:r[k] for k in ('evidence_id','artifact','location') if k in r}} for r in value.get('evidence',[])]
            for key in ('text','answer','explanation'):
                if isinstance(value.get(key),str) and value[key].strip():
                    sources.append({'field':stage+'.'+field,'pointer':pointer+'/'+key,'text':value[key],'status':value.get('status'),'label':value.get('label'),'evidence':evidence})
            for ref in evidence:
                identity=tuple(sorted(ref.items()))
                if identity not in seen:refs.append(ref);seen.add(identity)
    for stage,path in PATHS:
        value=records.get(stage,{})
        for key in path.split('.'):value=value.get(key,{}) if isinstance(value,dict) else {}
        collect(value,stage,path,'/'+path.replace('.','/'))
    records['S4']['_construction_intro']={'text':core['text'],'status':'INTERPRETED','source_status':core.get('status'),'canonical_sources':sources,'evidence':refs,'supporting_statements':[{k:v for k,v in source.items() if k!='evidence'} for source in sources]}
