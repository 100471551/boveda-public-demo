import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectEvidence, contentSnapshot } from "../engine/inventory.mjs";
import { analyseProject } from "../engine/audit.mjs";
import { sourceMatchesAudit } from "../engine/audit-freshness.mjs";
import { emptyReconstruction } from "../engine/contract.mjs";
import { attemptFailure, diagnosticsForRecord } from "../engine/diagnostics.mjs";
import { PHASE_ONE_SEMANTIC_CONTRACT, PHASE_TWO_SEMANTIC_CONTRACT, PHASE_THREE_SEMANTIC_CONTRACT, PHASE_FOUR_SEMANTIC_CONTRACT, SUPERVISORY_SEMANTIC_CONTRACT, reconstruct } from "../engine/reconstruct.mjs";
import { renderReport } from "../engine/report.mjs";
import { validateReconstruction } from "../engine/validate.mjs";
import { importPreservedAudits, listProjects } from "../engine/persistence.mjs";
import { legacyAuditsForProject, legacyReportPath } from "../engine/legacy-audits.mjs";
import { formatCompactCount, formatCountValue, formatMetricValue, formatSampleDetail, formatSampleNumber, formatSupervisorCopy, formatSupervisorSummary } from "../src/format-display.mjs";
import { canonicalSupervisorProjectTitle, canonicalSupervisorProjectTitleForRecord, displayProjectTitle, humanizeRootFolderName, rootFolderName } from "../src/project-display.mjs";
import { POPULATION_DOT_COUNT, populationStageDots } from "../src/population-funnel.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-v090-"));
  await fs.writeFile(path.join(root, "README.md"), "# Sample project\n\nThis project predicts service delays so operating teams can plan staffing from recorded requests.\n");
  await fs.writeFile(path.join(root, "data.csv"), "id,target\n1,yes\n2,no\n");
  await fs.writeFile(path.join(root, "analysis.ipynb"), JSON.stringify({ cells: [{ cell_type: "code", source: ["print('Accuracy 0.62')"], outputs: [{ output_type: "stream", text: ["Accuracy 0.62\n"] }] }] }));
  return root;
}

const diagnosticEvidence = [{ id: "E-SYSTEM-PATH", path: ".", kind: "project_identity", epistemic: "OBSERVED", excerpt: "Imported directory name: Example", sha256: "source-hash" }];

test("Phase 1 gives each Overview field one explicit semantic question without changing the contract", () => {
  const required = {
    "identity.description": ["what the project does", "20–35 words"],
    "purpose_scope.summary": ["institutional or operational problem", "analytical approach", "population or scope", "intended role or use", "40–65 words", "normally two concise sentences"],
    "purpose_scope.purpose": ["problem or capability", "10–20 words"],
    "purpose_scope.task": ["analytical or modelling operation", "10–20 words"],
    "purpose_scope.target_outcome": ["form of that output", "10–20 words"],
    "purpose_scope.unit": ["main entity", "3–10 words"],
    "purpose_scope.population_scope": ["population or universe", "10–20 words"],
    "purpose_scope.intended_use": ["intended to be used", "10–20 words"],
  };
  for (const [field, expectations] of Object.entries(required)) {
    assert.equal(PHASE_ONE_SEMANTIC_CONTRACT.match(new RegExp(`- ${field} \\(`, "g"))?.length, 1);
    for (const expectation of expectations) assert.match(PHASE_ONE_SEMANTIC_CONTRACT, new RegExp(expectation));
  }
  assert.match(PHASE_ONE_SEMANTIC_CONTRACT, /leave the field unresolved when its cited evidence is insufficient/);
  assert.match(PHASE_ONE_SEMANTIC_CONTRACT, /Never present intended use as demonstrated effect/);
  assert.match(PHASE_ONE_SEMANTIC_CONTRACT, /Do not concatenate or unnecessarily repeat the neighboring fields/);
});

test("Phase 2 defines a paired evidentiary boundary and disciplined confidence explanation", () => {
  const required = {
    "results_evaluation.known_limitation": ["most material limitation", "restricts interpretation", "15–25 words"],
    "results_evaluation.establishes": ["strongest exact conclusion", "evaluation evidence", "15–25 words"],
    "results_evaluation.does_not_establish": ["nearest important stronger conclusion", "does not support", "15–25 words"],
    "confidence.explanation": ["quality or type of evidence", "displayed claim", "15–25 words"],
  };
  for (const [field, expectations] of Object.entries(required)) {
    assert.equal(PHASE_TWO_SEMANTIC_CONTRACT.match(new RegExp(`- ${field} \\(`, "g"))?.length, 1);
    for (const expectation of expectations) assert.match(PHASE_TWO_SEMANTIC_CONTRACT, new RegExp(expectation));
  }
  assert.match(PHASE_TWO_SEMANTIC_CONTRACT, /form a coherent pair around the same evidentiary boundary/);
  assert.match(PHASE_TWO_SEMANTIC_CONTRACT, /Never infer causal impact, operational effectiveness, fairness, generalization, or production readiness/);
  assert.match(PHASE_TWO_SEMANTIC_CONTRACT, /leave a field unresolved when evidence is insufficient/);
  assert.match(SUPERVISORY_SEMANTIC_CONTRACT, new RegExp(PHASE_ONE_SEMANTIC_CONTRACT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(SUPERVISORY_SEMANTIC_CONTRACT, new RegExp(PHASE_TWO_SEMANTIC_CONTRACT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Phase 3 preserves the complete semantic chain for evaluated results", () => {
  const required = {
    "results_evaluation.evaluation_design": ["evaluation type", "split", "15–30 words", "displayed primary result"],
    "results_evaluation.primary_result": ["most material supported result", "principal evaluated analytical claim", "method, task_target, and evaluation_context", "5–15 words"],
    "results_evaluation.other_material_result": ["single secondary result", "relationship to the primary", "10–20 words", "Leave it unresolved"],
  };
  for (const [field, expectations] of Object.entries(required)) {
    assert.equal(PHASE_THREE_SEMANTIC_CONTRACT.match(new RegExp(`- ${field}(?: \\(|:)`, "g"))?.length, 1);
    for (const expectation of expectations) assert.match(PHASE_THREE_SEMANTIC_CONTRACT, new RegExp(expectation));
  }
  assert.match(PHASE_THREE_SEMANTIC_CONTRACT, /result and metric ↔ model or method ↔ target or outcome ↔ evaluation sample ↔ evaluation design/);
  assert.match(PHASE_THREE_SEMANTIC_CONTRACT, /different population, split, target, model, workstream, or analytical stage/);
  assert.match(PHASE_THREE_SEMANTIC_CONTRACT, /executable evaluation logic and evidence that evaluation actually ran/);
  assert.match(PHASE_THREE_SEMANTIC_CONTRACT, /do not collapse unrelated evaluations into one context/i);
  assert.match(PHASE_THREE_SEMANTIC_CONTRACT, /must describe only the primary result's evaluation design/);
  assert.match(PHASE_THREE_SEMANTIC_CONTRACT, /never include evaluation procedures from another workstream or secondary result/);
  assert.match(PHASE_THREE_SEMANTIC_CONTRACT, /different workstream may appear only in its own material_results evaluation_context/);
  assert.match(SUPERVISORY_SEMANTIC_CONTRACT, new RegExp(PHASE_THREE_SEMANTIC_CONTRACT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Phase 4 separates analytical data, population, sample, unit, and period roles", () => {
  const required = {
    "data.summary": ["main sources", "material preparation or selection", "analytical role", "20–35 words"],
    "data.data_sources": ["actual source systems or datasets", "materially used", "5–20 words"],
    "data.unit_of_observation": ["entity, event, or time unit", "one row or observation", "5–15 words"],
    "data.period": ["temporal coverage actually used", "modelling or evaluation-stage distinction", "5–15 words"],
    "data.population_filters": ["materially determine which observations enter", "10–25 words"],
    "data.population_limitation": ["single most material selection or exclusion", "boundary on interpretation or generalization", "15–25 words"],
  };
  for (const [field, expectations] of Object.entries(required)) {
    assert.equal(PHASE_FOUR_SEMANTIC_CONTRACT.match(new RegExp(`- ${field} \\(`, "g"))?.length, 1);
    for (const expectation of expectations) assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, new RegExp(expectation));
  }
  for (const role of ["source data", "prepared analytical data", "model population", "training sample", "evaluation sample", "prediction or decision population", "unit of observation", "prediction unit"]) {
    assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, new RegExp(role));
  }
  assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, /grounded number or dataset name is still wrong when assigned to the wrong analytical role/);
  assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, /Distinguish dataset coverage from the period actually used for modelling or evaluation/);
  assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, /Do not use a source or prepared-data count as a training or evaluation sample/);
  assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, /samples\.source_data represents the broadest defensible project population/);
  assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, /Never promote a downstream analytical count solely because it is larger/);
  assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, /keep those populations in their distinct lineage roles/);
  assert.match(PHASE_FOUR_SEMANTIC_CONTRACT, /Preserve not_established or execution_required/);
  assert.match(SUPERVISORY_SEMANTIC_CONTRACT, new RegExp(PHASE_FOUR_SEMANTIC_CONTRACT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("R1–R3 are the active development corpus and R4–R6 remain opt-in controls", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("../validation/corpus.json", import.meta.url), "utf8"));
  const harness = await fs.readFile(new URL("../scripts/validate-corpus.mjs", import.meta.url), "utf8");
  assert.deepEqual(manifest.active_development_cases, ["R1", "R2", "R3"]);
  assert.deepEqual(manifest.control_cases, ["R4", "R5", "R6"]);
  assert.deepEqual(manifest.cases.map((item) => item.case_id), ["R1", "R2", "R3", "R4", "R5", "R6"]);
  assert.match(harness, /includeControls \? manifest\.cases : manifest\.cases\.filter/);
  assert.match(harness, /process\.argv\.includes\("--include-controls"\)/);
  assert.match(harness, /diagnostics preserved · no automatic rerun/);
  assert.match(harness, /error\?\.diagnostics \|\| null/);
});

