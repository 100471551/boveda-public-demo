import crypto from "node:crypto";

const RESULT = Object.freeze({
  PRESENT: "SIGNAL PRESENT",
  ABSENT: "NO SIGNAL DETECTED",
  NOT_APPLICABLE: "NOT APPLICABLE",
  INSUFFICIENT: "INSUFFICIENT EVIDENCE",
});

export const MATERIAL_EVIDENCE_CHECK_DEFINITIONS = Object.freeze({
  "CHK-MATERIAL-ANALYTICAL-AREA-COVERAGE": {
    version: "1.0.0",
    label: "Material analytical area coverage",
    question_ids: ["Q-LIMITATION-3"],
    object_ids: ["field-known-limitation"],
    coverage_domain_ids: ["coverage-traceability"],
    operation: "Determine whether each important and demonstrably applicable analytical area contains enough evidence for meaningful supervisory assessment.",
    allowed: "An applicable analytical area can or cannot be meaningfully assessed from the available project evidence.",
    prohibited: ["Every project must contain every analytical artefact.", "Missing evidence proves that the analysis was not performed."],
  },
  "CHK-MATERIAL-EVIDENCE-ABSENCE": {
    version: "1.0.0",
    label: "Material evidence absence",
    question_ids: ["Q-LIMITATION-3"],
    object_ids: ["field-known-limitation"],
    coverage_domain_ids: ["coverage-traceability"],
    operation: "Raise a supervisory condition only when a material analytical-area Evidence Gap prevents meaningful assessment of that entire applicable area.",
    allowed: "Material evidence absence prevents meaningful supervisory assessment of the named applicable analytical area.",
    prohibited: ["Every Evidence Gap is a Signal.", "The absent evidence never existed.", "The project or result is technically unsound."],
    presentation: {
      title: "Important analytical evidence is missing",
      why: "The missing evidence prevents Bóveda from meaningfully assessing an important part of the project, rather than merely limiting a detail within an otherwise assessable area.",
      aggregate_condition_summary: "Important analytical evidence is entirely absent in {count} applicable areas, preventing meaningful supervisory assessment of each one.",
    },
  },
});

export const MATERIAL_ANALYTICAL_AREAS = Object.freeze([
  { id: "area-main-result", label: "Main result", availability_key: "result", section_answer_id: "results_evaluation", applicability: "result" },
  { id: "area-model-result-comparison", label: "Model comparison", availability_key: "model_comparison", section_answer_id: "model_comparison", applicability: "comparison" },
  { id: "area-feature-driver-evidence", label: "Feature / driver evidence", availability_key: "features", section_answer_id: "feature_driver_evidence", applicability: "features" },
  { id: "area-evaluation-behaviour", label: "Evaluation behaviour", availability_key: "evaluation_behaviour", section_answer_id: "evaluation_behaviour", applicability: "classification" },
  { id: "area-population-lineage", label: "Population and sample lineage", availability_key: "population_lineage", section_answer_id: "population_lineage", applicability: "populations" },
  { id: "area-data-missingness", label: "Missing data before preparation", availability_key: "missingness", section_answer_id: "data_missingness", applicability: "missingness" },
]);

const unique = (values) => [...new Set(values.filter(Boolean))];
const array = (value) => Array.isArray(value) ? value : [];

function digest(...parts) {
  return crypto.createHash("sha256").update(parts.map((part) => JSON.stringify(part)).join("|")).digest("hex").slice(0, 12).toUpperCase();
}

function evidenceOf(values) {
  return unique(array(values).flatMap((value) => array(value?.evidence_ids))).sort();
}

