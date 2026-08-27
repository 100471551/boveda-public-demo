import crypto from "node:crypto";
import { APPLICATION_VERSION } from "./version.mjs";
import { executeGraphChecks, GRAPH_CHECK_DEFINITIONS } from "./graph-signals.mjs";
import {
  executeMaterialAreaCoverage,
  executeMaterialEvidenceAbsenceSignals,
  materialAnalyticalArea,
  MATERIAL_EVIDENCE_CHECK_DEFINITIONS,
} from "./material-evidence-absence.mjs";

export const SIGNALS_SPECIFICATION_VERSION = "0.3.3";
export const SIGNALS_SCHEMA_VERSION = "boveda-findings-0.14.3";

export const CHECK_RESULTS = Object.freeze({
  PRESENT: "SIGNAL PRESENT",
  ABSENT: "NO SIGNAL DETECTED",
  NOT_APPLICABLE: "NOT APPLICABLE",
  INSUFFICIENT: "INSUFFICIENT EVIDENCE",
});

const STATES = Object.freeze({
  established: { colour: "green", label: "Established" },
  partial: { colour: "amber", label: "Partially established" },
  context: { colour: "amber", label: "Requires context" },
  limitation: { colour: "red", label: "Material limitation" },
  missing: { colour: "grey", label: "Not established" },
  inapplicable: { colour: "grey", label: "Not applicable" },
});

const COVERAGE_STATES = Object.freeze({
  sufficient: { colour: "green", label: "Sufficiently covered" },
  partial: { colour: "amber", label: "Partially covered" },
  gap: { colour: "red", label: "Material evidence gap" },
  unassessed: { colour: "grey", label: "Not assessed" },
  inapplicable: { colour: "grey", label: "Not applicable" },
});

const q = (id, text, checkIds = []) => ({ id, text, check_ids: checkIds });
const f = (id, label, path, questions) => ({ id, label, path, questions });

export const FIELD_DEFINITIONS = Object.freeze({
  "field-purpose": f("field-purpose", "Purpose", "purpose_scope.purpose", [
    q("Q-PURPOSE-1", "What institutional or operational problem is the project explicitly intended to address?", ["CHK-CURRENT-PURPOSE-TRACE"]),
    q("Q-PURPOSE-2", "Is the stated purpose current, authorised where relevant, and consistent across governing evidence?"),
  ]),
  "field-task": f("field-task", "Task", "purpose_scope.task", [
    q("Q-TASK-1", "What analytical task is actually performed?"),
    q("Q-TASK-2", "Are materially different tasks or workstreams kept separate?"),
  ]),
  "field-target-outcome": f("field-target-outcome", "Target / outcome", "purpose_scope.target_outcome", [
    q("Q-TARGET-1", "What target, label, outcome, endpoint, or proxy does the analysis actually use?", ["CHK-TARGET-CONSTRUCTION-ANCESTRY"]),
    q("Q-TARGET-2", "Does that target represent the stated construct and remain stable across the result?"),
  ]),
  "field-intended-use": f("field-intended-use", "Intended use", "purpose_scope.intended_use", [
    q("Q-USE-1", "What decision, prioritisation, workflow, or human process is the output intended to inform?", ["CHK-PROJECT-CONTEXT-COVERAGE"]),
    q("Q-USE-2", "Are the operational conditions of that use supported by current evidence?", ["CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT", "CHK-OUTPUT-COLUMN-CONSISTENCY", "CHK-ANALYTICAL-ROLE-ALIGNMENT"]),
  ]),
  "field-unit": f("field-unit", "Unit", "purpose_scope.unit", [
    q("Q-UNIT-1", "What real-world object is acted on, predicted, ranked, or assessed?"),
    q("Q-UNIT-2", "Is the decision unit kept distinct from the dataset row or event?"),
  ]),
  "field-population-scope": f("field-population-scope", "Population / scope", "purpose_scope.population_scope", [
    q("Q-POPULATION-1", "Which population, geography, organisation, period, and exclusions are inside the project claim?", ["CHK-POPULATION-LINEAGE-COMPATIBILITY", "CHK-PROJECT-CONTEXT-COVERAGE"]),
    q("Q-POPULATION-2", "Does the analysed and evaluated population support that declared scope?", ["CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT"]),
  ]),
  "field-evaluation-design": f("field-evaluation-design", "Evaluation design", "results_evaluation.evaluation_design", [
    q("Q-EVALUATION-DESIGN-1", "Under what protocol was the displayed method or model evaluated?", ["CHK-TYPED-FOCAL-RESULT-ORIGIN"]),
    q("Q-EVALUATION-DESIGN-2", "Is the design independent, temporally valid, and appropriate to the displayed claim?", ["CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE", "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE"]),
  ]),
  "field-evaluation-sample": f("field-evaluation-sample", "Evaluation sample", "samples.evaluation_sample", [
    q("Q-EVALUATION-SAMPLE-1", "Which rows, entities, period, labels, groups, and denominator produced the displayed result?", ["CHK-POPULATION-LINEAGE-COMPATIBILITY", "CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT"]),
    q("Q-EVALUATION-SAMPLE-2", "How does this sample differ from the source data and model sample?"),
  ]),
  "field-primary-result": f("field-primary-result", "Primary result", "results_evaluation.primary_result", [
    q("Q-PRIMARY-RESULT-1", "Which result is primary, according to what explicit criterion or governing evidence?", ["CHK-TYPED-FOCAL-RESULT-ORIGIN"]),
    q("Q-PRIMARY-RESULT-2", "What exactly does it measure, on which target, sample, period, and snapshot?", ["CHK-POPULATION-LINEAGE-COMPATIBILITY", "CHK-REPRODUCTION-INPUT-COVERAGE-V2"]),
  ]),
  "field-other-material-result": f("field-other-material-result", "Other material result", "results_evaluation.other_material_result", [
    q("Q-OTHER-RESULT-1", "Which additional result materially qualifies, contradicts, or contextualises the primary result?", ["CHK-POSITIVE-CLASS-DETECTION-DEGENERACY"]),
    q("Q-OTHER-RESULT-2", "Are comparisons between results genuinely like-for-like?", ["CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE", "CHK-ANALYTICAL-ROLE-ALIGNMENT"]),
  ]),
  "field-known-limitation": f("field-known-limitation", "Known limitation", "results_evaluation.known_limitation", [
    q("Q-LIMITATION-1", "Which limitations are directly established, interpreted, or unresolved?"),
    q("Q-LIMITATION-2", "Is each material limitation attached to the exact result, population, period, or claim it limits?", ["CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", "CHK-OUTPUT-COLUMN-CONSISTENCY"]),
    q("Q-LIMITATION-3", "Does material evidence absence prevent meaningful supervisory assessment of an important applicable analytical area?", ["CHK-MATERIAL-ANALYTICAL-AREA-COVERAGE", "CHK-MATERIAL-EVIDENCE-ABSENCE"]),
  ]),
  "field-establishes": f("field-establishes", "What this establishes", "results_evaluation.establishes", [
    q("Q-ESTABLISHES-1", "What is the strongest bounded claim directly supported by the result and its evidence chain?"),
    q("Q-ESTABLISHES-2", "Does the wording preserve target, sample, period, design, comparator, and epistemic status?"),
  ]),
  "field-does-not-establish": f("field-does-not-establish", "What this does not establish", "results_evaluation.does_not_establish", [
    q("Q-BOUNDARY-1", "Which plausible broader conclusions remain unsupported by the available evidence?"),
    q("Q-BOUNDARY-2", "Are the most material claim boundaries explicit?"),
  ]),
  "field-data-sources": f("field-data-sources", "Data sources", "data.data_sources", [
    q("Q-DATA-SOURCES-1", "Which source systems or datasets materially contribute to the current analysis?", ["CHK-SOURCE-INVENTORY-COVERAGE"]),
    q("Q-DATA-SOURCES-2", "Are their role, authority, coverage, and current snapshot identifiable?"),
  ]),
  "field-source-data": f("field-source-data", "Source data", "samples.source_data", [
    q("Q-SOURCE-DATA-1", "Which authorised data snapshots entered the project-specific analytical chain?", ["CHK-SOURCE-INVENTORY-COVERAGE", "CHK-SAMPLE-LINEAGE"]),
    q("Q-SOURCE-DATA-2", "What did those snapshots contain before population construction?"),
  ]),
  "field-period": f("field-period", "Period", "data.period", [
    q("Q-PERIOD-1", "Which period does each source, sample, target, evaluation, and result represent?"),
    q("Q-PERIOD-2", "Are event time, cutoff, outcome horizon, and project snapshot kept distinct?"),
  ]),
  "field-unit-of-observation": f("field-unit-of-observation", "Unit of observation", "data.unit_of_observation", [
    q("Q-OBSERVATION-UNIT-1", "What does one row or event represent at each stage of the data chain?"),
    q("Q-OBSERVATION-UNIT-2", "How are repeated observations, entities, episodes, locations, or windows related?"),
  ]),
  "field-main-population-filters": f("field-main-population-filters", "Main population filters", "data.population_filters", [
    q("Q-FILTERS-1", "Which rules create each sample?", ["CHK-POPULATION-LINEAGE-COMPATIBILITY", "CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE"]),
    q("Q-FILTERS-2", "What attrition and composition change does each rule produce?"),
  ]),
  "field-known-population-limitation": f("field-known-population-limitation", "Known population limitation", "data.population_limitation", [
    q("Q-POPULATION-LIMITATION-1", "Which parts of the intended population are absent, under-observed, or outside coverage?"),
    q("Q-POPULATION-LIMITATION-2", "How does that limitation constrain training, evaluation, and result claims?"),
  ]),
  "field-model-sample": f("field-model-sample", "Model sample", "samples.model_sample", [
    q("Q-MODEL-SAMPLE-1", "Which rows, entities, and periods were used for fitting, tuning, or selection?", ["CHK-POPULATION-LINEAGE-COMPATIBILITY"]),
    q("Q-MODEL-SAMPLE-2", "Can the model sample be reconstructed from source data through ordered transformations?"),
  ]),
});

