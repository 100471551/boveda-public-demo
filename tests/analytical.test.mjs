import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { conciseContextLabel, layoutLineageGraph, magnitudeHeat, matrixMagnitudeHeat, metricHeat } from "../src/analytical-presentation.mjs";

function notebook({ title = "Predictive comparison: orchard demand", methods = ["Cedar", "Willow"], values = [0.812, 0.643], feature = "canopy_density", includeComparison = true } = {}) {
  const cells = [{ cell_type: "markdown", source: [`# ${title}`], outputs: [] }];
  if (includeComparison) cells.push({
    cell_type: "code",
    source: methods.map((method) => `summary(y_test, prediction, model_name='${method}')`).join("\n"),
    outputs: [{ output_type: "stream", text: methods.map((method, index) => `${method}\nROC AUC: ${values[index]}\nF1 score: ${values[index] - 0.1}`).join("\n") }],
  });
  cells.push({
    cell_type: "code",
    source: [`feature_importances = fitted_estimator.feature_importances_`],
    outputs: [{ output_type: "execute_result", data: { "text/plain": [`                         importance\n${feature}                 0.271\nsoil_index                 0.119`] } }],
  });
  cells.push({
    cell_type: "code",
    source: ["print('Train obs: 731 Test obs: 289')"],
    outputs: [{ output_type: "stream", text: ["Train obs: 731 Test obs: 289"] }],
  });
  return JSON.stringify({ cells });
}

function layer(raw, path = "analysis/model-evaluation.ipynb") {
  const source = notebookFragments(raw, { id: "E-SYNTHETIC", path, kind: "notebook" });
  return buildAnalyticalLayer({ project_id: "PRJ-SYNTHETIC", audit_id: "AUD-SYNTHETIC" }, { sources: [source] });
}

function materialComparison(value) {
  return value.comparison_sets.map((set) => ({
    workstream: set.workstream,
    methods: set.methods,
    metrics: set.metrics.map((metric) => metric.key),
    values: set.results.map((result) => [result.method, result.metric, result.value]),
  }));
}

test("project rename leaves the material analytical reconstruction unchanged", () => {
  const raw = notebook();
  const first = layer(raw, "first-name/evaluation.ipynb");
  const renamed = layer(raw, "renamed-project/evaluation.ipynb");
  assert.deepEqual(materialComparison(first), materialComparison(renamed));
  assert.deepEqual(first.feature_evidence.map(({ feature, value }) => [feature, value]), renamed.feature_evidence.map(({ feature, value }) => [feature, value]));
  assert.deepEqual(first.sample_lineage.nodes.map(({ role, count }) => [role, count]), renamed.sample_lineage.nodes.map(({ role, count }) => [role, count]));
});

test("metric value mutation changes the reconstructed value", () => {
  const first = layer(notebook({ values: [0.812, 0.643] }));
  const changed = layer(notebook({ values: [0.417, 0.643] }));
  const value = (result) => result.results.find((item) => item.method === "Cedar" && item.metric === "roc_auc")?.value;
  assert.equal(value(first), 0.812);
  assert.equal(value(changed), 0.417);
  assert.notEqual(value(first), value(changed));
});

test("method and feature label mutation flows through the reconstruction", () => {
  const changed = layer(notebook({ methods: ["Juniper", "Maple"], feature: "river_proximity" }));
  assert.deepEqual(changed.comparison_sets[0].methods, ["Juniper", "Maple"]);
  assert.equal(changed.feature_evidence[0].feature, "river_proximity");
});

test("removing comparison evidence removes the component instead of falling back", () => {
  const removed = layer(notebook({ includeComparison: false }));
  assert.equal(removed.comparison_sets.length, 0);
  assert.equal(removed.component_availability.model_comparison, "unavailable");
  assert.equal(removed.results.length, 0);
});

test("the same structure remains reconstructable with changed names and values", () => {
  const changed = layer(notebook({ title: "Forecast model review: estuary flow", methods: ["Delta", "Lagoon", "Reef"], values: [0.31, 0.52, 0.47], feature: "tidal_range" }));
  assert.equal(changed.comparison_sets.length, 1);
  assert.deepEqual(changed.comparison_sets[0].methods, ["Delta", "Lagoon", "Reef"]);
  assert.ok(changed.comparison_sets[0].metrics.some((metric) => metric.key === "roc_auc"));
  assert.equal(changed.feature_evidence[0].feature, "tidal_range");
});