function normaliseMetric(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function focalWorkstream(layer, story) {
  return story?.target?.workstream_id || layer?.primary_context?.workstream_id || null;
}

function focalStages(layer, story) {
  const workstreamId = focalWorkstream(layer, story);
  if (!workstreamId) return [];
  const byId = new Map([
    ...array(layer?.data_preparation?.stages),
    ...array(layer?.object_graph?.data_formation_stages),
  ].map((stage) => [stage.id, stage]));
  return [...byId.values()].filter((stage) => stage.workstream_id === workstreamId);
}

function focalMethods(layer, story) {
  const workstreamId = focalWorkstream(layer, story);
  return unique([
    story?.method,
    ...array(story?.comparison_sets).flatMap((set) => array(set.methods)),
    ...array(story?.comparison_sets).flatMap((set) => array(set.results).map((item) => item.method)),
    ...array(layer?.model_runs).filter((run) => !workstreamId || run.workstream_id === workstreamId).map((run) => run.method),
    ...array(layer?.results).filter((result) => !workstreamId || result.workstream_id === workstreamId).map((result) => result.method),
  ]);
}

function classificationEvidence(layer, story) {
  const metrics = unique([
    story?.result?.metric,
    ...array(story?.material_results).map((result) => result.metric || result.metric_label),
    ...array(story?.comparison_sets).flatMap((set) => array(set.results).map((result) => result.metric || result.metric_label)),
  ]).map(normaliseMetric);
  const classificationMetrics = /^(?:roc_auc|pr_auc|average_precision|accuracy|precision|recall|f1|f1_score|brier_loss|brier_score|brier_score_loss|log_loss)$/;
  const metricEvidence = metrics.some((metric) => classificationMetrics.test(metric));
  const runEvidence = array(layer?.model_runs).some((run) => /classif/i.test(String(run.estimator_class || run.method || "")));
  return metricEvidence || runEvidence;
}

function missingnessEvidence(layer, story) {
  const relevant = focalStages(layer, story).filter((stage) => {
    const operation = String(stage.operation_type || "");
    const expression = String(stage.expression || stage.description || "");
    return /missing|imput|(?:zero|constant|mean|median|mode)_fill|drop_?na|null_fill/i.test(operation)
      || /\b(?:fillna|dropna|isna|isnull|notna|notnull|simpleimputer|knnimputer|iterativeimputer)\b/i.test(expression);
  });
  return { applicable: relevant.length > 0, evidence_ids: evidenceOf(relevant), basis: relevant };
}

function assessment(area, layer, story) {
  const result = story?.result || null;
  const target = story?.target || null;
  const baseEvidence = unique([...(target?.evidence_ids || []), ...(result?.evidence_ids || [])]);
  if (area.applicability === "result") {
    const workflow = Boolean(target && (story?.method || array(layer?.model_runs).length || array(layer?.evaluation_attempts).length));
    return { applicable: workflow, evidence_ids: baseEvidence };
  }
  if (area.applicability === "comparison") {
    return { applicable: Boolean(result && focalMethods(layer, story).length >= 2), evidence_ids: unique([...baseEvidence, ...evidenceOf(array(story?.comparison_sets).flatMap((set) => array(set.results)))]) };
  }
  if (area.applicability === "features") {
    return { applicable: Boolean(result && story?.method), evidence_ids: baseEvidence };
  }
  if (area.applicability === "classification") {
    return { applicable: Boolean(result && classificationEvidence(layer, story)), evidence_ids: baseEvidence };
  }
  if (area.applicability === "populations") {
    return { applicable: Boolean(result), evidence_ids: baseEvidence };
  }
  if (area.applicability === "missingness") {
    const missingness = missingnessEvidence(layer, story);
    return { applicable: Boolean(result && missingness.applicable), evidence_ids: unique([...baseEvidence, ...missingness.evidence_ids]) };
  }
  return { applicable: false, evidence_ids: [] };
}

function coverageExecution(area, layer, meta) {
  const definition = MATERIAL_EVIDENCE_CHECK_DEFINITIONS["CHK-MATERIAL-ANALYTICAL-AREA-COVERAGE"];
  const story = layer?.presentation?.main_target_story || null;
  const applicability = assessment(area, layer, story);
  const sectionAnswer = story?.section_answers?.[area.section_answer_id] || null;
  const availability = sectionAnswer?.dashboard_available ? "available" : "unavailable";
  const areaEvidence = array(sectionAnswer?.evidence_ids);
  const relatedEvidence = array(sectionAnswer?.related_evidence_ids);
  const executionId = `EXEC-${digest(definition.label, definition.version, area.id, meta.audit_id)}`;
  const inputs = [
    { object_id: `${area.id}-applicability`, object_type: "AnalyticalAreaApplicability", role: "applicability", label: `${area.label} applicability`, epistemic: applicability.applicable ? "DERIVED" : "UNRESOLVED", evidence_ids: applicability.evidence_ids, established: applicability.applicable },
    { object_id: area.id, object_type: "AnalyticalArea", role: "assessment_evidence", label: area.label, epistemic: areaEvidence.length ? "OBSERVED" : "UNRESOLVED", evidence_ids: areaEvidence, established: availability === "available" },
  ];
  const base = {
    execution_id: executionId,
    check_id: "CHK-MATERIAL-ANALYTICAL-AREA-COVERAGE",
    check_version: definition.version,
    label: `${definition.label}: ${area.label}`,
    implementation_status: "implemented_analytical_area_native",
    question_ids: definition.question_ids,
    mapped_object_ids: definition.object_ids,
    coverage_domain_ids: definition.coverage_domain_ids,
    scope: { project_id: meta.project_id || null, audit_id: meta.audit_id || null, workstream: focalWorkstream(layer, story) || "main target", display_label: area.label, analytical_area_id: area.id, snapshot: meta.snapshot || null },
    scope_object_ids: [area.id],
    inputs,
    required_evidence: [{ object_id: area.id, object_type: "AnalyticalArea", requirement: "Enough evidence to present a meaningful supervisor-facing assessment when the area is demonstrably applicable." }],
    optional_evidence: [],
    operation: definition.operation,
    configuration: { rule_version: definition.version, threshold: "applicable_and_supervisory_question_unanswered" },
    threshold: "The area must be important and demonstrably applicable, and its defined supervisory question must remain unanswered. Related or partial evidence does not make the section available.",
    materiality_rule: { version: "1.0.0", rule: "Only whole-area absence in a demonstrably applicable material analytical area is severe." },
    allowed_claims: [definition.allowed],
    prohibited_claims: definition.prohibited,
    alternatives: ["Relevant evidence may exist outside the authorised or inspected project record."],
    evidence: { supporting: applicability.evidence_ids, contradicting: [], qualifying: areaEvidence, contextual: relatedEvidence },
    unresolved_relationships: [],
    presentation: null,
    primary_owner: null,
  };
  if (!applicability.applicable) return {
    ...base, applicable: false, applicability_reason: `${area.label} is not demonstrably applicable from the reconstructed main-target evidence.`, result: RESULT.NOT_APPLICABLE,
    result_summary: `${area.label} is not demonstrably applicable to the reconstructed main-target story.`, materiality: { level: "none", rule_version: "1.0.0", factors: [area.id] }, conditions: [], gaps: [], impacts: [], canonical_condition_key: null,
    state_reason_ids: [executionId], trail: { question_ids: definition.question_ids, execution_id: executionId, operation: definition.operation, input_object_ids: inputs.map((input) => input.object_id), graph_object_refs: [{ object_id: area.id, object_type: "AnalyticalArea", role: "analytical_area" }], evidence_ids: applicability.evidence_ids, gap_ids: [] },
  };
  if (availability === "available") return {
    ...base, applicable: true, applicability_reason: `${area.label} is important and applicable to the reconstructed main-target story.`, result: RESULT.ABSENT,
    result_summary: `${area.label} answers its defined supervisory question with connected evidence.`,
    materiality: { level: "none", rule_version: "1.0.0", factors: [area.id] }, conditions: [], gaps: [], impacts: [], canonical_condition_key: null,
    state_reason_ids: [executionId], trail: { question_ids: definition.question_ids, execution_id: executionId, operation: definition.operation, input_object_ids: inputs.map((input) => input.object_id), graph_object_refs: [{ object_id: area.id, object_type: "AnalyticalArea", role: "analytical_area" }], evidence_ids: unique([...applicability.evidence_ids, ...areaEvidence]), gap_ids: [] },
  };
  const gapId = `GAP-${digest(executionId, area.id)}`;
  const gap = { gap_id: gapId, object_id: area.id, description: `${area.label} cannot answer its defined supervisory question even though the area is applicable to the main analysis.`, claim_effect: "blocks" };
  return {
    ...base, applicable: true, applicability_reason: `${area.label} is important and applicable to the reconstructed main-target story.`, result: RESULT.INSUFFICIENT,
    result_summary: `Bóveda found enough evidence to establish that ${area.label.toLowerCase()} is applicable, but not enough to answer the supervisory question that the section represents.`,
    materiality: { level: "high", rule_version: "1.0.0", factors: [area.id, "entire_area_unavailable"] }, conditions: [], gaps: [gap], impacts: [], canonical_condition_key: null,
    state_reason_ids: [gapId], trail: { question_ids: definition.question_ids, execution_id: executionId, operation: definition.operation, input_object_ids: inputs.map((input) => input.object_id), graph_object_refs: [{ object_id: area.id, object_type: "AnalyticalArea", role: "analytical_area" }], evidence_ids: applicability.evidence_ids, gap_ids: [gapId] },
  };
}

export function executeMaterialAreaCoverage(layer, meta = {}) {
  if (!layer?.presentation?.main_target_story) return [];
  return MATERIAL_ANALYTICAL_AREAS.map((area) => coverageExecution(area, layer, meta));
}

function absenceExecution(coverage, gapFinding, meta) {
  const definition = MATERIAL_EVIDENCE_CHECK_DEFINITIONS["CHK-MATERIAL-EVIDENCE-ABSENCE"];
  const area = MATERIAL_ANALYTICAL_AREAS.find((item) => item.id === coverage.scope.analytical_area_id);
  const executionId = `EXEC-${digest(definition.label, definition.version, area.id, gapFinding.finding_id)}`;
  const condition = `Material evidence absence prevents meaningful supervisory assessment of ${area.label.toLowerCase()}.`;
  const evidence = unique(Object.values(gapFinding.evidence || {}).flat());
  const inputs = [{ object_id: gapFinding.finding_id, object_type: "EvidenceGap", role: "material_analytical_area_gap", label: `${area.label} Evidence Gap`, epistemic: "DERIVED", evidence_ids: evidence, established: true }];
  return {
    execution_id: executionId, check_id: "CHK-MATERIAL-EVIDENCE-ABSENCE", check_version: definition.version, label: definition.label,
    implementation_status: "implemented_finding_native", question_ids: definition.question_ids, mapped_object_ids: definition.object_ids, coverage_domain_ids: definition.coverage_domain_ids,
    scope: { project_id: meta.project_id || null, audit_id: meta.audit_id || null, workstream: coverage.scope.workstream, display_label: area.label, analytical_area_id: area.id, snapshot: meta.snapshot || null },
    scope_object_ids: [area.id, gapFinding.finding_id], inputs,
    required_evidence: [{ object_id: gapFinding.finding_id, object_type: "EvidenceGap", requirement: "An active Evidence Gap produced by the material analytical-area coverage check." }], optional_evidence: [],
    operation: definition.operation, configuration: { rule_version: definition.version, threshold: "active_whole_area_evidence_gap" }, threshold: "An applicable important analytical area must be entirely unavailable, not merely partial or qualified.",
    materiality_rule: { version: "1.0.0", rule: "Whole-area evidence absence blocks meaningful supervisory assessment and is high materiality." }, allowed_claims: [definition.allowed], prohibited_claims: definition.prohibited,
    alternatives: ["Relevant evidence may exist outside the authorised or inspected project record."], evidence: { supporting: evidence, contradicting: [], qualifying: [], contextual: [] }, unresolved_relationships: [],
    presentation: { title: definition.presentation.title, condition_summary: "An applicable analytical area is entirely unavailable because the project record does not contain enough evidence for meaningful supervisory assessment.", aggregate_condition_summary: definition.presentation.aggregate_condition_summary, why_it_matters: definition.presentation.why },
    primary_owner: null, applicable: true, applicability_reason: "The associated material analytical-area Evidence Gap is active.", result: RESULT.PRESENT, result_summary: condition,
    materiality: { level: "high", rule_version: "1.0.0", factors: [area.id, gapFinding.finding_id] }, conditions: [{ condition_type: "material_evidence_absence_blocks_analytical_area", description: condition }], gaps: [],
    confidence_impact: { reason_code: "material_evidence_absence", claim_effect: "limits", maximum_overall_score: 4, minimum_reduction: 1, analytical_area_ids: [area.id] },
    impacts: [{ object_type: "analytical_area", object_id: area.id, claim_effect: "blocks", impact_reason: condition, primary_owner: true }], canonical_condition_key: "material_evidence_absence_blocks_analytical_area", aggregation_label: "affected analytical areas",
    state_reason_ids: [gapFinding.finding_id], trail: { question_ids: definition.question_ids, execution_id: executionId, operation: definition.operation, input_object_ids: [gapFinding.finding_id], graph_object_refs: [{ object_id: area.id, object_type: "AnalyticalArea", role: "blocked_analytical_area" }, { object_id: gapFinding.finding_id, object_type: "EvidenceGap", role: "material_evidence_gap" }], evidence_ids: evidence, gap_ids: [gapFinding.finding_id] },
  };
}

export function executeMaterialEvidenceAbsenceSignals(coverageChecks, evidenceGaps, meta = {}) {
  const materialCoverage = array(coverageChecks).filter((check) => check.check_id === "CHK-MATERIAL-ANALYTICAL-AREA-COVERAGE" && check.result === RESULT.INSUFFICIENT);
  const executions = materialCoverage.flatMap((coverage) => {
    const gapFinding = array(evidenceGaps).find((finding) => finding.related_check_execution_ids?.includes(coverage.execution_id));
    return gapFinding ? [absenceExecution(coverage, gapFinding, meta)] : [];
  });
  if (executions.length) return executions;
  const definition = MATERIAL_EVIDENCE_CHECK_DEFINITIONS["CHK-MATERIAL-EVIDENCE-ABSENCE"];
  const applicable = array(coverageChecks).some((check) => check.check_id === "CHK-MATERIAL-ANALYTICAL-AREA-COVERAGE" && check.applicable);
  const executionId = `EXEC-${digest(definition.label, definition.version, meta.audit_id, "none")}`;
  return [{
    execution_id: executionId, check_id: "CHK-MATERIAL-EVIDENCE-ABSENCE", check_version: definition.version, label: definition.label, implementation_status: "implemented_finding_native",
    question_ids: definition.question_ids, mapped_object_ids: definition.object_ids, coverage_domain_ids: definition.coverage_domain_ids,
    scope: { project_id: meta.project_id || null, audit_id: meta.audit_id || null, workstream: "main target", display_label: "Material analytical areas", snapshot: meta.snapshot || null }, scope_object_ids: [], inputs: [], required_evidence: [], optional_evidence: [],
    operation: definition.operation, configuration: { rule_version: definition.version, threshold: "active_whole_area_evidence_gap" }, threshold: "An applicable important analytical area must be entirely unavailable, not merely partial or qualified.",
    materiality_rule: { version: "1.0.0", rule: "Whole-area evidence absence blocks meaningful supervisory assessment and is high materiality." }, allowed_claims: [definition.allowed], prohibited_claims: definition.prohibited,
    alternatives: [], evidence: { supporting: [], contradicting: [], qualifying: [], contextual: [] }, unresolved_relationships: [], presentation: { title: definition.presentation.title, why_it_matters: definition.presentation.why }, primary_owner: null,
    applicable, applicability_reason: applicable ? "At least one important analytical area is applicable to the main-target story." : "No important analytical area is demonstrably applicable.",
    result: applicable ? RESULT.ABSENT : RESULT.NOT_APPLICABLE, result_summary: applicable ? "No applicable analytical area is entirely unavailable because of material evidence absence." : "No important analytical area is demonstrably applicable to this check.",
    materiality: { level: "none", rule_version: "1.0.0", factors: [] }, conditions: [], gaps: [], impacts: [], canonical_condition_key: null, state_reason_ids: [executionId],
    trail: { question_ids: definition.question_ids, execution_id: executionId, operation: definition.operation, input_object_ids: [], graph_object_refs: [], evidence_ids: [], gap_ids: [] },
  }];
}

export function materialAnalyticalArea(objectId) {
  return MATERIAL_ANALYTICAL_AREAS.find((area) => area.id === objectId) || null;
}
