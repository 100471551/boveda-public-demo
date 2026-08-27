import assert from "node:assert/strict";
import test from "node:test";
import { emptyReconstruction } from "../engine/contract.mjs";
import { buildHistoryLayer } from "../engine/history.mjs";
import { localizeValidationFailure } from "../engine/local-repair.mjs";
import { renderReport, reportComparisonSets, reportMaterialResults, reportResultValue } from "../engine/client-report.mjs";
import { aggregateOverviewState, buildSignalsLayer } from "../engine/signals.mjs";
import { buildFindingsPresentation } from "../src/findings-presentation.mjs";
import { displayReconstructionText } from "../src/reconstruction-display.mjs";
import { analyticalAvailabilityMessage, primaryResultAvailability } from "../src/sparse-communication.mjs";

const unsupportedInternalLanguage = /persisted|reconstruction graph|missing dependency|unresolved identity|insufficient reconstruction support/i;

function established(value, evidenceIds = ["E-DOC"]) {
  return { state: "established", value, epistemic: "OBSERVED", evidence_ids: evidenceIds };
}

test("client-facing reconstruction text removes sparse-state implementation vocabulary", () => {
  const displayed = displayReconstructionText("A missing dependency has an unresolved identity in the stored reconstruction graph because of insufficient reconstruction support.");
  assert.doesNotMatch(displayed, unsupportedInternalLanguage);
  assert.match(displayed, /missing supporting information.*identity that could not be reconstructed.*available project record.*not enough supporting evidence/i);
});

test("report result formatting preserves canonical display values when typed numeric values are unavailable", () => {
  assert.equal(reportResultValue({ raw_value: 0.734567, display_precision: 3, display_value: "0.734567" }), "0.735");
  assert.equal(reportResultValue({ raw_value: null, display_value: "62.486417070038525%", display_precision: 6 }), "62.486417%");
  assert.equal(reportResultValue({ raw_value: null, display_value: "87.5%" }), "87.5%");
  assert.equal(reportResultValue({ raw_value: null, display_value: "–" }), "–");
});

test("the report reuses evidence-backed application comparisons when no narrower final set exists", () => {
  const applicationSet = { id: "CMP-TIDAL", methods: ["Baseline", "Ensemble"], results: [{ metric: "mae", value: 3.2 }] };
  const finalSet = { id: "CMP-FINAL", methods: ["Seasonal", "Ensemble"], results: [{ metric: "mae", value: 2.9 }] };
  assert.deepEqual(reportComparisonSets({ comparison_sets: [applicationSet], object_graph: { final_comparison_sets: [] } }), [applicationSet]);
  assert.deepEqual(reportComparisonSets({ comparison_sets: [applicationSet], object_graph: { final_comparison_sets: [finalSet] } }), [finalSet]);
});

test("the report retains additional canonical results with independent evaluation contexts", () => {
  const reconstruction = emptyReconstruction("Tidal energy study");
  reconstruction.results_evaluation.material_results = [
    { state: "established", display_value: "82.34567891%", metric: "Coverage", method: "Seasonal ensemble", task_target: "High-tide window", evaluation_context: "Winter holdout", evidence_ids: ["E-TIDE"] },
    { state: "not_established", display_value: "–", metric: "Precision", evidence_ids: [] },
  ];
  const projected = reportMaterialResults(reconstruction);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].report_value, "82.345679%");
  assert.equal(projected[0].evaluation_context, "Winter holdout");
});

test("sparse analytical messages distinguish a recorded result, an execution plan, partial data, and absent evidence", () => {
  const resultOnly = emptyReconstruction("Harbour demand study");
  resultOnly.results_evaluation.primary_result = { state: "established", metric: "Mean absolute error", raw_value: 2.4, display_value: "2.4", evidence_ids: ["E-RESULT"] };
  assert.match(analyticalAvailabilityMessage("model_comparison", resultOnly), /found evaluation results.*not enough comparable model results/i);
  assert.match(analyticalAvailabilityMessage("evaluation_behaviour", resultOnly), /found a headline evaluation result.*no linked diagnostic output/i);

  const planOnly = emptyReconstruction("Wetland survey");
  planOnly.results_evaluation.primary_result = { state: "execution_required", method: "Seasonal baseline", task_target: "nest abundance", evidence_ids: ["E-PIPELINE"] };
  const planned = primaryResultAvailability(planOnly.results_evaluation.primary_result);
  assert.equal(planned.title, "Evaluation result not recorded");
  assert.match(planned.detail, /Seasonal baseline for nest abundance.*must be run/i);
  assert.match(analyticalAvailabilityMessage("feature_driver_evidence", planOnly), /found a model workflow.*no recorded model output/i);

  const dataOnly = emptyReconstruction("Library visit analysis");
  dataOnly.data.summary = established("Daily visits were assembled from branch logs.");
  assert.match(analyticalAvailabilityMessage("sample_lineage", dataOnly), /found information about the data.*counts and relationships/i);
  assert.match(analyticalAvailabilityMessage("data_missingness", dataOnly), /found information about the project data.*no stage- and denominator-aware/i);

  for (const message of [
    analyticalAvailabilityMessage("model_comparison", resultOnly),
    analyticalAvailabilityMessage("feature_driver_evidence", planOnly),
    analyticalAvailabilityMessage("sample_lineage", dataOnly),
    planned.detail,
  ]) assert.doesNotMatch(message, unsupportedInternalLanguage);
});