function providerCandidate(reconstruction, attempt, totalTokens = 100) {
  return {
    reconstruction: structuredClone(reconstruction),
    provider_call_started: true,
    provider_duration_ms: attempt * 10,
    provider_request_id: `request-${attempt}`,
    response_id: `response-${attempt}`,
    response_status: "completed",
    http_status: 200,
    usage: {
      input_tokens: totalTokens - 20,
      input_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 },
      output_tokens: 20,
      output_tokens_details: { reasoning_tokens: 5 },
      total_tokens: totalTokens,
    },
  };
}

function providerRepair(repairs, attempt, totalTokens = 40) {
  const generated = providerCandidate(emptyReconstruction("Repair metadata"), attempt, totalTokens);
  delete generated.reconstruction;
  return { ...generated, repair_payload: { repairs: structuredClone(repairs) } };
}

test("evidence collection is bounded, inspectable, and read-only", async () => {
  const root = await fixture();
  const before = await contentSnapshot(root);
  const collected = await collectEvidence(root);
  const after = await contentSnapshot(root);
  assert.equal(before, after);
  assert.equal(collected.root, await fs.realpath(root));
  assert.ok(collected.evidence.some((item) => item.excerpt.includes("PERSISTED OUTPUT")));
  const notebook = collected.evidence.find((item) => item.path === "analysis.ipynb");
  assert.match(notebook.excerpt, /^\[CODE FOR OUTPUT\][\s\S]*\[PERSISTED OUTPUT\]/);
  assert.ok(collected.evidence.some((item) => item.excerpt.includes("ROW COUNT INCLUDING HEADER: 3")));
  assert.ok(collected.evidence.every((item) => item.id && item.path && item.sha256));
});

test("large source trees retain evaluation, model, pipeline, output, and reproducible-report evidence before test fixtures", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-evidence-priority-"));
  await fs.mkdir(path.join(root, "quality"), { recursive: true });
  await fs.mkdir(path.join(root, "pipeline"), { recursive: true });
  await fs.mkdir(path.join(root, "preparation"), { recursive: true });
  await fs.mkdir(path.join(root, "reports"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  const material = "supported analytical evidence\n".repeat(350);
  await fs.writeFile(path.join(root, "README.md"), `# Harbour demand study\n\n${material}`);
  await fs.writeFile(path.join(root, "quality", "evaluate-forecast.py"), material);
  await fs.writeFile(path.join(root, "pipeline", "train-model.R"), material);
  await fs.writeFile(path.join(root, "pipeline", "export-predictions.R"), material);
  await fs.writeFile(path.join(root, "preparation", "construct-dataset.py"), material);
  await fs.writeFile(path.join(root, "reports", "performance.qmd"), material);
  await fs.writeFile(path.join(root, "reports", "model-card.Rmd"), material);
  for (let index = 0; index < 70; index += 1) {
    await fs.writeFile(path.join(root, "tests", `test-fixture-${String(index).padStart(2, "0")}.py`), material);
  }

  const collected = await collectEvidence(root);
  const paths = new Set(collected.evidence.map((item) => item.path));
  for (const expected of [
    "quality/evaluate-forecast.py",
    "pipeline/train-model.R",
    "pipeline/export-predictions.R",
    "preparation/construct-dataset.py",
    "reports/performance.qmd",
    "reports/model-card.Rmd",
  ]) assert.ok(paths.has(expected), `${expected} should be retained inside the bounded pack`);
  assert.ok(collected.inventory.bounded_characters <= 320_000);
  assert.ok([...paths].filter((item) => item.startsWith("tests/")).length < 30);
});

test("fallback analysis preserves project identity, reanalysis identity, and project bytes", async () => {
  const root = await fixture();
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const first = await analyseProject(root, { persist: false });
  const second = await analyseProject(root, { persist: false });
  if (previous) process.env.OPENAI_API_KEY = previous;
  assert.equal(first.project_id, second.project_id);
  assert.notEqual(first.audit_id, second.audit_id);
  assert.equal(first.source_project.content_snapshot_before, first.source_project.content_snapshot_after);
  assert.equal(first.provider.generation_mode, "deterministic_fallback");
  assert.equal(first.validation.status, "VALID");
  assert.equal(first.product_version, "0.20.13");
  assert.equal(first.diagnostics.availability, "complete");
  assert.equal(first.diagnostics.llm.provider_call_count, 0);
  assert.equal(first.diagnostics.llm.paid_model_activity, false);
  assert.deepEqual(first.diagnostics.stages.map((stage) => stage.stage), ["source_resolution", "evidence_collection", "llm_reconstruction", "source_integrity", "final_record"]);
});

test("successful model activity records an accepted attempt, usage, and timing", async () => {
  const candidate = emptyReconstruction("Example");
  const result = await reconstruct({ projectRoot: "/tmp/Example", evidence: diagnosticEvidence, allowFallback: false, providerCall: async () => providerCandidate(candidate, 1, 120) });
  assert.equal(result.provider.generation_mode, "llm");
  assert.equal(result.diagnostics.result, "accepted");
  assert.equal(result.diagnostics.attempt_count, 1);
  assert.equal(result.diagnostics.provider_call_count, 1);
  assert.equal(result.diagnostics.paid_model_activity, true);
  assert.equal(result.diagnostics.total_usage.total_tokens, 120);
  assert.equal(result.diagnostics.attempts[0].outcome, "accepted");
  assert.equal(result.diagnostics.attempts[0].validation.status, "VALID");
});

test("grounding rejection retains first-attempt usage before a successful retry", async () => {
  const invalid = emptyReconstruction("Example");
  invalid.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-SYSTEM-PATH"] };
  const valid = emptyReconstruction("Example");
  let calls = 0;
  const corrections = [];
  const result = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence: diagnosticEvidence,
    allowFallback: false,
    providerCall: async (_evidence, _model, correction) => {
      calls += 1;
      corrections.push(correction);
      return providerCandidate(calls === 1 ? invalid : valid, calls, calls === 1 ? 140 : 80);
    },
  });
  assert.equal(result.diagnostics.attempt_count, 2);
  assert.equal(result.diagnostics.total_usage.total_tokens, 220);
  assert.equal(result.diagnostics.attempts[0].outcome, "rejected");
  assert.equal(result.diagnostics.attempts[0].failure.stage, "grounding");
  assert.match(result.diagnostics.attempts[0].failure.message, /numeric value 42/);
  assert.deepEqual(result.diagnostics.attempts[0].validation.rejected_candidate, invalid);
  assert.deepEqual(result.diagnostics.attempts[0].validation.field_evidence_ids["record.samples.source_data"], ["E-SYSTEM-PATH"]);
  assert.equal(result.diagnostics.attempts[1].validation.rejected_candidate, undefined);
  assert.equal(result.diagnostics.attempts[0].retry_scheduled, true);
  assert.deepEqual(result.diagnostics.attempts[0].retry.correction_errors, result.diagnostics.attempts[0].validation.errors);
  assert.equal(result.diagnostics.attempts[1].outcome, "accepted");
  assert.equal(result.diagnostics.attempts[1].correction_applied, true);
  assert.equal(corrections[0], "");
  assert.match(corrections[1], /numeric value 42/);
});