const group = (id, label, fieldIds, summary) => ({ id, label, field_ids: fieldIds, summary });

export const OVERVIEW_STRUCTURE = Object.freeze([
  {
    id: "section-purpose-scope", label: "Purpose & scope",
    groups: [
      group("group-purpose", "Purpose", ["field-purpose", "field-task", "field-target-outcome", "field-intended-use"], "The declared problem, analytical task, target, and intended use."),
      group("group-scope", "Scope", ["field-unit", "field-population-scope"], "The decision unit and population boundary represented by the project."),
    ],
  },
  {
    id: "section-results-evaluation", label: "Results & Evaluation",
    groups: [
      group("group-evaluation", "Evaluation", ["field-evaluation-design", "field-evaluation-sample"], "The protocol and sample supporting the displayed result."),
      group("group-results", "Results", ["field-primary-result", "field-other-material-result"], "The primary result and any additional material result."),
      group("group-interpretation-boundary", "Interpretation boundary", ["field-known-limitation", "field-establishes", "field-does-not-establish"], "The supported claim and its explicit limitations."),
    ],
  },
  {
    id: "section-data-populations-samples", label: "Data, populations & samples",
    groups: [
      group("group-data-foundation", "Data foundation", ["field-data-sources", "field-source-data", "field-period"], "The identified sources, source snapshot role, and relevant periods."),
      group("group-population-definition", "Population definition", ["field-unit-of-observation", "field-main-population-filters", "field-known-population-limitation"], "How observations and filters define the analysed population."),
      group("group-sample-lineage", "Sample lineage", ["field-model-sample", "field-evaluation-sample"], "Source data → model sample → evaluation sample. Evaluation sample is one canonical cross-reference."),
    ],
  },
]);

export const COVERAGE_DOMAINS = Object.freeze([
  {
    id: "coverage-project-context", label: "Project Context Coverage",
    summary: "Whether purpose, scope, methodology, decisions, and limitations are supported by identifiable current context.",
    questions: [
      q("Q-COVERAGE-CONTEXT-1", "Are purpose, scope, and methodology supported by identifiable current context sources?", ["CHK-PROJECT-CONTEXT-COVERAGE"]),
      q("Q-COVERAGE-CONTEXT-2", "Are important technical and institutional decisions recorded with sufficient context?"),
      q("Q-COVERAGE-CONTEXT-3", "Are material gaps and limitations explicitly documented where relevant?"),
    ],
  },
  {
    id: "coverage-traceability", label: "Traceability coverage",
    summary: "Whether material conclusions connect to the artefacts and relationships that produced or authorised them.",
    questions: [
      q("Q-COVERAGE-TRACE-1", "Can material conclusions be traced to identifiable source artefacts?", ["CHK-PRIMARY-RESULT-ORIGIN"]),
      q("Q-COVERAGE-TRACE-2", "Can models and results be linked to code, data, configuration, and execution?", ["CHK-SAMPLE-LINEAGE"]),
      q("Q-COVERAGE-TRACE-3", "Which important relationships remain unresolved, ambiguous, or inferred?"),
    ],
  },
  {
    id: "coverage-reproducibility", label: "Reproducibility coverage",
    summary: "Whether a material analytical result can be reconstructed from artefacts in the authorised evidence boundary.",
    questions: [
      q("Q-COVERAGE-REPRO-1", "Can important analytical results be reproduced or deterministically recalculated?", ["CHK-REPRODUCTION-INPUT-COVERAGE-V2"]),
      q("Q-COVERAGE-REPRO-2", "Are environments, configuration, dependencies, random state, and inputs sufficiently identified?"),
      q("Q-COVERAGE-REPRO-3", "Are failed attempts, retries, changes, and supersession relationships preserved where material?"),
    ],
  },
  {
    id: "coverage-source", label: "Source coverage",
    summary: "Whether the authorised sources needed to reconstruct and bound material claims are identified and inspected.",
    questions: [
      q("Q-COVERAGE-SOURCE-1", "Are sources required for material claims available and inspected?", ["CHK-SOURCE-INVENTORY-COVERAGE"]),
      q("Q-COVERAGE-SOURCE-2", "Which expected or referenced sources are outside the inspected boundary?"),
      q("Q-COVERAGE-SOURCE-3", "Are claims explicitly limited to the actual source coverage?"),
    ],
  },
]);

