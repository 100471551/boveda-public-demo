import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { emptyReconstruction } from "../engine/contract.mjs";
import { buildSignalsLayer } from "../engine/signals.mjs";

function markdown(source) {
  return { cell_type: "markdown", source: [source], outputs: [] };
}

function code(source, output = "", executionCount = null) {
  return {
    cell_type: "code",
    source: [source],
    execution_count: executionCount,
    outputs: output ? [{ output_type: "stream", text: [output] }] : [],
  };
}

function source() {
  const cells = [
    markdown("# Predict restoration-duration bands for coastal substations"),
    code("prepared = clean(raw_events)\nprepared.shape", "(5,000, 14)", 1),
    code("zone_records = prepared[prepared.region == 'north']\ngetSummary(zone_records)", [
      "             number_distinct  number_nan",
      "Sensor Age                90           3",
      "Weekday                    7           0",
      "Month                     12           0",
      "zone                       2           0",
      "retired_field              0         800",
    ].join("\n"), 2),
    code([
      "model_table = zone_records[['Sensor Age','Weekday','Month','zone_NORTH','duration','outcome']]",
      "model_table.describe()",
    ].join("\n"), [
      "       Sensor Age  Weekday  Month  zone_NORTH  duration  outcome",
      "count  790.000000 790.000000 790.000000 790.000000 790.000000 790.000000",
      "mean    11.000000   3.000000   6.000000   0.500000   4.000000   1.000000",
    ].join("\n"), 3),
    code("model_table['outcome'] = pd.cut(model_table['duration'], [0, 2, 5, 30], labels=[0, 1, 2])", "", 4),
    code("def partition(dataset, target):\n    return train_test_split(dataset, target, test_size=0.25)", "", 5),
    markdown("### Logistic Regression"),
    code([
      "X_train, X_test, y_train, y_test = partition(model_table, model_table['outcome'])",
      "X1 = X_train.drop(['duration','outcome'], axis=1)",
      "Y1 = y_train",
      "X2 = X_test.drop(['duration','outcome'], axis=1)",
      "Y2 = y_test",
      "lr = LogisticRegression()",
      "lr.fit(X1, Y1)",
      "accuracy_score(Y2, lr.predict(X2))",
    ].join("\n"), "0.61", 6),
    markdown("### Decision Tree"),
    code("tree = DecisionTreeClassifier()\ntree.fit(X1, Y1)\naccuracy_score(Y2, tree.predict(X2))", "0.66", 7),
    markdown("### Random Forest"),
    code("forest = RandomForestClassifier(n_estimators=80)\nforest.fit(X1, Y1)\npredicted = forest.predict(X2)\naccuracy_score(Y2, predicted)", "0.71", 8),
    code([
      "class_names = ['brief', 'moderate', 'long']",
      "print('Normalized confusion matrix')",
      "confusion_matrix(Y2, predicted, normalize='true')",
    ].join("\n"), "Normalized confusion matrix\n[[0.70 0.25 0.05]\n [0.20 0.72 0.08]\n [0.18 0.42 0.40]]", 9),
  ];
  return notebookFragments(JSON.stringify({ cells }), {
    id: "E-COASTAL-NOTEBOOK",
    path: "notebooks/coastal-restoration.ipynb",
    kind: "notebook",
  });
}

function established(value, evidenceIds = ["E-COASTAL-NOTEBOOK"]) {
  return { state: "established", value, epistemic: "OBSERVED", evidence_ids: evidenceIds };
}

