const test = require('node:test');
const assert = require('node:assert/strict');
const {describe,label,format,heroAffixes} = require('../static/product_v2_0_1/metric-display.js');

test('bounded percentage becomes a disclosed display proportion without changing the record', () => {
  const metric = Object.freeze({label: 'Average accuracy', unit: '%', value: 86.4});
  const shown = describe(metric);
  assert.equal(shown.kind, 'ratio');
  assert.equal(shown.value, 0.8640000000000001);
  assert.equal(shown.converted, true);
  assert.deepEqual(shown.visual, {type:'fill', min:0, max:1, low:0.8640000000000001, high:0.8640000000000001});
  assert.match(shown.note, /86\.4%/);
  assert.equal(metric.value, 86.4);
});
test('Unicode and ASCII R-squared labels preserve values without implying a bounded fill scale', () => {
  for (const name of ['R²','Test R²','R^2','R-squared','Test_R2']) {
    for (const value of [.953887,-.4]) {
      const shown=describe({label:name,value});
      assert.equal(shown.kind,'number');assert.equal(shown.value,value);assert.equal(shown.visual,null);
      assert.match(shown.note,/can be negative/);
    }
  }
});
test('approximate percentages retain approximation when expressed as proportions', () => {
  const m=Object.freeze({label:'Accuracy',value:'about 87%',unit:null});
  const d=describe(m);assert.equal(d.kind,'ratio');assert.equal(d.value,.87);assert.equal(d.qualifier,'≈');
  assert.equal(m.value,'about 87%');assert.match(d.note,/Approximately/);
  assert.deepEqual(heroAffixes(d),{qualifier:'≈',unit:''});assert.equal(format(d.value,true),'0.87');
  const almost=describe({label:'Share',value:'almost 70%'});
  assert.equal(almost.kind,'ratio');assert.equal(almost.qualifier,'Almost');assert.equal(almost.value,.7);
  assert.equal(almost.fraction,.7);assert.equal(almost.converted,true);
  assert.equal(almost.note,'Almost 70% expressed as a proportion.');
  assert.deepEqual(heroAffixes(almost),{qualifier:'Almost',unit:''});assert.equal(format(almost.value,true),'0.70');
  for(const metric of [{label:'Accuracy',value:'about 0.87'},{label:'RMSE',value:'about 5'}]) {
    const shown=describe(metric);assert.equal(heroAffixes(shown).qualifier,'≈');assert.match(shown.note,/Approximate/);
  }
});
test('a retained household share becomes a fractional chart value', () => {
  const raw = 'almost 70%';
  const metric = Object.freeze({label: 'Test households misclassified by none of the 20 models', value: raw});
  const shown = describe(metric);
  assert.equal(shown.kind, 'ratio');
  assert.equal(shown.value, 0.7);
  assert.equal(shown.fraction, 0.7);
  assert.equal(shown.unit, '0–1');
  assert.equal(shown.qualifier, 'Almost');
  assert.match(shown.note, /Almost 70%/);
  assert.equal(metric.value, raw);
});
test('an explicit percentage alone does not imply a bounded scale', () => {
  const shown=describe({label:'Percent error',value:'almost 70%'});
  assert.equal(shown.kind,'percentage');assert.equal(shown.visual,null);assert.match(shown.note,/no bounded scale/);
});
test('ranges are never collapsed to a point estimate', () => {
  const d=describe({label:'Accuracy',value:'~75–85',unit:'%'});
  assert.equal(d.kind,'range');assert.deepEqual(d.range,[.75,.85]);assert.equal(d.qualifier,'≈');assert.equal(d.fraction,null);
  assert.match(d.note,/Approximate/);assert.deepEqual(heroAffixes(d),{qualifier:'≈',unit:''});
  assert.equal(d.range.map(v=>format(v,true)).join('–'),'0.75–0.85');
  const error=describe({label:'Percent error',value:'75–85%',unit:'%'});
  assert.equal(error.kind,'range');assert.deepEqual(error.range,[75,85]);assert.equal(error.visual,null);
});
test('compound values require matching explicit measures and units', () => {
  const d=describe({label:'City test — MAE / RMSE / CVRMSE',value:'4.16 / 5.06 / 6.50',unit:'GWh / GWh / %'});
  assert.equal(d.kind,'group');assert.equal(d.parts.length,3);assert.equal(d.parts[2].value,'6.50');
  assert.equal(describe({label:'Score',value:'1 / 2',unit:'%'}).kind,'text');
});
test('uncertainty is separated only when its meaning is explicit', () => {
  const d=describe({label:'Mean F1 (SE)',value:'0.94 (0.001)'});
  assert.equal(d.kind,'ratio');assert.equal(d.value,.94);assert.equal(d.detail,'SE 0.001');
  assert.equal(describe({label:'Mean F1',value:'0.94 (0.001)'}).kind,'text');
});
test('qualitative results retain the full text and receive no numeric graph', () => {
  const value='Top two in 2011 and 2013; not top two in 2012';
  const d=describe({label:'Across-year ranking',value});
  assert.equal(d.kind,'text');assert.equal(d.value,value);assert.equal(d.fraction,null);
  assert.equal(describe({label:'Comparative rank',value:'1st'}).kind,'ordinal');
});
test('a compact metric heading keeps the complete horizon, method and attribution in context', () => {
  const m={label:'Reported 1-hour forecast average error (RMSE × target standard deviation)'};
  const d=label(m);assert.equal(d.title,'Average error');assert.equal(d.context,m.label);
});
test('formatting does not turn a small nonzero value into zero', () => {
  assert.notEqual(format(.00001234),'0');assert.notEqual(format(.0049,true),'0.00');
  assert.equal(format(.953887894029,true),'0.95389');assert.equal(format(.903472509313,true),'0.90347');
  assert.equal(format(.9,true),'0.90');assert.equal(format(1,true),'1.00');
});
test('uncertainty percentages keep their native scale', () => {
  for(const metric of [{label: 'Accuracy SD', unit: '%', value: 10.5},{label: 'Accuracy confidence interval', unit: '%', value: 5}]) {
    const shown=describe(metric);assert.equal(shown.kind,'percentage');assert.equal(shown.visual,null);
  }
});
test('absolute errors and unknown metrics are never guessed to be proportions', () => {
  for (const metric of [{label: 'RMSE', value: 0.4}, {label: 'Score', value: 0.92},
    {label: 'Accuracy', value: 0.8, unit: 'seconds'}]) assert.equal(describe(metric).kind, 'number');
});
test('negative or out-of-range values are preserved without clamping', () => {
  for (const metric of [{label: 'Test_R2', value: -0.35}, {label: 'Accuracy', value: 105, unit: '%'}]) {
    const shown = describe(metric);
    assert.equal(shown.kind, 'number'); assert.equal(shown.value, metric.value); assert.equal(shown.fraction, null);
  }
  assert.equal(describe({label: 'Test_R2', value: 0.92}).kind, 'number');
});
test('defined bounded and signed scales receive the matching visualization', () => {
  for(const metric of [
    {label:'Internal empirical p-value',value:0},
    {label:'RF Brier score',value:.08},
    {label:'TLM confidence',value:.91}
  ]) {
    const shown=describe(metric);assert.equal(shown.kind,'ratio');assert.equal(shown.visual.type,'fill');
    assert.deepEqual([shown.visual.min,shown.visual.max],[0,1]);
  }
  const silhouette=describe({label:'Silhouette score (3 clusters)',value:.53});
  assert.equal(silhouette.kind,'reference');
  assert.deepEqual(silhouette.visual,{type:'point',min:-1,max:1,value:.53});
  const coverage=describe({label:'Observed prediction-interval coverage',value:62.9,unit:'%'});
  assert.equal(coverage.kind,'ratio');assert.equal(coverage.visual.type,'fill');
});
test('the R1 formula remains scalar because it is not bounded to zero and one', () => {
  const shown=describe({label:'MAE (code label; mean(abs(MFE/forecast)))',value:.6667867415358774});
  assert.equal(shown.kind,'number');assert.equal(shown.visual,null);assert.match(shown.note,/not bounded/);
});
test('zero is a result; missing values and non-finite values are unavailable', () => {
  assert.equal(describe({label: 'Accuracy', value: 0, unit: '%'}).value, 0);
  for (const value of [null, undefined, '', NaN, Infinity]) assert.equal(describe({value}).kind, 'missing');
});

test('compact precision preserves small values and raw qualifiers',()=>{
 assert.equal(format(0.953887894029),'0.95389');
 assert.notEqual(format(0.00000003456),'0');
 assert.equal(format('≤ 0.953887894029'),'≤ 0.95389');
 assert.equal(format('1.123456789 / 2.987654321'),'1.12346 / 2.98765');
 assert.equal(format(67485),'67,485');
});
