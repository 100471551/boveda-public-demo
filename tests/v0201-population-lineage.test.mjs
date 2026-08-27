import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { emptyReconstruction } from "../engine/contract.mjs";

function markdown(source) {
  return { cell_type: "markdown", source: [source], outputs: [] };
}

function code(source, output = "") {
  return {
    cell_type: "code",
    source: [source],
    outputs: output ? [{ output_type: "stream", text: [output] }] : [],
  };
}

function source(cells, path = "notebooks/demand-sequence.ipynb", evidenceId = "E-DEMAND") {
  return notebookFragments(JSON.stringify({ cells }), { id: evidenceId, path, kind: "notebook" });
}

function record() {
  return { project_id: "PRJ-FIXTURE", audit_id: "AUD-FIXTURE", reconstruction: emptyReconstruction("Service demand") };
}

function sequenceAndSensitivityNotebook() {
  return source([
    markdown("# Sequence model for service demand"),
    code("events = read_table('events.parquet')\nevents.sort_values(['account_id', 'period'], inplace=True)"),
    code("eligible_events = events[events.account_id.isin(eligible_accounts)]"),
    code(
      "train_rows = eligible_events[eligible_events.account_id.isin(train_ids)]\nevaluation_rows = eligible_events[eligible_events.account_id.isin(evaluation_ids)]\nprint(len(train_rows), len(evaluation_rows))",
      "(4200, 1800)",
    ),
    code("look_back = 5\ndef create_dataset(dataset, look_back):\n    return sliding_windows(dataset, look_back)"),
    code("trainX, trainY = create_dataset(train_rows, look_back)\nevaluationX, evaluationY = create_dataset(evaluation_rows, look_back)"),
    code(
      "model.fit(trainX, trainY, validation_data=(evaluationX, evaluationY))",
      "Train on 4194 samples, validate on 1794 samples",
    ),
    markdown("### Check sensitivity to horizon"),
    code(
      "for horizon in horizons:\n    test.run_tuned('RF_base', cal=False)",
      "horizon 7\nTrain obs: 700\nTest obs: 300\nFitting RF_base model\n\nhorizon 14\nTrain obs: 680\nTest obs: 320\nFitting RF_base model",
    ),
  ]);
}

test("explicit branch lengths and sequence preparation retain their population roles", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [sequenceAndSensitivityNotebook()] });
  const context = layer.sample_lineage.contexts.find((item) => item.workstream === "Sequence model for service demand");
  assert.ok(context);
  assert.deepEqual(context.nodes.map(({ role, label, count, unit }) => ({ role, label, count, unit })), [
    { role: "population_stage", label: "Filtered population", count: 6000, unit: "rows" },
    { role: "training", label: "Training rows", count: 4200, unit: "rows" },
    { role: "evaluation", label: "Evaluation rows", count: 1800, unit: "rows" },
    { role: "training", label: "Training sequences", count: 4194, unit: "sequences" },
    { role: "evaluation", label: "Evaluation sequences", count: 1794, unit: "sequences" },
  ]);
  assert.deepEqual(context.edges.map((edge) => edge.relation).sort(), ["sequence preparation", "sequence preparation", "split", "split"]);
  assert.equal(context.training_count, 4194);
  assert.equal(context.evaluation_count, 1794);
  assert.ok(context.nodes.every((node) => node.label !== "Target population"));
});

test("method-specific sensitivity slices do not inherit lineage from a notebook's sequence-model heading", () => {
  const layer = buildAnalyticalLayer(record(), { sources: [sequenceAndSensitivityNotebook()] });
  const sensitivity = layer.sample_lineage.contexts.filter((item) => /Random Forest/.test(item.workstream));
  assert.equal(sensitivity.length, 2);
  assert.deepEqual(sensitivity.map((item) => item.display_label).sort(), [
    "Random Forest — Check sensitivity to horizon · horizon 14",
    "Random Forest — Check sensitivity to horizon · horizon 7",
  ].sort());
  const countsByLabel = Object.fromEntries(sensitivity.map((item) => [item.display_label, item.nodes.map((node) => node.count)]));
  assert.deepEqual(countsByLabel["Random Forest — Check sensitivity to horizon · horizon 7"], [1000, 700, 300]);
  assert.deepEqual(countsByLabel["Random Forest — Check sensitivity to horizon · horizon 14"], [1000, 680, 320]);
  assert.ok(sensitivity.every((item) => item.edges.length === 2 && item.edges.every((edge) => edge.relation === "split")));
  assert.ok(sensitivity.every((item) => item.nodes.every((node) => ![4200, 1800, 4194, 1794].includes(node.count))));
});

test("an unresolved canonical source count is not replaced by the largest unrelated shape", () => {
  const shaped = source([
    markdown("# Cohort preparation"),
    code("customer_table.shape", "(9000, 12)"),
  ], "notebooks/cohort-preparation.ipynb", "E-COHORT");
  const layer = buildAnalyticalLayer(record(), { sources: [shaped] });
  assert.equal(layer.object_graph.population_graph.nodes.some((node) => node.role === "source"), false);
});
