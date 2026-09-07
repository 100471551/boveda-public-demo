import json
import tempfile
import unittest
from pathlib import Path
from apps.primitive_probe.repository import github_url, repository_url

class RepositoryAttributionTests(unittest.TestCase):
    def test_remote_forms_and_credentials(self):
        for raw in ['https://github.com/Owner/Repo.git','git@github.com:Owner/Repo.git','ssh://git@github.com/Owner/Repo.git','https://secret:token@github.com/Owner/Repo.git?token=secret#ref']:
            self.assertEqual(github_url(raw),'https://github.com/Owner/Repo')
        for raw in ['javascript:alert(1)','https://github.com.evil.test/x/y','https://github.com/owner/repo/tree/main','https://github.com/owner/..','https://github.com:123/owner/repo','/local/path','https://github.com/owner/repo\n']:
            self.assertIsNone(github_url(raw))

    def test_exact_audit_binding_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            w=Path(temp);root=w/'outputs/audit';source=w/'projects/source';meta=root/'runs/S1__demo/run_metadata.json';meta.parent.mkdir(parents=True);(source/'.git').mkdir(parents=True)
            config=source/'.git/config';config.write_text('[remote "origin"]\n url = git@github.com:Owner/Repo.git\n')
            meta.write_text(json.dumps({'project_id':'demo','project_root':'projects/source'}))
            self.assertEqual(repository_url(w,root,'demo'),'https://github.com/Owner/Repo')
            self.assertIsNone(repository_url(w,root,'other'))
            extra=root/'runs/S3__demo/run_metadata.json';extra.parent.mkdir();extra.write_text(json.dumps({'project_id':'demo','project_root':'projects/other'}))
            self.assertIsNone(repository_url(w,root,'demo'));extra.unlink()
            config.unlink();self.assertIsNone(repository_url(w,root,'demo'))
            # Do not execute Git or follow includes / a parent's Git origin.
            config.write_text('[include]\n path = /private/config\n');self.assertIsNone(repository_url(w,root,'demo'))
            config.unlink();outside=w/'outside';outside.write_text('[remote "origin"]\n url = https://github.com/Wrong/Repo\n');config.symlink_to(outside)
            self.assertIsNone(repository_url(w,root,'demo'))

if __name__=='__main__':unittest.main()
