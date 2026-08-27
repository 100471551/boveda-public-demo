import { createHash } from "node:crypto";

export const HISTORY_SCHEMA_VERSION = "boveda-history-0.11.1";

const unique = (values) => [...new Set((values || []).filter(Boolean))];

function stableId(record, key) {
  const digest = createHash("sha256").update(`${record.project_id}|${record.audit_id}|${key}`).digest("hex").slice(0, 10).toUpperCase();
  return `HIS-${digest}`;
}

function stableEvidenceId(kind, key) {
  const digest = createHash("sha256").update(`${kind}|${key}`).digest("hex").slice(0, 10).toUpperCase();
  return `E-HIS-${digest}`;
}

function evidenceHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function supported(field) {
  return field?.state === "established" && field.evidence_ids?.length;
}

function normaliseYear(value) {
  const year = Number(value);
  return year >= 1900 && year <= 2100 ? year : null;
}

export function explicitDateFromText(value) {
  const text = String(value || "");
  const range = text.match(/\b((?:19|20)\d{2})\s*(?:–|—|-)\s*((?:19|20)\d{2})\b/)
    || text.match(/\b(?:from\s+)?((?:19|20)\d{2})\s+(?:to|through|until)\s+((?:19|20)\d{2})\b/i);
  if (range) {
    const startYear = normaliseYear(range[1]);
    const endYear = normaliseYear(range[2]);
    if (startYear && endYear && endYear >= startYear) return {
      label: `${startYear}–${endYear}`,
      start: `${startYear}-01-01`,
      end: `${endYear}-12-31`,
      precision: "year_range",
      sort_at: `${endYear}-12-31T23:59:59.999Z`,
    };
  }

  const years = unique([...text.matchAll(/\b((?:19|20)\d{2})\b/g)].map((match) => normaliseYear(match[1]))).filter(Boolean);
  if (years.length > 1) {
    const startYear = Math.min(...years);
    const endYear = Math.max(...years);
    return {
      label: `${startYear}–${endYear}`,
      start: `${startYear}-01-01`,
      end: `${endYear}-12-31`,
      precision: "year_range",
      sort_at: `${endYear}-12-31T23:59:59.999Z`,
    };
  }
  const year = years[0];
  if (!year) return null;
  const week = text.match(new RegExp(`\\b${year}\\b[^.!;\\n]{0,32}\\b(?:target\\s+)?week\\s+(\\d{1,2})\\b`, "i"));
  return {
    label: week ? `${year} · Week ${Number(week[1])}` : String(year),
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    precision: week ? "year_and_week" : "year",
    sort_at: `${year}-12-31T23:59:59.999Z`,
  };
}

function relatedEvidence(evidenceIds, evidenceById) {
  return unique(evidenceIds).map((id) => evidenceById.get(id)).filter(Boolean).map((item) => ({
    type: item.kind,
    id: item.id,
    label: item.path,
  }));
}

function explicitFindingIds(event, findings) {
  return unique(findings.flatMap((finding) => {
    const relationships = Array.isArray(finding.temporal_relationships) ? finding.temporal_relationships : [];
    return relationships.some((relationship) => relationship?.event_id === event.event_id || relationship?.event_key === event.event_key)
      ? [finding.finding_id]
      : [];
  }));
}

const TEST_OR_CI_PATH = /(^|\/)(?:tests?|testdata|fixtures?|\.github|\.circleci|ci)(\/|$)/i;
const SUBSTANTIVE_PATH = /(?:^|\/)(?:src|model|models|notebook|notebooks|data|dataset|datasets|config|configs|pipeline|pipelines|reports?)(?:\/|$)|\.(?:ipynb|py|r|sql|ya?ml|json|csv|tsv|parquet)$/i;
const REQUIREMENT_PATH = /(?:requirement|specification|decision|adr|changelog|approval|rationale)/i;

