import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from apps.visual_evidence.catalog import attach_catalog
from apps.visual_evidence.service import digest

class CatalogTests(unittest.TestCase):
 def setUp(self):
  self.tmp=TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);(self.root/'assets').mkdir()
  self.inv={'candidates':[],'truncated':False,'skipped':{}}
  self.manifest={'items':[],'assets':{}}
 def image(self,path,blob=None):
  blob=blob or b'\x89PNG\r\n\x1a\n'+path.encode();sha=digest(blob);name='assets/'+sha+'.png';(self.root/name).write_bytes(blob)
  c={'asset_sha256':sha,'asset_file':name,'source_path':path,'locator':path,'mime':'image/png'};self.inv['candidates'].append(c);return c
 def test_keeps_all_images_beyond_contextual_shortlist_without_inventing_copy(self):
  for i in range(40):self.image('figures/plot'+str(i)+'.png')
  result=attach_catalog(self.manifest,self.inv,self.root)
  self.assertEqual(len(result['additional_images']),40)
  self.assertEqual(result['status'],'PARTIAL')
  self.assertTrue(all('caption' not in i and 'audit_refs' not in i for i in result['additional_images']))
 def test_duplicate_bytes_share_entry_and_retain_all_source_locations(self):
  c=self.image('graphs/plot.png');other=self.image('notebook.ipynb', (self.root/c['asset_file']).read_bytes());other['locator']='notebook.ipynb#cell=2/output=0/mime=image/png'
  result=attach_catalog(self.manifest,self.inv,self.root)
  self.assertEqual(len(result['additional_images']),1)
  self.assertEqual(len(result['additional_images'][0]['sources']),2)
  self.manifest['items']=[{'title':'Reviewed title','caption':'Reviewed context','sources':[], 'images':[{'asset_sha256':c['asset_sha256']}]}]
  result=attach_catalog(self.manifest,self.inv,self.root)
  self.assertEqual(result['additional_images'],[])
  self.assertEqual(result['items'][0]['caption'],'Reviewed context')
  self.assertEqual(len(result['items'][0]['sources']),2)
 def test_exclusions_and_scan_limits_are_visible(self):
  self.image('assets/logo.png');c=self.image('plots/large.png');(self.root/c['asset_file']).write_bytes(b'x'*(4*1024*1024+1));self.inv['truncated']=True
  result=attach_catalog(self.manifest,self.inv,self.root)
  self.assertEqual(result['catalog_coverage']['excluded'],{'decorative_filename':1,'image_size_limit':1})
  self.assertTrue(result['catalog_coverage']['scan_truncated'])
 def test_changed_or_escaping_asset_is_rejected(self):
  c=self.image('figures/a.png');(self.root/c['asset_file']).write_bytes(b'changed')
  with self.assertRaises(ValueError):attach_catalog(self.manifest,self.inv,self.root)
  c['asset_file']='../outside.png'
  with self.assertRaises(ValueError):attach_catalog(self.manifest,self.inv,self.root)
if __name__=='__main__':unittest.main()
