import React, { useEffect, useState } from "react";

function EvidenceTokens({ ids, onEvidence }) {
  if (!ids.length) return <span className="history-empty-value">No Evidence Token applies; this event is supported by the Bóveda audit record.</span>;
  return <div className="history-evidence">{ids.map((id, index) => <button type="button" className={`evidence-pill evidence-pill--${index % 3}`} onClick={() => onEvidence(id)} key={id}>{id}</button>)}</div>;
}

function sourceLabel(source) {
  return source === "boveda" ? "Bóveda" : "Host project";
}

function typeLabel(type) {
  return ({ data_period: "Data period", evaluation: "Evaluation", boveda_audit: "Audit", git_commit: "Git commit", git_tag: "Git tag", execution: "Execution", changed_file: "Changed file", mlflow_run: "MLflow run" })[type] || String(type).replaceAll("_", " ");
}

function HistoryEvent({ event, onEvidence, onDiagnostics, supporting = false }) {
  const boveda = event.source === "boveda";
  return <details className={`history-event history-event--${event.source} ${supporting ? "history-event--supporting" : ""}`}>
    <summary>
      <time>{event.date.label}</time>
      <span className="history-event__rail"><i /></span>
      <span className="history-event__summary"><span className="history-event__meta"><b>{sourceLabel(event.source)}</b><small>{typeLabel(event.event_type)}</small>{event.status === "completed_after_retry" ? <em>Completed after retry</em> : null}</span><strong>{event.title}</strong><span>{event.description}</span></span>
      <span className="history-event__open" aria-hidden="true">+</span>
    </summary>
    <div className="history-event__detail">
      <section><h3>Supporting trail</h3><EvidenceTokens ids={event.evidence_ids} onEvidence={onEvidence} />{boveda ? <button type="button" className="history-audit-link" onClick={onDiagnostics}>Open audit diagnostics →</button> : null}</section>
      {event.related.length ? <section><h3>Related record objects</h3><ul>{event.related.map((item) => <li key={`${item.type}-${item.id}`}><span>{typeLabel(item.type)}</span><strong>{item.label || item.id}</strong><small>{item.id}</small></li>)}</ul></section> : null}
      {event.finding_ids.length ? <section><h3>Explicitly related Findings</h3><p>{event.finding_ids.join(" · ")}</p></section> : null}
      {event.materiality ? <section><h3>Materiality</h3><p>{event.materiality.level === "material" ? event.materiality.reasons.join(" · ") : "Valid reconstructed activity retained as supporting detail; no deterministic materiality rule was met."}</p></section> : null}
      <section><h3>Reconstruction status</h3><p>{event.epistemic.replaceAll("_", " / ")}{event.limitation ? ` · ${event.limitation}` : ""}</p></section>
    </div>
  </details>;
}

export function HistoryView({ layer, onEvidence, onDiagnostics }) {
  const [visibleSupporting, setVisibleSupporting] = useState(60);
  useEffect(() => setVisibleSupporting(60), [layer?.audit_id]);
  if (!layer) return <section className="history-view"><div className="history-empty"><strong>History unavailable</strong><p>The passive History projection could not be loaded. Overview and Findings remain unchanged.</p></div></section>;
  return <section className="history-view">
    <header className="history-intro"><div><span className="eyebrow">Material chronology</span><h2>How the project reached its current state</h2></div><div><p>{layer.presentation?.summary || "Bóveda retained the material events that could be supported by the available project history. Dates or reasons that were not recorded remain unresolved."}</p><dl><div><dt>Material host</dt><dd>{layer.host_event_count}</dd></div><div><dt>Supporting</dt><dd>{layer.supporting_event_count}</dd></div><div><dt>Bóveda</dt><dd>{layer.boveda_event_count}</dd></div></dl></div></header>
    <div className="history-timeline">{layer.events.map((event) => <HistoryEvent event={event} onEvidence={onEvidence} onDiagnostics={onDiagnostics} key={event.event_id} />)}</div>
    {layer.supporting_events.length ? <details className="history-supporting"><summary><span>Supporting project activity</span><strong>{layer.supporting_event_count}</strong></summary><p>These are genuine recorded changes that Bóveda could not connect to a material data, model, evaluation, or release decision. They remain available as context without being presented as client-facing milestones.</p><div className="history-timeline history-timeline--supporting">{layer.supporting_events.slice(0, visibleSupporting).map((event) => <HistoryEvent event={event} onEvidence={onEvidence} onDiagnostics={onDiagnostics} supporting key={event.event_id} />)}</div>{visibleSupporting < layer.supporting_events.length ? <button type="button" className="history-show-more" onClick={() => setVisibleSupporting((value) => value + 60)}>Show 60 more of {layer.supporting_events.length}</button> : null}</details> : null}
    {layer.limitations.length ? <details className="history-limitations"><summary>History reconstruction limits</summary><ul>{layer.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
  </section>;
}