const CHECK_DEFINITIONS_INTERNAL = [
  {
    id: "CHK-CURRENT-PURPOSE-TRACE", version: "1.0.0", label: "Current purpose source",
    question_ids: ["Q-PURPOSE-1"], object_ids: ["field-purpose"], coverage_domain_ids: [],
    required_object_ids: ["field-purpose"], kind: "completeness",
    operation: "Resolve the current purpose field to individually addressable Evidence Tokens in this Project Record.",
    allowed_claim: "The displayed purpose is or is not traceable within the inspected Project Record.",
  },
  {
    id: "CHK-TARGET-IDENTITY-TRACE", version: "1.0.0", label: "Target identity source",
    question_ids: ["Q-TARGET-1"], object_ids: ["field-target-outcome"], coverage_domain_ids: [],
    required_object_ids: ["field-target-outcome"], kind: "completeness",
    operation: "Resolve the displayed target or outcome to individually addressable Evidence Tokens.",
    allowed_claim: "The displayed target identity is or is not traceable within the inspected Project Record.",
  },
  {
    id: "CHK-POPULATION-SCOPE-TRACE", version: "1.0.0", label: "Population scope source",
    question_ids: ["Q-POPULATION-1"], object_ids: ["field-population-scope"], coverage_domain_ids: [],
    required_object_ids: ["field-population-scope"], kind: "completeness",
    operation: "Resolve the displayed population and scope to individually addressable Evidence Tokens.",
    allowed_claim: "The displayed population scope is or is not traceable within the inspected Project Record.",
  },
  {
    id: "CHK-EVALUATION-DESIGN-TRACE", version: "1.0.0", label: "Evaluation protocol source",
    question_ids: ["Q-EVALUATION-DESIGN-1"], object_ids: ["field-evaluation-design"], coverage_domain_ids: [],
    required_object_ids: ["field-evaluation-design"], kind: "completeness",
    operation: "Resolve the displayed evaluation protocol to individually addressable Evidence Tokens.",
    allowed_claim: "The displayed evaluation design is or is not traceable within the inspected Project Record.",
  },
  {
    id: "CHK-POPULATION-FILTER-TRACE", version: "1.0.0", label: "Population filter source",
    question_ids: ["Q-FILTERS-1"], object_ids: ["field-main-population-filters"], coverage_domain_ids: [],
    required_object_ids: ["field-main-population-filters"], kind: "completeness",
    operation: "Resolve the displayed population filters to individually addressable Evidence Tokens.",
    allowed_claim: "The displayed filter summary is or is not traceable within the inspected Project Record.",
  },
  {
    id: "CHK-PROJECT-CONTEXT-COVERAGE", version: "1.0.0", label: "Material project context",
    question_ids: ["Q-USE-1", "Q-POPULATION-1", "Q-COVERAGE-CONTEXT-1"],
    object_ids: ["field-purpose", "field-intended-use", "field-population-scope"], coverage_domain_ids: ["coverage-project-context"],
    required_object_ids: ["field-purpose", "field-intended-use", "field-population-scope", "field-data-sources"], kind: "completeness",
    operation: "Verify that the current purpose, intended use, population scope, and material data sources resolve to Evidence Tokens.",
    allowed_claim: "Required current context is or is not resolved inside the inspected evidence boundary.",
  },
  {
    id: "CHK-PRIMARY-RESULT-ORIGIN", version: "1.0.0", label: "Primary result origin",
    question_ids: ["Q-PRIMARY-RESULT-1", "Q-EVALUATION-DESIGN-1", "Q-COVERAGE-TRACE-1"],
    object_ids: ["field-primary-result", "field-target-outcome", "field-evaluation-design"], coverage_domain_ids: ["coverage-traceability"],
    required_object_ids: ["field-primary-result", "field-target-outcome", "field-evaluation-design"], kind: "primary_origin",
    operation: "Verify that a displayed primary result has its own evidence and resolved target and evaluation-design context.",
    allowed_claim: "The displayed result has or lacks the structured target and evaluation context inspected by this check.",
  },
  {
    id: "CHK-SAMPLE-LINEAGE", version: "1.0.0", label: "Sample lineage identity",
    question_ids: ["Q-SOURCE-DATA-1", "Q-MODEL-SAMPLE-1", "Q-EVALUATION-SAMPLE-1", "Q-COVERAGE-TRACE-2"],
    object_ids: ["field-source-data", "field-model-sample", "field-evaluation-sample", "field-primary-result", "field-main-population-filters"],
    coverage_domain_ids: ["coverage-traceability", "coverage-reproducibility"],
    required_object_ids: ["field-source-data", "field-model-sample", "field-evaluation-sample"], kind: "sample_lineage",
    operation: "Verify that source, model, and evaluation samples have distinct structured identities, counts, units, and Evidence Tokens.",
    allowed_claim: "The three canonical sample roles are or are not structurally resolvable in this Project Record.",
  },
  {
    id: "CHK-SOURCE-INVENTORY-COVERAGE", version: "1.0.0", label: "Authorised source inventory",
    question_ids: ["Q-DATA-SOURCES-1", "Q-SOURCE-DATA-1", "Q-COVERAGE-SOURCE-1"],
    object_ids: ["field-data-sources", "field-source-data"], coverage_domain_ids: ["coverage-source"],
    required_object_ids: ["field-data-sources", "field-source-data"], kind: "source_inventory",
    operation: "Compare the structured data-source and source-data fields with the individually addressable evidence inventory.",
    allowed_claim: "Material sources represented in the current record are or are not traceable inside the inspected boundary.",
  },
  {
    id: "CHK-REPRODUCTION-INPUT-COVERAGE-V2", version: "2.0.0", label: "Result reproduction inputs",
    question_ids: ["Q-PRIMARY-RESULT-2", "Q-COVERAGE-REPRO-1"], object_ids: ["field-primary-result"],
    coverage_domain_ids: ["coverage-reproducibility"],
    required_object_ids: ["field-primary-result", "field-source-data", "field-model-sample", "field-evaluation-sample", "field-evaluation-design"],
    kind: "reproduction_inputs",
    operation: "Verify the structured identities needed to reconstruct a displayed result and the presence of executable and configuration evidence.",
    allowed_claim: "The declared reproduction inputs inspected by this bounded check are or are not resolvable.",
  },
];

export const CHECK_DEFINITIONS = Object.freeze([
  ...CHECK_DEFINITIONS_INTERNAL,
  ...Object.entries(GRAPH_CHECK_DEFINITIONS)
    .filter(([id]) => !CHECK_DEFINITIONS_INTERNAL.some((definition) => definition.id === id))
    .map(([id, definition]) => ({ id, ...definition, allowed_claim: definition.allowed, operation: definition.operation, question_ids: definition.question_ids })),
  ...Object.entries(MATERIAL_EVIDENCE_CHECK_DEFINITIONS)
    .map(([id, definition]) => ({ id, ...definition, allowed_claim: definition.allowed, operation: definition.operation, question_ids: definition.question_ids })),
].map((definition) => Object.freeze({ ...definition })));

function digest(...parts) {
  return crypto.createHash("sha256").update(parts.map((part) => JSON.stringify(part)).join("|")).digest("hex").slice(0, 12).toUpperCase();
}

function atPath(record, dottedPath) {
  return dottedPath.split(".").reduce((value, part) => value?.[part], record?.reconstruction);
}

function objectFor(record, objectId) {
  const definition = FIELD_DEFINITIONS[objectId];
  return definition ? atPath(record, definition.path) : null;
}

function evidenceIndex(record) {
  return new Map((record?.evidence || []).map((entry) => [entry.id, entry]));
}

function validEvidenceIds(value, index) {
  return [...new Set((value?.evidence_ids || []).filter((id) => index.has(id)))];
}

function structurallyEstablished(value, index, definition) {
  if (!value || value.state !== "established" || validEvidenceIds(value, index).length === 0) return false;
  if (definition?.path?.startsWith("samples.")) {
    const quantified = Number.isFinite(value.count)
      || /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:thousand|million|billion|trillion|[KMBT])?\b/i.test(String(value.display || ""));
    return quantified && Boolean(String(value.unit || "").trim());
  }
  if (definition?.path === "results_evaluation.primary_result") {
    return Boolean(String(value.display_value || "").trim() && String(value.metric || "").trim());
  }
  return Boolean(String(value.value ?? value.display ?? "").trim());
}

function inputFor(record, objectId, index) {
  const definition = FIELD_DEFINITIONS[objectId];
  const value = objectFor(record, objectId);
  return {
    object_id: objectId,
    label: definition?.label || objectId,
    record_path: definition?.path || null,
    state: value?.state || "absent",
    epistemic: value?.epistemic || "UNRESOLVED",
    evidence_ids: validEvidenceIds(value, index),
    established: structurallyEstablished(value, index, definition),
  };
}

function gapFor(executionId, input, claimEffect = "limits") {
  return {
    gap_id: `GAP-${digest(executionId, input.object_id)}`,
    object_id: input.object_id,
    description: `${input.label} is not structurally established with an addressable evidence trail.`,
    claim_effect: claimEffect,
  };
}

function supportingEvidence(inputs) {
  return [...new Set(inputs.flatMap((input) => input.evidence_ids))];
}

function executionBase(record, definition, inputs) {
  const executionId = `EXEC-${digest(record.audit_id, definition.id, definition.version, "current")}`;
  return {
    execution_id: executionId,
    check_id: definition.id,
    check_version: definition.version,
    label: definition.label,
    implementation_status: "implemented",
    question_ids: definition.question_ids,
    mapped_object_ids: definition.object_ids,
    coverage_domain_ids: definition.coverage_domain_ids,
    scope: {
      project_id: record.project_id,
      audit_id: record.audit_id,
      workstream: "current",
      snapshot: record.source_project?.content_snapshot_after || record.source_project?.content_snapshot_before || null,
    },
    inputs,
    required_evidence: definition.required_object_ids.map((id) => ({ object_id: id, requirement: "Established structured value with at least one resolvable Evidence Token." })),
    optional_evidence: [],
    operation: definition.operation,
    configuration: { rule_version: definition.version, evidence_boundary: "current stored Project Record" },
    threshold: null,
    materiality_rule: { version: "1.0.0", rule: "A gap is material only when a current displayed claim depends on the missing structured relationship." },
    allowed_claims: [definition.allowed_claim],
    prohibited_claims: ["General absence outside the inspected evidence boundary.", "Project quality, compliance, intention, causality, discrimination, harm, or readiness."],
    alternatives: ["Relevant evidence may exist outside the authorised or inspected Project Record."],
    presentation: definition.presentation || null,
    evidence: { supporting: supportingEvidence(inputs), contradicting: [], qualifying: [], contextual: [] },
    unresolved_relationships: [],
  };
}

function finishExecution(base, result, resultSummary, gaps = [], materiality = "none") {
  const reasonIds = gaps.length ? gaps.map((gap) => gap.gap_id) : [base.execution_id];
  return {
    ...base,
    applicable: result !== CHECK_RESULTS.NOT_APPLICABLE,
    applicability_reason: result === CHECK_RESULTS.NOT_APPLICABLE
      ? "The check has no displayed primary analytical result or sample role to inspect in this scope."
      : "The mapped Overview or coverage concept exists in the current Project Record contract.",
    result,
    result_summary: resultSummary,
    materiality: { level: materiality, rule_version: "1.0.0", factors: gaps.map((gap) => gap.object_id) },
    gaps,
    state_reason_ids: reasonIds,
    trail: {
      question_ids: base.question_ids,
      execution_id: base.execution_id,
      operation: base.operation,
      input_object_ids: base.inputs.map((input) => input.object_id),
      evidence_ids: base.evidence.supporting,
      gap_ids: gaps.map((gap) => gap.gap_id),
    },
  };
}

