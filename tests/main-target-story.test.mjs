import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildMainTargetStory } from "../engine/main-target-story.mjs";

const evidence = (id) => ({ epistemic: "OBSERVED", evidence_ids: [id] });

function fixture() {
  const result = {
    id: "RESULT-SALT-CEDAR",
    analytical_result_id: "RESULT-SALT-CEDAR",
    state: "established",
    target_id: "TARGET-SALT",
    task_target: "Elevated estuary salinity",
    method: "Tuned Cedar classifier",
    metric: "ROC AUC",
    metric_key: "roc_auc",
    raw_value: 0.731,
    model_run_id: "RUN-CEDAR",
    ...evidence("E-RESULT"),
  };
  return {
    record: { reconstruction: {
      purpose_scope: {
        summary: { state: "established", value: "Monitor estuary salinity for habitat managers.", ...evidence("E-PURPOSE") },
        purpose: { state: "established", value: "Identify elevated salinity.", ...evidence("E-PURPOSE") },
        population_scope: { state: "established", value: "Monitored estuary sites.", ...evidence("E-PURPOSE") },
        intended_use: { state: "established", value: "Support habitat management.", ...evidence("E-PURPOSE") },
      },
      data: { population_filters: { state: "established", value: "Sites with labels and complete sensor readings were retained.", ...evidence("E-FILTER") } },
      results_evaluation: {
        evaluation_design: { state: "established", value: "A held-out split was used.", ...evidence("E-SPLIT") },
        establishes: { state: "established", value: "The recorded held-out score describes this selected task.", ...evidence("E-RESULT") },
        does_not_establish: { state: "established", value: "Performance outside monitored sites is not established.", ...evidence("E-RESULT") },
      },
      samples: {
        source_data: { state: "not_established", count: null, unit: "records", evidence_ids: [] },
        model_sample: { state: "established", display: "700 labelled sites", count: 700, unit: "sites", ...evidence("E-SPLIT") },
        evaluation_sample: { state: "established", display: "300 held-out sites", count: 300, unit: "sites", ...evidence("E-SPLIT") },
      },
    } },
    primaryContext: { id: "CONTEXT-SALT", workstream_id: "STREAM-SALT", method: "Cedar", model_sample_count: 700, evaluation_sample_count: 300, ...evidence("E-RESULT") },
    headlineResults: [result, { ...result, id: "RESULT-SALT-F1", analytical_result_id: "RESULT-SALT-F1", metric: "F1", metric_key: "f1", raw_value: 0.62 }],
    bestFinalResult: result,
    projectPopulation: { id: "POP-ESTUARY", role: "project_population", state: "established", display: "12,000 monitoring sites", count: 12000, unit: "sites", ...evidence("E-POP") },
    targetDefinitions: [{ id: "TARGET-SALT", semantic_name: "Elevated estuary salinity", workstream_id: "STREAM-SALT", ...evidence("E-TARGET") }],
    comparisonSets: [
      { id: "COMPARE-TEMP", target_id: "TARGET-TEMP", workstream_id: "STREAM-TEMP", methods: ["Pine", "Elm"], metrics: [{ key: "roc_auc", label: "ROC AUC", direction: "higher" }], results: [{ id: "RESULT-TEMP", target_id: "TARGET-TEMP", method: "Pine", metric: "roc_auc", value: 0.91 }] },
      { id: "COMPARE-SALT", target_id: "TARGET-SALT", workstream_id: "STREAM-SALT", methods: ["Cedar", "Willow"], metrics: [{ key: "roc_auc", label: "ROC AUC", direction: "higher" }], results: [{ ...result, method: "Cedar", metric: "roc_auc", value: 0.731, evaluation_attempt_id: "ATTEMPT-SALT" }, { id: "RESULT-SALT-WILLOW", target_id: "TARGET-SALT", method: "Willow", metric: "roc_auc", value: 0.684, evaluation_attempt_id: "ATTEMPT-SALT" }] },
    ],
    features: [
      { id: "FEATURE-CEDAR-A", target_id: "TARGET-SALT", workstream_id: "STREAM-SALT", model_run_id: "RUN-CEDAR", method: "Cedar", feature: "tidal_range", value: 0.44, ...evidence("E-FEATURE") },
      { id: "FEATURE-WILLOW-A", target_id: "TARGET-SALT", workstream_id: "STREAM-SALT", model_run_id: "RUN-WILLOW", method: "Willow", feature: "river_depth", value: 0.31, ...evidence("E-FEATURE") },
      { id: "FEATURE-TEMP-A", target_id: "TARGET-TEMP", workstream_id: "STREAM-TEMP", model_run_id: "RUN-PINE", method: "Pine", feature: "sunlight", value: 0.8, ...evidence("E-FEATURE") },
    ],
    diagnostics: [
      { id: "DIAGNOSTIC-CEDAR", target_id: "TARGET-SALT", workstream_id: "STREAM-SALT", model_run_id: "RUN-CEDAR", method: "Cedar", type: "confusion_matrix", labels: ["normal", "elevated"], values: [[210, 30], [45, 15]], ...evidence("E-DIAGNOSTIC") },
      { id: "DIAGNOSTIC-WILLOW", target_id: "TARGET-SALT", workstream_id: "STREAM-SALT", model_run_id: "RUN-WILLOW", method: "Willow", type: "confusion_matrix", values: [[200, 40], [40, 20]], ...evidence("E-DIAGNOSTIC") },
    ],
    lineage: { contexts: [
      { id: "LINEAGE-TEMP", workstream_id: "STREAM-TEMP", training_count: 90000, evaluation_count: 10000, nodes: [{ id: "TEMP-TRAIN", role: "training", count: 90000, unit: "rows" }, { id: "TEMP-EVAL", role: "evaluation", count: 10000, unit: "rows" }] },
      { id: "LINEAGE-SALT", workstream_id: "STREAM-SALT", training_count: 700, evaluation_count: 300, nodes: [{ id: "SALT-READY", role: "population_stage", label: "Prepared population", count: 1000, unit: "sites", ...evidence("E-SPLIT") }, { id: "SALT-TRAIN", role: "training", count: 700, unit: "sites", ...evidence("E-SPLIT") }, { id: "SALT-EVAL", role: "evaluation", count: 300, unit: "sites", ...evidence("E-SPLIT") }], edges: [{ id: "EDGE-TRAIN", from: "SALT-READY", to: "SALT-TRAIN", relation: "split", ...evidence("E-SPLIT") }, { id: "EDGE-EVAL", from: "SALT-READY", to: "SALT-EVAL", relation: "split", ...evidence("E-SPLIT") }], ...evidence("E-SPLIT") },
    ] },
    missingness: [{ id: "MISSING-PH", field: "water_ph", value: 3.2, unit: "percent", denominator: 12000, ...evidence("E-MISSING") }],
  };
}

