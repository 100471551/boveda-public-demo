import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { collectAnalyticalSources } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { buildSignalsLayer, CHECK_RESULTS } from "../engine/signals.mjs";
import { buildFindingsPresentation } from "../src/findings-presentation.mjs";

async function r1() {
  const record = JSON.parse(await fs.readFile(new URL("../storage/projects/PRJ-1D50CE481C/record.json", import.meta.url), "utf8"));
  const analyticalLayer = buildAnalyticalLayer(record, { sources: await collectAnalyticalSources(record) });
  return { record, analyticalLayer, layer: buildSignalsLayer(record, { analyticalLayer }) };
}

const states = (layer, checkId) => layer.checks.filter((execution) => execution.check_id === checkId).map((execution) => execution.result);

test("stored R1 preserves its six current canonical graph-native project Signals", async () => {
  const { layer } = await r1();
  const expectedChecks = [
    "CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE",
    "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY",
    "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY",
    "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE",
    "CHK-OUTPUT-COLUMN-CONSISTENCY",
    "CHK-ANALYTICAL-ROLE-ALIGNMENT",
  ];
  const signals = layer.findings.filter((finding) => finding.finding_type === "signal");
  assert.deepEqual(new Set(signals.map((finding) => finding.producing_check.check_id)), new Set(expectedChecks));
  assert.equal(signals.length, expectedChecks.length);
  assert.equal(signals.find((finding) => finding.producing_check.check_id === "CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE").related_check_execution_ids.length, 3);
  assert.equal(signals.find((finding) => finding.producing_check.check_id === "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY").related_check_execution_ids.length, 9);
  assert.equal(signals.find((finding) => finding.producing_check.check_id === "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE").related_check_execution_ids.length, 3);
  assert.equal(layer.finding_breakdown.signals, signals.length);
  assert.ok(signals.every((finding) => finding.claims.allowed.length && finding.claims.prohibited.length));
  assert.ok(signals.every((finding) => finding.trail.execution_ids.length && finding.trail.graph_object_ids.length && finding.trail.evidence_ids.length));
  const expectedSeverity = new Map([
    ["CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE", "high"],
    ["CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", "medium"],
    ["CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", "high"],
    ["CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE", "medium"],
    ["CHK-OUTPUT-COLUMN-CONSISTENCY", "high"],
    ["CHK-ANALYTICAL-ROLE-ALIGNMENT", "medium"],
  ]);
  assert.ok(signals.every((finding) => finding.materiality.level === expectedSeverity.get(finding.producing_check.check_id)));
});

test("stored R1 retains explicit compatible green checks and exact four-state executions", async () => {
  const { layer } = await r1();
  assert.deepEqual(states(layer, "CHK-TYPED-FOCAL-RESULT-ORIGIN"), [CHECK_RESULTS.ABSENT]);
  assert.deepEqual(states(layer, "CHK-TARGET-CONSTRUCTION-ANCESTRY"), Array(3).fill(CHECK_RESULTS.ABSENT));
  assert.deepEqual(states(layer, "CHK-POPULATION-LINEAGE-COMPATIBILITY"), [CHECK_RESULTS.INSUFFICIENT]);
  assert.equal(states(layer, "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY").filter((value) => value === CHECK_RESULTS.PRESENT).length, 1);
  assert.equal(states(layer, "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY").filter((value) => value === CHECK_RESULTS.ABSENT).length, 8);
  assert.equal(states(layer, "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE").filter((value) => value === CHECK_RESULTS.PRESENT).length, 3);
  assert.equal(states(layer, "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE").filter((value) => value === CHECK_RESULTS.ABSENT).length, 6);
  assert.equal(states(layer, "CHK-OUTPUT-COLUMN-CONSISTENCY").filter((value) => value === CHECK_RESULTS.PRESENT).length, 1);
  assert.equal(states(layer, "CHK-OUTPUT-COLUMN-CONSISTENCY").filter((value) => value === CHECK_RESULTS.ABSENT).length, 2);
  assert.equal(states(layer, "CHK-ANALYTICAL-ROLE-ALIGNMENT").filter((value) => value === CHECK_RESULTS.PRESENT).length, 1);
  assert.equal(states(layer, "CHK-ANALYTICAL-ROLE-ALIGNMENT").filter((value) => value === CHECK_RESULTS.ABSENT).length, 2);
});