function executeCompleteness(record, definition, index) {
  const inputs = definition.required_object_ids.map((id) => inputFor(record, id, index));
  const base = executionBase(record, definition, inputs);
  const missing = inputs.filter((input) => !input.established);
  if (!missing.length) return finishExecution(base, CHECK_RESULTS.ABSENT, `${definition.label} is resolved to the inspected evidence.`, [], "none");
  const gaps = missing.map((input) => gapFor(base.execution_id, input));
  return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, `${definition.label} cannot be fully resolved from the current structured evidence.`, gaps, "undetermined");
}

function primaryIsDisplayed(record, index) {
  return structurallyEstablished(objectFor(record, "field-primary-result"), index, FIELD_DEFINITIONS["field-primary-result"]);
}

function executePrimaryOrigin(record, definition, index) {
  const inputs = definition.required_object_ids.map((id) => inputFor(record, id, index));
  const base = executionBase(record, definition, inputs);
  if (!primaryIsDisplayed(record, index)) {
    const missing = inputs.filter((input) => !input.established);
    const gaps = missing.map((input) => gapFor(base.execution_id, input));
    return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, "A primary result origin cannot be assessed because no structured primary result is established; conceptual non-applicability is not documented.", gaps, "undetermined");
  }
  const missing = inputs.filter((input) => !input.established);
  if (!missing.length) return finishExecution(base, CHECK_RESULTS.ABSENT, "The displayed primary result has a resolved result, target, and evaluation-design trail.");
  const gaps = missing.map((input) => gapFor(base.execution_id, input, "limits"));
  return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, "The displayed primary result does not have sufficient evidence for every required target or evaluation-design dependency.", gaps, "high");
}

function executeSampleLineage(record, definition, index) {
  const inputs = definition.required_object_ids.map((id) => inputFor(record, id, index));
  const base = executionBase(record, definition, inputs);
  const hasAnySample = inputs.some((input) => input.state === "established");
  const primaryDisplayed = primaryIsDisplayed(record, index);
  const missing = inputs.filter((input) => !input.established);
  if (!hasAnySample && !primaryDisplayed) {
    const gaps = missing.map((input) => gapFor(base.execution_id, input));
    return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, "No sample role is structurally established, and the current record does not document conceptual non-applicability.", gaps, "undetermined");
  }
  if (!missing.length) return finishExecution(base, CHECK_RESULTS.ABSENT, "Source, model, and evaluation sample roles are separately identified and traced.");
  const gaps = missing.map((input) => gapFor(base.execution_id, input, primaryDisplayed ? "limits" : "contextualises"));
  if (!primaryDisplayed) return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, "The sample lineage is incomplete, but no current primary-result claim depends on it.", gaps, "undetermined");
  return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, `The available evidence is insufficient to resolve the displayed primary result's sample lineage: ${missing.map((input) => input.label).join(", ")}.`, gaps, "high");
}

function executeSourceInventory(record, definition, index) {
  const execution = executeCompleteness(record, definition, index);
  const hasInspectedEvidence = (record.evidence || []).some((entry) => entry.id !== "E-SYSTEM-PATH");
  if (!hasInspectedEvidence && execution.result === CHECK_RESULTS.INSUFFICIENT) {
    return { ...execution, result_summary: "No material inspected source is represented beyond the imported project identity." };
  }
  return execution;
}

function executeReproductionInputs(record, definition, index) {
  const inputs = definition.required_object_ids.map((id) => inputFor(record, id, index));
  const base = executionBase(record, definition, inputs);
  if (!primaryIsDisplayed(record, index)) {
    const gaps = inputs.filter((input) => !input.established).map((input) => gapFor(base.execution_id, input));
    return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, "Reproduction coverage cannot be assessed because no structured primary result is established; conceptual non-applicability is not documented.", gaps, "undetermined");
  }
  const missing = inputs.filter((input) => !input.established);
  const evidence = base.evidence.supporting.map((id) => index.get(id)).filter(Boolean);
  const hasExecutable = evidence.some((entry) => /notebook|source_code|code/.test(entry.kind));
  const hasConfiguration = evidence.some((entry) => /configuration|manifest|dependency|environment/.test(entry.kind));
  if (!hasExecutable) missing.push({ object_id: "evidence-executable", label: "Executable analytical evidence", evidence_ids: [], established: false });
  if (!hasConfiguration) missing.push({ object_id: "evidence-configuration", label: "Configuration or environment identity", evidence_ids: [], established: false });
  if (!missing.length) return finishExecution(base, CHECK_RESULTS.ABSENT, "The bounded reproduction inputs inspected by this check are structurally resolvable.");
  const gaps = missing.map((input) => gapFor(base.execution_id, input));
  return finishExecution(base, CHECK_RESULTS.INSUFFICIENT, "The available record does not establish every bounded reproduction input inspected by this check.", gaps, "undetermined");
}

function executeCheck(record, definition, index) {
  if (definition.kind === "primary_origin") return executePrimaryOrigin(record, definition, index);
  if (definition.kind === "sample_lineage") return executeSampleLineage(record, definition, index);
  if (definition.kind === "source_inventory") return executeSourceInventory(record, definition, index);
  if (definition.kind === "reproduction_inputs") return executeReproductionInputs(record, definition, index);
  return executeCompleteness(record, definition, index);
}

const PRIMARY_DEPENDENCIES = new Set([
  "field-primary-result", "field-target-outcome", "field-evaluation-design", "field-evaluation-sample",
  "field-model-sample", "field-source-data", "evidence-executable", "evidence-configuration",
  "evidence-analytical-code", "evidence-data-snapshot", "evidence-execution-context",
  "evidence-prediction-label-artifacts", "evidence-metric-origin",
]);

const CONFIDENCE_CAPS = Object.freeze({ blocks: 3, limits: 5, qualifies: 6, contextualises: 8 });

function uniqueImpacts(impacts) {
  return impacts.filter((impact, position, all) => all.findIndex((candidate) =>
    candidate.object_type === impact.object_type && candidate.object_id === impact.object_id && candidate.claim_effect === impact.claim_effect) === position);
}

function signalForExecution(execution) {
  if (execution.result !== CHECK_RESULTS.PRESENT || execution.materiality.level === "none") return null;
  const missingObjectIds = execution.gaps.map((gap) => gap.object_id).sort();
  const signalId = `SIG-${digest(execution.check_id, execution.check_version, execution.scope, missingObjectIds)}`;
  const condition = execution.result_summary;
  const impacts = uniqueImpacts([
    ...execution.gaps.filter((gap) => FIELD_DEFINITIONS[gap.object_id]).map((gap) => ({
      object_type: "overview_field", object_id: gap.object_id, claim_effect: gap.claim_effect,
      impact_reason: gap.description, confidence_dependency: PRIMARY_DEPENDENCIES.has(gap.object_id),
    })),
    ...execution.coverage_domain_ids.map((objectId) => ({
      object_type: "coverage_domain", object_id: objectId, claim_effect: "blocks",
      impact_reason: "The observed condition materially affects this evidence-coverage domain.",
    })),
  ]);
  return {
    finding_id: signalId,
    finding_type: "signal",
    signal_id: signalId,
    status: "active",
    condition,
    name: execution.label,
    producing_check: { check_id: execution.check_id, check_version: execution.check_version, execution_id: execution.execution_id, result: execution.result },
    related_check_execution_ids: [execution.execution_id],
    question_ids: execution.question_ids,
    scope: execution.scope,
    result: { exact_condition: condition, missing_object_ids: missingObjectIds },
    materiality: execution.materiality,
    primary_object_id: "field-primary-result",
    impacts,
    confidence_impact: impacts.some((impact) => impact.confidence_dependency)
      ? { claim_effect: "blocks", cap: CONFIDENCE_CAPS.blocks, dependency_object_ids: missingObjectIds.filter((id) => PRIMARY_DEPENDENCIES.has(id)) }
      : null,
    explanation: "The observed material condition limits what can be reconstructed and claimed inside the current evidence boundary.",
    presentation: {
      title: execution.presentation?.title || condition,
      condition_summary: execution.presentation?.condition_summary || condition,
      why_it_matters: execution.presentation?.why_it_matters || execution.allowed_claims[0],
      primary_scope: execution.presentation?.primary_scope || null,
      secondary_scopes: execution.presentation?.secondary_scopes || [],
    },
    claims: {
      allowed: ["The bounded condition was detected by the named deterministic check."],
      prohibited: ["The condition proves general project quality, compliance, intention, causality, discrimination, harm, or readiness."],
    },
    alternatives: execution.alternatives,
    evidence: execution.evidence,
    gaps: execution.gaps,
    trail: { ...execution.trail, finding_id: signalId, signal_id: signalId },
    review: { useful: true, reason: "Human context may resolve or properly bound the detected condition." },
  };
}

