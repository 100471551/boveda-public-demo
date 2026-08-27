import crypto from "node:crypto";

const RESULT = Object.freeze({
  PRESENT: "SIGNAL PRESENT",
  ABSENT: "NO SIGNAL DETECTED",
  NOT_APPLICABLE: "NOT APPLICABLE",
  INSUFFICIENT: "INSUFFICIENT EVIDENCE",
});

const definitions = Object.freeze({
  "CHK-TYPED-FOCAL-RESULT-ORIGIN": {
    version: "1.0.0", label: "Typed focal-result origin",
    question_ids: ["Q-PRIMARY-RESULT-1", "Q-EVALUATION-DESIGN-1", "Q-COVERAGE-TRACE-1"],
    object_ids: ["field-primary-result", "field-target-outcome", "field-evaluation-design", "field-evaluation-sample"],
    coverage_domain_ids: ["coverage-traceability"],
    operation: "Resolve the canonical focal result through a compatible metric, run, target, evaluation attempt, population, and evidence chain.",
    allowed: "The displayed focal result has or lacks a compatible evidence-bound analytical origin.",
    prohibited: ["The focal model was formally selected.", "The result applies to every intended-use population."],
  },
  "CHK-TARGET-CONSTRUCTION-ANCESTRY": {
    version: "1.0.0", label: "Complete target construction ancestry",
    question_ids: ["Q-TARGET-1"], object_ids: ["field-target-outcome"], coverage_domain_ids: ["coverage-traceability"],
    operation: "Traverse each material target construction graph backwards to evidence-bound terminal source indicators.",
    allowed: "The operational target can or cannot be traced through its complete persisted construction ancestry.",
    prohibited: ["A terminal source indicator is a causal or valid measure of a broader intended construct."],
  },
  "CHK-POPULATION-LINEAGE-COMPATIBILITY": {
    version: "1.0.0", label: "Population lineage compatibility",
    question_ids: ["Q-POPULATION-1", "Q-FILTERS-1", "Q-SOURCE-DATA-1", "Q-MODEL-SAMPLE-1", "Q-EVALUATION-SAMPLE-1", "Q-COVERAGE-TRACE-2"],
    object_ids: ["field-population-scope", "field-main-population-filters", "field-source-data", "field-model-sample", "field-evaluation-sample"],
    coverage_domain_ids: ["coverage-traceability", "coverage-reproducibility"],
    operation: "Validate role-aware population nodes, directed relations, units, partitions, and authorised count derivations.",
    allowed: "The reconstructed population branches and recorded or derived counts are or are not internally traceable and compatible.",
    prohibited: ["The population branches are representative, fair, unbiased, or equivalent to intended use."],
  },
  "CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT": {
    version: "1.0.0", label: "Evaluation versus intended prediction population",
    question_ids: ["Q-EVALUATION-SAMPLE-1", "Q-POPULATION-2", "Q-USE-2"],
    object_ids: ["field-evaluation-sample", "field-population-scope", "field-intended-use"], coverage_domain_ids: [],
    operation: "Compare the focal evaluation population with the typed intended-prediction population and any direct evaluation on that population.",
    allowed: "The persisted evaluation directly measures the evaluated population, which may be distinct from the intended prediction population.",
    prohibited: ["The model fails on the intended population.", "The population difference proves bias or unsafe deployment."],
    presentation: { title: "The model was tested on a different population from the one it is meant to prioritise", why: "Performance observed in the tested group may not carry over directly to the population where the model is intended to be used." },
    primary_owner: "field-evaluation-sample",
  },
  "CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE": {
    version: "1.0.0", label: "Evaluation preprocessing fit scope",
    question_ids: ["Q-EVALUATION-DESIGN-2", "Q-FILTERS-1"], object_ids: ["field-evaluation-design", "field-main-population-filters"], coverage_domain_ids: [],
    operation: "Determine whether a fitted transformation estimated parameters from held-out evaluation inputs.",
    allowed: "The persisted evaluation preprocessing fits parameters on held-out evaluation inputs rather than applying a training-fitted transformation unchanged.",
    prohibited: ["Label leakage occurred.", "Every evaluation metric is invalid.", "The size or direction of any effect is known."],
    presentation: { title: "Evaluation data was used to fit part of the preprocessing", why: "The evaluation data influenced part of the model-preparation process, so the reported held-out performance needs additional context." },
    primary_owner: "field-evaluation-design",
  },
  "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY": {
    version: "1.0.0", label: "Metric computation and interpretation compatibility",
    question_ids: ["Q-OTHER-RESULT-2", "Q-LIMITATION-2"], object_ids: ["field-other-material-result", "field-known-limitation"], coverage_domain_ids: [],
    operation: "Compare a material ranking or curve metric's typed computation family with its score-input type.",
    allowed: "An Average Precision observation computed from predicted classes is threshold-dependent rather than a probability-ranking summary.",
    prohibited: ["Average Precision is always invalid.", "The model is poor.", "Compatible probability-based PR AUC is hard-label based."],
    presentation: { title: "Some Average Precision values were calculated from yes/no predictions", why: "These values depend on the chosen decision threshold and should not be read as a full measure of ranking performance." },
    primary_owner: "field-other-material-result",
  },
  "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY": {
    version: "1.0.0", label: "Positive-class detection behaviour",
    question_ids: ["Q-OTHER-RESULT-1", "Q-LIMITATION-2"], object_ids: ["field-other-material-result", "field-known-limitation"], coverage_domain_ids: [],
    operation: "Derive actual-positive and predicted-positive counts from an orientation-resolved final confusion matrix.",
    allowed: "This evaluated model produced no positive predictions despite positive cases being present in the held-out sample.",
    prohibited: ["All models for this target fail.", "The behaviour occurs in another population.", "The condition proves unfairness."],
    presentation: { title: "One evaluated model did not identify any positive cases", why: "A summary performance score can hide the fact that this model did not identify the positive class in this evaluation." },
    primary_owner: "field-other-material-result",
  },
  "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE": {
    version: "1.0.0", label: "Terminal search and final estimator correspondence",
    question_ids: ["Q-EVALUATION-DESIGN-2", "Q-OTHER-RESULT-2"], object_ids: ["field-evaluation-design", "field-other-material-result"], coverage_domain_ids: [],
    operation: "Resolve the terminal typed search stage and compare its best parameters with the linked evaluated final estimator.",
    allowed: "The evaluated final estimator uses explicit parameters different from the terminal persisted best-search result.",
    prohibited: ["Tuning was wrong.", "The project intended exact adoption.", "Using the search parameters would improve performance."],
    presentation: { title: "The final model settings differ from the best settings found during tuning", why: "The project record does not show that the best tuning configuration was the exact configuration ultimately evaluated." },
    primary_owner: "field-evaluation-design",
  },
  "CHK-OUTPUT-COLUMN-CONSISTENCY": {
    version: "1.0.0", label: "Output column consistency",
    question_ids: ["Q-USE-2", "Q-LIMITATION-2"], object_ids: ["field-intended-use", "field-known-limitation"], coverage_domain_ids: [],
    operation: "Verify that a prediction output statement selects the same typed column that it assigns for the target.",
    allowed: "The persisted export statement does not select the prediction column assigned for the same target.",
    prohibited: ["The wrong artefact was delivered.", "The intended output never existed.", "The underlying predictions are incorrect."],
    presentation: { title: "The export may use a different prediction field", why: "The available code does not clearly establish that the exported file contains the prediction intended for that target." },
    primary_owner: "field-intended-use",
  },
  "CHK-ANALYTICAL-ROLE-ALIGNMENT": {
    version: "1.0.0", label: "Analytical model-role alignment",
    question_ids: ["Q-OTHER-RESULT-2", "Q-USE-2"], object_ids: ["field-other-material-result", "field-intended-use"], coverage_domain_ids: [],
    operation: "Compare independently reconstructed best-result, feature-producing, output-producing, and explicit-selection model roles for each target.",
    allowed: "Persisted analytical roles refer to different model families while no formal selected-model statement resolves that difference.",
    prohibited: ["A particular model should have been selected.", "The exported model is wrong.", "Best-result or export identity implies formal selection."],
    presentation: { title: "Different models are used for different parts of the analysis", why: "The available project record does not clearly document one formally selected model that reconciles these roles." },
    primary_owner: "field-other-material-result",
  },
  "CHK-REPRODUCTION-INPUT-COVERAGE-V2": {
    version: "2.0.0", label: "Result reproduction inputs",
    question_ids: ["Q-PRIMARY-RESULT-2", "Q-COVERAGE-REPRO-1"], object_ids: ["field-primary-result"], coverage_domain_ids: ["coverage-reproducibility"],
    operation: "Resolve analytical code, data snapshot, environment, execution context, prediction/label artefacts, and metric origin as independent typed requirements.",
    allowed: "Bóveda can or cannot establish complete reproduction inputs from the stored reconstruction graph.",
    prohibited: ["The analysis is universally irreproducible.", "The result is false.", "An unresolved artefact never existed."],
  },
});

