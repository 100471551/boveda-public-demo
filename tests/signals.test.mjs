import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildSignalsLayer,
  CHECK_DEFINITIONS,
  CHECK_RESULTS,
  COVERAGE_DOMAINS,
  FIELD_DEFINITIONS,
  OVERVIEW_STRUCTURE,
} from "../engine/signals.mjs";

async function preserved(id) {
  return JSON.parse(await fs.readFile(new URL(`../preserved-audits/v0.9.2/records/${id}.json`, import.meta.url), "utf8"));
}

function allStates(layer) {
  return [
    ...Object.values(layer.overview.fields).map((field) => field.state),
    ...layer.overview.groups.map((group) => group.state),
    ...layer.overview.sections.map((section) => section.state),
    ...layer.project_evidence_coverage.domains.map((domain) => domain.state),
    layer.project_evidence_coverage,
  ];
}

test("Findings uses the canonical Overview hierarchy and a separate coverage family", () => {
  assert.deepEqual(OVERVIEW_STRUCTURE.map((section) => section.label), ["Purpose & scope", "Results & Evaluation", "Data, populations & samples"]);
  assert.deepEqual(COVERAGE_DOMAINS.map((domain) => domain.label), ["Project Context Coverage", "Traceability coverage", "Reproducibility coverage", "Source coverage"]);
  assert.equal(Object.keys(FIELD_DEFINITIONS).length, 20);
  assert.ok(Object.values(FIELD_DEFINITIONS).every((field) => field.questions.length >= 2 && field.questions.length <= 3));
  const evaluationReferences = OVERVIEW_STRUCTURE.flatMap((section) => section.groups).flatMap((group) => group.field_ids).filter((id) => id === "field-evaluation-sample");
  assert.equal(evaluationReferences.length, 2);
  assert.equal(FIELD_DEFINITIONS["field-evaluation-sample"].path, "samples.evaluation_sample");
});

test("the bounded Alpha inventory starts from supervisory questions and preserves all canonical results", () => {
  assert.ok(CHECK_DEFINITIONS.length >= 8);
  assert.ok(CHECK_DEFINITIONS.every((check) => check.question_ids.length && check.version && check.operation && check.allowed_claim));
  assert.deepEqual(new Set(Object.values(CHECK_RESULTS)), new Set(["SIGNAL PRESENT", "NO SIGNAL DETECTED", "NOT APPLICABLE", "INSUFFICIENT EVIDENCE"]));
});

test("Findings derives deterministically without mutating stored audits or calling a provider", async () => {
  const record = await preserved("R3");
  const before = JSON.stringify(record);
  const first = buildSignalsLayer(record);
  const second = buildSignalsLayer(record);
  assert.equal(JSON.stringify(record), before);
  assert.deepEqual(first, second);
  assert.equal(first.execution_mode, "deterministic_offline");
  assert.equal(first.provider_calls, 0);
  assert.equal(first.audit_id, record.audit_id);
  assert.equal(first.derived_from.source_snapshot, record.source_project.content_snapshot_after);
});

test("one canonical Evidence Gap affects several fields and rows without duplication", async () => {
  const layer = buildSignalsLayer(await preserved("R3"));
  assert.equal(layer.finding_count, layer.findings.length);
  assert.equal(layer.finding_count, layer.finding_breakdown.signals + layer.finding_breakdown.evidence_gaps);
  assert.equal(layer.finding_breakdown.signals, 0);
  const gap = layer.findings.find((finding) => finding.result.missing_object_ids.includes("field-model-sample"));
  assert.equal(gap.finding_type, "evidence_gap");
  assert.equal(gap.producing_check.result, CHECK_RESULTS.INSUFFICIENT);
  assert.ok(gap.related_check_execution_ids.length >= 2);
  assert.ok(gap.impacts.some((impact) => impact.object_id === "field-primary-result" && impact.claim_effect === "qualifies"));
  assert.ok(gap.impacts.some((impact) => impact.object_id === "field-model-sample"));
  assert.ok(gap.impacts.some((impact) => impact.object_id === "coverage-traceability"));
  assert.ok(gap.impacts.some((impact) => impact.object_id === "coverage-reproducibility"));
  const appearances = layer.rows.filter((row) => row.finding_ids.includes(gap.finding_id));
  assert.ok(appearances.length >= 3);
  assert.ok(appearances.every((row) => row.finding_ids.filter((id) => id === gap.finding_id).length === 1));
  assert.equal(new Set(layer.findings.map((item) => item.finding_id)).size, layer.finding_count);
  assert.equal(new Set(layer.project_evidence_coverage.state_reason_ids).size, layer.project_evidence_coverage.state_reason_ids.length);
});

