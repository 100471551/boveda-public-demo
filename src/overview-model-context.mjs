const array = (value) => Array.isArray(value) ? value : [];

function normalized(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(?:tuned|untuned|final|base|classifier|regressor|model|with|using|features?|recorded)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameMethod(first, second) {
  const left = normalized(first);
  const right = normalized(second);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function finiteResultValue(result) {
  for (const value of [result?.value, result?.exact_value, result?.raw_value]) if (Number.isFinite(value)) return value;
  const parsed = Number(String(result?.display_value || "").replaceAll(",", "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function resultId(result) {
  return result?.analytical_result_id || result?.id || null;
}

function metricKey(result) {
  return result?.metric_key || result?.metric || null;
}

function metricMatches(result, key, label) {
  const values = [result?.metric_key, result?.metric, result?.metric_label].map(normalized).filter(Boolean);
  return values.includes(normalized(key)) || values.includes(normalized(label));
}

function sameValue(first, second) {
  const left = finiteResultValue(first);
  const right = finiteResultValue(second);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-12;
}

function resultMatches(first, second) {
  const firstId = resultId(first);
  const secondId = resultId(second);
  if (firstId && secondId && firstId === secondId) return true;
  return sameMethod(first?.method, second?.method)
    && metricMatches(first, metricKey(second), second?.metric_label || second?.metric)
    && sameValue(first, second);
}

function targetCompatible(item, set) {
  if (item?.target_id && set?.target_id) return item.target_id === set.target_id;
  if (item?.workstream_id && set?.workstream_id) return item.workstream_id === set.workstream_id;
  return !item?.target_id && !item?.workstream_id;
}

function phaseCompatible(item, context) {
  const itemPhase = item?.evaluation_phase;
  const phases = context.evaluation_phases;
  return !itemPhase || itemPhase === "unspecified" || !phases.length || phases.includes("unspecified") || phases.includes(itemPhase);
}

function variantCompatible(item, context) {
  const unresolved = new Set([null, undefined, "", "base", "evaluated", "unresolved", "unspecified"]);
  if (unresolved.has(item?.estimator_variant) || !context.estimator_variants.length) return true;
  return context.estimator_variants.some((value) => unresolved.has(value) || value === item.estimator_variant);
}

function populationCompatible(item, context) {
  return !item?.population_id || !context.population_ids.length || context.population_ids.includes(item.population_id);
}

function modelCompatible(item, context) {
  if (!sameMethod(item?.method, context.method)) return false;
  if (item?.model_run_id && context.model_run_ids.length) return context.model_run_ids.includes(item.model_run_id);
  return true;
}

function validDiagnostic(item) {
  if (!array(item?.evidence_ids).length) return false;
  if (item?.type === "confusion_matrix") {
    const values = array(item.values);
    return values.length >= 2
      && values.every((row) => array(row).length === values.length && row.every(Number.isFinite))
      && array(item.labels).length === values.length;
  }
  return item?.type === "train_validation"
    && Number.isFinite(item.train_value)
    && Number.isFinite(item.validation_value)
    && Boolean(item.metric);
}

function validFeature(item) {
  return Boolean(item?.feature && Number.isFinite(item?.value) && array(item?.evidence_ids).length);
}

function selectableMethod(method, results, layer, set) {
  const methodResults = results.filter((item) => sameMethod(item.method, method));
  if (!methodResults.length) return false;
  if (methodResults.some((item) => item.model_run_id)) return true;
  if (array(layer?.model_runs).some((run) => targetCompatible(run, set) && sameMethod(run.method, method))) return true;
  const roles = methodResults.map((item) => normalized(item.method_role || item.model_role)).filter(Boolean);
  if (roles.some((role) => /candidate|selected|evaluated|model/.test(role))) return true;
  if (roles.length && roles.every((role) => /baseline|reference|no skill/.test(role))) return false;
  return !/^(?:no skill|baseline|reference|null model|dummy)$/.test(normalized(method));
}

function projectResult(result, story, descriptor = {}) {
  const value = finiteResultValue(result);
  return {
    ...result,
    state: "established",
    analytical_result_id: resultId(result),
    raw_value: value,
    display_value: Number.isFinite(value) ? String(value) : result?.display_value,
    display_precision: result?.display_precision ?? result?.persisted_precision ?? 3,
    metric: result?.metric_label || descriptor.label || result?.metric,
    metric_key: result?.metric_key || descriptor.key || result?.metric,
    method: result?.method,
    task_target: result?.task_target || story?.target?.label,
    evaluation_context: result?.evaluation_context || story?.result?.evaluation_context || null,
    epistemic: result?.epistemic || "DERIVED",
    evidence_ids: array(result?.evidence_ids),
  };
}

function comparisonSets(layer) {
  const answer = layer?.presentation?.main_target_story?.section_answers?.model_comparison;
  return answer?.dashboard_available === true ? array(answer.answer?.sets) : [];
}

function focalSet(sets, story) {
  return sets.find((set) => array(set.results).some((result) => resultMatches(result, story?.result)))
    || sets.find((set) => story?.target?.id && set.target_id === story.target.id)
    || sets.find((set) => story?.target?.workstream_id && set.workstream_id === story.target.workstream_id)
    || sets[0]
    || null;
}

function fallbackContext(layer, story) {
  const result = story?.result;
  if (!result?.method || !Number.isFinite(finiteResultValue(result))) return [];
  const projected = projectResult(result, story, { key: metricKey(result), label: result.metric });
  return [{
    id: `overview-focal-${resultId(result) || normalized(result.method)}`,
    method: result.method,
    label: result.method,
    model_run_id: result.model_run_id || null,
    model_run_ids: array(result.model_run_id ? [result.model_run_id] : []),
    comparison_set_id: null,
    target_id: result.target_id || story?.target?.id || null,
    workstream_id: story?.target?.workstream_id || null,
    evaluation_phases: array(result.evaluation_phase ? [result.evaluation_phase] : []),
    estimator_variants: array(result.estimator_variant ? [result.estimator_variant] : []),
    population_ids: array(result.population_id ? [result.population_id] : []),
    evaluation_attempt_ids: array(result.evaluation_attempt_id ? [result.evaluation_attempt_id] : []),
    metrics: [{ id: metricKey(projected), key: metricKey(projected), label: projected.metric, direction: projected.direction_of_better || null, result: projected }],
    results: [projected],
    diagnostics: array(story?.section_answers?.evaluation_behaviour?.answer?.diagnostics).filter(validDiagnostic),
    features: array(story?.section_answers?.feature_driver_evidence?.answer?.items).filter(validFeature),
    default_metric_key: metricKey(projected),
  }];
}

/**
 * Builds presentation-only model contexts from a question-eligible comparison.
 * It never changes canonical reconstruction, selection statements, or checks.
 */
export function buildOverviewModelContexts(layer) {
  const story = layer?.presentation?.main_target_story;
  if (!story) return { contexts: [], default_model_key: null, default_metric_key: null, comparison_set: null };
  const set = focalSet(comparisonSets(layer), story);
  if (!set) {
    const contexts = fallbackContext(layer, story);
    return { contexts, default_model_key: contexts[0]?.id || null, default_metric_key: contexts[0]?.default_metric_key || null, comparison_set: null };
  }

  const setResults = array(set.results).filter((item) => Number.isFinite(finiteResultValue(item)) && item.method && item.metric);
  const descriptors = array(set.metrics);
  const contexts = array(set.methods).filter((method) => selectableMethod(method, setResults, layer, set)).map((method) => {
    const methodResults = setResults.filter((item) => sameMethod(item.method, method));
    const metrics = descriptors.flatMap((descriptor) => {
      const raw = methodResults.find((item) => metricMatches(item, descriptor.key, descriptor.label));
      if (!raw) return [];
      const result = projectResult(raw, story, descriptor);
      return [{ id: descriptor.key, key: descriptor.key, label: descriptor.label || result.metric, direction: descriptor.direction_of_better || descriptor.direction || result.direction_of_better || result.direction || null, result }];
    });
    for (const raw of methodResults) if (!metrics.some((item) => metricMatches(raw, item.key, item.label))) {
      const result = projectResult(raw, story);
      metrics.push({ id: metricKey(result), key: metricKey(result), label: result.metric, direction: result.direction_of_better || result.direction || null, result });
    }
    const projectedResults = metrics.map((item) => item.result);
    const modelRunIds = [...new Set(methodResults.map((item) => item.model_run_id).filter(Boolean))];
    const context = {
      id: `${set.id}|${modelRunIds.length === 1 ? modelRunIds[0] : normalized(method)}`,
      method,
      label: method,
      model_run_id: modelRunIds.length === 1 ? modelRunIds[0] : null,
      model_run_ids: modelRunIds,
      comparison_set_id: set.id,
      target_id: set.target_id || story?.target?.id || null,
      workstream_id: set.workstream_id || story?.target?.workstream_id || null,
      evaluation_phases: [...new Set(methodResults.map((item) => item.evaluation_phase || set.evaluation_phase).filter(Boolean))],
      estimator_variants: [...new Set(methodResults.map((item) => item.estimator_variant || set.estimator_variant).filter(Boolean))],
      population_ids: [...new Set(methodResults.map((item) => item.population_id).filter(Boolean))],
      evaluation_attempt_ids: [...new Set(methodResults.map((item) => item.evaluation_attempt_id).filter(Boolean))],
      metrics,
      results: projectedResults,
    };
    const diagnostics = array(layer?.diagnostics).filter((item) => validDiagnostic(item)
      && targetCompatible(item, set)
      && modelCompatible(item, context)
      && phaseCompatible(item, context)
      && variantCompatible(item, context)
      && populationCompatible(item, context));
    const features = array(layer?.feature_evidence).filter((item) => validFeature(item)
      && targetCompatible(item, set)
      && modelCompatible(item, context)
      && variantCompatible(item, context));
    return { ...context, diagnostics, features };
  }).filter((context) => context.metrics.length);

  const defaultContext = contexts.find((context) => context.results.some((result) => resultMatches(result, story.result)))
    || contexts.find((context) => sameMethod(context.method, story.method || story.result?.method))
    || contexts[0]
    || null;
  const focalMetric = defaultContext?.metrics.find((item) => metricMatches(story.result, item.key, item.label)) || defaultContext?.metrics[0] || null;
  const defaultMetricKey = focalMetric?.key || null;
  const finalized = contexts.map((context) => ({
    ...context,
    default_metric_key: context.metrics.some((item) => item.key === defaultMetricKey) ? defaultMetricKey : context.metrics[0]?.key || null,
  }));
  return {
    contexts: finalized,
    default_model_key: defaultContext?.id || finalized[0]?.id || null,
    default_metric_key: defaultMetricKey || finalized[0]?.default_metric_key || null,
    comparison_set: set,
  };
}

export function modelContextByKey(presentation, key) {
  return array(presentation?.contexts).find((context) => context.id === key) || array(presentation?.contexts)[0] || null;
}

export function modelMetricKey(context, preferred) {
  return context?.metrics?.some((item) => item.key === preferred) ? preferred : context?.default_metric_key || context?.metrics?.[0]?.key || null;
}

export function modelResult(context, preferredMetric) {
  const key = modelMetricKey(context, preferredMetric);
  return context?.metrics?.find((item) => item.key === key)?.result || context?.results?.[0] || null;
}

/**
 * Chooses a section's initial model after a global-context change.
 * The global model is preferred when it can answer the section question;
 * otherwise the evidence-derived focal model, then the first comparable model
 * with valid section evidence, is used. Explicit local choices are handled by
 * the section component and are never rewritten by this helper.
 */
export function sectionDefaultModelKey(presentation, globalModelKey, evidenceKey) {
  const contexts = array(presentation?.contexts);
  const hasEvidence = (context) => Boolean(context?.[evidenceKey]?.length);
  const global = modelContextByKey(presentation, globalModelKey);
  if (hasEvidence(global)) return global.id;
  const focal = contexts.find((context) => context.id === presentation?.default_model_key);
  if (hasEvidence(focal)) return focal.id;
  const supported = contexts.filter(hasEvidence);
  const comparable = supported.map((context, index) => {
    const metric = context.metrics?.find((item) => item.key === presentation?.default_metric_key);
    return { context, index, metric, value: finiteResultValue(metric?.result) };
  }).filter((item) => Number.isFinite(item.value) && ["higher", "lower"].includes(item.metric?.direction));
  if (comparable.length > 1 && comparable.every((item) => item.metric.direction === comparable[0].metric.direction)) {
    const multiplier = comparable[0].metric.direction === "lower" ? 1 : -1;
    comparable.sort((left, right) => ((left.value - right.value) * multiplier) || (left.index - right.index));
    return comparable[0].context.id;
  }
  return supported[0]?.id || global?.id || focal?.id || contexts[0]?.id || null;
}