test("a partly unassessed group is not mislabeled as conceptually not applicable", () => {
  const notApplicable = { assessment_status: "assessed", state: "not_applicable", state_reason_ids: ["EXEC-ONE"] };
  const notAssessed = { assessment_status: "not_implemented", state: null, state_reason_ids: [] };
  const mixed = aggregateOverviewState("group-interpretation", [notApplicable, notAssessed, notAssessed]);
  assert.equal(mixed.assessment_status, "not_implemented");
  assert.equal(mixed.state, null);
  assert.equal(mixed.label, "Not assessed");
  const allInapplicable = aggregateOverviewState("group-evaluation", [notApplicable, notApplicable]);
  assert.equal(allInapplicable.state, "not_applicable");
});

test("an unavailable typed analysis does not relabel supported Overview evidence as not applicable", () => {
  const reconstruction = emptyReconstruction("Solar yield study");
  reconstruction.purpose_scope.target_outcome = established("Hourly solar generation");
  reconstruction.results_evaluation.evaluation_design = established("The most recent month was held out for evaluation.");
  const record = {
    project_id: "PRJ-SOLAR",
    audit_id: "AUD-SOLAR",
    reconstruction,
    evidence: [{ id: "E-DOC", kind: "documentation", path: "method.md", epistemic: "OBSERVED", excerpt: "Hourly generation; most recent month held out." }],
    source_project: {},
  };
  const layer = buildSignalsLayer(record, { graph: {} });
  assert.equal(layer.overview.fields["field-target-outcome"].state.label, "Established");
  assert.equal(layer.overview.fields["field-evaluation-design"].state.label, "Established");
  assert.equal(layer.overview.fields["field-primary-result"].state.label, "Not assessed");
});

test("localized repair resolves a validator's unique shorthand field path without guessing ambiguous paths", () => {
  const reconstruction = emptyReconstruction("Forest canopy study");
  reconstruction.samples.source_data = { state: "established", display: "many rows", count: null, unit: "rows", epistemic: "OBSERVED", evidence_ids: ["E-DATA"] };
  const evidence = [{ id: "E-DATA", kind: "data_profile", path: "canopy.csv", epistemic: "OBSERVED", excerpt: "The source contains 730 rows." }];
  const localized = localizeValidationFailure(reconstruction, evidence, ["source_data: established sample display has no numeric quantity"]);
  assert.deepEqual(localized.fields.map((field) => field.path), ["record.samples.source_data"]);

  reconstruction.samples.model_sample = { ...reconstruction.samples.source_data };
  const ambiguous = localizeValidationFailure(reconstruction, evidence, ["evidence_ids: unsupported evidence"]);
  assert.equal(ambiguous, null);
});

test("History explains when project files have little recorded change history", () => {
  const reconstruction = emptyReconstruction("Estuary monitoring");
  const record = {
    schema_version: "boveda-project-record-test",
    project_id: "PRJ-ESTUARY",
    audit_id: "AUD-ESTUARY",
    analysed_at: "2030-01-02T00:00:00.000Z",
    reconstruction,
    evidence: [],
    diagnostics: {},
  };
  const layer = buildHistoryLayer(record, {
    sourceCollection: {
      root_available: true,
      git: { available: true, commits: [], tags: [], recovered_commit_count: 0, total_commit_count: 0 },
      mlflow: { available: false, runs: [], recovered_run_count: 0 },
    },
  });
  assert.equal(layer.presentation.availability, "limited");
  assert.match(layer.presentation.summary, /found the project files.*little or no recorded history/i);
  assert.match(layer.presentation.summary, /cannot reconstruct when or why important analytical decisions were made/i);
  assert.doesNotMatch(layer.presentation.summary, unsupportedInternalLanguage);
});

