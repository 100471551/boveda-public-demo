import json
import pytest
from apps.visual_evidence.qualify import qualify
from apps.visual_evidence.service import VERSION,digest


def test_qualification_is_bound_to_reviewed_content_and_preserves_original(tmp_path):
    source=tmp_path/'draft';source.mkdir()
    draft={'version':VERSION,'review_status':'DRAFT','audit_id':'A','items':[{'id':'a','section':'evidence','images':[],'caption':'Original caption'},{'id':'b','images':[]}],'assets':{}}
    path=source/'manifest.json';path.write_text(json.dumps(draft));before=path.read_bytes()
    review={'audit_id':'A','draft_sha256':digest(before),'decisions':[{'item_id':'a','accept':True,'reason':'Correct source and scope; model diagnostics belong in overview.','section':'overview'},{'item_id':'b','accept':False,'reason':'Ambiguous population'}]}
    result=json.loads(qualify(source,tmp_path/'qualified',review).read_text())
    assert result['review_status']=='REVIEWED'
    assert result['items']==[{'id':'a','section':'overview','images':[],'caption':'Original caption'}]
    assert path.read_bytes()==before
    with pytest.raises(ValueError):qualify(source,tmp_path/'qualified',review)
    review['decisions'].pop()
    with pytest.raises(ValueError):qualify(source,tmp_path/'incomplete',review)
    path.write_text(json.dumps({**draft,'caption':'changed'}))
    with pytest.raises(ValueError):qualify(source,tmp_path/'stale',review)