test("R1 reproduction insufficiency remains Evidence Gaps and reuses the environment identity", async () => {
  const { layer } = await r1();
  assert.deepEqual(states(layer, "CHK-REPRODUCTION-INPUT-COVERAGE-V2"), [CHECK_RESULTS.INSUFFICIENT]);
  assert.equal(layer.findings.filter((finding) => finding.finding_type === "evidence_gap").length, 3);
  assert.equal(layer.findings.filter((finding) => finding.result.missing_object_ids?.includes("evidence-configuration")).length, 1);
  assert.ok(!layer.findings.some((finding) => finding.finding_type === "signal" && finding.producing_check.check_id === "CHK-REPRODUCTION-INPUT-COVERAGE-V2"));
});

test("canonical Signal identities and presentation are deterministic and free of internal card IDs", async () => {
  const { record, analyticalLayer, layer } = await r1();
  const again = buildSignalsLayer(record, { analyticalLayer });
  assert.deepEqual(layer.signal_ids, again.signal_ids);
  const renamed = structuredClone(record); renamed.project_id = "PROJECT-RENAMED"; renamed.reconstruction.identity.name.value = "Unrelated renamed project";
  const renamedLayer = buildSignalsLayer(renamed, { analyticalLayer });
  assert.deepEqual(layer.signal_ids, renamedLayer.signal_ids);
  const presentation = buildFindingsPresentation(layer);
  assert.equal(presentation.signals.length, 6);
  assert.equal(presentation.evidence_gaps.length, 3);
  assert.ok(presentation.signals.every((item) => item.title && item.condition_summary && item.why_it_matters));
  const cardCopy = presentation.signals.map((item) => ({ title: item.title, condition: item.condition_summary, why: item.why_it_matters, primary_scope: item.primary_scope, secondary_scopes: item.secondary_scopes }));
  assert.doesNotMatch(JSON.stringify(cardCopy), /ATD-|AMR-|AEA-|AMO-|APN-|EXEC-|CHK-/);
});

test("the focal probability PR AUC is not scoped into the hard-label Average Precision Signal", async () => {
  const { analyticalLayer, layer } = await r1();
  const focalId = analyticalLayer.object_graph.best_final_result.analytical_result_id;
  const metricSignal = layer.findings.find((finding) => finding.finding_type === "signal" && finding.producing_check.check_id === "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY");
  assert.ok(metricSignal);
  assert.ok(!metricSignal.trail.graph_object_ids.includes(focalId));
  assert.equal(analyticalLayer.object_graph.metric_observations.find((metric) => metric.id === focalId).score_input, "probability");
});

test("every graph-native execution terminates through check to graph objects to evidence", async () => {
  const { layer } = await r1();
  const graphChecks = layer.checks.filter((execution) => execution.implementation_status === "implemented_graph_native");
  assert.ok(graphChecks.length > 0);
  assert.ok(graphChecks.every((execution) => execution.trail.graph_object_refs.length || execution.result === CHECK_RESULTS.NOT_APPLICABLE));
  assert.ok(graphChecks.filter((execution) => execution.result !== CHECK_RESULTS.NOT_APPLICABLE).every((execution) => execution.trail.evidence_ids.length || execution.result === CHECK_RESULTS.INSUFFICIENT));
  assert.ok(graphChecks.every((execution) => execution.configuration.input_contract === "stored analytical reconstruction graph"));
  assert.ok(graphChecks.every((execution) => execution.threshold === null));
});
