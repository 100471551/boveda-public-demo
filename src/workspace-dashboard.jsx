import React, { useMemo } from "react";
import { version as applicationVersion } from "../package.json";
import { buildWorkspaceSummary } from "./workspace-summary.mjs";

function AssetIcon({ name }) {
  return <img className="ui-icon" src={`/ui/${name}.svg`} alt="" aria-hidden="true" />;
}

function Brand() {
  return <div className="workspace-brand"><div className="brand"><img className="brand__logo" src="/Boveda_Logo_Black.svg" alt="Bóveda" /><span className="brand__demo">Demo</span></div></div>;
}

function formatActivityDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function confidenceLabel(confidence) {
  if (!confidence) return "Confidence unavailable";
  const score = Number(confidence.score);
  if (!Number.isFinite(score)) return confidence.label || "Confidence unavailable";
  return `${confidence.label || "Reconstruction confidence"} · ${score}/8`;
}

export function WorkspaceDashboard({ projects, layersByProject, onProjects, onOpenProject, onOpenFindings, onImport, loading = false }) {
  const summary = useMemo(() => buildWorkspaceSummary(projects, layersByProject), [projects, layersByProject]);
  const signals = summary.signals.slice(0, 4);
  const activity = summary.activity.slice(0, 5);

  return <main className="workspace-dashboard">
    <Brand />
    <div className="workspace-dashboard__inner">
      <header className="workspace-dashboard__header">
        <div><span className="workspace-dashboard__eyebrow">Workspace overview</span><h1>What needs your attention?</h1><p>A supervisory view across the projects and evidence currently in Bóveda.</p></div>
        <button type="button" className="workspace-import" onClick={onImport} data-demo-disabled="true"><AssetIcon name="Import_Plus" />Import new project</button>
      </header>

      <section className="workspace-kpis" aria-label="Workspace totals">
        <button type="button" className="workspace-kpi workspace-kpi--primary" onClick={onProjects}><span>Active Projects</span><strong>{summary.activeProjects}</strong><small>Pre-analysed projects under supervision</small><AssetIcon name="Folder" /></button>
        <button type="button" className="workspace-kpi" onClick={() => summary.attention[0] && onOpenFindings(summary.attention[0].projectId)}><span>Open Signals</span><strong>{summary.openSignals}</strong><small>Deterministic conditions requiring review</small><AssetIcon name="Findings_Signals" /></button>
        <button type="button" className="workspace-kpi" onClick={() => summary.attention[0] && onOpenFindings(summary.attention[0].projectId)}><span>Evidence Gaps</span><strong>{summary.evidenceGaps}</strong><small>Material gaps across the current records</small><AssetIcon name="Findings_Evidence_Gaps" /></button>
      </section>

      {loading ? <section className="workspace-loading" aria-label="Loading workspace"><span /></section> : <div className="workspace-dashboard__grid">
        <section className="workspace-panel workspace-attention">
          <header><div><span className="workspace-panel__eyebrow">Priority view</span><h2>Projects requiring attention</h2></div><button type="button" onClick={onProjects}>View all projects <AssetIcon name="Arrow_Forward" /></button></header>
          <div className="workspace-attention__list">{summary.attention.map((project, index) => <article className="workspace-project-row" key={project.projectId}>
            <button type="button" className="workspace-project-row__main" onClick={() => onOpenProject(project.projectId)}>
              <span className="workspace-project-row__number">{String(index + 1).padStart(2, "0")}</span>
              <span className="workspace-project-row__copy"><strong>{project.title}</strong><small>{project.purpose}</small></span>
            </button>
            <button type="button" className="workspace-project-row__findings" onClick={() => onOpenFindings(project.projectId)} aria-label={`Open findings for ${project.title}`}>
              <span className="workspace-pill workspace-pill--signal">{project.signalCount} Signal{project.signalCount === 1 ? "" : "s"}</span>
              <span className="workspace-pill workspace-pill--gap">{project.gapCount} Gap{project.gapCount === 1 ? "" : "s"}</span>
            </button>
            <span className="workspace-project-row__confidence">{confidenceLabel(project.confidence)}</span>
          </article>)}</div>
        </section>

        <section className="workspace-panel workspace-signals">
          <header><div><span className="workspace-panel__eyebrow">Open findings</span><h2>Recent / open Signals</h2></div></header>
          <div className="workspace-signals__list">{signals.length ? signals.map((signal) => <button type="button" className="workspace-signal-row" onClick={() => onOpenFindings(signal.projectId)} key={signal.findingId}>
            <span className={`workspace-severity workspace-severity--${signal.severity}`}>{signal.severity}</span>
            <strong>{signal.title}</strong>
            <small>{signal.projectTitle}</small>
            <AssetIcon name="Arrow_Forward" />
          </button>) : <p className="workspace-empty">No open Signals were found in the current snapshots.</p>}</div>
        </section>

        <section className="workspace-panel workspace-activity">
          <header><div><span className="workspace-panel__eyebrow">Latest recorded events</span><h2>Recent activity</h2></div></header>
          <ol>{activity.map((event) => <li key={`${event.projectId}-${event.timestamp}`}>
            <span className="workspace-activity__marker" />
            <button type="button" onClick={() => onOpenProject(event.projectId)}><strong>{event.title}</strong><span>{event.projectTitle}</span><small>{formatActivityDate(event.timestamp)}</small></button>
          </li>)}</ol>
        </section>
      </div>}
    </div>
    <span className="welcome-version">Alpha {applicationVersion}</span>
  </main>;
}
