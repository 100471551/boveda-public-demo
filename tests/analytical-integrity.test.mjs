import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer, diagnosticPresentationOrder, humanizeAnalyticalLabel, scalarResultValue } from "../engine/analytical.mjs";
import { formatAnalyticalMetric } from "../src/format-display.mjs";

function source(cells, path = "studies/estuary-review.ipynb") {
  return notebookFragments(JSON.stringify({ cells }), { id: `E-${path}`, path, kind: "notebook" });
}

function markdown(value) {
  return { cell_type: "markdown", source: [value], outputs: [] };
}

function code(value, text, error = null) {
  const outputs = text == null ? [] : [{ output_type: "stream", text: [text] }];
  if (error) outputs.push({ output_type: "error", ename: error, evalue: "persisted failure" });
  return { cell_type: "code", source: [value], outputs };
}

function canonicalResult({ display = "0.41", metric = "Average precision", method = "Cedar", target = "Estuary salinity", context = "held-out test" } = {}) {
  return { state: "established", display_value: display, metric, method, task_target: target, evaluation_context: context, epistemic: "OBSERVED", evidence_ids: [] };
}

function sample(count) {
  return { state: Number.isFinite(count) ? "established" : "not_established", display: Number.isFinite(count) ? String(count) : "–", count, unit: "observations", epistemic: "OBSERVED", evidence_ids: [] };
}

function record({ primary = canonicalResult(), materials = [], model = 731, evaluation = 289 } = {}) {
  return {
    project_id: "PRJ-SYNTHETIC-INTEGRITY",
    audit_id: "AUD-SYNTHETIC-INTEGRITY",
    reconstruction: {
      results_evaluation: { primary_result: primary, material_results: materials },
      samples: { model_sample: sample(model), evaluation_sample: sample(evaluation) },
      data: { period: { state: "established", value: "Recorded season" } },
    },
  };
}

function mainNotebook() {
  return source([
    markdown("# Predictive comparison: Estuary salinity"),
    code("cohort.shape", "(1020, 8)"),
    code("prepared = cohort.copy()\nprepared.shape", "(1020, 8)"),
    code("scaled = standardize(prepared)\ndata_clean = assemble(scaled)\ndata_clean.shape", "(1020, 8)"),
    code("print('Train obs: 731 Test obs: 289')", "Train obs: 731 Test obs: 289"),
    code("X_train.shape", "(731, 7)"),
    code("risk_scores.shape", "(289, 1)"),
    code("summary(y_test, cedar, model_name='Cedar')\nsummary(y_test, willow, model_name='Willow')", "Cedar\nAverage precision: 0.413\nAccuracy: 0.704\nWillow\nAverage precision: 0.388\nAccuracy: 0.681"),
    markdown("# Forecasting: River height"),
    code("summary(joined_df, forecast, model_name='Prophet')", "Prophet\nR2 score: 0.931"),
  ]);
}

test("primary-context default selection is derived from the canonical primary result", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [mainNotebook()] });
  assert.equal(layer.primary_context.display_label, "Estuary salinity");
  assert.equal(layer.primary_context.method, "Cedar");
  assert.equal(layer.comparison_sets[0].workstream_id, layer.primary_context.workstream_id);
  assert.ok(layer.comparison_sets[0].results.some((item) => item.id === layer.primary_context.result_id));
});

test("workstreams remain isolated in result comparisons", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [mainNotebook()] });
  assert.equal(layer.comparison_sets.length, 1);
  assert.ok(layer.comparison_sets[0].results.every((item) => item.workstream === "Predictive comparison: Estuary salinity"));
});

test("evaluation phases remain isolated", () => {
  const notebook = source([
    markdown("# Predictive comparison: Wetland recovery"),
    code("summary(y_test, a, model_name='Alder')\nsummary(y_test, b, model_name='Beech')", "Alder\nAccuracy: 0.63\nBeech\nAccuracy: 0.67"),
    code("cross_validation(a)\ncross_validation(b)\nmodel_name='Alder'\nmodel_name='Beech'", "Alder\nAccuracy: 0.61\nBeech\nAccuracy: 0.65"),
  ], "wetland.ipynb");
  const layer = buildAnalyticalLayer(record({ primary: canonicalResult({ display: "0.67", metric: "Accuracy", method: "Beech", target: "Wetland recovery" }), model: null, evaluation: null }), { sources: [notebook] });
  assert.deepEqual(new Set(layer.comparison_sets.map((item) => item.evaluation_phase)), new Set(["test", "validation"]));
  assert.equal(layer.comparison_sets[0].evaluation_phase, "test");
});

test("failed analytical attempts do not supply primary lineage or results", () => {
  const failed = source([
    markdown("# Predictive comparison: Marsh condition"),
    code("run_alternative()", "Train obs: 812 Test obs: 347", "KeyError"),
  ], "failed-attempt.ipynb");
  const layer = buildAnalyticalLayer(record({ model: null, evaluation: null }), { sources: [mainNotebook(), failed] });
  assert.ok(layer.analytical_attempts.some((item) => item.status === "failed"));
  assert.ok(layer.sample_lineage.nodes.every((item) => ![812, 347].includes(item.count)));
});

