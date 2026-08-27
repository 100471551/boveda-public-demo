import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";

function markdown(value) { return { cell_type: "markdown", source: [value], outputs: [] }; }
function code(value, executionCount = 1) { return { cell_type: "code", execution_count: executionCount, source: [value], outputs: [] }; }
function source(path, evidenceId, cells) { return notebookFragments(JSON.stringify({ cells }), { id: evidenceId, path, kind: "notebook" }); }
function build(sources) {
  return buildAnalyticalLayer({ project_id: "PRJ-SYNTHETIC-ANCESTRY", audit_id: "AUD-SYNTHETIC-ANCESTRY", evidence: [] }, { sources });
}
function target(layer, field) { return layer.target_definitions.find((item) => item.source_field === field); }
function graphFor(layer, targetDefinition) { return layer.target_construction_graphs.find((item) => item.id === targetDefinition.construction_graph_id); }
function stepsFor(layer, targetDefinition) {
  const ids = new Set(graphFor(layer, targetDefinition).step_ids);
  return layer.target_construction_steps.filter((item) => ids.has(item.id));
}
function edgesFor(layer, targetDefinition) {
  const ids = new Set(graphFor(layer, targetDefinition).edge_ids);
  return layer.target_construction_edges.filter((item) => ids.has(item.id));
}

function simpleFixture({ raw = "soil_reading", intermediate = "prepared_level", targetField = "canopy_alert", threshold = 4, includeIntermediate = true, path = "models/canopy.ipynb", evidenceId = "E-CANOPY" } = {}) {
  const lines = [
    ...(includeIntermediate ? [`frame['${intermediate}'] = frame['${raw}']`] : []),
    `frame['${targetField}'] = ${intermediate}.mask(${intermediate} > ${threshold}, 1)`,
    `y_train = frame[['${targetField}']]`,
  ];
  return source(path, evidenceId, [markdown("# Predictive modeling: Canopy alert"), code(lines.join("\n"), 3)]);
}

test("simple ancestry preserves source, intermediate, threshold root, and dependency edges", () => {
  const layer = build([simpleFixture()]);
  const definition = target(layer, "canopy_alert");
  const steps = stepsFor(layer, definition);
  assert.equal(definition.construction_status, "complete");
  assert.ok(definition.construction_root_step_id);
  assert.deepEqual(definition.terminal_source_fields, ["soil_reading"]);
  assert.deepEqual(new Set(steps.map((item) => item.operation_type)), new Set(["source_field", "assignment", "threshold_mask"]));
  assert.equal(edgesFor(layer, definition).length, 2);
});

test("composite ancestry preserves sibling component branches, grouping, aggregation, and threshold", () => {
  const fixture = source("models/reef.ipynb", "E-REEF", [markdown("# Predictive modeling: Reef alert"), code([
    "signals = ['acidity_sensor', 'oxygen_sensor', 'clarity_sensor']",
    "frame['combined_signal'] = frame[signals].sum(axis=1)",
    "frame['reef_alert'] = frame.combined_signal.mask(frame.combined_signal >= 2, 1)",
    "y_train = frame[['reef_alert']]",
  ].join("\n"), 8)]);
  const layer = build([fixture]);
  const definition = target(layer, "reef_alert");
  const steps = stepsFor(layer, definition);
  const group = steps.find((item) => item.operation_type === "component_group");
  const incoming = edgesFor(layer, definition).filter((edge) => edge.to_step_id === group.id);
  assert.deepEqual(new Set(definition.terminal_source_fields), new Set(["acidity_sensor", "oxygen_sensor", "clarity_sensor"]));
  assert.equal(incoming.length, 3);
  assert.deepEqual(new Set(incoming.map((edge) => edge.input)), new Set(definition.terminal_source_fields));
  assert.ok(steps.some((item) => item.operation_type === "aggregation_sum"));
  assert.ok(steps.some((item) => item.operation_type === "threshold_mask"));
});

test("fill transformation and its parameter remain structurally visible in ancestry", () => {
  const fixture = source("models/estuary.ipynb", "E-ESTUARY", [markdown("# Predictive modeling: Estuary alert"), code([
    "frame['clean_depth'] = frame['raw_depth'].fillna(7)",
    "frame['estuary_alert'] = frame.clean_depth.mask(frame.clean_depth > 5, 1)",
    "y_train = frame[['estuary_alert']]",
  ].join("\n"), 4)]);
  const layer = build([fixture]);
  const definition = target(layer, "estuary_alert");
  const fill = stepsFor(layer, definition).find((item) => item.operation_type === "fill");
  assert.equal(fill.parameters.fill_value, 7);
  assert.deepEqual(definition.source_fields, definition.terminal_source_fields);
  assert.deepEqual(definition.terminal_source_fields, ["raw_depth"]);
});

test("each observed construction step retains independent evidence and source location", () => {
  const fixture = source("models/orchard.ipynb", "E-ORCHARD", [
    markdown("# Predictive modeling: Orchard alert"),
    code("frame['prepared_score'] = frame['raw_score']", 1),
    code("frame['orchard_alert'] = frame.prepared_score.mask(frame.prepared_score > 9, 1)\ny_train = frame[['orchard_alert']]", 2),
  ]);
  const layer = build([fixture]);
  const observed = stepsFor(layer, target(layer, "orchard_alert")).filter((item) => item.epistemic === "OBSERVED" && item.operation_type !== "source_field");
  assert.deepEqual(new Set(observed.map((item) => item.source_locator)), new Set(["models/orchard.ipynb#cell-1", "models/orchard.ipynb#cell-2"]));
  assert.ok(observed.every((item) => item.evidence_ids.includes("E-ORCHARD") && Number.isInteger(item.source_line) && Number.isInteger(item.execution_count)));
});