function canonicalSignals(executions) {
  const grouped = Map.groupBy(
    executions.filter((execution) => execution.result === CHECK_RESULTS.PRESENT && execution.canonical_condition_key),
    (execution) => `${execution.check_id}|${execution.check_version}|${execution.canonical_condition_key}`,
  );
  return [...grouped.values()].map((members) => {
    const scoped = [...members].sort((left, right) => left.execution_id.localeCompare(right.execution_id));
    const first = scoped[0];
    const scopeObjectIds = [...new Set(scoped.flatMap((execution) => execution.scope_object_ids || execution.trail.input_object_ids))].sort();
    const signalId = `SIG-${digest(first.check_id, first.check_version, first.canonical_condition_key, scopeObjectIds)}`;
    const impacts = uniqueImpacts(scoped.flatMap((execution) => execution.impacts || []));
    const evidence = {
      supporting: [...new Set(scoped.flatMap((execution) => execution.evidence.supporting))].sort(),
      contradicting: [...new Set(scoped.flatMap((execution) => execution.evidence.contradicting))].sort(),
      qualifying: [...new Set(scoped.flatMap((execution) => execution.evidence.qualifying))].sort(),
      contextual: [...new Set(scoped.flatMap((execution) => execution.evidence.contextual))].sort(),
    };
    const scopeLabels = [...new Set(scoped.map((execution) => execution.scope.display_label).filter(Boolean))];
    const aggregateLabel = first.aggregation_label || "affected analytical contexts";
    const primaryScope = scoped.length > 1 ? `${scoped.length} ${aggregateLabel}` : scopeLabels[0] || null;
    const secondaryScopes = scoped.length > 1
      ? [...scopeLabels.slice(0, 3), ...(scopeLabels.length > 3 ? [`+${scopeLabels.length - 3} additional contexts`] : [])]
      : [];
    const condition = scoped.length > 1
      ? `The same bounded condition is present in ${scoped.length} compatible scoped executions.`
      : first.conditions[0]?.description || first.result_summary;
    const materialityRank = { none: 0, low: 1, medium: 2, high: 3, critical: 4, undetermined: -1 };
    const materialityLevel = scoped.map((execution) => execution.materiality?.level || "none")
      .sort((left, right) => (materialityRank[right] ?? -1) - (materialityRank[left] ?? -1))[0];
    const presentationCondition = first.presentation?.condition_summary || first.conditions[0]?.description || first.result_summary;
    const aggregatePresentationCondition = first.presentation?.aggregate_condition_summary
      ?.replaceAll("{count}", String(scoped.length));
    const primaryImpact = impacts.find((impact) => impact.primary_owner) || impacts.find((impact) => impact.object_type === "overview_field");
    const confidenceImpacts = scoped.map((execution) => execution.confidence_impact).filter(Boolean);
    const confidenceImpact = confidenceImpacts.length ? {
      reason_code: confidenceImpacts[0].reason_code,
      claim_effect: confidenceImpacts[0].claim_effect,
      maximum_overall_score: Math.min(...confidenceImpacts.map((impact) => impact.maximum_overall_score)),
      minimum_reduction: Math.max(...confidenceImpacts.map((impact) => impact.minimum_reduction)),
      analytical_area_ids: [...new Set(confidenceImpacts.flatMap((impact) => impact.analytical_area_ids || []))].sort(),
    } : null;
    return {
      finding_id: signalId,
      finding_type: "signal",
      signal_id: signalId,
      status: "active",
      condition,
      name: first.label,
      producing_check: { check_id: first.check_id, check_version: first.check_version, execution_id: first.execution_id, result: first.result },
      related_check_execution_ids: scoped.map((execution) => execution.execution_id),
      question_ids: [...new Set(scoped.flatMap((execution) => execution.question_ids))],
      scope: { ...first.scope, aggregation: scoped.length > 1 ? "canonical_multi_scope" : "single_scope", scope_object_ids: scopeObjectIds },
      scoped_executions: scoped.map((execution) => ({ execution_id: execution.execution_id, scope: execution.scope, graph_object_ids: execution.trail.input_object_ids, evidence_ids: execution.trail.evidence_ids })),
      result: { exact_condition: condition, condition_type: first.canonical_condition_key, scope_object_ids: scopeObjectIds },
      materiality: { level: materialityLevel, rule_version: "1.1.0", factors: [first.canonical_condition_key, ...scopeObjectIds] },
      primary_object_id: primaryImpact?.object_id || null,
      impacts,
      confidence_impact: confidenceImpact,
      explanation: first.presentation?.why_it_matters || first.allowed_claims[0],
      presentation: {
        title: first.presentation?.title || first.label,
        condition_summary: scoped.length > 1 ? aggregatePresentationCondition || `${presentationCondition} This condition was found in ${scoped.length} compatible analytical contexts.` : presentationCondition,
        why_it_matters: first.presentation?.why_it_matters || first.allowed_claims[0],
        primary_scope: primaryScope,
        secondary_scopes: secondaryScopes,
      },
      claims: { allowed: first.allowed_claims, prohibited: first.prohibited_claims },
      alternatives: [...new Set(scoped.flatMap((execution) => execution.alternatives))],
      evidence,
      gaps: [],
      trail: {
        finding_id: signalId,
        signal_id: signalId,
        question_ids: [...new Set(scoped.flatMap((execution) => execution.question_ids))],
        execution_ids: scoped.map((execution) => execution.execution_id),
        graph_object_ids: scopeObjectIds,
        graph_object_refs: scoped.flatMap((execution) => execution.trail.graph_object_refs || []),
        evidence_ids: [...new Set(Object.values(evidence).flat())],
        gap_ids: [],
      },
      review: { useful: true, reason: "Human context may qualify the bounded condition without changing its deterministic status." },
    };
  });
}

function gapIsMaterial(record, gap, index) {
  if (materialAnalyticalArea(gap.object_id)) return true;
  if (PRIMARY_DEPENDENCIES.has(gap.object_id)) {
    return gap.object_id === "field-primary-result" || primaryIsDisplayed(record, index);
  }
  const value = objectFor(record, gap.object_id);
  return value?.state === "established";
}

function gapClaimEffect(objectId) {
  if (materialAnalyticalArea(objectId)) return "blocks";
  if (objectId === "field-primary-result") return "blocks";
  if (["field-target-outcome", "field-evaluation-design", "field-evaluation-sample"].includes(objectId)) return "limits";
  if (PRIMARY_DEPENDENCIES.has(objectId)) return "qualifies";
  return "contextualises";
}