export const GRAPH_CHECK_DEFINITIONS = definitions;
export const GRAPH_CHECK_RESULTS = RESULT;

function digest(...parts) {
  return crypto.createHash("sha256").update(parts.map((part) => JSON.stringify(part)).join("|")).digest("hex").slice(0, 12).toUpperCase();
}

const unique = (values) => [...new Set(values.filter(Boolean))];
const array = (value) => Array.isArray(value) ? value : [];
const idMap = (values) => new Map(array(values).map((value) => [value.id, value]));
const hasEvidence = (value) => array(value?.evidence_ids).length > 0;
const evidenceOf = (values) => unique(array(values).flatMap((value) => array(value?.evidence_ids))).sort();
const labelOf = (value, fallback = "Analytical context") => value?.semantic_name || value?.display_label || value?.label || value?.method || fallback;

function graphInput(object, objectType, role) {
  return {
    object_id: object?.id || role,
    object_type: objectType,
    role,
    label: labelOf(object, role.replaceAll("_", " ")),
    epistemic: object?.epistemic || "UNRESOLVED",
    evidence_ids: array(object?.evidence_ids),
    established: Boolean(object?.id && hasEvidence(object)),
  };
}

function focalStory(meta) {
  const story = meta?.main_target_story;
  return story && story.status !== "unavailable" ? story : null;
}

function storyObject(value, role, fallbackLabel, extra = {}) {
  if (!value) return null;
  const label = value.label || value.task_target || value.method || value.metric_label || value.metric || fallbackLabel;
  return {
    ...value,
    ...extra,
    id: value.id || value.analytical_result_id || `${role}-${digest(label, value.workstream_id, value.evidence_ids)}`,
    label,
    semantic_name: value.semantic_name || label,
  };
}

function storyBaseExecution(definitionId, context, inputs, meta) {
  const base = baseExecution(definitionId, context, inputs, meta);
  return {
    ...base,
    implementation_status: "implemented_reconstruction_native",
    configuration: { ...base.configuration, input_contract: "evidence-bound focal-target projection" },
  };
}