test("renaming sources, intermediates, and targets changes identities without changing ancestry shape", () => {
  const first = build([simpleFixture()]);
  const renamed = build([simpleFixture({ raw: "wind_input", intermediate: "bounded_wind", targetField: "shelter_alert" })]);
  const firstTarget = target(first, "canopy_alert");
  const renamedTarget = target(renamed, "shelter_alert");
  assert.deepEqual(stepsFor(first, firstTarget).map((item) => item.operation_type).sort(), stepsFor(renamed, renamedTarget).map((item) => item.operation_type).sort());
  assert.deepEqual(renamedTarget.terminal_source_fields, ["wind_input"]);
  assert.notEqual(firstTarget.construction_root_step_id, renamedTarget.construction_root_step_id);
});

test("threshold parameter mutation is reflected by the observed root step", () => {
  const first = build([simpleFixture({ threshold: 4 })]);
  const changed = build([simpleFixture({ threshold: 11 })]);
  const firstTarget = target(first, "canopy_alert");
  const changedTarget = target(changed, "canopy_alert");
  const firstRoot = first.target_construction_steps.find((item) => item.id === firstTarget.construction_root_step_id);
  const changedRoot = changed.target_construction_steps.find((item) => item.id === changedTarget.construction_root_step_id);
  assert.equal(firstRoot.parameters.threshold, 4);
  assert.equal(changedRoot.parameters.threshold, 11);
  assert.notEqual(firstRoot.id, changedRoot.id);
});

test("removing an intermediate statement produces a partial graph with an unresolved dependency", () => {
  const layer = build([simpleFixture({ includeIntermediate: false })]);
  const definition = target(layer, "canopy_alert");
  assert.equal(definition.construction_status, "partial");
  assert.ok(definition.construction_issues.some((item) => item.kind === "missing_dependency" && item.input === "prepared_level"));
  assert.ok(stepsFor(layer, definition).some((item) => item.operation_type === "unresolved_reference" && item.state === "unresolved"));
  assert.deepEqual(definition.terminal_source_fields, []);
});

test("cyclic assignment evidence is bounded and marked partial", () => {
  const fixture = source("models/cycle.ipynb", "E-CYCLE", [markdown("# Predictive modeling: Cycle alert"), code([
    "alpha = beta",
    "beta = alpha",
    "frame['cycle_alert'] = beta.mask(beta > 1, 1)",
    "y_train = frame[['cycle_alert']]",
  ].join("\n"), 2)]);
  const layer = build([fixture]);
  const definition = target(layer, "cycle_alert");
  assert.equal(definition.construction_status, "partial");
  assert.ok(definition.construction_issues.some((item) => item.kind === "cycle_detected"));
  assert.ok(definition.construction_step_ids.length < 10);
});

test("equivalent repeated statements in one execution context are deduplicated", () => {
  const fixture = source("models/repeat.ipynb", "E-REPEAT", [markdown("# Predictive modeling: Repeat alert"), code([
    "frame['prepared'] = frame['raw']",
    "frame['prepared'] = frame['raw']",
    "frame['repeat_alert'] = frame.prepared.mask(frame.prepared > 3, 1)",
    "y_train = frame[['repeat_alert']]",
  ].join("\n"), 5)]);
  const layer = build([fixture]);
  const assignments = stepsFor(layer, target(layer, "repeat_alert")).filter((item) => item.operation_type === "assignment" && item.output === "prepared");
  assert.equal(assignments.length, 1);
});

test("similarly named intermediates remain isolated by notebook execution context", () => {
  const first = simpleFixture({ raw: "north_input", intermediate: "shared_helper", targetField: "north_alert", path: "models/north.ipynb", evidenceId: "E-NORTH" });
  const second = simpleFixture({ raw: "south_input", intermediate: "shared_helper", targetField: "south_alert", path: "models/south.ipynb", evidenceId: "E-SOUTH" });
  const layer = build([first, second]);
  for (const [field, expectedPath, expectedLeaf] of [["north_alert", "models/north.ipynb", "north_input"], ["south_alert", "models/south.ipynb", "south_input"]]) {
    const definition = target(layer, field);
    assert.deepEqual(definition.terminal_source_fields, [expectedLeaf]);
    assert.ok(stepsFor(layer, definition).every((item) => item.source_path === expectedPath));
  }
});

test("cross-cell ancestry without compatible execution counts remains partial", () => {
  const fixture = source("models/ambiguous-order.ipynb", "E-AMBIGUOUS", [
    markdown("# Predictive modeling: Ambiguous order alert"),
    code("prepared_measure = frame['raw_measure']", null),
    code("frame['order_alert'] = prepared_measure.mask(prepared_measure > 6, 1)\ny_train = frame[['order_alert']]", null),
  ]);
  const layer = build([fixture]);
  const definition = target(layer, "order_alert");
  assert.equal(definition.construction_status, "partial");
  assert.ok(definition.construction_issues.some((item) => item.kind === "missing_dependency" && item.input === "prepared_measure"));
  assert.ok(!definition.construction_step_ids.some((id) => layer.target_construction_steps.find((item) => item.id === id)?.output === "raw_measure"));
});

test("runtime ancestry reconstruction contains no development-case identifiers or expected paths", async () => {
  const runtime = await fs.readFile(new URL("../engine/reconstruction-graph.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(runtime, /Chelsea|Public Health Housing|R1_|any_violation|any_high_risk|overcrowding_risk|Certificate of Habitability|7036|5989|1611|1263|348|0\.565/);
});