function record() {
  const reconstruction = emptyReconstruction("Coastal restoration study");
  reconstruction.samples.source_data = {
    state: "established",
    display: "20,000 recorded events",
    count: 20000,
    unit: "observations",
    epistemic: "OBSERVED",
    evidence_ids: ["E-SOURCE-INVENTORY"],
  };
  reconstruction.results_evaluation.primary_result = {
    state: "established",
    display_value: "71%",
    metric: "Accuracy",
    method: "Random Forest classifier",
    task_target: "Restoration-duration bands for coastal substations",
    evaluation_context: "Held-out test split",
    epistemic: "OBSERVED",
    evidence_ids: ["E-COASTAL-NOTEBOOK"],
  };
  reconstruction.results_evaluation.evaluation_design = established("A held-out train/test split was used.");
  reconstruction.data.period = established("Recorded study period");
  reconstruction.purpose_scope.target_outcome = established("Restoration-duration bands for coastal substations");
  return {
    project_id: "PRJ-COASTAL-SYNTHETIC",
    audit_id: "AUD-COASTAL-SYNTHETIC",
    source_project: { path: "/unrelated/coastal-study" },
    evidence: [
      { id: "E-SOURCE-INVENTORY", kind: "documentation", path: "inventory.md", excerpt: "The project received 20,000 recorded events." },
      { id: "E-COASTAL-NOTEBOOK", kind: "notebook", path: "notebooks/coastal-restoration.ipynb", excerpt: "Persisted analytical notebook." },
    ],
    reconstruction,
  };
}

test("generic persisted notebook patterns reconstruct one connected focal story", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [source()] });
  const story = layer.presentation.main_target_story;

  assert.equal(story.status, "established");
  assert.equal(story.method, "Random Forest");
  assert.equal(story.result.raw_value, 0.71);
  assert.deepEqual([
    story.populations.source_data.count,
    story.populations.model_sample.count,
    story.populations.evaluation_sample.count,
  ], [20000, 592, 198]);
  assert.match(story.evaluation_design.value, /75\/25 train\/test split/);

  assert.deepEqual(story.comparison_sets[0].methods, ["Logistic Regression", "Decision Tree", "Random Forest"]);
  assert.deepEqual(story.comparison_sets[0].results.map((item) => item.value), [0.61, 0.66, 0.71]);
  assert.deepEqual(story.feature_evidence.map((item) => item.display_label), ["Sensor Age", "Weekday", "Month", "Zone: North"]);

  assert.equal(story.diagnostics.length, 1);
  assert.equal(story.diagnostics[0].dimension, "normalized_rate_matrix");
  assert.deepEqual(story.diagnostics[0].orientation.class_labels, ["brief", "moderate", "long"]);

  const sensorMissingness = story.missingness.find((item) => item.field === "Sensor Age");
  assert.equal(sensorMissingness.denominator, 800);
  assert.equal(sensorMissingness.numerator, 3);
  assert.equal(sensorMissingness.value, 0.375);
  assert.ok(story.population_lineage.nodes.some((item) => item.count === 790 && item.role === "population_stage"));
});

test("generic split recognition rejects metric percentages and numeric identifiers as population counts", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [source()] });
  const counts = layer.object_graph.population_nodes.map((item) => item.count);
  assert.ok(!counts.includes(71));
  assert.ok(!counts.includes(66));
  assert.ok(!counts.includes(311));
});

test("explicit staged samples can complete confidence inputs without replacing established canonical samples", () => {
  const fixture = record();
  const layer = buildAnalyticalLayer(fixture, { sources: [source()] });
  const signals = buildSignalsLayer(fixture, { analyticalLayer: layer });
  assert.equal(signals.result_confidence.ladder.find((step) => step.score === 5).passed, true);

  fixture.reconstruction.samples.model_sample = { ...layer.presentation.main_target_story.populations.model_sample, count: 601 };
  fixture.reconstruction.samples.evaluation_sample = { ...layer.presentation.main_target_story.populations.evaluation_sample, count: 189 };
  const preserved = buildSignalsLayer(fixture, { analyticalLayer: layer });
  assert.equal(preserved.result_confidence.evidence_ids.includes("E-COASTAL-NOTEBOOK"), true);
  assert.equal(fixture.reconstruction.samples.model_sample.count, 601);
  assert.equal(fixture.reconstruction.samples.evaluation_sample.count, 189);
});

test("v0.20.11 runtime additions contain no development-project identities or answers", async () => {
  const runtime = await Promise.all([
    "../engine/analytical.mjs",
    "../engine/reconstruction-graph.mjs",
    "../engine/main-target-story.mjs",
  ].map((file) => fs.readFile(new URL(file, import.meta.url), "utf8")));
  assert.doesNotMatch(runtime.join("\n"), /\bR[1-6]\b|NYC311|Brooklyn|Chelsea|Crash Model|67485|47239|20246/);
});