function sameMethod(first, second) {
  const normalise = (value) => String(value || "").toLowerCase()
    .replace(/\b(?:tuned|untuned|final|base|classifier|regressor|model|with|using|features?|recorded)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const left = normalise(first);
  const right = normalise(second);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function storyFocalExecution(meta) {
  const checkId = "CHK-TYPED-FOCAL-RESULT-ORIGIN";
  const story = focalStory(meta);
  if (!story?.target || !story?.result) return null;
  const target = storyObject(story.target, "focal-target", "Focal target");
  const resultMatch = array(story.material_results).find((item) => item.canonical_role === "primary")
    || array(story.material_results).find((item) => sameMethod(item.method, story.method)
      && (item.metric === story.result.metric || item.metric_label === story.result.metric));
  const metric = storyObject(resultMatch || story.result, "focal-metric", "Focal metric");
  const comparisonResult = array(story.comparison_sets).flatMap((set) => array(set.results))
    .find((item) => sameMethod(item.method, story.method)
      && (item.metric === metric.metric || item.metric_label === metric.metric || item.metric_label === metric.metric_label));
  const model = storyObject({
    method: story.method,
    evidence_ids: unique([...(metric?.evidence_ids || []), ...(comparisonResult?.evidence_ids || []), ...array(story.feature_evidence).filter((item) => sameMethod(item.method, story.method)).flatMap((item) => array(item.evidence_ids))]),
    epistemic: comparisonResult?.epistemic || metric?.epistemic,
  }, "focal-model", story.method || "Focal model");
  const population = storyObject(story.populations?.evaluation_sample, "evaluation-population", "Evaluation population");
  const evaluation = storyObject({
    label: story.result.evaluation_context || population?.display || "Focal evaluation",
    evidence_ids: unique([...(story.result.evidence_ids || []), ...(population?.evidence_ids || [])]),
    epistemic: story.result.epistemic || population?.epistemic,
  }, "focal-evaluation", "Focal evaluation");
  const inputs = [graphInput(metric, "MetricObservation", "focal_metric"), graphInput(model, "ModelRun", "focal_model_run"), graphInput(target, "TargetDefinition", "focal_target"), graphInput(evaluation, "EvaluationAttempt", "focal_evaluation"), graphInput(population, "PopulationNode", "evaluation_population")];
  const base = storyBaseExecution(checkId, { target_id: target.id, model_run_id: model.id, evaluation_attempt_id: evaluation.id, metric_observation_id: metric.id, population_id: population?.id, workstream: story.target.workstream_id || "focal target", display_label: [target.label, model.method, metric.metric_label || metric.metric].filter(Boolean).join(" · ") }, inputs, meta);
  const missing = inputs.filter((input) => !input.established);
  if (missing.length) return finish(base, RESULT.INSUFFICIENT, "The main result is reconstructed, but one or more links needed for its complete verification trail are not established.", { gaps: missing.map((input) => gap(base.execution_id, input.object_id, input.label)), materiality: "undetermined" });
  return finish(base, RESULT.ABSENT, "The main result is connected to an evidence-backed target, model, evaluation context, metric and evaluation population.");
}

function gap(executionId, objectId, label, claimEffect = "limits") {
  return { gap_id: `GAP-${digest(executionId, objectId)}`, object_id: objectId, description: `${label} is unresolved in the stored reconstruction graph.`, claim_effect: claimEffect };
}

function evidenceGap(executionId, objectId, label, claimEffect = "limits") {
  return { gap_id: `GAP-${digest(executionId, objectId)}`, object_id: objectId, description: `The available project evidence does not fully establish ${label.toLowerCase()}.`, claim_effect: claimEffect };
}

function baseExecution(definitionId, context, inputs, meta) {
  const definition = definitions[definitionId];
  const scopeIds = unique(array(context.scope_object_ids).concat(inputs.map((input) => input.object_id))).sort();
  const executionId = `EXEC-${digest(definitionId, definition.version, scopeIds)}`;
  return {
    execution_id: executionId,
    check_id: definitionId,
    check_version: definition.version,
    label: definition.label,
    implementation_status: "implemented_graph_native",
    question_ids: definition.question_ids,
    mapped_object_ids: definition.object_ids,
    coverage_domain_ids: definition.coverage_domain_ids,
    scope: {
      project_id: meta.project_id || null,
      audit_id: meta.audit_id || null,
      workstream: context.workstream || "reconstruction graph",
      target_id: context.target_id || null,
      model_run_id: context.model_run_id || null,
      evaluation_attempt_id: context.evaluation_attempt_id || null,
      metric_observation_id: context.metric_observation_id || null,
      population_id: context.population_id || null,
      output_id: context.output_id || null,
      display_label: context.display_label || null,
      snapshot: meta.snapshot || null,
    },
    scope_object_ids: scopeIds,
    inputs,
    required_evidence: inputs.map((input) => ({ object_id: input.object_id, object_type: input.object_type, requirement: `Resolved ${input.role} with an evidence-bound graph identity.` })),
    optional_evidence: [],
    operation: definition.operation,
    configuration: { rule_version: definition.version, input_contract: "stored analytical reconstruction graph" },
    threshold: null,
    materiality_rule: { version: "1.0.0", rule: "Materiality follows an exact typed structural predicate; no project-derived threshold is used." },
    allowed_claims: [definition.allowed],
    prohibited_claims: definition.prohibited,
    alternatives: ["A compatible relationship may exist outside the authorised persisted evidence boundary."],
    evidence: { supporting: evidenceOf(inputs), contradicting: [], qualifying: [], contextual: [] },
    unresolved_relationships: [],
    presentation: definition.presentation ? { title: definition.presentation.title, why_it_matters: definition.presentation.why } : null,
    primary_owner: definition.primary_owner || null,
  };
}

function finish(base, result, summary, { gaps = [], condition = null, conditionKey = null, impacts = [], materiality = "none", aggregationLabel = null, presentation = null } = {}) {
  const conditions = condition ? [{ condition_type: conditionKey, description: condition }] : [];
  return {
    ...base,
    applicable: result !== RESULT.NOT_APPLICABLE,
    applicability_reason: result === RESULT.NOT_APPLICABLE ? summary : "The conceptual preconditions are represented in the typed reconstruction graph.",
    result,
    result_summary: summary,
    presentation: presentation ? { ...base.presentation, ...presentation } : base.presentation,
    materiality: { level: materiality, rule_version: "1.0.0", factors: unique([...base.scope_object_ids, ...conditions.map((item) => item.condition_type)]) },
    conditions,
    gaps,
    impacts,
    canonical_condition_key: result === RESULT.PRESENT ? conditionKey : null,
    aggregation_label: aggregationLabel,
    state_reason_ids: gaps.length ? gaps.map((item) => item.gap_id) : [base.execution_id],
    trail: {
      question_ids: base.question_ids,
      execution_id: base.execution_id,
      operation: base.operation,
      input_object_ids: base.inputs.map((input) => input.object_id),
      graph_object_refs: base.inputs.map((input) => ({ object_id: input.object_id, object_type: input.object_type, role: input.role })),
      evidence_ids: base.evidence.supporting,
      gap_ids: gaps.map((item) => item.gap_id),
    },
  };
}

const overviewImpacts = (definitionId, reason) => definitions[definitionId].object_ids
  .filter((objectId) => !definitions[definitionId].primary_owner || objectId === definitions[definitionId].primary_owner)
  .map((objectId) => ({
  object_type: "overview_field", object_id: objectId, claim_effect: "qualifies", impact_reason: reason,
  confidence_dependency: false, primary_owner: objectId === definitions[definitionId].primary_owner,
  }));

function focalExecutions(graph, meta) {
  const checkId = "CHK-TYPED-FOCAL-RESULT-ORIGIN";
  const focal = graph.best_final_result;
  if (!focal || focal.state === "unresolved") {
    const storyExecution = storyFocalExecution(meta);
    if (storyExecution) return [storyExecution];
    const base = baseExecution(checkId, {}, [], meta);
    return [finish(base, RESULT.NOT_APPLICABLE, "No focal analytical result is projected from the reconstruction graph.")];
  }
  const metrics = idMap(graph.metric_observations);
  const runs = idMap(graph.model_runs);
  const targets = idMap(graph.target_definitions);
  const attempts = idMap(graph.evaluation_attempts);
  const populations = idMap(graph.population_graph?.nodes);
  const metric = metrics.get(focal.analytical_result_id);
  const run = runs.get(focal.model_run_id);
  const target = targets.get(focal.target_id);
  const attempt = attempts.get(focal.evaluation_attempt_id);
  const population = populations.get(focal.evaluation_population_id || attempt?.population_id);
  const inputs = [graphInput(metric, "MetricObservation", "focal_metric"), graphInput(run, "ModelRun", "focal_model_run"), graphInput(target, "TargetDefinition", "focal_target"), graphInput(attempt, "EvaluationAttempt", "focal_evaluation"), graphInput(population, "PopulationNode", "evaluation_population")];
  const base = baseExecution(checkId, { target_id: target?.id, model_run_id: run?.id, evaluation_attempt_id: attempt?.id, metric_observation_id: metric?.id, population_id: population?.id, display_label: [labelOf(target), run?.method, metric?.metric_label].filter(Boolean).join(" · ") }, inputs, meta);
  const missing = inputs.filter((input) => !input.established);
  if (missing.length) {
    const storyExecution = storyFocalExecution(meta);
    if (storyExecution) return [storyExecution];
    return [finish(base, RESULT.INSUFFICIENT, "The main result is reconstructed, but one or more links needed for its complete verification trail are not established.", { gaps: missing.map((input) => gap(base.execution_id, input.object_id, input.label)), materiality: "undetermined" })];
  }
  const incompatible = metric.model_run_id !== run.id || metric.target_id !== target.id || metric.evaluation_attempt_id !== attempt.id || run.target_id !== target.id || attempt.target_id !== target.id || attempt.population_id !== population.id;
  if (incompatible) {
    const text = "The focal result chain contains incompatible target, run, evaluation, metric, or population relationships.";
    return [finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "focal_result_relationship_incompatibility", impacts: overviewImpacts(checkId, text), materiality: "high" })];
  }
  return [finish(base, RESULT.ABSENT, "The focal result resolves through compatible evidence-bound target, run, evaluation, metric, and population objects.")];
}

function hasCycle(stepIds, edges) {
  const incoming = new Map(stepIds.map((id) => [id, 0]));
  const outgoing = new Map(stepIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (!incoming.has(edge.from_step_id) || !incoming.has(edge.to_step_id)) continue;
    incoming.set(edge.to_step_id, incoming.get(edge.to_step_id) + 1);
    outgoing.get(edge.from_step_id).push(edge.to_step_id);
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift(); visited += 1;
    for (const next of outgoing.get(id)) { incoming.set(next, incoming.get(next) - 1); if (incoming.get(next) === 0) queue.push(next); }
  }
  return visited !== stepIds.length;
}

