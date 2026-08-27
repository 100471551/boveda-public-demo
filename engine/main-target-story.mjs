import { buildSectionAnswers } from "./section-answer-contracts.mjs";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function objectId(value) {
  return value?.analytical_result_id || value?.id || null;
}

function normalizedMethod(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(?:tuned|untuned|final|base|classifier|regressor|model|with|using|features?|recorded)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameMethod(first, second) {
  const left = normalizedMethod(first);
  const right = normalizedMethod(second);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function sameNumber(first, second) {
  return Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) <= 1e-12;
}

function readableFeature(value) {
  const label = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : label;
}

function comparisonScore(set, result, targetId, workstreamId) {
  let score = 0;
  const resultId = objectId(result);
  if (resultId && array(set?.results).some((item) => objectId(item) === resultId)) score += 1000;
  if (targetId && set?.target_id === targetId) score += 300;
  if (workstreamId && set?.workstream_id === workstreamId) score += 200;
  if (array(set?.results).some((item) => sameMethod(item.method, result?.method)
    && (item.metric === result?.metric_key || item.metric_label === result?.metric || item.metric === result?.metric)
    && sameNumber(item.value ?? item.exact_value, result?.raw_value ?? result?.exact_value))) score += 100;
  return score ? score + Math.min(array(set?.methods).length, 10) : 0;
}

function focalComparison(sets, result, targetId, workstreamId) {
  const ranked = array(sets)
    .map((set, index) => ({ set, index, score: comparisonScore(set, result, targetId, workstreamId) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.score > 0 ? ranked[0].set : null;
}

function comparisonResult(set, result) {
  const resultId = objectId(result);
  return array(set?.results).find((item) => objectId(item) === resultId)
    || array(set?.results).find((item) => sameMethod(item.method, result?.method)
      && (item.metric === result?.metric_key || item.metric_label === result?.metric || item.metric === result?.metric)
      && sameNumber(item.value ?? item.exact_value, result?.raw_value ?? result?.exact_value))
    || null;
}

function scoped(items, targetId, workstreamId) {
  const values = array(items);
  const targetMatches = targetId ? values.filter((item) => item.target_id === targetId) : [];
  if (targetMatches.length) return targetMatches;
  const workstreamMatches = workstreamId ? values.filter((item) => item.workstream_id === workstreamId) : [];
  if (workstreamMatches.length) return workstreamMatches;
  return values.filter((item) => !item.target_id && !item.workstream_id);
}

function featureSelection(features, targetId, workstreamId, method, modelRunId) {
  const candidates = scoped(features, targetId, workstreamId).filter((item) => item?.feature && (Number.isFinite(item.value) || item.evidence_type === "feature_usage"));
  const exactRun = modelRunId ? candidates.filter((item) => item.model_run_id === modelRunId) : [];
  if (exactRun.length) return exactRun;
  const methodMatches = candidates.filter((item) => sameMethod(item.method, method));
  if (methodMatches.length) return methodMatches;
  const groupIds = new Set(candidates.map((item) => `${item.model_run_id || ""}|${item.method || ""}|${item.evidence_type || ""}`));
  return groupIds.size === 1 ? candidates : [];
}

function diagnosticSelection(diagnostics, targetId, workstreamId, method, modelRunId) {
  const candidates = scoped(diagnostics, targetId, workstreamId);
  const exactRun = modelRunId ? candidates.filter((item) => item.model_run_id === modelRunId) : [];
  if (exactRun.length) return exactRun;
  return candidates.filter((item) => sameMethod(item.method, method));
}

function materialResults(results, result, targetId, primaryContextId) {
  const values = array(results);
  const targetMatches = targetId ? values.filter((item) => item.target_id === targetId) : [];
  if (targetMatches.length) return targetMatches;
  const contextMatches = primaryContextId ? values.filter((item) => item.analytical_context_id === primaryContextId) : [];
  if (contextMatches.length) return contextMatches;
  return result ? [result] : [];
}

function sampleFromField(field, role, label) {
  if (field?.state !== "established" || !Number.isFinite(field.count)) return null;
  return {
    ...field,
    id: field.id || field.population_id || `main-target-${role}`,
    role,
    label,
  };
}

function numericSampleCount(sample) {
  if (Number.isFinite(sample?.count)) return sample.count;
  const match = String(sample?.display || "").match(/([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(thousand|million|billion|trillion|[KMBT])?\b/i);
  if (!match) return null;
  const scales = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9, trillion: 1e12, t: 1e12 };
  const value = Number(match[1].replaceAll(",", ""));
  const scale = match[2] ? scales[match[2].toLowerCase()] : 1;
  return Number.isFinite(value) ? value * scale : null;
}

function quantifiedSample(sample) {
  return sample?.state === "established" && Number.isFinite(numericSampleCount(sample));
}

function contextSample(context, role, count, fallback, label) {
  if (fallback?.state === "established" && Number.isFinite(fallback.count) && (!Number.isFinite(count) || fallback.count === count)) {
    return sampleFromField(fallback, role, label);
  }
  const nodes = array(context?.nodes).filter((node) => node.role === role);
  const node = nodes.find((item) => Number.isFinite(count) && item.count === count) || nodes.at(-1) || null;
  const resolvedCount = finite(count) ?? finite(node?.count);
  if (!Number.isFinite(resolvedCount)) return null;
  const unit = node?.unit || fallback?.unit || "observations";
  return {
    ...(node || {}),
    id: node?.id || `main-target-${role}`,
    state: "established",
    display: fallback?.display && fallback.count === resolvedCount ? fallback.display : `${resolvedCount.toLocaleString("en-US")} ${unit}`,
    count: resolvedCount,
    unit,
    role,
    label,
    epistemic: node?.epistemic || fallback?.epistemic || "OBSERVED",
    evidence_ids: unique([...(node?.evidence_ids || []), ...(fallback?.evidence_ids || []), ...(context?.evidence_ids || [])]),
  };
}

function sourceSample(projectPopulation, recordSource, context) {
  const contextSource = context?.lineage_mode === "explicit_stages" ? array(context.nodes).find((item) => item.role === "source") : null;
  if (Number.isFinite(contextSource?.count) && (!Number.isFinite(projectPopulation?.count) || projectPopulation.count === contextSource.count)) {
    return { ...contextSource, state: "established", role: "source", label: "Original data" };
  }
  if (projectPopulation?.state === "established" && Number.isFinite(projectPopulation.count)) {
    return {
      ...projectPopulation,
      role: "source",
      label: "Original data",
    };
  }
  if (quantifiedSample(projectPopulation)) return { ...projectPopulation, role: "source", label: "Original data" };
  const field = sampleFromField(recordSource, "source", "Original data");
  if (field) return field;
  if (quantifiedSample(recordSource)) return { ...recordSource, id: recordSource.id || recordSource.population_id || "main-target-source", role: "source", label: "Original data" };
  const node = array(context?.nodes).find((item) => item.role === "source");
  return Number.isFinite(node?.count) ? { ...node, state: "established", label: "Original data" } : null;
}

function recoverLineage({ targetLabel, workstreamId, context, source, training, evaluation, populationFilters, evaluationDesign }) {
  const originalNodes = array(context?.nodes).filter((node) => Number.isFinite(node?.count));
  const originalEdges = array(context?.edges).filter((edge) => edge?.from && edge?.to && array(edge?.evidence_ids).length);
  const byId = new Map(originalNodes.map((node) => [node.id, node]));
  const trainingNode = originalNodes.find((node) => node.role === "training" && (!training || node.count === training.count))
    || originalNodes.find((node) => node.role === "training") || training;
  const evaluationNode = originalNodes.find((node) => node.role === "evaluation" && (!evaluation || node.count === evaluation.count))
    || originalNodes.find((node) => node.role === "evaluation") || evaluation;
  const selectedIds = new Set([trainingNode?.id, evaluationNode?.id].filter(Boolean));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of originalEdges) if (selectedIds.has(edge.to) && !selectedIds.has(edge.from)) {
      selectedIds.add(edge.from);
      changed = true;
    }
  }
  let nodes = originalNodes.filter((node) => selectedIds.has(node.id));
  let edges = originalEdges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to));

  if ((!nodes.some((node) => node.role === "training") || !nodes.some((node) => node.role === "evaluation"))
    && training && evaluation && establishedField(evaluationDesign)) {
    const readyCount = training.count + evaluation.count;
    const ready = {
      id: `main-target-ready-${context?.id || workstreamId || "context"}`,
      role: "population_stage",
      label: "Analytical population",
      count: readyCount,
      unit: training.unit || evaluation.unit || "observations",
      epistemic: "DERIVED",
      derivation: { operation: "sum", operands: [training.count, evaluation.count] },
      evidence_ids: unique([...(training.evidence_ids || []), ...(evaluation.evidence_ids || []), ...(evaluationDesign.evidence_ids || [])]),
    };
    nodes = [ready, { ...training }, { ...evaluation }];
    edges = [training, evaluation].map((sample) => ({
      id: `main-target-edge-${ready.id}-${sample.id}`,
      from: ready.id,
      to: sample.id,
      relation: "split",
      predicate: evaluationDesign.value,
      epistemic: "DERIVED",
      evidence_ids: unique([...(sample.evidence_ids || []), ...(evaluationDesign.evidence_ids || [])]),
    }));
  }

  nodes = nodes.map((node) => ({
    ...node,
    label: node.role === "source" ? "Original data" : node.role === "training" ? "Training data" : node.role === "evaluation" ? "Evaluation data" : node.label,
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Set(edges.map((edge) => edge.to));
  const roots = nodes.filter((node) => !incoming.has(node.id));
  let sourceNode = nodes.find((node) => node.role === "source") || null;

  if (!sourceNode && source && roots.length === 1 && establishedField(populationFilters)) {
    const root = roots[0];
    const sourceCount = numericSampleCount(source);
    if (Number.isFinite(sourceCount) && (!Number.isFinite(root.count) || sourceCount >= root.count)) {
      sourceNode = {
        ...source,
        id: source.id || "main-target-source",
        count: sourceCount,
        display_value: source.display || null,
        count_qualifier: Number.isFinite(source.count) ? null : "recorded_bound",
        role: "source",
        label: "Original data",
      };
      if (!nodeIds.has(sourceNode.id)) nodes.unshift(sourceNode);
      edges.unshift({
        id: `main-target-edge-${sourceNode.id}-${root.id}`,
        from: sourceNode.id,
        to: root.id,
        relation: "filter",
        predicate: populationFilters.value,
        epistemic: "DERIVED",
        evidence_ids: unique([...(source.evidence_ids || []), ...(root.evidence_ids || []), ...(populationFilters.evidence_ids || [])]),
      });
    }
  }

  const projected = {
    ...(context || {}),
    id: context?.id || `main-target-${workstreamId || "context"}`,
    workstream_id: workstreamId || context?.workstream_id || null,
    workstream: context?.workstream || targetLabel || "Main target",
    display_label: targetLabel || context?.display_label || "Main target",
    lineage_mode: "question_aware",
    nodes,
    edges,
    training_count: training?.count ?? context?.training_count ?? null,
    evaluation_count: evaluation?.count ?? context?.evaluation_count ?? null,
    evidence_ids: unique([...nodes.flatMap((node) => node.evidence_ids || []), ...edges.flatMap((edge) => edge.evidence_ids || [])]),
  };
  return { nodes, edges, contexts: nodes.length ? [projected] : [] };
}

function mainLineageContext(lineage, targetId, workstreamId) {
  const contexts = array(lineage?.contexts);
  const match = contexts.find((item) => targetId && item.target_id === targetId)
    || contexts.find((item) => workstreamId && item.workstream_id === workstreamId);
  return match || (!targetId && !workstreamId ? contexts[0] : null) || null;
}

function establishedField(value) {
  return value?.state === "established" && String(value?.value ?? value?.display ?? "").trim().length > 0;
}

function normalizedField(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function focalMissingness(items, features) {
  const values = array(items);
  const usage = array(features).filter((item) => item.evidence_type === "feature_usage");
  if (!usage.length) return values;
  const names = new Set(usage.flatMap((item) => [item.source_feature, item.raw_feature, item.feature]).map(normalizedField).filter(Boolean));
  const matched = values.filter((item) => names.has(normalizedField(item.field)));
  return matched.length ? matched : values;
}

function evaluationDesign(context, training, evaluation) {
  if (!context || !training || !evaluation) return null;
  const test = Number.isFinite(context.test_fraction) ? Math.round(context.test_fraction * 100) : null;
  const train = Number.isFinite(test) ? 100 - test : null;
  const split = Number.isFinite(train) ? `${train}/${test}` : "recorded";
  return {
    state: "established",
    value: `A ${split} train/test split produced ${training.count.toLocaleString("en-US")} training and ${evaluation.count.toLocaleString("en-US")} evaluation observations.`,
    epistemic: "DERIVED",
    evidence_ids: unique([...(context.evidence_ids || []), ...(training.evidence_ids || []), ...(evaluation.evidence_ids || [])]),
  };
}

/**
 * Builds the small supervisor-facing story for one focal analytical target.
 * It only selects and connects evidence already reconstructed elsewhere; it does
 * not create result values, feature values, diagnostics, or population counts.
 */
export function buildMainTargetStory({
  record,
  primaryContext,
  headlineResults,
  bestFinalResult,
  focalResultsEvaluation,
  projectPopulation,
  comparisonSets,
  features,
  diagnostics,
  lineage,
  missingness,
  targetDefinitions,
} = {}) {
  const result = focalResultsEvaluation?.result || bestFinalResult || array(headlineResults)[0] || null;
  const targetId = result?.target_id || primaryContext?.target_id || null;
  const targetDefinition = array(targetDefinitions).find((item) => item.id === targetId)
    || array(targetDefinitions).find((item) => item.workstream_id === primaryContext?.workstream_id)
    || null;
  const workstreamId = targetDefinition?.workstream_id || primaryContext?.workstream_id || null;
  const targetLabel = result?.task_target || targetDefinition?.semantic_name || primaryContext?.target || primaryContext?.display_label || null;
  const comparison = focalComparison(comparisonSets, result, targetId, workstreamId);
  const matchedResult = comparisonResult(comparison, result);
  const method = matchedResult?.method || primaryContext?.method || result?.method || null;
  const modelRunId = result?.model_run_id || matchedResult?.model_run_id || null;
  const selectedFeatures = featureSelection(features, targetId, workstreamId, method, modelRunId)
    .map((item) => ({
      ...item,
      target_name: item.target_name || targetLabel,
      display_label: item.target_id || item.model_run_id ? item.display_label || readableFeature(item.feature) : readableFeature(item.feature),
    }));
  const selectedDiagnostics = diagnosticSelection(diagnostics, targetId, workstreamId, method, modelRunId)
    .map((item) => ({ ...item, target_name: item.target_name || targetLabel }));
  const selectedMissingness = focalMissingness(scoped(missingness, targetId, workstreamId), selectedFeatures);
  const context = mainLineageContext(lineage, targetId, workstreamId);
  const samples = record?.reconstruction?.samples || {};
  const original = sourceSample(projectPopulation, samples.source_data, context);
  const training = contextSample(context, "training", finite(primaryContext?.model_sample_count) ?? finite(context?.training_count), samples.model_sample, "Training data");
  const evaluation = contextSample(context, "evaluation", finite(primaryContext?.evaluation_sample_count) ?? finite(context?.evaluation_count), samples.evaluation_sample, "Evaluation data");
  const canonicalEvaluationDesign = record?.reconstruction?.results_evaluation?.evaluation_design;
  const reconstructedEvaluationDesign = context?.lineage_mode === "explicit_stages" ? evaluationDesign(context, training, evaluation) : null;
  const displayedEvaluationDesign = [focalResultsEvaluation?.evaluation_design, reconstructedEvaluationDesign, canonicalEvaluationDesign].find(establishedField) || null;
  const populationLineage = recoverLineage({
    targetLabel,
    workstreamId,
    context,
    source: original,
    training,
    evaluation,
    populationFilters: record?.reconstruction?.data?.population_filters,
    evaluationDesign: displayedEvaluationDesign,
  });
  const selectedMaterialResults = materialResults(headlineResults, result, targetId, primaryContext?.id);

  const populations = {
    source_data: original || samples.source_data,
    model_sample: training || samples.model_sample,
    evaluation_sample: evaluation || samples.evaluation_sample,
  };
  const target = targetLabel ? {
    id: targetId,
    label: targetLabel,
    workstream_id: workstreamId,
    epistemic: targetDefinition?.epistemic || result?.epistemic || "INTERPRETED",
    evidence_ids: unique([...(targetDefinition?.evidence_ids || []), ...(result?.evidence_ids || []), ...(primaryContext?.evidence_ids || [])]),
  } : null;
  const sectionAnswers = buildSectionAnswers({
    record,
    target,
    method,
    result,
    materialResults: selectedMaterialResults,
    comparisonSets: comparison ? [{ ...comparison, display_label: targetLabel || comparison.display_label }] : [],
    features: selectedFeatures,
    diagnostics: selectedDiagnostics,
    missingness: selectedMissingness,
    populations,
    populationLineage,
    evaluationDesign: displayedEvaluationDesign,
    focalResultsEvaluation,
  });

  return {
    schema_version: "boveda-main-target-story-0.2.0",
    status: targetLabel && result ? "established" : result || targetLabel ? "partial" : "unavailable",
    target,
    method,
    result,
    material_results: selectedMaterialResults,
    comparison_sets: comparison ? [{ ...comparison, display_label: targetLabel || comparison.display_label }] : [],
    feature_evidence: selectedFeatures,
    diagnostics: selectedDiagnostics,
    missingness: selectedMissingness,
    evaluation_design: displayedEvaluationDesign,
    populations,
    population_lineage: populationLineage,
    section_answers: sectionAnswers,
    availability: {
      target: targetLabel ? "available" : "unavailable",
      result: sectionAnswers.results_evaluation.dashboard_available ? "available" : "unavailable",
      model_comparison: sectionAnswers.model_comparison.dashboard_available ? "available" : "unavailable",
      features: sectionAnswers.feature_driver_evidence.dashboard_available ? "available" : "unavailable",
      evaluation_behaviour: sectionAnswers.evaluation_behaviour.dashboard_available ? "available" : "unavailable",
      missingness: sectionAnswers.data_missingness.dashboard_available ? "available" : "unavailable",
      populations: sectionAnswers.data_populations_samples.dashboard_available ? "available" : "unavailable",
      population_lineage: sectionAnswers.population_lineage.dashboard_available ? "available" : "unavailable",
    },
  };
}
