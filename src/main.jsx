import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { version as applicationVersion } from "../package.json";
import "./styles.css";
import {
  formatCountValue,
  formatAnalyticalMetric,
  formatMetricValue,
  metricRatioValue,
  formatSampleDetail,
  formatSampleNumber,
  formatSupervisorCopy,
  formatSupervisorSummary,
} from "./format-display.mjs";
import { canonicalSupervisorProjectTitle, canonicalSupervisorProjectTitleForRecord, rootFolderName, splitDashboardTitle } from "./project-display.mjs";
import { PROJECT_ICON_LABELS, selectProjectIcon } from "./project-icon.mjs";
import { populationStageDots } from "./population-funnel.mjs";
import {
  fieldMissingLabel,
  displayReconstructionText,
  projectDescriptionField,
  reconstructionConfidenceExplanation,
  reconstructionConfidenceLabel,
  sampleMissingLabel,
} from "./reconstruction-display.mjs";
import { SignalsDetailDrawer, SignalsView, StatusDot } from "./signals-view.jsx";
import { HistoryView } from "./history-view.jsx";
import { AnalyticalData, AnalyticalDetails, AnalyticalResults, AnalyticalSelector } from "./analytical-view.jsx";
import { HELP_COPY } from "./communication-copy.mjs";
import { HelpPopover } from "./help-popover.jsx";
import { buildAnalyticalFindingAssociations, buildOverviewFindingAssociations } from "./overview-finding-associations.mjs";
import { OverviewFindingLinks } from "./overview-finding-links.jsx";
import { EmptyEvidenceState } from "./empty-evidence-state.jsx";
import { overviewAvailabilityMessage, primaryResultAvailability } from "./sparse-communication.mjs";
import { buildOverviewModelContexts, modelContextByKey, modelMetricKey, modelResult } from "./overview-model-context.mjs";
import { requestBovedaJson } from "./demo-api.mjs";
import { PUBLIC_DEMO, reportAssetUrl } from "./runtime-config.mjs";

const api = requestBovedaJson;

const PROJECT_ORDER_STORAGE_KEY = "boveda.project-order.v1";

function readStoredProjectOrder() {
  try {
    const value = JSON.parse(window.localStorage.getItem(PROJECT_ORDER_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((projectId) => typeof projectId === "string") : [];
  } catch { return []; }
}

function applyStoredProjectOrder(projects) {
  const storedOrder = readStoredProjectOrder();
  if (!storedOrder.length) return projects;
  const projectsById = new Map(projects.map((project) => [project.project_id, project]));
  const orderedProjects = storedOrder.map((projectId) => projectsById.get(projectId)).filter(Boolean);
  const orderedIds = new Set(orderedProjects.map((project) => project.project_id));
  return [...orderedProjects, ...projects.filter((project) => !orderedIds.has(project.project_id))];
}

function storeProjectOrder(projectIds) {
  try { window.localStorage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(projectIds)); }
  catch { /* The server-backed order remains authoritative when browser storage is unavailable. */ }
}

const MOTION_GROUPS = [
  { selector: ".projects-surface, .empty-shell", effect: "fade" },
  { selector: ".record-header", effect: "fade" },
  { selector: ".hero-cards > *", effect: "fade", stagger: 70 },
  { selector: ".purpose-section .section-copy, .results-section .result-left, .feature-component .analytical-heading, .feature-component .analytical-visual, .comparison-component .analytical-standout, .evaluation-behaviour > .analytical-heading", effect: "slide", x: -22 },
  { selector: ".purpose-section > .data-table, .results-section > .data-table, .feature-component .analytical-standout, .comparison-component .analytical-visual, .evaluation-behaviour .analytical-standout, .data-section .population-funnel", effect: "slide", x: 22 },
  { selector: ".evaluation-behaviour .analytical-visual, .analytical-data-component, .analytical-details", effect: "fade" },
  { selector: ".signals-intro, .checks-performed, .history-intro, .history-supporting, .history-limitations", effect: "fade" },
  { selector: ".finding-group__heading", effect: "slide", x: -22 },
  { selector: ".supervisor-finding", effect: "fade", stagger: 45 },
  { selector: ".history-event", effect: "fade", stagger: 35 },
];

function useSiteMotion(dependencies) {
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = reducedMotion ? null : new IntersectionObserver((entries, instance) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-motion-visible");
        instance.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    const register = () => {
      for (const group of MOTION_GROUPS) {
        document.querySelectorAll(group.selector).forEach((element, index) => {
          if (!element.dataset.motion) {
            element.dataset.motion = group.effect;
            if (group.effect === "slide") {
              element.style.setProperty("--motion-x", `${group.x || 0}px`);
              element.style.setProperty("--motion-y", `${group.y || 0}px`);
            }
            if (group.stagger) element.style.setProperty("--motion-delay", `${Math.min(index, 5) * group.stagger}ms`);
          }
          if (reducedMotion) element.classList.add("is-motion-visible");
          else if (!element.classList.contains("is-motion-visible")) observer.observe(element);
        });
      }
    };

    register();
    const mutationObserver = new MutationObserver(register);
    mutationObserver.observe(document.getElementById("root"), { childList: true, subtree: true });
    return () => {
      mutationObserver.disconnect();
      observer?.disconnect();
    };
  }, dependencies);
}

function Icon({ name, className = "" }) {
  return <img className={`ui-icon ${className}`} src={`/ui/${name}.svg`} alt="" aria-hidden="true" />;
}

function Logo({ showVersion = true, showDemo = false }) {
  return <div className="brand"><img className="brand__logo" src="/Boveda_Logo_Black.svg" alt="Bóveda" />{showDemo ? <span className="brand__demo">Demo</span> : null}{showVersion ? <div className="brand__version">Alpha {applicationVersion}</div> : null}</div>;
}

function GlobalNavigation({ active, onHome, onProjects }) {
  return <nav className="global-navigation" aria-label="Main navigation">
    <button type="button" className={active === "welcome" ? "is-active" : ""} onClick={onHome} aria-label="Home" aria-current={active === "welcome" ? "page" : undefined}><Icon name="Home" /></button>
    <button type="button" className={active === "projects" ? "is-active" : ""} onClick={onProjects} aria-label="Projects" aria-current={active === "projects" ? "page" : undefined}><span className="global-navigation__grid" aria-hidden="true"><i /><i /><i /><i /></span></button>
  </nav>;
}