function ancestryExecutions(graph, meta) {
  const checkId = "CHK-TARGET-CONSTRUCTION-ANCESTRY";
  const targets = array(graph.target_definitions);
  if (!targets.length) {
    const story = focalStory(meta);
    if (!story?.target) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No analytical target is reconstructed in the available project record.")];
    const target = storyObject(story.target, "focal-target", "Focal target");
    const inputs = [graphInput(target, "TargetDefinition", "target")];
    const base = storyBaseExecution(checkId, { target_id: target.id, workstream: target.workstream_id || "focal target", display_label: target.label }, inputs, meta);
    return [finish(base, RESULT.INSUFFICIENT, `Bóveda reconstructed ${target.label}, but not the complete sequence of source fields and transformations that created it.`, { gaps: [evidenceGap(base.execution_id, `target-construction-${target.id}`, "Complete target construction")], materiality: "undetermined" })];
  }
  const steps = idMap(graph.target_construction_steps);
  const edges = idMap(graph.target_construction_edges);
  const graphs = idMap(graph.target_construction_graphs);
  return targets.map((target) => {
    const construction = graphs.get(target.construction_graph_id);
    const targetSteps = array(construction?.step_ids).map((id) => steps.get(id)).filter(Boolean);
    const targetEdges = array(construction?.edge_ids).map((id) => edges.get(id)).filter(Boolean);
    const inputs = [graphInput(target, "TargetDefinition", "target"), graphInput(construction, "TargetConstructionGraph", "construction_graph"), ...targetSteps.map((item) => graphInput(item, "TargetConstructionStep", "construction_step")), ...targetEdges.map((item) => graphInput(item, "TargetConstructionEdge", "construction_edge"))];
    const base = baseExecution(checkId, { target_id: target.id, workstream: target.workstream || "target construction", display_label: labelOf(target), scope_object_ids: [target.id, construction?.id] }, inputs, meta);
    if (!construction || !construction.root_step_id || !array(construction.terminal_source_fields).length) return finish(base, RESULT.INSUFFICIENT, "The target construction graph does not resolve a root and terminal source indicators.", { gaps: [gap(base.execution_id, construction?.id || `target-construction-${target.id}`, "Complete target construction graph")], materiality: "undetermined" });
    const dangling = array(construction.step_ids).some((id) => !steps.has(id)) || array(construction.edge_ids).some((id) => !edges.has(id)) || targetEdges.some((edge) => !steps.has(edge.from_step_id) || !steps.has(edge.to_step_id));
    const missingEvidence = inputs.some((input) => !input.established);
    if (dangling || missingEvidence || construction.status !== "complete") return finish(base, RESULT.INSUFFICIENT, "The target construction ancestry contains an unresolved step, edge, leaf, or evidence binding.", { gaps: [gap(base.execution_id, construction.id, "Evidence-complete target ancestry")], materiality: "undetermined" });
    if (hasCycle(array(construction.step_ids), targetEdges) || array(construction.issues).some((issue) => /contradict|cycle/i.test(String(issue)))) {
      const text = "The target construction ancestry contains a contradictory or cyclic typed relationship.";
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "target_construction_contradiction", impacts: overviewImpacts(checkId, text), materiality: "high" });
    }
    return finish(base, RESULT.ABSENT, `${labelOf(target)} terminates through a complete evidence-bound construction ancestry.`);
  });
}

function populationExecutions(graph, meta) {
  const checkId = "CHK-POPULATION-LINEAGE-COMPATIBILITY";
  const nodes = array(graph.population_graph?.nodes);
  const edges = array(graph.population_graph?.edges || graph.population_graph?.relations);
  if (!nodes.length && !edges.length) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No population transformation or sample split exists in the reconstruction graph.")];
  const byRole = new Map(nodes.map((node) => [node.role, node]));
  const requiredRoles = ["source", "training", "evaluation"];
  const inputs = [...nodes.map((node) => graphInput(node, "PopulationNode", node.role || "population")), ...edges.map((edge) => graphInput(edge, "PopulationRelation", edge.relation || "population_relation"))];
  const base = baseExecution(checkId, { display_label: "Population and sample graph", scope_object_ids: nodes.map((node) => node.id) }, inputs, meta);
  const missingRoles = requiredRoles.filter((role) => !byRole.get(role));
  const dangling = edges.some((edge) => !nodes.some((node) => node.id === edge.from) || !nodes.some((node) => node.id === edge.to));
  const reachable = (from, to) => {
    const visited = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const current = queue.shift();
      if (current === to) return true;
      for (const edge of edges.filter((item) => item.from === current)) if (!visited.has(edge.to)) { visited.add(edge.to); queue.push(edge.to); }
    }
    return false;
  };
  const source = byRole.get("source");
  const disconnected = !missingRoles.length && [byRole.get("training"), byRole.get("evaluation")].some((node) => !reachable(source.id, node.id));
  if (missingRoles.length || dangling || disconnected || inputs.some((input) => !input.established)) return [finish(base, RESULT.INSUFFICIENT, "The population lineage is missing an original, training or evaluation population, a connecting relationship, or its supporting evidence.", { gaps: [...missingRoles.map((role) => gap(base.execution_id, `population-role-${role}`, `Population role: ${role.replaceAll("_", " ")}`)), ...((dangling || disconnected) ? [gap(base.execution_id, "population-relation", "Directed population relation")] : [])], materiality: "undetermined" })];
  const splitChildren = edges.filter((edge) => edge.relation === "split");
  const splitParents = unique(splitChildren.map((edge) => edge.from));
  let inconsistent = false;
  for (const parentId of splitParents) {
    const parent = nodes.find((node) => node.id === parentId);
    const children = splitChildren.filter((edge) => edge.from === parentId).map((edge) => nodes.find((node) => node.id === edge.to));
    if (children.length > 1 && children.every((node) => Number.isFinite(node?.count)) && Number.isFinite(parent?.count)) inconsistent ||= children.some((node) => node.unit !== parent.unit) || children.reduce((sum, node) => sum + node.count, 0) !== parent.count;
  }
  for (const node of nodes.filter((item) => item.derivation?.operation === "difference")) {
    const operands = array(node.derivation.operands).map((id) => nodes.find((candidate) => candidate.id === id));
    if (operands.length !== 2 || operands.some((item) => !Number.isFinite(item?.count)) || !Number.isFinite(node.count)) continue;
    inconsistent ||= node.unit !== operands[0].unit || node.count !== operands[0].count - operands[1].count;
  }
  if (inconsistent) {
    const text = "An explicit population partition or derived-count relationship is arithmetically or semantically inconsistent.";
    return [finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "population_lineage_inconsistency", impacts: overviewImpacts(checkId, text), materiality: "high" })];
  }
  return [finish(base, RESULT.ABSENT, "Population roles, directed branches, units, partitions, and authorised count derivations are compatible.")];
}

