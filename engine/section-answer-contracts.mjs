const array = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(array(values).filter(Boolean))];

const QUESTIONS = Object.freeze({
  purpose_scope: "What is the project trying to do, for whom, and within what scope?",
  results_evaluation: "What is the main recorded result, how was it evaluated, and what does it mean?",
  feature_driver_evidence: "Which variables contribute most to the selected model, and by how much?",
  model_comparison: "How do genuinely comparable models perform on the same task and evaluation?",
  evaluation_behaviour: "Where does the selected model succeed, fail, or show a relevant performance pattern beyond the headline metric?",
  data_populations_samples: "What relevant source population, training sample, and evaluation sample were used?",
  data_missingness: "How much missingness exists for the relevant variables?",
  population_lineage: "How did the original population become the final training and evaluation samples?",
});

function established(value) {
  return value?.state === "established" && String(value?.value ?? value?.display ?? value?.display_value ?? "").trim().length > 0;
}

function evidenceOf(values) {
  return unique(array(values).flatMap((value) => array(value?.evidence_ids)));
}

function answer(id, { state, value = null, evidence = [], related = [], missing = [] }) {
  const evidenceIds = evidenceOf(evidence);
  const relatedEvidenceIds = evidenceOf(related);
  return {
    id,
    question: QUESTIONS[id],
    state,
    dashboard_available: state === "answered",
    answer: state === "answered" ? value : null,
    evidence_ids: evidenceIds,
    related_evidence_ids: unique([...evidenceIds, ...relatedEvidenceIds]),
    missing_requirements: unique(missing),
  };
}

function quantitativeResult(result) {
  return result?.state === "established"
    && Boolean(String(result?.metric || "").trim())
    && (Number.isFinite(result?.raw_value) || /[+-]?\d/.test(String(result?.display_value ?? "")));
}

function quantifiedSample(sample) {
  if (sample?.state !== "established") return false;
  if (Number.isFinite(sample?.count)) return true;
  return /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:thousand|million|billion|trillion|[KMBT])?\b/i.test(String(sample?.display || ""));
}

function comparableMetrics(set) {
  const results = array(set?.results).filter((item) => Number.isFinite(item?.value ?? item?.exact_value) && item?.method && item?.metric);
  return array(set?.metrics).filter((metric) => new Set(results.filter((item) => item.metric === metric.key).map((item) => item.method)).size >= 2);
}

function sharedComparisonContext(set, target, workstreamId) {
  const results = array(set?.results);
  if (!results.length) return false;
  const targetIds = unique(results.map((item) => item.target_id));
  const populations = unique(results.map((item) => item.population_id));
  const attempts = unique(results.map((item) => item.evaluation_attempt_id));
  const targetAligned = Boolean(
    (target?.id && (set?.target_id === target.id || (targetIds.length === 1 && targetIds[0] === target.id)))
    || (workstreamId && set?.workstream_id === workstreamId && targetIds.length === 0),
  );
  const sharedEvaluation = Boolean(
    populations.length === 1
    || attempts.length === 1
    || (set?.evaluation_attempt_id && results.every((item) => !item.evaluation_attempt_id || item.evaluation_attempt_id === set.evaluation_attempt_id))
  );
  return targetAligned && sharedEvaluation;
}

function numericFeature(item) {
  return Boolean(item?.feature && Number.isFinite(item?.value) && array(item?.evidence_ids).length);
}

function validDiagnostic(item) {
  if (!array(item?.evidence_ids).length) return false;
  if (item?.type === "confusion_matrix") {
    const values = array(item.values);
    return values.length >= 2
      && values.every((row) => array(row).length === values.length && row.every(Number.isFinite))
      && array(item.labels).length === values.length;
  }
  if (item?.type === "train_validation") return Number.isFinite(item.train_value) && Number.isFinite(item.validation_value) && Boolean(item.metric);
  return false;
}

function validMissingness(item) {
  if (!item?.field || !Number.isFinite(item?.value) || !array(item?.evidence_ids).length) return false;
  if (item.unit === "percent") return item.value >= 0 && item.value <= 100
    && (Number.isFinite(item.denominator) || Number.isFinite(item.pipeline_stage?.population_count));
  return /count|record|row|observation|case|item/i.test(String(item.unit || ""))
    && (Number.isFinite(item.denominator) || Number.isFinite(item.pipeline_stage?.population_count));
}

