"""Bounded, read-only product catalogue for the Primitive Probe.

This module deliberately knows a small set of published result packages.  It
does not discover projects, inspect project source code, run analytical code,
or call a model/provider. It reuses the existing pure presentation mapping.
Repository attribution reads only audit-bound run metadata and Git origin config.
The catalogue's mutable state only
controls visibility of references; it never owns or removes analytical output.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import threading
from contextlib import contextmanager
from pathlib import Path

try:  # The desktop runtime is macOS/Linux.  Keep imports possible on Windows.
    import fcntl
except ImportError:  # pragma: no cover - platform fallback
    fcntl = None


REPORT = "S1_S6_Q1_Q2_Aggregate_Report.md"
LABEL_RE = re.compile(r"^(?:R(?:[1-9]|1[0-9]|2[0-2])|R(?:6|13)_Fresh|audit_[0-9a-f]{32})$")
EVIDENCE_RE = re.compile(r"^E[0-9]{4,}$")
def AUDIT_ID_VALID(value):
    return isinstance(value,str) and bool(re.fullmatch(r'audit_[a-f0-9]{32}',value))
STAGES = frozenset(("S1", "S2", "S3", "S4", "Q1", "Q2", "S6"))
FINAL_IDS = tuple(f"R{number}" for number in range(1, 23))
DEMO_IDS = frozenset((
    "R1", "R2", "R3", "R4", "R5", "R6", "R6_Fresh", "R7", "R8", "R9",
    "R11", "R12", "R13", "R13_Fresh", "R14", "R15", "R16", "R17", "R19",
))
NO_CONTENT = {
    "R10": {
        "status": "NOT_PUBLISHABLE",
        "reason_code": "PROVIDER_SAFETY_RESTRICTION",
        "reason": "An explicit provider safety or policy restriction prevented completion of essential analytical stages.",
    },
    "R20": {
        "status": "NOT_PUBLISHABLE",
        "reason_code": "ESSENTIAL_ANALYSIS_INCOMPLETE",
        "reason": "Essential analytical stages are incomplete.",
    },
}
PROJECT_TITLES = {'R1':'NYC 311','R2':'WorldBank Poverty Classification','R3':'GBD Forecasting',
 'R4':'Malaga Parking','R5':'EPA CompTox MIEML','R6':'F-NMR','R7':'LBNL Electricity',
 'R8':'EPA PFAS HalfLife','R9':'Tornado Prediction','R11':'Chelsea Housing',
 'R12':'Insight Lane Crash Model','R13':'SubwayScience','R14':'Census BEACON',
 'R15':'WorldBank Big Data Poverty','R16':'NOAA WoFS ML Severe',
 'R21':'Regional HydroLSTM','R22':'Singapore GovTech LLM Evaluation'}
RECORD_FILES = {'S1':'purpose_record.json','S2':'evidence_record.json','S3':'construction_record.json',
 'S4':'learning_record.json','Q1':'data_shape_profile.json','Q2':'performance_record.json','S6':'audit_confidence_record.json'}


def _json(path: Path):
    if path.stat().st_size > 32*1024*1024:
        raise ValueError('Retained artifact exceeds the presentation read limit')
    return json.loads(path.read_text(encoding="utf-8"))


def _digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


class ProductLibrary:
    """Presentation adapter with an intentionally narrow ID-only interface."""

    def __init__(self, runtime, *, workspace=None, registry_path=None):
        self.runtime = runtime
        self.workspace = Path(workspace or runtime.workspace).resolve()
        self.outputs = (self.workspace / "outputs").resolve()
        self.demo_root = self.outputs / "UX_Content_Contract_2026-09-06" / "demo"
        self.final_root = (self.outputs / "Post_Holdout_Analytical_Repair_2026-09-05"
                           / "backend_v3" / "projects")
        self.q3_root = self.outputs / "Q3_Data_Preview_2026-09-06" / "qualification_v3"
        self.registry_path = Path(registry_path or self.outputs / "Primitive_Product_UX" / "library.json")
        self._lock = threading.RLock()

    @contextmanager
    def _registry(self, write=False):
        """Serialize registry updates and replace the JSON atomically."""
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self.registry_path.with_suffix(self.registry_path.suffix + ".lock")
        with lock_path.open("a+", encoding="utf-8") as lock_file:
            if fcntl:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                if self.registry_path.is_file():
                    try:
                        data = _json(self.registry_path)
                    except (OSError, json.JSONDecodeError):
                        data = {}
                else:
                    data = {}
                if not isinstance(data, dict):
                    data = {}
                data.setdefault("schema_version", 1)
                data.setdefault("hidden", {})
                data.setdefault("runtime", {})
                before = copy.deepcopy(data)
                yield data
                if write and data != before:
                    temp = self.registry_path.with_name(self.registry_path.name + ".tmp")
                    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    os.replace(temp, self.registry_path)
            finally:
                if fcntl:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _safe_file(self, path: Path, root: Path) -> Path:
        """Accept only a regular file physically contained in an allowed output root."""
        try:
            resolved = path.resolve(strict=True)
            allowed = root.resolve(strict=True)
        except OSError as exc:
            raise ValueError("An expected retained artifact is unavailable") from exc
        if resolved != path.absolute() or not resolved.is_relative_to(allowed) or not resolved.is_file():
            raise ValueError("Artifact is outside the authorized output package")
        return resolved

    def _title(self, audit_id):
        base=audit_id.split('_')[0]
        return base+(' · '+PROJECT_TITLES[base] if base in PROJECT_TITLES else '')+(' · Fresh snapshot' if audit_id.endswith('_Fresh') else '')

    def _project_root(self, audit_id):
        pid=self._fresh_project_id(audit_id) or audit_id
        if pid!=audit_id:
            return self.outputs/'Primitive_Runtime_Probe'/pid/'evaluation/projects'/pid
        return self.final_root/pid

    def _verify(self, root, pid, runtime=False):
        summary=_json(self._safe_file(root/'execution_summary.json',root))
        if (summary.get('project_id')!=pid or summary.get('integrity',{}).get('status')!='PASS'
                or summary.get('accounting',{}).get('status')!='RECONCILED'
                or summary.get('publication_eligibility',{}).get('status') not in ('PUBLISHABLE','PUBLISHABLE_WITH_LIMITATIONS')):
            raise ValueError('No verified publishable result is available')
        if runtime:
            ctx=self.outputs/'Primitive_Runtime_Probe'/pid
            context=_json(self._safe_file(ctx/'APP_CONTEXT.json',ctx))
            accepted=_json(self._safe_file(ctx/'evaluation/accepted_selection.json',ctx))
            terminal=_json(self._safe_file(ctx/'evaluation/EVALUATION_STATE.json',ctx))
            if (context.get('audit_id')!=pid or context.get('returncode')!=0 or accepted.get('project_id')!=pid
                    or accepted.get('publication')!=summary['publication_eligibility']
                    or accepted.get('status')!='VERIFIED_EXECUTION_REQUIRES_PRODUCT_REVIEW'
                    or terminal.get('project_id')!=pid or terminal.get('status')!='AWAITING_PRODUCT_REVIEW'):
                raise ValueError('Runtime completion is not verified')
        return summary

    def _canonical_content(self, root, pid):
        from apps.ux_editorial.presentation import component_records, passthrough_content
        records={}
        for stage,file in RECORD_FILES.items():
            path=root/'runs'/(stage+'__'+pid)/file
            if path.is_file():
                record=_json(self._safe_file(path,root))
                if record.get('project_id') not in (None,pid):raise ValueError('Stage identity differs')
                records[stage]=record
        # Validate optional S5 reads before the shared renderer follows them.
        signal_path=root/'runs'/('S5__'+pid)/'signal_index.json'
        if signal_path.is_file():
            index=_json(self._safe_file(signal_path,root))
            if index.get('project_id') not in (None,pid):raise ValueError('Signal identity differs')
            for signal in index.get('signals',[]):
                path=signal_path.parent/signal['record']
                if path.is_file():_json(self._safe_file(path,signal_path.parent))
        content={'project_id':pid,'components':component_records({s:r for s,r in records.items() if s in ('S1','S2','S3','S4')},[]),
                 'passthrough':passthrough_content(root,pid)}
        return content,records

    def _enrich(self, components, records):
        if not isinstance(components,list) or not components:
            raise ValueError('Presentation components are unavailable')
        components=copy.deepcopy(components)
        for component in components:
            for c in [component]+([component['explanation']] if component.get('explanation') else []):
                for entry in c.get('entries',[]):
                    value=entry.get('content')
                    if not isinstance(value,dict):raise ValueError('Malformed display content')
                    if 'text' in value:
                        valid=isinstance(value['text'],str)
                    elif 'items' in value:
                        valid=isinstance(value['items'],list) and all(isinstance(x,str) for x in value['items'])
                    else:
                        valid=isinstance(value.get('flows'),list) and all(
                            isinstance(f,dict) and isinstance(f.get('nodes'),list)
                            and all(isinstance(x,str) for x in f['nodes'])
                            and isinstance(f.get('label',''),str) for f in value['flows'])
                        valid=valid and all(isinstance(value.get(k,[]),list) and all(isinstance(x,str) for x in value.get(k,[])) for k in ('notes','caveats'))
                    if not valid:raise ValueError('Malformed display content')
                    try:
                        value=records[c['stage']]
                        for part in entry['pointer'].lstrip('/').split('/'):
                            part=part.replace('~1','/').replace('~0','~')
                            value=value[int(part)] if isinstance(value,list) else value[part]
                        entry['canonical_text']=value
                    except (KeyError,IndexError,ValueError,TypeError):entry['canonical_text']=None
        return components

    @staticmethod
    def _record_context(records):
        """Exact supporting context, downstream of canonical analysis."""
        def retained(value):
            if isinstance(value,list):return [retained(x) for x in value]
            if isinstance(value,dict):
                return {k:retained(v) for k,v in value.items()
                        if k not in ('excerpt','artifact_sha256','excerpt_sha256')}
            return value
        return {stage:{key:retained(records.get(stage,{}).get(key,[]))
                       for key in ('quantitative_notes','supporting_reconstruction')}
                for stage in ('S2','S3')}

    def _require_id(self, audit_id):
        if not isinstance(audit_id, str) or not LABEL_RE.fullmatch(audit_id):
            raise ValueError("Choose an audit from the product library")
        return audit_id

    def _publication(self, audit_id):
        if audit_id in NO_CONTENT:
            return copy.deepcopy(NO_CONTENT[audit_id])
        if audit_id.endswith("_Fresh"):
            summary = self.demo_root / audit_id / "content.json"
            if summary.is_file():
                return copy.deepcopy(_json(self._safe_file(summary, self.demo_root)).get("publication", {}))
        path = self._project_root(audit_id) / "AUDIT_PUBLICATION_STATUS.json"
        try:
            return copy.deepcopy(_json(self._safe_file(path, self._project_root(audit_id))))
        except (OSError, ValueError, json.JSONDecodeError):
            return {"status": "NOT_AVAILABLE", "reason_code": "PUBLICATION_STATUS_UNAVAILABLE",
                    "reason": "Publication status is unavailable."}

    def _runtime_binding(self):
        """Capture only the current runtime package identity, never its source path."""
        with self.runtime.lock:
            current = copy.deepcopy(getattr(self.runtime, "current", None))
        if not isinstance(current, dict) or not current.get("started"):
            return None
        audit_id = current.get("audit_id")
        project_id = current.get("project_id")
        output_root = current.get("output_root")
        context_root = current.get("context_root")
        if not all(isinstance(value, str) and value for value in (audit_id, project_id, output_root, context_root)):
            return None
        if not LABEL_RE.fullmatch(audit_id):
            return None
        try:
            output_path = Path(output_root).resolve(strict=False)
            context_path = Path(context_root).resolve(strict=False)
            runtime_root = (self.outputs / "Primitive_Runtime_Probe").resolve(strict=False)
            if (project_id!=audit_id or context_path!=runtime_root/audit_id or output_path!=context_path/'evaluation'):
                return None
        except ValueError:
            return None
        title = Path(str(current.get("selected_source", ""))).name or audit_id
        return {"id": audit_id, "project_id": project_id, "title": title,
                "output_root": str(output_path), "context_root": str(context_path)}

    def _remember_current(self):
        binding = self._runtime_binding()
        if not binding:
            return None
        with self._lock, self._registry(write=True) as registry:
            previous = registry["runtime"].get(binding["id"], {})
            previous.update(binding)
            registry["runtime"][binding["id"]] = previous
        return binding

    def remember(self):
        # Library persistence is optional and never alters live runtime completion.
        try:return self._remember_current()
        except (OSError,ValueError,TypeError):return None

    def _known_entry(self, audit_id):
        publication = self._publication(audit_id)
        has_content = (audit_id not in NO_CONTENT and (audit_id in DEMO_IDS or audit_id in ('R18','R21','R22'))
                       and (self._project_root(audit_id)/REPORT).is_file())
        return {
            "id": audit_id,
            "title": self._title(audit_id),
            "available": has_content,
            "editorial_mode": "PRESERVED" if audit_id in DEMO_IDS else "CANONICAL",
            "reason": publication.get('reason'),
            "publication": publication,
            "content_mode": "PRESERVED" if audit_id in DEMO_IDS else ("CANONICAL_FALLBACK" if has_content else "UNAVAILABLE"),
            "availability": "AVAILABLE" if has_content else "UNAVAILABLE",
            "q3status": "RETAINED_SNAPSHOT" if (self.q3_root / audit_id / "data_preview.json").is_file() else "NOT_AVAILABLE",
            "repository_url": None,
            "removable": True,
        }

    def list(self):
        """Return bounded audit entries and their reversible visibility flags."""
        current = self.remember()
        with self._lock, self._registry() as registry:
            hidden = set(registry["hidden"])
            runtime_entries = copy.deepcopy(registry["runtime"])
        entries = [self._known_entry(value) for value in FINAL_IDS]
        # Fresh preserved demos are distinct immutable audit packages.
        entries.extend(self._known_entry(value) for value in ("R6_Fresh", "R13_Fresh"))
        for audit_id, binding in runtime_entries.items():
            if AUDIT_ID_VALID(audit_id):
                publication=self._runtime_publication(binding)
                entries.append({"id": audit_id, "title": binding.get("title", audit_id),
                                "publication": publication,
                                "available": publication.get('status') in ('PUBLISHABLE','PUBLISHABLE_WITH_LIMITATIONS'),
                                "content_mode": "CURRENT_RUNTIME", "availability": "AVAILABLE",
                                "q3status": "CURRENT_RUNTIME", "repository_url": None, "removable": True})
        from apps.primitive_probe.editorial_revision import load_revision, title_from
        for entry in entries:
            if not entry.get('available'): continue
            entry['repository_url'] = self.repository_url(entry['id'])
            try:
                revision = load_revision(self, entry['id'])
                title = title_from(revision) if revision else None
                if not title and entry['id'] in runtime_entries:
                    title = self._runtime_audit(runtime_entries[entry['id']]).get('display_title')
                if title: entry.update(title=title, display_title=title)
            except (OSError,ValueError,KeyError,TypeError): pass
        return [{**entry,'hidden':entry['id'] in hidden} for entry in entries]

    def _runtime_publication(self, binding):
        root = Path(binding["output_root"]) / "projects" / binding["project_id"]
        try:
            data = self._verify(root,binding['project_id'],runtime=True)
            return copy.deepcopy(data['publication_eligibility'])
        except (OSError, ValueError, KeyError, TypeError):
            pass
        return {"status": "NOT_AVAILABLE", "reason_code": "RUNTIME_RESULT_UNAVAILABLE",
                "reason": "A verified runtime publication is not available."}

    def remove(self, audit_id):
        audit_id = self._require_id(audit_id)
        if audit_id not in {entry["id"] for entry in self.list()}:
            raise ValueError("Unknown audit")
        with self.runtime.lock:
            if self.runtime.busy and self.runtime.current.get('audit_id')==audit_id:
                raise ValueError('Wait for the running audit before removing it')
        with self._lock, self._registry(write=True) as registry:
            registry["hidden"][audit_id] = True
        return {"id": audit_id, "removed": True, "recoverable": True}

    def restore(self, audit_id):
        audit_id = self._require_id(audit_id)
        self._binding(audit_id)
        with self._lock, self._registry(write=True) as registry:
            registry["hidden"].pop(audit_id, None)
        return {"id": audit_id, "restored": True}

    def _binding(self, audit_id):
        audit_id = self._require_id(audit_id)
        if audit_id in FINAL_IDS or audit_id in ("R6_Fresh", "R13_Fresh"):
            return {"kind": "known", "id": audit_id, "project_id": audit_id}
        self.remember()
        with self._registry() as registry:
            binding = registry["runtime"].get(audit_id)
        if isinstance(binding, dict):
            if (binding.get('project_id')!=audit_id or Path(binding.get('context_root',''))!=self.outputs/'Primitive_Runtime_Probe'/audit_id
                    or Path(binding.get('output_root',''))!=self.outputs/'Primitive_Runtime_Probe'/audit_id/'evaluation'):
                raise ValueError('Library runtime binding differs')
            return {"kind": "runtime", **binding}
        raise ValueError("Unknown audit")

    def _demo_package(self, audit_id):
        root = self.demo_root / audit_id
        content = _json(self._safe_file(root / "content.json", self.demo_root))
        inputs = _json(self._safe_file(root / "inputs.json", self.demo_root))
        canonical_root=self._project_root(audit_id)
        if Path(inputs.get('canonical_root',''))!=canonical_root:
            raise ValueError('Editorial canonical binding differs')
        canonical = self._safe_file(root / "canonical.md", self.demo_root)
        if content.get("project_id") not in {audit_id, self._fresh_project_id(audit_id)}:
            raise ValueError("Retained presentation identity differs")
        source_hashes = inputs.get("source_sha256")
        if not isinstance(source_hashes, dict):
            raise ValueError("Retained presentation has no canonical binding")
        report_ok = False
        for raw_path, expected in source_hashes.items():
            candidate = Path(raw_path)
            candidate = self._safe_file(candidate, canonical_root)
            if not isinstance(expected, str) or _digest(candidate) != expected:
                raise ValueError("Retained presentation canonical hash differs")
            if candidate.name == REPORT:
                report_ok = True
                if canonical.read_bytes() != candidate.read_bytes():
                    raise ValueError("Retained presentation report differs from canonical")
        if not report_ok:
            raise ValueError("Retained presentation does not bind a canonical report")
        return content, inputs, canonical

    @staticmethod
    def _fresh_project_id(audit_id):
        # The retained content uses immutable runtime audit IDs for these labels.
        return {"R6_Fresh": "audit_a0833cf1052a46f7ab90d24f5b0d5961",
                "R13_Fresh": "audit_eb2978fa3882428185948ae3beaa1468",
                "R21":"audit_86bd22faae61470bacc32ff7984da941",
                "R22":"audit_9ba3ae22682e472f8dd62332de625a1c"}.get(audit_id)

    def _q3(self, audit_id, canonical_root=None):
        if audit_id.endswith("_Fresh"):
            project_id = self._fresh_project_id(audit_id)
        else:
            project_id = audit_id
        path = self.q3_root / audit_id / "data_preview.json"
        try:
            data = _json(self._safe_file(path, self.q3_root))
            if data.get("project_id") not in {audit_id, project_id}:
                raise ValueError("Q3 identity differs")
            from apps.q3_data_preview.service import validate
            validate(data,project_id)
            root = canonical_root or self._project_root(audit_id)
            for relative, expected in data.get("canonical_sha256", {}).items():
                target = self._safe_file(root / relative, root)
                if not isinstance(expected, str) or _digest(target) != expected:
                    raise ValueError("Q3 canonical hash differs")
            result = copy.deepcopy(data)
            result["retention"] = "RETAINED_SNAPSHOT"
            return result
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            return {"status": "NOT_AVAILABLE", "views": [], "reported_context": [],
                    "reason": "RETAINED_SNAPSHOT_VALIDATION_FAILED"}

    def audit(self, audit_id):
        from apps.primitive_probe.editorial_revision import apply_revision
        value = apply_revision(self, self._audit_legacy(audit_id))
        value['repository_url'] = self.repository_url(audit_id) if value.get('available') else None
        return value

    def repository_url(self, audit_id):
        from apps.primitive_probe.repository import repository_url
        binding = self._binding(audit_id)
        if audit_id in NO_CONTENT:
            return None
        if binding['kind'] == 'runtime':
            pid = binding['project_id']
            root = Path(binding['output_root']) / 'projects' / pid
        else:
            pid = self._fresh_project_id(audit_id) or audit_id
            root = self._project_root(audit_id)
        return repository_url(self.workspace, root, pid)

    def _audit_legacy(self, audit_id):
        binding=self._binding(audit_id)
        if audit_id in NO_CONTENT:
            return {'id':audit_id,'title':self._title(audit_id),'publication':self._publication(audit_id),
                    'available':False,'components':[],'passthrough':{},'q3':{},'canonical_available':False,
                    'repository_url':None,'editorial_mode':'UNAVAILABLE'}
        if binding['kind']=='runtime':return self._runtime_audit(binding)
        root=self._project_root(audit_id);pid=self._fresh_project_id(audit_id) or audit_id
        summary=self._verify(root,pid)
        fallback,records=self._canonical_content(root,pid)
        try:
            content,inputs,canonical=self._demo_package(audit_id);self._enrich(content['components'],records);mode='PRESERVED'
        except (OSError,ValueError,KeyError,TypeError,AttributeError):content=fallback;mode='CANONICAL'
        return {'id':audit_id,'title':self._title(audit_id),'publication':summary['publication_eligibility'],
                'available':True,'components':self._enrich(content['components'],records),
                'passthrough':fallback['passthrough'],'record_context':self._record_context(records),'q3':self._q3(audit_id,root),
                'canonical_available':True,'repository_url':None,'editorial_mode':mode}

    def _runtime_audit(self, binding):
        pid=binding['project_id'];root=Path(binding['output_root'])/'projects'/pid
        summary=self._verify(root,pid,runtime=True)
        fallback,records=self._canonical_content(root,pid)
        display=Path(binding['context_root'])/'ux_editorial'
        mode='CANONICAL';content=fallback
        try:
            inputs=_json(self._safe_file(display/'inputs.json',display))
            if Path(inputs.get('canonical_root',''))!=root:raise ValueError('Editorial root differs')
            hashes=inputs.get('source_sha256',{})
            if str(root/REPORT) not in hashes:raise ValueError('Editorial report binding missing')
            for path,expected in hashes.items():
                if _digest(self._safe_file(Path(path),root))!=expected:raise ValueError('Editorial input changed')
            candidate=_json(self._safe_file(display/'content.json',display))
            if candidate.get('project_id')!=pid:raise ValueError('Editorial identity differs')
            self._enrich(candidate['components'],records)
            content=candidate;mode='PRESERVED'
        except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
        q3={'status':'NOT_AVAILABLE','views':[],'reported_context':[]}
        try:
            path=Path(binding['context_root'])/'q3_data_preview/data_preview.json'
            value=_json(self._safe_file(path,Path(binding['context_root'])))
            from apps.q3_data_preview.service import validate
            validate(value,pid)
            for path,expected in value.get('canonical_sha256',{}).items():
                if _digest(self._safe_file(root/path,root))!=expected:raise ValueError('Preview canonical changed')
            value['retention']='RETAINED_SNAPSHOT';q3=value
        except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
        from apps.primitive_probe.editorial_revision import title_from
        qualified=content.get('content_contract_version') in ('2.8','2.9','2.10')
        display_title=title_from(content) if qualified else None
        return {'id':pid,'title':display_title or binding.get('title',pid),'display_title':display_title,'editorial_qualified':qualified,'publication':summary['publication_eligibility'],
                'available':True,'components':self._enrich(content['components'],records),
                'passthrough':fallback['passthrough'],'record_context':self._record_context(records),'q3':q3,'canonical_available':True,
                'repository_url':None,'editorial_mode':mode}

    def report(self, audit_id):
        binding=self._binding(audit_id)
        if audit_id in NO_CONTENT:raise ValueError('No canonical report is exposed for this entry')
        pid=binding['project_id'] if binding['kind']=='runtime' else self._fresh_project_id(audit_id) or audit_id
        root=Path(binding['output_root'])/'projects'/pid if binding['kind']=='runtime' else self._project_root(audit_id)
        self._verify(root,pid,runtime=binding['kind']=='runtime')
        data=self._safe_file(root/REPORT,root).read_bytes()
        return data,hashlib.sha256(data).hexdigest()

    def evidence(self, audit_id, stage, evidence_id):
        binding=self._binding(audit_id)
        if stage not in STAGES or not isinstance(evidence_id,str) or not EVIDENCE_RE.fullmatch(evidence_id):
            raise ValueError('Choose a stage-scoped evidence reference')
        if audit_id in NO_CONTENT:raise ValueError('No evidence is exposed for this entry')
        pid=binding['project_id'] if binding['kind']=='runtime' else self._fresh_project_id(audit_id) or audit_id
        root=Path(binding['output_root'])/'projects'/pid if binding['kind']=='runtime' else self._project_root(audit_id)
        self._verify(root,pid,runtime=binding['kind']=='runtime')
        path=root/'runs'/(stage+'__'+pid)/'evidence_registry.json'
        if not path.is_file():return {'status':'NOT_AVAILABLE','reason':'No retained registry for this stage.'}
        registry=_json(self._safe_file(path,root))
        if not isinstance(registry,list):raise ValueError('Evidence registry is malformed')
        matches=[e for e in registry if isinstance(e,dict) and e.get('evidence_id')==evidence_id]
        if len(matches)!=1:raise ValueError('The reference is not unique in this stage')
        return {'stage':stage,'project_id':pid,**copy.deepcopy(matches[0])}
