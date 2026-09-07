import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from apps.ux_editorial.provider import Provider

class ProviderTests(unittest.TestCase):
    def provider(self, root):
        p=Provider.__new__(Provider)
        p.key='unit-test-no-secret';p.ledger=root/'events.jsonl'
        p.budget=1;p.spent=0;p.reserved=0;p.lock=threading.Lock();p.stopped=False
        return p

    def test_usage_is_separate_and_known(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=self.provider(Path(tmp))
            response={'status':'completed','id':'test','usage':{'input_tokens':10,'output_tokens':12,'input_tokens_details':{'cached_tokens':2,'cache_write_tokens':3}},'output':[{'type':'message','content':[{'type':'output_text','text':'{"decision":"KEEP","text":""}'}]}]}
            stream=MagicMock();stream.__enter__.return_value.read.return_value=json.dumps(response).encode()
            f={'instructions':'Keep.','canonical_text':'A task.','context':{},'profile_id':'test','pointer':'/text'}
            with patch('urllib.request.urlopen', return_value=stream):
                answer,event=p.generate(f)
            self.assertEqual(answer['decision'],'KEEP')
            self.assertAlmostEqual(p.spent,0.0001619)
            self.assertEqual(event['cost_usd'],p.spent)
            self.assertNotIn(p.key,p.ledger.read_text())

    def test_unknown_request_is_not_retried(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=self.provider(Path(tmp))
            f={'instructions':'Keep.','canonical_text':'A task.','context':{},'profile_id':'test','pointer':'/text'}
            with patch('urllib.request.urlopen', side_effect=TimeoutError) as send:
                _,first=p.generate(f);_,second=p.generate(f)
            self.assertEqual(send.call_count,1)
            self.assertTrue(first['usage_unknown'])
            self.assertIsNone(first['cost_usd'])
            self.assertEqual(second['cost_usd'],0)

    def test_invalid_budget_rejected_before_credential_loading(self):
        for budget in [float('nan'),float('inf'),0,-1,True]:
            with self.assertRaises(ValueError):Provider(Path('/unused'),budget)

if __name__=='__main__':unittest.main()
