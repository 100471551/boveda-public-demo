import fs from "node:fs";
import { diagnosticsForRecord } from "./diagnostics.mjs";
import { buildSignalsLayer } from "./signals.mjs";
import { buildHistoryLayer } from "./history.mjs";
import { APPLICATION_VERSION } from "./version.mjs";
import { buildFindingsPresentation } from "../src/findings-presentation.mjs";
import { friendlyCheckResult } from "../src/communication-copy.mjs";
import { featureStandoutSummary, modelComparisonStandoutSummary, evaluationStandoutSummary } from "../src/analytical-presentation.mjs";
import { displayReconstructionText, fieldMissingLabel, projectDescriptionField, reconstructionConfidenceExplanation, reconstructionConfidenceLabel } from "../src/reconstruction-display.mjs";
import { analyticalAvailabilityMessage, primaryResultAvailability } from "../src/sparse-communication.mjs";
import { canonicalSupervisorProjectTitleForRecord } from "../src/project-display.mjs";

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const array = (value) => Array.isArray(value) ? value : [];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const words = (value) => String(value || "").replaceAll("_", " ").replace(/\s+/g, " ").trim();
const anchor = (value) => String(value).replace(/[^a-z0-9_-]+/gi, "-");
const evidenceAnchor = (value) => `evidence-${anchor(value)}`;

function asset(relative, mime) {
  try { return `data:${mime};base64,${fs.readFileSync(new URL(relative, import.meta.url)).toString("base64")}`; } catch { return ""; }
}

const assets = {
  logo: asset("../public/Boveda_Logo_Black.svg", "image/svg+xml"),
  regular: asset("../public/fonts/FlinkRegular.otf", "font/otf"),
  italic: asset("../public/fonts/FlinkRegularItalic.otf", "font/otf"),
  bold: asset("../public/fonts/FlinkBold.otf", "font/otf"),
  boldItalic: asset("../public/fonts/FlinkBoldItalic.otf", "font/otf"),
};

function number(value, precision = 3) {
  if (!Number.isFinite(value)) return "–";
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toFixed(precision).replace(/0+$/, "").replace(/\.$/, "");
}

export function reportResultValue(result) {
  if (Number.isFinite(result?.raw_value)) return number(result.raw_value, result.display_precision ?? 3);
  const displayed = String(result?.display_value ?? "").trim();
  const numericDisplay = displayed.match(/^([+-]?\d+(?:\.\d+)?)\s*(%?)$/);
  if (numericDisplay && Number.isFinite(result?.display_precision)) {
    return `${number(Number(numericDisplay[1]), Math.min(6, Math.max(0, result.display_precision)))}${numericDisplay[2]}`;
  }
  return displayed && displayed !== "–" ? displayed : "–";
}

export function reportComparisonSets(analytical) {
  const finalSets = array(analytical?.object_graph?.final_comparison_sets);
  return finalSets.length ? finalSets : array(analytical?.comparison_sets);
}

export function reportMaterialResults(reconstruction) {
  return array(reconstruction?.results_evaluation?.material_results)
    .filter((item) => item?.state === "established" && String(item.display_value ?? "").trim())
    .map((item) => ({ ...item, report_value: reportResultValue({ ...item, display_precision: item.display_precision ?? 6 }) }));
}

function date(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
}

function sentence(value) {
  const text = displayReconstructionText(words(value)).trim();
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}

function clientText(value) {
  return displayReconstructionText(words(value))
    .replace(/current canonical Project Record/gi, "current project record")
    .replace(/canonical Project Record/gi, "project record")
    .replace(/current Project Record/gi, "current project record")
    .replace(/compatible analytical contexts/gi, "model and target contexts")
    .replace(/compatible modelling contexts/gi, "model and target contexts")
    .replace(/affected modelling contexts/gi, "model and target contexts")
    .replace(/affected model contexts/gi, "model and target contexts")
    .replace(/affected metric contexts/gi, "metric calculations")
    .replace(/scoped executions?/gi, "verification checks")
    .replace(/canonical identity/gi, "recorded identity")
    .replace(/dependency identity/gi, "source relationship")
    .replace(/represented evidence trail/gi, "linked evidence")
    .replace(/persisted scoring statement/gi, "recorded scoring output")
    .replace(/persisted diagnostics/gi, "recorded diagnostics")
    .replace(/\bpersisted\b/gi, "recorded")
    .replace(/current analytical record/gi, "current analysis");
}

function clientSentence(value) {
  const text = clientText(value).trim();
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}

function field(item, reconstruction, fieldId) {
  const raw = item?.value ?? item?.display ?? item?.display_value;
  return displayReconstructionText(item?.state === "established" && raw !== undefined ? raw : fieldMissingLabel(item, fieldId, reconstruction));
}

function evidenceLinks(ids, label = "Evidence") {
  const tokens = [...new Set(array(ids).filter(Boolean))];
  return tokens.length ? `<p class="evidence-links"><b>${esc(label)}</b> ${tokens.map((id) => `<a href="#${evidenceAnchor(id)}">${esc(id)}</a>`).join(" · ")}</p>` : "";
}

function epistemic(item) {
  return item?.epistemic ? `<span class="epistemic">${esc(item.epistemic)}</span>` : "";
}

function heading(id, eyebrow, title, intro = "") {
  return `<header class="section-heading" id="${anchor(id)}"><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2>${intro ? `<p>${esc(intro)}</p>` : ""}</header>`;
}

function editorialRow(label, item, reconstruction, fieldId) {
  return `<div class="editorial-row"><dt>${esc(label)}</dt><dd><p>${esc(field(item, reconstruction, fieldId))}</p>${epistemic(item)}${evidenceLinks(item?.evidence_ids)}</dd></div>`;
}

function targetName(graph, id) {
  return array(graph?.target_definitions).find((item) => item.id === id)?.semantic_name || "Target not established";
}

function focalStoryFallback(analytical) {
  const story = analytical?.presentation?.main_target_story;
  if (!story || story.status === "unavailable" || !story.target?.label) return null;
  const graph = analytical?.object_graph;
  if (graph?.best_final_result?.selection_mode === "canonical_primary_fallback") return story;
  const bestTargetId = graph?.best_final_result?.target_id;
  const hasLinkedTarget = Boolean(bestTargetId && array(graph?.target_definitions).some((item) => item.id === bestTargetId));
  return hasLinkedTarget ? null : story;
}

function populationName(graph, id) {
  return array(graph?.population_nodes).find((item) => item.id === id)?.label || "Population not established";
}

