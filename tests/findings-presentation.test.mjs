import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildSignalsLayer, CHECK_RESULTS } from "../engine/signals.mjs";
import { buildFindingsPresentation, FINDINGS_PRESENTATION_CONTRACT_VERSION } from "../src/findings-presentation.mjs";

const field = (id, label, questionId) => ({
  id,
  label,
  questions: [{ id: questionId, text: "Synthetic supervisory question", check_ids: [] }],
});

function syntheticLayer(findings) {
  return {
    overview: {
      sections: [
        { id: "section-purpose", groups: [{ id: "group-purpose", field_ids: ["field-population"] }] },
        { id: "section-results", groups: [{ id: "group-results", field_ids: ["field-result", "field-limitation"] }] },
      ],
      fields: {
        "field-population": field("field-population", "Population / scope", "Q-POPULATION"),
        "field-result": field("field-result", "Other material result", "Q-RESULT"),
        "field-limitation": field("field-limitation", "Known limitation", "Q-LIMITATION"),
      },
    },
    project_evidence_coverage: {
      domains: [{ id: "coverage-repro", label: "Reproducibility coverage", questions: [{ id: "Q-REPRO", text: "Can the result be reproduced?", check_ids: [] }] }],
    },
    checks: [],
    findings,
  };
}

function signal({ id, title, fieldId, questionId, scope, secondaryScopes = [], condition, why }) {
  return {
    finding_id: id,
    signal_id: id,
    finding_type: "signal",
    status: "active",
    name: "Internal predicate label that must not become the title",
    condition,
    explanation: "Internal generic explanation",
    result: { exact_condition: condition },
    question_ids: [questionId],
    related_check_execution_ids: [`EXEC-${id}`],
    producing_check: { check_id: `CHK-${id}`, execution_id: `EXEC-${id}`, result: CHECK_RESULTS.PRESENT },
    impacts: [{ object_type: "overview_field", object_id: fieldId, claim_effect: "limits" }],
    presentation: {
      title,
      condition_summary: condition,
      why_it_matters: why,
      primary_scope: scope,
      secondary_scopes: secondaryScopes,
    },
    claims: { allowed: [condition], prohibited: ["Do not infer a verdict."] },
    evidence: { supporting: [`E-${id}`], contradicting: [], qualifying: [], contextual: [] },
  };
}

function evidenceGap() {
  return {
    finding_id: "EGAP-SYNTHETIC",
    evidence_gap_id: "EGAP-SYNTHETIC",
    finding_type: "evidence_gap",
    status: "active",
    name: "Environment and configuration identity evidence is insufficient.",
    condition: "Configuration evidence is not structurally established.",
    explanation: "The available evidence cannot establish the complete execution environment.",
    result: { exact_condition: "Configuration evidence is not structurally established." },
    question_ids: ["Q-REPRO"],
    related_check_execution_ids: ["EXEC-REPRO"],
    producing_check: { check_id: "CHK-REPRO", execution_id: "EXEC-REPRO", result: CHECK_RESULTS.INSUFFICIENT },
    impacts: [{ object_type: "coverage_domain", object_id: "coverage-repro", claim_effect: "limits" }],
    claims: { allowed: ["The dependency is unresolved."], prohibited: ["The project condition is adverse."] },
    evidence: { supporting: ["E-SOURCE"], contradicting: [], qualifying: [], contextual: [] },
  };
}

test("SignalPresentation is deterministic, supervisor-facing, and ordered by Overview ownership", () => {
  const populationSignal = signal({
    id: "SIG-POPULATION",
    title: "Evaluation population differs from intended prediction population",
    fieldId: "field-population",
    questionId: "Q-POPULATION",
    scope: "Synthetic target · held-out evaluation",
    condition: "The final evaluation and intended prediction populations are distinct.",
    why: "Direct performance evidence for the intended population is not available.",
  });
  const resultSignal = signal({
    id: "SIG-RESULT",
    title: "One evaluated method detects no positive cases",
    fieldId: "field-result",
    questionId: "Q-RESULT",
    scope: "Changed target · Changed method",
    condition: "Positive cases are present, but the evaluated method predicts no positive cases.",
    why: "The aggregate result does not describe positive-case detection behaviour.",
  });
  const forward = buildFindingsPresentation(syntheticLayer([resultSignal, evidenceGap(), populationSignal]));
  const reverse = buildFindingsPresentation(syntheticLayer([populationSignal, evidenceGap(), resultSignal]));

  assert.equal(FINDINGS_PRESENTATION_CONTRACT_VERSION, "1.1.0");
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.signals.map((item) => item.signal_id), ["SIG-POPULATION", "SIG-RESULT"]);
  assert.equal(forward.evidence_gaps.length, 1);
  assert.equal(forward.signals[0].title, populationSignal.presentation.title);
  assert.equal(forward.signals[0].primary_scope, "Synthetic target · held-out evaluation");
  assert.deepEqual(forward.signals[0].trail_entry, { type: "finding", id: populationSignal.finding_id });
  assert.doesNotMatch(JSON.stringify(forward.signals.map(({ evidence_ids, related_check_execution_ids, ...item }) => item)), /CHK-|EXEC-|E-/);
});