test("a localized repair fixes one field while preserving unrelated content and its evidence trail", async () => {
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-DATA", path: "data.csv", kind: "data_profile", epistemic: "OBSERVED", excerpt: "The source contains 43 records.", sha256: "data" },
    { id: "E-SUMMARY", path: "README.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "This project reviews supported service records.", sha256: "summary" },
  ];
  const candidate = emptyReconstruction("Example");
  candidate.purpose_scope.summary = { state: "established", value: "This project reviews supported service records.", epistemic: "OBSERVED", evidence_ids: ["E-SUMMARY"] };
  candidate.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] };
  const preservedSummary = structuredClone(candidate.purpose_scope.summary);
  let fullCalls = 0;
  let repairCalls = 0;

  const result = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence,
    allowFallback: false,
    providerCall: async () => providerCandidate(candidate, ++fullCalls, 140),
    repairProviderCall: async ({ localization }) => {
      repairCalls += 1;
      assert.deepEqual(localization.fields.map((field) => field.path), ["record.samples.source_data"]);
      assert.deepEqual(localization.evidence.map((item) => item.id), ["E-DATA"]);
      return providerRepair({
        "record.samples.source_data": { state: "established", display: "43 records", count: 43, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] },
      }, 2, 35);
    },
  });

  assert.equal(fullCalls, 1);
  assert.equal(repairCalls, 1);
  assert.equal(result.validation.status, "VALID");
  assert.equal(result.reconstruction.samples.source_data.count, 43);
  assert.deepEqual(result.reconstruction.samples.source_data.evidence_ids, ["E-DATA"]);
  assert.deepEqual(result.reconstruction.purpose_scope.summary, preservedSummary);
  assert.deepEqual(result.diagnostics.attempts.map((attempt) => attempt.operation), ["full_reconstruction", "localized_repair"]);
  assert.equal(result.provider.localized_repair.unrelated_fields_preserved, true);
  assert.equal(result.diagnostics.total_usage.total_tokens, 175);
});

test("several independent field failures are repaired together within their cited evidence", async () => {
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-DATA", path: "data.csv", kind: "data_profile", epistemic: "OBSERVED", excerpt: "The source contains 43 records.", sha256: "data" },
    { id: "E-PERIOD", path: "README.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "The documented observation period is 2024.", sha256: "period" },
  ];
  const candidate = emptyReconstruction("Example");
  candidate.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] };
  candidate.data.period = { state: "established", value: "Observed during 2025.", epistemic: "OBSERVED", evidence_ids: ["E-PERIOD"] };
  let repairScope;

  const result = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence,
    allowFallback: false,
    providerCall: async () => providerCandidate(candidate, 1, 160),
    repairProviderCall: async ({ localization }) => {
      repairScope = localization;
      return providerRepair({
        "record.samples.source_data": { state: "established", display: "43 records", count: 43, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] },
        "record.data.period": { state: "established", value: "Observed during 2024.", epistemic: "OBSERVED", evidence_ids: ["E-PERIOD"] },
      }, 2, 45);
    },
  });

  assert.deepEqual(new Set(repairScope.fields.map((field) => field.path)), new Set(["record.samples.source_data", "record.data.period"]));
  assert.deepEqual(new Set(repairScope.evidence.map((item) => item.id)), new Set(["E-DATA", "E-PERIOD"]));
  assert.equal(result.reconstruction.samples.source_data.count, 43);
  assert.equal(result.reconstruction.data.period.value, "Observed during 2024.");
  assert.equal(result.provider.localized_repair.status, "accepted");
});

test("exhausted localized repairs preserve the record and mark only the compatible failed field unresolved", async () => {
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-DATA", path: "data.csv", kind: "data_profile", epistemic: "OBSERVED", excerpt: "The source contains 43 records.", sha256: "data" },
  ];
  const candidate = emptyReconstruction("Example");
  candidate.identity.description = { state: "established", value: "A stable description without quantitative claims.", epistemic: "OBSERVED", evidence_ids: ["E-SYSTEM-PATH"] };
  candidate.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] };
  const description = structuredClone(candidate.identity.description);
  let repairs = 0;

  const result = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence,
    providerCall: async () => providerCandidate(candidate, 1, 130),
    repairProviderCall: async () => providerRepair({
      "record.samples.source_data": { state: "established", display: "44 records", count: 44, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] },
    }, ++repairs + 1, 30),
  });

  assert.equal(repairs, 2);
  assert.equal(result.provider.generation_mode, "llm");
  assert.equal(result.provider.localized_repair.status, "unresolved");
  assert.equal(result.reconstruction.samples.source_data.state, "not_established");
  assert.equal(result.reconstruction.samples.source_data.count, null);
  assert.deepEqual(result.reconstruction.samples.source_data.evidence_ids, []);
  assert.deepEqual(result.reconstruction.identity.description, description);
  assert.equal(result.validation.status, "VALID");
  assert.deepEqual(result.diagnostics.attempts.map((attempt) => attempt.outcome), ["rejected", "rejected", "rejected"]);
});

test("localized repair exhaustion preserves fields that became valid and unresolved only the remaining failure", async () => {
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-DATA", path: "observations.csv", kind: "data_profile", epistemic: "OBSERVED", excerpt: "The source contains 43 records.", sha256: "data" },
    { id: "E-PERIOD", path: "study.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "The documented observation period is 2024.", sha256: "period" },
  ];
  const candidate = emptyReconstruction("Example");
  candidate.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] };
  candidate.data.period = { state: "established", value: "Observed during 2025.", epistemic: "OBSERVED", evidence_ids: ["E-PERIOD"] };
  const repairScopes = [];

  const result = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence,
    providerCall: async () => providerCandidate(candidate, 1, 130),
    repairProviderCall: async ({ localization }) => {
      repairScopes.push(localization.fields.map((field) => field.path));
      if (repairScopes.length === 1) return providerRepair({
        "record.samples.source_data": { state: "established", display: "44 records", count: 44, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] },
        "record.data.period": { state: "established", value: "Observed during 2024.", epistemic: "OBSERVED", evidence_ids: ["E-PERIOD"] },
      }, 2, 30);
      return providerRepair({
        "record.samples.source_data": { state: "established", display: "45 records", count: 45, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] },
      }, 3, 30);
    },
  });

  assert.deepEqual(repairScopes, [
    ["record.samples.source_data", "record.data.period"],
    ["record.samples.source_data"],
  ]);
  assert.equal(result.provider.localized_repair.status, "unresolved");
  assert.deepEqual(new Set(result.provider.localized_repair.fields), new Set(["record.samples.source_data", "record.data.period"]));
  assert.equal(result.reconstruction.samples.source_data.state, "not_established");
  assert.equal(result.reconstruction.data.period.value, "Observed during 2024.");
  assert.deepEqual(result.reconstruction.data.period.evidence_ids, ["E-PERIOD"]);
  assert.equal(result.validation.status, "VALID");
});

test("a non-localizable validation failure retains the full reconstruction retry path", async () => {
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-METRIC", path: "metrics.json", kind: "persisted_output", epistemic: "OBSERVED", excerpt: "Held-out score: 0.62", sha256: "metric" },
  ];
  const invalid = emptyReconstruction("Example");
  invalid.results_evaluation.primary_result = { state: "established", display_value: "0.62", metric: "", method: "Model", task_target: "Target", evaluation_context: "Held-out", epistemic: "OBSERVED", evidence_ids: ["E-METRIC"] };
  const valid = emptyReconstruction("Example");
  let fullCalls = 0;
  let repairCalls = 0;

  const result = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence,
    allowFallback: false,
    providerCall: async () => providerCandidate(++fullCalls === 1 ? invalid : valid, fullCalls, 100),
    repairProviderCall: async () => {
      repairCalls += 1;
      throw new Error("Localized repair must not run for a global validation failure.");
    },
  });

  assert.equal(fullCalls, 2);
  assert.equal(repairCalls, 0);
  assert.deepEqual(result.diagnostics.attempts.map((attempt) => attempt.operation), ["full_reconstruction", "full_reconstruction"]);
  assert.equal(result.diagnostics.attempts[0].retry.reason, "validation_rejection");
});

