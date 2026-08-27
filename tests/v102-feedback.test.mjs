import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reorderProjects, saveRecord } from "../engine/persistence.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const menu = readFileSync(new URL("../public/ui/Menu.svg", import.meta.url), "utf8");
const dragIcon = readFileSync(new URL("../public/ui/Drag_Icon.svg", import.meta.url), "utf8");
const demoBannerClose = readFileSync(new URL("../public/ui/Demo_Banner_Close.svg", import.meta.url), "utf8");
const server = readFileSync(new URL("../engine/server.mjs", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../engine/persistence.mjs", import.meta.url), "utf8");
const devLauncher = readFileSync(new URL("../scripts/dev.mjs", import.meta.url), "utf8");
const demoApi = readFileSync(new URL("../src/demo-api.mjs", import.meta.url), "utf8");
const v102 = styles.slice(styles.indexOf("/* v1.0.2"));

test("v1.0.2 stores and uses the supplied 46px Figma dashboard menu asset", () => {
  assert.match(main, /function ProjectMenuButton[\s\S]*?<Icon name="Menu"/);
  assert.match(menu, /width="46" height="46" viewBox="0 0 46 46"/);
  assert.match(menu, /d="M14\.0968 17\.0645H31\.9032"/);
  assert.equal((menu.match(/stroke="#282A2E" stroke-width="2"/g) || []).length, 3);
  assert.match(v102, /\.project-menu-button \.ui-icon \{ width: 46px; height: 46px; \}/);
  assert.match(v102, /\.record-menu-button \{ z-index: 4; \}/);
  assert.match(v102, /\.evaluation-behaviour:not\(\.analytical-frame--empty\) > \.evaluation-heading\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*3;[\s\S]*?overflow:\s*visible;/);
});

test("v1.0.2 makes the lineage graph and its staged node cards visible", () => {
  assert.match(v102, /\.lineage-graph \{ border: 1px solid #ebebeb; background: #fff; \}/);
  assert.match(v102, /\.lineage-node--depth-0 \{ background: #222; \}/);
  assert.match(v102, /\.lineage-node--depth-1 \{ background: rgba\(34, 34, 34, \.75\); \}/);
  assert.match(v102, /\.lineage-node--depth-2 \{ background: rgba\(34, 34, 34, \.5\); \}/);
  assert.match(v102, /\.lineage-node--depth-3 \{ background: rgba\(34, 34, 34, \.25\); \}/);
  assert.match(v102, /\.lineage-edges rect \{ fill: #222; \}/);
  assert.match(v102, /\.lineage-edges text \{ fill: #fff; \}/);
});

test("v1.0.2 keeps the Evidence Trail above navigation and modal layers", () => {
  assert.match(main, /className="drawer-backdrop evidence-drawer-backdrop"[\s\S]*?<aside className="evidence-drawer">/);
  assert.match(v102, /\.evidence-drawer-backdrop \{ z-index: 100; \}/);
});

test("v1.0.2 keeps Projects scrollable and places findings after the title", () => {
  assert.match(v102, /\.projects-surface \{ overflow-x: hidden; overflow-y: auto; \}/);
  assert.match(v102, /\.project-library \{ padding-bottom: 140px; \}/);
  assert.match(v102, /\.project-library__heading p \{ margin-top: 7px; \}/);
  assert.match(v102, /grid-template-columns: minmax\(290px, 1\.05fr\) 30px minmax\(290px, \.9fr\) 120px/);
  const projectsSurface = main.slice(main.indexOf("function ProjectsSurface"), main.indexOf("function EmptyState"));
  assert.ok(projectsSurface.indexOf("<strong title={title}>{title}</strong>") < projectsSurface.indexOf("project-library__findings"));
  assert.ok(projectsSurface.indexOf("project-library__findings") < projectsSurface.indexOf("<span title={project.source_project_path"));
  assert.match(main, /<Icon name="Project_Remove" \/>/);
  assert.match(styles, /\.project-library__open > \.project-library__findings \{[\s\S]*?width: 30px;[\s\S]*?height: 15px;[\s\S]*?border-radius: 50px;[\s\S]*?background: var\(--ui-red\);[\s\S]*?color: #fff;[\s\S]*?font-size: 11px;[\s\S]*?font-weight: 700;[\s\S]*?transform: translateX\(-8px\)/);
  assert.match(styles, /\.project-library__row:last-child \{ border-bottom-color: var\(--v100b-line\); margin-bottom: 1px; \}/);
});

test("v1.0.2 uses one Figma import screen above either Projects context", () => {
  assert.equal((main.match(/<ImportModal /g) || []).length, 1);
  assert.equal((main.match(/onAdd=\{beginImport\}/g) || []).length, 2);
  assert.match(main, /function beginImport\(\) \{ if \(PUBLIC_DEMO\) \{ showDemoAction\("import"\); return; \} setShowImport\(true\); \}/);
  assert.match(main, /role="dialog" aria-modal="true" aria-labelledby="import-title"/);
  assert.match(main, /Import_Project_Large/);
  assert.match(main, /Import_Close/);
  assert.match(main, /Import_Path_Folder/);
  assert.match(main, /Import_Browse/);
  assert.match(main, /disabled=\{busy \|\| !directory\.trim\(\)\}/);
  assert.match(main, /api\("\/api\/analyse"[\s\S]*?path: directory\.trim\(\)/);
  assert.match(styles, /\.modal-backdrop \{[\s\S]*?z-index: 80;[\s\S]*?backdrop-filter: blur\(11\.15px\)/);
  assert.match(styles, /\.import-modal \.import-grid h2 \{[^}]*font-size: 45px;[^}]*font-weight: 700;/);
  assert.match(styles, /\.import-modal \.import-grid \{ display: block; \}/);
  assert.match(styles, /\.import-modal \.modal-close \.ui-icon \{ width: 46px; height: 46px; \}/);
  assert.match(styles, /\.import-actions \.button \{ width: 180px; height: 40px;/);
});

test("v1.0.2 closes only the overlaid Projects menu with the Figma close control", () => {
  assert.match(main, /function ProjectsSurface\(\{ projects, onOpen, onAdd, onDelete, onReorder, reorderBusy = false, onClose, overlay = false, publicDemo = false \}\)/);
  assert.match(main, /\{overlay \? <button type="button" className="projects-overlay__close" onClick=\{onClose\} aria-label="Close Projects"><Icon name="Import_Close" \/><\/button> : null\}/);
  assert.match(main, /onClose=\{\(\) => setProjectsOverlayOpen\(false\)\} overlay/);
  assert.match(styles, /\.projects-overlay__close \{[\s\S]*?position: absolute;[\s\S]*?top: 24px;[\s\S]*?right: 44px;/);
  assert.match(styles, /\.projects-overlay__close \.ui-icon \{ width: 46px; height: 46px; \}/);
});

test("v1.0.2 includes the final public-surface refinements", () => {
  assert.match(main, /className="welcome-typewriter">Auditable by design/);
  assert.match(styles, /animation: welcome-type-in 1\.55s steps\(20, end\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.welcome-surface h1 > \.welcome-typewriter \{ clip-path: none; animation: none; \}/);
  assert.match(styles, /\.supervisor-finding \{ border-left: 0; \}/);
  assert.match(styles, /\.import-actions \.button--subtle \.ui-icon \{ width: 17\.52px; height: 17\.52px; order: -1; \}/);
});

test("v1.0.2 shows the Figma public-demo banner on Home only", () => {
  const welcomeSurface = main.slice(main.indexOf("function WelcomeSurface"), main.indexOf("function missingLabel"));
  assert.match(welcomeSurface, /className={`demo-banner \$\{demoBannerVisible \? "is-visible" : "is-hidden"\}`}/);
  assert.match(welcomeSurface, /<strong>This public demo uses pre-analysed projects only\.<\/strong> New project analysis is disabled, and some project information may be incomplete\./);
  assert.match(welcomeSurface, /aria-label="Close public demo notice"/);
  assert.match(welcomeSurface, /src="\/ui\/Demo_Banner_Close\.svg"/);
  assert.equal((main.match(/<WelcomeSurface \/>/g) || []).length, 1);
  assert.match(styles, /\.demo-banner \{[\s\S]*?min-height: 30px;[\s\S]*?background: var\(--ui-red\);[\s\S]*?font-size: 13px;/);
  assert.match(styles, /\.demo-banner__close img \{ display: block; width: 19\.5352px; height: 19\.5352px; \}/);
});

test("v1.0.2 banner responds to downward scroll gestures and reduced-motion preferences", () => {
  const welcomeSurface = main.slice(main.indexOf("function WelcomeSurface"), main.indexOf("function missingLabel"));
  assert.match(welcomeSurface, /nextScrollY > lastScrollY\.current/);
  assert.match(welcomeSurface, /event\.deltaY > 0/);
  assert.match(welcomeSurface, /nextTouchY < touchY\.current/);
  assert.match(welcomeSurface, /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
  assert.match(welcomeSurface, /window\.addEventListener\("wheel", onWheel, \{ passive: true \}\)/);
  assert.match(welcomeSurface, /window\.addEventListener\("touchmove", onTouchMove, \{ passive: true \}\)/);
  assert.match(styles, /@keyframes demo-banner-slide-in[\s\S]*?from \{ transform: translateY\(-100%\); \}[\s\S]*?to \{ transform: translateY\(0\); \}/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.demo-banner,[\s\S]*?\.demo-banner\.is-hidden \{ animation: none; transition: none; \}/);
});

test("v1.0.2 automatically dismisses the Home demo banner after ten seconds without leaking its timer", () => {
  const welcomeSurface = main.slice(main.indexOf("function WelcomeSurface"), main.indexOf("function missingLabel"));
  assert.match(welcomeSurface, /const dismissalTimer = window\.setTimeout\(hideBanner, 10_000\);/);
  assert.match(welcomeSurface, /return \(\) => \{\s*window\.clearTimeout\(dismissalTimer\);/);
  assert.equal((welcomeSurface.match(/setDemoBannerVisible\(false\)/g) || []).length, 2);
});

test("v1.0.2 stores the exact exported Figma demo-banner close asset", () => {
  assert.equal(demoBannerClose.trim(), '<svg preserveAspectRatio="none" overflow="visible" style="display: block;" width="19.5352" height="19.5352" viewBox="0 0 19.5352 19.5352" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="Close Button"><circle id="Ellipse 31" cx="9.76758" cy="9.76758" r="9.01758" stroke="white" stroke-width="1.5"/><g id="Group 24"><path id="Vector 87" d="M7.21925 12.586L12.5664 7.23888" stroke="white" stroke-width="1.30234" stroke-linecap="round"/><path id="Vector 89" d="M7.24136 7.21947L12.5885 12.5666" stroke="white" stroke-width="1.30234" stroke-linecap="round"/></g></g></svg>');
});

test("v1.0.2 unifies solid red accents without changing gradients or confidence indicators", () => {
  assert.match(styles, /--ui-red: #ff5656;/);
  assert.match(styles, /--signal-red: var\(--ui-red\);/);
  assert.match(styles, /--v15-coral: var\(--ui-red\);/);
  assert.match(styles, /\.supervisor-finding--severity-high \{ --signal-risk-accent: var\(--ui-red\); \}/);
  assert.match(styles, /\.supervisor-finding--severity-critical \{ --signal-risk-accent: var\(--ui-red\); \}/);
  assert.doesNotMatch(styles, /#(?:f15f67|e45f62|ef7659|ff4545|ff4d54|fe9395|b32222|ffb0cc)/i);
  assert.match(styles, /--confidence-low: #dc5a5a;/);
  assert.match(styles, /--confidence-fill: #ff8f98;/);
  assert.match(styles, /background: linear-gradient\(90deg, #ffc95a 0 47%, transparent 47%\), repeating-linear-gradient/);
  assert.match(main, /mixGaugeColour\("#ff8f98", "#ffc95a"/);
});

test("v1.0.2 shows its version on Home and pins the mobile result help control", () => {
  assert.match(main, /className="welcome-version">Alpha \{applicationVersion\}<\/span>/);
  assert.match(v102, /\.welcome-version \{[\s\S]*?left: 50px;[\s\S]*?bottom: 30px;/);
  assert.match(v102, /@media \(max-width: 760px\)[\s\S]*?\.overview--overview \.primary-card \{ position: relative; \}[\s\S]*?\.overview--overview \.primary-card__metric > \.help-popover \{ left: auto; right: 12px; top: 12px; \}/);
});

test("v1.0.2 keeps project insertion order stable", async () => {
  assert.doesNotMatch(persistence, /registry\.projects = \[summary, \.\.\.registry\.projects/);
  assert.match(persistence, /existingIndex >= 0\) registry\.projects\[existingIndex\] = summary;\s*else registry\.projects\.push\(summary\)/);
  assert.match(persistence, /projects\.push\(\.\.\.recovered\)/);
  assert.doesNotMatch(persistence, /registry\.projects\.sort\(\(a, b\) => String\(b\.analysed_at/);

  const storage = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-v102-project-order-"));
  const first = { project_id: "FIRST", analysed_at: "2026-08-20T00:00:00.000Z", reconstruction: {} };
  const second = { project_id: "SECOND", analysed_at: "2026-08-21T00:00:00.000Z", reconstruction: {} };
  await saveRecord(first, { storage });
  await saveRecord(second, { storage });
  await saveRecord({ ...first, analysed_at: "2026-08-22T00:00:00.000Z" }, { storage });
  const registry = JSON.parse(await fs.readFile(path.join(storage, "registry.json"), "utf8"));
  assert.deepEqual(registry.projects.map((project) => project.project_id), ["FIRST", "SECOND"]);
  assert.equal(registry.projects[0].analysed_at, "2026-08-22T00:00:00.000Z");
});

test("v1.0.2 supports persistent drag and keyboard project ordering", async () => {
  assert.match(dragIcon, /width="14\.8065" height="13\.871"/);
  assert.equal((dragIcon.match(/stroke="#A5A5A5" stroke-width="2" stroke-linecap="round"/g) || []).length, 3);
  assert.match(main, /className="project-library__drag-handle"/);
  assert.match(main, /data-project-id=\{project\.project_id\}/);
  assert.match(main, /onPointerDown=\{\(event\) =>/);
  assert.match(main, /onPointerMove=\{updatePointerTarget\}/);
  assert.match(main, /onPointerUp=\{finishPointerDrag\}/);
  assert.match(main, /setPointerCapture\(event\.pointerId\)/);
  assert.match(main, /\["ArrowUp", "ArrowDown"\]/);
  assert.match(main, /aria-live="polite"/);
  assert.match(main, /api\("\/api\/projects\/order", \{ method: "PUT"/);
  assert.match(server, /app\.put\("\/api\/projects\/order"/);
  assert.match(v102, /\.project-library__row \{[\s\S]*?grid-template-columns: 44px 28px minmax\(0, 1fr\) 44px;/);
  assert.match(v102, /\.project-library__drag-handle \.ui-icon \{[\s\S]*?width: 14\.8065px;[\s\S]*?height: 13\.871px;/);
  assert.match(v102, /\.project-library__drag-handle \{[\s\S]*?touch-action: none;/);

  const storage = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-v102-project-reorder-"));
  const projects = ["FIRST", "SECOND", "THIRD"].map((project_id, index) => ({ project_id, analysed_at: `2026-08-2${index}T00:00:00.000Z`, reconstruction: {} }));
  for (const project of projects) await saveRecord(project, { storage });
  const reordered = await reorderProjects(["THIRD", "FIRST", "SECOND"], { storage });
  assert.deepEqual(reordered.map((project) => project.project_id), ["THIRD", "FIRST", "SECOND"]);
  const registry = JSON.parse(await fs.readFile(path.join(storage, "registry.json"), "utf8"));
  assert.deepEqual(registry.projects.map((project) => project.project_id), ["THIRD", "FIRST", "SECOND"]);
  await assert.rejects(() => reorderProjects(["FIRST", "SECOND"], { storage }), /every current project exactly once/);
});

test("v1.0.2 keeps the ordering API live during local development and handles stale servers cleanly", () => {
  assert.match(devLauncher, /spawn\(process\.execPath, \["--watch", "engine\/server\.mjs"\]/);
  assert.match(devLauncher, /VITE_BOVEDA_RUNTIME: "local"/);
  assert.match(demoApi, /const contentType = response\.headers\.get\("content-type"\) \|\| "";/);
  assert.match(demoApi, /if \(!contentType\.includes\("application\/json"\)\)/);
  assert.match(demoApi, /error\.code = "PROJECT_ORDER_ENDPOINT_UNAVAILABLE";/);
  assert.match(demoApi, /The local Bóveda server needs to restart before projects can be reordered\./);
  assert.doesNotMatch(demoApi, /const payload = await response\.json\(\);/);
});

test("v1.0.2 preserves drag ordering locally while an older backend is still running", () => {
  assert.match(main, /const PROJECT_ORDER_STORAGE_KEY = "boveda\.project-order\.v1";/);
  assert.match(main, /function applyStoredProjectOrder\(projects\)/);
  assert.match(main, /storeProjectOrder\(projectIds\);/);
  assert.match(main, /if \(err\.code === "PROJECT_ORDER_ENDPOINT_UNAVAILABLE"\) return;/);
  assert.match(main, /api\("\/api\/projects"\)\.then\(\(items\) => applyStoredProjectOrder\(items\)\)/);
});

test("v1.0.2 uses an in-app project deletion confirmation", () => {
  assert.doesNotMatch(main, /window\.confirm/);
  assert.match(main, /function DeleteProjectDialog\(\{ project, busy, onCancel, onConfirm \}\)/);
  assert.match(main, /role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title"/);
  assert.match(main, /The imported project and its files will not be touched\./);
  assert.match(main, /<Icon name="Import_Close" \/>/);
  assert.match(main, /function remove\(project\) \{ if \(PUBLIC_DEMO\) \{ showDemoAction\("delete"\); return; \} setDeleteCandidate\(project\); \}/);
  assert.match(main, /await api\(`\/api\/projects\/\$\{project\.project_id\}`/);
  assert.match(styles, /\.delete-dialog-backdrop \{[\s\S]*?z-index: 90;[\s\S]*?backdrop-filter: blur\(11\.15px\)/);
  assert.match(styles, /\.delete-dialog \{[\s\S]*?border: 1px solid var\(--v100b-line\);[\s\S]*?background: var\(--v100b-surface\)/);
});