function connectedLineage(lineage, samples) {
  const contexts = array(lineage?.contexts);
  const valid = contexts.filter((context) => {
    const nodes = array(context.nodes);
    const edges = array(context.edges);
    const ids = new Set(nodes.map((node) => node.id));
    const sourceIds = nodes.filter((node) => node.role === "source").map((node) => node.id);
    const trainingIds = nodes.filter((node) => node.role === "training").map((node) => node.id);
    const evaluationIds = nodes.filter((node) => node.role === "evaluation").map((node) => node.id);
    const outgoing = new Map();
    for (const edge of edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to) || !array(edge.evidence_ids).length) continue;
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from).push(edge.to);
    }
    const reaches = (starts, goals) => {
      const wanted = new Set(goals);
      const queue = [...starts];
      const seen = new Set(queue);
      while (queue.length) {
        const current = queue.shift();
        if (wanted.has(current)) return true;
        for (const next of outgoing.get(current) || []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
      return false;
    };
    return sourceIds.length && trainingIds.length && evaluationIds.length
      && reaches(sourceIds, trainingIds) && reaches(sourceIds, evaluationIds);
  });
  return quantifiedSample(samples?.source_data) && quantifiedSample(samples?.model_sample) && quantifiedSample(samples?.evaluation_sample)
    ? valid
    : [];
}