function evidenceGapFindings(record, checks, index) {
  const grouped = new Map();
  for (const execution of checks.filter((item) => item.result === CHECK_RESULTS.INSUFFICIENT)) {
    for (const gap of execution.gaps.filter((item) => gapIsMaterial(record, item, index))) {
      const existing = grouped.get(gap.object_id) || { gap, executions: [] };
      existing.executions.push(execution);
      grouped.set(gap.object_id, existing);
    }
  }
  return [...grouped.values()].map(({ gap, executions }) => {
    const effect = gapClaimEffect(gap.object_id);
    const findingId = `EGAP-${digest(record.audit_id, gap.object_id, "material-evidence-gap", "0.10.1")}`;
    const definition = FIELD_DEFINITIONS[gap.object_id];
    const analyticalArea = materialAnalyticalArea(gap.object_id);
    const label = definition?.label
      || executions.flatMap((item) => item.inputs).find((input) => input.object_id === gap.object_id)?.label
      || gap.description.replace(/ is not structurally established.*$/, "");
    const coverageIds = [...new Set(executions.flatMap((execution) => execution.coverage_domain_ids))];
    const primaryDependency = PRIMARY_DEPENDENCIES.has(gap.object_id);
    const coverageEffect = gap.object_id.startsWith("evidence-") ? "limits" : "blocks";
    const impacts = uniqueImpacts([
      ...(definition ? [{ object_type: "overview_field", object_id: gap.object_id, claim_effect: "blocks", impact_reason: gap.description, confidence_dependency: primaryDependency }] : []),
      ...(analyticalArea ? [{ object_type: "analytical_area", object_id: analyticalArea.id, claim_effect: "blocks", impact_reason: gap.description, confidence_dependency: false }] : []),
      ...(primaryDependency && gap.object_id !== "field-primary-result" ? [{
        object_type: "overview_field", object_id: "field-primary-result", claim_effect: effect,
        impact_reason: `${label} is an explicit dependency of the displayed primary result.`, confidence_dependency: true,
      }] : []),
      ...coverageIds.map((objectId) => ({
        object_type: "coverage_domain", object_id: objectId, claim_effect: coverageEffect,
        impact_reason: `${label} is unresolved within this bounded coverage check.`,
      })),
      ...(coverageIds.length ? [{
        object_type: "coverage_aggregate", object_id: "project-evidence-coverage", claim_effect: coverageEffect,
        impact_reason: `${label} leaves a material gap in at least one evidence-coverage domain.`,
      }] : []),
    ]);
    const evidence = {
      supporting: [...new Set(executions.flatMap((item) => item.evidence.supporting))],
      contradicting: [...new Set(executions.flatMap((item) => item.evidence.contradicting))],
      qualifying: [...new Set(executions.flatMap((item) => item.evidence.qualifying))],
      contextual: [...new Set(executions.flatMap((item) => item.evidence.contextual))],
    };
    return {
      finding_id: findingId,
      finding_type: "evidence_gap",
      evidence_gap_id: findingId,
      status: "active",
      condition: gap.description,
      name: `${label} evidence is insufficient.`,
      producing_check: {
        check_id: executions[0].check_id, check_version: executions[0].check_version,
        execution_id: executions[0].execution_id, result: CHECK_RESULTS.INSUFFICIENT,
      },
      related_check_execution_ids: executions.map((item) => item.execution_id),
      question_ids: [...new Set(executions.flatMap((item) => item.question_ids))],
      scope: executions[0].scope,
      result: { exact_condition: gap.description, missing_object_ids: [gap.object_id] },
      materiality: { level: "high", rule_version: "1.0.0", factors: [gap.object_id] },
      primary_object_id: primaryDependency ? "field-primary-result" : null,
      impacts,
      confidence_impact: primaryDependency ? {
        claim_effect: effect,
        cap: CONFIDENCE_CAPS[effect],
        dependency_object_ids: [gap.object_id],
        blocks_primary_existence: gap.object_id === "field-primary-result",
      } : null,
      explanation: primaryDependency
        ? "The available evidence does not establish a dependency required to interpret or reproduce the displayed primary result."
        : "The available evidence is insufficient for this bounded material claim, but it is not a primary-result dependency.",
      presentation: {
        title: `${label} is incomplete`,
        condition_summary: `Bóveda cannot establish ${label.toLocaleLowerCase("en")} from the inspected evidence.`,
        why_it_matters: primaryDependency
          ? "This dependency is required to interpret or reproduce the displayed primary result."
          : "The evidence record is insufficient for this bounded coverage question.",
        primary_scope: analyticalArea?.label || null,
        secondary_scopes: [],
      },
      claims: {
        allowed: ["The named dependency is unresolved inside the inspected Project Record."],
        prohibited: ["The missing evidence does not exist outside the inspected boundary.", "The project or result is technically unsound."],
      },
      alternatives: [...new Set(executions.flatMap((item) => item.alternatives))],
      evidence,
      gaps: [{ ...gap, gap_id: findingId, claim_effect: effect }],
      trail: {
        finding_id: findingId,
        question_ids: [...new Set(executions.flatMap((item) => item.question_ids))],
        execution_ids: executions.map((item) => item.execution_id),
        evidence_ids: [...new Set(Object.values(evidence).flat())],
        gap_ids: [findingId],
      },
      review: { useful: true, reason: "Human context may identify authorised evidence outside the current inspected record." },
    };
  });
}

function confidenceLabel(score) {
  return ["Not established", "Minimal support", "Grounded", "Contextualised", "Evaluation bounded", "Sample bounded", "Reproducibly supported", "Strongly supported", "Fully supported within scope"][score];
}

function deriveResultConfidence(record, checks, findings, index) {
  const primary = objectFor(record, "field-primary-result");
  const identifiablePrimary = primary?.state === "established" && Boolean(String(primary?.metric || "").trim() && String(primary?.display_value || "").trim());
  const primaryGrounded = identifiablePrimary && validEvidenceIds(primary, index).length > 0;
  const hasMethodAndTarget = primaryGrounded && Boolean(String(primary?.method || "").trim())
    && structurallyEstablished(objectFor(record, "field-target-outcome"), index, FIELD_DEFINITIONS["field-target-outcome"]);
  const hasEvaluationDesign = hasMethodAndTarget
    && structurallyEstablished(objectFor(record, "field-evaluation-design"), index, FIELD_DEFINITIONS["field-evaluation-design"]);
  const hasEvaluationBoundary = hasEvaluationDesign
    && structurallyEstablished(objectFor(record, "field-evaluation-sample"), index, FIELD_DEFINITIONS["field-evaluation-sample"])
    && structurallyEstablished(objectFor(record, "field-period"), index, FIELD_DEFINITIONS["field-period"]);
  const reproduction = checks.find((item) => item.check_id === "CHK-REPRODUCTION-INPUT-COVERAGE-V2");
  const reproducible = hasEvaluationBoundary && reproduction?.result === CHECK_RESULTS.ABSENT;
  const materialPrimaryFindings = findings.filter((finding) => finding.status === "active" && finding.confidence_impact
    && ["blocks", "limits"].includes(finding.confidence_impact.claim_effect));
  const noMaterialLimits = reproducible && materialPrimaryFindings.length === 0
    && findings.every((finding) => !finding.evidence?.contradicting?.length);
  const completeBoundary = noMaterialLimits
    && ["field-known-limitation", "field-establishes", "field-does-not-establish"].every((id) => structurallyEstablished(objectFor(record, id), index, FIELD_DEFINITIONS[id]))
    && findings.every((finding) => finding.finding_type !== "evidence_gap" || !finding.confidence_impact);
  const passes = [true, identifiablePrimary, primaryGrounded, hasMethodAndTarget, hasEvaluationDesign, hasEvaluationBoundary, reproducible, noMaterialLimits, completeBoundary];
  let evidenceScore = 0;
  for (let step = 1; step <= 8 && passes[step]; step += 1) evidenceScore = step;

  const capFindings = findings.filter((finding) => finding.status === "active" && finding.confidence_impact);
  const materialAbsenceFindings = capFindings.filter((finding) => finding.confidence_impact.reason_code === "material_evidence_absence");
  const dependencyCapFindings = capFindings.filter((finding) => finding.confidence_impact.reason_code !== "material_evidence_absence");
  const dependencyCap = dependencyCapFindings.reduce((current, finding) => finding.confidence_impact.blocks_primary_existence
    ? 0 : Math.min(current, finding.confidence_impact.cap), 8);
  const resultTraceScore = Math.min(evidenceScore, dependencyCap);
  const materialAbsenceMaximum = materialAbsenceFindings.length
    ? Math.min(...materialAbsenceFindings.map((finding) => finding.confidence_impact.maximum_overall_score))
    : 8;
  const materialAbsenceReduction = materialAbsenceFindings.length
    ? Math.max(...materialAbsenceFindings.map((finding) => finding.confidence_impact.minimum_reduction))
    : 0;
  const materialAbsenceCap = materialAbsenceFindings.length
    ? Math.min(materialAbsenceMaximum, Math.max(0, resultTraceScore - materialAbsenceReduction))
    : 8;
  const cap = Math.min(dependencyCap, materialAbsenceCap);
  const score = Math.min(evidenceScore, cap);
  const failedStep = score < 8 ? score + 1 : null;
  const gapCaps = capFindings.filter((finding) => finding.confidence_impact.blocks_primary_existence
    || finding.confidence_impact.cap === cap
    || (finding.confidence_impact.reason_code === "material_evidence_absence" && materialAbsenceFindings.length));
  const affectedAreaIds = [...new Set(materialAbsenceFindings.flatMap((finding) => finding.confidence_impact.analytical_area_ids || []))].sort();
  const explanation = score === 0
    ? "No identifiable primary result is grounded in the stored evidence."
    : `The stored evidence satisfies ${score} of 8 cumulative support steps${failedStep ? `; step ${failedStep} is not established` : ""}${cap < evidenceScore ? ` and a material Finding caps the result at ${cap}` : ""}.`;
  return {
    score,
    maximum: 8,
    label: confidenceLabel(score),
    evidence_score: evidenceScore,
    finding_cap: cap,
    ...(materialAbsenceFindings.length ? {
      result_trace_score: resultTraceScore,
      material_evidence_absence: {
        active: true,
        affected_area_count: affectedAreaIds.length,
        affected_area_ids: affectedAreaIds,
        finding_ids: materialAbsenceFindings.map((finding) => finding.finding_id),
      },
    } : {}),
    explanation,
    evidence_ids: validEvidenceIds(primary, index),
    reason_ids: gapCaps.map((finding) => finding.finding_id),
    ladder: [
      { score: 1, label: "Identifiable primary result", passed: identifiablePrimary },
      { score: 2, label: "Direct metric and value evidence", passed: primaryGrounded },
      { score: 3, label: "Model or method and target", passed: hasMethodAndTarget },
      { score: 4, label: "Evaluation design", passed: hasEvaluationDesign },
      { score: 5, label: "Evaluation sample, period, and denominator", passed: hasEvaluationBoundary },
      { score: 6, label: "Reproducibly supported", passed: reproducible },
      { score: 7, label: "No material limits, blocks, or contradictions", passed: noMaterialLimits },
      { score: 8, label: "Complete trail, boundaries, and no primary gaps", passed: completeBoundary },
    ],
    caps: gapCaps.map((finding) => finding.confidence_impact.reason_code === "material_evidence_absence" ? {
      finding_id: finding.finding_id,
      claim_effect: finding.confidence_impact.claim_effect,
      cap: materialAbsenceCap,
      reason_code: finding.confidence_impact.reason_code,
    } : {
      finding_id: finding.finding_id,
      claim_effect: finding.confidence_impact.claim_effect,
      cap: finding.confidence_impact.blocks_primary_existence ? 0 : finding.confidence_impact.cap,
    }),
    derivation: materialAbsenceFindings.length ? "deterministic_cumulative_v0.10.2" : "deterministic_cumulative_v0.10.1",
  };
}