test("localized repair payloads cannot mutate an already validated field", async () => {
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-DATA", path: "data.csv", kind: "data_profile", epistemic: "OBSERVED", excerpt: "The source contains 43 records.", sha256: "data" },
  ];
  const candidate = emptyReconstruction("Example");
  candidate.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] };
  const identityBefore = structuredClone(candidate.identity);
  let repairs = 0;

  const result = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence,
    allowFallback: false,
    providerCall: async () => providerCandidate(candidate, 1, 120),
    repairProviderCall: async () => {
      repairs += 1;
      const fields = {
        "record.samples.source_data": { state: "established", display: "43 records", count: 43, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] },
      };
      if (repairs === 1) fields["record.identity.description"] = { state: "established", value: "Unauthorized mutation", epistemic: "OBSERVED", evidence_ids: ["E-SYSTEM-PATH"] };
      return providerRepair(fields, repairs + 1, 25);
    },
  });

  assert.equal(repairs, 2);
  assert.equal(result.diagnostics.attempts[1].failure.stage, "structured_output");
  assert.deepEqual(result.reconstruction.identity, identityBefore);
  assert.equal(result.reconstruction.samples.source_data.count, 43);
});

test("fallback retains all paid rejected attempts and their aggregate usage", async () => {
  const invalid = emptyReconstruction("Example");
  invalid.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-SYSTEM-PATH"] };
  let calls = 0;
  const result = await reconstruct({ projectRoot: "/tmp/Example", evidence: diagnosticEvidence, providerCall: async () => providerCandidate(invalid, ++calls, 150) });
  assert.equal(result.provider.generation_mode, "deterministic_fallback");
  assert.equal(result.provider.rejected_candidates.length, 3);
  assert.equal(result.diagnostics.result, "fallback");
  assert.equal(result.diagnostics.attempt_count, 3);
  assert.equal(result.diagnostics.paid_model_activity, true);
  assert.equal(result.diagnostics.total_usage.total_tokens, 450);
  assert.equal(result.diagnostics.fallback.followed_paid_model_activity, true);
  assert.deepEqual(result.diagnostics.attempts.map((attempt) => attempt.outcome), ["rejected", "rejected", "rejected"]);
  assert.equal(result.diagnostics.attempts[2].retry.scheduled, false);
  assert.equal(result.diagnostics.attempts[2].retry.reason, "maximum_attempts_reached");
});

test("structured-output and provider failures are distinguishable without leaking credentials", async () => {
  const structured = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence: diagnosticEvidence,
    providerCall: async () => { throw attemptFailure("structured_output", "Invalid JSON with sk-secret-value", { provider_call_started: true, response_id: "response-paid", usage: { total_tokens: 90 } }); },
  });
  assert.equal(structured.diagnostics.attempts[0].failure.stage, "structured_output");
  assert.equal(structured.diagnostics.paid_model_activity, true);
  assert.doesNotMatch(JSON.stringify(structured.diagnostics), /sk-secret-value/);

  const provider = await reconstruct({
    projectRoot: "/tmp/Example",
    evidence: diagnosticEvidence,
    providerCall: async () => { throw attemptFailure("provider", "Connection reset", { provider_call_started: true, provider_request_id: "request-unknown" }); },
  });
  assert.equal(provider.diagnostics.attempts[0].failure.stage, "provider");
  assert.equal(provider.diagnostics.paid_model_activity, null);
  assert.equal(provider.diagnostics.fallback.followed_model_activity, true);
});

test("grounding rejects dangling evidence and unsupported numeric claims", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.samples.source_data = { state: "established", display: "42", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-README"] };
  const evidence = [{ id: "E-SYSTEM-PATH", path: ".", kind: "project_identity", epistemic: "OBSERVED", excerpt: "Imported directory name: Example", sha256: "x" }, { id: "E-README", path: "README.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "There are several records.", sha256: "y" }];
  const invalid = validateReconstruction(reconstruction, evidence);
  assert.equal(invalid.status, "INVALID");
  assert.ok(invalid.errors.some((error) => error.includes("numeric value 42")));
  reconstruction.samples.source_data.evidence_ids = ["E-MISSING"];
  assert.ok(validateReconstruction(reconstruction, evidence).errors.some((error) => error.includes("unknown evidence reference")));
});

test("number-like identifiers are not treated as quantities", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.identity.description = { state: "established", value: "Routes NYC 311 and COVID-19 complaints for review.", epistemic: "OBSERVED", evidence_ids: ["E-DOC"] };
  const evidence = [...diagnosticEvidence, { id: "E-DOC", path: "README.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "Routes municipal service and pandemic complaints for review.", sha256: "doc" }];
  assert.equal(validateReconstruction(reconstruction, evidence).status, "VALID");

  reconstruction.samples.source_data = { state: "established", display: "NYC 311 service requests", count: null, unit: "service requests", epistemic: "OBSERVED", evidence_ids: ["E-DOC"] };
  assert.ok(validateReconstruction(reconstruction, evidence).errors.some((error) => error.includes("no numeric quantity")));
});

test("percentage words and decimals are equivalent only in compatible split evidence", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.results_evaluation.evaluation_design = { state: "established", value: "A 90 percent training share was configured.", epistemic: "OBSERVED", evidence_ids: ["E-SPLIT"] };
  const supported = [...diagnosticEvidence, { id: "E-SPLIT", path: "params.yaml", kind: "configuration", epistemic: "OBSERVED", excerpt: "split_prop: 0.9", sha256: "split" }];
  assert.equal(validateReconstruction(reconstruction, supported).status, "VALID");

  const unrelated = [...diagnosticEvidence, { id: "E-SPLIT", path: "metrics.txt", kind: "persisted_output", epistemic: "OBSERVED", excerpt: "Training-label accuracy was 0.9 on an unrelated metric.", sha256: "metric" }];
  assert.ok(validateReconstruction(reconstruction, unrelated).errors.some((error) => error.includes("numeric value 90%")));
});

test("named and numeric date forms ground the same period components", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.data.period = { state: "established", value: "Complaints through July 15, 2022; trend records before August 1, 2022.", epistemic: "OBSERVED", evidence_ids: ["E-DATE"] };
  const supported = [...diagnosticEvidence, { id: "E-DATE", path: "dates.py", kind: "code", epistemic: "OBSERVED", excerpt: "Collect through 07/15/2022.\ntrend = trend[trend.date < '2022-08-01']", sha256: "date" }];
  assert.equal(validateReconstruction(reconstruction, supported).status, "VALID");

  const unrelated = [...diagnosticEvidence, { id: "E-DATE", path: "build.txt", kind: "metadata", epistemic: "OBSERVED", excerpt: "Build 15 targets release 2022. Batch 1 is retained.", sha256: "unrelated-date" }];
  assert.ok(validateReconstruction(reconstruction, unrelated).errors.some((error) => error.includes("numeric value 15")));
});

test("explicit label lists and header-marked rows support only their deterministic counts", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.purpose_scope.target_outcome = { state: "established", value: "13 concern labels", epistemic: "DERIVED", evidence_ids: ["E-LABELS"] };
  reconstruction.data.summary = { state: "established", value: "The data contain 3,121 labeled narratives.", epistemic: "DERIVED", evidence_ids: ["E-ROWS"] };
  const labels = Array.from({ length: 13 }, (_, index) => `'Label${index + 1}'`).join(", ");
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-LABELS", path: "model.py", kind: "code", epistemic: "OBSERVED", excerpt: `labels = [${labels}]`, sha256: "labels" },
    { id: "E-ROWS", path: "data.csv", kind: "data_profile", epistemic: "OBSERVED", excerpt: "[DETERMINISTIC ROW COUNT INCLUDING HEADER: 3122]", sha256: "rows" },
  ];
  assert.equal(validateReconstruction(reconstruction, evidence).status, "VALID");

  reconstruction.purpose_scope.target_outcome.evidence_ids = ["E-UNRELATED"];
  evidence.push({ id: "E-UNRELATED", path: "build.txt", kind: "metadata", epistemic: "OBSERVED", excerpt: `Build number 13.\n${"x".repeat(300)}\nlabels = ['A', 'B']`, sha256: "unrelated" });
  assert.ok(validateReconstruction(reconstruction, evidence).errors.some((error) => error.includes("numeric value 13")));
});