function alignmentExecutions(graph, meta) {
  const checkId = "CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT";
  const focal = graph.best_final_result;
  const nodes = array(graph.population_graph?.nodes);
  const intendedNodes = nodes.filter((node) => node.role === "intended_prediction" && (!focal?.target_id || !array(node.target_ids).length || node.target_ids.includes(focal.target_id)));
  if (!focal) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No focal result is in scope for population alignment.")];
  if (!intendedNodes.length && !nodes.some((node) => node.role === "intended_prediction")) return [finish(baseExecution(checkId, { target_id: focal.target_id }, [], meta), RESULT.NOT_APPLICABLE, "No population-specific intended prediction or decision population is represented.")];
  const attempts = array(graph.evaluation_attempts);
  const focalAttempt = attempts.find((attempt) => attempt.id === focal.evaluation_attempt_id);
  const evaluated = nodes.find((node) => node.id === focalAttempt?.population_id);
  const intended = intendedNodes[0];
  const target = array(graph.target_definitions).find((item) => item.id === focal.target_id);
  const metric = array(graph.metric_observations).find((item) => item.id === focal.analytical_result_id);
  const limitations = array(graph.scoped_limitations).filter((item) => [focalAttempt?.id, evaluated?.id, intended?.id, target?.id, metric?.id].includes(item.subject_id));
  const inputs = [graphInput(target, "TargetDefinition", "focal_target"), graphInput(metric, "MetricObservation", "focal_metric"), graphInput(focalAttempt, "EvaluationAttempt", "focal_evaluation"), graphInput(evaluated, "PopulationNode", "evaluation_population"), graphInput(intended, "PopulationNode", "intended_prediction_population"), ...limitations.map((item) => graphInput(item, "ScopedLimitation", "applicable_limitation"))];
  const base = baseExecution(checkId, { target_id: target?.id, evaluation_attempt_id: focalAttempt?.id, population_id: evaluated?.id, display_label: labelOf(target), scope_object_ids: [evaluated?.id, intended?.id] }, inputs, meta);
  const required = inputs.slice(0, 5);
  if (required.some((input) => !input.established)) return [finish(base, RESULT.INSUFFICIENT, "The evaluation or intended-population relationship is unresolved.", { gaps: required.filter((input) => !input.established).map((input) => gap(base.execution_id, input.object_id, input.label)), materiality: "undetermined" })];
  const direct = attempts.some((attempt) => attempt.target_id === target.id && attempt.population_id === intended.id && attempt.status === "persisted");
  if (evaluated.id !== intended.id && !direct) {
    const text = `The focal result was evaluated on ${evaluated.label || "one population"}, while the intended prediction population is ${intended.label || "a distinct population"}.`;
    const conditionSummary = `The main result comes from ${evaluated.label || "the evaluated population"}, while the model is intended to support decisions for ${intended.label || "a different population"}.`;
    return [finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "evaluation_intended_population_distinct", impacts: overviewImpacts(checkId, text), materiality: "high", presentation: { condition_summary: conditionSummary } })];
  }
  return [finish(base, RESULT.ABSENT, "The focal result has direct evaluation evidence on the intended prediction population.")];
}

function preprocessingExecutions(graph, meta) {
  const checkId = "CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE";
  const stages = array(graph.data_formation_stages);
  const fitStages = stages.filter((stage) => stage.operation_type === "preprocessor_fit" || stage.fit_scope !== undefined && stage.fit_scope !== null);
  if (!fitStages.length) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No fitted preprocessing transformation is represented in the reconstruction graph.")];
  const workstreams = Map.groupBy(fitStages, (stage) => stage.workstream_id || stage.target_id || "unresolved");
  return [...workstreams.entries()].map(([workstreamId, scopedStages]) => {
    const target = array(graph.target_definitions).find((item) => item.workstream_id === workstreamId || item.id === workstreamId);
    const attempts = array(graph.evaluation_attempts).filter((item) => item.target_id === target?.id);
    const runs = array(graph.model_runs).filter((item) => item.target_id === target?.id && array(item.roles).includes("final_evaluated"));
    const inputs = [...scopedStages.map((stage) => graphInput(stage, "DataFormationStage", "fitted_transformation")), ...attempts.map((item) => graphInput(item, "EvaluationAttempt", "evaluation_attempt")), ...runs.map((item) => graphInput(item, "ModelRun", "evaluated_model_run"))];
    const base = baseExecution(checkId, { target_id: target?.id, workstream: target?.workstream || workstreamId, display_label: labelOf(target, "Modelling context"), scope_object_ids: [workstreamId] }, inputs, meta);
    if (scopedStages.some((stage) => !stage.fit_scope) || inputs.some((input) => !input.established)) return finish(base, RESULT.INSUFFICIENT, "A fitted transformation or its evaluation context has unresolved fit scope or evidence.", { gaps: [gap(base.execution_id, `fit-scope-${workstreamId}`, "Fitted transformation population role")], materiality: "undetermined" });
    if (scopedStages.some((stage) => stage.fit_scope === "evaluation")) {
      const text = `A fitted preprocessing transformation for ${labelOf(target, "this modelling context")} estimates parameters from held-out evaluation inputs.`;
      const conditionSummary = `For ${labelOf(target, "this modelling context")}, preprocessing parameters were fitted using the evaluation data instead of applying a transformation fitted only on the training data.`;
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "evaluation_preprocessor_fit_scope", impacts: overviewImpacts(checkId, text), materiality: "high", aggregationLabel: "affected modelling contexts", presentation: { condition_summary: conditionSummary } });
    }
    if (scopedStages.some((stage) => stage.fit_scope === "training")) return finish(base, RESULT.ABSENT, "Preprocessing parameters are fitted on training inputs and no evaluation fit is represented in this context.");
    return finish(base, RESULT.INSUFFICIENT, "The project shows fitted data preparation, but the available evidence does not establish whether its parameters were learned from training data only or also from evaluation data.", { gaps: [gap(base.execution_id, `fit-scope-${workstreamId}`, "Fitted transformation population role")], materiality: "undetermined" });
  });
}

function metricResult(metric) {
  const key = metric?.metric;
  const input = metric?.score_input;
  if (!key || !["average_precision", "pr_auc", "roc_auc"].includes(key)) return RESULT.NOT_APPLICABLE;
  if (!input || !metric.computation) return RESULT.INSUFFICIENT;
  if (["average_precision", "pr_auc", "roc_auc"].includes(key) && input === "hard_label") return RESULT.PRESENT;
  if (["probability", "continuous_score", "constant_score"].includes(input)) return RESULT.ABSENT;
  return RESULT.INSUFFICIENT;
}

