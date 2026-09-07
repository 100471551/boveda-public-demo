import unittest
from apps.ux_editorial.editor import fields, resolve, empty_answer
from apps.ux_editorial.run import evaluate_field

class RevisionTests(unittest.TestCase):
 def test_flow_rejects_chain_but_allows_single_operation(self):
  f=next(fields('S3',{'construction_path':{'text':'Read requests then clean requests.'}}))
  invalid=resolve(f,{'decision':'REWRITE','flows':[{'label':'Requests','nodes':['Read requests → Clean requests']}],'notes':[]})
  self.assertEqual(invalid['reason'],'MULTIPLE_OPERATIONS_IN_NODE')
  valid=resolve(f,{'decision':'REWRITE','flows':[{'label':'Requests','nodes':['Read requests','Clean requests']}],'notes':[]})
  self.assertEqual(valid['decision'],'REWRITE')
 def test_title_can_omit_numbers_but_not_invent(self):
  f=next(x for x in fields('S1',{'_display_title':'Predict resolution of 2015 NYC 311 requests.'}))
  self.assertEqual(resolve(f,{'decision':'REWRITE','text':'NYC request resolution prediction'})['decision'],'REWRITE')
  self.assertEqual(resolve(f,{'decision':'REWRITE','text':'2020 request resolution prediction'})['reason'],'NUMBERS_CHANGED')
 def test_q1_cannot_drop_counts(self):
  f=next(fields('Q1',{'profile':{'n':{'statement':'Primary: 12 requests; secondary: 5 days.'}}}))
  self.assertEqual(resolve(f,{'decision':'REWRITE','text':'12 primary requests; secondary days.'})['reason'],'NUMBERS_CHANGED')
 def test_malformed_source_not_sent_to_provider(self):
  f=next(fields('Q1',{'profile':{'target':{'statement':'Target (repeated source clause) (repeated source clause) (repeated source clause)'}}}))
  self.assertEqual(evaluate_field(f,None)['reason'],'SOURCE_REVIEW_REQUIRED')

 def test_semantic_rejection_falls_back_and_accounts_for_review(self):
  class Fake:
   def __init__(self):self.responses=iter([{'decision':'REWRITE','text':'Predict NYC request counts.'},{'decision':'FALLBACK','text':'Scope needs checking.'},{'decision':'FALLBACK','text':''}])
   def generate(self,f):return next(self.responses),{'cost_usd':0.01,'latency_seconds':0,'usage':{}}
  f=next(fields('S1',{'core_purpose':{'text':'Predict request counts in NYC.'}}))
  got=evaluate_field(f,Fake())
  self.assertEqual(got['decision'],'FALLBACK')
  self.assertEqual(got['display_text'],f['canonical_text'])
  self.assertAlmostEqual(got['usage']['cost_usd'],0.03)
 def test_q1_random_assignment_cannot_be_dropped(self):
  f=next(fields('Q1',{'profile':{'split':{'statement':'Primary: random 70% train / 30% test split.'}}}))
  self.assertEqual(resolve(f,{'decision':'REWRITE','text':'70% train / 30% test split (primary).'})['reason'],'Q1_SCOPE_QUALIFIER_LOST')
