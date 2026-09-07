/* Deterministic presentation of retained metrics. No canonical value is mutated. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BovedaMetricDisplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const numeric = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
  const scalarRE = new RegExp(`^(${numeric})\\s*(%)?$`, 'i');
  const rangeRE = new RegExp(`^(${numeric})\\s*[–—-]\\s*(${numeric})\\s*(%)?$`, 'i');
  const unitless = unit => /^(?:|[-—]|ratio|fraction|proportion|accuracy proportion|unitless|dimensionless|0[–-]1)$/i.test(unit);
  const percent = unit => /^(?:%|percent(?:age)?|pct)$/i.test(unit);
  const nameKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[_./^()-]+/g, ' ');

  function label(metric = {}) {
    const original = String(metric.label || 'Metric');
    const clean = original.replace(/_/g, ' ').replace(/\bR(?:\^?2|[- ]squared)\b/gi, 'R²');
    if (clean.length <= 38) return {title: clean, context: ''};
    const key = nameKey(original);
    let title = 'Reported result';
    if (/\b(?:code label|artifact.*labeled)\b/.test(key)) title = 'Reported score';
    else if (/\baverage error\b/.test(key)) title = 'Average error';
    else if (/\bpercent error\b/.test(key)) title = 'Percent error';
    else if (/\baverage precision\b/.test(key)) title = 'Average precision';
    else if (/\brmse\b/.test(key) && /\bmae\b/.test(key)) title = 'Error measures';
    else if (/\brmse\b/.test(key)) title = 'RMSE';
    else if (/\b(?:rank|ranked|ranking|placement)\b/.test(key)) title = 'Comparative ranking';
    else if (/\baccuracy\b/.test(key)) title = 'Accuracy';
    else if (/\b(?:f1|f 1)\b/.test(key)) title = 'F1 score';
    else if (/\bprecision\b/.test(key)) title = 'Precision';
    else if (/\brecall\b/.test(key)) title = 'Recall';
    return {title, context: clean};
  }
  function describe(metric = {}) {
    const raw = metric.value, originalUnit = String(metric.unit || '').trim();
    let value = raw, unit = originalUnit, qualifier = '', detail = '', explicitPercent = false;
    const missing = raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim()) ||
      (typeof raw === 'number' && !Number.isFinite(raw));
    const result = {kind: missing ? 'missing' : 'number', value: missing ? null : raw,
      unit: unitless(unit) ? '' : unit, fraction: null, note: unit ? 'Recorded value and unit.' : 'Unit not recorded.',
      converted: false, qualifier, detail, range: null, parts: null, visual: null, ...label(metric)};
    if (missing) return {...result, note: 'Value not available.'};
    let name = nameKey(metric.label);
    if (typeof raw === 'string') {
      let text = raw.trim();
      const prefix = text.match(/^(about|approximately|approx\.?|around|almost|nearly|[~≈])\s*/i);
      if (prefix) {
        qualifier = /^(almost|nearly)$/i.test(prefix[1]) ? prefix[1][0].toUpperCase()+prefix[1].slice(1) : '≈';
        text = text.slice(prefix[0].length);
      }
      // A pair is only interpreted when the label explicitly identifies its uncertainty.
      const pair = text.match(new RegExp(`^(${numeric})\\s*\\((${numeric})\\)$`, 'i'));
      const uncertaintyLabel = String(metric.label || '').match(/\((SE|SD|SEM)\)\s*$/i);
      if (pair && uncertaintyLabel) {
        value = Number(pair[1]); detail = `${uncertaintyLabel[1].toUpperCase()} ${pair[2]}`;
        name = name.replace(/\b(?:se|sd|sem)\s*$/, '');
      } else {
        const single = text.match(scalarRE), range = text.match(rangeRE);
        if (single) {
          if (single[2] && unit && !percent(unit)) return {...result, kind:'text'};
          value = Number(single[1]); if(single[2]) { unit = '%'; explicitPercent = true; }
        } else if (range) {
          if (range[3] && unit && !percent(unit)) return {...result,kind:'text'};
          const low=Number(range[1]),high=Number(range[2]);if(low>high)return {...result,kind:'text'};
          if (range[3]) { unit = '%'; explicitPercent = true; }
          const bounded=/\b(?:accuracy|precision|recall|specificity|sensitivity|f1|f2|auc|auroc|auprc|share|proportion|fraction|coverage|confidence)\b/.test(name);
          const uncertainty=/\b(?:sd|std|stdev|sem|variance|uncertainty|error|deviation|interval|ci|bound)\b/.test(name);
          const ratio=!uncertainty&&bounded&&percent(unit)&&low>=0&&high<=100;
          return {...result,kind:'range',value:null,range:ratio?[low/100,high/100]:[low,high],
            unit:ratio?'0–1':unit,qualifier,converted:ratio,
            visual:ratio?{type:'fill',min:0,max:1,low:low/100,high:high/100}:null,
            note:ratio?(qualifier?'Approximate reported range expressed as proportions.':'Reported range expressed as proportions.'):(qualifier?'Approximate reported range.':'Reported range.')};
        } else {
          const values=text.split(/\s*\/\s*/),units=unit.split(/\s*\/\s*/);
          const tail=String(metric.label||'').split(/\s+[—–]\s+/).pop(),names=tail.split(/\s*\/\s*/);
          if(values.length>1&&values.length===units.length&&values.length===names.length&&values.every(v=>scalarRE.test(v))) {
            return {...result,kind:'group',parts:values.map((v,i)=>({label:names[i],value:v,unit:unitless(units[i])?'':units[i]})),note:'Recorded measures and units.'};
          }
          return {...result,kind:/^\d+(?:st|nd|rd|th)$/i.test(text)?'ordinal':'text',unit:unitless(unit)?'':unit,note:'Reported outcome.'};
        }
      }
    }
    if (typeof value!=='number'||!Number.isFinite(value)) return {...result,kind:'text'};
    const isUncertainty=/\b(?:sd|std|stdev|sem|variance|uncertainty|error|deviation)\b/.test(name)||
      (/\b(?:interval|ci|bound)\b/.test(name)&&!/\bcoverage\b/.test(name));
    const bounded=/\b(?:accuracy|precision|recall|specificity|sensitivity|f1|f2|auc|auroc|auprc|share|proportion|fraction|coverage|confidence|brier score|p\s*val(?:ue)?)\b/.test(name)||/\bf\s+[12]\b/.test(name)||/accuracy proportion/i.test(unit)||(explicitPercent&&/\bhouseholds?\b.*\bnone\b/.test(name));
    const rSquared=/\br\s*(?:2|squared)\b/.test(name);
    const silhouette=/\bsilhouette score\b/.test(name);
    const base={...result,value,unit:unitless(unit)?'':unit,qualifier,detail,
      note:qualifier==='≈'?'Approximate reported value.':result.note};
    // Directional approximations remain qualified. An explicit percent sign alone
    // does not establish that the metric is bounded to a 0–1 scale.
    if(qualifier&&qualifier!=='≈'&&!explicitPercent) {
      const reported=String(raw).trim().replace(/[.]+$/,'').replace(/^./,c=>c.toUpperCase());
      return {...base,kind:'qualified',note:`${reported}.`};
    }
    if(!isUncertainty&&percent(unit)&&value>=0&&value<=100&&bounded) {
      const fraction=value/100;
      return {...base,kind:'ratio',value:fraction,fraction,unit:'0–1',converted:true,
        visual:{type:'fill',min:0,max:1,low:fraction,high:fraction},
        note:`${qualifier==='≈'?'Approximately ':qualifier?qualifier+' ':''}${value}% expressed as a proportion.`};
    }
    if(!isUncertainty&&bounded&&unitless(unit)&&value>=0&&value<=1) return {...base,kind:'ratio',fraction:value,unit:'0–1',
      visual:{type:'fill',min:0,max:1,low:value,high:value},
      note:qualifier?'Approximate reported proportion; reference scale: 0–1.':'Reference scale: 0–1.'};
    if(silhouette&&unitless(unit)&&value>=-1&&value<=1) return {...base,kind:'reference',
      visual:{type:'point',min:-1,max:1,value},note:'Silhouette reference scale: −1 to 1.'};
    if(rSquared&&unitless(unit)) return {...base,note:'R² has a maximum of 1 but can be negative; no bounded fill scale is implied.'};
    if(/\bmean\s+abs\s+mfe\s+forecast\b/.test(name)) return {...base,note:'This reported formula is not bounded to 0–1.'};
    if(percent(unit)&&value>=0&&value<=100)return {...base,kind:'percentage',unit:'%',fraction:value/100,note:qualifier?`Approximately ${value}% as reported; no bounded scale is implied.`:'Reported percentage; no bounded scale is implied.'};
    return base;
  }
  function format(value,ratio=false) {
    if(value===null||value===undefined)return '-';
    if(typeof value!=='number') {
      return String(value).replace(/(?<![\w.])([+-]?(?:\d+\.\d{6,}|\d+(?:\.\d+)?e[+-]?\d+))(?![\w.])/gi, token => format(Number(token)));
    }
    if(value!==0&&Math.abs(value)<.005)return value.toLocaleString('en-US',{maximumSignificantDigits:5});
    return value.toLocaleString('en-US',{maximumFractionDigits:5,minimumFractionDigits:ratio?2:0});
  }
  function heroAffixes(described={}) {
    return {qualifier:String(described.qualifier||''),unit:described.unit==='0–1'?'':String(described.unit||'')};
  }
  function userNote(described={}) {
    if(described.kind==='missing')return 'Value not available.';
    if(!described.unit && described.note==='Unit not recorded.')return 'Unit not recorded.';
    return '';
  }
  return {describe,label,format,heroAffixes,userNote};
});