export function buildSectionAnswers({ record, target, method, result, materialResults, comparisonSets, features, diagnostics, missingness, populations, populationLineage, evaluationDesign, focalResultsEvaluation } = {}) {
  const reconstruction = record?.reconstruction || {};
  const purpose = reconstruction.purpose_scope || {};
  const data = reconstruction.data || {};
  const resultFields = reconstruction.results_evaluation || {};
  const resultMeaning = focalResultsEvaluation?.establishes || resultFields.establishes;
  const resultBoundary = focalResultsEvaluation?.does_not_establish || focalResultsEvaluation?.known_limitation || resultFields.does_not_establish || resultFields.known_limitation;

  const purposeRequirements = {
    objective: established(purpose.purpose) || established(purpose.summary),
    scope: established(purpose.population_scope) || established(purpose.unit),
    intended_use: established(purpose.intended_use),
  };
  const purposeEvidence = [purpose.summary, purpose.purpose, purpose.task, purpose.target_outcome, purpose.population_scope, purpose.unit, purpose.intended_use];
  const purposeState = Object.values(purposeRequirements).every(Boolean) ? "answered" : Object.values(purposeRequirements).some(Boolean) ? "partial" : "unavailable";

  const resultRequirements = {
    target: Boolean(target?.label),
    method: Boolean(String(method || result?.method || "").trim()),
    result: quantitativeResult(result),
    evaluation_design: established(evaluationDesign),
    evaluation_sample: quantifiedSample(populations?.evaluation_sample),
    meaning: established(resultMeaning),
  };
  const resultEvidence = [target, result, evaluationDesign, populations?.evaluation_sample, resultMeaning, resultBoundary];
  const resultState = Object.values(resultRequirements).every(Boolean) ? "answered" : Object.values(resultRequirements).some(Boolean) ? "partial" : "unavailable";

  const eligibleFeatures = array(features).filter(numericFeature);
  const featureState = eligibleFeatures.length ? "answered" : array(features).length ? "partial" : "unavailable";

  const eligibleComparisons = array(comparisonSets).filter((set) => comparableMetrics(set).length && sharedComparisonContext(set, target, target?.workstream_id));
  const comparisonState = eligibleComparisons.length ? "answered" : array(comparisonSets).length ? "partial" : "unavailable";

  const eligibleDiagnostics = array(diagnostics).filter(validDiagnostic);
  const diagnosticState = eligibleDiagnostics.length ? "answered" : array(diagnostics).length ? "partial" : "unavailable";

  const populationRequirements = {
    source: quantifiedSample(populations?.source_data),
    training: quantifiedSample(populations?.model_sample),
    evaluation: quantifiedSample(populations?.evaluation_sample),
  };
  const populationState = Object.values(populationRequirements).every(Boolean) ? "answered" : Object.values(populationRequirements).some(Boolean) ? "partial" : "unavailable";

  const eligibleMissingness = array(missingness).filter(validMissingness);
  const missingnessState = eligibleMissingness.length ? "answered" : array(missingness).length ? "partial" : "unavailable";

  const eligibleLineageContexts = connectedLineage(populationLineage, populations);
  const lineageState = eligibleLineageContexts.length ? "answered" : array(populationLineage?.contexts).length ? "partial" : "unavailable";
  const eligibleLineage = eligibleLineageContexts.length ? {
    nodes: unique(eligibleLineageContexts.flatMap((context) => array(context.nodes).map((node) => node.id)))
      .map((id) => eligibleLineageContexts.flatMap((context) => array(context.nodes)).find((node) => node.id === id)),
    edges: unique(eligibleLineageContexts.flatMap((context) => array(context.edges).map((edge) => edge.id)))
      .map((id) => eligibleLineageContexts.flatMap((context) => array(context.edges)).find((edge) => edge.id === id)),
    contexts: eligibleLineageContexts,
  } : null;

  const answers = {
    purpose_scope: answer("purpose_scope", { state: purposeState, value: { summary: purpose.summary, fields: purpose }, evidence: purposeEvidence, related: purposeEvidence, missing: Object.entries(purposeRequirements).filter(([, value]) => !value).map(([key]) => key) }),
    results_evaluation: answer("results_evaluation", { state: resultState, value: { target, method, result, material_results: materialResults, evaluation_design: evaluationDesign, evaluation_sample: populations?.evaluation_sample, establishes: resultMeaning, does_not_establish: resultBoundary }, evidence: resultEvidence, related: [...array(materialResults), resultFields.other_material_result], missing: Object.entries(resultRequirements).filter(([, value]) => !value).map(([key]) => key) }),
    feature_driver_evidence: answer("feature_driver_evidence", { state: featureState, value: { items: eligibleFeatures }, evidence: eligibleFeatures, related: features, missing: eligibleFeatures.length ? [] : ["recorded numerical contribution, importance, or driver ranking for the selected model"] }),
    model_comparison: answer("model_comparison", { state: comparisonState, value: { sets: eligibleComparisons }, evidence: eligibleComparisons.flatMap((set) => array(set.results)), related: comparisonSets, missing: eligibleComparisons.length ? [] : ["at least two methods with a shared target, evaluation context, and metric"] }),
    evaluation_behaviour: answer("evaluation_behaviour", { state: diagnosticState, value: { diagnostics: eligibleDiagnostics }, evidence: eligibleDiagnostics, related: diagnostics, missing: eligibleDiagnostics.length ? [] : ["a supported diagnostic that describes performance behaviour beyond the headline metric"] }),
    data_populations_samples: answer("data_populations_samples", { state: populationState, value: { populations }, evidence: Object.values(populations || {}), related: [data.summary, data.data_sources, data.unit_of_observation, data.population_filters, ...Object.values(populations || {})], missing: Object.entries(populationRequirements).filter(([, value]) => !value).map(([key]) => `${key} population amount`) }),
    data_missingness: answer("data_missingness", { state: missingnessState, value: { measurements: eligibleMissingness }, evidence: eligibleMissingness, related: missingness, missing: eligibleMissingness.length ? [] : ["a quantified missingness count or extent with a defensible denominator"] }),
    population_lineage: answer("population_lineage", { state: lineageState, value: { lineage: eligibleLineage }, evidence: eligibleLineageContexts.flatMap((context) => [...array(context.nodes), ...array(context.edges)]), related: [...array(populationLineage?.nodes), ...array(populationLineage?.edges)], missing: eligibleLineageContexts.length ? [] : ["a connected evidence-backed path from original data to both training and evaluation samples"] }),
  };
  return answers;
}

export const OVERVIEW_SECTION_QUESTIONS = QUESTIONS;