test("superficially similar metrics from incompatible workstreams are not merged", () => {
  const first = notebookFragments(notebook({ title: "Predictive comparison: north district", methods: ["Aster"], values: [0.72] }), { id: "E-NORTH", path: "north.ipynb", kind: "notebook" });
  const second = notebookFragments(notebook({ title: "Predictive comparison: south district", methods: ["Birch"], values: [0.72] }), { id: "E-SOUTH", path: "south.ipynb", kind: "notebook" });
  const result = buildAnalyticalLayer({ project_id: "PRJ-X", audit_id: "AUD-X" }, { sources: [first, second] });
  assert.equal(result.results.filter((item) => item.metric === "roc_auc").length, 2);
  assert.equal(result.comparison_sets.length, 0);
  assert.equal(new Set(result.results.map((item) => item.workstream_id)).size, 2);
});

test("base and scaled evaluation variants remain separate comparison sets", () => {
  const raw = JSON.stringify({ cells: [
    { cell_type: "markdown", source: ["# Predictive comparison: wetland condition"], outputs: [] },
    { cell_type: "markdown", source: ["## Base evaluation"], outputs: [] },
    { cell_type: "code", source: ["summary(y_test, a, model_name='Elm')\nsummary(y_test, b, model_name='Pine')"], outputs: [{ output_type: "stream", text: ["Elm\nROC AUC: 0.61\nF1 score: 0.52\nPine\nROC AUC: 0.64\nF1 score: 0.55"] }] },
    { cell_type: "markdown", source: ["## Scaled evaluation"], outputs: [] },
    { cell_type: "code", source: ["summary(y_test, a, model_name='Elm')\nsummary(y_test, b, model_name='Pine')"], outputs: [{ output_type: "stream", text: ["Elm\nROC AUC: 0.59\nF1 score: 0.50\nPine\nROC AUC: 0.62\nF1 score: 0.53"] }] },
  ] });
  const result = layer(raw);
  assert.equal(result.comparison_sets.length, 2);
  assert.deepEqual(result.comparison_sets.map((set) => set.evaluation_variant).sort(), ["base", "scaled"]);
  assert.equal(result.diagnostics.filter((item) => item.type === "metric_profile").length, 0);
});

test("lineage keeps train and evaluation as sibling split nodes", () => {
  const result = layer(notebook());
  const train = result.sample_lineage.nodes.find((node) => node.role === "training");
  const evaluation = result.sample_lineage.nodes.find((node) => node.role === "evaluation");
  assert.equal(train.count, 731);
  assert.equal(evaluation.count, 289);
  assert.notEqual(train.id, evaluation.id);
});