test("missing and unimplemented coverage never becomes NO SIGNAL DETECTED", async () => {
  const layer = buildSignalsLayer(await preserved("R4"));
  const origin = layer.checks.find((check) => check.check_id === "CHK-PRIMARY-RESULT-ORIGIN");
  const sampleLineage = layer.checks.find((check) => check.check_id === "CHK-SAMPLE-LINEAGE");
  const reproduction = layer.checks.find((check) => check.check_id === "CHK-REPRODUCTION-INPUT-COVERAGE-V2");
  assert.equal(origin.result, CHECK_RESULTS.INSUFFICIENT);
  assert.equal(sampleLineage.result, CHECK_RESULTS.INSUFFICIENT);
  assert.equal(reproduction.result, CHECK_RESULTS.INSUFFICIENT);
  assert.equal(layer.overview.fields["field-other-material-result"].state.assessment_status, "not_implemented");
  assert.equal(layer.overview.fields["field-other-material-result"].state.state, null);
});

test("check results, Findings, colours, and Evidence Tokens retain a complete typed trail", async () => {
  const layer = buildSignalsLayer(await preserved("R3"));
  for (const check of layer.checks) {
    assert.ok(check.execution_id && check.question_ids.length && check.operation && check.result);
    assert.ok(check.trail.execution_id === check.execution_id);
    assert.ok(["supporting", "contradicting", "qualifying", "contextual"].every((role) => Array.isArray(check.evidence[role])));
    if (check.result === CHECK_RESULTS.INSUFFICIENT || check.result === CHECK_RESULTS.PRESENT) assert.ok(check.gaps.length);
  }
  for (const finding of layer.findings) {
    assert.ok(finding.finding_id && finding.related_check_execution_ids.length && finding.producing_check.execution_id);
    assert.ok(finding.claims.allowed.length && finding.claims.prohibited.length);
    assert.ok(finding.impacts.length && finding.gaps.length);
    if (finding.finding_type === "signal") assert.equal(finding.producing_check.result, CHECK_RESULTS.PRESENT);
    if (finding.finding_type === "evidence_gap") assert.equal(finding.producing_check.result, CHECK_RESULTS.INSUFFICIENT);
  }
  for (const state of allStates(layer).filter((item) => item.colour)) assert.ok(state.state_reason_ids.length, `${state.object_id} lacks state reasons`);
  for (const state of allStates(layer).filter((item) => ["amber", "red"].includes(item.colour))) {
    assert.ok(state.state_reason_ids.some((id) => layer.findings.some((finding) => finding.finding_id === id)), `${state.object_id} has a material colour without a Finding`);
  }
});

test("NO SIGNAL DETECTED and NOT APPLICABLE never create Findings", async () => {
  const layer = buildSignalsLayer(await preserved("R1"));
  for (const execution of layer.checks.filter((check) => [CHECK_RESULTS.ABSENT, CHECK_RESULTS.NOT_APPLICABLE].includes(check.result))) {
    assert.deepEqual(execution.finding_ids, []);
  }
});

