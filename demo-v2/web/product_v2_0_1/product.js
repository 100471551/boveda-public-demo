/* Final presentation only. Canonical records and editorial contracts are inputs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = document.querySelector('meta[name="probe-token"]').content;
  const state = {audit:null,library:[],runtime:null,lastAudit:null,section:'overview',model:0,metric:null,view:0,filter:'ALL',outcomeSort:'priority',sourceFilter:'ALL',routeIndex:0,representationIndex:0,approachIndex:0,evidenceTopic:0,compareLeft:0,compareRight:1,details:new Map(),counter:0,route:0,drawerFocus:null,drawerStack:[],drawerRequest:0,pending:false,search:'',libraryLayout:'grid',lastProgress:null,homePurposeCache:{},homePurposeLoading:new Set(),homePurposeTask:null,privateEpoch:0,sessionChecking:false,auth:{ready:false,enabled:false,authenticated:false,hostedDemo:false},loginPending:false,loginRemember:false,loginError:'',loginUsername:'',loginFocus:null};
  const grid = '<span class="grid-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  const icon = name => `<img class="icon" src="/product/assets/${name}.svg" alt="">`;
  const pretty = value => String(value || 'Not available').toLowerCase().replace(/_/g,' ').replace(/^./, c=>c.toUpperCase());
  const hostedSession = session => session?.hostedDemo===true||session?.capabilities?.hostedDemo===true;
  const cls = value => String(value || '').toLowerCase().replace(/[ _]+/g,'-').replace(/[^a-z-]/g,'');
  const isNumber = value => typeof value === 'number' && Number.isFinite(value);
  const num = (value,digits=2) => isNumber(value) ? value.toLocaleString('en-US',{maximumFractionDigits:digits}) : (value ?? '—');
  const section = (title,body) => `<section class="drawer-section"><h3>${esc(title)}</h3>${body}</section>`;
  const json = value => `<pre>${esc(JSON.stringify(value,null,2))}</pre>`;
  const contentText = c => c?.text ?? c?.items?.join('\n') ?? [...(c?.flows || []).map(f=>(f.label ? f.label+': ' : '')+f.nodes.join(' → ')),...(c?.notes || c?.caveats || [])].join('\n');
  function detail(value) { const id='detail-'+(++state.counter);state.details.set(id,value);return id; }
  function badge(meta={},context={},dot=false) {
    const status=meta.status || (context.empty ? 'None recorded' : 'Not available');
    const key=detail({...context,metadata:meta});
    return dot ? `<button class="status-dot ${cls(status)}" data-detail="${key}" aria-label="${esc(context.title || 'Field')}: ${esc(pretty(status))}. Inspect evidence" title="${esc(pretty(status))}"><span></span></button>` :
      `<button class="badge badge-button ${cls(status)}" data-detail="${key}" aria-label="${esc(context.title || 'Field')}: ${esc(pretty(status))}. Inspect evidence">${esc(pretty(status))}</button>`;
  }
  function content(c={}) {
    if(typeof c.text==='string')return `<div class="field-copy"><p>${esc(c.text)}</p></div>`;
    if(Array.isArray(c.items))return `<div class="field-copy"><ul>${c.items.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`;
    if(Array.isArray(c.flows))return `<div class="field-copy"><div class="flow-routes">${c.flows.map(f=>`<div>${f.label?`<h3 class="flow-label">${esc(f.label)}</h3>`:''}<ol class="flow">${f.nodes.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></div>`).join('')}</div>${(c.notes || c.caveats || []).length?`<div class="flow-notes">${(c.notes || c.caveats).map(t=>`<p>${esc(t)}</p>`).join('')}</div>`:''}</div>`;
    return '<p class="empty-copy">Not available.</p>';
  }
  // These field contracts preserve complete scope and role clauses in the product.
  // The retained editorial candidate and canonical record remain unchanged.
  const canonicalDisplayFields=new Set(['S2.evidence_gaps','S3.effective_representation','S4.primary']);
  function component(id) {
    const c=state.audit?.components?.find(c=>c.field===id);
    if(!c||!canonicalDisplayFields.has(id)||state.audit?.editorial_qualified)return c;
    return {...c,entries:c.entries.map(e=>typeof e.canonical_text==='string'&&e.canonical_text.trim()?{...e,effective_source:'CANONICAL',fallback_reason:'LEGACY_SCOPE_PROTECTION',content:c.component==='LIST'?{items:[e.canonical_text]}:{text:e.canonical_text}}:e)};
  }
  function entryContext(c,e) { return {title:c?.label,stage:c?.stage,display_text:contentText(e?.content),canonical_text:e?.canonical_text,canonical_sources:e?.metadata?.canonical_sources,pointer:e?.pointer,decision:e?.decision}; }
  function entries(c,labels=false) {
    if(!c?.entries?.length)return '<p class="empty-copy">None recorded.</p>';
    return c.entries.map(e=>`<div class="field-block">${labels&&e.metadata?.label?`<h3>${esc(e.metadata.label)}</h3>`:''}${content(e.content)}<div class="field-label">${badge(e.metadata,entryContext(c,e))}</div></div>`).join('');
  }
  function fieldLabel(c,e) { return `<div class="field-label"><span>${esc(c?.label || 'Not available')}</span>${badge(e?.metadata, {...entryContext(c,e),empty:!e})}</div>`; }
  function questionCard(id,question) {
    const c=component(id),e=c?.entries?.[0];
    return `<div class="field-block">${fieldLabel(c,e)}<h3>${esc(question || c?.question || '')}</h3>${e?c.entries.map(x=>content(x.content)).join(''):'<p class="empty-copy">None recorded.</p>'}${(c?.entries?.length||0)>1?`<button class="text-button" data-detail="${detail({title:c.label,stage:c.stage,record:c.entries})}">Inspect all entries →</button>`:''}</div>`;
  }
  const publicationLabel = status => ({PUBLISHABLE:'Available',PUBLISHABLE_WITH_LIMITATIONS:'Available with limitations',NOT_PUBLISHABLE:'Unavailable',NOT_AVAILABLE:'Unavailable'}[status]||pretty(status));
  function publication() {
    const p=state.audit?.publication||{};if(!p.status)return '';
    const k=detail({title:'Publication status',record:p});
    return `<div class="publication-note"><span class="badge ${p.status==='PUBLISHABLE'?'documented':p.status==='NOT_PUBLISHABLE'?'unresolved':'interpreted'}">${esc(publicationLabel(p.status))}</span>${state.audit.editorial_mode==='CANONICAL'?'<span>Canonical copy</span>':''}<button data-detail="${k}">Status and limitations</button></div>`;
  }
  function confidence() {
    const r=state.audit.passthrough?.S6?.content;
    if(!r)return '<article class="panel"><div class="panel-title">'+icon('confidence')+'<h2>Audit Confidence</h2></div><div class="panel-body"><p class="empty-copy">Not available.</p></div></article>';
    const o=r.overall||{},names=[['coverage','Coverage'],['evidence_strength','Evidence strength'],['traceability','Traceability'],['evaluability','Evaluability']];
    return `<article class="panel confidence"><header class="confidence-head">${icon('confidence')}<h2>Audit Confidence</h2><div class="confidence-score"><small>${esc(o.band?pretty(o.band):'')}</small><strong>${isNumber(o.score_percent)?esc(num(o.score_percent))+'%':'—'}</strong></div></header><div class="confidence-dimensions">${names.map(([key,label])=>{
      const d=r.dimensions?.[key]||{},v=d.score_percent,has=isNumber(v)&&v>=0&&v<=100;
      const ticks=Array.from({length:10},(_,i)=>`<i class="${has&&i<Math.round(v/10)?'on':''}"></i>`).join('');
      const k=detail({title:label,stage:'S6',record:d,context:'This dimension describes the audit evidence, not model quality.'});
      return `<button class="dimension" data-detail="${k}" aria-label="Inspect ${label}"><span class="dimension-name">${grid}${label}</span><span class="ticks ${key==='evidence_strength'?'yellow':key==='evaluability'?'red':'green'}" aria-hidden="true">${ticks}</span><span class="dimension-value">${esc(key==='evidence_strength'&&d.band?pretty(d.band):has?num(v)+'%':'—')}</span></button>`;
    }).join('')}</div><p class="execution-line ${r.execution?.status==='COMPLETE'?'complete':''}"><span><strong>Execution status:</strong> ${esc(pretty(r.execution?.status))}${o.status==='PROVISIONAL'?' · Provisional':''}</span></p><p class="confidence-note">Audit confidence describes the strength of the audit, not model quality.</p></article>`;
  }
  function splitShapeStatement(value) {
    const statement=String(value||'').trim();
    const match=statement.match(/^(?:(?<prefix>[A-Za-z][A-Za-z /-]{0,48}):\s*)?(?<notation>N\s*=\s*)?(?<scalar>\d[\d,]*(?:\.\d+)?(?:\s+(?:thousand|million|billion))?)\s+(?<rest>.+)$/s);
    if(!match)return {scalar:null,caption:statement};
    const rest=match.groups.rest.trim(),clause=rest.split(/[;():]/,1)[0].trim(),initialDetail=rest.split(';',1)[0];
    if(/^(?:to|through|until|and|or)\b|^[+\-–—]/i.test(rest))return {scalar:null,caption:statement};
    if(/\b(?:about|approximately|approx\.?|roughly|at least|at most|up to|no more than|more than|less than|estimated?|uncertain|unknown)\b/i.test(initialDetail))return {scalar:null,caption:statement};
    const countLead=/^(?:[A-Za-z0-9][A-Za-z0-9/-]*\s+){0,8}(?:records?|rows?|observations?|samples?|examples?|instances?|households?|patients?|participants?|images?|documents?|sequences?|events?|windows?|requests?|profiles?|parcels?|narratives?|items?|catchment-days?|days?|species|chemicals?|cities?|paths?|targets?|classes?|variables?|features?|cases?|flights?|routes?|transactions?|visits?|stations?|stories?|prompts?|questions?|measurements?|subjects?|trips?|rides?|segments?|hours?)\b/i;
    if(!countLead.test(clause))return {scalar:null,caption:statement};
    const caption=`${match.groups.prefix?match.groups.prefix+': ':''}${rest}`.replace(/^./,c=>c.toUpperCase());
    return {scalar:match.groups.scalar,caption};
  }
  function shape(expanded=false) {
    const profile=state.audit.passthrough?.Q1?.content?.profile||{},n=profile.n||{};
    const statement=n.statement||'Not available',displayN=component('Q1.n')?.entries?.[0],split=splitShapeStatement(displayN?.display_unavailable?'Description unavailable':displayN?.content?.text||statement);
    return `<article class="panel shape-card ${expanded?'shape-expanded':''} ${split.scalar?'has-count':''}"><header class="shape-header"><h2>${icon('data-shape')}Data Shape</h2><div class="shape-headline"><div class="shape-count">${badge(n,{title:'N',stage:'Q1',canonical_text:statement},!expanded)}${split.scalar?`<strong>${esc(split.scalar)}</strong>`:'<span class="sr-only">N</span>'}</div><p>${esc(split.caption)}</p></div></header><div class="shape-fields">${[['unit','Unit'],['target','Target'],['split','Split'],['representation','Representation']].map(([key,label])=>{
      const f=profile[key]||{},editorial=component('Q1.'+key)?.entries?.[0],displayText=editorial?.display_unavailable?'Description unavailable — inspect the retained statement.':editorial?.content?.text||f.statement||'Not available';return `<div class="shape-row"><span class="shape-label">${grid}${label}</span>${badge(f,{title:label,stage:'Q1',canonical_text:f.statement},true)}<span class="shape-value">${esc(displayText)}</span></div>`;
    }).join('')}</div></article>`;
  }
  function contextTable(notes) {return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Measure and scope</th><th>Value</th><th>Unit</th><th>Status</th></tr></thead><tbody>${notes.map(n=>`<tr><td>${grid}${esc(n.label)}</td><td>${esc(num(n.value))}</td><td>${esc(n.unit||'—')}</td><td>${badge(n,{title:n.label,stage:'S2',record:n})}</td></tr>`).join('')}</tbody></table></div>`;}
  function preview() {
    const q=state.audit.q3||{status:'NOT_AVAILABLE'},views=q.views||[],notes=q.reported_context||[];
    if(!views.length)return `<section class="preview-layer"><div class="preview-toolbar"><h3>${icon('data-preview')}Data Preview</h3><span class="badge">${notes.length?'Limited coverage':'Not available'}</span></div><div class="preview-data-layer"><div class="preview-empty"><h3>Descriptive statistics: Not available</h3><p class="muted">${notes.length?'Only reported data context is available. These values were retained from the audit; they are not newly calculated statistics.':'No sufficiently identified, supported data artifact is available for this preview.'}</p></div>${notes.length?contextTable(notes):''}</div></section><div class="source-footer"><button class="text-button" data-detail="${detail({title:'Source and coverage',stage:'Q3',record:q})}">Source and coverage</button></div>`;
    state.view=Math.min(state.view,views.length-1);const view=views[state.view],cols=(view.columns||[]).filter(c=>c.kind==='numeric'||c.mean!==undefined),others=(view.columns||[]).filter(c=>!cols.includes(c));
    return `<section class="preview-layer"><div class="preview-toolbar"><h3>${icon('data-preview')}Data Preview</h3><select id="preview-select" aria-label="Data artifact">${views.map((v,i)=>`<option value="${i}" ${i===state.view?'selected':''}>${esc(v.artifact || v.expression || 'Saved data table')}</option>`).join('')}</select></div><p class="preview-scope">${esc(view.scope || 'Scope not established')}${view.row_count!=null?' · '+esc(num(view.row_count))+' rows in this artifact':''}</p><div class="preview-data-layer">${cols.length?`<div class="table-scroll"><table class="data-table"><thead><tr>${['Variable','N','Missing','Mean','Std','Min','Median','Max'].map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${cols.slice(0,24).map(c=>`<tr><td>${grid}${esc(c.variable)}</td>${['n','missing','mean','std','minimum','median','maximum'].map(k=>`<td>${esc(num(c[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="preview-empty"><p>No numeric descriptive columns are available for this artifact.</p></div>'}${cols.length>24?'<p class="preview-scope">Showing 24 numeric variables. All extracted values are available in Source and coverage.</p>':''}${others.length?`<div class="preview-scope"><button class="text-button" data-detail="${detail({title:'Other data fields',record:others})}">Inspect ${others.length} non-numeric, categorical or identifier field${others.length===1?'':'s'} →</button></div>`:''}</div></section><div class="source-footer"><button class="text-button" data-detail="${detail({title:'Source and coverage',stage:'Q3',record:view,context:'Statistics describe this source artifact or saved expression. They do not replace Q1’s analytical population or split.'})}">Source and coverage</button><span class="small muted">${view.method==='COMPUTED'?'Computed from source artifact':'Reported in a saved artifact'}</span></div>`;
  }
  function evidencePreview() { const c=component('S2.evidence_basis'),e=c?.entries?.[0];return `<article class="panel evidence-preview"><div class="evidence-intro">${icon('database')}<div>${fieldLabel(c,e)}<h2>What evidence does the project actually rely on?</h2></div><div class="field-copy">${e?content(e.content):'<p class="empty-copy">Not available.</p>'}</div></div>${preview()}</article>`; }
  const surfaceFrame = '<svg class="surface-frame" aria-hidden="true" focusable="false" preserveAspectRatio="none"><path></path></svg>';
  function metricVisual(metric={}) {
    const shown=BovedaMetricDisplay.describe(metric),fmt=BovedaMetricDisplay.formatHero;
    const hero=BovedaMetricDisplay.heroAffixes(shown);
    let illustration='';
    if(shown.visual?.type==='r2-window'){
      const value=shown.visual.value,dial=BovedaMetricDisplay.r2Dial(value);
      return `<aside class="metric-tile unified-surface r2-tile">${surfaceFrame}<h3 class="metric-cap">${esc(shown.title)}</h3><div class="metric-inner"><div class="r2-gauge" data-r2-value="${value}" role="img" aria-label="R squared ${esc(dial.precise)}; arc starts at zero and extends ${value<0?'toward minus one':'toward one'}. R squared can be below minus one."><span class="r2-zero" aria-hidden="true">0</span><div class="r2-arc"><img src="/product_v2_0_1/assets/r2-arc.svg" alt="" width="227" height="175"/><span class="r2-active"></span>${value!==0?`<i class="r2-cap r2-origin"></i><i class="r2-cap r2-end"></i>`:''}<strong class="r2-center">${esc(dial.center)}</strong></div><div class="r2-endpoints" aria-hidden="true"><span>−1</span><span>1</span></div></div><div class="r2-status">${badge(metric,{title:metric.label||'Metric',stage:'Q2',record:metric})}</div><div class="r2-precise"><span>R²</span><span title="${esc(value)}">${esc(dial.precise)}</span></div>${value < -1?'<p class="small muted r2-overflow">Value below −1; arc ends at −1.</p>':''}</div></aside>`;
    }else if(shown.visual?.type==='fill'){
      const {min,max,low,high}=shown.visual,span=max-min;
      const lowFraction=(low-min)/span,highFraction=(high-min)/span;
      illustration=`<div class="dot-matrix" aria-hidden="true">${Array.from({length:200},(_,i)=>`<i class="${i<Math.round(lowFraction*200)?'':i<Math.round(highFraction*200)?'range-dot':'off'}"></i>`).join('')}</div><div class="metric-scale" aria-hidden="true"><span>${esc(fmt(min))}</span><span>${esc(fmt(max))}</span></div>`;
    }else if(shown.visual?.type==='point'){
      const {min,max,value}=shown.visual,position=((value-min)/(max-min))*100;
      const marker=Math.round(position/2.5);
      illustration=`<div class="point-illustration" aria-hidden="true"><div class="point-track">${Array.from({length:41},(_,i)=>`<i class="${i===marker?'on':''}"></i>`).join('')}</div><div class="metric-scale"><span>${esc(fmt(min))}</span><span>0</span><span>${esc(fmt(max))}</span></div></div>`;
    }
    const scalar=shown.range?shown.range.map(v=>fmt(v,shown.unit==='0–1')).join('–'):fmt(shown.value,shown.kind==='ratio');
    const result=shown.kind==='group'?`<dl class="metric-group">${shown.parts.map(p=>`<div><dt>${esc(p.label)}</dt><dd>${esc(fmt(p.value))} <small>${esc(p.unit)}</small></dd></div>`).join('')}</dl>`:shown.kind==='text'?`<p class="metric-outcome">${esc(shown.value)}</p>`:`<div class="metric-display">${hero.qualifier?`<span class="metric-qualifier">${esc(hero.qualifier)}</span>`:''}<strong>${esc(scalar)}</strong>${hero.unit?`<span>${esc(hero.unit)}</span>`:''}</div>`;
    return `<aside class="metric-tile unified-surface ${shown.kind}">${surfaceFrame}<h3 class="metric-cap">${esc(shown.title)}</h3><div class="metric-inner">${illustration}${result}${shown.detail?`<p class="metric-uncertainty">${esc(fmt(shown.detail))}</p>`:''}${shown.context?`<p class="metric-context">${esc(shown.context)}</p>`:''}${badge(metric,{title:metric.label||'Metric',stage:'Q2',record:metric})}${BovedaMetricDisplay.userNote(shown)?`<p class="small muted">${esc(BovedaMetricDisplay.userNote(shown))}</p>`:''}</div></aside>`;
  }
  function performance() {
    const r=state.audit.passthrough?.Q2?.content||{},cards=r.performance_cards||[];
    if(!cards.length)return `<article class="panel performance"><div class="panel-title">${icon('performance')}<h2>Model Performance</h2></div><div class="panel-body"><p class="empty-copy">No performance result is available for this audit.</p></div></article>`;
    state.model=Math.min(state.model,cards.length-1);const c=cards[state.model],metrics=c.metrics||[];if(state.metric===null){const preferred=metrics.findIndex(m=>BovedaMetricDisplay.describe(m).visual);state.metric=Math.max(0,preferred);}state.metric=Math.min(state.metric,Math.max(0,metrics.length-1));
    return `<article class="panel performance"><div class="panel-title">${icon('performance')}<h2>Model Performance</h2></div><div class="performance-columns"><section class="model-surface unified-surface">${surfaceFrame}<div class="model-tabs" role="tablist" aria-label="Model evaluations">${cards.map((card,i)=>`<button role="tab" id="model-tab-${i}" aria-selected="${i===state.model}" aria-controls="model-panel" class="${i===state.model?'active':''}" data-model="${i}" title="${esc(card.model_or_capability?.text)}">${grid}<span class="model-tab-label">Model ${i+1}</span></button>`).join('')}</div><div class="performance-detail" id="model-panel" role="tabpanel" aria-labelledby="model-tab-${state.model}"><div class="model-description"><div><h3>Model / Capability</h3><p>${esc(c.model_or_capability?.text||'Not available')}</p>${badge(c.model_or_capability,{title:'Model / Capability',stage:'Q2',record:c.model_or_capability})}</div><div><h3>Evaluation</h3><p>${esc(c.evaluation?.text||'Not available')}</p>${badge(c.evaluation,{title:'Evaluation',stage:'Q2',record:c.evaluation})}</div></div><div class="metric-table-scroll"><table class="metrics-table"><thead><tr><th>Metric</th><th>Status</th><th>Unit</th><th>Value</th></tr></thead><tbody>${metrics.map((m,i)=>`<tr><td><button class="metric-select" data-metric="${i}" aria-pressed="${state.metric===i}">${grid}<span>${esc(m.label||'-')}</span></button></td><td>${badge(m,{title:m.label,stage:'Q2',record:m},true)}</td><td>${esc(m.unit||'-')}</td><td><span class="metric-value">${esc(m.value===null||m.value===undefined||m.value===''?'-':m.value)}</span></td></tr>`).join('')}</tbody></table></div></div></section>${metricVisual(metrics[state.metric])}</div><p class="execution-line ${r.record_status==='COMPLETE'?'complete':''}"><span><strong>Execution status:</strong> ${esc(pretty(r.record_status))}${r.record_status==='PARTIAL'?' · Material performance work remains unresolved.':''}</span></p></article>`;
  }
  function syncPerformanceShape() {
    document.querySelectorAll('[data-r2-value]').forEach(gauge=>{
      const dial=BovedaMetricDisplay.r2Dial(Number(gauge.dataset.r2Value));
      gauge.querySelector('.r2-active').style.background=dial.gradient;
      const end=gauge.querySelector('.r2-end');
      if(end){end.style.left=dial.x+'%';end.style.top=dial.y+'%';}
    });
    for(const surface of document.querySelectorAll('.model-surface,.tab-surface')){
      const tabs=surface.querySelector('.model-tabs,.surface-tabs'),active=tabs?.querySelector('[aria-selected="true"]');
      if(!active)continue;
      const box=surface.getBoundingClientRect(),tab=active.getBoundingClientRect();
      surface.style.setProperty('--tab-left',`${tab.left-box.left}px`);surface.style.setProperty('--tab-width',`${tab.width}px`);surface.style.setProperty('--shelf',`${tabs.offsetHeight}px`);tabs.onscroll=syncPerformanceShape;
      const first=tabs.querySelector('.model-tab-label');
      if(first)surface.style.setProperty('--copy-left',`${first.getBoundingClientRect().left-first.parentElement.getBoundingClientRect().left}px`);
      drawSurfaceFrame(surface);
    }
    const metric=document.querySelector('.metric-tile'),cap=metric?.querySelector('.metric-cap');
    if(metric&&cap){metric.style.setProperty('--tab-width',`${cap.offsetWidth}px`);metric.style.setProperty('--shelf',`${cap.offsetHeight}px`);drawSurfaceFrame(metric);}
  }

  function drawSurfaceFrame(node) {
    const svg=node.querySelector('.surface-frame'),box=node.getBoundingClientRect();if(!svg||box.width<2||box.height<2)return;
    const style=getComputedStyle(node),w=box.width-1,h=box.height-1,shelf=parseFloat(style.getPropertyValue('--shelf'))||54;
    const rawLeft=parseFloat(style.getPropertyValue('--tab-left'))||0,left=Math.max(0,rawLeft),right=Math.min(w,rawLeft+(parseFloat(style.getPropertyValue('--tab-width'))||188));
    if(right<=left){svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);const path=svg.querySelector('path');path.setAttribute('d',`M 20 ${shelf} H ${w-20} Q ${w} ${shelf} ${w} ${shelf+20} V ${h-20} Q ${w} ${h} ${w-20} ${h} H 20 Q 0 ${h} 0 ${h-20} V ${shelf+20} Q 0 ${shelf} 20 ${shelf} Z`);path.setAttribute('transform','translate(.5 .5)');return;}
    const r=Math.min(20,(right-left)/2),joinL=Math.min(20,left/2),joinR=Math.min(20,(w-right)/2);
    // A single rounded outline follows the same tab/body union as the Figma component.
    let d=left<=.5?`M 0 ${r} Q 0 0 ${r} 0`:`M 0 ${shelf+joinL} Q 0 ${shelf} ${joinL} ${shelf} L ${left-joinL} ${shelf} Q ${left} ${shelf} ${left} ${shelf-joinL} L ${left} ${r} Q ${left} 0 ${left+r} 0`;
    d+=` L ${right-r} 0 Q ${right} 0 ${right} ${r}`;
    if(right<w-.5)d+=` L ${right} ${shelf-joinR} Q ${right} ${shelf} ${right+joinR} ${shelf} L ${w-joinR} ${shelf} Q ${w} ${shelf} ${w} ${shelf+joinR}`;
    d+=` L ${w} ${h-20} Q ${w} ${h} ${w-20} ${h} L 20 ${h} Q 0 ${h} 0 ${h-20} Z`;
    svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);const path=svg.querySelector('path');path.setAttribute('d',d);path.setAttribute('transform','translate(.5 .5)');
  }
  function callout(id,title,red=false) {
    const c=component(id),neutral=/_gaps$/.test(id),items=(c?.entries||[]).flatMap(e=>{const list=e.content?.items||[contentText(e.content)];return list.map(text=>({text,e}));});
    const heading=id==='S1.boundary'?'<span>Where does the</span><span>claim stop?</span>':esc(title);
    return `<aside class="callout ${neutral?'neutral':red?'red':''}"><h2>${heading}</h2><ul>${items.length?items.map(({text,e})=>`<li>${icon(neutral?'chevron':red?'arrow-red':'arrow-amber')}<span>${esc(text)}</span>${id==='S1.boundary'?'':badge(e.metadata,entryContext(c,e),!neutral)}</li>`).join(''):'<li><span></span><p class="empty-copy">None recorded.</p></li>'}</ul></aside>`;
  }
  function overview() {
    const intro=component('S1.purpose_intro'),c=intro?.entries?.[0]?.decision==='REWRITE'?intro:component('S1.core_purpose'),e=c?.entries?.[0];
    return `<div class="overview-top"><div class="overview-left"><article class="panel purpose-card"><div class="purpose-question"><img class="purpose-icon" src="/product_v2_0_1/assets/purpose.svg" alt=""><h2>What is<br>it for?</h2></div><div class="purpose-description">${fieldLabel(c,e)}${e?content(e.content):'<p class="empty-copy">Not available.</p>'}</div></article><article class="panel content-overview"><div class="panel-title">${grid}<h2>Content Overview</h2></div><div class="panel-body">${questionCard('S1.subject','What is it about?')}${questionCard('S1.output_claim','What does it produce or assert?')}${questionCard('S1.intended_use','Why, for whom, or toward what decision?')}${questionCard('S1.secondary_purposes')}</div></article></div><div class="overview-right">${confidence()}${shape()}</div></div>${evidencePreview()}${performance()}${callout('S1.boundary','Where does the claim stop?')}${callout('S1.not_established','Not Established',true)}`;
  }
  function componentPanel(id,ico='construction') {const c=component(id);return `<article class="panel component-panel"><div class="panel-title">${icon(ico)}<h2>${esc(c?.label||id)}</h2></div><div class="panel-body">${entries(c,true)}</div></article>`;}
  function wideQuestion(id) {const c=component(id);return `<article class="panel wide-question"><div><div class="field-label">${esc(c?.label||'Not available')}</div><h2>${esc(c?.question||'Not available')}</h2></div><div>${entries(c)}</div></article>`;}
  const stageNames={S1:'Purpose',S2:'Evidence',S3:'Construction',S4:'Learning',Q1:'Data Shape',Q2:'Performance',S6:'Audit Confidence'};
  const fieldItems=c=>(c?.entries||[]).flatMap(e=>(e.content?.items||[contentText(e.content)]).filter(Boolean).map(text=>({text,entry:e})));
  const exactNumber=value=>isNumber(value)&&Number.isInteger(value)?value.toLocaleString('en-US'):value??'—';
  function chapter(number,label,question){return `<header class="chapter-heading"><span class="chapter-number">${number}</span><div><p class="eyebrow">${esc(label)}</p><h2>${esc(question)}</h2></div></header>`;}
  function narrativeHero(question,id){const c=component(id);return `<article class="panel narrative-hero"><h2>${question}</h2><div>${(c?.entries||[]).map(e=>`${fieldLabel(c,e)}${content(e.content)}`).join('')||'<p class="empty-copy">Not available.</p>'}</div></article>`;}
  function factRows(stages=['S2','S3']){
    const rows=stages.flatMap(stage=>(state.audit.record_context?.[stage]?.quantitative_notes||[]).map(note=>({stage,note})));
    if(!rows.length)return '';
    return `<article class="panel recorded-facts"><div class="panel-title">${icon('data-shape')}<h2>Recorded quantities</h2></div><div class="quantities-scroll table-scroll"><table class="data-table quantities-table"><thead><tr><th>Measure and scope</th><th>Value</th><th>Unit</th><th>Status</th></tr></thead><tbody>${rows.map(({stage,note})=>`<tr><td>${grid}<span class="eyebrow">${esc(stageNames[stage])}${note.category?' · '+esc(note.category):''}</span><span class="quantity-label">${esc(note.label)}</span></td><td class="quantity-number">${esc(exactNumber(note.value))}</td><td>${esc(note.unit||'Unit not available')}</td><td>${badge(note,{title:note.label,stage,record:note})}</td></tr>`).join('')}</tbody></table></div></article>`;
  }

  function reconstructionNotes(stages=['S2','S3']){
    const notes=stages.flatMap(stage=>(state.audit.record_context?.[stage]?.supporting_reconstruction||[]).map(note=>({stage,note})));
    if(!notes.length)return '';
    return `<details class="panel support-notes"><summary>Supporting reconstruction <span>${notes.length} retained notes</span></summary><div class="support-note-grid">${notes.map(({stage,note})=>`<article><div class="field-label"><span>${esc(stageNames[stage])}${note.kind?' · '+esc(note.kind):''}</span>${badge(note,{title:note.kind||'Supporting reconstruction',stage,canonical_text:note.text,record:note})}</div><p>${esc(note.text||'Not available')}</p></article>`).join('')}</div></details>`;
  }
  function referenceInventory(){
    const inventory=new Map();
    function add(ref,stage,field){
      if(!ref||typeof ref.artifact!=='string'||!ref.artifact)return;
      if(!inventory.has(ref.artifact))inventory.set(ref.artifact,{artifact:ref.artifact,stages:[],references:[]});
      const item=inventory.get(ref.artifact);if(!item.stages.includes(stage))item.stages.push(stage);
      const key=JSON.stringify([stage,ref.evidence_id,ref.location,field]);
      if(!item.references.some(r=>r.key===key))item.references.push({...ref,key,stage,field});
    }
    for(const c of state.audit.components||[]){for(const part of [c,...(c.explanation?[c.explanation]:[])])for(const e of part.entries||[])for(const ref of e.metadata?.evidence||[])add(ref,ref.stage||part.stage,part.label);}
    function walk(value,stage,label){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(v=>walk(v,stage,label));return;}for(const ref of value.evidence||[])add(ref,stage,value.label||label);for(const [key,v] of Object.entries(value))if(key!=='evidence')walk(v,stage,label);}
    for(const stage of ['Q1','Q2','S6'])walk(state.audit.passthrough?.[stage]?.content,stage,stageNames[stage]);
    for(const stage of ['S2','S3'])walk(state.audit.record_context?.[stage],stage,stageNames[stage]);
    return [...inventory.values()].sort((a,b)=>a.artifact.localeCompare(b.artifact));
  }
  function artifactCatalogue(){
    const all=referenceInventory(),stages=Object.keys(stageNames).filter(stage=>all.some(a=>a.stages.includes(stage))),items=all.filter(a=>state.sourceFilter==='ALL'||a.stages.includes(state.sourceFilter));
    return `<article class="panel artifact-catalogue"><header class="catalogue-heading"><div><p class="eyebrow">Verification on demand</p><h2>Where does the evidence come from?</h2><p class="muted">Artifacts referenced by the final audit fields. This is not a repository-wide file inventory.</p></div><div class="catalogue-count"><strong>${all.length}</strong><span>referenced artifacts</span></div></header><div class="source-filters" aria-label="Filter referenced artifacts"><button data-source-filter="ALL" class="${state.sourceFilter==='ALL'?'active':''}" aria-pressed="${state.sourceFilter==='ALL'}">All fields</button>${stages.map(s=>`<button data-source-filter="${s}" class="${state.sourceFilter===s?'active':''}" aria-pressed="${state.sourceFilter===s}">${esc(stageNames[s])}</button>`).join('')}</div><div class="artifact-list">${items.map(item=>`<button class="artifact-row" data-detail="${detail({title:item.artifact,artifactReferences:item.references})}"><span class="artifact-glyph">${icon('evidence')}</span><span class="artifact-name"><strong>${esc(item.artifact.split('/').pop())}</strong><small>${esc(item.artifact)}</small></span><span class="artifact-uses">${item.stages.map(s=>`<span>${esc(stageNames[s])}</span>`).join('')}</span><span class="artifact-open" aria-hidden="true">→</span></button>`).join('')||'<p class="empty-copy">No field-level artifact references are available.</p>'}</div></article>`;
  }
  function useStory(){
    const c=component('S2.project_use'),items=fieldItems(c);
    return `<article class="panel use-story"><header><p class="eyebrow">Project Use</p><h2>What role does<br> the evidence play?</h2></header><div class="use-branches">${items.map(({text,entry},i)=>`<div class="use-branch"><span class="branch-index">${String(i+1).padStart(2,'0')}</span><p>${esc(text)}</p>${badge(entry.metadata,entryContext(c,entry),true)}</div>`).join('')||'<p class="empty-copy">None recorded.</p>'}</div></article>`;
  }
  function routeStory(){
    const c=component('S3.construction_path'),routes=(c?.entries||[]).flatMap(e=>(e.content?.flows||[]).map(flow=>({flow,entry:e})));
    if(!routes.length)return `<article class="panel route-story"><div class="story-panel-heading"><h3>Construction Path</h3></div><div class="panel-body">${entries(c)}</div></article>`;
    state.routeIndex=Math.min(state.routeIndex,routes.length-1);const {flow,entry}=routes[state.routeIndex];
    return `<article class="panel route-story"><div class="story-panel-heading"><h3>${icon('construction')}Construction Path</h3><span class="small muted">${routes.length} recorded route${routes.length===1?'':'s'}</span></div><section class="route-surface tab-surface unified-surface">${surfaceFrame}<div class="story-tabs surface-tabs" role="tablist" aria-label="Construction routes">${routes.map(({flow:f},i)=>`<button role="tab" id="route-tab-${i}" aria-selected="${i===state.routeIndex}" aria-controls="route-panel" data-route-index="${i}" class="${i===state.routeIndex?'active':''}">${grid}<span>${esc(f.label||'Route '+(i+1))}</span></button>`).join('')}</div><div class="route-workspace" id="route-panel" role="tabpanel" aria-labelledby="route-tab-${state.routeIndex}"><ol class="route-timeline">${flow.nodes.map((text,i)=>`<li><span class="route-marker">${String(i+1).padStart(2,'0')}</span><p>${esc(text)}</p></li>`).join('')}</ol><aside class="route-guide">${icon('construction')}<h3>How do I read this path?</h3><p>Follow the numbered steps to see how the project prepares and transforms its inputs. Read from top to bottom${routes.length>1?'; use the tabs to inspect each separately described route':'. Each step is one operation in the reconstructed workflow'}.</p></aside></div>${(c?.entries||[]).some(e=>(e.content?.notes||e.content?.caveats||[]).length)?`<details class="route-notes"><summary>Scope and execution</summary>${(c.entries||[]).map(e=>(e.content?.notes||e.content?.caveats||[]).map(note=>`<p>${esc(note)}</p>`).join('')).join('')}</details>`:''}<div class="story-provenance"><span>Construction Path</span>${badge(entry.metadata,{...entryContext(c,entry),record:entry})}<span class="small muted">Status and references apply to the complete path.</span></div></section></article>`;
  }

  function changeStory(){const c=component('S3.material_changes'),items=fieldItems(c);return `<article class="panel change-story"><header><p class="eyebrow">Material Changes</p><h2>What changes<br> along the way?</h2></header><div class="change-ledger">${items.map(({text,entry},i)=>`<div class="change-entry"><span class="change-mark">${String(i+1).padStart(2,'0')}</span><p>${esc(text)}</p>${badge(entry.metadata,entryContext(c,entry),true)}</div>`).join('')||'<p class="empty-copy">None recorded.</p>'}</div></article>`;}
  function representationStory(){
    const c=component('S3.effective_representation'),items=fieldItems(c);
    state.representationIndex=Math.min(state.representationIndex,Math.max(0,items.length-1));const selected=items[state.representationIndex];
    return `<article class="panel representation-story"><header><p class="eyebrow">Effective Representation</p><h2>What does the<br> model receive?</h2></header><div class="representation-detail ${items.length>1?'tab-surface unified-surface':''}">${items.length>1?surfaceFrame:''}${items.length>1?`<div class="story-tabs surface-tabs" role="tablist" aria-label="Effective representations">${items.map((_,i)=>`<button role="tab" id="representation-tab-${i}" aria-selected="${i===state.representationIndex}" aria-controls="representation-panel" data-representation-index="${i}" class="${i===state.representationIndex?'active':''}">Representation ${i+1}</button>`).join('')}</div>`:''}<div id="representation-panel" ${items.length>1?`role="tabpanel" aria-labelledby="representation-tab-${state.representationIndex}"`:''}><span class="representation-glyph" aria-hidden="true">${grid}</span>${selected?`<p class="representation-copy">${esc(selected.text)}</p>${badge(selected.entry.metadata,entryContext(c,selected.entry))}`:'<p class="empty-copy">None recorded.</p>'}</div></div></article>`;
  }
  function learningStory(){
    const task=component('S4.learning_task'),approach=component('S4.learning_approach'),methods=approach?.entries||[];state.approachIndex=Math.min(state.approachIndex,Math.max(0,methods.length-1));const selected=methods[state.approachIndex];
    return `<article class="panel learning-story"><div class="learning-task"><p class="eyebrow">Learning Task</p><h2>What is it<br> learning to do?</h2>${entries(task)}</div><div class="learning-method"><div class="story-panel-heading"><h3>Learning Approach</h3></div><div class="learning-method-surface tab-surface unified-surface">${surfaceFrame}<div class="story-tabs surface-tabs" role="tablist" aria-label="Learning approaches">${methods.map((e,i)=>`<button role="tab" id="approach-tab-${i}" aria-selected="${i===state.approachIndex}" aria-controls="approach-panel" data-approach-index="${i}" class="${i===state.approachIndex?'active':''}">${esc(e.metadata?.label||'Approach '+(i+1))}</button>`).join('')}</div><div id="approach-panel" role="tabpanel" ${selected?`aria-labelledby="approach-tab-${state.approachIndex}"`:''}>${selected?`${content(selected.content)}${badge(selected.metadata,entryContext(approach,selected))}`:'<p class="empty-copy">None recorded.</p>'}</div></div></div></article>`;
  }
  function primaryStory(){
    const primary=component('S4.primary'),canonical=component('S4.canonical_explanation'),ce=canonical?.entries?.[0];
    return `<div class="primary-story"><article class="panel primary-capability"><p class="eyebrow">Primary Model or Capability</p>${(primary?.entries||[]).map(e=>`<h2>${esc(contentText(e.content))}</h2>${badge(e.metadata,entryContext(primary,e))}`).join('')||'<p class="empty-copy">Not available.</p>'}${primary?.explanation?`<div class="primary-rationale"><h3>${esc(primary.explanation.question)}</h3>${entries(primary.explanation)}</div>`:''}</article><article class="panel designation-card"><p class="eyebrow">Canonical Model Status</p><h2>Is one final model designated?</h2><div class="designation-result"><span class="eyebrow">Model designation</span><strong class="designation-answer">${esc(ce?.metadata?.answer||'Not available')}</strong></div>${entries(canonical)}</article></div>`;
  }
  function landscapeStory(){
    const c=component('S4.models'),models=c?.entries||[];if(!models.length)return `<article class="panel panel-body"><h2>Models or Capabilities</h2><p class="empty-copy">None recorded.</p></article>`;
    state.compareLeft=Math.min(state.compareLeft,models.length-1);state.compareRight=Math.min(state.compareRight,models.length-1);if(models.length>1&&state.compareRight===state.compareLeft)state.compareRight=(state.compareLeft+1)%models.length;
    const sides=models.length>1?['Left','Right']:['Left'];
    return `<article class="panel landscape-story"><header class="landscape-heading"><div><p class="eyebrow">Model landscape</p><h2>How do the models<br> or capabilities differ?</h2></div><span class="small muted">${models.length} recorded ${models.length===1?'entry':'entries'}</span></header><div class="model-comparison">${sides.map(side=>{const index=state['compare'+side],e=models[index];return `<article class="comparison-card">${models.length>1?`<label class="model-picker">${side==='Left'?'Compare':'With'}<select data-compare="${side}" aria-label="${side==='Left'?'First model or capability':'Second model or capability'}">${models.map((m,i)=>`<option value="${i}" ${index===i?'selected':''}>${esc(m.metadata?.label||'Entry '+(i+1))}</option>`).join('')}</select></label>`:''}<h3>${esc(e.metadata?.label||'Model or Capability')}</h3>${content(e.content)}${badge(e.metadata,entryContext(c,e))}</article>`;}).join('')}</div><details class="all-models"><summary>All models and capabilities <span>${models.length}</span></summary><div class="table-scroll"><table class="landscape-table"><thead><tr><th>Model or Capability</th><th>Role and Established State</th><th>Status</th></tr></thead><tbody>${models.map(e=>`<tr><td>${esc(e.metadata?.label||'Not available')}</td><td>${content(e.content)}</td><td>${badge(e.metadata,entryContext(c,e))}</td></tr>`).join('')}</tbody></table></div></details></article>`;
  }
  const evidenceTopics=[
    ['S2.evidence_scope','Evidence scope','What does it represent?'],
    ['S2.project_use','Project use','What role does the evidence play?'],
    ['S3.material_changes','Material changes','What changes along the way?'],
    ['S3.effective_representation','Model inputs','What does the model receive?']
  ];
  function evidenceQuestions(){
    state.evidenceTopic=Math.min(state.evidenceTopic,evidenceTopics.length-1);
    const [id,label,question]=evidenceTopics[state.evidenceTopic],c=component(id);
    const answerEntries=c?.entries||[];
    const answerStatuses=answerEntries.map((e,i)=>badge(e.metadata,{...entryContext(c,e),title:answerEntries.length>1?`${label} · ${e.metadata?.label||'Item '+(i+1)}`:label})).join('');
    const answerCopy=answerEntries.map(e=>`<div class="field-block">${content(e.content)}</div>`).join('')||'<p class="empty-copy">None recorded.</p>';
    return `<article class="panel evidence-questions"><div class="evidence-question-surface tab-surface unified-surface">${surfaceFrame}<div class="evidence-question-tabs surface-tabs" role="tablist" aria-label="Evidence questions">${evidenceTopics.map(([field,label,question],i)=>`<button id="evidence-topic-${i}" role="tab" aria-selected="${i===state.evidenceTopic}" tabindex="${i===state.evidenceTopic?0:-1}" aria-controls="evidence-answer" aria-label="${esc(question)}" title="${esc(question)}" data-evidence-topic="${i}" class="${i===state.evidenceTopic?'active':''}">${grid}<span>${esc(label)}</span></button>`).join('')}</div><div class="evidence-answer" id="evidence-answer" role="tabpanel" tabindex="0" aria-labelledby="evidence-topic-${state.evidenceTopic}"><header class="evidence-answer-heading"><h3>${esc(question)}</h3><div class="evidence-answer-statuses">${answerStatuses}</div></header>${answerCopy}</div></div></article>`;
  }
  function evidence(){return `<div class="evidence-opening"><div class="evidence-basis">${narrativeHero('What does it rest on?','S2.evidence_basis')}</div></div><div class="narrative-stack"><section class="evidence-context">${chapter('01','Evidence context','Understand the evidence.')}<div class="evidence-layout">${evidenceQuestions()}${shape(true)}</div></section><section>${chapter('02','Data Preview','Look at the available data.')}<article class="panel standalone-preview">${preview()}</article></section>${factRows()}${reconstructionNotes()}${artifactCatalogue()}</div>${callout('S2.evidence_gaps','Evidence Gaps',true)}${callout('S3.construction_gaps','Construction Gaps',true)}`;}

  function repositoryLink(a,menu=false){
    const url=a?.repository_url;
    const valid=typeof url==='string'&&/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(url);
    const glyph=menu?icon('repository'):'<img class="repository-external" src="/product_v2_0_1/assets/repository-external.svg" width="14" height="14" alt="" aria-hidden="true">';
    const label='<span>Repository Link</span>';
    if(!valid)return menu?`<button class="menu-item" disabled title="No repository URL is established">${glyph}${label}</button>`:'<span class="repository-unavailable" title="No repository URL is established">Repository unavailable</span>';
    return `<a class="${menu?'menu-item repository-menu-link':'repository-link'}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Repository Link (opens in a new tab)">${menu?glyph+label:label+glyph}</a>`;
  }
  function construction(){return `<div class="construction-opening"><article class="panel construction-hero-card">${narrativeHero('How is it<br> built?',component('S4.construction_intro')?.entries?.[0]?.decision==='REWRITE'?'S4.construction_intro':'S4.learning_task')}<ol class="construction-directory" aria-label="Construction chapters">${[['preparation','01','Preparation'],['representation','02','Representation'],['learning','03','Learning'],['landscape','04','Model landscape']].map(([,n,label])=>`<li><span class="construction-directory-number">${n}</span><span>${label}</span></li>`).join('')}</ol></article></div><div class="narrative-stack"><section id="chapter-preparation">${chapter('01','Preparation','How does the evidence become model-ready?')}${routeStory()}${changeStory()}</section><section id="chapter-representation">${chapter('02','Representation','Understand what reaches the learner.')}${representationStory()}${factRows(['S3'])}</section><section id="chapter-learning">${chapter('03','Learning','From inputs to learned capability.')}${learningStory()}</section><section id="chapter-landscape">${chapter('04','Model landscape','What is established at the end?')}${primaryStory()}${landscapeStory()}</section>${reconstructionNotes(['S3'])}</div>${callout('S3.construction_gaps','Construction Gaps',true)}${callout('S4.learning_gaps','Learning Gaps',true)}`;}
  function supervisorySignals(){
    const s=state.audit.passthrough?.S5||{},records=s.records||[],index=s.content?.signals||[];
    const rows=index.map(i=>({...i,...records.find(r=>r.signal_id===i.signal_id)})),outcomes=['SIGNAL','CLEAR','INSUFFICIENT EVIDENCE','NOT APPLICABLE'];
    const priority=outcome=>{const rank=outcomes.indexOf(outcome);return rank<0?outcomes.length:rank;};
    const orderedRows=rows.filter(r=>state.filter==='ALL'||r.outcome===state.filter).sort((a,b)=>{
      const first=priority(a.outcome),second=priority(b.outcome);
      if(first===outcomes.length||second===outcomes.length)return first-second;
      return (first-second)*(state.outcomeSort==='priority'?1:-1);
    });
    return `<article class="panel signals-overview"><div class="signals-question"><p class="eyebrow">Supervisory Signals</p><h2>What needs<br> closer review?</h2><p class="muted">${rows.length} recorded outcomes. These describe supervisory checks, not a model-quality score.</p></div><div class="outcome-summary" aria-label="Signal outcomes">${outcomes.map(outcome=>`<button data-filter="${outcome}" aria-pressed="${state.filter===outcome}" class="outcome-card ${cls(outcome)} ${state.filter===outcome?'active':''}"><strong>${rows.filter(r=>r.outcome===outcome).length}</strong><span>${outcome}</span><span class="outcome-dots" aria-hidden="true">${rows.map(r=>`<i class="${r.outcome===outcome?'on':''}"></i>`).join('')}</span></button>`).join('')}</div></article><section class="outcome-review"><header><h2>${state.filter==='ALL'?'All supervisory outcomes':esc(state.filter)}</h2><button data-filter="ALL" class="text-button" aria-pressed="${state.filter==='ALL'}">Show all ${rows.length} outcomes</button></header><div class="signal-table" role="table" aria-label="Supervisory outcomes"><div class="signal-table-head" role="row"><span role="columnheader">Check</span><span role="columnheader" class="outcome-sort-header" aria-sort="${state.outcomeSort==='priority'?'ascending':'descending'}"><button type="button" data-outcome-sort="toggle" class="outcome-sort ${state.outcomeSort==='priority'?'':'reversed'}" aria-label="Outcome: ${state.outcomeSort==='priority'?'Signal first. Sort Not applicable first':'Not applicable first. Sort Signal first'}" title="${state.outcomeSort==='priority'?'Signal → Clear → Insufficient evidence → Not applicable':'Not applicable → Insufficient evidence → Clear → Signal'}">Outcome <img src="/product_v2_0_1/assets/outcome-sort.svg" alt="" aria-hidden="true"></button></span><span role="columnheader">Explanation</span><span role="columnheader">Inspect</span></div><div class="signal-table-body">${orderedRows.map(r=>`<button class="signal-result-row" role="row" data-detail="${detail({title:r.name||r.signal_id,stage:'S5',record:r,context:'A signal outcome is a supervisory finding, not an epistemic status.'})}" aria-label="Inspect ${esc(r.name||r.signal_id)}: ${esc(r.outcome||'Outcome not available')}"><span role="cell" class="signal-result-check">${grid}<span>${esc(r.name||r.signal_id)}</span></span><span role="cell" class="signal-result-outcome"><span class="badge ${cls(r.outcome)}">${esc(r.outcome||'Not available')}</span></span><span role="cell" class="signal-result-explanation">${esc(r.explanation||r.applicability?.explanation||'Open the retained check to inspect the available detail.')}</span><span role="cell" class="signal-result-inspect">Inspect <span aria-hidden="true">→</span></span></button>`).join('')||'<p class="empty-copy">No recorded outcomes in this category.</p>'}</div></div></section>`;
  }
  function signals(){return supervisorySignals();}
  function auditPage() {
    const a=state.audit;const tab=['overview','evidence','construction','signals'].includes(state.section)?state.section:'overview';
    return `<header class="audit-heading"><p class="audit-identifier" title="${esc(a.id)}"><span>${esc(a.id.startsWith('audit_')?'Audit':a.id.replace('_Fresh',' · Fresh snapshot'))}</span><span aria-hidden="true">|</span>${repositoryLink(a)}</p><h1>${esc(a.title||a.id)}</h1><nav class="audit-tabs" aria-label="Audit sections">${[['overview','Overview'],['evidence','Evidence'],['construction','Construction'],['signals','Signals']].map(([s,l])=>`<a href="#audit/${encodeURIComponent(a.id)}/${s}" class="${tab===s?'active':''}" ${tab===s?'aria-current="page"':''}>${s==='overview'?grid:icon(s)}${l}</a>`).join('')}</nav></header>${a.publication?.status==='NOT_PUBLISHABLE'?'<section class="not-publishable"><h2>This audit is not publishable</h2><p>The audit did not establish a complete analytical result. Its status and limitations are preserved.</p></section>':''}${a.available===false?'<article class="panel panel-body"><h2>Not available</h2><p class="muted">No usable final output is available for this audit.</p></article>':tab==='evidence'?evidence():tab==='construction'?construction():tab==='signals'?signals():overview()}`;
  }
  async function request(path,data) {
    const r=await fetch(path,{cache:'no-store',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Probe-Token':token},body:JSON.stringify(data)})});
    let value={};try{value=await r.json();}catch(_){}
    if(!r.ok){
      const error=new Error(value.error||'The local request failed.');error.status=r.status;
      if(r.status===401&&state.auth.enabled&&!['/api/auth/login','/api/auth/session'].includes(path))expireSession();
      throw error;
    }
    return value;
  }
  function notify(message) {$('notice').textContent=message;$('notice').hidden=!message;}
  function clearPrivateState() {
    state.privateEpoch++;state.route++;state.drawerRequest++;state.audit=null;state.library=[];state.runtime=null;state.lastAudit=null;state.renderedId=null;state.details.clear();state.homePurposeCache={};state.homePurposeLoading.clear();state.homePurposeTask=null;state.lastProgress=null;state.search='';state.pending=false;state.drawerStack=[];state.drawerFocus=null;
    if($('main'))$('main').innerHTML='<p class="loading">Loading…</p>';if($('overlay'))$('overlay').hidden=true;['drawer-title','drawer-tools','drawer-body','notice'].forEach(id=>{if($(id))$(id).textContent='';});if($('notice'))$('notice').hidden=true;if($('app-shell'))$('app-shell').inert=false;document.body.classList.remove('drawer-open');
  }
  function expireSession() {
    if(!state.auth.enabled||!state.auth.authenticated)return;
    state.auth.authenticated=false;clearPrivateState();state.loginError='Your session ended. Log in to continue.';
    location.hash='login';
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('boveda-theme',theme);}catch(_){}
    const publicToggle=$('public-theme-toggle');if(publicToggle){const next=theme==='light'?'dark':'light';publicToggle.setAttribute('aria-label',`Use ${next} theme`);publicToggle.title=`Use ${next} theme`;}
  }
  function updateShell(page) {
    const publicMode=state.auth.enabled&&!state.auth.authenticated;
    document.body.classList.toggle('auth-public',publicMode);
    document.body.classList.toggle('auth-login',publicMode&&page==='login');
    $('global-menu').hidden=publicMode;
    $('public-login').hidden=!publicMode||page==='login';
    $('public-theme-toggle').hidden=!publicMode;
    const next=document.documentElement.dataset.theme==='light'?'dark':'light';$('public-theme-toggle').setAttribute('aria-label',`Use ${next} theme`);$('public-theme-toggle').title=`Use ${next} theme`;
    document.querySelectorAll('.brand-header,.rail,.footer').forEach(node=>node.inert=false);
  }
  function publicHome(login=false,focusPassword=false) {
    const error=state.loginError;
    $('main').innerHTML=`<div class="public-home-content"><section class="public-surface" aria-labelledby="public-home-title"><div class="public-tab">Welcome</div><h1 id="public-home-title">Auditable by design<span>.</span></h1><p class="public-intro">Bóveda turns the evidence data, ML and AI projects already leave behind into a clear, traceable record so the people responsible for them can understand what happened, ask the right questions, and follow every conclusion back to its source. <a href="#how-it-works">See how it works</a></p></section></div>${login?`<div class="login-backdrop"><section class="login-card" role="dialog" aria-modal="true" aria-labelledby="login-title" aria-describedby="login-description"><div class="login-tab"><span class="grid-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span><h1 id="login-title">Log In</h1></div><button id="login-close" class="login-close icon-button" type="button" aria-label="Close login" title="Close" ${state.loginPending?'disabled':''}><img src="/product/assets/close.svg" alt=""></button><form id="login-form" class="login-form"><p id="login-description">Enter your username and password to continue.</p><label class="sr-only" for="login-username">Username</label><input id="login-username" name="username" type="text" autocomplete="username" placeholder="User" value="${esc(state.loginUsername)}" required ${state.loginPending?'disabled':''}><label class="sr-only" for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Password" required ${state.loginPending?'disabled':''}><p id="login-error" class="login-error" role="alert" ${error?'':'hidden'}>${esc(error)}</p><button class="login-submit" type="submit" ${state.loginPending?'disabled':''}>${grid}<span>${state.loginPending?'Logging in…':'Login'}</span></button><label class="remember-control"><input id="login-remember" name="remember" type="checkbox" ${state.loginRemember?'checked':''} ${state.loginPending?'disabled':''}><span>Remember me</span></label></form></section></div>`:''}`;
    if(login){document.querySelector('.public-surface').inert=true;document.querySelectorAll('.brand-header,.rail,.footer').forEach(node=>node.inert=true);if(!state.loginPending)requestAnimationFrame(()=>(focusPassword?$('login-password'):$('login-username'))?.focus());}
  }
  function homePurposeText(audit) {
    const entry=audit?.components?.find(c=>c.field==='S1.core_purpose')?.entries?.[0],content=entry?.content;
    if(typeof content?.text==='string'&&content.text.trim())return content.text.trim();
    if(Array.isArray(content?.items)&&content.items.length)return content.items.join(' ').trim();
    return '';
  }
  async function loadHomePurposes() {
    if(state.libraryLayout!=='grid'||state.homePurposeTask)return;
    const epoch=state.privateEpoch;
    const excluded=new Set(['R10','R20']),targets=[...document.querySelectorAll('[data-home-purpose-id]')].map(node=>node.dataset.homePurposeId).filter(id=>{
      const audit=state.library.find(a=>a.id===id);
      return audit?.available===true&&!excluded.has(String(id).toUpperCase())&&!state.homePurposeCache[id]&&!state.homePurposeLoading.has(id);
    });
    if(!targets.length)return;
    targets.forEach(id=>state.homePurposeLoading.add(id));
    let cursor=0;
    const worker=async()=>{while(cursor<targets.length&&epoch===state.privateEpoch&&(!state.auth.enabled||state.auth.authenticated)){const id=targets[cursor++];try{const data=await request(`/api/audit?audit=${encodeURIComponent(id)}`),text=homePurposeText(data);if(epoch===state.privateEpoch)state.homePurposeCache[id]={status:data?.available===true&&text?'ready':data?.available===true?'missing':'unavailable',text:data?.available===true?(text||'Purpose not recorded.'):'Purpose unavailable.'};}catch(_){if(epoch===state.privateEpoch)state.homePurposeCache[id]={status:'error',text:'Purpose unavailable.'};}finally{state.homePurposeLoading.delete(id);}const cached=state.homePurposeCache[id];if(!cached)continue;document.querySelectorAll('[data-home-purpose-id]').forEach(node=>{if(node.dataset.homePurposeId===id){node.textContent=cached.text;node.dataset.homePurposeState=cached.status;}});}};
    state.homePurposeTask=Promise.all(Array.from({length:Math.min(4,targets.length)},worker)).finally(()=>{if(epoch===state.privateEpoch){state.homePurposeTask=null;loadHomePurposes();}});
    await state.homePurposeTask;
  }
  function drawHome() {
    const usable=state.library.filter(a=>a.available!==false&&!a.hidden),missing=state.library.filter(a=>a.available===false&&!a.hidden),shown=usable.filter(a=>(a.title+' '+a.id).toLowerCase().includes(state.search.toLowerCase()));
    const isGrid=state.libraryLayout==='grid';
    $('main').innerHTML=`<header class="home-heading"><div><h1>Your audits</h1><p>Understand what each project is for, how it works, and where its claims stop.</p></div>${state.auth.hostedDemo?'<button class="primary-button" disabled title="Create new audits in the local version">+ New audit</button>':'<a class="primary-button" href="#new">+ New audit</a>'}</header><div class="home-toolbar"><div class="project-search"><span class="search-icon" aria-hidden="true"></span><input id="project-search" type="search" placeholder="Find a project" aria-label="Find a project" value="${esc(state.search)}"></div><div class="home-toolbar-meta"><span class="small muted">${usable.length} available audits</span><div class="home-view-switch" role="group" aria-label="Audit layout"><button type="button" data-home-view="grid" aria-label="Grid view" title="Grid view" aria-pressed="${state.libraryLayout==='grid'}" class="${state.libraryLayout==='grid'?'active':''}">${grid}</button><button type="button" data-home-view="list" aria-label="List view" title="List view" aria-pressed="${state.libraryLayout==='list'}" class="${state.libraryLayout==='list'?'active':''}"><span class="list-icon" aria-hidden="true"><i></i><i></i><i></i></span></button></div></div></div><div class="project-grid ${state.libraryLayout==='list'?'project-list':''}" id="project-grid">${shown.map((a,i)=>{const href=`#audit/${encodeURIComponent(a.id)}/overview`,title=a.title||a.id,cached=state.homePurposeCache[a.id],purpose=cached?.text||(isGrid?'Loading purpose…':'');return `<article class="panel project-card" data-audit-href="${esc(href)}" tabindex="0" role="link" aria-label="Open audit ${esc(title)}"><span class="project-list-index" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><h2>${esc(title)}</h2><div class="card-top">${a.display_title&&!a.id.startsWith('audit_')?`<span class="project-identifier">${esc(a.id.replace('_Fresh',' · Fresh'))}</span>`:''}<span class="badge ${a.publication?.status==='PUBLISHABLE'?'documented':a.publication?.status==='NOT_PUBLISHABLE'?'unresolved':'interpreted'}">${esc(publicationLabel(a.publication?.status||a.status))}</span></div>${isGrid?`<p class="project-purpose" data-home-purpose-id="${esc(a.id)}" data-home-purpose-state="${cached?.status||'loading'}">${esc(purpose)}</p>`:`<p>${esc(a.subtitle || (a.editorial_mode==='CANONICAL'?'Canonical audit content':'Preserved audit · Ready to inspect'))}</p>`}<div class="card-bottom">${isGrid?'<span class="project-preserved">Preserved</span>':''}${state.auth.hostedDemo?'':`<button class="remove-button" data-remove="${esc(a.id)}" aria-label="Remove ${esc(title)} from library" title="Remove ${esc(title)} from library"><img src="/product_v2_0_1/assets/trash.svg" alt="" aria-hidden="true"></button>`}</div></article>`;}).join('')||'<p class="empty-copy">No audits match this search.</p>'}</div>${missing.length?`<details class="panel unavailable-projects"><summary>${missing.length} projects without a usable final view</summary><ul>${missing.map(a=>`<li><strong>${esc(a.id)}</strong> · ${esc(a.title||a.id)} — ${esc(a.reason||pretty(a.publication?.status||a.status))}</li>`).join('')}</ul></details>`:''}${!state.auth.hostedDemo&&state.library.some(a=>a.hidden)?'<p class="small muted"><button id="restore-library" class="text-button">Restore removed demo entries</button></p>':''}`;
    loadHomePurposes();
  }
  function drawNew() {
    if(state.auth.hostedDemo){$('main').innerHTML='<section class="panel new-audit"><div class="panel-body"><h1>Explore the preserved audits in this demo.</h1><div class="run-actions"><a class="primary-button" href="#home">Back to Library</a></div></div></section>';return;}
    const s=state.runtime||{},a=s.audit,disabled=s.busy||s.selecting||state.pending,started=a?.started;
    $('main').innerHTML=`<section class="panel new-audit"><div class="panel-body"><div class="new-audit-heading"><h1>Start with your project.</h1><button id="close-new-audit" class="close-new-audit" type="button" aria-label="Close new audit" title="Close new audit"><img src="/product/assets/close.svg" alt=""></button></div><p class="subtitle">Select a local folder. Bóveda will create a fresh audit and inspect the project from the beginning.</p><button id="browse-folder" class="secondary-button" ${disabled?'disabled':''}>${s.selecting?'Choosing folder…':'Browse'}</button>${a?`<div class="selected-folder"><small>Selected folder</small>${esc(a.selected_source)}</div><form id="run-audit-form"><div class="run-controls"><label>API spend guard (USD)<input id="spend-guard" type="number" min="0.01" step="0.01" required placeholder="e.g. 3.00" ${started?'disabled':''} value="${started?esc(a.max_recorded_cost_usd):esc(sessionStorage.getItem('boveda-spend')||'')}"></label><button class="primary-button" type="submit" ${disabled||started?'disabled':''}>${s.busy?'Audit running…':'Run audit'}</button></div><p class="small muted">Run audit starts real model/API calls. Selecting a folder does not run or open the project.</p></form>`:'<div class="selected-folder"><small>No folder selected</small>No audit has started.</div>'}${started?`<div class="run-status" role="status"><h3>${s.busy?'Audit in progress':s.result_verified?'Analytical work completed':'Audit stopped'}</h3><p class="muted">${esc(s.runtime?.status || s.phase)}${s.runtime?.stage?' · '+esc(s.runtime.stage):''}</p><div class="stage-track">${['S1','S2','S3','S4','Q1','Q2','S5','S6'].map(stage=>`<span class="${s.runtime?.stage===stage?'active':''}">${stage}</span>`).join('')}</div>${s.publication?`<p>${esc(pretty(s.publication.status))}</p>`:''}${a.error?`<p>${esc(a.error)}</p>`:''}${s.cost_usd!=null?`<p class="small muted">Recorded analytical usage: $${esc(num(s.cost_usd,6))}</p>`:''}${a.editorial?`<p class="small muted">Display copy: ${esc(pretty(a.editorial.status))}${a.editorial.cost_usd!=null?' · $'+esc(num(a.editorial.cost_usd,6)):''}</p>`:''}${a.q3?`<p class="small muted">Data Preview: ${esc(pretty(a.q3.status))} · $0 API</p>`:''}<div class="run-actions">${s.report_available?`<a class="primary-button" href="#audit/${encodeURIComponent(a.audit_id)}/overview">Open audit →</a>`:''}${s.artifacts_available?'<button class="secondary-button" id="open-artifacts">Open retained artifacts</button>':''}${!s.busy?'<button class="secondary-button" id="choose-next">Select another project</button>':''}</div></div>`:''}</div></section>`;
  }
  function howPage(){return `<section class="how-page"><h1>Understand before you trust.</h1><p>Bóveda reconstructs a project from its evidence, makes its analytical structure readable, and surfaces the questions that matter for supervision.</p><video controls preload="metadata" playsinline aria-label="Introduction to Bóveda"><source src="/intro.mp4" type="video/mp4">Your browser does not support this video.</video><div class="how-steps">${[['01','Overview','Understand the purpose.','Read purpose, data shape, performance and claim boundaries.'],['02','Evidence','Know what it rests on.','Explore the evidence, its uses, scope, data preview and retained sources.'],['03','Construction','Follow the work.','Trace preparation, representations, learning approaches and model roles.'],['04','Signals','Inspect what matters.','Review supervisory outcomes and open their supporting detail.']].map(([n,label,title,copy])=>`<article class="panel"><div class="field-label">${n} · ${label}</div><h2>${title}</h2><p>${copy}</p></article>`).join('')}</div></section>`;}
  function drawerSnapshot() {
    return {title:$('drawer-title').textContent,body:$('drawer-body').innerHTML,tools:$('drawer-tools').innerHTML,menu:$('drawer').classList.contains('menu-drawer'),scrollTop:$('drawer-body').scrollTop};
  }
  function setDrawerContent(title,body,menu=false,tools='') {
    $('drawer-title').textContent=title;$('drawer-body').innerHTML=body;$('drawer-tools').innerHTML=tools;$('drawer').classList.toggle('menu-drawer',menu);$('drawer-back').hidden=!state.drawerStack.length;
  }
  function openDrawer(title,body,menu=false,tools='') {
    if($('overlay').hidden){state.drawerFocus=document.activeElement;state.drawerStack=[];}setDrawerContent(title,body,menu,tools);$('overlay').hidden=false;$('app-shell').inert=true;document.body.classList.add('drawer-open');(state.drawerStack.length?$('drawer-back'):$('drawer-close')).focus();
  }
  function backDrawer() {
    const previous=state.drawerStack.pop();if(!previous)return;state.drawerRequest++;setDrawerContent(previous.title,previous.body,previous.menu,previous.tools);requestAnimationFrame(()=>{$('drawer-body').scrollTop=previous.scrollTop;$('drawer-back').hidden=!state.drawerStack.length;(state.drawerStack.length?$('drawer-back'):$('drawer-close')).focus();});
  }
  function closeDrawer() {state.drawerRequest++;state.drawerStack=[];$('overlay').hidden=true;$('app-shell').inert=false;document.body.classList.remove('drawer-open');if(state.drawerFocus?.isConnected)state.drawerFocus.focus();}
  function menu() {
    const a=state.audit,can=!!a?.canonical_available;
    openDrawer('Menu',`${a?`<button class="menu-item" data-detail="${detail({title:'Audit status',record:a.publication})}">${icon('info')}Audit status</button>`:''}${state.auth.hostedDemo?'':`<button class="menu-item" id="reanalyse" ${state.runtime?.busy?'disabled':''}>${icon('reanalyse')}Reanalyse</button>`}${can?`<a class="menu-item" href="/api/canonical?audit=${encodeURIComponent(a.id)}" download>${icon('download')}Download Report</a>`:`<button class="menu-item" disabled>${icon('download')}Download Report</button>`}${repositoryLink(a,true)}<button class="menu-item" disabled title="Sharing is not available in this local Alpha">${icon('share')}Share</button>${can?`<a class="menu-item" href="#raw/${encodeURIComponent(a.id)}">${grid}Canonical / raw output</a>`:''}${state.auth.enabled&&state.auth.authenticated?`<button class="menu-item logout-item" id="logout">${grid}Log out</button>`:''}`,true,`<div class="theme-switch">${icon('moon')}<button id="theme-toggle" role="switch" aria-label="Light theme" aria-checked="${document.documentElement.dataset.theme==='light'}"></button>${icon('sun')}</div>`);
  }
  function showDetail(d) {
    if(!d)return;
    const meta=d.metadata||{},refs=meta.evidence||d.record?.evidence||[];let body='';
    if(d.artifactReferences){
      const groups=Object.keys(stageNames).map(stage=>({stage,refs:d.artifactReferences.filter(r=>r.stage===stage)})).filter(g=>g.refs.length);
      body+=section('Referenced in the final audit','<p class="muted">Each reference retains its owning stage and source location.</p>');
      body+=groups.map(g=>section(stageNames[g.stage],g.refs.map(r=>`<button class="evidence-link" data-evidence="${esc(r.evidence_id||'')}" data-stage="${esc(g.stage)}" data-ref-detail="${detail({title:r.field,record:r})}"><strong>${esc(g.stage)} · ${esc(r.evidence_id||'Reference')}</strong><span>${esc(r.field)} · ${esc(r.location||'Location not available')}</span></button>`).join(''))).join('');
    }
    if(d.context)body+=section('Context',`<p class="muted">${esc(d.context)}</p>`);
    if(d.display_text)body+=section('Display copy',`<p>${esc(d.display_text)}</p>`);
    if(d.canonical_sources?.length)body+=section('Canonical source statements',d.canonical_sources.map(source=>`<div class="field-block"><h3>${esc(source.field)} · ${esc(pretty(source.status))}</h3><p>${esc(source.text)}</p>${(source.evidence||[]).map(ref=>`<button class="evidence-link" data-evidence="${esc(ref.evidence_id)}" data-stage="${esc(ref.stage||source.field.split('.')[0])}" data-ref-detail="${detail({title:source.field,record:ref})}"><strong>${esc(ref.evidence_id)}</strong><span>${esc(ref.artifact||'')} · ${esc(ref.location||'')}</span></button>`).join('')}</div>`).join(''));
    else if(d.canonical_text!==undefined)body+=section('Canonical content',`<p>${esc(d.canonical_text)}</p>`);
    if(meta.status)body+=section('Epistemic status',`<span class="badge ${cls(meta.status)}">${esc(meta.status)}</span>`);
    if(d.record)body+=section('Preserved detail',renderRecord(d.record));
    if(d.decision)body+=section('Presentation',`<p class="small muted">${esc(d.decision)} · The canonical result remains authoritative.</p>`);
    if(refs.length)body+=section('Evidence references',refs.map(r=>`<button class="evidence-link" data-evidence="${esc(r.evidence_id)}" data-stage="${esc(r.stage||d.stage||'')}" data-ref-detail="${detail({title:r.evidence_id,record:r})}"><strong>${esc(r.evidence_id)}</strong><span>${esc(r.artifact||'')} · ${esc(r.location||'')}</span></button>`).join(''));
    else if(d.stage&&d.stage!=='Q3')body+=section('Evidence references','<p class="small muted">No field-level evidence reference is available in this retained detail.</p>');
    if(d.pointer)body+=section('Field identity',`<p class="small muted">${esc(d.stage)} · ${esc(d.pointer)}</p>`);
    openDrawer(d.title||'Details',body||'<p>Not available.</p>');
  }
  function renderRecord(record) {
    if(record?.evidence_id)return `<h3>Source</h3><p>${esc(record.artifact||'Not available')}</p><p class="small muted">${esc(record.location||'Location not available')}</p>${record.excerpt?`<h3>Preserved excerpt</h3><pre>${esc(record.excerpt)}</pre>`:''}<details><summary>Identity and structured detail</summary>${json(record)}</details>`;
    if(record?.signal_id)return `<div class="field-label"><span class="badge ${cls(record.outcome)}">${esc(record.outcome)}</span><span>${esc(record.signal_id)}</span></div>${record.applicability?`<h3>Applicability · ${esc(record.applicability.status||'')}</h3><p>${esc(record.applicability.explanation||'')}</p>`:''}<h3>Why this outcome occurred</h3><p>${esc(record.explanation||'Not available')}</p><details><summary>Structured detail and trails</summary>${json(record)}</details>`;
    return json(record);
  }
  async function showEvidence(id,stage,fallback) {
    if(!$('overlay').hidden)state.drawerStack.push(drawerSnapshot());
    const requestSeq=++state.drawerRequest;
    showDetail({title:id,stage,record:fallback?.record,context:'Loading the preserved evidence detail…'});
    try{const record=await request(`/api/evidence?audit=${encodeURIComponent(state.audit.id)}&stage=${encodeURIComponent(stage)}&evidence=${encodeURIComponent(id)}`);if(requestSeq===state.drawerRequest)showDetail({title:`${stage} · ${id}`,record,context:'Preserved audit evidence. The original project is not executed or opened.'});}
    catch(error){if(requestSeq===state.drawerRequest)showDetail({title:id,record:fallback?.record,context:'The retained reference is shown below. Additional evidence detail is not available for this scope.'});}
  }
  async function navigate() {
    const seq=++state.route;closeDrawer();const parts=location.hash.slice(1).split('/'),page=parts[0]||'home';
    if(page==='login'&&state.loginFocus===null)state.loginFocus=document.activeElement;
    const returnFocus=page!=='login'?state.loginFocus:null;
    if(page!=='login'&&document.body.dataset.page==='login')state.loginError='';
    if(page==='audit' && document.body.dataset.page==='audit' && state.auth.authenticated && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      await $('main').animate([{opacity:1},{opacity:0}],{duration:100}).finished.catch(()=>{});
      if(seq!==state.route)return;
    }
    updateShell(page);document.body.dataset.page=page;
    document.querySelectorAll('.rail a').forEach(a=>{const active=a.dataset.page===(page==='raw'?'audit':page==='new'||page==='login'?'home':page);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    $('main').innerHTML='<p class="loading">Loading…</p>';
    try{
      if(state.auth.enabled&&!state.auth.authenticated){
        if(page==='home'){state.audit=null;publicHome();}
        else if(page==='login'){state.audit=null;publicHome(true);}
        else if(page==='how-it-works'){state.audit=null;$('main').innerHTML=howPage();}
        else{location.hash='login';return;}
      }
      else if(page==='login'){location.hash='home';return;}
      else if(page==='home'){state.audit=null;const data=await request('/api/library');if(seq!==state.route)return;state.library=Array.isArray(data)?data:data.audits||[];drawHome();}
      else if(page==='new'){state.audit=null;if(state.auth.hostedDemo){drawNew();}else{const runtime=await request('/api/state');if(seq!==state.route)return;state.runtime=runtime;drawNew();}}
      else if(page==='how-it-works'){state.audit=null;$('main').innerHTML=howPage();}
      else if(page==='audit'||page==='raw'){
        const id=parts[1]?decodeURIComponent(parts[1]):state.lastAudit;
        if(!id){location.hash='home';return;}
        state.lastAudit=id;const data=await request('/api/audit?audit='+encodeURIComponent(id));if(seq!==state.route)return;
        state.audit=data;state.section=parts[2]||'overview';state.details.clear();state.counter=0;
        if(page==='raw'){
          const r=await fetch('/api/canonical?audit='+encodeURIComponent(id));if(r.status===401&&state.auth.enabled)expireSession();if(!r.ok)throw new Error('Canonical report is not available.');const markdown=await r.text();if(seq!==state.route)return;
          $('main').innerHTML=`<div class="raw-toolbar"><div><h1>Canonical output</h1><p class="muted">${esc(data.title||id)}</p></div><a class="secondary-button" href="#audit/${encodeURIComponent(id)}/overview">Back to audit</a></div><div class="raw-report" id="raw-report"></div>`;renderCanonicalMarkdown(markdown,$('raw-report'));
        }else{if(id!==state.renderedId){state.model=0;state.metric=null;state.view=0;state.filter='ALL';state.outcomeSort='priority';state.sourceFilter='ALL';state.routeIndex=0;state.representationIndex=0;state.approachIndex=0;state.evidenceTopic=0;state.compareLeft=0;state.compareRight=1;state.renderedId=id;}drawAudit();}
      }else{location.hash='home';return;}
      window.scrollTo({top:0,behavior:'instant'});
      if(returnFocus){state.loginFocus=null;requestAnimationFrame(()=>{if(returnFocus.isConnected&&returnFocus.getClientRects().length)returnFocus.focus();});}
    }catch(error){if(seq===state.route&&(!state.auth.enabled||state.auth.authenticated))$('main').innerHTML=`<div class="error-panel"><h2>This view is not available.</h2><p>${esc(error.message)}</p><a class="text-button" href="#home">Return Home →</a></div>`;}
  }
  function drawAudit(scope){
    if(scope){
      const current=[...document.querySelectorAll(scope)];
      if(current.length){
        const template=document.createElement('template');template.innerHTML=auditPage();
        const next=[...template.content.querySelectorAll(scope)],y=window.scrollY;
        if(next.length===current.length){
          current.forEach((node,i)=>{
            const open=[...node.querySelectorAll('details')].map(d=>d.open);
            node.dataset.localUpdate='true';
            node.replaceChildren(...next[i].childNodes);
            node.querySelectorAll('details').forEach((d,j)=>{if(open[j]!==undefined)d.open=open[j];});
          });
          requestAnimationFrame(syncPerformanceShape);window.scrollTo({top:y,behavior:'instant'});return;
        }
      }
    }
    const y=window.scrollY;$('main').innerHTML=auditPage();document.querySelectorAll('.model-tabs [aria-selected="true"],.surface-tabs [aria-selected="true"]').forEach(tab=>tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));requestAnimationFrame(syncPerformanceShape);window.scrollTo({top:y,behavior:'instant'});}
  window.addEventListener('resize',()=>requestAnimationFrame(syncPerformanceShape));
  async function action(path,payload){if(state.auth.hostedDemo&&['/api/browse','/api/run','/api/library/remove','/api/library/restore'].includes(path))return null;const epoch=state.privateEpoch;state.pending=true;notify('');try{const result=await request(path,payload);if(epoch!==state.privateEpoch)return null;state.runtime=result.audit!==undefined?result:state.runtime;return result;}catch(error){if(epoch===state.privateEpoch)notify(error.message);return null;}finally{if(epoch===state.privateEpoch){state.pending=false;if((!state.auth.enabled||state.auth.authenticated)&&location.hash==='#new')drawNew();}}}
  document.addEventListener('click',async event=>{
    const card=event.target.closest('.project-card[data-audit-href]');
    if(card&&!event.target.closest('a,button,input,select,textarea,summary,[data-detail]')){
      const selection=window.getSelection?.();
      if(!selection||selection.isCollapsed||!selection.toString().trim())location.hash=card.dataset.auditHref.slice(1);
      return;
    }
    const el=event.target.closest('button,a');if(!el)return;
    if(el.classList.contains('skip-link')){event.preventDefault();$('main').focus();return;}
    if(el.dataset.homeView){const layout=el.dataset.homeView==='list'?'list':'grid';state.libraryLayout=layout;try{localStorage.setItem('boveda-library-layout',layout);}catch(_){}drawHome();document.querySelector(`[data-home-view="${layout}"]`)?.focus();return;}
    if(el.dataset.detail){showDetail(state.details.get(el.dataset.detail));return;}
    if(el.dataset.evidence){showEvidence(el.dataset.evidence,el.dataset.stage,state.details.get(el.dataset.refDetail));return;}
    if(el.dataset.model!==undefined){state.model=Number(el.dataset.model);state.metric=null;drawAudit('.performance');document.getElementById('model-tab-'+state.model)?.focus();return;}
    if(el.dataset.metric!==undefined){state.metric=Number(el.dataset.metric);drawAudit('.performance');document.querySelector(`[data-metric="${state.metric}"]`)?.focus();return;}
    if(el.dataset.sourceFilter){state.sourceFilter=el.dataset.sourceFilter;drawAudit('.artifact-catalogue');document.querySelector(`[data-source-filter="${state.sourceFilter}"]`)?.focus();return;}
    for(const [data,key,prefix] of [['routeIndex','routeIndex','route-tab-'],['representationIndex','representationIndex','representation-tab-'],['approachIndex','approachIndex','approach-tab-']]){
      if(el.dataset[data]!==undefined){state[key]=Number(el.dataset[data]);drawAudit({routeIndex:'.route-surface',representationIndex:'.representation-detail',approachIndex:'.learning-method-surface'}[key]);$(prefix+state[key])?.focus();return;}
    }
    if(el.dataset.evidenceTopic!==undefined){state.evidenceTopic=Number(el.dataset.evidenceTopic);drawAudit('.evidence-questions');$('evidence-topic-'+state.evidenceTopic)?.focus();return;}
    if(el.dataset.chapter){document.getElementById('chapter-'+el.dataset.chapter)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
    if(el.dataset.outcomeSort){state.outcomeSort=state.outcomeSort==='priority'?'reverse':'priority';drawAudit('.outcome-review');document.querySelector('[data-outcome-sort]')?.focus();return;}
    if(el.dataset.filter){state.filter=el.dataset.filter;drawAudit('.outcome-review,.outcome-summary');document.querySelector(`[data-filter="${state.filter}"]`)?.focus();return;}
    if(el.dataset.remove){const id=el.dataset.remove;openDrawer('Remove audit from library',`<p>This removes ${esc(id)} from this library. Preserved analytical files remain intact.</p><div class="run-actions"><button class="primary-button" data-confirm-remove="${esc(id)}">Remove from library</button><button class="secondary-button" id="cancel-remove">Keep audit</button></div>`);return;}
    if(el.dataset.confirmRemove){const id=el.dataset.confirmRemove;const result=await action('/api/library/remove',{audit_id:id});if(result){closeDrawer();await navigate();notify('Audit removed from the library. Preserved files remain intact.');}return;}
    if(el.id==='restore-library'){for(const a of state.library.filter(a=>a.hidden))await action('/api/library/restore',{audit_id:a.id});await navigate();return;}
    if(el.id==='global-menu'){menu();return;}
    if(el.id==='drawer-back'){backDrawer();return;}
    if(el.id==='drawer-close'||el.id==='cancel-remove'){closeDrawer();return;}
    if(el.id==='close-new-audit'){location.hash='home';return;}
    if(el.id==='theme-toggle'){const t=document.documentElement.dataset.theme==='light'?'dark':'light';setTheme(t);el.setAttribute('aria-checked',t==='light');return;}
    if(el.id==='public-theme-toggle'){setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');return;}
    if(el.id==='login-close'){location.hash='home';return;}
    if(el.id==='logout'){
      if(state.pending)return;state.pending=true;el.disabled=true;notify('');
      try{await request('/api/auth/logout',{});state.auth.authenticated=false;clearPrivateState();closeDrawer();location.hash='home';await navigate();}
      catch(error){notify(error.message||'Log out failed. Please try again.');el.disabled=false;}
      finally{state.pending=false;}
      return;
    }
    if(el.id==='reanalyse'){closeDrawer();location.hash='new';notify('Select the project folder again to start a new audit.');return;}
    if(el.id==='browse-folder'||el.id==='choose-next'){el.disabled=true;await action('/api/browse',{});return;}
    if(el.id==='open-artifacts'){await action('/api/artifacts',{audit_id:state.runtime.audit.audit_id});return;}
  });
  document.addEventListener('change',event=>{
    if(event.target.dataset.compare){const side=event.target.dataset.compare,other=side==='Left'?'Right':'Left',before=state['compare'+side];state['compare'+side]=Number(event.target.value);if(state['compare'+other]===state['compare'+side])state['compare'+other]=before;drawAudit('.model-comparison');document.querySelector(`[data-compare="${side}"]`)?.focus();return;}
if(event.target.id==='preview-select'){state.view=Number(event.target.value);drawAudit('.standalone-preview,.evidence-preview');$('preview-select')?.focus();}});
  document.addEventListener('input',event=>{if(event.target.id==='project-search'){const pos=event.target.selectionStart;state.search=event.target.value;drawHome();$('project-search').focus();try{$('project-search').setSelectionRange(pos,pos);}catch(_){};}if(event.target.id==='spend-guard')sessionStorage.setItem('boveda-spend',event.target.value);});
  document.addEventListener('submit',async event=>{
    if(event.target.id==='login-form'){
      event.preventDefault();if(state.loginPending)return;
      const form=event.target,username=form.elements.username.value,password=form.elements.password.value,remember=form.elements.remember.checked;state.loginUsername=username;state.loginRemember=remember;
      state.loginPending=true;state.loginError='';publicHome(true);
      try{await request('/api/auth/login',{username,password,remember});state.auth.authenticated=true;state.loginPending=false;state.loginError='';state.loginUsername='';state.loginFocus=null;location.hash='home';}
      catch(error){state.loginPending=false;state.loginError=error.status===401?'The username or password is incorrect.':error.status===429?(error.message||'Too many attempts. Please wait and try again.'):error.status===503?'Login is temporarily unavailable. Please try again later.':(error.message||'Login failed. Please try again.');if(location.hash==='#login')publicHome(true,true);}
      return;
    }
    if(event.target.id!=='run-audit-form')return;event.preventDefault();if(state.auth.hostedDemo||state.pending||state.runtime?.busy)return;const value=Number($('spend-guard').value);if(!Number.isFinite(value)||value<=0)return;event.target.querySelector('button[type=submit]').disabled=true;await action('/api/run',{audit_id:state.runtime.audit.audit_id,max_recorded_cost_usd:value});
  });
  $('overlay').addEventListener('click',event=>{if(event.target===$('overlay'))closeDrawer();});
  document.addEventListener('keydown',event=>{
    const loginCard=document.querySelector('.login-card');
    if(loginCard){
      if(event.key==='Escape'){event.preventDefault();location.hash='home';return;}
      if(event.key==='Tab'){
        const nodes=[...loginCard.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(x=>x.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];
        if(!nodes.length){event.preventDefault();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
      return;
    }
    const card=event.target.closest?.('.project-card[data-audit-href]');
    if(card&&!event.target.closest('a,button,input,select,textarea,summary')&&['Enter',' '].includes(event.key)){event.preventDefault();location.hash=card.dataset.auditHref.slice(1);return;}
    if($('overlay').hidden&&event.target.closest('[data-evidence-topic]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?evidenceTopics.length-1:(state.evidenceTopic+(event.key==='ArrowRight'?1:evidenceTopics.length-1))%evidenceTopics.length;document.getElementById('evidence-topic-'+next)?.click();return;}
    if($('overlay').hidden&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      for(const attr of ['data-route-index','data-representation-index','data-approach-index']){const tab=event.target.closest('['+attr+']');if(!tab)continue;event.preventDefault();const tabs=[...document.querySelectorAll('['+attr+']')],index=tabs.indexOf(tab);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next]?.click();return;}
    }

    if($('overlay').hidden){const tab=event.target.closest('[data-model]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=[...document.querySelectorAll('[data-model]')];let next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(Number(tab.dataset.model)+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next]?.click();}return;}if(event.key==='Escape'){closeDrawer();return;}if(event.key!=='Tab')return;
    const nodes=[...$('drawer').querySelectorAll('a[href],button:not(:disabled),input,select,summary,[tabindex="0"]')].filter(x=>!x.hidden&&x.getClientRects().length);if(!nodes.length){event.preventDefault();return;}const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  async function poll(){if(state.auth.hostedDemo){setTimeout(async()=>{await refreshSession(false);poll();},30000);return;}if(!state.sessionChecking&&(!state.auth.enabled||state.auth.authenticated)){const epoch=state.privateEpoch;try{const r=await request('/api/state');if(epoch!==state.privateEpoch){setTimeout(poll,1500);return;}state.runtime=r;if(location.hash==='#new'&&!state.pending){const k=JSON.stringify([r.phase,r.busy,r.selecting,r.audit?.audit_id,r.runtime?.stage,r.runtime?.status,r.publication?.status,r.audit?.editorial?.status,r.audit?.q3?.status,r.report_available]);if(k!==state.lastProgress&&(!document.activeElement?.closest('#run-audit-form')||r.busy||r.audit?.started)){state.lastProgress=k;drawNew();}}}catch(_){if(location.hash==='#new'&&state.auth.authenticated){notify('The local runtime is unreachable. Execution status is unknown.');const run=document.querySelector('#run-audit-form button');if(run)run.disabled=true;}}}setTimeout(poll,1500);}
  try{document.documentElement.dataset.theme=localStorage.getItem('boveda-theme')||'light';const savedLayout=localStorage.getItem('boveda-library-layout');if(savedLayout==='grid'||savedLayout==='list')state.libraryLayout=savedLayout;}catch(_){}
  window.addEventListener('hashchange',navigate);
  window.BovedaProduct={contentText,num,metricVisual};
  let sessionRefresh=null;
  async function refreshSession(forceNavigate=false){
    if(!state.auth.ready)return;if(sessionRefresh)return sessionRefresh;
    state.sessionChecking=true;
    // Only shield a page restored from browser history, never a background check.
    if(forceNavigate)document.body.classList.add('session-rechecking');
    sessionRefresh=(async()=>{
      try{
        const session=await request('/api/auth/session'),next={ready:true,enabled:!!session.enabled,authenticated:!!session.authenticated,hostedDemo:hostedSession(session)};
        const changed=next.enabled!==state.auth.enabled||next.authenticated!==state.auth.authenticated||next.hostedDemo!==state.auth.hostedDemo;
        if((state.auth.enabled&&state.auth.authenticated&&next.enabled&&!next.authenticated)||(!state.auth.hostedDemo&&next.hostedDemo))clearPrivateState();
        state.auth=next;
        if(changed||forceNavigate)await navigate();
      }catch(_){
        if(state.auth.enabled){state.auth.authenticated=false;clearPrivateState();state.loginError='Bóveda could not verify this session. Log in again to continue.';if(location.hash==='#login')await navigate();else location.hash='login';}
      }finally{state.sessionChecking=false;sessionRefresh=null;document.body.classList.remove('session-rechecking');}
    })();
    return sessionRefresh;
  }
  window.addEventListener('pageshow',event=>{if(event.persisted)refreshSession(true);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSession(false);});
  async function boot(){
    try{const session=await request('/api/auth/session');state.auth={ready:true,enabled:!!session.enabled,authenticated:!!session.authenticated,hostedDemo:hostedSession(session)};}
    catch(_){state.auth={ready:true,enabled:true,authenticated:false,hostedDemo:false};state.loginError='Bóveda could not check this session. Please try again.';}
    await navigate();poll();
  }
  // Animate presentation only; final values and evidence remain untouched.
  function installMotion(){
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'),seen=new WeakSet();
    const selector='.panel,.public-surface,.login-card,.chapter-heading,.home-heading,.confidence-dimensions,.panel-body,.evidence-answer,.metric-inner,.unified-surface,.preview-layer,.preview-data-layer,.login-form';
    const observer=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{
      if(!isIntersecting)return;
      observer.unobserve(target);
      if(reduced.matches||!target.isConnected)return;
      let depth=0,parent=target.parentElement;
      while(parent&&parent!==$('main')){if(parent.matches(selector))depth++;parent=parent.parentElement;}
      const layered=depth>0;
      target.animate([{opacity:0,transform:`translateY(${layered?14:22}px)`},{opacity:1,transform:'translateY(0)'}],
        {duration:420,delay:Math.min(depth*75,225),easing:'cubic-bezier(.22,.7,.25,1)',fill:'backwards'});
      if(target.matches('.confidence-dimensions')){
        target.querySelectorAll('.ticks').forEach((ticks,row)=>{
          const gray=document.documentElement.dataset.theme==='light'?'#d5d7d9':'#3b434d';
          ticks.querySelectorAll('i.on').forEach((tick,index)=>{
            const color=getComputedStyle(tick).backgroundColor;
            tick.animate([{backgroundColor:gray==='rgba(0, 0, 0, 0)'?'#d5d7d9':gray},{backgroundColor:color}],
              {duration:180,delay:180+row*65+index*65,fill:'backwards'});
          });
        });
      }
    }),{threshold:0,rootMargin:'0px 0px -12px 0px'});
    function scan(root){
      if(root.closest?.('[data-local-update]'))return;
      const nodes=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
      nodes.forEach(node=>{if(!seen.has(node)){seen.add(node);observer.observe(node);}});
    }
    new MutationObserver(records=>{
      records.forEach(record=>record.removedNodes.forEach(node=>{
        if(node.nodeType===1){observer.unobserve(node);node.querySelectorAll(selector).forEach(child=>observer.unobserve(child));}
      }));
      records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node);}));
    }).observe($('main'),{childList:true,subtree:true});
    reduced.addEventListener('change',()=>{if(reduced.matches)document.getAnimations().forEach(animation=>animation.finish());});
    scan($('main'));
  }
  installMotion();
  boot();
})();
