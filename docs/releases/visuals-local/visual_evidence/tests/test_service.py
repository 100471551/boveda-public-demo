import hashlib,json,threading
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from apps.visual_evidence.service import VERSION,asset,digest,fingerprint,supplement
from apps.visual_evidence.run import validate_answer
from apps.visual_evidence.computed import candidates

class SupplementTests(unittest.TestCase):
 def setUp(self):
  self.temp=TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.out=self.root/'outputs';self.folder=self.out/'visual';self.folder.mkdir(parents=True);(self.out/'Primitive_Product_UX').mkdir()
  self.payload={'id':'A','available':True,'components':[],'passthrough':{'Q2':{'content':{}}}}
  self.library=type('Library',(),{'workspace':self.root,'outputs':self.out,'audit':lambda _,aid:self.payload})()
  self.blob=b'\x89PNG\r\n\x1a\nfixture';self.sha=digest(self.blob);(self.folder/'asset.png').write_bytes(self.blob)
  self.manifest={'version':VERSION,'review_status':'REVIEWED','audit_id':'A','canonical_fingerprint':fingerprint(self.payload),'status':'READY','items':[{'images':[{'asset_sha256':self.sha,'alt':'Plot'}]}],'assets':{self.sha:{'file':'asset.png','mime':'image/png'}}}
  self.install()
 def install(self,reviewed=True):
  path=self.folder/'manifest.json';path.write_text(json.dumps(self.manifest))
  self.config={'version':VERSION,'audits':{'A':{'reviewed':reviewed,'manifest':str(path.relative_to(self.root)),'sha256':digest(path.read_bytes())}}}
  (self.out/'Primitive_Product_UX/visual_evidence_pilot.json').write_text(json.dumps(self.config))
 def test_requires_review_and_canonical_binding(self):
  self.assertEqual(supplement(self.library,'A',self.payload)['status'],'READY')
  self.manifest['review_status']='DRAFT';self.install();self.assertEqual(supplement(self.library,'A',self.payload)['items'],[])
  self.manifest['review_status']='REVIEWED'
  self.install(False);self.assertEqual(supplement(self.library,'A',self.payload)['items'],[])
  self.install();self.payload['passthrough']['Q2']['content']['changed']=True
  self.assertEqual(supplement(self.library,'A',self.payload)['items'],[])
 def test_asset_authorization_hash_and_boundary(self):
  self.assertEqual(asset(self.library,'A',self.sha)[0],self.blob)
  with self.assertRaises(ValueError):asset(self.library,'A','../asset.png')
  with self.assertRaises(ValueError):asset(self.library,'A','f'*64)
  (self.folder/'asset.png').write_bytes(b'changed')
  with self.assertRaises(ValueError):asset(self.library,'A',self.sha)
 def test_external_asset_path(self):
  (self.root/'secret.png').write_bytes(self.blob);self.manifest['assets'][self.sha]['file']='../../secret.png';self.install()
  with self.assertRaises(ValueError):asset(self.library,'A',self.sha)
 def test_source_only_gallery_remains_bound_without_contextual_items(self):
  self.manifest['additional_images']=self.manifest.pop('items');self.manifest['items']=[];self.manifest['status']='PARTIAL';self.install()
  view=supplement(self.library,'A',self.payload)
  self.assertEqual(view['items'],[])
  self.assertIn('/api/visual-asset?audit=A&asset=',view['additional_images'][0]['images'][0]['url'])
  self.assertEqual(asset(self.library,'A',self.sha)[0],self.blob)
  self.payload['passthrough']['Q2']['content']['changed']=True
  self.assertEqual(supplement(self.library,'A',self.payload)['status'],'NOT_AVAILABLE')
 def test_response_must_link_only_supplied_evidence(self):
  image={'id':'i','asset_sha256':self.sha,'source_path':'plot.png','locator':'plot.png'}
  answer={'items':[{'image_ids':['i'],'section':'overview','title':'Plot','caption':'A context','caveat':'','audit_refs':['Q2:0']}]}
  self.assertEqual(len(validate_answer(answer,[image],{'Q2:0':'actual'})),1)
  answer['items'][0]['audit_refs']=['invented']
  with self.assertRaises(ValueError):validate_answer(answer,[image],{'Q2:0':'actual'})
 def test_computed_requires_identical_scope_source_native_values(self):
  def card(model,value,scope='Same task and evaluation',source='results.csv'):
   return {'model_or_capability':{'text':model},'evaluation':{'text':scope},'metrics':[{'label':'MAE','value':value,'unit':'days','status':'DOCUMENTED','evidence':[{'artifact':source,'location':'rows 1-3'}]}]}
  cards=[card('A',2),card('B',3)];p={'passthrough':{'Q2':{'content':{'performance_cards':cards}}}}
  self.assertEqual(len(candidates(p)),1)
  cards[1]=card('B',3,scope='Other cohort');self.assertEqual(candidates(p),[])
  cards[1]=card('B',3,source='other.csv');self.assertEqual(candidates(p),[])
  for value in ['3',float('nan'),True]:
   cards[1]=card('B',value);self.assertEqual(candidates(p),[])
if __name__=='__main__':unittest.main()