test("Result confidence is cumulative, deterministic, and uses only explicit dependency caps", async () => {
  const record = await preserved("R3");
  record.reconstruction.confidence = { level: "High", explanation: "Provider-authored confidence must be ignored.", evidence_ids: [] };
  const first = buildSignalsLayer(record).result_confidence;
  const second = buildSignalsLayer(record).result_confidence;
  assert.deepEqual(first, second);
  assert.equal(first.score, 4);
  assert.equal(first.label, "Evaluation bounded");
  assert.equal(first.evidence_score, 4);
  assert.ok(first.ladder.slice(0, 4).every((step) => step.passed));
  assert.equal(first.ladder[4].passed, false);
  assert.equal(first.derivation, "deterministic_cumulative_v0.10.1");
});

test("a general coverage gap does not lower Result confidence without a primary dependency", async () => {
  const baselineRecord = await preserved("R1");
  const baseline = buildSignalsLayer(baselineRecord);
  const record = structuredClone(baselineRecord);
  record.reconstruction.purpose_scope.intended_use.evidence_ids = ["E-NOT-IN-RECORD"];
  const changed = buildSignalsLayer(record);
  const generalGap = changed.findings.find((finding) => finding.result.missing_object_ids.includes("field-intended-use"));
  assert.ok(generalGap);
  assert.equal(generalGap.confidence_impact, null);
  assert.equal(changed.result_confidence.score, baseline.result_confidence.score);
});

test("coverage aggregation is independent and no numerical health or project score exists", async () => {
  const layer = buildSignalsLayer(await preserved("R1"));
  assert.equal(layer.project_evidence_coverage.label, "Partially covered");
  assert.equal(layer.overview.sections[0].label, "Purpose & scope");
  assert.equal(layer.overview.sections[0].state.label, "Established");
  assert.notEqual(layer.project_evidence_coverage.state, layer.overview.sections[0].state.state);
  assert.doesNotMatch(JSON.stringify(layer), /health_score|project_score|governance_score|compliance_score|risk_score/i);
});

test("existing preserved audits remain readable and Findings render across their variable compositions", async () => {
  for (const id of ["R1", "R2", "R3", "R4", "R5", "R6"]) {
    const record = await preserved(id);
    const layer = buildSignalsLayer(record);
    assert.equal(layer.project_id, record.project_id);
    assert.equal(layer.rows.length, OVERVIEW_STRUCTURE.flatMap((section) => section.groups).length + COVERAGE_DOMAINS.length);
    assert.ok(layer.checks.every((check) => check.result !== undefined));
    assert.ok(layer.findings.every((finding) => ["signal", "evidence_gap"].includes(finding.finding_type)));
    assert.equal(layer.finding_count, new Set(layer.findings.map((finding) => finding.finding_id)).size);
    assert.ok(Number.isInteger(layer.result_confidence.score) && layer.result_confidence.score >= 0 && layer.result_confidence.score <= 8);
  }
});

test("the Findings endpoint projection is read-only and the Overview loads independently", async () => {
  const server = await fs.readFile(new URL("../engine/server.mjs", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const signalsView = await fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8");
  assert.match(server, /app\.get\("\/api\/projects\/:id\/signals"/);
  assert.match(server, /buildSignalsLayer\(record, \{ analyticalLayer \}\)/);
  assert.match(server, /collectAnalyticalSources\(record\)/);
  assert.doesNotMatch(server.match(/app\.get\("\/api\/projects\/:id\/signals"[\s\S]*?\n\}\);/)?.[0] || "", /analyseProject|saveRecord|reconstruct/);
  assert.match(app, /catch \{ setSignalsLayer\(null\); \}/);
  assert.match(signalsView, /The stored Overview remains available and unchanged/);
  assert.match(signalsView, /<span>Checks<\/span><span>Findings<\/span>/);
});

test("the supplied check and alert assets are used for canonical check rows", async () => {
  const view = await fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8");
  const check = await fs.readFile(new URL("../public/ui/icons/check.svg", import.meta.url), "utf8");
  const alert = await fs.readFile(new URL("../public/ui/icons/alert_2.svg", import.meta.url), "utf8");
  assert.match(view, /\/ui\/icons\/check\.svg/);
  assert.match(view, /\/ui\/icons\/alert_2\.svg/);
  assert.match(check, /<svg/);
  assert.match(alert, /<svg/);
});
