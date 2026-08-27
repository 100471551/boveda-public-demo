import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  executeMaterialAreaCoverage,
  executeMaterialEvidenceAbsenceSignals,
  MATERIAL_ANALYTICAL_AREAS,
} from "../engine/material-evidence-absence.mjs";
import { buildSignalsLayer, CHECK_DEFINITIONS, CHECK_RESULTS } from "../engine/signals.mjs";
import { reconstructionConfidenceExplanation, reconstructionConfidenceLabel } from "../src/reconstruction-display.mjs";

const evidence = (value = {}) => ({ epistemic: "OBSERVED", evidence_ids: ["E-SYNTHETIC"], ...value });

function analyticalLayer({ diagnostics = [], missingness = [], populationAvailability = "available", includeMissingHandling = true } = {}) {
  const target = evidence({ id: "TARGET-MARSH", label: "Marsh condition next season", workstream_id: "STREAM-MARSH" });
  const result = evidence({ id: "RESULT-MARSH", metric: "F1 score", method: "Cedar classifier", task_target: target.label });
  const comparisonResults = [
    evidence({ id: "RESULT-CEDAR", method: "Cedar classifier", metric: "f1", value: 0.71 }),
    evidence({ id: "RESULT-WILLOW", method: "Willow classifier", metric: "f1", value: 0.68 }),
  ];
  const stages = includeMissingHandling ? [evidence({ id: "STAGE-FILL", workstream_id: target.workstream_id, operation_type: "median_imputation", expression: "SimpleImputer(strategy='median')" })] : [];
  const sectionAnswer = (state, values = []) => ({ state, dashboard_available: state === "answered", evidence_ids: values.flatMap((item) => item.evidence_ids || []), related_evidence_ids: values.flatMap((item) => item.evidence_ids || []) });
  const feature = evidence({ id: "FEATURE-MARSH", method: "Cedar classifier", feature: "water depth", value: 0.4 });
  const populations = {
    source_data: evidence({ id: "POP-SOURCE", count: 200, unit: "sites" }),
    model_sample: evidence({ id: "POP-TRAIN", count: 120, unit: "sites" }),
    evaluation_sample: evidence({ id: "POP-EVAL", count: 40, unit: "sites" }),
  };
  return {
    presentation: {
      main_target_story: {
        status: "established",
        target,
        method: "Cedar classifier",
        result,
        material_results: [result],
        comparison_sets: [{ id: "COMPARE-MARSH", methods: ["Cedar classifier", "Willow classifier"], results: comparisonResults }],
        feature_evidence: [feature],
        diagnostics,
        missingness,
        populations,
        section_answers: {
          results_evaluation: sectionAnswer("answered", [result]),
          model_comparison: sectionAnswer("answered", comparisonResults),
          feature_driver_evidence: sectionAnswer("answered", [feature]),
          evaluation_behaviour: sectionAnswer(diagnostics.length ? "answered" : "unavailable", diagnostics),
          data_missingness: sectionAnswer(missingness.length ? "answered" : "unavailable", missingness),
          population_lineage: sectionAnswer(populationAvailability === "available" ? "answered" : populationAvailability, Object.values(populations)),
        },
        availability: {
          target: "available", result: "available", model_comparison: "available", features: "available",
          evaluation_behaviour: diagnostics.length ? "available" : "unavailable",
          missingness: missingness.length ? "available" : "unavailable",
          populations: populationAvailability,
        },
      },
    },
    data_preparation: { stages, missingness },
    object_graph: { data_formation_stages: stages },
    model_runs: [evidence({ id: "RUN-CEDAR", workstream_id: target.workstream_id, method: "Cedar classifier", estimator_class: "CedarClassifier" })],
    results: comparisonResults,
  };
}

function completeRecord() {
  const value = (text) => ({ state: "established", value: text, display: text, epistemic: "OBSERVED", evidence_ids: ["E-SYNTHETIC"] });
  const sample = (count, label) => ({ state: "established", count, unit: "sites", display: `${count} ${label}`, epistemic: "OBSERVED", evidence_ids: ["E-SYNTHETIC"] });
  return {
    project_id: "PROJECT-MARSH",
    audit_id: "AUDIT-MARSH",
    source_project: { content_snapshot_after: "SNAPSHOT-MARSH" },
    evidence: [{ id: "E-SYNTHETIC", path: "analysis/main.ipynb", kind: "notebook", epistemic: "OBSERVED", excerpt: "synthetic evidence" }],
    reconstruction: {
      identity: { name: value("Marsh monitoring") },
      purpose_scope: {
        purpose: value("Monitor marsh condition"), task: value("Classification"), target_outcome: value("Condition next season"),
        intended_use: value("Prioritise inspection"), unit: value("Site"), population_scope: value("Monitored marsh sites"), summary: value("Classify future marsh condition"),
      },
      results_evaluation: {
        evaluation_design: value("Held-out evaluation"),
        primary_result: { state: "established", display_value: "0.71", metric: "F1 score", method: "Cedar classifier", task_target: "Condition next season", epistemic: "OBSERVED", evidence_ids: ["E-SYNTHETIC"] },
        other_material_result: value("Comparator results"), known_limitation: value("Bounded evaluation"), establishes: value("Held-out performance"), does_not_establish: value("Operational performance"),
      },
      data: {
        summary: value("Site measurements"), data_sources: value("Monitoring table"), period: value("One season"), unit_of_observation: value("Site"),
        population_filters: value("Eligible monitored sites"), population_limitation: value("Only monitored sites"),
      },
      samples: { source_data: sample(200, "sites"), model_sample: sample(120, "sites"), evaluation_sample: sample(40, "sites") },
    },
  };
}

