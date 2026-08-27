function findingIdentity(finding) {
  return finding?.finding_type === "signal"
    ? finding.signal_id || finding.finding_id
    : finding?.evidence_gap_id || finding?.finding_id;
}

function structuredFindingRefs(finding) {
  const scope = finding.scope || finding.scopes || {};
  const scopeRefs = [
    [scope.target_id, "TargetDefinition"],
    [scope.model_run_id, "ModelRun"],
    [scope.evaluation_attempt_id, "EvaluationAttempt"],
    [scope.metric_observation_id, "MetricObservation"],
    [scope.population_id, "PopulationNode"],
    [scope.output_id, "OutputProductionStatement"],
  ].filter(([objectId]) => objectId).map(([objectId, objectType]) => ({ object_id: objectId, object_type: objectType }));
  return [...(finding.trail?.graph_object_refs || []), ...scopeRefs];
}

function canonicalFindings(layer) {
  const byIdentity = new Map();
  for (const finding of layer?.findings || []) {
    if (finding?.status !== "active" || !["signal", "evidence_gap"].includes(finding.finding_type)) continue;
    const identity = findingIdentity(finding);
    if (!identity) continue;
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, { identity, finding_type: finding.finding_type, impacts: [...(finding.impacts || [])], structured_refs: structuredFindingRefs(finding) });
      continue;
    }
    const impactKeys = new Set(existing.impacts.map((impact) => `${impact.object_type}|${impact.object_id}`));
    for (const impact of finding.impacts || []) {
      const key = `${impact.object_type}|${impact.object_id}`;
      if (!impactKeys.has(key)) {
        impactKeys.add(key);
        existing.impacts.push(impact);
      }
    }
    const refKeys = new Set(existing.structured_refs.map((ref) => `${ref.object_type}|${ref.object_id}`));
    for (const ref of structuredFindingRefs(finding)) {
      const key = `${ref.object_type}|${ref.object_id}`;
      if (!refKeys.has(key)) {
        refKeys.add(key);
        existing.structured_refs.push(ref);
      }
    }
  }
  return [...byIdentity.values()];
}

function summarize(sectionId, related) {
  const signals = related.filter((finding) => finding.finding_type === "signal").map((finding) => finding.identity).sort();
  const evidenceGaps = related.filter((finding) => finding.finding_type === "evidence_gap").map((finding) => finding.identity).sort();
  return {
    section_id: sectionId,
    signal_ids: signals,
    evidence_gap_ids: evidenceGaps,
    signal_count: signals.length,
    evidence_gap_count: evidenceGaps.length,
  };
}

export function buildOverviewFindingAssociations(layer) {
  const findings = canonicalFindings(layer);
  return Object.fromEntries((layer?.overview?.sections || []).map((section) => {
    const fieldIds = new Set((section.groups || []).flatMap((group) => group.field_ids || []));
    const related = findings.filter((finding) => finding.impacts.some((impact) => impact.object_type === "overview_field" && fieldIds.has(impact.object_id)));
    return [section.id, summarize(section.id, related)];
  }));
}

const ANALYTICAL_AREA_OBJECT_TYPES = {
  "area-feature-driver-evidence": new Set(["FeatureEvidenceSet"]),
  "area-model-result-comparison": new Set(["MetricObservation"]),
  "area-evaluation-behaviour": new Set(["DiagnosticObservation"]),
  "area-data-missingness": new Set(["MissingnessObservation"]),
  "area-population-lineage": new Set(["PopulationNode", "PopulationRelation"]),
};

export function buildAnalyticalFindingAssociations(layer) {
  const findings = canonicalFindings(layer);
  return Object.fromEntries(Object.entries(ANALYTICAL_AREA_OBJECT_TYPES).map(([areaId, objectTypes]) => {
    const related = findings.filter((finding) => finding.impacts.some((impact) => impact.object_type === "analytical_area" && impact.object_id === areaId)
      || finding.structured_refs.some((ref) => objectTypes.has(ref.object_type)));
    return [areaId, summarize(areaId, related)];
  }));
}

export function relatedFindingLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}