test("runtime analytical reconstruction has no construction-reference dependency", async () => {
  const files = ["../engine/analytical.mjs", "../engine/analytical-collection.mjs", "../engine/server.mjs"];
  const source = (await Promise.all(files.map((file) => fs.readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /unused_evidence_analysis|Analytical workstreams_EXAMPLES|New_version_v0\.12|Current_version_v0\.11\.1/);
  assert.doesNotMatch(source, /R1_public|R2_public|R3_public|NYC311|housing-chelsea|road-crash-risk/);
});

test("analytical endpoint is a read-only projection with no provider or persistence call", async () => {
  const server = await fs.readFile(new URL("../engine/server.mjs", import.meta.url), "utf8");
  const endpoint = server.match(/app\.get\("\/api\/projects\/:id\/analytical"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(endpoint, /collectAnalyticalSources\(record\)/);
  assert.match(endpoint, /buildAnalyticalLayer\(record/);
  assert.doesNotMatch(endpoint, /analyseProject|saveRecord|reconstruct|OpenAI/);
});

test("continuous heat scales are derived from runtime values", () => {
  const values = [0.12, 0.37, 0.91];
  assert.equal(magnitudeHeat(values[0], values).strength, 0);
  assert.equal(magnitudeHeat(values[2], values).strength, 1);
  assert.ok(magnitudeHeat(values[1], values).strength > 0 && magnitudeHeat(values[1], values).strength < 1);
});

test("metric heat respects direction of better and leaves unknown directions neutral", () => {
  const values = [0.1, 0.5, 0.9];
  assert.equal(metricHeat(0.9, values, "higher").strength, 1);
  assert.equal(metricHeat(0.1, values, "lower").strength, 1);
  assert.equal(metricHeat(0.9, values, "lower").strength, 0);
  assert.equal(metricHeat(0.5, values, "unknown"), null);
});

test("matrix heat encodes raw magnitude without assigning generic good or bad semantics", () => {
  const values = [12, 48, 108];
  const low = matrixMagnitudeHeat(12, values);
  const high = matrixMagnitudeHeat(108, values);
  assert.equal(low.semantics, "raw_magnitude_only");
  assert.equal(high.semantics, "raw_magnitude_only");
  assert.ok(high.strength > low.strength);
});

test("selector labels remove only generic analytical prefixes", () => {
  assert.equal(conciseContextLabel("Predictive modeling: Orchard demand"), "Orchard demand");
  assert.equal(conciseContextLabel("Forecasting: Estuary flow"), "Estuary flow");
  assert.equal(conciseContextLabel("North district: Tree health"), "North district: Tree health");
});

test("lineage layout preserves explicit branch topology in two dimensions", () => {
  const graph = layoutLineageGraph({
    nodes: [
      { id: "source", label: "Source" },
      { id: "model", label: "Modelled" },
      { id: "train", label: "Train" },
      { id: "test", label: "Evaluation" },
    ],
    edges: [
      { id: "e1", from: "source", to: "model", relation: "filter" },
      { id: "e2", from: "model", to: "train", relation: "split" },
      { id: "e3", from: "model", to: "test", relation: "split" },
    ],
  });
  const train = graph.nodes.find((node) => node.id === "train");
  const test = graph.nodes.find((node) => node.id === "test");
  assert.equal(train.depth, test.depth);
  assert.equal(train.x, test.x);
  assert.notEqual(train.y, test.y);
  assert.deepEqual(graph.edges.map((edge) => edge.relation), ["filter", "split", "split"]);
});

test("v0.13.2 Overview keeps stable analytical frames with progressive reconstruction detail", async () => {
  const view = await fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const engine = await fs.readFile(new URL("../engine/analytical.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(view, /<h3>Analytical workstreams<\/h3>|<h3>Persisted analytical attempts<\/h3>|<h3>Analytical-data formation<\/h3>/);
  assert.match(view, /<FeatureEvidence modelPresentation=\{modelPresentation\} globalModelKey=\{globalModelKey\}/);
  assert.match(view, /answers\.data_missingness\?\.dashboard_available \? answers\.data_missingness\.answer\?\.measurements \|\| \[\] : \[\]/);
  assert.match(view, /answers\.population_lineage\?\.dashboard_available \? answers\.population_lineage\.answer\?\.lineage/);
  assert.match(view, /<Missingness items=\{missingness\}/);
  assert.match(view, /<Lineage lineage=\{lineage\}/);
  assert.match(app, /data-population-zone[\s\S]*data-section[\s\S]*<AnalyticalData/);
  assert.match(app, /heroMetricFormatter\.format\(primaryMetricRatio\)/);
  assert.match(app, /This section summarises the evaluation design, recorded model performance, and the limitations of the available evidence\./);
  assert.match(css, /\.missingness-row\s*>\s*i\s*\{\s*background:\s*#EFF1EE;/);
  assert.match(css, /\.missingness-row\s*>\s*i b\s*\{\s*background:\s*#000;/);
  assert.match(css, /\.lineage-graph[^}]*overflow:\s*visible/);
  assert.doesNotMatch(css, /\.lineage-graph[^}]*overflow-x:\s*auto/);
  assert.match(engine, /workstreams:\s*streams/);
  assert.match(engine, /data_preparation:\s*\{\s*stages:\s*preparation,\s*missingness\s*\}/);
  assert.match(engine, /analytical_attempts:\s*failedAttempts/);
  assert.doesNotMatch(`${view}\n${css}`, /R1_public|R2_public|R3_public|housing-chelsea|road-crash-risk|nyc-311-resolution/i);
});
