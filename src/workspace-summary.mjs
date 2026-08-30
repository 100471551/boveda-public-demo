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

function reviewStatusFor(finding) {
  const value = String(finding?.review_status || finding?.supervision?.review_status || "new").toLowerCase();
  return ["new", "in_review", "reviewed"].includes(value) ? value : "new";
}

function activityTitle(event) {
  if (event?.event_type === "boveda_audit") return "Audit completed";
  if (event?.event_type === "evaluation") return "Evaluation recorded";
  if (event?.event_type === "git_tag") return event.title?.startsWith("Release tag ")
    ? `${event.title.replace("Release tag ", "Release ")} recorded`
    : "Release recorded";
  if (event?.event_type === "data_period") return "Data period recorded";
  return event?.title || "Project activity recorded";
}

export function buildWorkspaceSummary(projects = [], layersByProject = {}) {
  const layerFor = (projectId) => layersByProject instanceof Map
    ? layersByProject.get(projectId)
    : layersByProject[projectId];
  const activeProjects = projects.length;
  let openSignals = 0;
  let evidenceGaps = 0;
  let totalTokens = 0;
  let usageProjects = 0;
  const signalBreakdown = { high: 0, medium: 0, low: 0, review: 0 };
  const attention = [];
  const signals = [];
  const activity = [];

  for (const project of projects) {
    const layers = layerFor(project.project_id) || {};
    const signalsLayer = layers.signals;
    const historyLayer = layers.history;
    const diagnosticsLayer = layers.diagnostics;
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
      const severity = String(finding?.materiality?.level || "review").toLowerCase();
      signalBreakdown[severity in signalBreakdown ? severity : "review"] += 1;
      signals.push({
        findingId: finding.finding_id || finding.signal_id,
        projectId: project.project_id,
        projectTitle: titleForProject(project),
        title: signalTitle(finding),
        summary: finding?.presentation?.condition_summary || finding?.explanation || finding?.condition || "Review the bounded condition and its evidence trail.",
        severity,
        reviewStatus: reviewStatusFor(finding),
      });
    }

    const meaningfulEvents = (historyLayer?.events || []).filter((event) =>
      ["boveda_audit", "evaluation", "git_tag", "data_period"].includes(event?.event_type)
      && event?.date?.sort_at);
    if (meaningfulEvents.length) {
      for (const event of meaningfulEvents) activity.push({
        eventId: event.event_id,
        projectId: project.project_id,
        projectTitle: titleForProject(project),
        title: activityTitle(event),
        detail: event.description || "Open the project History for the supporting record.",
        timestamp: event.date.sort_at,
        status: event.status || "recorded",
      });
    } else if (project.analysed_at) activity.push({
      eventId: `${project.project_id}-analysed`,
      projectId: project.project_id,
      projectTitle: titleForProject(project),
      title: "Project analysed",
      detail: "The current project record was created from the available evidence.",
      timestamp: project.analysed_at,
      status: "completed",
    });

    const projectTokens = Number(diagnosticsLayer?.llm?.total_usage?.total_tokens);
    if (Number.isFinite(projectTokens) && projectTokens >= 0) {
      totalTokens += projectTokens;
      usageProjects += 1;
    }
  }

  attention.sort((left, right) => right.attentionScore - left.attentionScore || left.title.localeCompare(right.title));
  signals.sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || left.projectTitle.localeCompare(right.projectTitle));
  activity.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));

  return { activeProjects, openSignals, evidenceGaps, totalTokens, usageProjects, signalBreakdown, attention, signals, activity };
}
