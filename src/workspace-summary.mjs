function countFor(layer, key) {
  const value = Number(layer?.finding_breakdown?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function titleForProject(project) {
  return project?.supervisor_project_title || project?.name || "Untitled project";
}

function signalTitle(finding) {
  return finding?.presentation?.title || finding?.name || finding?.condition || "Signal requiring review";
}

function severityRank(value) {
  return { high: 3, medium: 2, low: 1 }[String(value || "").toLowerCase()] || 0;
}

export function buildWorkspaceSummary(projects = [], layersByProject = {}) {
  const layerFor = (projectId) => layersByProject instanceof Map
    ? layersByProject.get(projectId)
    : layersByProject[projectId];
  const activeProjects = projects.length;
  let openSignals = 0;
  let evidenceGaps = 0;
  const attention = [];
  const signals = [];
  const activity = [];

  for (const project of projects) {
    const layers = layerFor(project.project_id) || {};
    const signalsLayer = layers.signals;
    const historyLayer = layers.history;
    const signalCount = countFor(signalsLayer, "signals");
    const gapCount = countFor(signalsLayer, "evidence_gaps");
    openSignals += signalCount;
    evidenceGaps += gapCount;
    attention.push({
      projectId: project.project_id,
      title: titleForProject(project),
      purpose: project.project_purpose || project.analytical_task || "Project supervision record",
      signalCount,
      gapCount,
      findingCount: Number(project.finding_count) || signalCount + gapCount,
      confidence: signalsLayer?.result_confidence || null,
      attentionScore: signalCount * 3 + gapCount,
    });

    for (const finding of signalsLayer?.findings || []) {
      if (finding?.finding_type !== "signal" || finding?.status !== "active") continue;
      signals.push({
        findingId: finding.finding_id || finding.signal_id,
        projectId: project.project_id,
        projectTitle: titleForProject(project),
        title: signalTitle(finding),
        summary: finding?.presentation?.condition_summary || finding?.explanation || finding?.condition || "Review the bounded condition and its evidence trail.",
        severity: String(finding?.materiality?.level || "review").toLowerCase(),
      });
    }

    const auditEvent = (historyLayer?.events || []).find((event) => event?.source === "boveda" && event?.event_type === "boveda_audit");
    const timestamp = auditEvent?.date?.sort_at || project.analysed_at;
    if (timestamp) activity.push({
      projectId: project.project_id,
      projectTitle: titleForProject(project),
      title: auditEvent?.title || "Bóveda analysis completed",
      detail: auditEvent?.description || "The current canonical Project Record was created from the available evidence.",
      timestamp,
      status: auditEvent?.status || "completed",
    });
  }

  attention.sort((left, right) => right.attentionScore - left.attentionScore || left.title.localeCompare(right.title));
  signals.sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || left.projectTitle.localeCompare(right.projectTitle));
  activity.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));

  return { activeProjects, openSignals, evidenceGaps, attention, signals, activity };
}
