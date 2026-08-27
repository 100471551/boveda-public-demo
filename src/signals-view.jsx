import React, { useEffect, useState } from "react";
import { buildFindingsPresentation } from "./findings-presentation.mjs";
import { displayReconstructionText, displayStateLabel } from "./reconstruction-display.mjs";
import { friendlyCheckResult } from "./communication-copy.mjs";

const RESULT_ICON = {
  "SIGNAL PRESENT": "/ui/icons/alert_2.svg",
  "NO SIGNAL DETECTED": "/ui/icons/check.svg",
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function StatusDot({ state, onClick, className = "" }) {
  if (!state?.colour) return null;
  const title = `${displayStateLabel(state)}. Reasons: ${state.state_reason_ids?.join(", ") || "not available"}`;
  const marker = <span />;
  return onClick
    ? <button type="button" className={`status-dot status-dot--${state.colour} ${className}`} aria-label={title} title={title} onClick={onClick}>{marker}</button>
    : <span className={`status-dot status-dot--${state.colour} ${className}`} aria-label={title} title={title}>{marker}</span>;
}

export function CoverageIndicator({ coverage, onInspect }) {
  if (!coverage) return null;
  return <button type="button" className="coverage-indicator" onClick={() => onInspect({ type: "coverage", id: "project-evidence-coverage" })}>
    <span className="coverage-indicator__content">
      <small>Project Evidence Coverage</small>
      <span className="coverage-indicator__status"><StatusDot state={coverage} className="coverage-indicator__dot" /><strong>{coverage.label}</strong></span>
    </span>
  </button>;
}

function ResultIcon({ result }) {
  const source = RESULT_ICON[result];
  if (source) return <img src={source} alt="" aria-hidden="true" />;
  return <span aria-hidden="true">{result === "NOT APPLICABLE" ? "—" : "?"}</span>;
}

function EvidencePills({ evidenceIds, onEvidence }) {
  const visible = evidenceIds.slice(0, 3);
  return <div className="evidence-pills">{visible.map((id, index) => <button type="button" className={`evidence-pill evidence-pill--${index % 3}`} onClick={() => onEvidence(id)} key={id}>{id}</button>)}{evidenceIds.length > visible.length ? <button type="button" className="evidence-pill evidence-pill--more" onClick={() => onEvidence(evidenceIds)}>+{evidenceIds.length - visible.length}</button> : null}</div>;
}

function CheckSummary({ execution, onInspect }) {
  return <button type="button" className={`check-summary check-summary--${execution.result.toLowerCase().replaceAll(" ", "-")}`} onClick={() => onInspect({ type: "check", id: execution.execution_id })}>
    <ResultIcon result={execution.result} />
    <span className="check-summary__copy"><small>{friendlyCheckResult(execution.result)}</small><span>{displayReconstructionText(execution.result_summary)}</span></span>
  </button>;
}

function FindingReference({ finding, onInspect }) {
  return <button type="button" className={`finding-reference finding-reference--${finding.finding_type}`} onClick={() => onInspect({ type: "finding", id: finding.finding_id })}>
    <span>{finding.finding_type === "signal" ? "⚠" : "!"}</span>{finding.name}
  </button>;
}

function FindingRow({ row, checks, findings, onInspect, onEvidence }) {
  return <article className="signals-row">
    <div className="signals-cell signals-cell--area"><button type="button" onClick={() => onInspect({ type: "row", id: row.id })}>{row.area}</button></div>
    <div className="signals-cell signals-cell--status"><button type="button" className="status-button" onClick={() => onInspect({ type: "row", id: row.id })}><span>{displayStateLabel(row.state)}</span><i className={`status-bars status-bars--${row.state.colour}`}>{Array.from({ length: 5 }, (_, index) => <b className={index < ({ green: 5, amber: 3, red: 5, grey: 0 }[row.state.colour] || 0) ? "is-filled" : ""} key={index} />)}</i></button></div>
    <div className="signals-cell signals-cell--summary"><p>{displayReconstructionText(row.summary)}</p></div>
    <div className="signals-cell signals-cell--checks">{checks.length ? checks.map((execution) => <CheckSummary execution={execution} onInspect={onInspect} key={execution.execution_id} />) : <span className="check-not-implemented">Checks not implemented in Alpha</span>}</div>
    <div className="signals-cell signals-cell--findings">{findings.length ? findings.map((finding) => <FindingReference finding={finding} onInspect={onInspect} key={finding.finding_id} />) : <span className="findings-empty">No Finding</span>}</div>
    <div className="signals-cell signals-cell--evidence"><EvidencePills evidenceIds={row.evidence_ids} onEvidence={onEvidence} /></div>
  </article>;
}

export function SignalsView({ layer, focusTarget, onFocusHandled, onInspect, onEvidence }) {
  const [signalLimit, setSignalLimit] = useState(3);
  useEffect(() => setSignalLimit(3), [layer?.audit_id]);
  useEffect(() => {
    if (!focusTarget || !layer) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const heading = document.getElementById(focusTarget === "gaps" ? "gaps-heading" : "signals-heading");
      heading?.closest(".finding-group")?.scrollIntoView({ behavior: "smooth", block: "start" });
      heading?.focus({ preventScroll: true });
      onFocusHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusTarget, layer?.audit_id, onFocusHandled]);
  if (!layer) return <section className="signals-empty"><strong>Findings unavailable</strong><p>The independent Findings layer could not establish a view. The stored Overview remains available and unchanged.</p></section>;
  const checks = new Map(layer.checks.map((execution) => [execution.execution_id, execution]));
  const findings = new Map(layer.findings.map((finding) => [finding.finding_id, finding]));
  const families = unique(layer.rows.map((row) => row.family));
  const presentation = buildFindingsPresentation(layer);
  const visibleSignals = presentation.signals.slice(0, signalLimit);
  return <section className="signals-view" aria-label="Findings">
    <div className="signals-intro"><div className="signals-intro__copy"><h2>What needs attention</h2><p>Bóveda brings together conditions that may affect how the project should be understood or reviewed, along with places where the available project record is incomplete.</p></div><dl className="signals-summary-metrics"><div><dd>{presentation.signals.length}</dd><dt><img src="/ui/Findings_Signals.svg" alt="" aria-hidden="true" />Signals</dt></div><div><dd>{presentation.evidence_gaps.length}</dd><dt><img src="/ui/Findings_Evidence_Gaps.svg" alt="" aria-hidden="true" />Evidence Gaps</dt></div><div><dd>{layer.checks.length}</dd><dt><img src="/ui/Findings_Checks.svg" alt="" aria-hidden="true" />Checks performed</dt></div></dl></div>
    <div className="findings-attention">
      {presentation.signals.length ? <section className="finding-group finding-group--signals" aria-labelledby="signals-heading"><div className="finding-group__heading"><div className="finding-group__title"><img className="finding-section-icon finding-section-icon--signals" src="/ui/Findings_Signals.svg" alt="" aria-hidden="true" /><h3 id="signals-heading" tabIndex="-1">Signals <small>({presentation.signals.length})</small></h3></div><p>Bóveda had enough evidence to check these conditions, and the deterministic conditions were present.</p></div><div className="finding-card-list">{visibleSignals.map((item) => <SupervisorFindingCard item={item} onInspect={onInspect} key={item.signal_id} />)}</div>{presentation.signals.length > signalLimit ? <button type="button" className="findings-more" aria-expanded="false" onClick={() => setSignalLimit(presentation.signals.length)}>More</button> : signalLimit > 3 && presentation.signals.length > 3 ? <button type="button" className="findings-more" aria-expanded="true" onClick={() => setSignalLimit(3)}>Show fewer</button> : null}</section> : <section className="finding-group finding-group--empty" aria-label="Signals"><div><span>Signals</span><strong>No material project condition was detected by the implemented checks.</strong></div><p>Successful and unresolved check results remain available below.</p></section>}
      {presentation.evidence_gaps.length ? <section className="finding-group finding-group--gaps" aria-labelledby="gaps-heading"><div className="finding-group__heading"><div className="finding-group__title"><img className="finding-section-icon finding-section-icon--gaps" src="/ui/Findings_Evidence_Gaps.svg" alt="" aria-hidden="true" /><h3 id="gaps-heading" tabIndex="-1">Evidence Gaps <small>({presentation.evidence_gaps.length})</small></h3></div><p>These are places where Bóveda could not find enough evidence to fully verify or reproduce part of the project. A gap does not mean something is wrong; it means the available record is incomplete.</p></div><div className="finding-card-list">{presentation.evidence_gaps.map((item) => <SupervisorFindingCard item={item} onInspect={onInspect} key={item.evidence_gap_id} />)}</div></section> : null}
    </div>
    <details className="checks-performed">
      <summary><span><strong><img className="finding-section-icon finding-section-icon--checks" src="/ui/Findings_Checks.svg" alt="" aria-hidden="true" />Checks performed <em>({layer.checks.length})</em></strong><small>See what Bóveda checked and what each check found.</small></span><b aria-hidden="true">⌄</b></summary>
      <div className="checks-performed__intro"><p>Checks are the individual questions Bóveda tests against the project evidence. Open them to see what was tested, what Bóveda found and which evidence supports the result.</p></div>
      <div className="signals-table">
        <div className="signals-table__header"><span>Area</span><span>Status</span><span>Summary</span><span>Checks</span><span>Findings</span><span>Evidence</span></div>
        {families.map((family) => <section className="signals-family" key={family}><h3>{family}</h3>{layer.rows.filter((row) => row.family === family).map((row) => <FindingRow row={row} checks={row.check_execution_ids.map((id) => checks.get(id)).filter(Boolean)} findings={row.finding_ids.map((id) => findings.get(id)).filter(Boolean)} onInspect={onInspect} onEvidence={onEvidence} key={row.id} />)}</section>)}
      </div>
    </details>
  </section>;
}

function SupervisorFindingCard({ item, onInspect }) {
  const scopes = unique([item.primary_scope, ...item.secondary_scopes]);
  const isGap = item.finding_type === "evidence_gap";
  const severityClass = !isGap && item.severity ? ` supervisor-finding--severity-${item.severity.toLowerCase()}` : "";
  return <article className={`supervisor-finding supervisor-finding--${item.finding_type}${severityClass}`}>
    <div className="finding-badges"><span className="supervisor-finding__type">{isGap ? "Evidence Gap" : "Signal"}</span>{!isGap && item.severity ? <span className="supervisor-finding__severity">Severity · {item.severity}</span> : null}</div>
    <h4>{item.title}</h4>
    <p className="supervisor-finding__condition">{displayReconstructionText(item.condition_summary)}</p>
    <div className="supervisor-finding__why"><strong>Why this matters</strong><p>{displayReconstructionText(item.why_it_matters)}</p></div>
    {scopes.length ? <div className="supervisor-finding__scopes" aria-label="Scope">{scopes.map((scope) => <span key={scope}>{scope}</span>)}</div> : null}
    <button type="button" className="supervisor-finding__trail" onClick={() => onInspect(item.trail_entry)}>{isGap ? "View missing evidence" : "View trail"}<img src="/ui/Trail_Arrow.svg" alt="" aria-hidden="true" /></button>
  </article>;
}

function TokenButtons({ ids, onEvidence }) {
  if (!ids?.length) return <span className="detail-empty">None recorded</span>;
  return <div className="detail-tokens">{ids.map((id) => <button type="button" onClick={() => onEvidence(id)} key={id}>{id}</button>)}</div>;
}

function StateBlock({ state }) {
  return <div className={`detail-state detail-state--${state.colour}`}><StatusDot state={state} /><span><strong>{displayStateLabel(state)}</strong><small>{state.state_reason_ids?.join(" · ") || "No state information"}</small></span></div>;
}

function CheckDetail({ execution, onEvidence }) {
  return <>
    <div className="eyebrow">Deterministic check · {execution.check_id} · v{execution.check_version}</div>
    <h2>{execution.label}</h2>
    <div className={`canonical-result canonical-result--${execution.result.toLowerCase().replaceAll(" ", "-")}`}><ResultIcon result={execution.result} /><span><strong>{friendlyCheckResult(execution.result)}</strong><small>{execution.result} · {displayReconstructionText(execution.result_summary)}</small></span></div>
    <section><h3>Question and applicability</h3><p>{execution.question_ids.join(" · ")}</p><p>{execution.applicability_reason}</p></section>
    <section><h3>Operation</h3><p>{execution.operation}</p><dl><div><dt>Scope</dt><dd>{execution.scope.display_label || execution.scope.workstream} · {execution.scope.audit_id}</dd></div><div><dt>Rule</dt><dd>{execution.materiality_rule.version}</dd></div><div><dt>Materiality</dt><dd>{execution.materiality.level}</dd></div></dl></section>
    <section><h3>Evidence trail</h3><TokenButtons ids={execution.evidence.supporting} onEvidence={onEvidence} /></section>
    {execution.trail.graph_object_refs?.length ? <section><h3>Reconstruction graph inputs</h3><ul>{execution.trail.graph_object_refs.map((reference, index) => <li key={`${reference.object_id}-${reference.role}-${index}`}><strong>{reference.object_type}</strong> · {reference.role} · {reference.object_id}</li>)}</ul></section> : null}
    {execution.gaps.length ? <section><h3>Explicit gaps</h3><ul>{execution.gaps.map((gap) => <li key={gap.gap_id}><strong>{gap.gap_id}</strong>{gap.description} · {gap.claim_effect}</li>)}</ul></section> : null}
    <section><h3>Claim boundary</h3><p>{execution.allowed_claims.join(" ")}</p><ul>{execution.prohibited_claims.map((claim) => <li key={claim}>{claim}</li>)}</ul></section>
  </>;
}

function FindingDetail({ finding, layer, onEvidence, onInspect }) {
  const fieldLabels = layer.overview.fields;
  const coverageLabels = Object.fromEntries(layer.project_evidence_coverage.domains.map((domain) => [domain.id, domain.label]));
  const typeLabel = finding.finding_type === "signal" ? "Signal" : "Evidence Gap";
  return <>
    <div className="eyebrow">Canonical {typeLabel} · {finding.finding_id}</div>
    <h2>{finding.name}</h2>
    <div className="signal-materiality"><span>{finding.materiality.level} materiality</span><strong>{finding.producing_check.result}</strong></div>
    <section><h3>{finding.finding_type === "signal" ? "Reconstructed condition" : "What Bóveda could not establish"}</h3><p>{displayReconstructionText(finding.condition)}</p><p>{displayReconstructionText(finding.explanation)}</p></section>
    <section><h3>Affected objects</h3><ul className="impact-list">{finding.impacts.map((impact) => <li key={`${impact.object_type}-${impact.object_id}-${impact.claim_effect}`}><span>{fieldLabels[impact.object_id]?.label || coverageLabels[impact.object_id] || "Project Evidence Coverage"}</span><strong>{impact.claim_effect}</strong><small>{impact.impact_reason}</small></li>)}</ul></section>
    {finding.confidence_impact ? <section><h3>Reconstruction confidence effect</h3><p>{finding.confidence_impact.claim_effect} · maximum {finding.confidence_impact.blocks_primary_existence ? 0 : finding.confidence_impact.cap}/8</p></section> : null}
    <section><h3>Canonical evidence trail</h3><TokenButtons ids={unique(Object.values(finding.evidence).flat())} onEvidence={onEvidence} /></section>
    <section><h3>Deterministic check trail</h3>{finding.related_check_execution_ids.map((executionId) => { const execution = layer.checks.find((item) => item.execution_id === executionId); return execution ? <button type="button" className="detail-signal-link" onClick={() => onInspect({ type: "check", id: executionId })} key={executionId}>{execution.result} · {execution.label}{execution.scope.display_label ? ` · ${execution.scope.display_label}` : ""}</button> : null; })}</section>
    <section><h3>Allowed claim</h3><p>{finding.claims.allowed.join(" ")}</p><h3>Prohibited overclaims</h3><ul>{finding.claims.prohibited.map((claim) => <li key={claim}>{claim}</li>)}</ul></section>
    <section><h3>Open alternatives and gaps</h3><ul>{[...finding.alternatives, ...finding.gaps.map((gap) => `${gap.gap_id}: ${gap.description}`)].map((item) => <li key={item}>{item}</li>)}</ul></section>
  </>;
}

function RowDetail({ row, layer, onInspect }) {
  const checksById = Map.groupBy(layer.checks, (execution) => execution.check_id);
  const fieldIds = row.field_ids || [];
  const fields = fieldIds.map((id) => layer.overview.fields[id]).filter(Boolean);
  const domain = layer.project_evidence_coverage.domains.find((item) => item.id === row.id);
  const questions = domain?.questions || fields.flatMap((field) => field.questions.map((question) => ({ ...question, field_label: field.label })));
  return <>
    <div className="eyebrow">{row.family}</div><h2>{row.area}</h2><StateBlock state={row.state} /><p className="detail-summary">{displayReconstructionText(row.summary)}</p>
    {fields.length ? <section><h3>Canonical fields</h3><div className="detail-fields">{fields.map((field) => <div key={field.id}><span>{field.label}</span>{field.state.state ? <StateBlock state={field.state} /> : <small>Not assessed — no Alpha check implemented</small>}</div>)}</div></section> : null}
    <section><h3>Supervisory questions</h3><div className="detail-questions">{questions.map((question) => <article key={`${question.field_label || row.id}-${question.id}`}><small>{question.field_label ? `${question.field_label} · ` : ""}{question.id}</small><p>{question.text}</p>{question.check_ids.length ? question.check_ids.flatMap((id) => { const executions = checksById.get(id) || []; return executions.length ? executions.map((execution) => <button type="button" onClick={() => onInspect({ type: "check", id: execution.execution_id })} key={execution.execution_id}>{execution.result} · {execution.label}{execution.scope.display_label ? ` · ${execution.scope.display_label}` : ""}</button>) : [<span key={id}>Check not run</span>]; }) : <span>Check not implemented in Alpha</span>}</article>)}</div></section>
    {row.finding_ids.length ? <section><h3>Canonical Findings</h3>{row.finding_ids.map((id) => <button type="button" className="detail-signal-link" onClick={() => onInspect({ type: "finding", id })} key={id}>{id} · {layer.findings.find((finding) => finding.finding_id === id)?.name}</button>)}</section> : null}
  </>;
}

function CoverageDetail({ layer, onInspect }) {
  const coverage = layer.project_evidence_coverage;
  return <><div className="eyebrow">Transversal evidence property</div><h2>Project Evidence Coverage</h2><StateBlock state={coverage} /><p className="detail-summary">How far Bóveda can reconstruct and justify what it establishes about this project. This is not a project, model, compliance, governance, documentation, or risk score.</p><section><h3>Coverage domains</h3><div className="coverage-domain-links">{coverage.domains.map((domain) => <button type="button" onClick={() => onInspect({ type: "row", id: domain.id })} key={domain.id}><StatusDot state={domain.state} /><span><strong>{domain.label}</strong><small>{displayStateLabel(domain.state)}</small></span></button>)}</div></section></>;
}

function StateDetail({ id, layer, onInspect }) {
  const field = layer.overview.fields[id];
  const section = layer.overview.sections.find((item) => item.id === id);
  const state = field?.state || section?.state;
  const label = field?.label || section?.label || id;
  const checkIds = field?.check_execution_ids || unique((section?.groups || []).flatMap((group) => group.field_ids).flatMap((fieldId) => layer.overview.fields[fieldId]?.check_execution_ids || []));
  const findingIds = field?.finding_ids || unique((section?.groups || []).flatMap((group) => group.field_ids).flatMap((fieldId) => layer.overview.fields[fieldId]?.finding_ids || []));
  return <><div className="eyebrow">Overview evidence state</div><h2>{label}</h2><StateBlock state={state} /><section><h3>State reasons</h3><p>Aggregation is deterministic. The colour is an entry point to the check and Finding trail, not a project score.</p>{state.state_reason_ids?.length ? <div className="detail-tokens">{state.state_reason_ids.map((reasonId) => { const execution = layer.checks.find((item) => item.execution_id === reasonId || item.gaps.some((gap) => gap.gap_id === reasonId)); const finding = layer.findings.find((item) => item.finding_id === reasonId); return execution ? <button type="button" onClick={() => onInspect({ type: "check", id: execution.execution_id })} key={reasonId}>{reasonId}</button> : finding ? <button type="button" onClick={() => onInspect({ type: "finding", id: finding.finding_id })} key={reasonId}>{reasonId}</button> : <span key={reasonId}>{reasonId}</span>; })}</div> : <span className="detail-empty">No assessed state reason</span>}</section>{section ? <section><h3>Semantic groups</h3><div className="coverage-domain-links">{section.groups.map((group) => <button type="button" onClick={() => onInspect({ type: "row", id: group.id })} key={group.id}><StatusDot state={group.state} /><span><strong>{group.label}</strong><small>{displayStateLabel(group.state)}</small></span></button>)}</div></section> : null}<section><h3>Connected checks and Findings</h3>{checkIds.map((executionId) => { const execution = layer.checks.find((item) => item.execution_id === executionId); return execution ? <button type="button" className="detail-signal-link" onClick={() => onInspect({ type: "check", id: executionId })} key={executionId}>{execution.result} · {execution.label}</button> : null; })}{findingIds.map((findingId) => <button type="button" className="detail-signal-link" onClick={() => onInspect({ type: "finding", id: findingId })} key={findingId}>{findingId} · {layer.findings.find((finding) => finding.finding_id === findingId)?.name}</button>)}</section></>;
}

export function SignalsDetailDrawer({ selection, layer, onClose, onInspect, onEvidence }) {
  if (!selection || !layer) return null;
  const check = selection.type === "check" ? layer.checks.find((item) => item.execution_id === selection.id) : null;
  const finding = selection.type === "finding" ? layer.findings.find((item) => item.finding_id === selection.id) : null;
  const row = selection.type === "row" ? layer.rows.find((item) => item.id === selection.id) : null;
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="signals-detail-drawer"><button className="drawer-close" onClick={onClose}>×</button>{check ? <CheckDetail execution={check} onEvidence={onEvidence} /> : finding ? <FindingDetail finding={finding} layer={layer} onEvidence={onEvidence} onInspect={onInspect} /> : row ? <RowDetail row={row} layer={layer} onInspect={onInspect} /> : selection.type === "state" ? <StateDetail id={selection.id} layer={layer} onInspect={onInspect} /> : <CoverageDetail layer={layer} onInspect={onInspect} />}</aside></div>;
}
