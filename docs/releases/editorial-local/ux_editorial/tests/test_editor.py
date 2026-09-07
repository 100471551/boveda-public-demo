import copy
import tempfile
import unittest
from pathlib import Path
from apps.ux_editorial.editor import fields, resolve, render, Package, write_json, empty_answer
from apps.ux_editorial.run import edit_package

class KeepProvider:
    def generate(self, field):
        return empty_answer(field), {'cost_usd': 0, 'latency_seconds': 0}

class Tests(unittest.TestCase):
    def field(self, text='Random Forest parking-occupancy classifier'):
        return {'canonical_text': text, 'profile_id':'S4.primary', 'stage':'S4', 'pointer':'/x', 'context':{}}

    def test_keep_fallback_and_invalid_are_exact(self):
        source=self.field()
        for answer in [None, {}, {'decision':'KEEP','text':''}, {'decision':'FALLBACK','text':''}, {'decision':'REWRITE','text':'', 'status':'DOCUMENTED'}]:
            self.assertEqual(resolve(source,answer)['display_text'],source['canonical_text'])
        self.assertEqual(resolve(source,{'decision':'KEEP','text':''})['decision'],'KEEP')
        self.assertEqual(resolve(source,{'decision':'KEEP','text':source['canonical_text']})['decision'],'KEEP')

    def test_number_and_markup_rejections(self):
        f=self.field('Not verified on 127 test records.')
        for text in ['Not verified on 128 test records.', 'Not verified on 127 test records. [E0001]', 'Not verified on 127 test records. [click](https://example.com)']:
            self.assertEqual(resolve(f,{'decision':'REWRITE','text':text})['decision'],'FALLBACK')

    def test_valid_rewrite_and_array_identity(self):
        result=resolve(self.field('A paired capability: classification and forecasting.'),{'decision':'REWRITE','text':'Classification and forecasting.'})
        self.assertEqual(result['decision'],'REWRITE')
        record={'boundary':[{'text':'Only sample A.','status':'DOCUMENTED','evidence':[]}], 'project_id':'fixture'}
        items=list(fields('S1',record))
        self.assertEqual(items[0]['pointer'],'/boundary/0/text')
        self.assertNotIn('evidence', items[0]['context'])
        model_record={'resulting_model_landscape':{'models_or_capabilities':[{
            'label':'Classifier (full data)','text':'Fitted and evaluated.',
            'status':'DOCUMENTED','evidence':[]}]}}
        model_field=next(fields('S4',model_record))
        self.assertEqual(model_field['context'],{'status':'DOCUMENTED'})

    def test_preserved_composition_and_protected_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'canonical';root.mkdir()
            st={'text':'Predict sample outcomes.','status':'INTERPRETED','evidence':[]}
            record={'project_id':'fixture','core_purpose':copy.deepcopy(st),'subject':copy.deepcopy(st),'output_claim':copy.deepcopy(st),'intended_use':copy.deepcopy(st),'boundary':[],'secondary_purposes':[],'not_established':[]}
            run=root/'runs/S1__fixture';run.mkdir(parents=True)
            write_json(run/'purpose_record.json',record)
            md=render('S1',record)
            (run/'purpose_record.md').write_text(md+'\n')
            original='# Audit\nPublication: NOT_PUBLISHABLE\n\n'+md+'\n\nProtected Q2 / S5 / S6 content\n'
            (root/'S1_S6_Q1_Q2_Aggregate_Report.md').write_text(original)
            write_json(root/'execution_summary.json',{'project_id':'fixture','publication_eligibility':{'status':'NOT_PUBLISHABLE'}})
            package=Package(root); before=(run/'purpose_record.json').read_bytes()
            items=list(package.fields())
            results=[resolve(f,{'decision':'KEEP','text':''}) for f in items]
            results[0]=resolve(items[0],{'decision':'REWRITE','text':'Predict outcomes for the sample.'})
            display=package.compose(results)
            self.assertIn('Predict outcomes for the sample.',display)
            self.assertIn('Publication: NOT_PUBLISHABLE',display)
            self.assertIn('Protected Q2 / S5 / S6 content',display)
            self.assertEqual(before,(run/'purpose_record.json').read_bytes())
            with self.assertRaises(ValueError):package.compose(results+[results[0]])
            summary,_=edit_package(root,Path(temp)/'editorial',KeepProvider())
            self.assertIn('Protected Q2 / S5 / S6 content', (Path(temp)/'editorial/display.md').read_text())
            self.assertTrue((Path(temp)/'editorial/content.json').exists())
            self.assertTrue(summary['canonical_unchanged'])
            (run/'purpose_record.json').write_text('{}')
            with self.assertRaises(ValueError):package.compose(results)


    def test_structured_list_and_flow(self):
        f={**self.field('Records are scaled before an 80/20 split. Execution is not established.'), 'shape':'flow'}
        answer={'decision':'REWRITE','flows':[{'label':'Documented route','nodes':['Records','Scaling','80/20 split']}],'notes':['Execution is not established.']}
        result=resolve(f,answer)
        self.assertEqual(result['decision'],'REWRITE')
        self.assertEqual(result['content']['flows'][0]['nodes'][-1],'80/20 split')
        self.assertEqual(resolve(f,empty_answer(f))['decision'],'FALLBACK')
        f={**self.field('The timestamp is unknown. Model identity is unverified.'),'shape':'items'}
        r=resolve(f,{'decision':'REWRITE','items':['The timestamp is unknown.','Model identity is unverified.']})
        self.assertEqual(r['decision'],'REWRITE')
        self.assertEqual(len(r['content']['items']),2)
        leaked=resolve(f,{'decision':'REWRITE','items':['REWRITE timestamp: the timestamp is unknown.','Model identity is unverified.']})
        self.assertEqual(leaked['decision'],'FALLBACK')
        self.assertEqual(leaked['reason'],'EDITORIAL_CONTROL_TOKEN')

    def test_no_lexical_qualifier_gate(self):
        f=self.field('Only documented inference is launched, not training.')
        r=resolve(f,{'decision':'REWRITE','text':'Documented inference is launched without training.'})
        self.assertEqual(r['decision'],'REWRITE')

if __name__=='__main__':unittest.main()
