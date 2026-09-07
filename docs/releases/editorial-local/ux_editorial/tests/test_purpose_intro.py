import copy,unittest
from apps.ux_editorial.purpose_intro import attach
from apps.ux_editorial.editor import fields,resolve
from apps.ux_editorial.presentation import component_records

class IntroductionTests(unittest.TestCase):
 def test_synthesis_preserves_sources_and_unions_references(self):
  ref={'evidence_id':'E0001','artifact':'README.md','location':'lines 1-3','excerpt':'PRIVATE SOURCE'}
  record={'core_purpose':{'text':'Predict requests.','status':'INTERPRETED','evidence':[ref]},'subject':{'text':'2015 city requests.','status':'DOCUMENTED','evidence':[ref]},'output_claim':{'text':'Daily forecasts.','status':'DOCUMENTED','evidence':[dict(ref,evidence_id='E0002')]}}
  original=copy.deepcopy(record);attach(record)
  self.assertEqual({k:v for k,v in record.items() if k!='_purpose_intro'},original)
  f=next(f for f in fields('S1',record) if f['profile_id']=='S1.purpose_intro')
  self.assertNotIn('PRIVATE SOURCE',str(f));self.assertEqual(f['context']['supporting_statements']['subject']['text'],'2015 city requests.')
  result=resolve(f,{'decision':'REWRITE','text':'Predict daily forecasts for 2015 city requests.'})
  self.assertEqual(result['decision'],'REWRITE')
  self.assertEqual(resolve(f,{'decision':'REWRITE','text':'Predict daily forecasts for 2027 city requests.'})['reason'],'NUMBERS_CHANGED')
  c=next(c for c in component_records({'S1':record},[result]) if c['field']=='S1.purpose_intro')
  meta=c['entries'][0]['metadata'];self.assertEqual(len(meta['evidence']),2)
  self.assertEqual(meta['canonical_sources'][1]['status'],'DOCUMENTED');self.assertEqual(meta['canonical_sources'][1]['evidence'][0]['evidence_id'],'E0001')
  self.assertNotIn('PRIVATE SOURCE',str(meta))
 def test_absent_purpose_does_not_invent_introduction(self):
  r={'subject':{'text':'Requests.'}};attach(r);self.assertNotIn('_purpose_intro',r)