test("material analytical-area coverage distinguishes complete, partial, unavailable, and inapplicable areas", () => {
  const checks = executeMaterialAreaCoverage(analyticalLayer(), { project_id: "PROJECT-MARSH", audit_id: "AUDIT-MARSH" });
  const byArea = new Map(checks.map((check) => [check.scope.analytical_area_id, check]));
  assert.equal(byArea.get("area-evaluation-behaviour").result, CHECK_RESULTS.INSUFFICIENT);
  assert.equal(byArea.get("area-data-missingness").result, CHECK_RESULTS.INSUFFICIENT);
  assert.equal(byArea.get("area-model-result-comparison").result, CHECK_RESULTS.ABSENT);
  assert.equal(byArea.get("area-feature-driver-evidence").result, CHECK_RESULTS.ABSENT);

  const partial = executeMaterialAreaCoverage(analyticalLayer({ populationAvailability: "partial" }));
  assert.equal(partial.find((check) => check.scope.analytical_area_id === "area-population-lineage").result, CHECK_RESULTS.INSUFFICIENT);

  const notApplicable = executeMaterialAreaCoverage(analyticalLayer({ includeMissingHandling: false }));
  assert.equal(notApplicable.find((check) => check.scope.analytical_area_id === "area-data-missingness").result, CHECK_RESULTS.NOT_APPLICABLE);
});

test("whole-area Evidence Gaps create one canonical material-absence Signal without promoting ordinary gaps", () => {
  const input = analyticalLayer();
  const layer = buildSignalsLayer(completeRecord(), { analyticalLayer: input });
  const areaGaps = layer.findings.filter((finding) => finding.finding_type === "evidence_gap" && finding.impacts.some((impact) => impact.object_type === "analytical_area"));
  const signals = layer.findings.filter((finding) => finding.finding_type === "signal" && finding.producing_check.check_id === "CHK-MATERIAL-EVIDENCE-ABSENCE");
  assert.deepEqual(areaGaps.map((finding) => finding.result.missing_object_ids[0]).sort(), ["area-data-missingness", "area-evaluation-behaviour"]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].materiality.level, "high");
  assert.equal(signals[0].scoped_executions.length, 2);
  assert.equal(signals[0].presentation.condition_summary, "Important analytical evidence is entirely absent in 2 applicable areas, preventing meaningful supervisory assessment of each one.");
  assert.deepEqual(signals[0].confidence_impact, {
    reason_code: "material_evidence_absence",
    claim_effect: "limits",
    maximum_overall_score: 4,
    minimum_reduction: 1,
    analytical_area_ids: ["area-data-missingness", "area-evaluation-behaviour"],
  });
  assert.equal(layer.result_confidence.result_trace_score, 5);
  assert.equal(layer.result_confidence.score, 4);
  assert.equal(layer.result_confidence.finding_cap, 4);
  assert.equal(reconstructionConfidenceLabel(layer.result_confidence), "Partial reconstruction");
  assert.match(reconstructionConfidenceExplanation(layer.result_confidence, completeRecord().reconstruction), /trace the main result[\s\S]*2 important applicable analytical areas could not be reconstructed/i);

  const completeInput = analyticalLayer({
    diagnostics: [evidence({ id: "DIAGNOSTIC-MARSH", type: "confusion_matrix" })],
    missingness: [evidence({ id: "MISSING-MARSH", field: "water depth", unit: "percent", value: 2.5 })],
  });
  const coverage = executeMaterialAreaCoverage(completeInput);
  const unrelatedGap = [{ finding_id: "EGAP-ENVIRONMENT", related_check_execution_ids: ["EXEC-UNRELATED"], evidence: { supporting: ["E-SYNTHETIC"] } }];
  const absence = executeMaterialEvidenceAbsenceSignals(coverage, unrelatedGap, { project_id: "PROJECT-MARSH", audit_id: "AUDIT-MARSH" });
  assert.deepEqual(absence.map((check) => check.result), [CHECK_RESULTS.ABSENT]);
  const completeLayer = buildSignalsLayer(completeRecord(), { analyticalLayer: completeInput });
  assert.equal(completeLayer.result_confidence.score, 5);
  assert.equal(reconstructionConfidenceLabel(completeLayer.result_confidence), "Main result traced");
});

test("the new Signal class is in the inventory and contains no reference-project selectors", async () => {
  const ids = new Set(CHECK_DEFINITIONS.map((definition) => definition.id));
  assert.ok(ids.has("CHK-MATERIAL-ANALYTICAL-AREA-COVERAGE"));
  assert.ok(ids.has("CHK-MATERIAL-EVIDENCE-ABSENCE"));
  assert.equal(MATERIAL_ANALYTICAL_AREAS.length, 6);
  const source = await fs.readFile(new URL("../engine/material-evidence-absence.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bR[1-6]\b|Chelsea|Crash Model|road-crash-risk|22466|2283|1026/i);
});
