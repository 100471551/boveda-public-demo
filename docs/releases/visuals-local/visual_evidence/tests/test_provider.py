from apps.visual_evidence.provider import Provider


def provider(tmp_path, budget):
    p=Provider.__new__(Provider)
    p.ledger=tmp_path/'events.jsonl';p.budget=budget;p.spent=0.;p.stopped=False;p.key='test-only'
    return p


def test_budget_exhaustion_never_contacts_provider(tmp_path, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('No API call is allowed')
    monkeypatch.setattr('urllib.request.urlopen',forbidden)
    p=provider(tmp_path,0)
    answer,event=p.generate('A',{'audit_refs':{'S1:0':'context'}},[],tmp_path)
    assert answer is None and event['status']=='LIMIT'
    assert not p.ledger.exists()


def test_uncertain_timeout_reserves_cost_and_disables_blind_retry(tmp_path, monkeypatch):
    calls=[]
    def timeout(*args, **kwargs):
        calls.append(1)
        raise TimeoutError('Simulated uncertain provider result')
    monkeypatch.setattr('urllib.request.urlopen',timeout)
    p=provider(tmp_path,1)
    packet={'audit_refs':{'S1:0':'context'}}
    answer,event=p.generate('A',packet,[],tmp_path)
    assert answer is None and event['usage_unknown']
    assert p.spent>0 and p.stopped
    answer,event=p.generate('B',packet,[],tmp_path)
    assert answer is None and event['status']=='LIMIT' and len(calls)==1
