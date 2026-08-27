import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("empty analytical areas keep their own heading and evidence-specific message", async () => {
  const [view, emptyState] = await Promise.all([
    read("../src/analytical-view.jsx"),
    read("../src/empty-evidence-state.jsx"),
  ]);
  for (const title of [
    "Model comparison unavailable",
    "Feature evidence unavailable",
    "Evaluation behaviour unavailable",
    "Missing-data measurements unavailable",
    "Population lineage unavailable",
  ]) assert.match(view, new RegExp(title));
  assert.match(view, /analytical-frame analytical-frame--empty/);
  assert.match(emptyState, /empty-evidence-state__icon/);
  assert.match(emptyState, /<strong>\{title\}<\/strong>/);
  assert.match(emptyState, /<p>\{children\}<\/p>/);
  assert.doesNotMatch(emptyState, /Missing Data/);
});

test("Overview distinguishes whole-section absence from partial field coverage", async () => {
  const [main, sparse] = await Promise.all([
    read("../src/main.jsx"),
    read("../src/sparse-communication.mjs"),
  ]);
  assert.match(main, /const sectionAvailable = \(id\) => sectionAnswers\[id\]\?\.dashboard_available === true/);
  assert.match(main, /purposeAvailable/);
  assert.match(main, /resultsAvailable/);
  assert.match(main, /dataAvailable/);
  assert.match(main, /samplesAvailable/);
  assert.match(main, /overview-section--empty/);
  assert.match(main, /Population and sample counts unavailable/);
  assert.match(main, /empty-evidence-state--compact/);
  assert.doesNotMatch(main, /state === "partial"[^\n]*dashboard/);
  assert.doesNotMatch(main, /missing-result__mark/);
  for (const kind of ["purpose_scope", "results_evaluation", "data_populations", "project_samples"]) assert.match(sparse, new RegExp(`kind === "${kind}"`));
});

test("empty and partial analytical layouts size from their rendered content", async () => {
  const css = await read("../src/styles.css");
  assert.match(css, /v0\.20\.9 — evidence-aware empty states/);
  assert.match(css, /\.analytical-frame--empty\s*\{[^}]*height:\s*auto !important[^}]*min-height:\s*0 !important[^}]*background:\s*transparent !important/s);
  assert.match(css, /\.feature-component\s*\{[^}]*min-height:\s*0/s);
  assert.match(css, /\.comparison-component:not\(\.analytical-frame--empty\)\s*\{[^}]*height:\s*auto[^}]*min-height:\s*0/s);
  assert.match(css, /\.evaluation-behaviour::before,[\s\S]*display:\s*none !important/);
  assert.match(css, /\.analytical-data\s*\{[^}]*height:\s*auto[^}]*min-height:\s*0/s);
  assert.match(css, /\.overview--overview \.analytical-data--available-0\s*\{[^}]*border-radius:\s*0[^}]*background:\s*transparent[^}]*padding:\s*0/s);
  assert.match(css, /\.lineage-graph\s*\{[^}]*height:\s*auto[^}]*min-height:\s*0/s);
  assert.match(css, /\.project-menu-projects > article\s*\{[^}]*height:\s*auto[^}]*min-height:\s*145px/s);
});

test("the UX capability contains no development-project identities or expected values", async () => {
  const runtime = await Promise.all([
    read("../src/empty-evidence-state.jsx"),
    read("../src/sparse-communication.mjs"),
    read("../src/analytical-view.jsx"),
    read("../src/main.jsx"),
    read("../src/styles.css"),
  ]).then((parts) => parts.join("\n"));
  assert.doesNotMatch(runtime, /R[1-6]_public|Chelsea|Insight Lane|NYC-311|22,466|2,283|1,026/);
});
