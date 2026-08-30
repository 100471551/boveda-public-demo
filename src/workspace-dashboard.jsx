import React, { useMemo } from "react";
import { version as applicationVersion } from "../package.json";
import { projectRepository } from "./project-repository.mjs";
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
  const maximum = Number(confidence.maximum) || 8;
  return `Reconstruction · ${score}/${maximum}`;
}

function reviewStatusLabel(value) {
  return ({ new: "New", in_review: "In review", reviewed: "Reviewed" })[value] || "New";
}

function formatTokenCount(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function WorkspaceDashboard({ projects, layersByProject, onProjects, onOpenProject, onOpenFindings, onOpenSignal, onOpenHistory, onImport, loading = false }) {
  const summary = useMemo(() => buildWorkspaceSummary(projects, layersByProject), [projects, layersByProject]);
  const signals = summary.signals.slice(0, 4);
  const activity = summary.activity.slice(0, 4);
  const repositories = useMemo(() => projects.map((project) => ({ project, repository: projectRepository(project.source_project_path) })).filter(({ repository }) => repository), [projects]);
  const signalTypes = ["high", "medium", "low", "review"].filter((type) => summary.signalBreakdown[type] > 0);

  return <main className="workspace-dashboard">
    <Brand />
    <div className="workspace-dashboard__inner">
      <section className="workspace-overview" aria-labelledby="workspace-heading">
        <header className="workspace-dashboard__header">
          <h1 id="workspace-heading">What needs your attention?</h1>
          <p>An overview of the projects, signals and evidence currently under your supervision.</p>
        </header>

        <section className="workspace-kpis" aria-label="Workspace totals">
          <button type="button" className="workspace-kpi workspace-kpi--interactive" onClick={onProjects}><span>Active Projects</span><strong>{summary.activeProjects}</strong><small>Projects currently under supervision</small><AssetIcon name="Folder" /></button>
          <article className="workspace-kpi workspace-kpi--signals">
            <span>Signals to review</span><AssetIcon name="Findings_Signals" />
            <div className="workspace-kpi__signal-total"><strong>{summary.openSignals}</strong><small>Findings requiring supervisory review</small></div>
            <dl className="workspace-signal-breakdown" aria-label="Signals by severity">{signalTypes.map((type) => <div key={type}><dt>{type === "review" ? "Other" : type}</dt><dd>{summary.signalBreakdown[type]}</dd></div>)}</dl>
          </article>
          <article className="workspace-kpi"><span>Evidence Gaps</span><strong>{summary.evidenceGaps}</strong><small>Important evidence Bóveda could not establish</small><AssetIcon name="Findings_Evidence_Gaps" /></article>
        </section>
      </section>

      {loading ? <section className="workspace-loading" aria-label="Loading workspace"><span /></section> : <>
        <section className="workspace-attention" aria-labelledby="workspace-attention-title">
          <header>
            <div><span className="workspace-panel__eyebrow">Priority view</span><h2 id="workspace-attention-title">Projects requiring attention</h2></div>
            <div className="workspace-attention__actions">
              <button type="button" className="workspace-import" onClick={onImport} data-demo-disabled="true"><AssetIcon name="Import_Plus" />Import new project</button>
              <button type="button" className="workspace-view-projects" onClick={onProjects}><AssetIcon name="Folder" />View all projects</button>
            </div>
          </header>
          <div className="workspace-attention__list">{summary.attention.map((project, index) => <article className="workspace-project-row" key={project.projectId}>
            <button type="button" className="workspace-project-row__main" onClick={() => onOpenProject(project.projectId)}>
              <span className="workspace-project-row__number">{String(index + 1).padStart(2, "0")}</span>
              <span className="workspace-project-row__copy"><strong>{project.title}</strong><small>{project.purpose}</small></span>
            </button>
            <span className="workspace-project-row__findings">
              <button type="button" className="workspace-pill workspace-pill--signal" onClick={() => onOpenFindings(project.projectId, "signals")} aria-label={`Open Signals for ${project.title}`}>{project.signalCount} Signal{project.signalCount === 1 ? "" : "s"}</button>
              <button type="button" className="workspace-pill workspace-pill--gap" onClick={() => onOpenFindings(project.projectId, "gaps")} aria-label={`Open Evidence Gaps for ${project.title}`}>{project.gapCount} Gap{project.gapCount === 1 ? "" : "s"}</button>
            </span>
            <span className="workspace-project-row__confidence">{confidenceLabel(project.confidence)}</span>
            <button type="button" className="workspace-project-row__open" onClick={() => onOpenProject(project.projectId)} aria-label={`Open ${project.title}`}><AssetIcon name="Arrow_Forward" /></button>
          </article>)}</div>
        </section>

        <div className="workspace-dashboard__lower">
          <section className="workspace-panel workspace-signals">
            <header><div><span className="workspace-panel__eyebrow">Requires attention</span><h2>Signals to review</h2></div><AssetIcon name="Findings_Signals" /></header>
            <div className="workspace-signals__list">{signals.length ? signals.map((signal) => <button type="button" className="workspace-signal-row" onClick={() => onOpenSignal(signal.projectId, signal.findingId)} key={signal.findingId}>
              <span className={`workspace-severity workspace-severity--${signal.severity}`}>{signal.severity}</span>
              <span className="workspace-signal-row__copy"><small><em>{reviewStatusLabel(signal.reviewStatus)}</em>{signal.projectTitle}</small><strong>{signal.title}</strong></span>
              <AssetIcon name="Arrow_Forward" />
            </button>) : <p className="workspace-empty">No open Signals were found in the current snapshots.</p>}</div>
          </section>

          <section className="workspace-panel workspace-activity">
            <header><div><span className="workspace-panel__eyebrow">Bóveda</span><h2>Recent activity</h2></div></header>
            <ol>{activity.map((event) => <li key={`${event.projectId}-${event.eventId}-${event.timestamp}`}>
              <span className="workspace-activity__marker" />
              <button type="button" onClick={() => onOpenHistory(event.projectId)}><strong>{event.title}</strong><span>{event.projectTitle}</span><small>{formatActivityDate(event.timestamp)}</small></button>
            </li>)}</ol>
          </section>

          <aside className="workspace-dashboard__supporting">
            {summary.usageProjects > 0 ? <section className="workspace-panel workspace-usage"><span>Used</span><strong>Tokens</strong><b>{formatTokenCount(summary.totalTokens)}</b></section> : null}
            <section className="workspace-panel workspace-repositories">
              <header><h2>Repositories <span>({repositories.length})</span></h2><AssetIcon name="Link_Button" /></header>
              <ul>{repositories.map(({ project, repository }) => <li key={project.project_id}><a href={repository.href} target="_blank" rel="noreferrer" aria-label={repository.label}><strong>{project.supervisor_project_title || project.name}</strong><span>{repository.href}</span></a></li>)}</ul>
            </section>
          </aside>
        </div>
      </>}
    </div>
    <span className="welcome-version">Alpha {applicationVersion}</span>
  </main>;
}