function fieldState(record, objectId, checks, findings, index) {
  const definition = FIELD_DEFINITIONS[objectId];
  const value = objectFor(record, objectId);
  const relevantChecks = checks.filter((execution) => execution.mapped_object_ids.includes(objectId));
  const impacts = findings.flatMap((finding) => finding.impacts.filter((impact) => impact.object_type === "overview_field" && impact.object_id === objectId).map((impact) => ({ finding, impact })));
  const blocking = impacts.filter(({ impact }) => impact.claim_effect === "blocks");
  if (blocking.length) return { object_id: objectId, assessment_status: "assessed", state: "material_limitation", ...STATES.limitation, state_reason_ids: blocking.map(({ finding }) => finding.finding_id) };
  const limiting = impacts.filter(({ impact }) => ["limits", "qualifies"].includes(impact.claim_effect));
  if (limiting.length) return { object_id: objectId, assessment_status: "assessed", state: "requires_context", ...STATES.context, state_reason_ids: limiting.map(({ finding }) => finding.finding_id) };
  if (!relevantChecks.length) return { object_id: objectId, assessment_status: "not_implemented", state: null, colour: null, label: "Not assessed", state_reason_ids: [] };
  if (structurallyEstablished(value, index, definition)) {
    return { object_id: objectId, assessment_status: "assessed", state: "established", ...STATES.established, state_reason_ids: relevantChecks.map((execution) => execution.execution_id) };
  }
  const insufficient = relevantChecks.filter((execution) => execution.result === CHECK_RESULTS.INSUFFICIENT && execution.gaps.some((gap) => gap.object_id === objectId));
  if (insufficient.length) return { object_id: objectId, assessment_status: "assessed", state: "not_established", ...STATES.missing, state_reason_ids: insufficient.map((execution) => execution.execution_id) };
  if (relevantChecks.every((execution) => execution.result === CHECK_RESULTS.NOT_APPLICABLE)) return { object_id: objectId, assessment_status: "not_implemented", state: null, colour: null, label: "Not assessed", state_reason_ids: [] };
  return { object_id: objectId, assessment_status: "assessed", state: "not_established", ...STATES.missing, state_reason_ids: relevantChecks.map((execution) => execution.execution_id) };
}

export function aggregateOverviewState(id, childStates) {
  const assessed = childStates.filter((state) => state?.state);
  const unassessed = childStates.filter((state) => state?.assessment_status === "not_implemented" || !state?.state);
  if (!assessed.length) return { object_id: id, assessment_status: "not_implemented", state: null, colour: null, label: "Not assessed", state_reason_ids: [] };
  const reasonsFor = (predicate) => [...new Set(assessed.filter(predicate).flatMap((state) => state.state_reason_ids))];
  if (assessed.some((state) => state.state === "material_limitation")) return { object_id: id, assessment_status: "assessed", state: "material_limitation", ...STATES.limitation, state_reason_ids: reasonsFor((state) => state.state === "material_limitation") };
  if (assessed.some((state) => ["requires_context", "partially_established"].includes(state.state))) return { object_id: id, assessment_status: "assessed", state: "partially_established", ...STATES.partial, state_reason_ids: reasonsFor((state) => ["requires_context", "partially_established"].includes(state.state)) };
  const established = assessed.filter((state) => state.state === "established");
  const missing = assessed.filter((state) => state.state === "not_established");
  if (established.length && missing.length) return { object_id: id, assessment_status: "assessed", state: "not_established", ...STATES.missing, state_reason_ids: reasonsFor((state) => state.state !== "established") };
  if (established.length) return { object_id: id, assessment_status: "assessed", state: "established", ...STATES.established, state_reason_ids: reasonsFor((state) => state.state === "established") };
  if (assessed.every((state) => state.state === "not_applicable")) {
    if (unassessed.length) return { object_id: id, assessment_status: "not_implemented", state: null, colour: null, label: "Not assessed", state_reason_ids: [] };
    return { object_id: id, assessment_status: "assessed", state: "not_applicable", ...STATES.inapplicable, state_reason_ids: reasonsFor(() => true) };
  }
  return { object_id: id, assessment_status: "assessed", state: "not_established", ...STATES.missing, state_reason_ids: reasonsFor(() => true) };
}

function coverageState(domain, checks, findings) {
  const executions = checks.filter((execution) => execution.coverage_domain_ids.includes(domain.id));
  const impacts = findings.flatMap((finding) => finding.impacts.filter((impact) => impact.object_type === "coverage_domain" && impact.object_id === domain.id).map((impact) => ({ finding, impact })));
  const blocking = impacts.filter(({ impact }) => impact.claim_effect === "blocks");
  if (blocking.length) return { object_id: domain.id, assessment_status: "assessed", state: "material_evidence_gap", ...COVERAGE_STATES.gap, state_reason_ids: blocking.map(({ finding }) => finding.finding_id) };
  const limiting = impacts.filter(({ impact }) => ["limits", "qualifies"].includes(impact.claim_effect));
  if (limiting.length) return { object_id: domain.id, assessment_status: "assessed", state: "partially_covered", ...COVERAGE_STATES.partial, state_reason_ids: limiting.map(({ finding }) => finding.finding_id) };
  if (!executions.length) return { object_id: domain.id, assessment_status: "not_implemented", state: "not_assessed", ...COVERAGE_STATES.unassessed, state_reason_ids: [] };
  if (executions.every((execution) => execution.result === CHECK_RESULTS.NOT_APPLICABLE)) return { object_id: domain.id, assessment_status: "assessed", state: "not_applicable", ...COVERAGE_STATES.inapplicable, state_reason_ids: executions.map((execution) => execution.execution_id) };
  const insufficient = executions.filter((execution) => execution.result === CHECK_RESULTS.INSUFFICIENT);
  if (insufficient.length) {
    return { object_id: domain.id, assessment_status: "assessed", state: "not_assessed", ...COVERAGE_STATES.unassessed, state_reason_ids: insufficient.map((execution) => execution.execution_id) };
  }
  if (executions.every((execution) => [CHECK_RESULTS.ABSENT, CHECK_RESULTS.NOT_APPLICABLE].includes(execution.result))) return { object_id: domain.id, assessment_status: "assessed", state: "sufficiently_covered", ...COVERAGE_STATES.sufficient, state_reason_ids: executions.map((execution) => execution.execution_id) };
  return { object_id: domain.id, assessment_status: "assessed", state: "not_assessed", ...COVERAGE_STATES.unassessed, state_reason_ids: executions.map((execution) => execution.execution_id) };
}

function overallCoverageState(domains) {
  const reasons = (matching) => [...new Set(domains.filter((domain) => matching(domain.state.state)).flatMap((domain) => domain.state.state_reason_ids))];
  const states = domains.map((domain) => domain.state.state);
  if (states.some((state) => state === "material_evidence_gap")) return { object_id: "project-evidence-coverage", state: "material_evidence_gap", ...COVERAGE_STATES.gap, state_reason_ids: reasons((state) => state === "material_evidence_gap") };
  if (states.some((state) => state === "partially_covered")) return { object_id: "project-evidence-coverage", state: "partially_covered", ...COVERAGE_STATES.partial, state_reason_ids: reasons((state) => state === "partially_covered") };
  const applicable = domains.filter((domain) => domain.state.state !== "not_applicable");
  if (applicable.length && applicable.every((domain) => domain.state.state === "sufficiently_covered")) return { object_id: "project-evidence-coverage", state: "sufficiently_covered", ...COVERAGE_STATES.sufficient, state_reason_ids: reasons((state) => state === "sufficiently_covered") };
  if (!applicable.length) return { object_id: "project-evidence-coverage", state: "not_applicable", ...COVERAGE_STATES.inapplicable, state_reason_ids: reasons(() => true) };
  return { object_id: "project-evidence-coverage", state: "not_assessed", ...COVERAGE_STATES.unassessed, state_reason_ids: reasons((state) => state !== "not_applicable") };
}