test("compatible executions aggregate into one canonical top-level Signal card", () => {
  const first = signal({
    id: "SIG-PREPROCESSING",
    title: "Held-out inputs participate in preprocessing fit",
    fieldId: "field-result",
    questionId: "Q-RESULT",
    scope: "Target A · modelling context",
    condition: "A fitted transformation uses held-out inputs.",
    why: "The evaluation transformation is influenced by the evaluation population.",
  });
  const second = structuredClone(first);
  second.finding_id = "SIG-PREPROCESSING-DUPLICATE-REFERENCE";
  second.signal_id = "SIG-PREPROCESSING";
  second.presentation.primary_scope = "Target B · modelling context";
  second.related_check_execution_ids = ["EXEC-PREPROCESSING-B"];

  const projection = buildFindingsPresentation(syntheticLayer([second, first]));
  assert.equal(projection.signals.length, 1);
  assert.equal(projection.signals[0].signal_id, "SIG-PREPROCESSING");
  assert.ok(projection.signals[0].secondary_scopes.includes("Target B · modelling context"));
  assert.equal(projection.signals[0].related_check_execution_ids.length, 2);
});

test("Evidence Gaps remain distinct and do not imply an adverse project condition", () => {
  const projection = buildFindingsPresentation(syntheticLayer([evidenceGap()]));
  assert.equal(projection.signals.length, 0);
  assert.equal(projection.evidence_gaps.length, 1);
  assert.equal(projection.evidence_gaps[0].title, "Environment and configuration identity is incomplete");
  assert.equal(projection.evidence_gaps[0].primary_scope, "Reproducibility");
  assert.match(projection.evidence_gaps[0].why_it_matters, /cannot establish the complete execution environment/i);
  assert.doesNotMatch(projection.evidence_gaps[0].title, /CHK-|predicate|question/i);
});

test("the Findings source leads with attention, keeps checks secondary, and exposes no primary-card internals", async () => {
  const source = await fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8");
  assert.ok(source.indexOf("What needs attention") < source.indexOf("Checks performed"));
  assert.match(source, /<details className="checks-performed">/);
  assert.match(source, /Why this matters/);
  assert.match(source, /View missing evidence/);
  assert.match(source, /View trail/);
  assert.match(source, /No material project condition was detected by the implemented checks/);
  const card = source.match(/function SupervisorFindingCard[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(card, /check_id|execution_id|evidence_ids|finding_id|signal_id|CHK-/);
});

test("persisted R1 projects the current Evidence Gap cleanly while successful checks remain verification detail", async () => {
  const record = JSON.parse(await fs.readFile(new URL("../storage/projects/PRJ-1D50CE481C/record.json", import.meta.url), "utf8"));
  const layer = buildSignalsLayer(record);
  const projection = buildFindingsPresentation(layer);
  assert.equal(layer.provider_calls, 0);
  assert.equal(projection.signals.length, layer.finding_breakdown.signals);
  assert.equal(projection.evidence_gaps.length, layer.finding_breakdown.evidence_gaps);
  assert.ok(projection.evidence_gaps.length >= 1);
  assert.ok(projection.evidence_gaps.every((gap) => gap.title && gap.condition_summary && gap.why_it_matters && gap.trail_entry.id));
  assert.ok(layer.checks.some((check) => check.result === CHECK_RESULTS.ABSENT));
  assert.ok(layer.checks.filter((check) => check.result === CHECK_RESULTS.ABSENT).every((check) => check.finding_ids.length === 0));
});