function WelcomeSurface() {
  const [demoBannerVisible, setDemoBannerVisible] = useState(true);
  const lastScrollY = useRef(0);
  const touchY = useRef(null);

  useEffect(() => {
    const hideBanner = () => setDemoBannerVisible(false);
    const dismissalTimer = window.setTimeout(hideBanner, 10_000);
    const onScroll = () => {
      const nextScrollY = window.scrollY;
      if (nextScrollY > lastScrollY.current) hideBanner();
      lastScrollY.current = nextScrollY;
    };
    const onWheel = (event) => { if (event.deltaY > 0) hideBanner(); };
    const onTouchStart = (event) => { touchY.current = event.touches[0]?.clientY ?? null; };
    const onTouchMove = (event) => {
      const nextTouchY = event.touches[0]?.clientY;
      if (touchY.current !== null && nextTouchY !== undefined && nextTouchY < touchY.current) hideBanner();
      touchY.current = nextTouchY ?? null;
    };

    lastScrollY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.clearTimeout(dismissalTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return <main className="welcome-surface">
    <aside className={`demo-banner ${demoBannerVisible ? "is-visible" : "is-hidden"}`} aria-label="Public demo notice" aria-hidden={!demoBannerVisible}>
      <p><strong>This public demo uses pre-analysed projects only.</strong> New project analysis is disabled, and some project information may be incomplete.</p>
      <button type="button" className="demo-banner__close" onClick={() => setDemoBannerVisible(false)} aria-label="Close public demo notice" tabIndex={demoBannerVisible ? 0 : -1}>
        <img src="/ui/Demo_Banner_Close.svg" alt="" aria-hidden="true" />
      </button>
    </aside>
    <div className="public-brand"><Logo showVersion={false} showDemo /></div>
    <h1><span className="welcome-typewriter">Auditable by design<span className="welcome-typewriter__dot" aria-hidden="true">.</span></span></h1>
    <p>Bóveda turns the evidence AI projects already leave behind into a clear,<br />traceable record — so the people responsible for them can understand<br />what happened, ask the right questions, and follow every conclusion<br />back to its source.</p>
    <span className="welcome-version">Alpha {applicationVersion}</span>
  </main>;
}

function missingLabel(field, fieldId, reconstruction) {
  return fieldMissingLabel(field, fieldId, reconstruction);
}

function ProjectIcon({ reconstruction }) {
  const category = selectProjectIcon(reconstruction);
  const label = PROJECT_ICON_LABELS[category];
  return <span className="project-icon" role="img" aria-label={label} title={label}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {category === "housing" ? <><path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6" /></>
        : category === "road" ? <><path d="M6 4v16M18 4v16M12 4v3M12 10.5v3M12 17v3" /></>
          : category === "public_service" ? <><path d="M4 5h16v12H9l-5 4V5zM8 9h8M8 13h5" /></>
            : category === "health" ? <><path d="M9.2 4h5.6v5.2H20v5.6h-5.2V20H9.2v-5.2H4V9.2h5.2z" /></>
            : category === "business" ? <><path d="M4 9h16v11H4zM8 9V5h8v4M4 13h16M10 12v3h4v-3" /></>
              : <><path d="M5 19V9M10 19V5M15 19v-7M20 19V3" /></>}
    </svg>
  </span>;
}

function metricLengthClass(value) {
  const length = String(value ?? "").length;
  return length >= 10 ? "metric--long" : length >= 7 ? "metric--medium" : "metric--short";
}

const heroMetricFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  roundingMode: "halfEven",
  useGrouping: false,
});

function FieldValue({ field, onTrail, className = "", displayValue, showEvidence = false }) {
  if (!field) return <span>–</span>;
  const hasEvidence = Boolean(field.evidence_ids?.length);
  const value = field.state === "established"
    ? (displayValue ?? field.value ?? field.display ?? field.display_value ?? "–")
    : (displayValue ?? missingLabel(field));
  return <button
    type="button"
    className={`field-value field-value--${field.state} ${hasEvidence ? "has-evidence" : ""} ${className}`}
    onClick={() => hasEvidence && onTrail(field)}
    disabled={!hasEvidence}
    title={hasEvidence ? "View supporting evidence" : undefined}
  >
    <span>{displayReconstructionText(value)}</span>
    {showEvidence && hasEvidence ? <Icon name="Info_Tulip" className="evidence-icon" /> : null}
  </button>;
}

function EvidenceButton({ field, onTrail, label }) {
  if (!field?.evidence_ids?.length) return null;
  return <button type="button" className="info-button" onClick={() => onTrail(field)} title={label} aria-label={label}><Icon name="Info_Tulip" /></button>;
}

function SectionHeading({ children, field, help, helpPlacement, onTrail }) {
  return <div className="section-heading-row"><h2>{children}</h2>{help ? <HelpPopover label={String(children)} placement={helpPlacement}>{help}</HelpPopover> : null}<EvidenceButton field={field} onTrail={onTrail} label={`View evidence for ${children}`} /></div>;
}

function mixGaugeColour(start, end, amount) {
  const parse = (colour) => colour.match(/[\da-f]{2}/gi).map((channel) => Number.parseInt(channel, 16));
  const startChannels = parse(start);
  const endChannels = parse(end);
  const mixed = startChannels.map((channel, index) => Math.round(channel + ((endChannels[index] - channel) * amount)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function gaugeColourAt(progress) {
  const yellowPoint = .6;
  return progress <= yellowPoint
    ? mixGaugeColour("#ff8f98", "#ffc95a", progress / yellowPoint)
    : mixGaugeColour("#ffc95a", "#65e99c", (progress - yellowPoint) / (1 - yellowPoint));
}

function MetricGauge({ value }) {
  const normalized = Number.isFinite(value) && value >= 0 && value <= 1 ? Math.max(0, Math.min(1, value)) : null;
  const segmentCount = 72;
  const visibleSegments = normalized === null ? 0 : Math.ceil(normalized * segmentCount);
  return <span className={`metric-gauge ${normalized === null ? "is-unavailable" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 56 56" focusable="false">
      <circle className="metric-gauge__track" cx="28" cy="28" r="22" pathLength="1" />
      {Array.from({ length: visibleSegments }, (_, index) => {
        const progress = segmentCount === 1 ? 1 : index / (segmentCount - 1);
        const length = (1 / segmentCount) + .0015;
        return <circle
          className={`metric-gauge__segment ${index === 0 ? "is-start" : ""} ${index === visibleSegments - 1 ? "is-end" : ""}`}
          cx="28"
          cy="28"
          r="22"
          pathLength="1"
          stroke={gaugeColourAt(progress)}
          strokeDasharray={`${length} ${1 - length}`}
          strokeDashoffset={-(index / segmentCount)}
          style={{ "--gauge-segment-delay": `${Math.min(index, 48) * 7}ms` }}
          key={index}
        />;
      })}
    </svg>
  </span>;
}

function projectDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(parsed);
}

function moveProjectIds(projects, draggedId, targetId, position = "before") {
  const projectIds = projects.map((project) => project.project_id);
  const sourceIndex = projectIds.indexOf(draggedId);
  const targetIndex = projectIds.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return projectIds;
  const [movedId] = projectIds.splice(sourceIndex, 1);
  const adjustedTargetIndex = projectIds.indexOf(targetId);
  projectIds.splice(adjustedTargetIndex + (position === "after" ? 1 : 0), 0, movedId);
  return projectIds;
}

function ProjectsSurface({ projects, onOpen, onAdd, onDelete, onReorder, reorderBusy = false, onClose, overlay = false, publicDemo = false }) {
  const [draggedProjectId, setDraggedProjectId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const draggedProjectIdRef = useRef(null);
  const dropTargetRef = useRef(null);

  function resetDrag() {
    draggedProjectIdRef.current = null;
    dropTargetRef.current = null;
    setDraggedProjectId(null);
    setDropTarget(null);
  }

  function announceOrder(projectId, projectIds) {
    const project = projects.find((item) => item.project_id === projectId);
    const position = projectIds.indexOf(projectId) + 1;
    setReorderAnnouncement(`${project?.supervisor_project_title || project?.name || "Project"} moved to position ${position} of ${projectIds.length}.`);
  }

  function commitOrder(projectId, projectIds) {
    if (projectIds.every((id, index) => id === projects[index]?.project_id)) return;
    onReorder(projectIds);
    announceOrder(projectId, projectIds);
  }

  function projectTargetAtPoint(clientX, clientY) {
    const row = document.elementFromPoint(clientX, clientY)?.closest(".project-library__row");
    const projectId = row?.dataset.projectId;
    if (!projectId || projectId === draggedProjectIdRef.current) return null;
    const bounds = row.getBoundingClientRect();
    return { projectId, position: clientY < bounds.top + (bounds.height / 2) ? "before" : "after" };
  }

  function updatePointerTarget(event) {
    if (!draggedProjectIdRef.current || reorderBusy) return;
    const nextTarget = projectTargetAtPoint(event.clientX, event.clientY);
    dropTargetRef.current = nextTarget;
    setDropTarget(nextTarget);
  }

  function finishPointerDrag(event) {
    const projectId = draggedProjectIdRef.current;
    const target = projectTargetAtPoint(event.clientX, event.clientY) || dropTargetRef.current;
    if (projectId && target && !reorderBusy) {
      const projectIds = moveProjectIds(projects, projectId, target.projectId, target.position);
      commitOrder(projectId, projectIds);
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetDrag();
  }

  function moveProjectWithKeyboard(event, projectId) {
    if (!["ArrowUp", "ArrowDown"].includes(event.key) || reorderBusy) return;
    event.preventDefault();
    const index = projects.findIndex((project) => project.project_id === projectId);
    const nextIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= projects.length) return;
    const projectIds = projects.map((project) => project.project_id);
    [projectIds[index], projectIds[nextIndex]] = [projectIds[nextIndex], projectIds[index]];
    commitOrder(projectId, projectIds);
  }

  return <main className={`projects-surface ${overlay ? "projects-surface--overlay" : ""}`}>
    <div className="public-brand"><Logo showVersion={false} showDemo /></div>
    {overlay ? <button type="button" className="projects-overlay__close" onClick={onClose} aria-label="Close Projects"><Icon name="Import_Close" /></button> : null}
    <section className="project-library" aria-labelledby={overlay ? "projects-overlay-title" : "projects-title"}>
      <header className="project-library__header">
        <div className="project-library__heading"><Icon name="Folder" /><h1 id={overlay ? "projects-overlay-title" : "projects-title"}>Projects</h1><p>Select an existing project from the list or import a new one for analysis.</p></div>
        <button type="button" className="projects-import" onClick={onAdd} data-demo-disabled={publicDemo || undefined} title={publicDemo ? "Import is disabled in the public demo" : undefined}><Icon name="Import_Plus" />Import new project</button>
      </header>
      {projects.length ? <div className="project-library__list">{projects.map((project, index) => {
        const title = project.supervisor_project_title || canonicalSupervisorProjectTitle({ taskTarget: project.primary_task_target, purpose: project.project_purpose, task: project.analytical_task, identityName: project.identity_name || { state: "established", value: project.name }, sourcePath: project.source_project_path });
        const route = project.source_project_path ? `/${rootFolderName(project.source_project_path)}` : "Route unavailable";
        const dropPosition = dropTarget?.projectId === project.project_id ? dropTarget.position : null;
        return <article
          className={`project-library__row ${draggedProjectId === project.project_id ? "is-dragging" : ""} ${dropPosition ? `is-drop-${dropPosition}` : ""}`}
          key={project.project_id}
          data-project-id={project.project_id}
        >
          <span className="project-library__number" aria-hidden="true">{index + 1}.</span>
          <button
            type="button"
            className="project-library__drag-handle"
            disabled={reorderBusy}
            aria-pressed={draggedProjectId === project.project_id}
            aria-label={`Reorder ${title}. Use the up and down arrow keys to move it.`}
            onPointerDown={(event) => {
              if (reorderBusy || (event.pointerType === "mouse" && event.button !== 0)) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              draggedProjectIdRef.current = project.project_id;
              setDraggedProjectId(project.project_id);
            }}
            onPointerMove={updatePointerTarget}
            onPointerUp={finishPointerDrag}
            onPointerCancel={resetDrag}
            onKeyDown={(event) => moveProjectWithKeyboard(event, project.project_id)}
          ><Icon name="Drag_Icon" /></button>
          <button type="button" className="project-library__open" onClick={() => onOpen(project.project_id)} aria-label={`Open ${title}`}>
            <strong title={title}>{title}</strong>
            {Number.isFinite(project.finding_count) && project.finding_count > 0 ? <span className="project-library__findings" aria-label={`${project.finding_count} findings`}>{project.finding_count}</span> : <span className="project-library__findings-placeholder" aria-hidden="true" />}
            <span title={project.source_project_path || undefined}>{route}</span>
            <time dateTime={project.analysed_at || undefined}>{projectDate(project.analysed_at)}</time>
          </button>
          <button type="button" className="project-library__remove" aria-label={`Remove ${title}`} data-demo-disabled={publicDemo || undefined} title={publicDemo ? "Deleting demo projects is disabled" : undefined} onClick={() => onDelete({ ...project, name: title })}><Icon name="Project_Remove" /></button>
        </article>;
      })}</div> : <div className="project-library__empty"><h1>Your projects will live here.</h1><p>Import a local data, ML, or AI project to create a supervisor-facing record.</p></div>}
      <p className="visually-hidden" aria-live="polite">{reorderAnnouncement}</p>
    </section>
  </main>;
}

function EmptyState({ onAdd }) {
  return <main className="empty-shell">
    <div className="empty-brand"><Logo showVersion={false} /></div>
    <section className="empty-content">
      <div className="empty-copy"><h1>Turn project activity into<br />a record you can supervise.</h1><p>Import any local data, ML, or AI project. Bóveda reconstructs what happened, what matters, what supports it, and what still cannot be established.</p><button className="empty-import" onClick={onAdd}><Icon name="Import_Plus" />Import your first project</button></div>
      <div className="verbs" aria-label="Bóveda workflow">{["Discover", "Reconstruct", "Check", "Translate", "Verify"].map((verb) => <span key={verb}>{verb}<Icon name="Workflow_Arrow" /></span>)}</div>
    </section>
  </main>;
}

function ImportModal({ onClose, onImported }) {
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function browse() {
    setError("");
    try { setDirectory((await api("/api/browse", { method: "POST", body: "{}" })).path); } catch (err) { if (!/cancelled/i.test(err.message)) setError(err.message); }
  }
  async function start(event) {
    event.preventDefault();
    if (!directory.trim()) return;
    setBusy(true);
    setError("");
    try { onImported(await api("/api/analyse", { method: "POST", body: JSON.stringify({ path: directory.trim() }) })); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="import-modal" onSubmit={start} role="dialog" aria-modal="true" aria-labelledby="import-title" aria-describedby="import-description import-read-only">
      <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close import project"><Icon name="Import_Close" /></button>
      <div className="import-modal__content">
        <Icon name="Import_Project_Large" className="import-modal__artwork" />
        <div className="import-grid"><h2 id="import-title">Import local project</h2><p id="import-description">Bóveda will inspect the directory read-only, show what it can use, then reconstruct a supervisor-facing record.</p></div>
        <label className="visually-hidden" htmlFor="project-path">Project directory</label>
        <div className="path-row"><span className="path-input"><Icon name="Import_Path_Folder" /><input id="project-path" value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder="/projects/my-project" autoFocus /></span><p className="read-only" id="import-read-only"><em>*Read-only. The imported project is never modified.</em></p><div className="import-actions"><button type="button" className="button button--subtle" onClick={browse} disabled={busy}><Icon name="Import_Browse" />Browse</button><button className="button button--light" disabled={busy || !directory.trim()}>{busy ? "Analysing…" : "Start"}</button></div></div>
      </div>
      {busy ? <div className="analysis-status"><span></span> Collecting evidence and reconstructing the fixed Overview. The project will not be executed or modified.</div> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </form>
  </div>;
}

function DeleteProjectDialog({ project, busy, onCancel, onConfirm }) {
  if (!project) return null;
  return <div className="delete-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title" aria-describedby="delete-project-description">
      <button type="button" className="delete-dialog__close" onClick={onCancel} disabled={busy} aria-label="Close delete confirmation"><Icon name="Import_Close" /></button>
      <Icon name="Project_Remove" className="delete-dialog__icon" />
      <p className="delete-dialog__eyebrow">Remove project</p>
      <h2 id="delete-project-title">Remove this project?</h2>
      <p id="delete-project-description"><strong>{project.name}</strong> will be removed from Bóveda. The imported project and its files will not be touched.</p>
      <div className="delete-dialog__actions">
        <button type="button" className="delete-dialog__cancel" onClick={onCancel} disabled={busy} autoFocus>Cancel</button>
        <button type="button" className="delete-dialog__confirm" onClick={onConfirm} disabled={busy}>{busy ? "Removing…" : "Remove project"}</button>
      </div>
    </section>
  </div>;
}

const DISPLAY_LABELS = {
  source_data: ["Original data", "Records originally available"],
  model_sample: ["Training data", "Records used to train the model"],
  evaluation_sample: ["Evaluation sample", "Records used for evaluation"],
};

function Sample({ name, sample, reconstruction, onTrail, signalState, onSignalState, showStatus = true }) {
  const [label, caption] = DISPLAY_LABELS[name];
  const number = formatSampleNumber(sample);
  const missing = sampleMissingLabel(name, sample, reconstruction);
  const detail = sample.state === "established" ? formatSampleDetail(sample) : sample.state === "not_applicable" ? sample.display : missing;
  const captionText = caption;
  const size = number.length >= 8 ? "long" : number.length >= 5 ? "medium" : "short";
  return <div className={`sample sample--${name} sample--${sample.state} sample--${size}`}>
    <span className="sample__label">{label}{showStatus ? <StatusDot state={signalState} onClick={onSignalState} /> : null}</span>
    <button type="button" className="sample__evidence" onClick={() => sample.evidence_ids?.length && onTrail(sample)} disabled={!sample.evidence_ids?.length} title={sample.evidence_ids?.length ? "View supporting evidence" : undefined}>
      <strong className="sample__number">{number}</strong>
      <span className="sample__detail">{detail}</span>
      <small>{captionText}</small>
    </button>
  </div>;
}

function HeroPopulationStrip({ samples }) {
  const proportions = populationStageDots(samples);
  const model = proportions.comparable ? (proportions.filled.model_sample ?? proportions.filled.evaluation_sample ?? 0) : 0;
  const evaluation = proportions.comparable ? (proportions.filled.evaluation_sample ?? 0) : 0;
  const percentage = (value) => `${Math.max(0, Math.min(100, (value / proportions.totalDots) * 100))}%`;
  return <div className={`hero-population-strip ${proportions.comparable ? "is-comparable" : "is-unavailable"}`} aria-hidden="true">
    <i className="hero-population-strip__source" />
    <i className="hero-population-strip__model" style={{ width: percentage(model) }} />
    <i className="hero-population-strip__evaluation" style={{ width: percentage(evaluation) }} />
  </div>;
}

function PopulationFunnel({ samples, reconstruction, onTrail, signalStates, onSignalState }) {
  const proportions = populationStageDots(samples);
  const stages = ["source_data", "model_sample", "evaluation_sample"];
  const status = proportions.comparable
    ? stages.filter((name) => proportions.counts[name] !== null).map((name) => `${DISPLAY_LABELS[name][0]} ${proportions.counts[name].toLocaleString("en-US")}: ${proportions.filled[name]} of ${proportions.totalDots} dots`).join("; ")
    : "One hundred neutral dots; proportions are not calculated unless at least two safely comparable population sizes are reconstructed.";
  const dotStage = (index) => {
    if (!proportions.comparable) return "neutral";
    if (proportions.filled.evaluation_sample !== null && index < proportions.filled.evaluation_sample) return "evaluation_sample";
    if (proportions.filled.model_sample !== null && index < proportions.filled.model_sample) return "model_sample";
    if (proportions.filled.source_data !== null && index < proportions.filled.source_data) return "source_data";
    return "neutral";
  };
  return <div className={`population-funnel ${proportions.comparable ? "is-comparable" : "is-unavailable"}`}>
    <span className="visually-hidden">{status}</span>
    <div className="population-funnel__grid" aria-hidden="true">{Array.from({ length: proportions.totalDots }, (_, index) => <i className={`population-dot population-dot--${dotStage(index)}`} key={index} />)}</div>
    <div className="population-funnel__values">{stages.map((name) => <div className={`population-value population-value--${name}`} key={name}><Sample name={name} sample={samples[name]} reconstruction={reconstruction} onTrail={onTrail} signalState={signalStates[name]} onSignalState={() => onSignalState(signalStates.ids[name])} showStatus={false} /></div>)}</div>
  </div>;
}

function confidenceTone(score) {
  if (!score) return "unavailable";
  if (score <= 2) return "low";
  if (score <= 4) return "low-medium";
  if (score <= 6) return "medium";
  return "high";
}

function ReconstructionConfidence({ confidence, reconstruction, plainReproductionBoundary = false }) {
  if (!confidence) return <div className="confidence-card confidence--unavailable"><div className="confidence-card__title"><span className="confidence-label">Reconstruction confidence</span><HelpPopover label="Reconstruction confidence" placement="bottom-end">{HELP_COPY.reconstructionConfidence}</HelpPopover></div><div className="confidence-head"><small><strong>Result:</strong> {reconstructionConfidenceLabel(confidence)}</small></div><p>{reconstructionConfidenceExplanation(confidence, reconstruction, { plainReproductionBoundary })}</p></div>;
  const tone = confidenceTone(confidence.score);
  return <div className={`confidence-card confidence--${tone}`}>
    <div className="confidence-card__title"><span className="confidence-label">Reconstruction confidence</span><HelpPopover label="Reconstruction confidence" placement="bottom-end">{HELP_COPY.reconstructionConfidence}</HelpPopover></div>
    <div className="confidence-head"><span className="confidence-meter" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i className={index < confidence.score ? "is-filled" : ""} key={index} />)}</span><small><strong>Result:</strong> {reconstructionConfidenceLabel(confidence)}</small></div>
    <p>{reconstructionConfidenceExplanation(confidence, reconstruction, { plainReproductionBoundary })}</p>
  </div>;
}

function ProjectMenuButton({ onClick, className = "" }) {
  return <button type="button" className={`project-menu-button ${className}`} onClick={onClick} aria-label="Open project menu"><Icon name="Menu" /></button>;
}

function ReportDownloadMenu({ projectId }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const items = PUBLIC_DEMO
    ? [
      { label: "Download PDF", href: reportAssetUrl(projectId, "pdf") },
      { label: "Download HTML", href: reportAssetUrl(projectId, "html") },
    ]
    : [
      { label: "Download PDF", href: `/api/projects/${projectId}/report.pdf` },
      { label: "Download HTML", href: `/api/projects/${projectId}/report.html` },
    ];

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const focusItem = useCallback((index) => {
    const bounded = (index + items.length) % items.length;
    window.requestAnimationFrame(() => itemRefs.current[bounded]?.focus());
  }, [items.length]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => { if (!rootRef.current?.contains(event.target)) close(); };
    const closeOnEscape = (event) => { if (event.key === "Escape") { event.preventDefault(); close(true); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [close, open]);

  const onTriggerKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    setOpen(true);
    focusItem(event.key === "ArrowDown" ? 0 : items.length - 1);
  };

  const onMenuKeyDown = (event) => {
    const current = itemRefs.current.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(current + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusItem(event.key === "Home" ? 0 : items.length - 1);
    }
  };

  return <div className={`report-download-menu ${open ? "is-open" : ""}`} ref={rootRef}>
    <button ref={triggerRef} type="button" className="record-title-action record-title-action--secondary report-download-menu__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} onKeyDown={onTriggerKeyDown}>
      <Icon name="Download_Top" />Download Report<img className="report-download-menu__caret" src="/ui/Dropdown_Chevron.svg" alt="" aria-hidden="true" />
    </button>
    {open ? <div className="analytical-selector__menu report-download-menu__menu" role="menu" aria-label="Report download formats" onKeyDown={onMenuKeyDown}>{items.map((item, index) => <a ref={(node) => { itemRefs.current[index] = node; }} role="menuitem" href={item.href} download onClick={() => close()} key={item.label}>{item.label}</a>)}</div> : null}
  </div>;
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  const tone = confidenceTone(confidence.score);
  return <span className={`confidence-badge confidence-badge--${tone}`}>Reconstruction confidence {confidence.score}/8</span>;
}

function DataTable({ rows, onTrail }) {
  return <dl className="data-table">{rows.map(([label, field, displayValue], index) => <div className={`${index % 2 ? "is-tinted " : ""}data-table__row--${field?.state || "unavailable"}`} key={label}><dt>{label}</dt><dd><FieldValue field={field} onTrail={onTrail} displayValue={displayValue} /></dd></div>)}</dl>;
}

function MissingResult({ result }) {
  const message = primaryResultAvailability(result);
  return <EmptyEvidenceState title={message.title} className="empty-evidence-state--compact">{message.detail}</EmptyEvidenceState>;
}

function Overview({ record, signalsLayer, historyLayer, analyticalLayer, activeView, onView, findingsTarget, onFindingsTargetHandled, onFindingNavigate, onOpenProjects, onSignalInspect, onSignalEvidence, onHistoryEvidence, onReanalyse, reanalysing, onTrail, onDiagnostics }) {
  const [stickyHeaderVisible, setStickyHeaderVisible] = useState(false);
  useEffect(() => {
    const updateStickyHeader = () => setStickyHeaderVisible(window.scrollY > 320);
    updateStickyHeader();
    window.addEventListener("scroll", updateStickyHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateStickyHeader);
  }, []);
  const canonicalReconstruction = record.reconstruction;
  const mainTargetStory = analyticalLayer?.presentation?.main_target_story;
  const overviewModelPresentation = useMemo(() => buildOverviewModelContexts(analyticalLayer), [analyticalLayer]);
  const [globalModelKey, setGlobalModelKey] = useState(null);
  const effectiveGlobalModelKey = overviewModelPresentation.contexts.some((context) => context.id === globalModelKey)
    ? globalModelKey
    : overviewModelPresentation.default_model_key;
  const globalModelContext = modelContextByKey(overviewModelPresentation, effectiveGlobalModelKey);
  const globalMetricKey = modelMetricKey(globalModelContext, overviewModelPresentation.default_metric_key);
  const globalResult = modelResult(globalModelContext, globalMetricKey);
  const globalModelIndex = Math.max(0, overviewModelPresentation.contexts.findIndex((context) => context.id === effectiveGlobalModelKey));
  const globalSelectionIsDefault = effectiveGlobalModelKey === overviewModelPresentation.default_model_key;
  useEffect(() => setGlobalModelKey(overviewModelPresentation.default_model_key), [record.project_id, overviewModelPresentation.default_model_key]);
  const sectionAnswers = mainTargetStory?.section_answers || {};
  const sectionAvailable = (id) => sectionAnswers[id]?.dashboard_available === true;
  const purposeAvailable = sectionAvailable("purpose_scope");
  const resultsAvailable = sectionAvailable("results_evaluation");
  const dataAvailable = sectionAvailable("data_populations_samples");
  const samplesAvailable = dataAvailable;
  const graphBestTargetId = analyticalLayer?.object_graph?.best_final_result?.target_id;
  const usesFocalStoryFallback = Boolean(mainTargetStory && (!graphBestTargetId || !analyticalLayer?.object_graph?.target_definitions?.some((item) => item.id === graphBestTargetId)));
  const projectedProjectPopulation = mainTargetStory?.populations?.source_data || analyticalLayer?.presentation?.project_population;
  const r = projectedProjectPopulation?.state === "established"
    ? { ...canonicalReconstruction, samples: { ...canonicalReconstruction.samples, source_data: projectedProjectPopulation } }
    : canonicalReconstruction;
  const displayedSamples = mainTargetStory?.populations || r.samples;
  const wideDownstreamSamples = [displayedSamples.model_sample, displayedSamples.evaluation_sample].some((sample) => formatSampleNumber(sample).length >= 5);
  const sourceFolder = rootFolderName(record.source_project?.path);
  const canonicalPrimary = r.results_evaluation.primary_result;
  const projectedResults = analyticalLayer?.presentation?.headline_results || [];
  const bestFinal = analyticalLayer?.presentation?.best_final_result;
  const focalEvaluation = analyticalLayer?.presentation?.focal_results_evaluation;
  const focalPrimary = mainTargetStory?.result || bestFinal || projectedResults.find((item) => item.canonical_role === "primary") || canonicalPrimary;
  const primary = globalResult || focalPrimary;
  const projectTitle = canonicalSupervisorProjectTitleForRecord(record);
  const projectTitleLines = splitDashboardTitle(projectTitle);
  const bestFinalEstablished = focalPrimary?.selection_mode === "best_final_result";
  const primaryResultLabel = globalSelectionIsDefault ? "Best recorded result" : "Recorded result";
  const mainTargetLabel = mainTargetStory?.target?.label || primary?.task_target || r.purpose_scope.target_outcome.value;
  const metricDisplay = (item) => Number.isFinite(item?.raw_value)
    ? formatAnalyticalMetric(item.raw_value, item.display_precision ?? 2)
    : formatMetricValue(item?.display_value);
  const primaryMetricRatio = metricRatioValue(primary);
  const primaryMetricDisplay = Number.isFinite(primaryMetricRatio)
    ? heroMetricFormatter.format(primaryMetricRatio)
    : formatMetricValue(primary?.display_value);
  const incomplete = !resultsAvailable || primary.state !== "established";
  const description = projectDescriptionField(r);
  const descriptionDisplay = description.value?.replace(" The relevant scope is ", "\n\nThe relevant scope is ");
  const summary = (field, maximum = 180, fieldId) => field.state === "established" ? formatSupervisorCopy(field.value, maximum) : missingLabel(field, fieldId, r);
  const displayedEvaluationDesign = mainTargetStory?.evaluation_design || r.results_evaluation.evaluation_design;
  const displayedEvaluationSample = displayedSamples.evaluation_sample || r.samples.evaluation_sample;
  const legacyResultRows = [
    ["Evaluation design", displayedEvaluationDesign, summary(displayedEvaluationDesign, 180, "field-evaluation-design"), "field-evaluation-design"],
    ["Evaluation sample", displayedEvaluationSample, displayedEvaluationSample.state === "established" ? formatCountValue(displayedEvaluationSample) : missingLabel(displayedEvaluationSample, "field-evaluation-sample", r), "field-evaluation-sample"],
    ["Best recorded result", focalPrimary, focalPrimary.state === "established" ? `${focalPrimary.metric}: ${metricDisplay(focalPrimary)}${focalPrimary.method ? ` · ${focalPrimary.method}` : ""}` : missingLabel(focalPrimary, "field-primary-result", r), "field-primary-result"],
    ["Other material result", r.results_evaluation.other_material_result, summary(r.results_evaluation.other_material_result, 180, "field-other-material-result"), "field-other-material-result"],
    ["Known limitation", r.results_evaluation.known_limitation, summary(r.results_evaluation.known_limitation, 180, "field-known-limitation"), "field-known-limitation"],
    ["What this establishes", r.results_evaluation.establishes, summary(r.results_evaluation.establishes, 180, "field-establishes"), "field-establishes"],
    ["What it does not establish", r.results_evaluation.does_not_establish, summary(r.results_evaluation.does_not_establish, 180, "field-does-not-establish"), "field-does-not-establish"],
  ];
  const focalResultRows = bestFinalEstablished && focalEvaluation ? [
    ["Evaluation design", focalEvaluation.evaluation_design, summary(focalEvaluation.evaluation_design, 180, "field-evaluation-design"), "field-evaluation-design"],
    ["Evaluation sample", focalEvaluation.evaluation_sample, focalEvaluation.evaluation_sample.state === "established" ? formatCountValue(focalEvaluation.evaluation_sample) : missingLabel(focalEvaluation.evaluation_sample, "field-evaluation-sample", r), "field-evaluation-sample"],
    ["Best recorded result", focalEvaluation.result, `${focalEvaluation.result.metric}: ${metricDisplay(focalEvaluation.result)}${focalEvaluation.result.method ? ` · ${focalEvaluation.result.method}` : ""}`, "field-primary-result"],
    ["Known limitation", focalEvaluation.known_limitation, summary(focalEvaluation.known_limitation, 180, "field-known-limitation"), "field-known-limitation"],
    ["What this establishes", focalEvaluation.establishes, summary(focalEvaluation.establishes, 180, "field-establishes"), "field-establishes"],
    ["What it does not establish", focalEvaluation.does_not_establish, summary(focalEvaluation.does_not_establish, 180, "field-does-not-establish"), "field-does-not-establish"],
  ] : legacyResultRows;
  const purposeRows = [
    ["Purpose", r.purpose_scope.purpose, "field-purpose"], ["Task", r.purpose_scope.task, "field-task"], ["Target / outcome", r.purpose_scope.target_outcome, "field-target-outcome"],
    ["Unit", r.purpose_scope.unit, "field-unit"], ["Population / scope", r.purpose_scope.population_scope, "field-population-scope"], ["Intended use", r.purpose_scope.intended_use, "field-intended-use"],
  ].map(([label, field, fieldId]) => [label, field, summary(field, 180, fieldId), fieldId]);
  const dataRows = [
    ["Data sources", r.data.data_sources, "field-data-sources"], ["Unit of observation", r.data.unit_of_observation, "field-unit-of-observation"], ["Period", r.data.period, "field-period"],
    ["Main population filters", r.data.population_filters, "field-main-population-filters"], ["Known population limitation", r.data.population_limitation, "field-known-population-limitation"],
  ].map(([label, field, fieldId]) => [label, field, summary(field, 180, fieldId), fieldId]);
  const [resultsModelKey, setResultsModelKey] = useState(null);
  const resultsModelContext = modelContextByKey(overviewModelPresentation, resultsModelKey || effectiveGlobalModelKey);
  const [resultsMetricKey, setResultsMetricKey] = useState(null);
  const effectiveResultsMetricKey = modelMetricKey(resultsModelContext, resultsMetricKey || globalMetricKey);
  const displayedMaterialResult = modelResult(resultsModelContext, effectiveResultsMetricKey);
  const resultsModelIndex = Math.max(0, overviewModelPresentation.contexts.findIndex((context) => context.id === resultsModelContext?.id));
  const resultsMetricIndex = Math.max(0, (resultsModelContext?.metrics || []).findIndex((metric) => metric.key === effectiveResultsMetricKey));
  useEffect(() => {
    setResultsModelKey(effectiveGlobalModelKey);
    setResultsMetricKey(modelMetricKey(globalModelContext, overviewModelPresentation.default_metric_key));
  }, [record.project_id, effectiveGlobalModelKey]);
  const resultsMetricDisplay = (item) => Number.isFinite(item?.raw_value)
    ? item.raw_value.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3, roundingMode: "halfEven", useGrouping: false })
    : formatMetricValue(item?.display_value);
  const resultsSelectionIsDefault = resultsModelContext?.id === overviewModelPresentation.default_model_key
    && effectiveResultsMetricKey === overviewModelPresentation.default_metric_key;
  const selectedResultId = displayedMaterialResult?.analytical_result_id || displayedMaterialResult?.id;
  const compatibleLimitations = analyticalLayer?.object_graph?.scoped_limitations || [];
  const selectedLimitation = compatibleLimitations.find((item) => item.subject_type === "MetricObservation" && item.subject_id === selectedResultId)
    || compatibleLimitations.find((item) => item.subject_type === "ModelRun" && resultsModelContext?.model_run_ids?.includes(item.subject_id))
    || compatibleLimitations.find((item) => item.subject_type === "EvaluationAttempt" && resultsModelContext?.evaluation_attempt_ids?.includes(item.subject_id))
    || compatibleLimitations.find((item) => item.subject_type === "PopulationNode" && resultsModelContext?.population_ids?.includes(item.subject_id))
    || compatibleLimitations.find((item) => item.subject_type === "TargetDefinition" && item.subject_id === resultsModelContext?.target_id)
    || compatibleLimitations.find((item) => ["IntendedUse", "Project", "Claim"].includes(item.subject_type))
    || null;
  const unavailableResultField = { state: "not_established", value: "Not established from compatible evidence for this result.", epistemic: "UNRESOLVED", evidence_ids: [] };
  const sharedBoundaryFallback = focalEvaluation ? unavailableResultField : r.results_evaluation.does_not_establish;
  const sharedLimitationFallback = focalEvaluation ? unavailableResultField : r.results_evaluation.known_limitation;
  const selectedKnownLimitation = selectedLimitation?.observed_fact
    ? { state: "established", value: selectedLimitation.observed_fact, epistemic: selectedLimitation.epistemic || "DERIVED", evidence_ids: selectedLimitation.evidence_ids || [] }
    : sharedLimitationFallback;
  const selectedBoundary = (selectedLimitation?.bounded_interpretation || selectedLimitation?.derived_relationship)
    ? { state: "established", value: selectedLimitation.bounded_interpretation || selectedLimitation.derived_relationship, epistemic: selectedLimitation.epistemic || "DERIVED", evidence_ids: selectedLimitation.evidence_ids || [] }
    : sharedBoundaryFallback;
  const selectedEstablishes = displayedMaterialResult ? {
    state: "established",
    value: `${resultsModelContext?.method || displayedMaterialResult.method} achieved ${resultsMetricDisplay(displayedMaterialResult)} ${displayedMaterialResult.metric} for ${mainTargetLabel}${displayedEvaluationSample?.state === "established" ? ` on the recorded evaluation sample of ${formatCountValue(displayedEvaluationSample)}` : " in the shared recorded evaluation context"}.`,
    epistemic: "DERIVED",
    evidence_ids: [...new Set([...(displayedMaterialResult.evidence_ids || []), ...(displayedEvaluationSample?.evidence_ids || [])])],
  } : unavailableResultField;
  const selectedResultRows = displayedMaterialResult ? [
    ["Evaluation design", displayedEvaluationDesign, summary(displayedEvaluationDesign, 180, "field-evaluation-design"), "field-evaluation-design"],
    ["Evaluation sample", displayedEvaluationSample, displayedEvaluationSample.state === "established" ? formatCountValue(displayedEvaluationSample) : missingLabel(displayedEvaluationSample, "field-evaluation-sample", r), "field-evaluation-sample"],
    [resultsSelectionIsDefault ? "Best recorded result" : "Recorded result", displayedMaterialResult, `${displayedMaterialResult.metric}: ${metricDisplay(displayedMaterialResult)}${resultsModelContext?.method ? ` · ${resultsModelContext.method}` : ""}`, "field-primary-result"],
    ["Known limitation", selectedKnownLimitation, summary(selectedKnownLimitation, 180, "field-known-limitation"), "field-known-limitation"],
    ["What this establishes", selectedEstablishes, summary(selectedEstablishes, 180, "field-establishes"), "field-establishes"],
    ["What it does not establish", selectedBoundary, summary(selectedBoundary, 180, "field-does-not-establish"), "field-does-not-establish"],
  ] : focalResultRows;
  const resultRows = resultsSelectionIsDefault ? focalResultRows : selectedResultRows;
  const fieldStates = Object.fromEntries(Object.entries(signalsLayer?.overview?.fields || {}).map(([id, item]) => [id, item.state]));
  const sectionStates = Object.fromEntries((signalsLayer?.overview?.sections || []).map((section) => [section.id, section.state]));
  const findingAssociations = buildOverviewFindingAssociations(signalsLayer);
  const analyticalFindingAssociations = buildAnalyticalFindingAssociations(signalsLayer);
  const purposeFindings = findingAssociations["section-purpose-scope"];
  const resultsFindings = findingAssociations["section-results-evaluation"];
  const dataFindings = findingAssociations["section-data-populations-samples"];
  const sampleStates = {
    source_data: fieldStates["field-source-data"], model_sample: fieldStates["field-model-sample"], evaluation_sample: fieldStates["field-evaluation-sample"],
    ids: { source_data: "field-source-data", model_sample: "field-model-sample", evaluation_sample: "field-evaluation-sample" },
  };
  const inspectState = (id) => onSignalInspect({ type: "state", id });

  return <main className={`overview overview--${activeView}`}>
    <div className={`project-sticky-bar ${stickyHeaderVisible ? "is-visible" : ""}`} aria-hidden={!stickyHeaderVisible}><Logo showVersion={false} showDemo /><ProjectMenuButton onClick={onOpenProjects} /></div>
    <div className="project-page__brand"><Logo showVersion={false} showDemo /></div>
    <ProjectMenuButton className="record-menu-button" onClick={onOpenProjects} />
    <div className="overview__inner">
    <header className="record-header">
      <div className="record-header__copy">
        <button type="button" className="project-directory-badge" onClick={onOpenProjects} aria-label="Back to Projects" title={record.source_project?.path || sourceFolder}><Icon name="Folder" /><span>/{sourceFolder}</span></button>
        <div className="record-title-and-actions">
          <div className="record-title-row"><h1 aria-label={projectTitle} title={projectTitle}>{projectTitleLines.map((line, index) => <span className="record-title-line" key={`${line}-${index}`}>{line}</span>)}</h1></div>
          <div className="record-title-actions">
            <button type="button" className={`record-title-action record-title-action--primary ${reanalysing ? "is-reanalysing" : ""}`} onClick={onReanalyse} disabled={reanalysing} data-demo-disabled={PUBLIC_DEMO || undefined} title={PUBLIC_DEMO ? "Reanalysis is disabled in the public demo" : undefined}><Icon name="Reanalyse_Top" />{reanalysing ? <><span>Reanalysing</span><span className="reanalysis-dots" aria-hidden="true"><i /><i /><i /></span></> : "Reanalyse"}</button>
            <ReportDownloadMenu projectId={record.project_id} />
          </div>
        </div>
        <strong className="project-intro-label">What is the project about</strong>
        <div className="description"><FieldValue field={description} onTrail={onTrail} displayValue={descriptionDisplay || "Missing information"} /></div>
      </div>
    </header>

    <div className="record-view-bar"><nav className="record-tabs" aria-label="Project record views"><button type="button" className={activeView === "overview" ? "is-active" : ""} onClick={() => onView("overview")}>Overview</button><button type="button" className={activeView === "signals" ? "is-active" : ""} onClick={() => onView("signals")}>Findings{signalsLayer ? <span>{signalsLayer.finding_count}</span> : null}</button><button type="button" className={activeView === "history" ? "is-active" : ""} onClick={() => onView("history")}>History</button></nav></div>

    {activeView === "overview" ? <section className={`hero-cards ${overviewModelPresentation.contexts.length > 1 ? "has-global-model-selector" : ""}`}>
      <div className={`primary-card ${overviewModelPresentation.contexts.length > 1 ? "has-model-selector " : ""}${incomplete ? "is-incomplete" : ""}`}>
        <div className="primary-card__metric"><span>{primaryResultLabel}</span>{globalSelectionIsDefault ? <HelpPopover label="Best recorded result">{HELP_COPY.bestRecordedResult}</HelpPopover> : null}{incomplete ? <EmptyEvidenceState title="Results and evaluation unavailable" className="empty-evidence-state--compact">{overviewAvailabilityMessage("results_evaluation", r)}</EmptyEvidenceState> : <div className="primary-card__value-row"><FieldValue field={primary} onTrail={onTrail} className={`primary-value ${metricLengthClass(primaryMetricDisplay)}`} displayValue={primaryMetricDisplay} /><MetricGauge key={effectiveGlobalModelKey || "focal-result"} value={primaryMetricRatio} /></div>}</div>
        {!incomplete ? <div className="primary-card__context"><AnalyticalSelector className="global-model-selector" options={overviewModelPresentation.contexts} selected={globalModelIndex} onSelect={(index) => setGlobalModelKey(overviewModelPresentation.contexts[index]?.id || overviewModelPresentation.default_model_key)} groupLabel="Model" ariaLabel="Global Overview model" label={(context) => context.label} /><div className="primary-card__target"><span>Target</span><strong title={mainTargetLabel}>{formatSupervisorCopy(mainTargetLabel, 82)}</strong></div></div> : null}
      </div>
      <div className={`samples-card ${wideDownstreamSamples ? "samples-card--wide-downstream " : ""}${samplesAvailable ? "" : "samples-card--empty"}`}><div className="samples-card__title"><h2>Data, Populations &amp; Samples</h2></div><HelpPopover label="Data, Populations & Samples" placement="bottom-end">{HELP_COPY.heroDataPopulations}</HelpPopover>{samplesAvailable ? <><HeroPopulationStrip samples={displayedSamples} /><Sample name="source_data" sample={displayedSamples.source_data} reconstruction={r} onTrail={onTrail} showStatus={false} /><Sample name="model_sample" sample={displayedSamples.model_sample} reconstruction={r} onTrail={onTrail} showStatus={false} /><Sample name="evaluation_sample" sample={displayedSamples.evaluation_sample} reconstruction={r} onTrail={onTrail} showStatus={false} /></> : <EmptyEvidenceState title="Population and sample counts unavailable" className="empty-evidence-state--hero">{overviewAvailabilityMessage("project_samples", r)}</EmptyEvidenceState>}</div>
      <ReconstructionConfidence confidence={signalsLayer?.result_confidence} reconstruction={r} plainReproductionBoundary={usesFocalStoryFallback} />
    </section> : null}
    {activeView === "signals" ? <SignalsView layer={signalsLayer} focusTarget={findingsTarget} onFocusHandled={onFindingsTargetHandled} onInspect={onSignalInspect} onEvidence={onSignalEvidence} /> : activeView === "history" ? <HistoryView layer={historyLayer} onEvidence={onHistoryEvidence} onDiagnostics={onDiagnostics} /> : <>
      <section className={`overview-section purpose-section ${purposeAvailable ? "" : "overview-section--empty"}`}><div className="section-copy"><SectionHeading field={r.purpose_scope.summary} onTrail={onTrail} signalState={sectionStates["section-purpose-scope"]} onSignalState={() => inspectState("section-purpose-scope")}>Purpose &amp; scope</SectionHeading>{purposeAvailable ? <FieldValue field={r.purpose_scope.summary} onTrail={onTrail} displayValue={r.purpose_scope.summary.state === "established" ? formatSupervisorSummary(r.purpose_scope.summary.value) : missingLabel(r.purpose_scope.summary)} /> : null}<OverviewFindingLinks association={purposeFindings} onNavigate={onFindingNavigate} /></div>{purposeAvailable ? <DataTable rows={purposeRows} onTrail={onTrail} signalStates={fieldStates} onSignalState={inspectState} /> : <EmptyEvidenceState title="Purpose and scope unavailable">{overviewAvailabilityMessage("purpose_scope", r)}</EmptyEvidenceState>}</section>

      <section className={`results-section ${resultsAvailable ? "" : "overview-section--empty"}`}>
        <div className="result-left"><div className="section-title-row"><h2>Results &amp; Evaluation</h2><HelpPopover label="Results & Evaluation">{HELP_COPY.resultsEvaluation}</HelpPopover></div><p className="results-section__intro">This section summarises the evaluation design, recorded model performance, and the limitations of the available evidence.</p><OverviewFindingLinks association={resultsFindings} onNavigate={onFindingNavigate} />{resultsAvailable ? (displayedMaterialResult ? <div className={`result-values result-values--selected ${resultsModelContext?.metrics?.length > 1 ? "has-metric-selector" : ""}`}><div className="result-context-selectors"><AnalyticalSelector options={overviewModelPresentation.contexts} selected={resultsModelIndex} onSelect={(index) => {
          const context = overviewModelPresentation.contexts[index];
          if (!context) return;
          setResultsModelKey(context.id);
          setResultsMetricKey(modelMetricKey(context, effectiveResultsMetricKey));
        }} groupLabel="Model" ariaLabel="Results and Evaluation model" label={(context) => context.label} />{resultsModelContext?.metrics?.length > 1 ? <AnalyticalSelector options={resultsModelContext.metrics} selected={resultsMetricIndex} onSelect={(index) => setResultsMetricKey(resultsModelContext.metrics[index]?.key)} groupLabel="Metric" ariaLabel="Results and Evaluation metric" label={(metric) => metric.label} /> : null}</div><div className="result-value" key={displayedMaterialResult.analytical_result_id || displayedMaterialResult.metric}><div className="result-value__target"><span>Target</span><strong title={mainTargetLabel}>{formatSupervisorCopy(mainTargetLabel, 72)}</strong></div><FieldValue field={displayedMaterialResult} onTrail={onTrail} className={`result-number ${metricLengthClass(resultsMetricDisplay(displayedMaterialResult))}`} displayValue={resultsMetricDisplay(displayedMaterialResult)} /></div></div> : <MissingResult result={primary} />) : null}</div>
        {resultsAvailable ? <DataTable rows={resultRows} onTrail={onTrail} signalStates={fieldStates} onSignalState={inspectState} /> : <EmptyEvidenceState title="Results and evaluation unavailable">{overviewAvailabilityMessage("results_evaluation", r)}</EmptyEvidenceState>}
      </section>

      <AnalyticalResults layer={analyticalLayer} modelPresentation={overviewModelPresentation} globalModelKey={effectiveGlobalModelKey} reconstruction={r} findingAssociations={analyticalFindingAssociations} onFindingNavigate={onFindingNavigate} onTrail={onTrail} />

      <section className="data-population-zone">
        <section className={`overview-section data-section ${dataAvailable ? "" : "overview-section--empty"}`}>{dataAvailable ? <><div className="data-left"><div className="data-heading"><SectionHeading field={r.data.summary} help={HELP_COPY.dataPopulations} onTrail={onTrail} signalState={sectionStates["section-data-populations-samples"]} onSignalState={() => inspectState("section-data-populations-samples")}>Data &amp; populations</SectionHeading><FieldValue field={r.data.summary} onTrail={onTrail} displayValue={summary(r.data.summary)} /><OverviewFindingLinks association={dataFindings} onNavigate={onFindingNavigate} /></div><DataTable rows={dataRows} onTrail={onTrail} signalStates={fieldStates} onSignalState={inspectState} /></div><PopulationFunnel samples={displayedSamples} reconstruction={r} onTrail={onTrail} signalStates={sampleStates} onSignalState={inspectState} /></> : <><div className="data-heading"><SectionHeading field={r.data.summary} help={HELP_COPY.dataPopulations} onTrail={onTrail} signalState={sectionStates["section-data-populations-samples"]} onSignalState={() => inspectState("section-data-populations-samples")}>Data &amp; populations</SectionHeading><OverviewFindingLinks association={dataFindings} onNavigate={onFindingNavigate} /></div><EmptyEvidenceState title="Data and populations unavailable">{overviewAvailabilityMessage("data_populations", r)}</EmptyEvidenceState></>}</section>
        <AnalyticalData layer={analyticalLayer} reconstruction={r} onTrail={onTrail} findingAssociations={analyticalFindingAssociations} onFindingNavigate={onFindingNavigate} />
      </section>
      <AnalyticalDetails layer={analyticalLayer} onTrail={onTrail} />
    </>}
    </div>
    <footer className="project-footer"><Logo /></footer>
  </main>;
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} s`;
}

function formatTokens(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "Unavailable";
}

function paidLabel(value) {
  return value === true ? "Yes" : value === false ? "No" : "Unknown";
}

function readableStage(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function diagnosticFinding(value) {
  const [location, ...detail] = String(value || "").split(": ");
  return {
    location: location.replace(/^record\./, "").split(".").map((part) => part.replaceAll("_", " ")).join(" › "),
    detail: detail.join(": ") || String(value || ""),
  };
}

function attemptOperation(attempt) {
  return attempt.operation === "localized_repair" ? "Localized repair" : attempt.operation === "full_reconstruction" ? "Full reconstruction" : "Model attempt";
}

function retryDescription(attempt) {
  if (attempt.retry?.reason === "localized_validation_repair") return `Localized repair scheduled for ${attempt.retry.target_fields.join(", ")}.`;
  if (attempt.operation === "localized_repair") return "Another localized repair was scheduled for the same fields.";
  return "Retry scheduled; these validation findings were supplied to the next attempt as corrections.";
}

function DiagnosticMetric({ label, value }) {
  return <div className="diagnostic-metric"><small>{label}</small><strong>{value}</strong></div>;
}

function DiagnosticsDrawer({ diagnostics, loading, onClose }) {
  const llm = diagnostics?.llm;
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="diagnostics-drawer">
    <button className="drawer-close" onClick={onClose}>×</button><div className="eyebrow">Audit diagnostics</div>
    {loading ? <div className="diagnostics-loading">Loading recorded execution history…</div> : <>
      <h2>{diagnostics.availability === "complete" ? "Execution trace" : "Historical telemetry"}</h2>
      {diagnostics.availability !== "complete" ? <div className="diagnostic-notice"><strong>Partial visibility</strong><p>{diagnostics.note}</p></div> : null}
      <div className="diagnostic-summary">
        <DiagnosticMetric label="Audit duration" value={formatDuration(diagnostics.total_duration_ms)} />
        <DiagnosticMetric label="Attempts" value={llm.attempt_count ?? "Unavailable"} />
        <DiagnosticMetric label="Provider calls" value={llm.provider_call_count ?? "Unavailable"} />
        <DiagnosticMetric label="Recorded tokens" value={formatTokens(llm.total_usage?.total_tokens)} />
        <DiagnosticMetric label="Paid model activity" value={paidLabel(llm.paid_model_activity)} />
        <DiagnosticMetric label="Final path" value={diagnostics.final?.generation_mode || llm.result || "Unknown"} />
      </div>

      {diagnostics.stages?.length ? <section className="diagnostic-section"><h3>Audit timeline</h3><div className="diagnostic-timeline">{diagnostics.stages.map((stage) => <div key={stage.stage}><span></span><div><strong>{readableStage(stage.stage)}</strong><small>{stage.status} · {formatDuration(stage.duration_ms)}</small></div></div>)}</div></section> : null}

      {llm.localized_repair ? <section className="diagnostic-section"><h3>Localized repair</h3><div className="diagnostic-notice"><strong>{readableStage(llm.localized_repair.status)}</strong><p>{llm.localized_repair.fields.join(", ")} · unrelated validated fields preserved</p></div></section> : null}

      <section className="diagnostic-section"><h3>Model attempts</h3>{llm.attempts?.length ? llm.attempts.map((attempt) => <article className={`diagnostic-attempt diagnostic-attempt--${attempt.outcome}`} key={attempt.attempt}>
        <div className="diagnostic-attempt__head"><strong>Attempt {attempt.attempt} · {attemptOperation(attempt)}</strong><span>{attempt.outcome}</span></div>
        <dl><div><dt>Duration</dt><dd>{formatDuration(attempt.duration_ms)}</dd></div><div><dt>Provider</dt><dd>{formatDuration(attempt.provider_duration_ms)}</dd></div><div><dt>Tokens</dt><dd>{formatTokens(attempt.usage?.total_tokens)}</dd></div><div><dt>Response</dt><dd>{attempt.response_id || attempt.provider_request_id || "Unavailable"}</dd></div></dl>
        {attempt.usage ? <p className="diagnostic-usage">Input {formatTokens(attempt.usage.input_tokens)} · cached {formatTokens(attempt.usage.cached_input_tokens)} · output {formatTokens(attempt.usage.output_tokens)} · reasoning {formatTokens(attempt.usage.reasoning_output_tokens)}</p> : null}
        {attempt.failure ? <div className="diagnostic-failure"><strong>{readableStage(attempt.failure.stage)}</strong>{attempt.validation?.errors?.length ? <ul>{attempt.validation.errors.map((error, index) => { const finding = diagnosticFinding(error); return <li key={`${attempt.attempt}-${index}`}><b>{finding.location}</b><span>{finding.detail}</span></li>; })}</ul> : <p>{attempt.failure.message}</p>}</div> : null}
        {attempt.retry_scheduled ? <small className="diagnostic-retry">{retryDescription(attempt)}</small> : null}
        {attempt.correction_applied ? <small className="diagnostic-correction">{attempt.operation === "localized_repair" ? "This repair received only the target fields, their cited evidence, and the validation findings." : "This attempt received the previous validation findings as correction context."}</small> : null}
      </article>) : <p className="diagnostic-empty">Per-attempt telemetry was not recorded for this audit.</p>}</section>

      {diagnostics.unavailable?.length ? <section className="diagnostic-section"><h3>Unavailable for this audit</h3><ul>{diagnostics.unavailable.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
      {diagnostics.related_legacy_audits?.length ? <section className="diagnostic-section"><h3>Preserved audit reports</h3>{diagnostics.related_legacy_audits.map((audit) => <a className="legacy-audit" href={audit.report_url} target="_blank" rel="noreferrer" key={audit.audit_id}><span><strong>{audit.label}</strong><small>{audit.audit_id} · {audit.telemetry_availability}</small></span><span>↗</span></a>)}</section> : null}
    </>}
  </aside></div>;
}

function EvidenceDrawer({ item, evidence, onClose }) {
  const sources = useMemo(() => (item?.evidence_ids || []).map((id) => evidence.find((entry) => entry.id === id)).filter(Boolean), [item, evidence]);
  const heading = item?.display_value != null ? formatMetricValue(item.display_value) : (item?.value ?? item?.display);
  return <div className="drawer-backdrop evidence-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="evidence-drawer"><button className="drawer-close" onClick={onClose}>×</button><div className="eyebrow">Evidence trail</div><h2>{heading}</h2><div className="epistemic">{item?.epistemic?.replace("_", " / ")}</div>{sources.map((source) => <article key={source.id}><strong>{source.path}</strong><small>{source.id} · {source.kind}</small><pre>{source.excerpt}</pre></article>)}</aside></div>;
}

function DemoActionNotice({ message, onClose }) {
  if (!message) return null;
  return <aside className="demo-action-notice" role="status" aria-live="polite">
    <Icon name="Info_Tulip" />
    <p><strong>Public demo</strong><span>{message}</span></p>
    <button type="button" onClick={onClose} aria-label="Close demo notice">×</button>
  </aside>;
}

function App() {
  const [screen, setScreen] = useState("welcome");
  const [projectsOverlayOpen, setProjectsOverlayOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectOrderBusy, setProjectOrderBusy] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const cancelRemove = useCallback(() => { if (!deleteBusy) setDeleteCandidate(null); }, [deleteBusy]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [record, setRecord] = useState(null);
  const [signalsLayer, setSignalsLayer] = useState(null);
  const [historyLayer, setHistoryLayer] = useState(null);
  const [analyticalLayer, setAnalyticalLayer] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [findingsTarget, setFindingsTarget] = useState(null);
  const [signalSelection, setSignalSelection] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [trail, setTrail] = useState(null);
  const [reanalysing, setReanalysing] = useState(false);
  const [error, setError] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [demoNotice, setDemoNotice] = useState("");
  const demoNoticeTimer = useRef(null);
  const showDemoAction = useCallback((action) => {
    const messages = {
      import: "New project analysis and import are disabled. This site contains pre-analysed, read-only project snapshots.",
      delete: "Demo projects are fixed snapshots and cannot be deleted from the public site.",
      reanalyse: "Reanalysis is disabled because the public demo does not run the analytical backend or use provider credentials.",
    };
    window.clearTimeout(demoNoticeTimer.current);
    setDemoNotice(messages[action] || "This action is disabled in the read-only public demo.");
    demoNoticeTimer.current = window.setTimeout(() => setDemoNotice(""), 7000);
  }, []);
  useEffect(() => () => window.clearTimeout(demoNoticeTimer.current), []);
  useSiteMotion([record?.project_id, activeView, projectsLoaded, signalsLayer, historyLayer, analyticalLayer]);
  useEffect(() => {
    if (!projectsOverlayOpen && !deleteCandidate) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (deleteCandidate && !deleteBusy) cancelRemove();
      else if (!deleteCandidate) setProjectsOverlayOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectsOverlayOpen, deleteCandidate, deleteBusy, cancelRemove]);
  async function loadSignals(id) {
    setSignalsLayer(null);
    try { setSignalsLayer(await api(`/api/projects/${id}/signals`)); }
    catch { setSignalsLayer(null); }
  }
  async function loadHistory(id) {
    setHistoryLayer(null);
    try { setHistoryLayer(await api(`/api/projects/${id}/history`)); }
    catch { setHistoryLayer(null); }
  }
  async function loadAnalytical(id) {
    setAnalyticalLayer(null);
    try { setAnalyticalLayer(await api(`/api/projects/${id}/analytical`)); }
    catch { setAnalyticalLayer(null); }
  }
  async function loadLayers(id) { await Promise.all([loadSignals(id), loadHistory(id), loadAnalytical(id)]); }
  async function withFindingCounts(items) {
    return Promise.all(items.map(async (project) => {
      try { return { ...project, finding_count: (await api(`/api/projects/${project.project_id}/signals`)).finding_count }; }
      catch { return project; }
    }));
  }
  function applyFindingCounts(items) {
    const findingsByProject = new Map(items
      .filter((project) => Number.isFinite(project.finding_count))
      .map((project) => [project.project_id, project.finding_count]));
    setProjects((current) => current.map((project) => findingsByProject.has(project.project_id)
      ? { ...project, finding_count: findingsByProject.get(project.project_id) }
      : project));
  }
  async function refreshProjects() {
    const items = applyStoredProjectOrder(await api("/api/projects"));
    setProjects(items);
    setSelectedProjectId((current) => current || items[0]?.project_id || null);
    withFindingCounts(items).then(applyFindingCounts).catch(() => {});
    return items;
  }
  useEffect(() => { api("/api/projects").then((items) => applyStoredProjectOrder(items)).then((items) => { setProjects(items); setSelectedProjectId(items[0]?.project_id || null); setProjectsLoaded(true); withFindingCounts(items).then(applyFindingCounts).catch(() => {}); }).catch((err) => { setError(err.message); setProjectsLoaded(true); }); }, []);
  async function reorderProjectCards(projectIds) {
    if (projectOrderBusy) return;
    const previousProjects = projects;
    const projectsById = new Map(projects.map((project) => [project.project_id, project]));
    const reordered = projectIds.map((projectId) => projectsById.get(projectId)).filter(Boolean);
    if (reordered.length !== projects.length) return;
    setProjects(reordered);
    storeProjectOrder(projectIds);
    if (PUBLIC_DEMO) return;
    setProjectOrderBusy(true);
    setError("");
    try {
      await api("/api/projects/order", { method: "PUT", body: JSON.stringify({ project_ids: projectIds }) });
    } catch (err) {
      if (err.code === "PROJECT_ORDER_ENDPOINT_UNAVAILABLE") return;
      setProjects(previousProjects);
      storeProjectOrder(previousProjects.map((project) => project.project_id));
      setError(err.message);
    } finally {
      setProjectOrderBusy(false);
    }
  }
  async function select(id) { setError(""); setDiagnosticsOpen(false); setSignalSelection(null); setFindingsTarget(null); setActiveView("overview"); setSelectedProjectId(id); try { const next = await api(`/api/projects/${id}`); setRecord(next); setScreen("project"); setProjectsOverlayOpen(false); window.scrollTo(0, 0); await loadLayers(id); } catch (err) { setError(err.message); } }
  async function imported(next) { setRecord(next); setSelectedProjectId(next.project_id); setShowImport(false); setSignalSelection(null); setFindingsTarget(null); setActiveView("overview"); setScreen("project"); setProjectsOverlayOpen(false); await refreshProjects(); await loadLayers(next.project_id); }
  async function reanalyse() { if (PUBLIC_DEMO) { showDemoAction("reanalyse"); return; } setReanalysing(true); setError(""); try { await imported(await api(`/api/projects/${record.project_id}/reanalyse`, { method: "POST", body: "{}" })); } catch (err) { setError(err.message); } finally { setReanalysing(false); } }
  async function openDiagnostics() { setDiagnosticsOpen(true); setDiagnosticsLoading(true); setDiagnostics(null); try { setDiagnostics(await api(`/api/projects/${record.project_id}/diagnostics`)); } catch (err) { setDiagnosticsOpen(false); setError(err.message); } finally { setDiagnosticsLoading(false); } }
  function remove(project) { if (PUBLIC_DEMO) { showDemoAction("delete"); return; } setDeleteCandidate(project); }
  function beginImport() { if (PUBLIC_DEMO) { showDemoAction("import"); return; } setShowImport(true); }
  async function confirmRemove() {
    if (!deleteCandidate || deleteBusy) return;
    const project = deleteCandidate;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/api/projects/${project.project_id}`, { method: "DELETE" });
      const next = projects.filter((item) => item.project_id !== project.project_id);
      setProjects(next);
      storeProjectOrder(next.map((item) => item.project_id));
      setSelectedProjectId((current) => current === project.project_id ? (next[0]?.project_id || null) : current);
      if (record?.project_id === project.project_id) {
        setRecord(null);
        setSignalsLayer(null);
        setHistoryLayer(null);
        setAnalyticalLayer(null);
        setProjectsOverlayOpen(false);
        setScreen("projects");
      }
      setDeleteCandidate(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  }
  function showHome() { setProjectsOverlayOpen(false); setScreen("welcome"); setSignalSelection(null); setDiagnosticsOpen(false); setTrail(null); window.scrollTo(0, 0); }
  function showProjects() { if (record?.project_id) setSelectedProjectId(record.project_id); setSignalSelection(null); setDiagnosticsOpen(false); setTrail(null); setFindingsTarget(null); if (screen === "project" && record) setProjectsOverlayOpen((open) => !open); else { setProjectsOverlayOpen(false); setScreen("projects"); } }
  function changeView(view) { setFindingsTarget(null); setActiveView(view); }
  function navigateToFindingGroup(target) { setFindingsTarget(target); setActiveView("signals"); }
  function openSignalEvidence(ids) { setSignalSelection(null); setTrail({ value: "Signal evidence trail", epistemic: "DERIVED", evidence_ids: Array.isArray(ids) ? ids : [ids] }); }
  function openHistoryEvidence(id) { setTrail({ value: "History evidence trail", epistemic: "OBSERVED", evidence_ids: [id] }); }
  const currentNavigation = projectsOverlayOpen || screen === "projects" ? "projects" : screen;
  const content = screen === "welcome"
    ? <WelcomeSurface />
    : screen === "project" && record
      ? <div className="app-shell" inert={projectsOverlayOpen ? true : undefined} aria-hidden={projectsOverlayOpen || undefined}><Overview record={record} signalsLayer={signalsLayer} historyLayer={historyLayer} analyticalLayer={analyticalLayer} activeView={activeView} onView={changeView} findingsTarget={findingsTarget} onFindingsTargetHandled={() => setFindingsTarget(null)} onFindingNavigate={navigateToFindingGroup} onOpenProjects={showProjects} onSignalInspect={setSignalSelection} onSignalEvidence={openSignalEvidence} onHistoryEvidence={openHistoryEvidence} onReanalyse={reanalyse} reanalysing={reanalysing} onTrail={setTrail} onDiagnostics={openDiagnostics} /></div>
      : projectsLoaded
        ? <ProjectsSurface projects={projects} onOpen={select} onAdd={beginImport} onDelete={remove} onReorder={reorderProjectCards} reorderBusy={projectOrderBusy} publicDemo={PUBLIC_DEMO} />
        : <main className="app-loading" aria-label="Loading projects" />;
  return <><div className="v100b-app" inert={deleteCandidate ? true : undefined} aria-hidden={deleteCandidate ? true : undefined}>{content}<GlobalNavigation active={currentNavigation} onHome={showHome} onProjects={showProjects} />{projectsOverlayOpen && record ? <div className="projects-overlay" role="dialog" aria-modal="true" aria-label="Projects"><ProjectsSurface projects={projects} onOpen={select} onAdd={beginImport} onDelete={remove} onReorder={reorderProjectCards} reorderBusy={projectOrderBusy} onClose={() => setProjectsOverlayOpen(false)} overlay publicDemo={PUBLIC_DEMO} /></div> : null}</div>{error ? <div className="toast" role="alert">{error}<button onClick={() => setError("")}>×</button></div> : null}<DemoActionNotice message={demoNotice} onClose={() => setDemoNotice("")} />{showImport ? <ImportModal onClose={() => setShowImport(false)} onImported={imported} /> : null}<DeleteProjectDialog project={deleteCandidate} busy={deleteBusy} onCancel={cancelRemove} onConfirm={confirmRemove} />{trail && record ? <EvidenceDrawer item={trail} evidence={[...(record.evidence || []), ...(historyLayer?.evidence || [])]} onClose={() => setTrail(null)} /> : null}{diagnosticsOpen ? <DiagnosticsDrawer diagnostics={diagnostics} loading={diagnosticsLoading} onClose={() => setDiagnosticsOpen(false)} /> : null}{signalSelection ? <SignalsDetailDrawer selection={signalSelection} layer={signalsLayer} onClose={() => setSignalSelection(null)} onInspect={setSignalSelection} onEvidence={openSignalEvidence} /> : null}</>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