test("History describes supporting-only activity without numeric failure language", () => {
  const reconstruction = emptyReconstruction("River survey");
  const record = { schema_version: "boveda-project-record-test", project_id: "PRJ-RIVER", audit_id: "AUD-RIVER", analysed_at: "2030-01-02T00:00:00.000Z", reconstruction, evidence: [], diagnostics: {} };
  const layer = buildHistoryLayer(record, { sourceCollection: {
    root_available: true,
    git: { available: true, commits: [{ oid: "abc123", authored_at: "2029-04-03T00:00:00.000Z", subject: "Update project notes", body: "", changed_files: [{ status: "M", path: "README.md" }], changed_file_count: 1 }], tags: [], recovered_commit_count: 1, total_commit_count: 1 },
    mlflow: { available: false, runs: [], recovered_run_count: 0 },
  } });
  assert.equal(layer.presentation.availability, "limited");
  assert.match(layer.presentation.summary, /one recorded project change|1 recorded project change/i);
  assert.match(layer.presentation.summary, /but none could be connected/i);
  assert.doesNotMatch(layer.presentation.summary, /only 0/);
});

test("Evidence Gap presentation uses ordinary language for reusable reproduction gaps", () => {
  const objectIds = [
    "evidence-analytical-code",
    "evidence-executable",
    "evidence-configuration",
    "evidence-data-snapshot",
    "evidence-execution-context",
    "evidence-metric-origin",
    "evidence-prediction-label-artifacts",
  ];
  const layer = {
    overview: { sections: [], fields: {} },
    project_evidence_coverage: { domains: [] },
    findings: objectIds.map((objectId, index) => ({
      finding_id: `GAP-${index}`,
      evidence_gap_id: `GAP-${index}`,
      finding_type: "evidence_gap",
      status: "active",
      condition: "A missing dependency remains in the stored reconstruction graph.",
      explanation: "There is insufficient reconstruction support.",
      result: { missing_object_ids: [objectId] },
      producing_check: { check_id: "CHECK-SYNTHETIC" },
      impacts: [],
      question_ids: [],
      claims: { allowed: [], prohibited: [] },
      evidence: { supporting: [], contradicting: [], qualifying: [], contextual: [] },
      related_check_execution_ids: [],
    })),
  };
  const presentation = buildFindingsPresentation(layer);
  assert.equal(presentation.evidence_gaps.length, objectIds.length);
  for (const gap of presentation.evidence_gaps) {
    assert.ok(gap.title.length > 20);
    assert.ok(gap.condition_summary.length > 20);
    assert.ok(gap.why_it_matters.length > 20);
    assert.doesNotMatch(`${gap.title} ${gap.condition_summary} ${gap.why_it_matters}`, unsupportedInternalLanguage);
  }
});

test("the PDF projection prints project evidence excerpts while retaining History excerpts in full HTML and the index", () => {
  const reconstruction = emptyReconstruction("Canal maintenance study");
  reconstruction.identity.name = established("Canal maintenance study", ["E-PROJECT"]);
  const record = {
    schema_version: "boveda-project-record-test",
    project_id: "PRJ-CANAL",
    audit_id: "AUD-CANAL",
    analysed_at: "2030-01-02T00:00:00.000Z",
    source_project: { path: "/example/canal" },
    reconstruction,
    evidence: [{ id: "E-PROJECT", kind: "documentation", path: "study.md", epistemic: "OBSERVED", excerpt: "Project evidence excerpt." }],
    diagnostics: {},
  };
  const history = {
    events: [], supporting_events: [], limitations: [],
    presentation: { availability: "limited", summary: "Little recorded history was available." },
    evidence: [{ id: "E-HISTORY", kind: "git_commit", path: "git:abc", epistemic: "OBSERVED", excerpt: "History evidence excerpt." }],
  };
  const html = renderReport(record, { historyLayer: history, generatedAt: "2030-01-02T00:00:00.000Z" });
  assert.equal((html.match(/class="print-only print-raw-evidence"/g) || []).length, 1);
  assert.equal((html.match(/class="raw-evidence"/g) || []).length, 2);
  assert.match(html, /id="evidence-E-HISTORY"/);
  assert.match(html, /id="raw-evidence-E-HISTORY"/);
  assert.match(html, /History evidence excerpt/);
});