export function commitMateriality(commit) {
  const text = `${commit.subject || ""} ${commit.body || ""}`;
  const substantiveFiles = (commit.changed_files || []).filter((item) => SUBSTANTIVE_PATH.test(item.path) && !TEST_OR_CI_PATH.test(item.path));
  const addedModelOrPipelineArtifact = substantiveFiles.some((item) => item.status === "A" && !/(^|\/)\.gitkeep$/i.test(item.path) && /(^|\/)(?:models?|pipelines?|data[-_ ]cleaning)(\/|$)/i.test(item.path));
  const reasons = [];
  if (/\b(?:dataset|data source|data cleaning|preprocess(?:ing)?|population|sample|snapshot)\b/i.test(text) && substantiveFiles.length) reasons.push("Data, population, sample, or snapshot change");
  if (/\b(?:model|method|algorithm|classifier|forecast|xgboost|random forest|neural|feature|target)\b/i.test(text) && substantiveFiles.length) reasons.push("Model, method, feature, or target change");
  if (/\b(?:evaluat(?:e|ed|ion)|metric|accuracy|precision|recall|auc|benchmark|holdout|cross[- ]validation|test set)\b/i.test(text) && substantiveFiles.length) reasons.push("Evaluation design or metric change");
  if (/\b(?:pipeline|architecture|production|deploy|migration|migrate|breaking|configuration)\b/i.test(text) && substantiveFiles.length) reasons.push("Pipeline, architecture, deployment, or configuration change");
  if (/\b(?:requirement|specification|decision|approved|approval|rationale|trade[- ]?off)\b/i.test(text) && ((commit.changed_files || []).some((item) => REQUIREMENT_PATH.test(item.path)) || substantiveFiles.length)) reasons.push("Requirement, decision, approval, or rationale recorded");
  if (addedModelOrPipelineArtifact) reasons.push("Model, pipeline, or data-preparation artifact added in an explicitly named project area");
  return { material: reasons.length > 0, reasons };
}

function rationaleRecorded(commit) {
  return Boolean(String(commit.body || "").trim()) || /\b(?:because|so that|in order to|rationale|due to|fix(?:es|ed)?|resolve[sd]?)\b/i.test(commit.subject || "");
}

function timestampDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return { label: "Date unresolved", start: null, end: null, precision: "unresolved", sort_at: null };
  return {
    label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date),
    start: date.toISOString(),
    end: date.toISOString(),
    precision: "timestamp",
    sort_at: date.toISOString(),
  };
}