function rowEvidence(checks, findings) {
  return [...new Set([
    ...checks.flatMap((execution) => Object.values(execution.evidence).flat()),
    ...findings.flatMap((finding) => Object.values(finding.evidence).flat()),
  ])];
}

function buildRows(groups, coverageDomains, checks, findings) {
  const groupRows = groups.map((groupItem) => {
    const rowChecks = checks.filter((execution) => execution.mapped_object_ids.some((id) => groupItem.field_ids.includes(id)));
    const rowFindings = findings.filter((finding) => finding.impacts.some((impact) => impact.object_type === "overview_field" && groupItem.field_ids.includes(impact.object_id)));
    return { id: groupItem.id, family: groupItem.section_label, area: groupItem.label, summary: groupItem.summary, state: groupItem.state, field_ids: groupItem.field_ids, check_execution_ids: [...new Set(rowChecks.map((execution) => execution.execution_id))], finding_ids: [...new Set(rowFindings.map((finding) => finding.finding_id))], evidence_ids: rowEvidence(rowChecks, rowFindings), row_type: "overview_group" };
  });
  const coverageRows = coverageDomains.map((domain) => {
    const rowChecks = checks.filter((execution) => execution.coverage_domain_ids.includes(domain.id));
    const rowFindings = findings.filter((finding) => finding.impacts.some((impact) => impact.object_type === "coverage_domain" && impact.object_id === domain.id));
    return { id: domain.id, family: "Project Evidence Coverage", area: domain.label, summary: domain.summary, state: domain.state, field_ids: [], check_execution_ids: rowChecks.map((execution) => execution.execution_id), finding_ids: rowFindings.map((finding) => finding.finding_id), evidence_ids: rowEvidence(rowChecks, rowFindings), row_type: "coverage_domain" };
  });
  return [...groupRows, ...coverageRows];
}

const GRAPH_REPLACED_CHECK_IDS = new Set([
  "CHK-TARGET-IDENTITY-TRACE",
  "CHK-POPULATION-SCOPE-TRACE",
  "CHK-EVALUATION-DESIGN-TRACE",
  "CHK-POPULATION-FILTER-TRACE",
  "CHK-PRIMARY-RESULT-ORIGIN",
  "CHK-SAMPLE-LINEAGE",
  "CHK-REPRODUCTION-INPUT-COVERAGE-V2",
]);

export function buildSignalsLayer(record, { analyticalLayer = null, graph = analyticalLayer?.object_graph || null } = {}) {
  if (!record?.reconstruction || !record?.audit_id || !record?.project_id) throw new Error("A compatible stored Project Record is required to derive Findings.");
  const mainTargetStory = analyticalLayer?.presentation?.main_target_story;
  const populationAnswer = mainTargetStory?.section_answers?.data_populations_samples;
  const answeredSamples = populationAnswer?.dashboard_available ? mainTargetStory?.populations : null;
  const projectedProjectPopulation = answeredSamples?.source_data || analyticalLayer?.presentation?.project_population;
  const sampleProjection = {
    ...(projectedProjectPopulation ? { source_data: projectedProjectPopulation } : {}),
    ...(record.reconstruction.samples?.model_sample?.state !== "established" && answeredSamples?.model_sample?.state === "established"
      ? { model_sample: answeredSamples.model_sample } : {}),
    ...(record.reconstruction.samples?.evaluation_sample?.state !== "established" && answeredSamples?.evaluation_sample?.state === "established"
      ? { evaluation_sample: answeredSamples.evaluation_sample } : {}),
  };
  if (Object.keys(sampleProjection).length) record = {
    ...record,
    reconstruction: {
      ...record.reconstruction,
      samples: { ...record.reconstruction.samples, ...sampleProjection },
    },
  };
  const index = evidenceIndex(record);
  const legacyDefinitions = graph
    ? CHECK_DEFINITIONS_INTERNAL.filter((definition) => !GRAPH_REPLACED_CHECK_IDS.has(definition.id))
    : CHECK_DEFINITIONS_INTERNAL;
  const legacyChecks = legacyDefinitions.map((definition) => executeCheck(record, definition, index));
  const graphChecks = graph ? executeGraphChecks(graph, {
    project_id: record.project_id,
    audit_id: record.audit_id,
    snapshot: record.source_project?.content_snapshot_after || record.source_project?.content_snapshot_before || null,
    main_target_story: mainTargetStory || null,
    focal_evaluation_design: analyticalLayer?.presentation?.focal_results_evaluation?.evaluation_design
      || record.reconstruction.results_evaluation?.evaluation_design
      || null,
  }) : [];
  const materialMeta = {
    project_id: record.project_id,
    audit_id: record.audit_id,
    snapshot: record.source_project?.content_snapshot_after || record.source_project?.content_snapshot_before || null,
  };
  const materialAreaChecks = executeMaterialAreaCoverage(analyticalLayer, materialMeta);
  const preliminaryChecks = [...legacyChecks, ...graphChecks, ...materialAreaChecks];
  const evidenceGaps = evidenceGapFindings(record, preliminaryChecks, index);
  const materialAbsenceChecks = executeMaterialEvidenceAbsenceSignals(materialAreaChecks, evidenceGaps, materialMeta);
  const checks = [...preliminaryChecks, ...materialAbsenceChecks];
  const signals = graph ? canonicalSignals(checks) : checks.map(signalForExecution).filter(Boolean);
  const findings = [...signals, ...evidenceGaps];
  for (const execution of checks) {
    const signal = signals.find((candidate) => candidate.related_check_execution_ids.includes(execution.execution_id));
    if (signal) execution.signal_id = signal.signal_id;
    execution.finding_ids = findings.filter((finding) => finding.related_check_execution_ids.includes(execution.execution_id)).map((finding) => finding.finding_id);
  }

  const fields = Object.fromEntries(Object.keys(FIELD_DEFINITIONS).map((objectId) => [objectId, {
    ...FIELD_DEFINITIONS[objectId],
    state: fieldState(record, objectId, checks, findings, index),
    check_execution_ids: checks.filter((execution) => execution.mapped_object_ids.includes(objectId)).map((execution) => execution.execution_id),
    finding_ids: findings.filter((finding) => finding.impacts.some((impact) => impact.object_type === "overview_field" && impact.object_id === objectId)).map((finding) => finding.finding_id),
  }]));

  const groups = [];
  const sections = OVERVIEW_STRUCTURE.map((section) => {
    const sectionGroups = section.groups.map((groupItem) => {
      const groupState = aggregateOverviewState(groupItem.id, groupItem.field_ids.map((id) => fields[id].state));
      const resolved = { ...groupItem, section_id: section.id, section_label: section.label, state: groupState };
      groups.push(resolved);
      return resolved;
    });
    return { ...section, groups: sectionGroups, state: aggregateOverviewState(section.id, sectionGroups.map((groupItem) => groupItem.state)) };
  });

  const coverageDomains = COVERAGE_DOMAINS.map((domain) => ({ ...domain, state: coverageState(domain, checks, findings) }));
  const projectEvidenceCoverage = { ...overallCoverageState(coverageDomains), domains: coverageDomains };
  const resultConfidence = deriveResultConfidence(record, checks, findings, index);

  return {
    schema_version: SIGNALS_SCHEMA_VERSION,
    specification_version: SIGNALS_SPECIFICATION_VERSION,
    product_version: APPLICATION_VERSION,
    project_id: record.project_id,
    audit_id: record.audit_id,
    derived_from: { audit_id: record.audit_id, source_snapshot: record.source_project?.content_snapshot_after || null, analysed_at: record.analysed_at || null },
    execution_mode: "deterministic_offline",
    provider_calls: 0,
    overview: { sections, groups, fields },
    project_evidence_coverage: projectEvidenceCoverage,
    result_confidence: resultConfidence,
    checks,
    findings,
    signal_ids: signals.map((signal) => signal.finding_id),
    evidence_gap_ids: evidenceGaps.map((finding) => finding.finding_id),
    finding_count: new Set(findings.filter((finding) => finding.status === "active").map((finding) => finding.finding_id)).size,
    finding_breakdown: { signals: signals.length, evidence_gaps: evidenceGaps.length },
    rows: buildRows(groups, coverageDomains, checks, findings),
    epistemic_contract: ["OBSERVED", "DERIVED", "INTERPRETED_INFERRED", "UNRESOLVED"],
  };
}
