import copy,unittest
from apps.ux_editorial.construction_intro import attach
from apps.ux_editorial.editor import fields,resolve,number_values
from apps.ux_editorial.presentation import component_records

class ConstructionIntroductionTests(unittest.TestCase):
 def test_cross_stage_ids_retain_their_owning_stage(self):
  ref={'evidence_id':'E0001','artifact':'workflow.py','location':'lines 1-3','excerpt':'private raw source'}
  records={'S3':{'construction_path':{'text':'Clean requests.','status':'DOCUMENTED','evidence':[ref]}},'S4':{'learning_task':{'text':'Learn request volumes.','status':'DOCUMENTED','evidence':[ref]},'resulting_model_landscape':{'canonical_model_status':{'answer':'Not established','explanation':'No single model is designated.','status':'UNRESOLVED','evidence':[ref]}}}}
  original=copy.deepcopy(records);attach(records)
  self.assertEqual(records['S3'],original['S3']);self.assertEqual({k:v for k,v in records['S4'].items() if k!='_construction_intro'},original['S4'])
  f=next(f for f in fields('S4',records['S4']) if f['profile_id']=='S4.construction_intro')
  self.assertNotIn('private raw source',str(f))
  self.assertTrue(any(x['status']=='UNRESOLVED' for x in f['context']['supporting_statements']))
  r=resolve(f,{'decision':'REWRITE','text':'Clean requests to learn request volumes; no single model is designated.'})
  c=next(c for c in component_records(records,[r]) if c['field']=='S4.construction_intro')
  self.assertEqual({(r['stage'],r['evidence_id']) for r in c['entries'][0]['metadata']['evidence']},{('S3','E0001'),('S4','E0001')})
 def test_no_task_does_not_invent_an_intro(self):
  records={'S3':{'construction_path':{'text':'Clean inputs.'}},'S4':{}};attach(records);self.assertNotIn('_construction_intro',records['S4'])

 def test_unicode_minus_preserves_the_same_numeric_constraint(self):
  self.assertEqual(number_values("-250 ppm"),number_values("−250 ppm"))
  self.assertNotEqual(number_values("250 ppm"),number_values("−250 ppm"))

 def test_supporting_unicode_range_remains_numeric_evidence(self):
  f={'profile_id':'S4.construction_intro','stage':'S4','pointer':'/_construction_intro/text','canonical_text':'Forecast rates.','context':{'supporting_statements':[{'text':'Forecast 2019–2023 rates.'}]},'shape':'text','keep_allowed':False}
  self.assertEqual(resolve(f,{'decision':'REWRITE','text':'Forecast rates across 2019–2023.'})['decision'],'REWRITE')
  self.assertEqual(resolve(f,{'decision':'REWRITE','text':'Forecast rates across 2019–2024.'})['decision'],'FALLBACK')