function compact(value, maximum = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1).trimEnd()}…` : text;
}

function commitEvents(record, gitHistory) {
  if (!gitHistory?.available) return { events: [], evidence: [] };
  const tagsByCommit = new Map();
  for (const tag of gitHistory.tags || []) {
    if (!tagsByCommit.has(tag.commit_oid)) tagsByCommit.set(tag.commit_oid, []);
    tagsByCommit.get(tag.commit_oid).push(tag.name);
  }
  const evidence = [];
  const events = (gitHistory.commits || []).map((commit) => {
    const evidenceId = stableEvidenceId("git", commit.oid);
    const materiality = commitMateriality(commit);
    const tags = tagsByCommit.get(commit.oid) || [];
    const fileLines = (commit.changed_files || []).map((item) => `${item.status}\t${item.path}`);
    const excerpt = [`Commit: ${commit.oid}`, `Authored: ${commit.authored_at || "Date unresolved"}`, `Subject: ${commit.subject}`, commit.body ? `Body: ${commit.body}` : "Body: Not recorded", ...(commit.message_truncated ? ["Additional commit-message text omitted by the message bound."] : []), `Changed files (${commit.changed_file_count}):`, ...fileLines, ...(commit.changed_files_truncated ? ["Additional changed files omitted by the per-commit bound."] : [])].join("\n");
    evidence.push({ id: evidenceId, kind: "git_commit", path: `git:${commit.oid}`, epistemic: "OBSERVED", excerpt, sha256: evidenceHash(excerpt) });
    const relatedFiles = (commit.changed_files || []).slice(0, 12).map((item) => ({ type: "changed_file", id: item.path, label: `${item.status} · ${item.path}` }));
    const limitation = [
      !commit.body ? "No additional rationale was recorded in the commit body." : null,
      commit.message_truncated ? "Additional commit-message text remains in the bounded Git evidence source." : null,
      commit.changed_file_count > relatedFiles.length ? `${commit.changed_file_count - relatedFiles.length} additional changed files remain in the bounded Git evidence.` : null,
    ].filter(Boolean).join(" ") || null;
    return {
      event_id: stableId(record, `git-commit:${commit.oid}`),
      event_key: `git-commit:${commit.oid}`,
      source: "host_project",
      event_type: "git_commit",
      date: timestampDate(commit.authored_at),
      title: commit.subject,
      description: commit.body ? compact(commit.body) : `Commit ${commit.oid.slice(0, 10)} changed ${commit.changed_file_count} file${commit.changed_file_count === 1 ? "" : "s"}.`,
      epistemic: "OBSERVED",
      status: "reconstructed",
      material: materiality.material,
      materiality: { level: materiality.material ? "material" : "supporting", reasons: materiality.reasons },
      rationale_recorded: rationaleRecorded(commit),
      evidence_ids: [evidenceId],
      related: [{ type: "git_commit", id: commit.oid, label: commit.oid.slice(0, 10) }, ...tags.map((tag) => ({ type: "git_tag", id: tag, label: tag })), ...relatedFiles],
      finding_ids: [],
      limitation,
    };
  });
  return { events, evidence };
}

function tagEvents(record, gitHistory) {
  if (!gitHistory?.available) return { events: [], evidence: [] };
  const evidence = [];
  const events = (gitHistory.tags || []).map((tag) => {
    const evidenceId = stableEvidenceId("tag", `${tag.name}:${tag.commit_oid}`);
    const excerpt = [`Tag: ${tag.name}`, `Commit: ${tag.commit_oid}`, `Created: ${tag.created_at || "Date unresolved"}`, `Subject: ${tag.subject || "Not recorded"}`].join("\n");
    evidence.push({ id: evidenceId, kind: "git_tag", path: `git:tag/${tag.name}`, epistemic: "OBSERVED", excerpt, sha256: evidenceHash(excerpt) });
    const material = /^v?\d+(?:\.\d+){1,3}(?:[-+].*)?$/i.test(tag.name);
    return {
      event_id: stableId(record, `git-tag:${tag.name}:${tag.commit_oid}`),
      event_key: `git-tag:${tag.name}:${tag.commit_oid}`,
      source: "host_project",
      event_type: "git_tag",
      date: timestampDate(tag.created_at),
      title: material ? `Release tag ${tag.name}` : `Git tag ${tag.name}`,
      description: tag.subject ? `Tag ${tag.name} identifies ${tag.commit_oid.slice(0, 10)}: ${compact(tag.subject, 180)}` : `Tag ${tag.name} identifies commit ${tag.commit_oid.slice(0, 10)}.`,
      epistemic: "OBSERVED",
      status: "reconstructed",
      material,
      materiality: { level: material ? "material" : "supporting", reasons: material ? ["Versioned release tag"] : [] },
      evidence_ids: [evidenceId],
      related: [{ type: "git_tag", id: tag.name, label: tag.name }, { type: "git_commit", id: tag.commit_oid, label: tag.commit_oid.slice(0, 10) }],
      finding_ids: [],
      limitation: material ? null : "The tag is valid project history but is not a version-shaped release marker, so it remains supporting activity.",
    };
  });
  return { events, evidence };
}

function executionEvents(record, mlflow, gitHistory) {
  if (!mlflow?.available) return { events: [], evidence: [] };
  const commits = gitHistory?.commits || [];
  const evidence = [];
  const events = (mlflow.runs || []).map((run) => {
    const evidenceId = stableEvidenceId("mlflow", `${run.experiment_id}:${run.run_id}`);
    const commit = run.commit_ref ? commits.find((item) => item.oid.startsWith(run.commit_ref) || run.commit_ref.startsWith(item.oid)) : null;
    const status = String(run.status || "UNKNOWN").toUpperCase();
    const material = ["FAILED", "KILLED", "ERROR"].includes(status);
    const excerpt = [`MLflow run: ${run.run_id}`, `Experiment: ${run.experiment_id}`, `Status: ${status}`, `Started: ${run.started_at || "Date unresolved"}`, `Completed: ${run.completed_at || "Date unresolved"}`, `Commit: ${run.commit_ref || "Not recorded"}`, `Metrics: ${run.metrics.length ? run.metrics.map((item) => `${item.name}=${item.value}`).join(", ") : "None recovered"}`, "Source paths:", ...run.source_paths, ...(run.source_paths_truncated ? ["Additional run files omitted by the run bound."] : [])].join("\n");
    evidence.push({ id: evidenceId, kind: "mlflow_run", path: `mlflow:${run.experiment_id}/${run.run_id}`, epistemic: "OBSERVED", excerpt, sha256: evidenceHash(excerpt) });
    return {
      event_id: stableId(record, `mlflow-run:${run.experiment_id}:${run.run_id}`),
      event_key: `mlflow-run:${run.experiment_id}:${run.run_id}`,
      source: "host_project",
      event_type: "execution",
      date: timestampDate(run.completed_at || run.started_at),
      title: `MLflow run ${run.run_id}`,
      description: `${status} run${run.metrics.length ? ` with ${run.metrics.length} recorded metric${run.metrics.length === 1 ? "" : "s"}` : ""}${commit ? ` linked to commit ${commit.oid.slice(0, 10)}` : run.commit_ref ? ` with unresolved commit reference ${run.commit_ref}` : " without a recorded commit reference"}.`,
      epistemic: "OBSERVED",
      status: status.toLowerCase(),
      material,
      materiality: { level: material ? "material" : "supporting", reasons: material ? ["Failed or interrupted recorded execution"] : [] },
      evidence_ids: [evidenceId],
      related: [{ type: "execution", id: run.run_id, label: `Experiment ${run.experiment_id}` }, ...(run.commit_ref ? [{ type: "git_commit", id: run.commit_ref, label: commit ? `${commit.oid.slice(0, 10)} · resolved` : `${run.commit_ref} · unresolved` }] : [])],
      finding_ids: [],
      limitation: run.commit_ref && !commit ? "The run's commit reference does not resolve within the bounded recovered Git history." : null,
    };
  });
  return { events, evidence };
}

function dataPeriodEvent(record, evidenceById) {
  const field = record.reconstruction?.data?.period;
  if (!supported(field)) return null;
  const date = explicitDateFromText(field.value);
  if (!date) return null;
  const event = {
    event_id: stableId(record, "host-data-period"),
    event_key: "host-data-period",
    source: "host_project",
    event_type: "data_period",
    date,
    title: "Project data period reconstructed",
    description: String(field.value),
    epistemic: field.epistemic,
    status: "reconstructed",
    material: true,
    evidence_ids: unique(field.evidence_ids),
    related: relatedEvidence(field.evidence_ids, evidenceById),
    finding_ids: [],
    limitation: "This establishes the period represented by the project evidence; it does not establish when the dataset was created or changed.",
  };
  return event;
}

function evaluationEvent(record, evidenceById) {
  const primary = record.reconstruction?.results_evaluation?.primary_result;
  if (!supported(primary)) return null;
  const date = [primary.task_target, primary.evaluation_context, primary.method].map(explicitDateFromText).find(Boolean);
  const metric = String(primary.metric || "Primary result");
  const value = String(primary.display_value ?? "");
  const target = primary.task_target ? ` for ${primary.task_target}` : "";
  const method = primary.method ? ` using ${primary.method}` : "";
  return {
    event_id: stableId(record, "host-primary-evaluation"),
    event_key: "host-primary-evaluation",
    source: "host_project",
    event_type: "evaluation",
    date: date || { label: "Date unresolved", start: null, end: null, precision: "unresolved", sort_at: null },
    title: "Primary evaluation recorded",
    description: `Persisted project evidence records ${metric}${value ? ` ${value}` : ""}${target}${method}.`,
    epistemic: primary.epistemic,
    status: "reconstructed",
    material: true,
    evidence_ids: unique(primary.evidence_ids),
    related: relatedEvidence(primary.evidence_ids, evidenceById),
    finding_ids: [],
    limitation: date ? null : "The evaluation is supported, but the current Project Record does not establish when it was performed.",
  };
}

function bovedaAuditEvent(record) {
  const diagnostics = record.diagnostics || {};
  const attempts = diagnostics.llm?.attempts || [];
  const rejected = attempts.filter((attempt) => attempt.outcome === "rejected" || attempt.outcome === "failed");
  const retryCount = attempts.filter((attempt) => attempt.retry_scheduled).length;
  const completedAt = diagnostics.audit_completed_at || record.analysed_at;
  const completed = new Date(completedAt);
  const dateValid = !Number.isNaN(completed.getTime());
  const detail = attempts.length > 1
    ? `${attempts.length} reconstruction attempts were recorded${rejected.length ? `; ${rejected.length} did not pass validation` : ""}${retryCount ? ` and ${retryCount} triggered a retry` : ""}.`
    : attempts.length === 1 ? "One reconstruction attempt was recorded." : "Per-attempt telemetry is unavailable for this audit.";
  return {
    event_id: stableId(record, "boveda-audit"),
    event_key: "boveda-audit",
    source: "boveda",
    event_type: "boveda_audit",
    date: {
      label: dateValid ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(completed) + " UTC" : "Date unresolved",
      start: dateValid ? completed.toISOString() : null,
      end: dateValid ? completed.toISOString() : null,
      precision: dateValid ? "timestamp" : "unresolved",
      sort_at: dateValid ? completed.toISOString() : null,
    },
    title: "Bóveda audit completed",
    description: `Bóveda completed audit ${record.audit_id} and stored the current canonical Project Record. ${detail}`,
    epistemic: "OBSERVED",
    status: retryCount || rejected.length ? "completed_after_retry" : "completed",
    material: true,
    evidence_ids: [],
    related: [{ type: "boveda_audit", id: record.audit_id, label: "Audit diagnostics" }],
    finding_ids: [],
    limitation: "This is a Bóveda reconstruction event, not an event in the host project's own development history.",
  };
}

function chronological(events) {
  const sourceOrder = (event) => event.source === "boveda" ? 2 : event.date.sort_at ? 0 : 1;
  const typeOrder = { git_commit: 0, git_tag: 1, data_period: 2, evaluation: 3, execution: 4, boveda_audit: 5 };
  return [...events].sort((left, right) => {
    const sourceDelta = sourceOrder(left) - sourceOrder(right);
    if (sourceDelta) return sourceDelta;
    return String(left.date.sort_at || "").localeCompare(String(right.date.sort_at || ""))
      || (typeOrder[left.event_type] ?? 99) - (typeOrder[right.event_type] ?? 99)
      || left.event_id.localeCompare(right.event_id);
  });
}

function historyPresentation(sourceCollection, recovered, materialHostEvents, supportingEvents) {
  const materialSourceEvents = recovered.filter((event) => event.material).length;
  const totalSourceEvents = recovered.length;
  if (!sourceCollection?.root_available) return {
    availability: "limited",
    summary: "Bóveda could read the current project record, but the source project was not available for a fresh History reconstruction. It therefore cannot establish a complete account of how the project changed over time.",
  };
  if (!totalSourceEvents) return {
    availability: "limited",
    summary: "Bóveda found the project files, but little or no recorded history showing how the project changed over time. It therefore cannot reconstruct when or why important analytical decisions were made.",
  };
  if (materialSourceEvents <= 2) return {
    availability: "limited",
    summary: `Bóveda found ${totalSourceEvents} recorded project ${totalSourceEvents === 1 ? "change" : "changes"}, but ${materialSourceEvents ? `only ${materialSourceEvents}` : "none"} could be connected to a material data, model, evaluation, or release event. The remaining activity is retained as supporting context.`,
  };
  if (sourceCollection?.git?.truncated) return {
    availability: "substantial",
    summary: `Bóveda found extensive recorded project history. This view elevates ${materialHostEvents.length} material host-project events and retains ${supportingEvents.length} other changes as supporting context; older changes remain outside the bounded collection.`,
  };
  return {
    availability: "substantial",
    summary: `Bóveda reconstructed ${materialHostEvents.length} material host-project ${materialHostEvents.length === 1 ? "event" : "events"} and retained ${supportingEvents.length} other recorded ${supportingEvents.length === 1 ? "change" : "changes"} as supporting context.`,
  };
}

export function buildHistoryLayer(record, { findings = [], sourceCollection = null } = {}) {
  if (!record?.project_id || !record?.audit_id || !record?.reconstruction) throw new Error("A canonical Project Record is required.");
  const evidenceById = new Map((record.evidence || []).map((item) => [item.id, item]));
  const commits = commitEvents(record, sourceCollection?.git);
  const tags = tagEvents(record, sourceCollection?.git);
  const executions = executionEvents(record, sourceCollection?.mlflow, sourceCollection?.git);
  const recovered = [...commits.events, ...tags.events, ...executions.events];
  const candidates = [
    ...recovered.filter((event) => event.material),
    dataPeriodEvent(record, evidenceById),
    evaluationEvent(record, evidenceById),
    bovedaAuditEvent(record),
  ].filter(Boolean);
  const attachFindings = (event) => ({ ...event, finding_ids: explicitFindingIds(event, findings) });
  const events = chronological(candidates).map(attachFindings);
  const supportingEvents = chronological(recovered.filter((event) => !event.material)).map(attachFindings);
  const historyEvidence = [...commits.evidence, ...tags.evidence, ...executions.evidence];
  const hasGitIdentity = evidenceById.has("E-SYSTEM-GIT") || (record.evidence || []).some((item) => item.kind === "git_identity");
  const hasCommitEvidence = Boolean(sourceCollection?.git?.recovered_commit_count) || (record.evidence || []).some((item) => item.kind === "git_commit");
  const limitations = [];
  if (sourceCollection?.git?.limitation) limitations.push(sourceCollection.git.limitation);
  if (hasGitIdentity && !hasCommitEvidence) limitations.push("Git HEAD identity is available, but no commit messages and timestamps could be recovered; Git HEAD alone does not create a chronology.");
  if (sourceCollection?.git?.truncated) limitations.push(`Git history contains ${sourceCollection.git.total_commit_count} commits; History recovered the most recent bounded ${sourceCollection.git.recovered_commit_count}. Older commits remain outside this projection unless identified by a recovered tag.`);
  if (sourceCollection?.git?.tags_truncated) limitations.push(`Git tags exceeded the ${sourceCollection.git.tag_limit}-tag bound; older tag refs remain outside this projection.`);
  if (sourceCollection?.mlflow?.truncated) limitations.push(`MLflow collection reached its ${sourceCollection.mlflow.file_count}-file bound; additional run files were not inspected.`);
  if (sourceCollection && !sourceCollection.root_available) limitations.push("The recorded source-project path was unavailable, so source-level historical activity could not be refreshed.");
  if (!events.some((event) => event.source === "host_project")) limitations.push("No dated or persisted material host-project event could be reconstructed from the current Project Record.");
  const materialHostEvents = events.filter((event) => event.source === "host_project");
  return {
    schema_version: HISTORY_SCHEMA_VERSION,
    project_id: record.project_id,
    audit_id: record.audit_id,
    generated_from: { schema_version: record.schema_version, audit_id: record.audit_id },
    event_count: events.length,
    host_event_count: events.filter((event) => event.source === "host_project").length,
    boveda_event_count: events.filter((event) => event.source === "boveda").length,
    recovered_host_event_count: recovered.length,
    supporting_event_count: supportingEvents.length,
    events,
    supporting_events: supportingEvents,
    presentation: historyPresentation(sourceCollection, recovered, materialHostEvents, supportingEvents),
    evidence: historyEvidence,
    collection_summary: {
      git_available: Boolean(sourceCollection?.git?.available),
      git_total_commits: sourceCollection?.git?.total_commit_count || 0,
      git_recovered_commits: sourceCollection?.git?.recovered_commit_count || 0,
      git_tags: sourceCollection?.git?.tags?.length || 0,
      git_truncated: Boolean(sourceCollection?.git?.truncated),
      git_tags_truncated: Boolean(sourceCollection?.git?.tags_truncated),
      mlflow_available: Boolean(sourceCollection?.mlflow?.available),
      mlflow_runs: sourceCollection?.mlflow?.recovered_run_count || 0,
    },
    limitations,
  };
}