test("an explicit sklearn split and row marker support deterministic train and test sizes", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.samples.model_sample = { state: "established", display: "2,340 labeled narratives", count: 2340, unit: "labeled narratives", epistemic: "DERIVED", evidence_ids: ["E-ROWS", "E-SPLIT"] };
  reconstruction.samples.evaluation_sample = { state: "established", display: "781 labeled narratives", count: 781, unit: "labeled narratives", epistemic: "DERIVED", evidence_ids: ["E-ROWS", "E-SPLIT"] };
  reconstruction.results_evaluation.evaluation_design = { state: "established", value: "A 75/25 train-test split was used.", epistemic: "DERIVED", evidence_ids: ["E-SPLIT"] };
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-ROWS", path: "data.csv", kind: "data_profile", epistemic: "OBSERVED", excerpt: "[DETERMINISTIC ROW COUNT INCLUDING HEADER: 3122]", sha256: "rows" },
    { id: "E-SPLIT", path: "model.py", kind: "code", epistemic: "OBSERVED", excerpt: "test_size = 0.25\ndf_train, df_test = train_test_split(df, test_size=test_size)", sha256: "split" },
  ];
  assert.equal(validateReconstruction(reconstruction, evidence).status, "VALID");

  reconstruction.samples.model_sample.count = 2300;
  reconstruction.samples.model_sample.display = "2,300 labeled narratives";
  assert.ok(validateReconstruction(reconstruction, evidence).errors.some((error) => error.includes("numeric value 2,300")));
});

test("unrelated literals cannot ground sample, split, or currency claims", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.samples.source_data = { state: "established", display: "42 records", count: 42, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-NUMBER"] };
  reconstruction.results_evaluation.evaluation_design = { state: "established", value: "A 75% training split was used.", epistemic: "OBSERVED", evidence_ids: ["E-METRIC"] };
  reconstruction.data.population_filters = { state: "established", value: "Sales below $10,000 were excluded.", epistemic: "OBSERVED", evidence_ids: ["E-THRESHOLD"] };
  const evidence = [
    ...diagnosticEvidence,
    { id: "E-NUMBER", path: "model.txt", kind: "metadata", epistemic: "OBSERVED", excerpt: "The network contains 42 layers.", sha256: "number" },
    { id: "E-METRIC", path: "metrics.txt", kind: "persisted_output", epistemic: "OBSERVED", excerpt: "Training-label accuracy was 0.75.", sha256: "metric" },
    { id: "E-THRESHOLD", path: "ids.txt", kind: "metadata", epistemic: "OBSERVED", excerpt: "An unrelated model threshold is 10000 and identifier 30172130150000 is retained.", sha256: "threshold" },
  ];
  const errors = validateReconstruction(reconstruction, evidence).errors;
  assert.ok(errors.some((error) => error.includes("numeric value 42")));
  assert.ok(errors.some((error) => error.includes("numeric value 75%")));
  assert.ok(errors.some((error) => error.includes("numeric value 10,000")));
});

test("captured R6 candidates retain richer information and pass improved numeric grounding", async () => {
  const record = JSON.parse(await fs.readFile(new URL("../validation/results/v0.9.5-rejected-candidate-2026-08-20/records/R6-run-01.json", import.meta.url), "utf8"));
  const rejected = record.diagnostics.llm.attempts.filter((attempt) => attempt.outcome === "rejected");
  assert.equal(rejected.length, 2);
  assert.equal(validateReconstruction(rejected[0].validation.rejected_candidate, record.evidence).status, "VALID");
  assert.equal(validateReconstruction(rejected[1].validation.rejected_candidate, record.evidence).status, "VALID");
  assert.equal(rejected[0].validation.rejected_candidate.samples.model_sample.count, 2340);
  assert.equal(rejected[0].validation.rejected_candidate.samples.evaluation_sample.count, 781);
});

test("localized repair restores one altered R6 field without changing the preserved candidate", async () => {
  const record = JSON.parse(await fs.readFile(new URL("../validation/results/v0.9.5-rejected-candidate-2026-08-20/records/R6-run-01.json", import.meta.url), "utf8"));
  const preserved = record.diagnostics.llm.attempts.find((attempt) => attempt.outcome === "rejected").validation.rejected_candidate;
  const altered = structuredClone(preserved);
  altered.samples.model_sample = {
    ...altered.samples.model_sample,
    display: "2,341 labeled narratives",
    count: 2341,
  };
  assert.equal(validateReconstruction(altered, record.evidence).status, "INVALID");

  const result = await reconstruct({
    projectRoot: record.source_project.path,
    evidence: record.evidence,
    allowFallback: false,
    providerCall: async () => providerCandidate(altered, 1, 100),
    repairProviderCall: async ({ localization }) => providerRepair({
      "record.samples.model_sample": structuredClone(preserved.samples.model_sample),
    }, 2, 20),
  });

  assert.deepEqual(result.provider.localized_repair.fields, ["record.samples.model_sample"]);
  assert.deepEqual(result.reconstruction, preserved);
  assert.deepEqual(result.reconstruction.samples.model_sample.evidence_ids, preserved.samples.model_sample.evidence_ids);
  assert.equal(result.validation.status, "VALID");
});

