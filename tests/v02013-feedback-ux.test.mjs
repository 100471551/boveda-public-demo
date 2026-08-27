import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("truncated dashboard labels retain their complete text as native tooltips", async () => {
  const [main, analytical] = await Promise.all([read("../src/main.jsx"), read("../src/analytical-view.jsx")]);
  assert.match(main, /className="project-directory-badge"[^>]*title=\{record\.source_project\?\.path \|\| sourceFolder\}/);
  assert.match(main, /<h1 aria-label=\{projectTitle\} title=\{projectTitle\}>/);
  assert.ok((main.match(/<strong title=\{mainTargetLabel\}>/g) || []).length >= 2);
  assert.match(analytical, /const tooltip = title \|\| object\?\.name[\s\S]*title=\{tooltip \|\| undefined\}/);
  assert.match(analytical, /className="analytical-selector__trigger"[\s\S]*<strong title=\{labels\[current\]\}>/);
});

test("the active project drawer name uses the same title as the open dashboard", async () => {
  const main = await read("../src/main.jsx");
  assert.match(main, /function ProjectMenuDrawer\(\{[^}]*currentProjectTitle/);
  assert.match(main, /project\.project_id === currentProjectId && currentProjectTitle\s*\? currentProjectTitle/);
  assert.match(main, /currentProjectTitle=\{projectTitle\}/);
});

test("the source lineage node separates its numerical value from its descriptive label", async () => {
  const analytical = await read("../src/analytical-view.jsx");
  assert.match(analytical, /node\.depth === 0 \? <><strong>\{formatValue\(node\.count\)\}<\/strong><small>\{nodeLabel\(node\)\}<\/small>/);
  assert.match(analytical, /Number\(match\[1\]\.replaceAll\(",", ""\)\) === node\.count/);
  assert.doesNotMatch(analytical, /node\.depth === 0 \? <><strong>\{node\.display_value/);
});

test("headline indicators reveal their evidence over a neutral track and respect reduced motion", async () => {
  const [main, css] = await Promise.all([read("../src/main.jsx"), read("../src/styles.css")]);
  assert.match(main, /--gauge-segment-delay/);
  assert.match(main, /<MetricGauge key=\{effectiveGlobalModelKey \|\| "focal-result"\}/);
  assert.match(css, /@keyframes metric-segment-in/);
  assert.match(css, /@keyframes population-stage-in/);
  assert.match(css, /@keyframes confidence-bar-in/);
  assert.match(css, /\.confidence-meter i\s*\{[^}]*background:\s*#d4d4d4 !important/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.confidence-meter i\.is-filled::after[^}]*animation:\s*none/s);
});

test("evaluation behaviour keeps its controls above a dedicated diagnostic card", async () => {
  const [analytical, css] = await Promise.all([read("../src/analytical-view.jsx"), read("../src/styles.css")]);
  assert.match(analytical, /className="analytical-heading evaluation-heading"[\s\S]*className="evaluation-context-controls"[\s\S]*className="analytical-body analytical-body--evaluation"/);
  assert.match(analytical, /className="analytical-body analytical-body--evaluation"><div className="analytical-visual">/);
  assert.match(css, /\.analytical-body--evaluation \.analytical-visual\s*\{[^}]*background:\s*var\(--v15-soft-surface\)[^}]*padding:\s*32px 38px/s);
  assert.match(css, /\.analytical-body--evaluation > \.analytical-standout\s*\{\s*align-self:\s*center/);
});

test("reconstruction detail is projected once at the bottom of Overview and uses responsive cards", async () => {
  const [main, analytical, css] = await Promise.all([read("../src/main.jsx"), read("../src/analytical-view.jsx"), read("../src/styles.css")]);
  const dataZone = main.indexOf("className=\"data-population-zone\"");
  const detailProjection = main.indexOf("<AnalyticalDetails layer={analyticalLayer}");
  assert.ok(dataZone >= 0 && detailProjection > dataZone);
  assert.doesNotMatch(analytical.slice(analytical.indexOf("export function AnalyticalResults"), analytical.indexOf("export function AnalyticalDetails")), /<AnalyticalDetails/);
  assert.match(analytical, /export function AnalyticalDetails/);
  assert.match(css, /\.analytical-detail-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(245px, 1fr\)\)/s);
});

test("the feedback polish contains no development-project identities or expected answers", async () => {
  const runtime = await Promise.all([read("../src/main.jsx"), read("../src/analytical-view.jsx"), read("../src/styles.css")]).then((parts) => parts.join("\n"));
  assert.doesNotMatch(runtime, /\bR[1-7]\b|Chelsea|Crash|NYC.?311|XGBoost|302720|22466|2283|1026/);
});