function table(headers, rows, className = "") {
  if (!rows.length) return `<p class="not-applicable">No supported entries were reconstructed for this table.</p>`;
  const wide = className.includes("technical") && (headers.length >= 6 || className.includes("evidence-index"));
  return `<div class="table-wrap${wide ? " table-wrap--wide" : ""}"><table class="${esc(className)}"><thead><tr>${headers.map((item) => `<th>${esc(item)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function resultFor(set, method, metric) {
  return array(set?.results).find((item) => item.method === method && item.metric === metric.key);
}

function resultTone(set, metric, result) {
  if (!Number.isFinite(result?.value)) return "empty";
  const values = array(set.methods).map((method) => resultFor(set, method, metric)?.value).filter(Number.isFinite);
  const direction = metric.direction_of_better || metric.direction;
  if (!values.length || !["higher", "lower"].includes(direction)) return "neutral";
  const best = direction === "higher" ? Math.max(...values) : Math.min(...values);
  const worst = direction === "higher" ? Math.min(...values) : Math.max(...values);
  if (Math.abs(result.value - best) < 1e-12) return "best";
  if (values.length > 1 && Math.abs(result.value - worst) < 1e-12) return "low";
  return "mid";
}

function comparison(set, complete = false) {
  if (!set?.methods?.length || !set?.metrics?.length) return "";
  const rows = set.metrics.map((metric) => `<tr><th>${esc(metric.label)}${metric.score_input === "hard_label" ? `<small>calculated from yes/no predictions</small>` : ""}</th>${set.methods.map((method) => { const result = resultFor(set, method, metric); return `<td class="metric-${resultTone(set, metric, result)}">${result ? number(result.value, result.persisted_precision || 3) : "–"}</td>`; }).join("")}</tr>`);
  return `<article class="comparison avoid-break"><h3>${esc(set.display_label || set.target_name || "Model comparison")}</h3><p>Results recorded for the same target and evaluation setup.</p>${table(["Metric", ...set.methods], rows, "comparison-table")}<p class="caption">${esc(modelComparisonStandoutSummary(set))}</p>${complete ? evidenceLinks(array(set.results).flatMap((item) => item.evidence_ids)) : ""}</article>`;
}

function matrix(diagnostic, graph) {
  const values = [diagnostic.tn, diagnostic.fp, diagnostic.fn, diagnostic.tp].every(Number.isFinite)
    ? [diagnostic.tn, diagnostic.fp, diagnostic.fn, diagnostic.tp] : array(diagnostic.values).flat();
  if (values.length < 4) return "";
  const explanation = evaluationStandoutSummary(diagnostic);
  return `<article class="matrix-card avoid-break"><h3>${esc(diagnostic.method || "Evaluation diagnostic")}</h3><p>${esc(targetName(graph, diagnostic.target_id))}</p><small>Rows: actual · columns: predicted</small><div class="matrix"><i></i><b>Predicted 0</b><b>Predicted 1</b><b>Actual 0</b><strong class="dark">${number(values[0], 0)}</strong><strong>${number(values[1], 0)}</strong><b>Actual 1</b><strong>${number(values[2], 0)}</strong><strong>${number(values[3], 0)}</strong></div>${explanation ? `<p class="caption">${esc(explanation)}</p>` : ""}${evidenceLinks(diagnostic.evidence_ids)}</article>`;
}

function featureEvidence(set, graph, limit) {
  const ranked = array(graph?.feature_evidence).filter((item) => array(set?.feature_ids).includes(item.id)).sort((left, right) => (right.value ?? -Infinity) - (left.value ?? -Infinity));
  const shown = Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
  if (!shown.length) return "";
  const usageOnly = shown.every((item) => item.evidence_type === "feature_usage" && !Number.isFinite(item.value));
  if (usageOnly) return `<article class="feature-card"><header><h3>${esc(targetName(graph, set.target_id))}</h3><p>${esc(set.method)} · recorded inputs</p></header><div class="features">${shown.map((item) => `<div><span>${esc(item.display_label || item.feature)}</span><i><b class="tone-cyan" style="width:100%"></b></i><strong>Used</strong></div>`).join("")}</div><p class="caption">${esc(featureStandoutSummary(shown))}</p><p class="boundary">The evidence establishes feature use, not relative importance or cause and effect.</p>${evidenceLinks([...array(set.evidence_ids), ...shown.flatMap((item) => array(item.evidence_ids))])}</article>`;
  const max = Math.max(...shown.map((item) => item.value).filter(Number.isFinite), 0);
  return `<article class="feature-card"><header><h3>${esc(targetName(graph, set.target_id))}</h3><p>${esc(set.method)} · ${esc(words(set.estimator_variant))}</p></header><div class="features">${shown.map((item, index) => `<div><span>${esc(item.display_label || item.feature)}</span><i><b class="tone-${index < 2 ? "green" : index < 4 ? "cyan" : "orange"}" style="width:${max && Number.isFinite(item.value) ? Math.max(3, item.value / max * 100).toFixed(2) : 0}%"></b></i><strong>${number(item.value, 6)}</strong></div>`).join("")}</div><p class="caption">${esc(featureStandoutSummary(ranked))}</p><p class="boundary">Feature importance shows model reliance, not cause and effect.</p>${evidenceLinks([...array(set.evidence_ids), ...shown.flatMap((item) => array(item.evidence_ids))])}</article>`;
}

function storyFeatureEvidence(story, limit) {
  const all = array(story?.feature_evidence);
  const ranked = all.filter((item) => Number.isFinite(item.value)).sort((left, right) => (right.value ?? -Infinity) - (left.value ?? -Infinity));
  const source = ranked.length ? ranked : all.filter((item) => item.evidence_type === "feature_usage");
  const shown = Number.isFinite(limit) ? source.slice(0, limit) : source;
  if (!shown.length) return "";
  const usageOnly = shown.every((item) => item.evidence_type === "feature_usage" && !Number.isFinite(item.value));
  if (usageOnly) return `<article class="feature-card"><header><h3>${esc(story.target?.label || "Target not established")}</h3><p>${esc(story.method || shown[0]?.method || "Model not established")} · recorded inputs</p></header><div class="features">${shown.map((item) => `<div><span>${esc(item.display_label || item.feature)}</span><i><b class="tone-cyan" style="width:100%"></b></i><strong>Used</strong></div>`).join("")}</div><p class="caption">${esc(featureStandoutSummary(shown))}</p><p class="boundary">The evidence establishes feature use, not relative importance or cause and effect.</p>${evidenceLinks(shown.flatMap((item) => array(item.evidence_ids)))}</article>`;
  const max = Math.max(...shown.map((item) => item.value), 0);
  return `<article class="feature-card"><header><h3>${esc(story.target?.label || "Target not established")}</h3><p>${esc(story.method || shown[0]?.method || "Model not established")}</p></header><div class="features">${shown.map((item, index) => `<div><span>${esc(item.display_label || item.feature)}</span><i><b class="tone-${index < 2 ? "green" : index < 4 ? "cyan" : "orange"}" style="width:${max ? Math.max(3, item.value / max * 100).toFixed(2) : 0}%"></b></i><strong>${number(item.value, 6)}</strong></div>`).join("")}</div><p class="caption">${esc(featureStandoutSummary(ranked))}</p><p class="boundary">Feature importance shows model reliance, not cause and effect.</p>${evidenceLinks(shown.flatMap((item) => array(item.evidence_ids)))}</article>`;
}

function cover(record, description, generatedAt, projectName) {
  return `<section class="cover"><div class="cover-top">${assets.logo ? `<img src="${assets.logo}" alt="Bóveda">` : `<strong>boveda</strong>`}<span>Project analysis report</span></div><div class="cover-main"><p class="eyebrow">Client report</p><h1>${esc(projectName)}</h1><p>${esc(description.value || "Project purpose is not established in the available record.")}</p></div><dl><div><dt>Report reference</dt><dd>${esc(record.audit_id)}</dd></div><div><dt>Generation date</dt><dd>${esc(date(generatedAt))}</dd></div><div><dt>Bóveda version</dt><dd>Alpha ${esc(APPLICATION_VERSION)}</dd></div></dl><small>Generated from the available project record</small></section>`;
}

function toc(items) {
  return `<nav class="toc">${heading("contents", "Contents", "In this report")}<ol>${items.map((item, index) => `<li><a href="#${anchor(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span>${esc(item.label)}</a></li>`).join("")}</ol></nav>`;
}

function coverageLabel(state) {
  const key = String(state?.state || state?.label || "").toLowerCase().replace(/\s+/g, "_");
  if (key.includes("sufficient")) return "Coverage is sufficient";
  if (key.includes("partial")) return "Overall coverage is partial";
  if (key.includes("not_covered") || key.includes("insufficient") || key.includes("limited")) return "Overall coverage is limited";
  return "Coverage not established";
}

function domainCoverageLabel(state) {
  const key = String(state?.state || state?.label || "").toLowerCase().replace(/\s+/g, "_");
  if (key.includes("sufficient")) return "Sufficient";
  if (key.includes("partial")) return "Partial";
  if (key.includes("not_covered") || key.includes("insufficient") || key.includes("limited")) return "Limited";
  return "Not assessed";
}

function coverageDomainSummary(domain) {
  const summaries = {
    "coverage-project-context": "Whether the project purpose, scope, methods, decisions and limitations are supported.",
    "coverage-traceability": "Whether the main conclusions link to identifiable source material.",
    "coverage-reproducibility": "Whether the main analytical result can be recreated from the available project material.",
    "coverage-source": "Whether the source material needed to support the main claims was available for review.",
  };
  return summaries[domain?.id] || clientSentence(domain?.summary || "This part of the project record was not assessed.");
}

function overallPosition(_record, signals, presentation) {
  const coverage = signals?.project_evidence_coverage;
  const gaps = presentation.evidence_gaps.length;
  const domains = new Map(array(coverage?.domains).map((domain) => [domain.id, domain.state?.state]));
  const connected = ["coverage-project-context", "coverage-traceability", "coverage-source"].every((id) => domains.get(id) === "sufficiently_covered");
  const reproductionIncomplete = domains.get("coverage-reproducibility") === "partially_covered" || domains.get("coverage-reproducibility") === "not_covered";
  const lead = connected
    ? "The project record is well connected across its main purpose, results and supporting evidence"
    : coverage?.state === "sufficiently_covered"
      ? "The available project record provides sufficient support across the assessed areas"
      : "The available project record supports some areas more completely than others";
  if (gaps) {
    const unresolved = `${gaps} evidence ${gaps === 1 ? "gap is" : "gaps are"} still unresolved`;
    return `${lead}, but ${reproductionIncomplete ? "exact reproduction remains incomplete" : "some verification remains incomplete"} because ${unresolved}.`;
  }
  if (coverage?.state === "sufficiently_covered") return `${lead}, with no material evidence gaps represented in the current record.`;
  if (reproductionIncomplete) return `${lead}, but some evidence needed for exact reproduction is still missing.`;
  return `${lead}.`;
}

function executive(record, analytical, signals, presentation) {
  const r = record.reconstruction;
  const story = analytical?.presentation?.main_target_story;
  const purposeAvailable = story?.section_answers?.purpose_scope?.dashboard_available === true;
  const resultsAvailable = story?.section_answers?.results_evaluation?.dashboard_available === true;
  const description = purposeAvailable ? (r.purpose_scope.summary?.state === "established" ? r.purpose_scope.summary : projectDescriptionField(r)) : { value: null, evidence_ids: [] };
  const focal = analytical?.presentation?.focal_results_evaluation;
  const best = resultsAvailable ? story?.result || focal?.result || analytical?.presentation?.best_final_result : null;
  const resultAvailability = primaryResultAvailability(r.results_evaluation.primary_result);
  const confidence = signals?.result_confidence || r.confidence;
  const severity = new Map();
  for (const item of presentation.signals) severity.set(item.severity || "Unspecified", (severity.get(item.severity || "Unspecified") || 0) + 1);
  const severityLine = ["Critical", "High", "Medium", "Low", "Unspecified"].filter((key) => severity.has(key)).map((key) => `${severity.get(key)} ${key}`).join(" · ");
  const plainReproductionBoundary = Boolean(focalStoryFallback(analytical));
  return `<section class="report-section major" id="executive-summary">${heading("executive-heading", "Executive summary", "The project and Bóveda’s position", "A concise view of the project, its primary recorded result and the parts of the record that need attention.")}<div class="executive-grid"><article class="card"><p class="label">What the project does</p><p class="lead">${esc(description.value || "The project purpose could not be established from the available record.")}</p>${evidenceLinks(description.evidence_ids)}</article><article class="card result-card"><p class="label">${best ? "Best recorded result" : "Evaluation result"}</p>${best ? `<div class="big-result"><b>${esc(best.metric)}</b><strong>${esc(reportResultValue(best))}</strong></div><dl class="mini"><div><dt>Model</dt><dd>${esc(best.method || "Not established")}</dd></div><div><dt>Target</dt><dd>${esc(best.task_target || "Not established")}</dd></div><div><dt>Evaluation</dt><dd>${esc(best.evaluation_context || field(focal?.evaluation_sample, r, "field-evaluation-sample"))}</dd></div></dl>${evidenceLinks(best.evidence_ids)}` : `<h3>${esc(resultAvailability.title)}</h3><p>${esc(resultAvailability.detail)}</p>${evidenceLinks(r.results_evaluation.primary_result?.evidence_ids)}`}<div class="confidence"><b>${esc(reconstructionConfidenceLabel(confidence))}</b><p>${esc(reconstructionConfidenceExplanation(confidence, r, { plainReproductionBoundary }))}</p></div></article><article class="card"><p class="label">What needs attention</p><div class="attention"><div><strong>${presentation.signals.length}</strong><span>${presentation.signals.length === 1 ? "Signal" : "Signals"}</span></div><div><strong>${presentation.evidence_gaps.length}</strong><span>Evidence ${presentation.evidence_gaps.length === 1 ? "Gap" : "Gaps"}</span></div></div><p class="muted">${esc(severityLine || "No Signal severity distribution applies.")}</p></article><article class="card evidence-card"><p class="label">Overall evidence position</p><p class="lead">${esc(overallPosition(record, signals, presentation))}</p><span class="pill">${esc(coverageLabel(signals?.project_evidence_coverage))}</span></article></div></section>`;
}

function projectOverview(record) {
  const r = record.reconstruction;
  return `<section class="report-section" id="project-overview">${heading("overview-heading", "Project explanation", "Project overview", "What the project is intended to do, the objects it analyses and the use it is intended to support.")}<div class="two-column"><article class="narrative"><h3>Purpose</h3><p>${esc(field(r.purpose_scope.summary, r, "field-purpose"))}</p>${evidenceLinks(r.purpose_scope.summary?.evidence_ids)}</article><dl class="editorial">${editorialRow("Analytical task", r.purpose_scope.task, r, "field-task")}${editorialRow("Target / outcome", r.purpose_scope.target_outcome, r, "field-target-outcome")}${editorialRow("Unit of observation", r.data.unit_of_observation?.state === "established" ? r.data.unit_of_observation : r.purpose_scope.unit, r, "field-unit-of-observation")}${editorialRow("Population / scope", r.purpose_scope.population_scope, r, "field-population-scope")}${editorialRow("Intended use", r.purpose_scope.intended_use, r, "field-intended-use")}${editorialRow("Project period", r.data.period, r, "field-period")}${editorialRow("Major data sources", r.data.data_sources, r, "field-data-sources")}</dl></div></section>`;
}

function dataPopulations(record, analytical) {
  const r = record.reconstruction;
  const graph = analytical?.object_graph;
  const story = analytical?.presentation?.main_target_story;
  const populationAnswer = story?.section_answers?.data_populations_samples;
  const lineageAnswer = story?.section_answers?.population_lineage;
  const missingnessAnswer = story?.section_answers?.data_missingness;
  const populationAvailable = populationAnswer?.dashboard_available === true;
  const answeredLineage = lineageAnswer?.dashboard_available ? lineageAnswer.answer?.lineage : null;
  const nodes = array(answeredLineage?.nodes).filter((item) => Number.isFinite(item.count));
  const relations = array(answeredLineage?.edges);
  const populationById = new Map(nodes.map((item) => [item.id, item]));
  const populationLabel = (id) => populationById.get(id)?.label || populationName(graph, id);
  const max = Math.max(...nodes.map((item) => item.count), 0);
  const visual = nodes.length ? `<div class="population-visual">${nodes.map((item, index) => `<div><header><span>${esc(item.label)}</span><strong>${number(item.count, 0)}</strong></header><i><b class="tone-${index % 3 === 0 ? "green" : index % 3 === 1 ? "cyan" : "orange"}" style="width:${max ? Math.max(2, item.count / max * 100).toFixed(2) : 0}%"></b></i><small>${esc(words(item.role))}</small></div>`).join("")}</div>` : "";
  const lineage = relations.length ? `<div class="lineage">${relations.map((item) => `<article class="avoid-break"><div><strong>${esc(populationLabel(item.from))}</strong><span>→ ${esc(words(item.relation))} →</span><strong>${esc(populationLabel(item.to))}</strong></div>${item.predicate ? `<p>${esc(clientSentence(item.predicate))}</p>` : ""}${evidenceLinks(item.evidence_ids)}</article>`).join("")}</div>` : `<p class="not-applicable">${esc(analyticalAvailabilityMessage("sample_lineage", r))}</p>`;
  const samples = populationAvailable ? populationAnswer.answer?.populations : null;
  const missingness = missingnessAnswer?.dashboard_available ? array(missingnessAnswer.answer?.measurements) : [];
  const missingRows = missingness.map((item) => `<tr><td>${esc(item.field)}</td><td>${esc(item.unit === "percent" ? `${number(item.value, 4)}%` : `${number(item.value, 3)} ${item.unit || ""}`.trim())}</td><td>${esc(Number.isFinite(item.denominator) ? number(item.denominator, 0) : Number.isFinite(item.pipeline_stage?.population_count) ? number(item.pipeline_stage.population_count, 0) : "Not established")}</td><td>${epistemic(item)}${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const populationSection = populationAvailable ? `<div class="two-column"><article class="narrative"><h3>Data in brief</h3><p>${esc(field(r.data.summary, r, "field-source-data"))}</p>${evidenceLinks(r.data.summary?.evidence_ids)}</article><dl class="editorial">${editorialRow("Source data", samples.source_data, r, "field-source-data")}${editorialRow("Model sample", samples.model_sample, r, "field-model-sample")}${editorialRow("Evaluation sample", samples.evaluation_sample, r, "field-evaluation-sample")}${editorialRow("Main population filters", r.data.population_filters, r, "field-main-population-filters")}${editorialRow("Known population limitation", r.data.population_limitation, r, "field-known-population-limitation")}</dl></div>${visual}` : "";
  const missingSection = missingRows.length ? `<div class="subsection"><h3>Missing data before preparation</h3><p>Quantified missingness for variables connected to the reconstructed analysis.</p>${table(["Variable", "Missingness", "Denominator", "Evidence"], missingRows, "missingness-table")}</div>` : "";
  const lineageSection = lineageAnswer?.dashboard_available ? `<div class="subsection"><h3>Population / sample lineage</h3><p>How the original population became the training and evaluation samples.</p>${lineage}</div>` : "";
  return `<section class="report-section" id="data-populations">${heading("data-heading", "Data & populations", "What data the project operated on", "Only supervisory questions answered by the available evidence are included below.")}${populationSection}${missingSection}${lineageSection}</section>`;
}

function results(record, analytical) {
  const r = record.reconstruction;
  const graph = analytical?.object_graph;
  const story = analytical?.presentation?.main_target_story;
  const focal = analytical?.presentation?.focal_results_evaluation;
  const resultsAvailable = story?.section_answers?.results_evaluation?.dashboard_available === true;
  const comparisonAvailable = story?.section_answers?.model_comparison?.dashboard_available === true;
  const behaviourAvailable = story?.section_answers?.evaluation_behaviour?.dashboard_available === true;
  const best = resultsAvailable ? story?.result || focal?.result || graph?.best_final_result : null;
  const primary = r.results_evaluation.primary_result;
  const otherResults = resultsAvailable ? reportMaterialResults(r) : [];
  const resultAvailability = primaryResultAvailability(primary);
  const comparisonSets = comparisonAvailable ? story.section_answers.model_comparison.answer?.sets || [] : [];
  const compare = comparisonSets.find((item) => item.evaluation_attempt_id && item.evaluation_attempt_id === analytical?.primary_context?.evaluation_attempt_id)
    || comparisonSets.find((item) => item.target_id && item.target_id === best?.target_id)
    || comparisonSets[0];
  const diagnostics = behaviourAvailable ? array(story.section_answers.evaluation_behaviour.answer?.diagnostics).slice(0, 3) : [];
  const headingCopy = best
    ? "The strongest comparable final result is shown with its evaluation context and material limitation."
    : primary?.state === "execution_required"
      ? "The project records an evaluation approach, but performance cannot be stated until a quantitative output is retained."
      : "The report distinguishes the evaluation evidence Bóveda found from the result information it could not establish.";
  const model = best?.method || primary?.method || focal?.method?.value || "Not established";
  const target = best?.task_target || primary?.task_target || focal?.target?.value || r.purpose_scope.target_outcome?.value || "Not established";
  const evaluation = best?.evaluation_context || primary?.evaluation_context || field(focal?.evaluation_sample || r.samples.evaluation_sample, r, "field-evaluation-sample");
  const otherResultRows = otherResults.map((item) => `<tr><td><strong>${esc(item.metric || "Recorded result")}</strong><br>${esc(item.report_value)}</td><td>${esc(item.method || "Method not recorded")}<br><span class="muted">${esc(item.task_target || "Target not recorded")}</span></td><td>${esc(item.evaluation_context || "Evaluation context not recorded")}</td><td>${epistemic(item)}${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const resultSection = resultsAvailable ? `<article class="hero-result avoid-break"><div><p class="label">${best ? "Best recorded result" : "Evaluation result"}</p>${best ? `<h3>${esc(best.metric)}<strong>${esc(reportResultValue(best))}</strong></h3>` : `<h3>${esc(resultAvailability.title)}</h3><p class="boundary">${esc(resultAvailability.detail)}</p>`}<dl class="facts"><div><dt>Model</dt><dd>${esc(model)}</dd></div><div><dt>Target</dt><dd>${esc(target)}</dd></div><div><dt>Evaluation sample</dt><dd>${esc(evaluation)}</dd></div></dl>${evidenceLinks(best?.evidence_ids || primary?.evidence_ids)}</div><dl class="editorial">${editorialRow("Evaluation design", focal?.evaluation_design || story?.evaluation_design || r.results_evaluation.evaluation_design, r, "field-evaluation-design")}${editorialRow("Principal limitation", focal?.known_limitation || r.results_evaluation.known_limitation, r, "field-known-limitation")}</dl></article>${otherResults.length ? `<div class="subsection material-results"><h3>Other recorded material results</h3><p>These outcomes retain their own target and evaluation context. They are not treated as directly comparable unless a model comparison below establishes a shared setup.</p>${table(["Result", "Method / target", "Evaluation context", "Evidence"], otherResultRows, "material-results-table")}</div>` : ""}<div class="establish"><article><p class="label">What the result establishes</p><p>${esc(field(focal?.establishes || r.results_evaluation.establishes, r, "field-establishes"))}</p>${evidenceLinks((focal?.establishes || r.results_evaluation.establishes)?.evidence_ids)}</article><article class="limitation"><p class="label">What it does not establish</p><p>${esc(field(focal?.does_not_establish || r.results_evaluation.does_not_establish, r, "field-does-not-establish"))}</p>${evidenceLinks((focal?.does_not_establish || r.results_evaluation.does_not_establish)?.evidence_ids)}</article></div>` : "";
  return `<section class="report-section major" id="results-evaluation">${heading("results-heading", "Results & evaluation", "What was recorded, and what it supports", resultsAvailable ? headingCopy : "Only supervisory questions answered by the available evidence are included below.")}${resultSection}${compare ? `<div class="subsection"><h3>Model comparison</h3>${comparison(compare)}</div>` : ""}${diagnostics.length ? `<div class="subsection"><h3>Evaluation behaviour</h3><p>Recorded diagnostics show correct classifications and errors that one headline score can hide.</p><div class="matrix-grid">${diagnostics.map((item) => matrix(item, graph)).join("")}</div></div>` : ""}</section>`;
}

function mainFeatures(analytical) {
  const story = analytical?.presentation?.main_target_story;
  const items = story?.section_answers?.feature_driver_evidence?.dashboard_available ? story.section_answers.feature_driver_evidence.answer?.items || [] : [];
  if (!items.length) return "";
  return `<section class="report-section" id="feature-evidence">${heading("features-heading", "Feature / driver evidence", "What the displayed model relied on most", "The ranking describes relative model reliance within one context; it does not establish cause and effect.")}${storyFeatureEvidence({ ...story, feature_evidence: items }, 10)}</section>`;
}

function findingCard(item, type, index) {
  const signal = type === "signal";
  const trailCount = item.related_check_execution_ids?.length || 0;
  return `<article class="finding ${signal ? "signal" : "gap"}" data-finding-id="${esc(item.finding_id)}"><header><div><span>${String(index + 1).padStart(2, "0")}</span><b class="${signal ? "severity" : "gap-pill"}">${esc(signal ? item.severity || "Severity not specified" : "Evidence Gap")}</b></div><small>${esc(clientText(item.primary_scope || item.owning_field?.label || "Project-wide"))}</small></header><h3>${esc(clientText(item.title))}</h3><div class="finding-copy"><div><h4>What Bóveda found</h4><p>${esc(clientText(item.condition_summary))}</p></div><div><h4>Why it matters</h4><p>${esc(clientText(item.why_it_matters))}</p></div></div><footer><span>${trailCount ? `Supported by ${trailCount} verification ${trailCount === 1 ? "check" : "checks"}` : "Verification links to the available evidence"}</span>${evidenceLinks(item.evidence_ids)}</footer></article>`;
}

function findings(presentation) {
  const signals = [...presentation.signals].sort((left, right) => (SEVERITY_ORDER[left.severity] ?? 99) - (SEVERITY_ORDER[right.severity] ?? 99) || (left.sort_key?.[0] ?? 99) - (right.sort_key?.[0] ?? 99) || (left.sort_key?.[1] ?? 99) - (right.sort_key?.[1] ?? 99) || String(left.signal_id).localeCompare(String(right.signal_id)));
  return `<section class="report-section major" id="findings">${heading("findings-heading", "Supervisory findings", "What Bóveda found", "Signals describe material project conditions detected by deterministic checks. They do not automatically mean errors, failures, violations or compliance problems.")}${signals.length ? `<div class="finding-stack">${signals.map((item, index) => findingCard(item, "signal", index)).join("")}</div>` : `<div class="empty"><h3>No represented Signals</h3><p>No material project conditions were detected by the implemented checks for the current project record.</p></div>`}</section>`;
}

function evidenceGaps(presentation) {
  return presentation.evidence_gaps.length ? `<section class="report-section major" id="evidence-gaps">${heading("gaps-heading", "Evidence Gaps", "Where the record is incomplete", "These are parts of the project that Bóveda could not fully verify or reproduce from the available evidence. A gap does not mean something is wrong; it means the project record is incomplete.")}<div class="finding-stack">${presentation.evidence_gaps.map((item, index) => findingCard(item, "gap", index)).join("")}</div></section>` : "";
}

function historySection(history) {
  const events = array(history?.events).filter((item) => item.material && item.source === "host_project");
  const summary = history?.presentation?.summary || "Bóveda retained only the material project events that could be supported by the available history.";
  return `<section class="report-section" id="project-history">${heading("history-heading", "Project history", "Material events in the available record", summary)}${events.length ? `<div class="timeline">${events.map((item) => `<article class="avoid-break"><time>${esc(item.date?.label || "Date unresolved")}</time><div><small>${esc(clientText(item.event_type))}</small><h3>${esc(clientText(item.title))}</h3><p>${esc(clientText(item.description))}</p>${item.limitation ? `<p class="boundary">${esc(clientText(item.limitation))}</p>` : ""}${evidenceLinks(item.evidence_ids)}</div></article>`).join("")}</div>` : `<div class="empty"><h3>Limited project history</h3><p>${esc(summary)}</p></div>`}${array(history?.limitations).length ? `<aside class="note"><b>History boundary</b><ul>${history.limitations.map((item) => `<li>${esc(clientText(item))}</li>`).join("")}</ul></aside>` : ""}</section>`;
}

function traceability(record, signals, presentation, analytical) {
  const confidence = signals?.result_confidence || record.reconstruction.confidence;
  const coverage = signals?.project_evidence_coverage;
  const traceScore = Number(confidence?.result_trace_score ?? confidence?.score ?? 0);
  const trail = [traceScore >= 1 && "The recorded result can be identified.", traceScore >= 2 && "The result is connected to its recorded metric and value.", traceScore >= 3 && "The result is connected to a model and target.", traceScore >= 4 && "The evaluation context can be traced.", traceScore >= 5 && "The evaluation sample and main result can be traced together.", traceScore >= 6 && "The record contains enough information to support reproduction.", presentation.attention_count && "Findings retain links to verification checks and Evidence Tokens."].filter(Boolean);
  return `<section class="report-section" id="traceability">${heading("trace-heading", "Traceability & evidence coverage", "How completely Bóveda reconstructed the project", "Reconstruction confidence combines the evidence trail behind the main result with whether important applicable analytical areas could be reconstructed. It does not measure model quality, project quality, performance, compliance or governance.")}<div class="trace-grid"><article class="card"><p class="label">Project reconstruction</p><h3>${esc(reconstructionConfidenceLabel(confidence))}</h3><p>${esc(reconstructionConfidenceExplanation(confidence, record.reconstruction, { plainReproductionBoundary: Boolean(focalStoryFallback(analytical)) }))}</p><ul class="trail">${trail.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></article><article class="card"><p class="label">Evidence coverage</p><h3>${esc(coverageLabel(coverage))}</h3><div class="coverage">${array(coverage?.domains).map((domain) => `<div><small>${esc(domain.label.replace(/\s+coverage$/i, ""))}</small><b>${esc(domainCoverageLabel(domain.state))}</b><p>${esc(coverageDomainSummary(domain))}</p></div>`).join("")}</div></article></div></section>`;
}

function limitationItems(record, analytical, presentation, history) {
  const r = record.reconstruction;
  const focal = analytical?.presentation?.focal_results_evaluation;
  const candidates = [focal?.known_limitation?.value, focal?.does_not_establish?.value, r.data.population_limitation?.value, r.results_evaluation.known_limitation?.value, r.results_evaluation.does_not_establish?.value, ...presentation.evidence_gaps.map((item) => `${item.condition_summary} ${item.why_it_matters}`), ...array(history?.limitations)].filter(Boolean).map(clientSentence);
  const seen = [];
  for (const text of candidates) {
    const key = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!seen.some((item) => item.key === key || item.key.includes(key) || key.includes(item.key))) seen.push({ key, text });
  }
  return seen.slice(0, 8).map((item) => item.text);
}

function limitations(record, analytical, presentation, history) {
  const items = limitationItems(record, analytical, presentation, history);
  return items.length ? `<section class="report-section" id="limitations">${heading("limitations-heading", "Interpretation boundary", "Remaining limitations", "What the client should not conclude from this report, based on the material boundaries represented in the current project record.")}<ol class="limitations">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol><p class="boundary">Absence of evidence is not evidence of absence. These statements are limited to the available project record reviewed by Bóveda.</p></section>` : "";
}

function technicalAppendix(record, analytical, signals, history) {
  const graph = analytical?.object_graph;
  if (!graph) return `<section class="report-section appendix major" id="technical-appendix">${heading("technical-heading", "Appendix A", "Technical appendix", "The typed analytical projection is unavailable for this stored record.")}</section>`;
  const story = focalStoryFallback(analytical);
  const targets = array(graph.target_definitions).map((item) => `<tr><td>${esc(item.semantic_name)}</td><td><code>${esc(item.source_field || "–")}</code></td><td><code>${esc(item.construction_rule || "Construction not established")}</code></td><td>${esc(String(item.positive_class ?? "–"))}</td><td>${esc(words(item.interpretation))}</td><td>${epistemic(item)}${evidenceLinks(item.evidence_ids)}</td></tr>`);
  if (!targets.length && story?.target) targets.push(`<tr><td>${esc(story.target.label)}</td><td><code>–</code></td><td><code>Complete construction ancestry not established</code></td><td>–</td><td>Focal target reconstructed; technical construction links remain incomplete</td><td>${epistemic(story.target)}${evidenceLinks(story.target.evidence_ids)}</td></tr>`);
  const ancestry = array(graph.target_construction_steps).map((item) => `<tr><td><code>${esc(item.id)}</code></td><td>${esc(targetName(graph, item.target_id))}</td><td>${esc(words(item.operation || item.step_type || item.type))}</td><td><code>${esc(item.expression || item.source_field || item.output_field || "–")}</code></td><td>${epistemic(item)}${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const populations = array(graph.population_nodes).map((item) => `<tr><td>${esc(item.label)}</td><td>${esc(words(item.role))}</td><td>${number(item.count, 0)}</td><td>${esc(item.unit || "–")}</td><td><code>${esc(item.predicate || "–")}</code></td><td>${epistemic(item)}${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const prevalence = array(graph.prevalence_observations).map((item) => `<tr><td>${esc(targetName(graph, item.target_id))}</td><td>${esc(populationName(graph, item.population_id))}</td><td>${number(item.value, 6)}</td><td>${esc(`${item.positive_count ?? "?"} / ${item.denominator ?? "?"}`)}</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const diagnostics = array(graph.diagnostic_observations).map((item) => `<tr><td>${esc(targetName(graph, item.target_id))}</td><td>${esc(item.method || "–")}</td><td>${esc(words(item.type))}</td><td>${esc(words(item.evaluation_phase || item.estimator_variant || "–"))}</td><td><code>${esc(item.values ? JSON.stringify(item.values) : item.value ?? item.display_value ?? "–")}</code></td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const searches = array(graph.hyperparameter_searches).map((item) => `<tr><td>${esc(targetName(graph, item.target_id))}</td><td>${esc(item.method || "–")}</td><td>${esc(`${words(item.search_type)} · stage ${item.stage_index ?? "?"}`)}</td><td>${esc(String(item.cv_folds ?? "–"))}</td><td>${esc(String(item.candidate_count ?? "–"))}</td><td>${number(item.best_score, 6)}</td><td>${esc(words(item.final_relationship || "unresolved"))}</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const models = array(graph.model_runs).map((item) => `<tr><td>${esc(targetName(graph, item.target_id))}</td><td>${esc(item.method || "–")}</td><td>${esc(item.estimator_class || "–")}</td><td>${esc(array(item.roles).map(words).join(", ") || "–")}</td><td><code>${esc(item.raw_parameters || JSON.stringify(item.parameters || {}))}</code></td><td>${esc(item.source_locator || item.source_path || "–")}</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const selections = array(graph.selection_statements).map((item) => `<tr><td>${esc(words(item.type))}</td><td>${esc(targetName(graph, item.target_id))}</td><td>${esc(item.method || "–")}</td><td>${esc(item.metric || "–")}</td><td>${number(item.value, 6)}</td><td>${esc(words(item.status || "–"))}</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const outputs = array(graph.output_production_statements).map((item) => `<tr><td>${esc(targetName(graph, item.target_id))}</td><td>${esc(item.producer_method || "Unresolved")}</td><td>${esc(words(item.output_type))}</td><td><code>${esc(item.target_path || "–")}</code></td><td>${esc(words(item.artefact_existence))}</td><td>${esc(words(item.consistency))}</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const scoped = array(graph.scoped_limitations).map((item) => `<tr><td>${esc(words(item.kind))}</td><td>${esc(words(item.subject_type || "–"))}</td><td>${esc(item.observed_fact || "–")}</td><td>${esc(item.derived_relationship || "–")}</td><td>${esc(item.bounded_interpretation || "–")}</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`);
  const checks = array(signals?.checks).map((item) => `<tr><td><code>${esc(item.check_id)}</code></td><td>${esc(item.label)}</td><td>${esc(friendlyCheckResult(item.result))}</td><td>${esc(words(item.implementation_status))}</td><td>${esc(clientText(item.result_summary || "–"))}</td><td>${evidenceLinks(Object.values(item.evidence || {}).flat())}</td></tr>`);
  const historyRows = [
    ...array(history?.events).map((item) => `<tr><td>${esc(item.date?.label || "Date unresolved")}</td><td>${esc(words(item.event_type))}</td><td>${esc(item.title)}</td><td>${esc(item.description)}</td><td>${esc(item.material ? "Material" : "Supporting")}</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`),
    ...array(history?.supporting_events).map((item) => `<tr class="supporting-history-row"><td>${esc(item.date?.label || "Date unresolved")}</td><td>${esc(words(item.event_type))}</td><td>${esc(item.title)}</td><td>${esc(item.description)}</td><td>Supporting</td><td>${evidenceLinks(item.evidence_ids)}</td></tr>`),
  ];
  const historyPrintBoundary = array(history?.supporting_events).length ? `<p class="print-only boundary">The PDF retains material History rows. ${history.supporting_events.length} supporting project changes remain available in the complete HTML report.</p>` : "";
  const block = (title, content) => `<div class="appendix-block"><h3>${esc(title)}</h3>${content}</div>`;
  const comparisonSets = reportComparisonSets(analytical);
  return `<section class="report-section appendix major" id="technical-appendix">${heading("technical-heading", "Appendix A", "Technical appendix", "Detailed reconstruction retained for technical review. Internal identities and precise analytical terminology are intentionally confined to this layer.")}${block("Complete target definitions", table(["Target", "Source field", "Construction", "Positive class", "Interpretation", "Status & evidence"], targets, "technical"))}${block("Target-construction ancestry", table(["Step", "Target", "Operation", "Expression / field", "Status & evidence"], ancestry, "technical"))}${block("Full population and sample table", table(["Population", "Role", "Count", "Unit", "Predicate", "Status & evidence"], populations, "technical"))}${block("Complete model-comparison tables", comparisonSets.length ? comparisonSets.map((item) => comparison(item, true)).join("") : `<p class="not-applicable">${esc(analyticalAvailabilityMessage("model_comparison", record.reconstruction))}</p>`)}${block("Prevalence and baseline context", table(["Target", "Population", "Prevalence", "Positive / total", "Evidence"], prevalence, "technical"))}${block("Additional evaluation diagnostics", table(["Target", "Method", "Diagnostic", "Phase", "Persisted value", "Evidence"], diagnostics, "technical"))}${block("Full feature-evidence sets", array(graph.feature_evidence_sets).length ? graph.feature_evidence_sets.map((item) => featureEvidence(item, graph)).join("") : `<p class="not-applicable">${esc(analyticalAvailabilityMessage("feature_driver_evidence", record.reconstruction))}</p>`)}${block("Tuning and search stages", table(["Target", "Method", "Search", "CV", "Candidates", "Best score", "Final relation", "Evidence"], searches, "technical"))}${block("Model variants", table(["Target", "Method", "Estimator", "Roles", "Parameters", "Source", "Evidence"], models, "technical"))}${block("Selection statements", table(["Statement", "Target", "Method", "Metric", "Value", "Status", "Evidence"], selections, "technical"))}${block("Output relationships", table(["Target", "Producer", "Output", "Path", "Existence", "Consistency", "Evidence"], outputs, "technical"))}${block("Scoped limitations", table(["Kind", "Subject", "Observed fact", "Derived relation", "Interpretation boundary", "Evidence"], scoped, "technical"))}${block("Checks performed", table(["Check", "Question", "Result", "Implementation", "Summary", "Evidence"], checks, "technical"))}${block("Complete History projection", `${table(["Date", "Type", "Event", "Description", "Role", "Evidence"], historyRows, "technical history-table")}${historyPrintBoundary}`)}${block("Technical provenance", `<dl class="provenance"><div><dt>Analytical graph schema</dt><dd>${esc(graph.schema_version || "Unavailable")}</dd></div><div><dt>Derivation</dt><dd><code>${esc(JSON.stringify(graph.derivation || {}))}</code></dd></div><div><dt>Completeness</dt><dd><code>${esc(JSON.stringify(graph.completeness || {}))}</code></dd></div><div><dt>Provider calls used by this analytical projection</dt><dd>${esc(String(graph.provider_calls ?? 0))}</dd></div></dl>`)}</section>`;
}

function evidenceDescription(item) {
  const excerpt = String(item.excerpt || "").replace(/\s+/g, " ").trim();
  const summary = excerpt.split(/(?<=[.!?])\s+/)[0] || words(item.kind) || "Evidence retained in the Project Record";
  return summary.length > 190 ? `${summary.slice(0, 187).trimEnd()}…` : summary;
}

function referencedEvidenceIds(...roots) {
  const ids = new Set();
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "evidence_ids" && Array.isArray(child)) child.filter(Boolean).forEach((id) => ids.add(id));
      else visit(child);
    }
  }
  roots.forEach(visit);
  return ids;
}

function evidenceAppendix(record, history, analytical, presentation) {
  const byId = new Map();
  const materialHistory = array(history?.events).filter((item) => item.material);
  const printableEvidenceIds = referencedEvidenceIds(record.reconstruction, analytical, presentation, materialHistory);
  for (const item of [...array(record.evidence), ...array(history?.evidence)]) if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  const items = [...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const indexRows = items.map((item) => `<tr id="${evidenceAnchor(item.id)}"${printableEvidenceIds.has(item.id) ? "" : ` class="supporting-history-evidence"`}><td><a href="#raw-${evidenceAnchor(item.id)}"><code>${esc(item.id)}</code></a></td><td>${esc(item.path || item.source_path || "Source unavailable")}</td><td>${esc(item.source_locator || item.locator || item.path || "Locator unavailable")}</td><td>${esc(item.epistemic || "UNRESOLVED")}</td><td>${esc(evidenceDescription(item))}</td></tr>`);
  const raw = items.map((item) => {
    const excerpt = String(item.excerpt || "No raw excerpt is retained for this Evidence Token.");
    const bounded = excerpt.length >= 27_900;
    const shortenedForPrint = excerpt.length > 700;
    const printExcerpt = shortenedForPrint ? `${excerpt.slice(0, 520)}\n\n[Middle of retained excerpt omitted from the print edition.]\n\n${excerpt.slice(-180)}` : excerpt;
    const boundary = bounded
      ? "This is the complete excerpt retained in the Project Record. Source collection bounded this excerpt; the source may contain additional content. The HTML report applies no further truncation."
      : "This is the complete excerpt retained in the Project Record; the HTML report applies no further truncation.";
    const printSection = printableEvidenceIds.has(item.id) ? `<section class="print-only print-raw-evidence"><h3><code>${esc(item.id)}</code> · ${esc(item.path || "Source unavailable")}</h3><p><b>Epistemic status:</b> ${esc(item.epistemic || "UNRESOLVED")} · <b>Kind:</b> ${esc(words(item.kind || "unspecified"))}</p><p class="boundary">${boundary}</p>${shortenedForPrint ? `<p class="boundary">Print boundary: this edition includes the beginning and end of the retained excerpt and clearly marks the omitted middle. The self-contained HTML report retains the complete Project Record excerpt.</p>` : ""}<pre>${esc(printExcerpt)}</pre></section>` : "";
    return `<details class="raw-evidence" id="raw-${evidenceAnchor(item.id)}"><summary><code>${esc(item.id)}</code><span>${esc(item.path || "Source unavailable")}</span></summary><div><p><b>Epistemic status:</b> ${esc(item.epistemic || "UNRESOLVED")} · <b>Kind:</b> ${esc(words(item.kind || "unspecified"))}</p><p class="boundary">${boundary}</p><pre>${esc(excerpt)}</pre></div></details>${printSection}`;
  }).join("");
  const supportingCount = items.filter((item) => !printableEvidenceIds.has(item.id)).length;
  return `<section class="report-section appendix major" id="evidence-appendix">${heading("evidence-heading", "Appendix B", "Evidence appendix", "A stable index linking material report claims to source evidence retained in the Project Record.")}<div class="appendix-block"><h3>Evidence Index</h3>${table(["Evidence Token", "Source", "Source locator", "Epistemic status", "Short description"], indexRows, "technical evidence-index")}${supportingCount ? `<p class="print-only boundary">The PDF index includes evidence linked to material report content. ${supportingCount} additional supporting History ${supportingCount === 1 ? "entry remains" : "entries remain"} indexed and expandable in the complete HTML report.</p>` : ""}</div><div class="appendix-block raw-excerpts"><h3>Raw evidence excerpts</h3><p>Raw excerpts are separated from the client narrative. Browser readers may expand every retained excerpt, and longer material is clearly marked as partial in print. The PDF includes bounded excerpts for evidence linked to material report content; supporting source-control History remains complete in the self-contained HTML report.</p>${raw || `<p class="not-applicable">No raw evidence excerpt is retained in this Project Record.</p>`}</div></section>`;
}

function processingMetadata(record) {
  const diagnostics = diagnosticsForRecord(record);
  const llm = diagnostics.llm;
  const duration = (value) => Number.isFinite(value) ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} s` : "Unavailable";
  const tokens = (value) => Number.isFinite(value) ? value.toLocaleString("en-US") : "Unavailable";
  const paid = (value) => value === true ? "Yes" : value === false ? "No" : "Unknown";
  const attempts = array(llm.attempts).map((item) => `<article class="attempt avoid-break"><h3>Attempt ${esc(item.attempt)} · ${esc(words(item.operation || "model attempt"))}</h3><p>${esc(words(item.outcome || "outcome unavailable"))}</p><dl><div><dt>Duration</dt><dd>${duration(item.duration_ms)}</dd></div><div><dt>Recorded tokens</dt><dd>${tokens(item.usage?.total_tokens)}</dd></div><div><dt>Validation findings</dt><dd>${array(item.validation?.errors).length ? `<ul>${item.validation.errors.map((error) => `<li>${esc(error)}</li>`).join("")}</ul>` : "None recorded"}</dd></div>${item.failure ? `<div><dt>Failure stage</dt><dd>${esc(item.failure.stage || "Unavailable")} · ${esc(item.failure.message || "")}</dd></div>` : ""}${item.retry_scheduled ? `<div><dt>Retry</dt><dd>${item.retry?.reason === "localized_validation_repair" ? `The rejected fields were supplied to the next attempt as corrections for a localised repair.` : `The validation findings were supplied to the next attempt as corrections.`}</dd></div>` : ""}</dl></article>`).join("");
  return `<section class="report-section appendix processing major" id="processing-metadata">${heading("processing-heading", "Appendix C", "Bóveda processing metadata", "Technical audit diagnostics are retained as a subordinate appendix and do not compete with the project narrative.")}<dl class="provenance"><div><dt>Telemetry availability</dt><dd>${esc(diagnostics.availability)}</dd></div><div><dt>Audit duration</dt><dd>${duration(diagnostics.total_duration_ms)}</dd></div><div><dt>Reconstruction result</dt><dd>${esc(llm.result)}</dd></div><div><dt>Attempts / provider calls</dt><dd>${esc(llm.attempt_count ?? "Unavailable")} / ${esc(llm.provider_call_count ?? "Unavailable")}</dd></div><div><dt>Total recorded tokens</dt><dd>${tokens(llm.total_usage?.total_tokens)}</dd></div><div><dt>Paid model activity during stored audit</dt><dd>${paid(llm.paid_model_activity)}</dd></div>${llm.localized_repair ? `<div><dt>Localised repair</dt><dd>${esc(llm.localized_repair.status)} · ${esc(array(llm.localized_repair.fields).join(", "))}</dd></div>` : ""}</dl>${diagnostics.availability === "complete" ? "" : `<p class="note">Historical telemetry is partial. ${esc(diagnostics.note)}</p>`}<div class="attempts">${attempts || `<p class="not-applicable">Per-attempt telemetry was not recorded for this historical audit.</p>`}</div></section>`;
}

function styles() {
  return `<style>
  @font-face{font-family:Flink;src:url("${assets.regular}") format("opentype");font-weight:400}@font-face{font-family:Flink;src:url("${assets.italic}") format("opentype");font-style:italic}@font-face{font-family:Flink;src:url("${assets.bold}") format("opentype");font-weight:700}@font-face{font-family:Flink;src:url("${assets.boldItalic}") format("opentype");font-weight:700;font-style:italic}
  :root{--ink:#242629;--muted:#747a79;--line:#d7ddda;--paper:#fff;--soft:#f3f7f6;--blue:#eef4fb;--orange:#ffb445;--orange-soft:#fff4df;--cyan:#38d8dc;--cyan-soft:#e6fbfb;--green:#65e99c;--yellow:#ffc95a;--red:#ff9296;--radius:18px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#e8eeec;color:var(--ink);font:15px/1.52 Flink,Arial,sans-serif}.report{width:min(1120px,calc(100% - 40px));margin:32px auto;background:#fff;box-shadow:0 20px 70px #1e2a2819}.cover,.report-section,.toc{padding:70px 78px}.cover{min-height:760px;display:flex;flex-direction:column;background:linear-gradient(135deg,#dcffff,#f9f9f1 48%,#e8f0ff)}.cover-top{display:flex;justify-content:space-between;align-items:center}.cover-top img{width:132px}.cover-main{margin:auto 0;max-width:800px}.eyebrow{margin:0 0 12px;color:#66706d;text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:700}.cover h1{margin:0;font-size:68px;line-height:.98;letter-spacing:-.045em}.cover-main>p:last-child{max-width:700px;margin-top:28px;font-size:22px}.cover>dl{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:24px;padding-top:24px;border-top:1px solid #2426292e}.cover dt,.provenance dt{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.07em}.cover dd,.provenance dd{margin:4px 0 0}.cover>small{margin-top:24px;color:var(--muted)}.toc{background:#fbfcfa}.section-heading{max-width:800px;margin-bottom:44px}.section-heading h2{margin:0;font-size:40px;line-height:1.05;letter-spacing:-.025em}.section-heading>p:last-child{max-width:700px;color:var(--muted);font-size:16px}.toc ol{list-style:none;margin:30px 0 0;padding:0;border-top:1px solid var(--line)}.toc li{border-bottom:1px solid var(--line)}.toc a{display:flex;gap:24px;padding:13px 0;color:inherit;text-decoration:none}.toc a span{width:26px;color:var(--muted)}.report-section{border-top:1px solid #edf0ee}.report-section.major{padding-top:86px;padding-bottom:86px}.card,.narrative,.hero-result,.comparison,.feature-card,.matrix-card,.establish article,.empty{border:1px solid #24262914;border-radius:var(--radius);background:var(--soft)}.label{margin:0 0 16px;font-weight:700}.lead{font-size:18px}.muted,.caption{color:var(--muted)}.executive-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}.card{padding:28px}.result-card{grid-row:1/3;grid-column:2;background:var(--blue)}.evidence-card{background:#f5f8ee}.big-result{display:flex;flex-direction:column}.big-result strong{font-size:74px;line-height:1;font-weight:400;letter-spacing:-.04em}.mini{margin-top:22px}.mini div{padding:9px 0;border-top:1px solid var(--line)}.mini dt{font-size:10px;color:var(--muted)}.mini dd{margin:2px 0}.confidence{margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}.confidence p{color:var(--muted)}.attention{display:flex;gap:42px}.attention div{display:flex;flex-direction:column}.attention strong{font-size:44px;line-height:1}.pill,.epistemic,.severity,.gap-pill{display:inline-block;padding:4px 9px;border:1px solid var(--line);border-radius:999px;font-size:10px}.pill{background:#fff}.two-column{display:grid;grid-template-columns:.7fr 1.3fr;gap:36px;align-items:start}.narrative{padding:30px;background:#fbfcfa}.narrative h3{margin:0 0 12px;font-size:24px}.narrative>p{font-size:17px}.editorial{margin:0}.editorial-row{display:grid;grid-template-columns:165px 1fr;gap:20px;padding:16px 20px;border-radius:14px}.editorial-row:nth-child(odd){background:var(--soft)}.editorial-row dt{font-weight:700}.editorial-row dd,.editorial-row p{margin:0}.epistemic{margin-top:7px;border-radius:4px;color:var(--muted)}.evidence-links{margin:8px 0 0;color:var(--muted);font-size:9px;line-height:1.4;opacity:.72}.evidence-links b{font-weight:400}.evidence-links a{color:inherit;text-underline-offset:2px}.population-visual{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:48px 0}.population-visual header{display:flex;justify-content:space-between}.population-visual i,.features i{display:block;height:8px;margin:8px 0 4px;background:repeating-linear-gradient(125deg,#e4e9e7 0 2px,transparent 2px 5px);border-radius:99px;overflow:hidden}.population-visual i b,.features i b{display:block;height:100%;border-radius:99px}.tone-green{background:var(--green)}.tone-cyan{background:var(--cyan)}.tone-orange{background:var(--yellow)}.population-visual small{color:var(--muted)}.subsection{margin-top:62px}.subsection>h3,.appendix-block>h3{margin:0 0 8px;font-size:27px}.subsection>p{max-width:700px;color:var(--muted)}.lineage article{margin:10px 0;padding:18px 20px;background:var(--soft);border-radius:14px}.lineage article>div{display:grid;grid-template-columns:1fr auto 1fr;gap:12px}.lineage article>div span{color:var(--muted)}.lineage article>p{color:var(--muted);font-size:13px}.hero-result{display:grid;grid-template-columns:.9fr 1.1fr;gap:34px;padding:34px;background:linear-gradient(135deg,#ecffff,#f6f7ee)}.hero-result h3{margin:0;font-size:24px}.hero-result h3 strong{display:block;font-size:80px;line-height:1.05;font-weight:400}.facts{display:flex;flex-wrap:wrap;gap:20px}.facts dt{font-size:10px;color:var(--muted)}.facts dd{margin:0}.comparison{padding:30px;background:var(--blue)}.comparison h3{margin:0}.table-wrap{max-width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:10px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}thead th{font-size:10px;text-transform:uppercase;letter-spacing:.04em}.comparison-table th:first-child{width:28%}.comparison-table td{text-align:center;border-left:7px solid transparent;border-right:7px solid transparent}.comparison-table td.metric-best{background:#a7e88b}.comparison-table td.metric-mid{background:#f7d878}.comparison-table td.metric-low{background:#ff9b9f}.comparison-table td.metric-empty{background:#f4f5f4;color:#9ba09f}.comparison-table th small{display:block;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0}.matrix-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.matrix-card{padding:24px;background:var(--blue)}.matrix-card h3,.matrix-card p{margin:0}.matrix{display:grid;grid-template-columns:auto 1fr 1fr;gap:5px;align-items:center;margin:18px 0}.matrix b{font-size:10px;text-align:center}.matrix strong{padding:16px;text-align:center;background:#e3eef9;border-radius:7px}.matrix strong.dark{background:#8db2d8}.establish{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:48px}.establish article{padding:28px}.establish .limitation{background:var(--orange-soft)}.feature-card{padding:30px;background:#effbf7}.feature-card header{display:flex;justify-content:space-between}.feature-card header h3,.feature-card header p{margin:0}.features{margin-top:24px}.features>div{display:grid;grid-template-columns:210px 1fr 70px;gap:18px;align-items:center;padding:8px 0}.features i{margin:0}.features strong{text-align:right}.boundary{color:var(--muted);font-style:italic}.finding-stack{display:grid;gap:18px}.finding{position:relative;padding:28px 30px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;overflow:hidden}.finding:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px}.finding.signal:before{background:var(--orange)}.finding.gap:before{background:var(--cyan)}.finding header{display:flex;justify-content:space-between}.finding header>div{display:flex;gap:9px}.severity{background:var(--orange-soft);border-color:#f6c875}.gap-pill{background:var(--cyan-soft);border-color:var(--cyan)}.finding h3{max-width:750px;font-size:23px;line-height:1.16}.finding-copy{display:grid;grid-template-columns:1fr 1fr;gap:30px}.finding-copy h4,.finding-copy p{margin:0}.finding-copy h4{font-size:12px;margin-bottom:6px}.finding footer{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:20px;padding-top:14px;border-top:1px solid var(--line)}.finding footer>span{color:var(--muted);font-size:11px}.finding footer .evidence-links{max-width:60%;text-align:right}.empty{padding:28px}.timeline{position:relative}.timeline:before{content:"";position:absolute;left:105px;top:0;bottom:0;width:1px;background:var(--line)}.timeline>article{display:grid;grid-template-columns:84px 1fr;gap:44px;position:relative;padding-bottom:30px}.timeline>article:after{content:"";position:absolute;left:100px;top:7px;width:11px;height:11px;border:2px solid var(--ink);border-radius:50%;background:#fff}.timeline time{font-size:12px;color:var(--muted);text-align:right}.timeline h3,.timeline p{margin:0}.note{padding:18px 20px;border-left:4px solid var(--orange);background:var(--orange-soft)}.trace-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.trail{list-style:none;padding:0}.trail li{position:relative;padding:8px 0 8px 24px;border-top:1px solid var(--line)}.trail li:before{content:"✓";position:absolute;left:0;color:#278b5b}.coverage>div{padding:13px 0;border-top:1px solid var(--line)}.coverage small,.coverage b{display:block}.coverage p{margin:5px 0;color:var(--muted);font-size:12px}.limitations{counter-reset:item;list-style:none;padding:0}.limitations li{counter-increment:item;position:relative;margin:10px 0;padding:18px 20px 18px 58px;background:var(--orange-soft);border-radius:14px}.limitations li:before{content:counter(item,decimal-leading-zero);position:absolute;left:20px;color:#a26918}.appendix{background:#fcfcfb}.appendix-block{margin-top:54px}.not-applicable{padding:16px;background:var(--soft);color:var(--muted)}.technical{min-width:720px;font-size:10px;line-height:1.35}.technical th,.technical td{padding:8px 7px}.technical code,.provenance code{font:9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}.technical .evidence-links{margin:0}.technical .evidence-links b{display:none}.provenance{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}.provenance>div{padding:14px;background:#fff}.provenance dd{overflow-wrap:anywhere}.raw-evidence{margin:12px 0;border:1px solid var(--line);border-radius:12px;background:#fff}.raw-evidence summary{display:flex;justify-content:space-between;padding:16px 18px;cursor:pointer}.raw-evidence>div{padding:0 18px 18px}.raw-evidence pre{white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f4f5f3;padding:16px}.print-only{display:none}.processing{background:#f5f6f5}.attempts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.attempt{padding:18px;background:#fff;border:1px solid var(--line);border-radius:12px}.attempt h3,.attempt p{margin:0}.attempt dl div{display:grid;grid-template-columns:120px 1fr;gap:10px;padding:7px 0;border-top:1px solid var(--line)}.report-end{padding:28px 78px;display:flex;justify-content:space-between;color:var(--muted);font-size:11px;border-top:1px solid var(--line)}.avoid-break{break-inside:avoid-page;page-break-inside:avoid}
  @media(max-width:800px){.report{width:100%;margin:0}.cover,.report-section,.toc{padding:48px 28px}.cover h1{font-size:48px}.cover>dl,.executive-grid,.two-column,.hero-result,.matrix-grid,.establish,.finding-copy,.trace-grid,.attempts{grid-template-columns:1fr}.result-card{grid-row:auto;grid-column:auto}.population-visual{grid-template-columns:1fr}.lineage article>div{grid-template-columns:1fr}.features>div{grid-template-columns:130px 1fr 58px}.finding footer{display:block}.finding footer .evidence-links{max-width:none;text-align:left}.technical{min-width:650px}}
  @page{size:A4 portrait;margin:16mm 15mm 18mm}@page technical-wide{size:A4 landscape;margin:14mm 14mm 16mm}@media print{html{scroll-behavior:auto}body{background:#fff;font-size:9.2pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}.report{width:auto;margin:0;box-shadow:none}.cover,.report-section,.toc{padding:0}.cover{min-height:255mm;break-after:page}.cover h1{font-size:42pt}.cover-main>p:last-child{font-size:15pt}.toc{break-after:page}.section-heading{margin-bottom:8mm}.section-heading h2{font-size:24pt}.report-section{padding:10mm 0}.report-section.major{break-before:page;padding-top:0}.card,.narrative,.hero-result,.comparison,.feature-card,.matrix-card,.establish article,.empty{background:#f7f8f7}.big-result strong{font-size:42pt}.hero-result h3 strong{font-size:46pt}.material-results{break-inside:avoid-page;page-break-inside:avoid}.technical{min-width:0;font-size:8pt;line-height:1.32;table-layout:auto}.technical th,.technical td{padding:2mm 1.5mm}.technical code,.provenance code{font-size:7.2pt;line-height:1.35}.technical .evidence-links{font-size:7pt;line-height:1.3}thead{display:table-header-group}tr{break-inside:avoid-page}.supporting-history-row,.supporting-history-evidence{display:none!important}.table-wrap{overflow:visible}.table-wrap--wide{page:technical-wide;break-before:page;break-after:page}.evidence-index th:nth-child(1){width:15%}.evidence-index th:nth-child(2),.evidence-index th:nth-child(3){width:18%}.evidence-index th:nth-child(4){width:11%}.evidence-index a{color:inherit;text-decoration:none}.raw-evidence{display:none!important}.print-only{display:block!important}.print-raw-evidence{margin:4mm 0;padding:4mm;border:1px solid var(--line);border-radius:3mm;break-inside:avoid-page}.print-raw-evidence h3{margin:0 0 2mm;font-size:9.5pt}.print-raw-evidence p{margin:1.5mm 0;font-size:8pt}.print-raw-evidence pre{margin:2mm 0 0;padding:3mm;white-space:pre-wrap;overflow-wrap:anywhere;font:7.5pt/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f4f5f3}.report-end{padding:6mm 0}.evidence-links{font-size:7.3pt}.evidence-links a,.toc a{color:inherit;text-decoration:none}h2,h3,h4,.section-heading{break-after:avoid-page}.finding,.matrix-card,.comparison,.feature-card,.card,.narrative,.timeline article,.attempt{break-inside:avoid-page;page-break-inside:avoid}.comparison-table td.metric-best{background:#d8e8d2}.comparison-table td.metric-mid{background:#eee6c7}.comparison-table td.metric-low{background:#ecd5d5}}
  </style>`;
}

export function renderReport(record, { analyticalLayer = null, signalsLayer = null, historyLayer = null, generatedAt = null } = {}) {
  if (!record?.reconstruction) throw new Error("A Project Record with reconstruction data is required.");
  let signals = signalsLayer;
  if (!signals) { try { signals = buildSignalsLayer(record, { analyticalLayer }); } catch { signals = null; } }
  const presentation = buildFindingsPresentation(signals);
  let history = historyLayer;
  if (!history) { try { history = buildHistoryLayer(record, { findings: signals?.findings || [], sourceCollection: null }); } catch { history = null; } }
  const purpose = record.reconstruction.purpose_scope?.purpose;
  const description = purpose?.state === "established" ? purpose : projectDescriptionField(record.reconstruction);
  const reportStory = analyticalLayer?.presentation?.main_target_story;
  const answerAvailable = (id) => reportStory?.section_answers?.[id]?.dashboard_available === true;
  const hasPurpose = answerAvailable("purpose_scope");
  const hasData = ["data_populations_samples", "data_missingness", "population_lineage"].some(answerAvailable);
  const hasResults = ["results_evaluation", "model_comparison", "evaluation_behaviour"].some(answerAvailable);
  const hasFeatures = answerAvailable("feature_driver_evidence");
  const hasLimitations = limitationItems(record, analyticalLayer, presentation, history).length > 0;
  const items = [{ id: "executive-summary", label: "Executive Summary" }, hasPurpose && { id: "project-overview", label: "Project Overview" }, hasData && { id: "data-populations", label: "Data & Populations" }, hasResults && { id: "results-evaluation", label: "Results & Evaluation" }, hasFeatures && { id: "feature-evidence", label: "Feature / Driver Evidence" }, { id: "findings", label: "What Bóveda Found" }, presentation.evidence_gaps.length && { id: "evidence-gaps", label: "Evidence Gaps" }, { id: "project-history", label: "Project History" }, { id: "traceability", label: "Traceability & Evidence Coverage" }, hasLimitations && { id: "limitations", label: "Remaining Limitations" }, { id: "technical-appendix", label: "Technical Appendix" }, { id: "evidence-appendix", label: "Evidence Appendix" }, { id: "processing-metadata", label: "Bóveda Processing Metadata" }].filter(Boolean);
  const projectName = canonicalSupervisorProjectTitleForRecord(record);
  const generated = generatedAt || record.analysed_at || new Date(0).toISOString();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(projectName)} — Bóveda Project Analysis Report</title>${styles()}</head><body><main class="report">${cover(record, description, generated, projectName)}${toc(items)}${executive(record, analyticalLayer, signals, presentation)}${hasPurpose ? projectOverview(record) : ""}${hasData ? dataPopulations(record, analyticalLayer) : ""}${hasResults ? results(record, analyticalLayer) : ""}${hasFeatures ? mainFeatures(analyticalLayer) : ""}${findings(presentation)}${evidenceGaps(presentation)}${historySection(history)}${traceability(record, signals, presentation, analyticalLayer)}${hasLimitations ? limitations(record, analyticalLayer, presentation, history) : ""}${technicalAppendix(record, analyticalLayer, signals, history)}${evidenceAppendix(record, history, analyticalLayer, presentation)}${processingMetadata(record)}<footer class="report-end"><span>Bóveda Alpha ${esc(APPLICATION_VERSION)}</span><span>${esc(record.audit_id)} · Every conclusion has a trail.</span></footer></main></body></html>`;
}