test("model and evaluation samples cannot be collapsed into one role", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.samples.model_sample = { state: "established", display: "1,611 records", count: 1611, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-SPLIT"] };
  reconstruction.samples.evaluation_sample = { state: "established", display: "348 records", count: 348, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-SPLIT"] };
  reconstruction.results_evaluation.evaluation_design = { state: "established", value: "1,263 training records and 348 test records.", epistemic: "OBSERVED", evidence_ids: ["E-SPLIT"] };
  const evidence = [{ id: "E-SYSTEM-PATH", path: ".", kind: "project_identity", epistemic: "OBSERVED", excerpt: "Imported directory name: Example", sha256: "x" }, { id: "E-SPLIT", path: "README.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "1,611 records were split into 1,263 training records and 348 test records.", sha256: "y" }];
  const validation = validateReconstruction(reconstruction, evidence);
  assert.equal(validation.status, "INVALID");
  assert.ok(validation.errors.some((error) => error.includes("combine")));
});

test("sample indicators cannot be established from a non-numeric dataset description", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.samples.source_data = { state: "established", display: "Training data is available", count: null, unit: "records", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] };
  const evidence = [{ id: "E-SYSTEM-PATH", path: ".", kind: "project_identity", epistemic: "OBSERVED", excerpt: "Imported directory name: Example", sha256: "x" }, { id: "E-DATA", path: "README.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "Training data is available", sha256: "y" }];
  assert.ok(validateReconstruction(reconstruction, evidence).errors.some((error) => error.includes("no numeric quantity")));
});

test("sample indicators reject split percentages without an absolute count", () => {
  const reconstruction = emptyReconstruction("Example");
  reconstruction.samples.evaluation_sample = { state: "established", display: "Most recent 10%", count: 10, unit: "percent of eligible records", epistemic: "OBSERVED", evidence_ids: ["E-SPLIT"] };
  const evidence = [{ id: "E-SYSTEM-PATH", path: ".", kind: "project_identity", epistemic: "OBSERVED", excerpt: "Imported directory name: Example", sha256: "x" }, { id: "E-SPLIT", path: "README.md", kind: "documentation", epistemic: "OBSERVED", excerpt: "The most recent 10% is held out.", sha256: "y" }];
  assert.ok(validateReconstruction(reconstruction, evidence).errors.some((error) => error.includes("proportion instead of an absolute count")));
});

test("the shared sample objects are the only source for repeated sample displays", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(app, /r\.samples\.evaluation_sample/);
  assert.doesNotMatch(app, /results_evaluation\.evaluation_sample/);
});

test("the sidebar version comes from synchronized package metadata", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const packageMetadata = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lockMetadata = JSON.parse(await fs.readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  const server = await fs.readFile(new URL("../engine/server.mjs", import.meta.url), "utf8");
  const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(packageMetadata.version, "0.20.13");
  assert.equal(lockMetadata.version, packageMetadata.version);
  assert.equal(lockMetadata.packages[""].version, packageMetadata.version);
  assert.match(app, /version as applicationVersion/);
  assert.match(app, /Alpha \{applicationVersion\}/);
  assert.doesNotMatch(app, /Alpha \d+\.\d+\.\d+/);
  assert.match(server, /APPLICATION_VERSION/);
  assert.doesNotMatch(html, /Bóveda Alpha \d+\.\d+\.\d+/);
});

test("project titles fall back to a human-readable root folder without mutating audit identity", () => {
  const sourcePath = "/Projects/R6_public-health_occupational-safety-ppe-concerns";
  assert.equal(rootFolderName(sourcePath), "R6_public-health_occupational-safety-ppe-concerns");
  assert.equal(humanizeRootFolderName(sourcePath), "Public Health Occupational Safety PPE Concerns");
  assert.equal(displayProjectTitle({ state: "not_established", value: "Not established from available evidence." }, sourcePath), "Public Health Occupational Safety PPE Concerns");
  assert.equal(displayProjectTitle({ state: "established", value: "R6_public-health_occupational-safety-ppe-concerns", evidence_ids: ["E-SYSTEM-PATH"] }, sourcePath), "Public Health Occupational Safety PPE Concerns");
  assert.equal(displayProjectTitle({ state: "established", value: "PPE Concern Detection", evidence_ids: ["E-README"] }, sourcePath), "PPE Concern Detection");
});

test("one canonical supervisor title preserves identity before purpose and target", () => {
  const identity = { state: "established", value: "Northstar", evidence_ids: ["E-MANIFEST"] };
  assert.equal(canonicalSupervisorProjectTitle({ taskTarget: "Binary equipment failure for week 8 of 2025", task: "Estimate weekly equipment failure for individual machines.", identityName: identity, sourcePath: "/Projects/example" }), "Northstar");
  assert.equal(canonicalSupervisorProjectTitle({ taskTarget: "Binary equipment failure for week 8 of 2025", task: "Estimate and map equipment failure for each machine using sensor readings.", identityName: { state: "established", value: "Project" }, sourcePath: "/Projects/example" }), "Equipment Failure");
  assert.equal(canonicalSupervisorProjectTitle({ taskTarget: "Three customer retention classes", identityName: { state: "not_established", value: "Not established from available evidence." }, sourcePath: "/Projects/example" }), "Customer Retention");
  assert.doesNotMatch(canonicalSupervisorProjectTitle({ task: "Forecast weekly river levels using gauge readings.", sourcePath: "/Projects/example" }), /\bModel$/);
  assert.equal(identity.value, "Northstar");
});

test("the record-level title helper uses only stable Project Record roles", () => {
  const record = {
    source_project: { path: "/Projects/harbour-watch" },
    reconstruction: {
      identity: { name: { state: "not_established", value: "Not established from available evidence." } },
      purpose_scope: { purpose: { state: "established", value: "Support harbour operations." }, task: { state: "established", value: "Estimate and map vessel congestion for each terminal using arrival records." } },
      results_evaluation: { primary_result: { state: "established", task_target: "Binary terminal congestion for the next week" } },
    },
  };
  assert.equal(canonicalSupervisorProjectTitleForRecord(record), "Vessel Congestion");
});

test("project summaries expose display metadata from preserved records without rewriting them", async () => {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-v097-project-list-"));
  const projectId = "PRJ-DISPLAY";
  const record = {
    project_id: projectId,
    source_project: { path: "/Projects/R1_public-health_housing-chelsea" },
    reconstruction: {
      identity: { name: { state: "not_established", value: "Not established from available evidence.", evidence_ids: [] } },
      purpose_scope: { task: { state: "established", value: "Estimate machine component failure", evidence_ids: ["E-TASK"] } },
      results_evaluation: { primary_result: { state: "established", task_target: "Machine component failure" } },
    },
  };
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  await fs.mkdir(path.join(storage, "projects", projectId), { recursive: true });
  await fs.writeFile(path.join(storage, "projects", projectId, "record.json"), serialized);
  await fs.writeFile(path.join(storage, "registry.json"), JSON.stringify({ schema_version: "boveda-registry-0.9.0", projects: [{ project_id: projectId, name: record.reconstruction.identity.name.value, audit_id: "AUD-DISPLAY", analysed_at: "2026-08-20T00:00:00.000Z", generation_mode: "llm" }] }));
  const [summary] = await listProjects({ storage });
  assert.equal(summary.source_project_path, record.source_project.path);
  assert.deepEqual(summary.identity_name, record.reconstruction.identity.name);
  assert.equal(summary.primary_task_target, "Machine component failure");
  assert.equal(summary.analytical_task, "Estimate machine component failure");
  assert.equal(summary.supervisor_project_title, "Machine Component Failure");
  assert.equal(await fs.readFile(path.join(storage, "projects", projectId, "record.json"), "utf8"), serialized);
});

test("project listing repairs an orphaned persisted audit without rewriting it", async () => {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-v012-orphaned-record-"));
  const source = await fs.readFile(new URL("../preserved-audits/v0.9.2/records/R3.json", import.meta.url));
  const record = JSON.parse(source);
  const recordPath = path.join(storage, "projects", record.project_id, "record.json");
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(recordPath, source);
  await fs.writeFile(path.join(storage, "registry.json"), `${JSON.stringify({ schema_version: "boveda-registry-0.9.0", projects: [] }, null, 2)}\n`);

  const projects = await listProjects({ storage });
  assert.equal(projects.length, 1);
  assert.equal(projects[0].project_id, record.project_id);
  assert.equal(projects[0].audit_id, record.audit_id);
  assert.equal(projects[0].source_project_path, record.source_project.path);
  assert.deepEqual(await fs.readFile(recordPath), source);

  const registry = JSON.parse(await fs.readFile(path.join(storage, "registry.json"), "utf8"));
  assert.deepEqual(registry.projects.map((summary) => summary.project_id), [record.project_id]);
});

test("feedback UI refinements keep scrolling and evidence controls without a title warning", async () => {
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const alert = await fs.readFile(new URL("../public/ui/icons/alert.svg", import.meta.url));
  assert.match(css, /\.project-list[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.population-value \.sample__number[^}]*font-size:\s*30px[^}]*font-weight:\s*500/s);
  assert.match(app, /className="section-heading-row"/);
  assert.match(app, /function EvidenceButton/);
  assert.doesNotMatch(app, /source="\/ui\/icons\/alert\.svg"|src="\/ui\/icons\/alert\.svg"|record-warning/);
  assert.doesNotMatch(app, /△/);
  assert.equal(crypto.createHash("sha256").update(alert).digest("hex"), "7913d5d7a06c75927e7db46e91235335058c388993e95638615210eaabeb6cd1");
});

test("the v0.15.4 project landing page uses the Figma gradient and separated metric cards", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(app, /className="project-page__brand"/);
  assert.match(app, /className=\{`hero-cards \$\{overviewModelPresentation\.contexts\.length > 1/);
  assert.match(css, /--v15-page-gradient:/);
  assert.match(css, /--v15-content:\s*1377px/);
  assert.match(css, /\.overview[^}]*background:\s*var\(--v15-page-gradient\)/s);
  assert.match(css, /\.overview--overview \.hero-cards[^}]*grid-template-columns:\s*312px 701px 312px[^}]*gap:\s*26px[^}]*background:\s*transparent/s);
  assert.match(css, /\.hero-cards::before[^}]*display:\s*none/);
  assert.match(css, /\.overview--overview \.hero-cards > \*[^}]*border-radius:\s*20px[^}]*background:\s*rgba\(255, 255, 255, \.5\)/s);
  assert.match(app, /className="project-directory-badge"/);
  assert.match(app, /Reanalyse_Top/);
  assert.match(app, /Download_Top/);
});

test("the report and model controls keep transparent backgrounds", async () => {
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.button--outline[^}]*background:\s*transparent/);
  assert.match(css, /\.model-pill[^}]*background:\s*transparent/);
});

test("the confidence card vertically centers its content", async () => {
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.confidence-card[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*justify-content:\s*center/s);
});

test("all table bands use the shared low-contrast tint", async () => {
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.data-table \.is-tinted[^}]*background:\s*rgba\(34, 34, 34, \.035\)/);
});

test("the v1.1 project menu keeps runtime project identity and removal controls outside the introduction", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(app, /className="record-title-actions"/);
  assert.match(app, /function ProjectMenuDrawer/);
  assert.match(app, /className="project-menu-folder"/);
  assert.match(app, />\/\{folder\}</);
  assert.match(app, /className="project-menu-remove"/);
  assert.match(app, /onDeleteProject/);
  assert.doesNotMatch(app, /className="record-meta"/);
});

test("the population funnel maps all established samples onto one shared 100-dot population", () => {
  const samples = {
    source_data: { state: "established", count: 6000 },
    model_sample: { state: "established", count: 1300 },
    evaluation_sample: { state: "established", count: 348 },
  };
  const result = populationStageDots(samples);
  assert.equal(result.comparable, true);
  assert.equal(result.totalDots, POPULATION_DOT_COUNT);
  assert.equal(result.totalDots, 100);
  assert.equal(result.baseline, "source_data");
  assert.deepEqual(result.filled, { source_data: 100, model_sample: 22, evaluation_sample: 6 });
  assert.deepEqual(result.counts, { source_data: 6000, model_sample: 1300, evaluation_sample: 348 });
  assert.equal(samples.model_sample.count, 1300);
});

test("the Overview renders one shared population grid above all three values", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.equal((app.match(/className="population-funnel__grid"/g) || []).length, 1);
  assert.match(app, /className="population-funnel__values"/);
  assert.match(app, /population-funnel__grid[\s\S]*population-funnel__values/);
  assert.doesNotMatch(app, /population-funnel__explanation/);
  assert.match(app, /className="data-left"[\s\S]*<PopulationFunnel/);
  assert.doesNotMatch(app, /population-stage__dots/);
  assert.match(css, /\.population-funnel__grid[^}]*max-width:\s*550px/s);
  assert.match(css, /\.population-dot[^}]*max-width:\s*10px/s);
});

test("the population funnel uses any two ordered stages and stays neutral with only one", () => {
  const missingSource = populationStageDots({
    source_data: { state: "not_established", count: null },
    model_sample: { state: "established", count: 1300 },
    evaluation_sample: { state: "established", count: 348 },
  });
  const missingModel = populationStageDots({
    source_data: { state: "established", count: 6000 },
    model_sample: { state: "not_established", count: null },
    evaluation_sample: { state: "established", count: 348 },
  });
  const oneValue = populationStageDots({
    source_data: { state: "established", count: 6000 },
    model_sample: { state: "not_established", count: null },
    evaluation_sample: { state: "not_established", count: null },
  });
  const reversedStages = populationStageDots({
    source_data: { state: "established", count: 1000 },
    model_sample: { state: "established", count: 600 },
    evaluation_sample: { state: "established", count: 700 },
  });
  assert.equal(missingSource.comparable, true);
  assert.equal(missingSource.baseline, "model_sample");
  assert.deepEqual(missingSource.filled, { source_data: null, model_sample: 100, evaluation_sample: 27 });
  assert.equal(missingModel.comparable, true);
  assert.deepEqual(missingModel.filled, { source_data: 100, model_sample: null, evaluation_sample: 6 });
  assert.equal(oneValue.comparable, false);
  assert.equal(oneValue.filled, null);
  assert.equal(reversedStages.comparable, false);
  assert.equal(reversedStages.filled, null);
});

test("the population funnel retains a documented quantified source bound", () => {
  const result = populationStageDots({
    source_data: { state: "established", display: "More than 8 million sensor readings", count: null },
    model_sample: { state: "established", display: "24,000 readings", count: 24000 },
    evaluation_sample: { state: "established", display: "6,000 readings", count: 6000 },
  });
  assert.equal(result.comparable, true);
  assert.equal(result.baseline, "source_data");
  assert.deepEqual(result.counts, { source_data: 8000000, model_sample: 24000, evaluation_sample: 6000 });
  assert.deepEqual(result.filled, { source_data: 100, model_sample: 1, evaluation_sample: 1 });
});

test("display-only percentage metrics use decimal equivalents with two places", () => {
  const rawMetric = "0.62486417070038525";
  const rawPercentage = "75.5%";
  assert.equal(formatMetricValue(rawMetric), "0.62");
  assert.equal(formatMetricValue("0.73553583169"), "0.74");
  assert.equal(formatMetricValue("90%"), "0.90");
  assert.equal(formatMetricValue("90.1%"), "0.90");
  assert.equal(formatMetricValue("75%"), "0.75");
  assert.equal(formatMetricValue(rawPercentage), "0.76");
  assert.equal(formatSupervisorSummary("Accuracy 0.624864 and recall 75.5%."), "Accuracy 0.62 and recall 0.76.");
  assert.equal(formatSupervisorSummary("A 90% training share was used."), "A 90.00% training share was used.");
  assert.equal(formatSupervisorSummary("The model used 1,263 training parcels."), "The model used 1.3K training parcels.");
  assert.equal(rawMetric, "0.62486417070038525");
  assert.equal(rawPercentage, "75.5%");
});

test("display-only counts compact at K and M without inventing qualifiers", () => {
  assert.equal(formatCompactCount(2099575), "2.1M");
  assert.equal(formatCompactCount(348), "348");
  assert.equal(formatCompactCount(12000), "12K");
  assert.equal(formatCompactCount(3900000, true), "3.9M+");
  assert.equal(formatCountValue({ state: "established", display: "2,099,575 prepared records", count: 2099575, unit: "records" }), "2.1M prepared records");
  assert.equal(formatCountValue({ state: "established", display: "1,263 training parcels", count: 1263, unit: "parcels" }), "1.3K training parcels");
  assert.equal(formatCountValue({ state: "established", display: "12,000", count: 12000, unit: "establishments" }), "12K");
  assert.equal(formatCountValue({ state: "established", display: "3.9+ million", count: 3900000, unit: "records" }), "3.9M+");
  assert.equal(formatCountValue({ state: "established", display: "3,900,000+ records", count: 3900000, unit: "records" }), "3.9M+ records");
  assert.equal(formatCountValue({ state: "established", display: "at least 120,000 records", count: 120000, unit: "records" }), "at least 120K+ records");
  assert.equal(formatCountValue({ state: "established", display: "348 held-out cases", count: 348, unit: "cases" }), "348 held-out cases");
});

test("sample cards separate the compact number from supporting text", () => {
  const exact = { state: "established", display: "5,989 residential properties", count: 5989, unit: "properties" };
  const lowerBound = { state: "established", display: "More than 16 million rows", count: null, unit: "rows" };
  assert.equal(formatSampleNumber(exact), "6K");
  assert.equal(formatSampleDetail(exact), "residential properties");
  assert.equal(formatSampleNumber(lowerBound), "16M+");
  assert.equal(formatSampleDetail(lowerBound), "rows");
  assert.equal(formatSampleNumber({ state: "execution_required", display: "–", count: null }), "–");
  assert.equal(formatSampleDetail({ state: "execution_required" }), "Execution required");
});

test("concise supervisor copy is display-only and keeps the full source string", () => {
  const raw = "This deliberately long supervisor-facing sentence explains the supported conclusion and includes material detail that remains available in the evidence drawer. A second sentence adds provenance and further nuance for review.";
  const displayed = formatSupervisorCopy(raw, 120);
  assert.ok(displayed.length <= 121);
  assert.equal(raw.endsWith("review."), true);
});

test("the Overview binds the complete stored Purpose & Scope summary", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(app, /formatSupervisorSummary\(r\.purpose_scope\.summary\.value\)/);
  assert.doesNotMatch(app, /displayValue=\{summary\(r\.purpose_scope\.summary\)\}/);

  for (const project of ["R1", "R2", "R3", "R4", "R5", "R6"]) {
    const record = JSON.parse(await fs.readFile(new URL(`../validation/results/v0.9.8-phase2-2026-08-20/records/${project}.json`, import.meta.url), "utf8"));
    const stored = record.reconstruction.purpose_scope.summary.value;
    const displayed = formatSupervisorSummary(stored);
    assert.equal(displayed, stored, `${project} should display its complete stored summary`);
    assert.ok(formatSupervisorCopy(stored).length < stored.length, `${project} exercises the former truncation regression`);
  }
});

test("the released v0.9.2 audits migrate byte-for-byte without reconstruction", async () => {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-v093-storage-"));
  const preserved = fileURLToPath(new URL("../preserved-audits/v0.9.2/", import.meta.url));
  const migration = await importPreservedAudits({ storage, preserved });
  assert.equal(migration.imported, 6);
  const registry = JSON.parse(await fs.readFile(path.join(storage, "registry.json"), "utf8"));
  assert.equal(registry.projects.length, 6);
  for (const name of ["R1", "R2", "R3", "R4", "R5", "R6"]) {
    const source = await fs.readFile(new URL(`../preserved-audits/v0.9.2/records/${name}.json`, import.meta.url));
    const record = JSON.parse(source);
    const migrated = await fs.readFile(path.join(storage, "projects", record.project_id, "record.json"));
    assert.deepEqual(migrated, source);
    assert.equal(JSON.parse(migrated).audit_id, record.audit_id);
    assert.equal(JSON.parse(migrated).provider.response_id, record.provider.response_id);
  }
  assert.equal((await importPreservedAudits({ storage, preserved })).skipped, true);
});

test("the current v0.9.3 audits migrate without reconstruction, including the three-attempt R6 audit", async () => {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-v094-storage-"));
  const preserved = fileURLToPath(new URL("../preserved-audits/v0.9.3/", import.meta.url));
  const manifest = JSON.parse(await fs.readFile(path.join(preserved, "manifest.json"), "utf8"));
  const migration = await importPreservedAudits({ storage, preserved });
  assert.equal(migration.imported, 6);

  for (const relative of manifest.records) {
    const sourcePath = path.resolve(preserved, relative);
    const source = await fs.readFile(sourcePath);
    const record = JSON.parse(source);
    const migrated = await fs.readFile(path.join(storage, "projects", record.project_id, "record.json"));
    assert.deepEqual(migrated, source);
  }

  const r6 = JSON.parse(await fs.readFile(new URL("../preserved-audits/v0.9.3/records/R6.json", import.meta.url), "utf8"));
  assert.equal(r6.audit_id, "AUD-19E4D93BFD");
  assert.equal(r6.diagnostics.llm.attempt_count, 3);
  assert.equal(r6.diagnostics.llm.total_usage.total_tokens, 128784);
  assert.deepEqual(r6.diagnostics.llm.attempts.map((attempt) => attempt.outcome), ["rejected", "rejected", "accepted"]);
  assert.match(r6.diagnostics.llm.attempts[0].validation.errors[0], /numeric value 13/);
  assert.match(r6.diagnostics.llm.attempts[1].validation.errors[0], /numeric value 19/);

  const report = renderReport(r6);
  assert.match(report, /numeric value 13 is not grounded/);
  assert.match(report, /numeric value 19 is not grounded/);
  assert.match(report, /supplied to the next attempt as corrections/);
});

test("historical R6 telemetry stays honest while both original reports remain inspectable", async () => {
  const record = JSON.parse(await fs.readFile(new URL("../preserved-audits/v0.9.2/records/R6.json", import.meta.url), "utf8"));
  const related = await legacyAuditsForProject(record.project_id);
  const diagnostics = diagnosticsForRecord(record, related);

  assert.equal(diagnostics.availability, "historical_partial");
  assert.equal(diagnostics.llm.attempt_count, 1);
  assert.equal(diagnostics.llm.total_usage.total_tokens, 43309);
  assert.equal(diagnostics.llm.paid_model_activity, true);
  assert.equal(diagnostics.llm.provider_call_count, null);
  assert.equal(diagnostics.llm.attempts.length, 0);
  assert.deepEqual(related.map((item) => item.audit_id), ["AUD-89100572D1", "AUD-DADECDC7EA"]);

  for (const audit of related) {
    const reportPath = await legacyReportPath(audit.audit_id);
    const report = await fs.readFile(reportPath, "utf8");
    assert.match(report, new RegExp(audit.audit_id));
  }
  assert.equal(await legacyReportPath("AUD-NOT-PRESERVED"), null);
});

test("an unchanged source reuses its audit while a changed source is eligible for regeneration", async () => {
  const record = JSON.parse(await fs.readFile(new URL("../preserved-audits/v0.9.2/records/R1.json", import.meta.url), "utf8"));
  assert.equal(sourceMatchesAudit(record, record.source_project.content_snapshot_after), true);
  assert.equal(sourceMatchesAudit(record, "different-content-snapshot"), false);
});

test("preserved audits cover variable result, metric, sample, and missing-state compositions", async () => {
  const records = [];
  for (const name of ["R1", "R2", "R3", "R4", "R5", "R6"]) records.push(JSON.parse(await fs.readFile(new URL(`../preserved-audits/v0.9.2/records/${name}.json`, import.meta.url), "utf8")));
  const before = JSON.stringify(records);
  const materialCounts = new Set();
  const primaryStates = new Set();
  const sampleDisplays = [];
  for (const record of records) {
    assert.equal(validateReconstruction(record.reconstruction, record.evidence).status, "VALID");
    primaryStates.add(record.reconstruction.results_evaluation.primary_result.state);
    materialCounts.add(record.reconstruction.results_evaluation.material_results.length);
    formatMetricValue(record.reconstruction.results_evaluation.primary_result.display_value);
    for (const sample of Object.values(record.reconstruction.samples)) sampleDisplays.push(formatSampleNumber(sample));
  }
  assert.deepEqual([...primaryStates].sort(), ["established", "execution_required"]);
  assert.deepEqual([...materialCounts].sort(), [0, 2]);
  assert.ok(sampleDisplays.includes("–"));
  assert.ok(sampleDisplays.some((value) => value.endsWith("M+")));
  assert.equal(JSON.stringify(records), before);
});

test("display formatting does not mutate records or alter download precision", async () => {
  const sample = { state: "established", display: "2,099,575 records", count: 2099575, unit: "records", evidence_ids: ["E-1"] };
  const before = structuredClone(sample);
  assert.equal(formatCountValue(sample), "2.1M records");
  assert.deepEqual(sample, before);
  const report = await fs.readFile(new URL("../engine/client-report.mjs", import.meta.url), "utf8");
  assert.match(report, /raw_value/);
  assert.match(report, /display_precision/);
  assert.doesNotMatch(report, /formatMetricValue|formatCompactCount|formatCountValue|formatSupervisorSummary/);
});

test("production logic contains no development-case answers or credentials", async () => {
  const roots = [new URL("../engine/", import.meta.url), new URL("../src/", import.meta.url)];
  const forbidden = [/R1_public-health/i, /housing-chelsea/i, /road-crash-risk/i, /nyc-311-resolution/i, /property-valuation-cook/i, /naics-classification/i, /sk-[A-Za-z0-9_-]{12,}/];
  for (const root of roots) {
    for (const name of await fs.readdir(root)) {
      const file = new URL(name, root);
      if (!(await fs.stat(file)).isFile()) continue;
      const text = await fs.readFile(file, "utf8");
      for (const pattern of forbidden) assert.doesNotMatch(text, pattern);
    }
  }
});

test("semantic confidence colours and local UI assets are wired into the presentation", async () => {
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  for (const tone of ["low", "low-medium", "medium", "high", "unavailable"]) assert.match(css, new RegExp(`confidence-badge--${tone}`));
  for (const asset of ["Reanalyse_Top", "Download_Top", "Folder", "Menu", "Info_Tulip", "Import_Project", "Arrow_Forward", "Menu_Close_Ring", "Menu_Close_Cross", "Menu_Remove", "Menu_Folder", "Import_Plus", "Workflow_Arrow"]) {
    assert.match(app, new RegExp(`name=\\"${asset}\\"`));
    assert.match(await fs.readFile(new URL(`../public/ui/${asset}.svg`, import.meta.url), "utf8"), /^<svg/);
  }
  assert.doesNotMatch(app, /AlertIcon|record-warning/);
  assert.match(await fs.readFile(new URL("../public/ui/icons/alert.svg", import.meta.url), "utf8"), /^<svg/);
});