test("matrix and array objects are rejected from headline scalar results", () => {
  const matrix = canonicalResult({ display: "[[14, 7], [3, 19]]", metric: "Confusion matrix" });
  assert.equal(scalarResultValue(matrix), null);
  const layer = buildAnalyticalLayer(record({ primary: matrix, model: null, evaluation: null }), { sources: [mainNotebook()] });
  assert.equal(layer.presentation.headline_results.length, 0);
});

test("prediction vectors are not independent sample-lineage nodes", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [mainNotebook()] });
  const context = layer.sample_lineage.contexts[0];
  assert.equal(context.nodes.filter((item) => item.count === 289).length, 1);
  assert.equal(context.nodes.find((item) => item.count === 289).role, "evaluation");
  assert.ok(context.nodes.every((item) => !/risk|score|prediction/i.test(item.label)));
});

test("technical matrices are attached and equivalent population stages are deduplicated", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [mainNotebook()] });
  const context = layer.sample_lineage.contexts[0];
  assert.equal(context.nodes.filter((item) => item.count === 731).length, 1);
  assert.equal(context.nodes.filter((item) => item.count === 1020).length, 1);
  assert.ok(context.nodes.find((item) => item.count === 731).source_identities.includes("X_train"));
  assert.ok(context.nodes.find((item) => item.count === 1020).source_identities.includes("data_clean"));
});

test("display labels are generated from semantics rather than raw analytical prompts", () => {
  assert.equal(humanizeAnalyticalLabel("Benchmark Model for shoreline erosion"), "Shoreline erosion benchmark");
  assert.equal(humanizeAnalyticalLabel("Let's predict the recovery time for reed beds in South Marsh given the spring data"), "Recovery time — reed beds, South Marsh");
  assert.doesNotMatch(humanizeAnalyticalLabel("Let's predict the recovery time for reed beds in South Marsh given the spring data"), /Let's|given the/);
});

test("the stable layout retains every analytical frame and neutral empty state", async () => {
  const view = await fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8");
  assert.match(view, /const story = layer\.presentation\?\.main_target_story/);
  assert.match(view, /<FeatureEvidence modelPresentation=\{modelPresentation\} globalModelKey=\{globalModelKey\}/);
  assert.match(view, /<Comparison sets=\{comparisonSets\}/);
  assert.match(view, /<EvaluationBehaviour modelPresentation=\{modelPresentation\} globalModelKey=\{globalModelKey\}/);
  assert.match(view, /analyticalAvailabilityMessage\("feature_driver_evidence", reconstruction\)/);
  assert.match(view, /analyticalAvailabilityMessage\("evaluation_behaviour", reconstruction\)/);
  assert.match(view, /analyticalAvailabilityMessage\("sample_lineage", reconstruction\)/);
});

test("diagnostic family order is deterministic", () => {
  const values = [
    { id: "late", type: "train_validation", workstream_id: "W", workstream: "Delta", method: "Spruce", evaluation_phase: "test", evaluation_variant: "base", source_locator: "b" },
    { id: "first", type: "confusion_matrix", workstream_id: "W", workstream: "Delta", method: "Spruce", evaluation_phase: "test", evaluation_variant: "base", source_locator: "a" },
  ];
  assert.deepEqual(diagnosticPresentationOrder(values).map((item) => item.type), ["confusion_matrix", "train_validation"]);
});

test("canonical raw values are reused by headline and comparison projections", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [mainNotebook()] });
  const headline = layer.presentation.headline_results[0];
  const comparison = layer.comparison_sets[0].results.find((item) => item.id === headline.analytical_result_id);
  assert.equal(headline.raw_value, comparison.raw_value);
  assert.equal(layer.consistency.checks.canonical_raw_value_reuse, true);
});

test("metric display rounding follows the shared headline and comparison policy", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [mainNotebook()] });
  const headline = layer.presentation.headline_results[0];
  const comparison = layer.comparison_sets[0].results.find((item) => item.id === headline.analytical_result_id);
  assert.equal(formatAnalyticalMetric(headline.raw_value, headline.display_precision), "0.41");
  assert.equal(formatAnalyticalMetric(comparison.raw_value, comparison.display_precision), "0.413");
  assert.equal(headline.raw_value, comparison.raw_value);
});

test("unrelated-workstream material results are excluded from the primary result row", () => {
  const materials = [
    canonicalResult({ display: "0.388", metric: "Average precision", method: "Willow", target: "Estuary salinity" }),
    canonicalResult({ display: "0.931", metric: "R²", method: "Prophet", target: "River height", context: "in-sample forecast" }),
  ];
  const layer = buildAnalyticalLayer(record({ materials }), { sources: [mainNotebook()] });
  assert.deepEqual(layer.presentation.headline_results.map((item) => item.method), ["Cedar", "Willow"]);
});

test("Evaluation behaviour never duplicates comparison content as a metric profile", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [mainNotebook()] });
  assert.ok(layer.comparison_sets.length);
  assert.equal(layer.diagnostics.some((item) => item.type === "metric_profile"), false);
  assert.equal(layer.component_availability.evaluation_behaviour, "unavailable");
});