function storyMetricExecutions(meta) {
  const checkId = "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY";
  const story = focalStory(meta);
  if (!story?.target) return [];
  const target = storyObject(story.target, "focal-target", "Focal target");
  const seen = new Set();
  const results = array(story.comparison_sets).flatMap((set) => array(set.results)).filter((item) => {
    const ranking = ["average_precision", "pr_auc", "roc_auc"].includes(item.metric);
    const key = item.id || `${item.method}|${item.metric}|${item.value}`;
    if (!ranking || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return results.map((result) => {
    const metric = storyObject({ ...result, score_input: result.score_input || result.metric_subtype }, "material-metric", result.metric_label || result.metric || "Material metric");
    const inputs = [graphInput(metric, "MetricObservation", "material_metric"), graphInput(target, "TargetDefinition", "metric_target")];
    const base = storyBaseExecution(checkId, { target_id: target.id, metric_observation_id: metric.id, workstream: story.target.workstream_id || "focal target", display_label: [target.label, result.method, result.metric_label].filter(Boolean).join(" · ") }, inputs, meta);
    const input = metric.score_input;
    if (inputs.some((item) => !item.established) || !input) return finish(base, RESULT.INSUFFICIENT, "The ranking result is reconstructed, but the type of score used to calculate it is not established.", { gaps: [gap(base.execution_id, metric.id, "Metric calculation and score input")], materiality: "undetermined" });
    if (input === "hard_label") {
      const text = `${result.metric_label || "The ranking metric"} for ${[target.label, result.method].filter(Boolean).join(" · ")} is computed from hard class predictions and is threshold-dependent.`;
      const conditionSummary = `For ${[target.label, result.method].filter(Boolean).join(" · ")}, ${result.metric_label || "the ranking metric"} was calculated from predicted classes rather than ranked probability scores.`;
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "ranking_metric_hard_label_input", impacts: overviewImpacts(checkId, text), materiality: "medium", aggregationLabel: "affected metric contexts", presentation: { condition_summary: conditionSummary } });
    }
    if (["probability", "probability_based", "probability_or_continuous_score", "continuous_score", "constant_score"].includes(input)) return finish(base, RESULT.ABSENT, `${result.metric_label || "The ranking metric"} uses a compatible ${String(input).replaceAll("_", " ")} input.`);
    return finish(base, RESULT.INSUFFICIENT, "The ranking result is reconstructed, but its score-input type cannot be assessed reliably.", { gaps: [gap(base.execution_id, metric.id, "Metric score-input type")], materiality: "undetermined" });
  });
}

function metricExecutions(graph, meta) {
  const checkId = "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY";
  const comparisonMetricIds = new Set(array(graph.final_comparison_sets).flatMap((set) => array(set.results).map((result) => result.id)));
  const material = array(graph.metric_observations).filter((metric) => comparisonMetricIds.has(metric.id) && ["average_precision", "pr_auc", "roc_auc"].includes(metric.metric));
  if (!material.length) {
    const storyExecutions = storyMetricExecutions(meta);
    return storyExecutions.length ? storyExecutions : [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No material ranking or curve metric is reconstructed in the available project record.")];
  }
  return material.map((metric) => {
    const target = array(graph.target_definitions).find((item) => item.id === metric.target_id);
    const run = array(graph.model_runs).find((item) => item.id === metric.model_run_id);
    const attempt = array(graph.evaluation_attempts).find((item) => item.id === metric.evaluation_attempt_id);
    const inputs = [graphInput(metric, "MetricObservation", "material_metric"), graphInput(target, "TargetDefinition", "metric_target"), ...(run ? [graphInput(run, "ModelRun", "metric_model_run")] : []), graphInput(attempt, "EvaluationAttempt", "metric_evaluation")];
    const base = baseExecution(checkId, { target_id: target?.id, model_run_id: run?.id, evaluation_attempt_id: attempt?.id, metric_observation_id: metric.id, display_label: [labelOf(target), metric.method, metric.metric_label].filter(Boolean).join(" · ") }, inputs, meta);
    const result = metricResult(metric);
    if (inputs.some((input) => !input.established) || result === RESULT.INSUFFICIENT) return finish(base, RESULT.INSUFFICIENT, "The metric computation, score input, or analytical context is unresolved.", { gaps: [gap(base.execution_id, metric.id, "Typed metric computation and score input")], materiality: "undetermined" });
    if (result === RESULT.PRESENT) {
      const text = `${metric.metric_label || "The metric"} for ${[labelOf(target), metric.method].filter(Boolean).join(" · ")} is computed from hard class predictions and is threshold-dependent.`;
      const conditionSummary = `For ${[labelOf(target), metric.method].filter(Boolean).join(" · ")}, ${metric.metric_label || "the ranking metric"} was calculated from predicted classes rather than ranked probability scores.`;
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "ranking_metric_hard_label_input", impacts: overviewImpacts(checkId, text), materiality: "medium", aggregationLabel: "affected metric contexts", presentation: { condition_summary: conditionSummary } });
    }
    return finish(base, RESULT.ABSENT, `${metric.metric_label || "The metric"} uses a compatible ${String(metric.score_input).replaceAll("_", " ")} input.`);
  });
}

function diagnosticExecutions(graph, meta) {
  const checkId = "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY";
  const diagnostics = array(graph.diagnostic_observations).filter((item) => item.type === "confusion_matrix" && item.final === true);
  if (!diagnostics.length) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No final binary class-decision diagnostic is represented.")];
  return diagnostics.map((diagnostic) => {
    const target = array(graph.target_definitions).find((item) => item.id === diagnostic.target_id);
    const run = array(graph.model_runs).find((item) => item.id === diagnostic.model_run_id);
    const attempt = array(graph.evaluation_attempts).find((item) => item.id === diagnostic.evaluation_attempt_id);
    const inputs = [graphInput(diagnostic, "DiagnosticObservation", "confusion_matrix"), graphInput(target, "TargetDefinition", "diagnostic_target"), graphInput(run, "ModelRun", "diagnostic_model_run"), graphInput(attempt, "EvaluationAttempt", "diagnostic_evaluation")];
    const base = baseExecution(checkId, { target_id: target?.id, model_run_id: run?.id, evaluation_attempt_id: attempt?.id, display_label: [labelOf(target), run?.method].filter(Boolean).join(" · ") }, inputs, meta);
    const oriented = diagnostic.orientation?.rows === "actual" && diagnostic.orientation?.columns === "predicted";
    const cells = [diagnostic.tn, diagnostic.fp, diagnostic.fn, diagnostic.tp];
    if (!oriented || !cells.every(Number.isFinite) || inputs.some((input) => !input.established)) return finish(base, RESULT.INSUFFICIENT, "The positive class, matrix orientation, cells, or diagnostic context is unresolved.", { gaps: [gap(base.execution_id, diagnostic.id, "Orientation-resolved confusion matrix")], materiality: "undetermined" });
    const actualPositive = diagnostic.tp + diagnostic.fn;
    const predictedPositive = diagnostic.tp + diagnostic.fp;
    if (actualPositive === 0) return finish(base, RESULT.NOT_APPLICABLE, "The evaluation diagnostic contains no actual positive cases.");
    if (predictedPositive === 0) {
      const text = `${run?.method || "The evaluated model"} for ${labelOf(target)} produced no positive predictions despite ${actualPositive} actual positive cases.`;
      const conditionSummary = `For ${labelOf(target)}, ${run?.method || "the evaluated model"} predicted no positive cases even though ${actualPositive} positive cases were present in the evaluation sample.`;
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "zero_positive_predictions_with_actual_positives", impacts: overviewImpacts(checkId, text), materiality: "high", presentation: { condition_summary: conditionSummary } });
    }
    return finish(base, RESULT.ABSENT, `${run?.method || "The evaluated model"} produced positive predictions in this held-out diagnostic.`);
  });
}

function normaliseParameters(parameters) {
  const aliases = { reg_lambda: "lambda", reg_alpha: "alpha" };
  return Object.fromEntries(Object.entries(parameters || {}).map(([key, value]) => [aliases[key] || key, value]).sort(([left], [right]) => left.localeCompare(right)));
}