test("the focal target story connects one target without borrowing another workstream", () => {
  const story = buildMainTargetStory(fixture());
  assert.equal(story.status, "established");
  assert.equal(story.target.label, "Elevated estuary salinity");
  assert.equal(story.method, "Cedar");
  assert.equal(story.result.raw_value, 0.731);
  assert.deepEqual(story.material_results.map((item) => item.metric), ["ROC AUC", "F1"]);
  assert.deepEqual(story.comparison_sets.map((item) => item.id), ["COMPARE-SALT"]);
  assert.deepEqual(story.feature_evidence.map((item) => item.id), ["FEATURE-CEDAR-A"]);
  assert.deepEqual(story.diagnostics.map((item) => item.id), ["DIAGNOSTIC-CEDAR"]);
  assert.deepEqual([story.populations.source_data.count, story.populations.model_sample.count, story.populations.evaluation_sample.count], [12000, 700, 300]);
  assert.deepEqual(story.population_lineage.contexts[0].nodes.map((item) => item.label), ["Original data", "Prepared population", "Training data", "Evaluation data"]);
  assert.deepEqual(story.population_lineage.contexts[0].edges.map((item) => item.relation), ["filter", "split", "split"]);
  assert.equal(story.section_answers.population_lineage.dashboard_available, true);
});

test("missing diagnostic and missingness evidence stays unavailable", () => {
  const input = fixture();
  input.diagnostics = [];
  input.missingness = [];
  const story = buildMainTargetStory(input);
  assert.deepEqual(story.diagnostics, []);
  assert.deepEqual(story.missingness, []);
  assert.equal(story.availability.evaluation_behaviour, "unavailable");
  assert.equal(story.availability.missingness, "unavailable");
});

test("an unrelated comparison or lineage is not borrowed for the focal target", () => {
  const input = fixture();
  input.comparisonSets = input.comparisonSets.filter((item) => item.id === "COMPARE-TEMP");
  input.lineage.contexts = input.lineage.contexts.filter((item) => item.id === "LINEAGE-TEMP");
  const story = buildMainTargetStory(input);
  assert.deepEqual(story.comparison_sets, []);
  assert.deepEqual([story.populations.model_sample.count, story.populations.evaluation_sample.count], [700, 300]);
  assert.ok(story.population_lineage.contexts[0].nodes.every((item) => ![90000, 10000].includes(item.count)));
});

test("related input evidence remains internal when it cannot answer feature contribution", () => {
  const input = fixture();
  input.features = [{ id: "FEATURE-USAGE", target_id: "TARGET-SALT", workstream_id: "STREAM-SALT", model_run_id: "RUN-CEDAR", method: "Cedar", feature: "tidal_range", value: null, evidence_type: "feature_usage", ...evidence("E-USAGE") }];
  const story = buildMainTargetStory(input);
  assert.deepEqual(story.feature_evidence.map((item) => item.id), ["FEATURE-USAGE"]);
  assert.equal(story.section_answers.feature_driver_evidence.state, "partial");
  assert.equal(story.section_answers.feature_driver_evidence.dashboard_available, false);
  assert.equal(story.section_answers.feature_driver_evidence.answer, null);
  assert.deepEqual(story.section_answers.feature_driver_evidence.related_evidence_ids, ["E-USAGE"]);
});

test("population counts do not create lineage unless filters and split relationships are supported", () => {
  const input = fixture();
  input.lineage = { contexts: [] };
  input.record.reconstruction.data.population_filters = { state: "not_established", value: "–", evidence_ids: [] };
  input.record.reconstruction.results_evaluation.evaluation_design = { state: "not_established", value: "–", evidence_ids: [] };
  const story = buildMainTargetStory(input);
  assert.equal(story.section_answers.data_populations_samples.dashboard_available, true);
  assert.equal(story.section_answers.population_lineage.dashboard_available, false);
  assert.equal(story.section_answers.population_lineage.state, "unavailable");
});

test("the focal story runtime contains no development-project identities or known answers", async () => {
  const runtime = `${await fs.readFile(new URL("../engine/main-target-story.mjs", import.meta.url), "utf8")}\n${await fs.readFile(new URL("../engine/section-answer-contracts.mjs", import.meta.url), "utf8")}\n${await fs.readFile(new URL("../engine/source-population-evidence.mjs", import.meta.url), "utf8")}`;
  assert.doesNotMatch(runtime, /\bR[1-6]\b|Chelsea|Crash Model|Insight Lane|302720|22466|2283|1026/);
});
