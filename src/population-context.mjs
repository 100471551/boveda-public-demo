function unavailableSample(role, context) {
  const outputOnly = context?.nodes?.length > 0 && context.nodes.every((node) => node.role === "output");
  return {
    state: outputOnly ? "not_applicable" : "not_established",
    display: outputOnly ? `No ${role} sample applies to this output context.` : "–",
    count: null,
    unit: "observations",
    epistemic: outputOnly ? "DERIVED" : "UNRESOLVED",
    evidence_ids: outputOnly ? [...new Set(context.nodes.flatMap((node) => node.evidence_ids || []))] : [],
    analytical_context_id: context?.id || null,
  };
}

export function populationLineageContexts(lineage) {
  if (lineage?.contexts?.length) return lineage.contexts;
  const contexts = new Map();
  for (const node of lineage?.nodes || []) {
    const key = node.workstream_id || "unresolved-context";
    if (!contexts.has(key)) contexts.set(key, { id: key, key, workstream_id: node.workstream_id || null, workstream: node.workstream || "Context not established", nodes: [], edges: [] });
    contexts.get(key).nodes.push(node);
  }
  for (const context of contexts.values()) {
    const ids = new Set(context.nodes.map((node) => node.id));
    context.edges = (lineage?.edges || []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  }
  return [...contexts.values()].filter((context) => context.nodes.length >= 1);
}

export function populationContextSample(context, role, fallback) {
  if (!context) return fallback;
  const countKey = role === "training" ? "training_count" : "evaluation_count";
  const count = context[countKey];
  const candidates = (context.nodes || []).filter((node) => node.role === role);
  const node = candidates.find((item) => Number.isFinite(count) && item.count === count) || candidates.at(-1) || null;
  const resolvedCount = Number.isFinite(count) ? count : node?.count;
  if (!Number.isFinite(resolvedCount)) return unavailableSample(role, context);
  const sameAsFallback = fallback?.state === "established" && fallback.count === resolvedCount;
  const unit = sameAsFallback && fallback.unit
    ? fallback.unit
    : node?.unit || fallback?.unit || "observations";
  return {
    state: "established",
    display: sameAsFallback && fallback.display ? fallback.display : `${resolvedCount.toLocaleString("en-US")} ${unit}`,
    count: resolvedCount,
    unit,
    epistemic: node?.epistemic || "DERIVED",
    evidence_ids: [...new Set(node?.evidence_ids || context.evidence_ids || [])],
    population_id: node?.id || null,
    analytical_context_id: context.id || null,
  };
}

export function samplesForPopulationContext(projectSamples, context) {
  if (!context) return projectSamples;
  return {
    ...projectSamples,
    source_data: projectSamples.source_data,
    model_sample: populationContextSample(context, "training", projectSamples.model_sample),
    evaluation_sample: populationContextSample(context, "evaluation", projectSamples.evaluation_sample),
  };
}