function searchExecutions(graph, meta) {
  const checkId = "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE";
  const searches = array(graph.hyperparameter_searches);
  if (!searches.length) {
    const design = meta?.focal_evaluation_design;
    const designText = String(design?.value || design?.display || "");
    if (/\b(?:tun(?:e|ed|ing)|hyperparameter|parameter\s+search|grid\s*search|random(?:ized|ised)?\s*search)\b/i.test(designText)) {
      const input = storyObject({ label: "Recorded tuning design", evidence_ids: array(design.evidence_ids), epistemic: design.epistemic }, "evaluation-design", "Recorded tuning design");
      const inputs = [graphInput(input, "EvaluationDesign", "recorded_tuning_design")];
      const base = storyBaseExecution(checkId, { workstream: focalStory(meta)?.target?.workstream_id || "focal target", display_label: focalStory(meta)?.target?.label || "Recorded tuning design" }, inputs, meta);
      return [finish(base, RESULT.INSUFFICIENT, "The evaluation record describes model tuning, but does not establish the final search stage, its selected settings and the exact evaluated estimator needed for this comparison.", { gaps: [gap(base.execution_id, `search-final-${input.id}`, "Search-to-final model relationship")], materiality: "undetermined" })];
    }
    return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No parameter-search stage requiring a search-to-final comparison is reconstructed in the available project record.")];
  }
  const grouped = Map.groupBy(searches, (item) => `${item.target_id || "unresolved"}|${item.method || "unresolved"}`);
  return [...grouped.values()].map((stages) => {
    const predecessorIds = new Set(stages.map((stage) => stage.predecessor_id).filter(Boolean));
    const terminals = stages.filter((stage) => !predecessorIds.has(stage.id));
    const terminal = terminals.length === 1 ? terminals[0] : null;
    const target = array(graph.target_definitions).find((item) => item.id === terminal?.target_id || item.id === stages[0]?.target_id);
    const run = array(graph.model_runs).find((item) => item.id === terminal?.final_model_run_id);
    const inputs = [...stages.map((stage) => graphInput(stage, "SearchStage", "search_stage")), graphInput(target, "TargetDefinition", "search_target"), graphInput(run, "ModelRun", "evaluated_final_estimator")];
    const base = baseExecution(checkId, { target_id: target?.id, model_run_id: run?.id, display_label: [labelOf(target), terminal?.method || stages[0]?.method].filter(Boolean).join(" · "), scope_object_ids: [terminal?.id, run?.id] }, inputs, meta);
    if (!terminal || !run || !terminal.best_parameters || !run.parameters || inputs.some((input) => !input.established)) return finish(base, RESULT.INSUFFICIENT, "The terminal search stage, final estimator link, parameters, or evidence is unresolved.", { gaps: [gap(base.execution_id, terminal?.id || `search-${target?.id}`, "Terminal search-to-final relationship")], materiality: "undetermined" });
    if (terminal.final_relationship === "linked_by_search_variable") return finish(base, RESULT.ABSENT, "The final estimator is reconstructibly linked to the terminal selected search value.");
    const best = normaliseParameters(terminal.best_parameters);
    const final = normaliseParameters(run.parameters);
    const keys = Object.keys(best);
    if (keys.some((key) => !Object.hasOwn(final, key))) return finish(base, RESULT.INSUFFICIENT, "One or more terminal best parameters cannot be compared with the final estimator.", { gaps: [gap(base.execution_id, terminal.id, "Comparable terminal and final parameters")], materiality: "undetermined" });
    const matches = keys.every((key) => JSON.stringify(best[key]) === JSON.stringify(final[key]));
    if (!matches) {
      const text = `${terminal.method || run.method || "The evaluated estimator"} for ${labelOf(target)} uses explicit parameters different from the terminal persisted best-search result.`;
      const conditionSummary = `For ${labelOf(target)}, the evaluated ${terminal.method || run.method || "model"} uses different settings from the final recorded best-search configuration.`;
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "terminal_search_final_parameter_difference", impacts: overviewImpacts(checkId, text), materiality: "medium", aggregationLabel: "affected target and model contexts", presentation: { condition_summary: conditionSummary } });
    }
    return finish(base, RESULT.ABSENT, "The evaluated final estimator corresponds to the terminal persisted best-search parameters.");
  });
}

function outputExecutions(graph, meta) {
  const checkId = "CHK-OUTPUT-COLUMN-CONSISTENCY";
  const outputs = array(graph.output_production_statements).filter((item) => item.output_type === "prediction_export");
  if (!outputs.length) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No prediction output-production statement is represented.")];
  return outputs.map((output) => {
    const target = array(graph.target_definitions).find((item) => item.id === output.target_id);
    const run = array(graph.model_runs).find((item) => item.id === output.producer_model_run_id);
    const inputs = [graphInput(output, "OutputProductionStatement", "prediction_output"), graphInput(target, "TargetDefinition", "output_target"), graphInput(run, "ModelRun", "output_producer")];
    const base = baseExecution(checkId, { target_id: target?.id, model_run_id: run?.id, output_id: output.id, display_label: labelOf(target), scope_object_ids: [output.id] }, inputs, meta);
    if (!output.assigned_prediction_column || !Array.isArray(output.selected_export_columns) || inputs.some((input) => !input.established)) return finish(base, RESULT.INSUFFICIENT, "The output assignment, selected columns, producer, target, or evidence is unresolved.", { gaps: [gap(base.execution_id, output.id, "Resolved output assignment and selection")], materiality: "undetermined" });
    if (!output.selected_export_columns.includes(output.assigned_prediction_column)) {
      const text = `The prediction output for ${labelOf(target)} does not select the column assigned for that same target.`;
      const conditionSummary = `For ${labelOf(target)}, the code creates one prediction field but the export selects a different field.`;
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "assigned_prediction_column_not_selected", impacts: overviewImpacts(checkId, text), materiality: "high", presentation: { condition_summary: conditionSummary } });
    }
    return finish(base, RESULT.ABSENT, `The prediction output for ${labelOf(target)} selects its assigned prediction column.`);
  });
}

function modelFamily(run) {
  return run?.estimator_class || run?.method || null;
}

function storyRoleExecution(meta) {
  const checkId = "CHK-ANALYTICAL-ROLE-ALIGNMENT";
  const story = focalStory(meta);
  const features = array(story?.feature_evidence).filter((item) => item.method);
  if (!story?.target || !story?.method || !features.length) return null;
  const target = storyObject(story.target, "focal-target", "Focal target");
  const resultRole = storyObject({ label: `${story.method} main result`, method: story.method, evidence_ids: array(story.result?.evidence_ids), epistemic: story.result?.epistemic }, "best-result-role", "Main-result model role");
  const featureMethods = unique(features.map((item) => item.method));
  const featureRole = storyObject({ label: `${featureMethods.join(", ")} feature evidence`, method: featureMethods.join(" | "), evidence_ids: evidenceOf(features), epistemic: features[0]?.epistemic }, "feature-role", "Feature-producing model role");
  const inputs = [graphInput(target, "TargetDefinition", "role_target"), graphInput(resultRole, "SelectionStatement", "best_result"), graphInput(featureRole, "FeatureEvidenceSet", "feature_producing")];
  const base = storyBaseExecution(checkId, { target_id: target.id, workstream: story.target.workstream_id || "focal target", display_label: target.label, scope_object_ids: [resultRole.id, featureRole.id] }, inputs, meta);
  if (inputs.some((input) => !input.established)) return finish(base, RESULT.INSUFFICIENT, "The main-result and feature-producing model roles are reconstructed, but one or more evidence bindings are incomplete.", { gaps: [gap(base.execution_id, `analytical-roles-${target.id}`, "Analytical role model identity")], materiality: "undetermined" });
  const aligned = featureMethods.every((method) => sameMethod(method, story.method));
  if (!aligned) {
    const text = `The main-result and feature-producing roles for ${target.label} refer to different model families while formal selection remains unresolved.`;
    const conditionSummary = `For ${target.label}, the model behind the main result and the model behind the feature evidence are not the same, and the project record does not document a formal selection that reconciles them.`;
    return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "analytical_role_family_divergence", impacts: overviewImpacts(checkId, text), materiality: "medium", presentation: { condition_summary: conditionSummary } });
  }
  return finish(base, RESULT.ABSENT, `The main-result and feature-producing model roles for ${target.label} both resolve to ${story.method}.`);
}

function roleExecutions(graph, meta) {
  const checkId = "CHK-ANALYTICAL-ROLE-ALIGNMENT";
  const targets = array(graph.target_definitions);
  if (!targets.length) {
    const storyExecution = storyRoleExecution(meta);
    return storyExecution ? [storyExecution] : [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "Fewer than two target-specific analytical roles are reconstructed in the available project record.")];
  }
  const runs = idMap(graph.model_runs);
  const selections = array(graph.selection_statements);
  const features = array(graph.feature_evidence_sets);
  const outputs = array(graph.output_production_statements).filter((item) => item.output_type === "prediction_export");
  return targets.map((target) => {
    const priorityMetric = graph.best_final_result?.metric_priority?.metric || null;
    const best = priorityMetric
      ? selections.find((item) => item.target_id === target.id && item.type === "best_final_on_metric" && item.metric === priorityMetric) || null
      : null;
    const feature = features.find((item) => item.target_id === target.id);
    const output = outputs.find((item) => item.target_id === target.id);
    const selected = selections.find((item) => item.target_id === target.id && item.type === "project_selected_model" && item.status === "established")
      || selections.find((item) => item.type === "project_selected_model" && item.status === "established") || null;
    const roleObjects = [
      best && { role: "best_result", statement: best, run: runs.get(best.model_run_id) },
      feature && { role: "feature_producing", statement: feature, run: runs.get(feature.model_run_id) },
      output && { role: "output_producing", statement: output, run: runs.get(output.producer_model_run_id) },
      selected && { role: "project_selected", statement: selected, run: runs.get(selected.model_run_id) },
    ].filter(Boolean);
    const inputs = [graphInput(target, "TargetDefinition", "role_target"), ...roleObjects.flatMap((item) => [graphInput(item.statement, item.role === "feature_producing" ? "FeatureEvidenceSet" : item.role === "output_producing" ? "OutputProductionStatement" : "SelectionStatement", item.role), graphInput(item.run, "ModelRun", `${item.role}_model_run`)])];
    const base = baseExecution(checkId, { target_id: target.id, display_label: labelOf(target), scope_object_ids: roleObjects.flatMap((item) => [item.statement?.id, item.run?.id]) }, inputs, meta);
    if (roleObjects.length < 2) return finish(base, RESULT.NOT_APPLICABLE, "Fewer than two material analytical roles are resolved for this target.");
    if (inputs.some((input) => !input.established) || roleObjects.some((item) => !modelFamily(item.run))) return finish(base, RESULT.INSUFFICIENT, "One or more analytical role identities or evidence bindings are unresolved.", { gaps: [gap(base.execution_id, `analytical-roles-${target.id}`, "Analytical role model identity")], materiality: "undetermined" });
    const families = unique(roleObjects.map((item) => modelFamily(item.run)));
    if (families.length > 1 && !selected) {
      const text = `Best-result, feature-producing, and output-producing roles for ${labelOf(target)} refer to different model families while formal selection remains unresolved.`;
      const conditionSummary = `For ${labelOf(target)}, the model with the best recorded result, the model used for feature importance and the model used to produce outputs are not all the same.`;
      return finish(base, RESULT.PRESENT, text, { condition: text, conditionKey: "analytical_role_family_divergence", impacts: overviewImpacts(checkId, text), materiality: "medium", presentation: { condition_summary: conditionSummary } });
    }
    return finish(base, RESULT.ABSENT, `Material analytical roles for ${labelOf(target)} align or are resolved by an explicit project-selection statement.`);
  });
}

function reproductionExecutions(graph, meta) {
  const checkId = "CHK-REPRODUCTION-INPUT-COVERAGE-V2";
  const focal = graph.best_final_result;
  if (!focal) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "No material analytical result requires reproduction inputs.")];
  const declaredRequirements = graph.reproduction_requirements || {};
  if (declaredRequirements.material_result === false) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "The graph explicitly establishes that reproduction inputs are not required for this scope.")];
  const metric = array(graph.metric_observations).find((item) => item.id === focal.analytical_result_id);
  const code = array(graph.notebook_execution_contexts).filter(hasEvidence);
  const execution = code.filter((item) => item.execution_count !== null || item.persisted_output);
  const snapshots = array(graph.dataset_snapshots).filter((item) => item.identity_status === "resolved" && hasEvidence(item));
  const environment = array(graph.environment_configurations).filter(hasEvidence);
  const predictionLabels = array(graph.prediction_label_artifacts).filter((item) => item.metric_observation_ids?.includes(metric?.id) && hasEvidence(item));
  const categoryInputs = [
    { object_id: code[0]?.id || "evidence-analytical-code", object_type: "NotebookExecutionContext", role: "analytical_code", label: "Analytical code", evidence_ids: evidenceOf(code), established: code.length > 0 },
    { object_id: snapshots[0]?.id || "evidence-data-snapshot", object_type: "DatasetSnapshot", role: "material_data_snapshot", label: "Material data snapshot identity", evidence_ids: evidenceOf(snapshots), established: snapshots.length > 0 },
    { object_id: environment[0]?.id || "evidence-configuration", object_type: "EnvironmentConfiguration", role: "environment_configuration", label: "Configuration or environment identity", evidence_ids: evidenceOf(environment), established: environment.length > 0 },
    { object_id: execution[0]?.id || "evidence-execution-context", object_type: "NotebookExecutionContext", role: "execution_context", label: "Persisted execution context", evidence_ids: evidenceOf(execution), established: execution.length > 0 },
    { object_id: predictionLabels[0]?.id || "evidence-prediction-label-artifacts", object_type: "PredictionLabelArtifact", role: "prediction_label_artifacts", label: "Prediction/label artefact linkage", evidence_ids: evidenceOf(predictionLabels), established: predictionLabels.length > 0 },
    { object_id: metric?.id || "evidence-metric-origin", object_type: "MetricObservation", role: "metric_origin", label: "Metric computation origin", evidence_ids: array(metric?.evidence_ids), established: Boolean(metric?.id && metric?.computation && metric?.score_input && hasEvidence(metric)) },
  ].filter((input) => declaredRequirements[input.role] !== false);
  if (!categoryInputs.length) return [finish(baseExecution(checkId, {}, [], meta), RESULT.NOT_APPLICABLE, "Every reproduction-input category is explicitly not required for this scope.")];
  const base = baseExecution(checkId, { target_id: focal.target_id, metric_observation_id: metric?.id, display_label: "Material result reproduction inputs", scope_object_ids: [metric?.id] }, categoryInputs, meta);
  const missing = categoryInputs.filter((input) => !input.established);
  const projectedFocal = Boolean(focalStory(meta) && (!focal.target_id || !metric));
  if (missing.length) {
    const summary = projectedFocal
      ? "One or more independent inputs needed to reproduce the result are not established in the available project evidence."
      : "One or more independent reproduction-input categories are unresolved in the stored reconstruction graph.";
    const gapFor = projectedFocal ? evidenceGap : gap;
    return [finish(base, RESULT.INSUFFICIENT, summary, { gaps: missing.map((input) => gapFor(base.execution_id, input.object_id, input.label, "qualifies")), materiality: "undetermined" })];
  }
  return [finish(base, RESULT.ABSENT, projectedFocal
    ? "All required inputs needed to reproduce the result are established in the available project evidence."
    : "All required reproduction-input categories are resolved in the stored reconstruction graph.")];
}

const executors = [focalExecutions, ancestryExecutions, populationExecutions, alignmentExecutions, preprocessingExecutions, metricExecutions, diagnosticExecutions, searchExecutions, outputExecutions, roleExecutions, reproductionExecutions];

export function executeGraphChecks(graph, meta = {}) {
  if (!graph || typeof graph !== "object") throw new Error("A stored analytical reconstruction graph is required.");
  return executors.flatMap((executor) => executor(graph, meta));
}

export function executeGraphCheck(checkId, graph, meta = {}) {
  return executeGraphChecks(graph, meta).filter((execution) => execution.check_id === checkId);
}
