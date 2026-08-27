import crypto from "node:crypto";
import { buildReconstructionGraph } from "./reconstruction-graph.mjs";
import { recognizePopulationPartitions } from "./population-evidence.mjs";
import { buildMainTargetStory } from "./main-target-story.mjs";
import { sourcePopulationStatements } from "./source-population-evidence.mjs";

const METRICS = [
  { key: "average_precision", label: "Average precision", direction: "higher", pattern: /average\s+precision(?:\s+score)?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "roc_auc", label: "ROC AUC", direction: "higher", pattern: /roc[ _-]?auc(?:\s+score)?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "pr_auc", label: "PR AUC", direction: "higher", pattern: /(?:pr|precision[ -]?recall)[ _-]?auc(?:\s+score)?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "brier_loss", label: "Brier loss", direction: "lower", pattern: /brier(?:[ _-]?score)?(?:[ _-]?loss)?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "accuracy", label: "Accuracy", direction: "higher", pattern: /accuracy(?:\s+score)?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "recall", label: "Recall", direction: "higher", pattern: /recall(?:\s*\([^)]*\))?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "precision", label: "Precision", direction: "higher", pattern: /(?<!average\s)precision(?:\s*\([^)]*\))?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "f1", label: "F1", direction: "higher", pattern: /f1(?:[ _-]?score)?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "r2", label: "R²", direction: "higher", pattern: /\br(?:2|²)(?:[ _-]?score|\s+test)?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "mae", label: "MAE", direction: "lower", pattern: /\bmae\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
  { key: "rmse", label: "RMSE", direction: "lower", pattern: /\brmse\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi },
];

function id(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 10).toUpperCase()}`;
}

function cleanLabel(value) {
  return String(value || "")
    .replace(/^\s*#+\s*/, "")
    .replace(/^(?:\d+(?:\.\d+)*\.?\s*)/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(value) {
  return cleanLabel(value)
    .toLowerCase()
    .replace(/\b(?:classifier|regressor|model|score|metric|the|a|an|of|for|using|with|and|on|in|to|given|data|dataset)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(value) {
  return new Set(normalizedText(value).split(" ").filter((item) => item.length > 2));
}

function semanticOverlap(first, second) {
  const left = wordSet(first);
  const right = wordSet(second);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  return intersection / Math.max(left.size, right.size);
}

export function humanizeAnalyticalLabel(value) {
  let label = cleanLabel(value || "Analytical context");
  label = label
    .replace(/^(?:predictive\s+(?:model(?:l?ing)?|comparison)|model(?:l?ing)?|classification|forecast(?:ing)?|prediction)\s*:\s*/i, "")
    .replace(/^benchmark\s+model\s+for\s+(.+)$/i, (_match, target) => `${target} benchmark`)
    .replace(/^(?:let['’]?s\s+)?predict\s+the\s+(.+?)\s+for\s+(.+?)\s+in\s+(.+?)(?:\s+given\s+.+)?$/i, (_match, outcome, subject, place) => `${outcome} — ${subject}, ${place}`)
    .replace(/^(?:let['’]?s\s+)?predict\s+(.+?)(?:\s+given\s+.+)?$/i, "$1")
    .replace(/\s+given\s+(?:the\s+)?[^,;]+\s+data\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  label = label ? `${label[0].toUpperCase()}${label.slice(1)}` : label;
  if (label.length > 62) label = `${label.slice(0, 59).trimEnd()}…`;
  return label || "Analytical context";
}

function hasPersistedError(cell) {
  return (cell.outputs || []).some((item) => item.type === "error");
}

function prettyVariable(value) {
  return cleanLabel(String(value || "").replace(/__+/g, " ").replace(/_/g, " ")).replace(/\bdf\b/i, "dataset");
}

function prettyMethod(value) {
  const raw = cleanLabel(value).replace(/^.*\./, "");
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/randomforest|^rf(?:base)?$/.test(key)) return "Random Forest";
  if (/xgboost|xgb|^xg(?:base)?$/.test(key)) return "XGBoost";
  if (/logisticregression|^lr(?:base)?$/.test(key)) return "Logistic Regression";
  if (/decisiontree/.test(key)) return "Decision Tree";
  if (/lasso/.test(key)) return "LASSO";
  if (/prophet/.test(key)) return "Prophet";
  return raw || "Method not established";
}

function numeric(value) {
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function outputs(cell, type = null) {
  return (cell.outputs || []).filter((item) => !type || item.type === type).map((item) => item.text || "").join("\n");
}

function populationUnitTokens(value) {
  return new Set(cleanLabel(value)
    .toLowerCase()
    .replace(/\b(?:city|project|mapped|available|eligible|source|target|analytical|modelled|modeled|record|records|row|rows|observation|observations)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token));
}

function samePopulationUnit(first, second) {
  const left = populationUnitTokens(first);
  const right = populationUnitTokens(second);
  return left.size > 0 && right.size > 0 && [...left].some((token) => right.has(token));
}

function modelScopedPopulationContext(cell, source) {
  const context = `${cell.workstream || ""} ${cell.section_path?.join(" ") || ""} ${source.path || ""}`;
  return /(?:^|[^a-z])(?:model|benchmark|predict|forecast|train|test|evaluation|validation|scor(?:e|ing)|sensitivity|sequence|rnn|lstm)(?:[^a-z]|$)/i.test(context);
}

function scopeLabelFromSource(sourceText) {
  const paths = [...String(sourceText || "").matchAll(/["'](?:\.\.\/|\.\/)?[^"']+\/[A-Za-z0-9_.-]+["']/g)]
    .map((match) => match[0].slice(1, -1).split("/").filter(Boolean).at(-1))
    .filter(Boolean);
  return paths.length ? cleanLabel(paths.at(-1).replace(/[_-]+/g, " ")) : null;
}

function projectPopulation(record, sources) {
  const reconstruction = record?.reconstruction;
  const canonicalUnit = reconstruction?.purpose_scope?.unit?.state === "established"
    ? reconstruction.purpose_scope.unit.value
    : reconstruction?.data?.unit_of_observation?.state === "established"
      ? reconstruction.data.unit_of_observation.value
      : null;
  if (!canonicalUnit) return null;

  const documented = sourcePopulationStatements(record?.evidence, canonicalUnit);
  if (documented.length) {
    const selected = documented[0];
    const canonical = reconstruction?.samples?.source_data;
    if (!(canonical?.state === "established" && Number.isFinite(canonical.count)
      && canonical.count >= selected.numeric_value)) return selected;
  }

  const candidates = [];
  for (const source of sources) for (const cell of source.cells || []) {
    if (hasPersistedError(cell) || modelScopedPopulationContext(cell, source)) continue;
    for (const partition of recognizePopulationPartitions(outputs(cell, "text"))) {
      if (!samePopulationUnit(partition.unit, canonicalUnit)) continue;
      candidates.push({ partition, cell, source, scopeLabel: scopeLabelFromSource(cell.source) });
    }
  }
  if (!candidates.length) return null;

  candidates.sort((a, b) => b.partition.total - a.partition.total || a.cell.locator.localeCompare(b.cell.locator));
  const selected = candidates[0];
  const canonical = reconstruction?.samples?.source_data;
  if (canonical?.state === "established" && Number.isFinite(canonical.count)
    && samePopulationUnit(canonical.unit || canonical.display, selected.partition.unit)
    && canonical.count >= selected.partition.total) return null;

  const unit = selected.partition.unit;
  return {
    id: id("APP", `${selected.cell.locator}|${selected.partition.key}`),
    role: "project_population",
    state: "established",
    display: `${selected.partition.total.toLocaleString("en-US")} ${unit}`,
    count: selected.partition.total,
    unit,
    scope_label: selected.scopeLabel,
    coverage: "complete_complementary_partition",
    selection_basis: "broadest unit-aligned complete population; counts from filtered, repeated, model, evaluation, and output rows remain downstream",
    components: selected.partition.components,
    derivation: { operation: "sum", operands: selected.partition.components.map((item) => item.count) },
    epistemic: "DERIVED",
    evidence_ids: [selected.cell.evidence_id],
    source_locator: selected.cell.locator,
  };
}

function workstreamKey(cell, source) {
  const name = cleanLabel(cell.workstream || source.path);
  return { id: id("AWS", `${source.path}|${name}`), name };
}

function constructors(source) {
  const found = [];
  const patterns = [
    /model_name\s*=\s*["']([^"']+)["']/g,
    /run_tuned\(\s*["']([^"']+)["']/g,
    /rundict\[\s*["']([^"']+)["']\s*\]/g,
    /(?:^|\s)([A-Za-z_][\w]*)\s*=\s*(?:[A-Za-z_][\w]*\.)?([A-Za-z][\w]*(?:Classifier|Regressor|Regression|Forest|Lasso|Prophet))\s*\(/gm,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(prettyMethod(match[2] || match[1]));
  }
  return [...new Set(found)];
}

function methodLabels(cell) {
  const labels = constructors(cell.source || "");
  const sectionMethod = cleanLabel(cell.section_path?.at(-1) || "").match(/^(?:for\s+)?(.+?)(?:\s+classifier|\s+model)?$/i)?.[1];
  if (sectionMethod && /random forest|decision tree|logistic regression|xgboost|lasso|prophet/i.test(sectionMethod)) labels.push(prettyMethod(sectionMethod));
  for (const match of outputs(cell).matchAll(/Fitting\s+([^\n]+?)\s+model\b/gi)) labels.push(prettyMethod(match[1]));
  for (const match of outputs(cell).matchAll(/^\s*([A-Za-z][A-Za-z0-9 _-]+?)\s*:\s*(?:ROC|PR|F1|Accuracy|Average Precision)/gmi)) labels.push(prettyMethod(match[1]));
  for (const match of (cell.source || "").matchAll(/["']Model["']\s*:\s*\[([^\]]+)\]/gi)) {
    for (const name of match[1].matchAll(/["']([^"']+)["']/g)) labels.push(prettyMethod(name[1]));
  }
  return [...new Set(labels)];
}

function evaluationPhase(source, output) {
  const value = `${source}\n${output}`;
  if (/cross[ -]?validation|cross_val|mean_test_score|validation/i.test(value)) return "validation";
  if (/held[ -]?out|y_test|test dataset|test obs|test_x|test_y|test\.run_tuned|Tester\(|accuracy_score\(\s*Y2|predict\(\s*X2|\bY2(?:_pred)?\b|\bX2\b/i.test(value)) return "test";
  if (/training dataset|mean_train_score|train(?:ing)? score/i.test(value)) return "train";
  if (/goodness of fit|fit test|joined_df/i.test(value)) return "in_sample";
  return "unspecified";
}

function evaluationVariant(cell) {
  return /scaled|standardiz/i.test(cell.section_path?.join(" ") || "") ? "scaled" : "base";
}

function metricSubtype(metric, source) {
  if (metric === "average_precision" && /average_precision_score\([^,]+,\s*(?:y_?pred|predicted|yhat)/i.test(source)) return "hard_label";
  if (["roc_auc", "pr_auc", "brier_loss"].includes(metric)) return "probability_based";
  return "standard";
}

function metricsIn(text, source) {
  const values = [];
  for (const definition of METRICS) {
    definition.pattern.lastIndex = 0;
    for (const match of text.matchAll(definition.pattern)) {
      const value = numeric(match[1]);
      if (value === null) continue;
      values.push({ metric: definition.key, metric_label: definition.label, value, direction: definition.direction, metric_subtype: metricSubtype(definition.key, source) });
    }
  }
  if (/precision_recall_curve/i.test(source)) {
    for (const match of text.matchAll(/\bauc\s*=\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi)) values.push({ metric: "pr_auc", metric_label: "PR AUC", value: numeric(match[1]), direction: "higher", metric_subtype: "probability_based" });
  }
  return values;
}

function inferBareMetric(cell) {
  const output = outputs(cell, "text").trim();
  if (!/^-?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(output)) return [];
  const value = numeric(output);
  const source = cell.source || "";
  if (/accuracy_score|\.score\(X2|test.*accuracy/i.test(source)) return [{ metric: "accuracy", metric_label: "Accuracy", value, direction: "higher", metric_subtype: "standard" }];
  if (/roc_auc_score/i.test(source)) return [{ metric: "roc_auc", metric_label: "ROC AUC", value, direction: "higher", metric_subtype: "probability_based" }];
  if (/r2_score/i.test(source)) return [{ metric: "r2", metric_label: "R²", value, direction: "higher", metric_subtype: "standard" }];
  return [];
}

function methodSegments(cell) {
  const output = outputs(cell, "text");
  const labels = methodLabels(cell);
  if (!labels.length) return [{ method: "Method not established", text: output }];
  const positions = labels.map((label) => {
    const aliases = [label, label.replace("Random Forest", "RF_base").replace("Logistic Regression", "LR_base").replace("XGBoost", "XG_base")];
    const found = aliases.map((item) => output.toLowerCase().indexOf(item.toLowerCase())).filter((item) => item >= 0);
    return { method: label, position: found.length ? Math.min(...found) : -1 };
  });
  const present = positions.filter((item) => item.position >= 0).sort((a, b) => a.position - b.position);
  if (!present.length) return [{ method: labels[0], text: output }];
  return present.map((item, index) => ({ method: item.method, text: output.slice(item.position, present[index + 1]?.position ?? output.length) }));
}

function sharedSplitAttemptId(source, cell) {
  const compatible = (source.cells || []).filter((candidate) => candidate.index <= cell.index
    && (!cell.workstream || !candidate.workstream || candidate.workstream === cell.workstream)
    && [...String(candidate.source || "").matchAll(/^\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\s*\(/gm)]
      .some((match) => {
        const roles = match.slice(1, 5).map(variableRole);
        return roles.filter((role) => role === "training").length >= 1 && roles.filter((role) => role === "evaluation").length >= 1;
      }));
  const split = compatible.at(-1);
  return split ? id("AEA", `${source.path}|shared-split|${split.locator}`) : id("AEA", cell.locator);
}

function resultObjects(sources) {
  const results = [];
  for (const source of sources) for (const cell of source.cells || []) {
    if (hasPersistedError(cell)) continue;
    const stream = workstreamKey(cell, source);
    const phase = evaluationPhase(cell.source, outputs(cell));
    const variant = evaluationVariant(cell);
    const attemptId = sharedSplitAttemptId(source, cell);
    const explicitTrainTest = outputs(cell).match(/Accuracy on training dataset\s*=\s*([\d.]+)\s*%[\s\S]*?Accuracy on test dataset\s*=\s*([\d.]+)\s*%/i);
    if (explicitTrainTest) {
      const method = methodLabels(cell)[0] || "Method not established";
      for (const [resultPhase, raw] of [["train", explicitTrainTest[1]], ["test", explicitTrainTest[2]]]) results.push({
        id: id("AR", `${cell.locator}|${method}|accuracy|${raw}|${resultPhase}`),
        workstream_id: stream.id, workstream: stream.name, display_label: humanizeAnalyticalLabel(stream.name), target: stream.name, method,
        method_role: /no skill|baseline/i.test(method) ? "baseline" : "candidate", evaluation_phase: resultPhase,
        evaluation_variant: variant, evaluation_attempt_id: attemptId,
        evaluation_context: cleanLabel(cell.section_path?.join(" › ") || stream.name), metric: "accuracy",
        metric_label: "Accuracy", value: numeric(raw) / 100, direction: "higher", metric_subtype: "standard",
        epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
      });
      continue;
    }
    let captured = false;
    for (const segment of methodSegments(cell)) {
      const found = metricsIn(segment.text, cell.source);
      if (found.length) captured = true;
      for (const metric of found) results.push({
        id: id("AR", `${cell.locator}|${segment.method}|${metric.metric}|${metric.value}|${phase}`),
        workstream_id: stream.id,
        workstream: stream.name,
        display_label: humanizeAnalyticalLabel(stream.name),
        target: stream.name,
        method: segment.method,
        method_role: /no skill|baseline/i.test(segment.method) ? "baseline" : "candidate",
        evaluation_phase: phase,
        evaluation_variant: variant,
        evaluation_attempt_id: attemptId,
        evaluation_context: cleanLabel(cell.section_path?.join(" › ") || stream.name),
        ...metric,
        epistemic: "OBSERVED",
        evidence_ids: [cell.evidence_id],
        source_locator: cell.locator,
      });
    }
    if (!captured) {
      const bare = inferBareMetric(cell);
      const method = methodLabels(cell)[0] || "Method not established";
      for (const metric of bare) results.push({
        id: id("AR", `${cell.locator}|${method}|${metric.metric}|${metric.value}|${phase}`),
        workstream_id: stream.id, workstream: stream.name, display_label: humanizeAnalyticalLabel(stream.name), target: stream.name, method,
        method_role: /no skill|baseline/i.test(method) ? "baseline" : "candidate", evaluation_phase: phase,
        evaluation_variant: variant, evaluation_attempt_id: attemptId,
        evaluation_context: cleanLabel(cell.section_path?.join(" › ") || stream.name),
        ...metric, epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
      });
    }
  }
  const seen = new Set();
  return results.filter((item) => {
    const key = `${item.workstream_id}|${item.method}|${item.metric}|${item.value}|${item.evaluation_phase}|${item.evaluation_variant}|${item.evaluation_attempt_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function comparisonSets(results) {
  const groups = new Map();
  for (const result of results) {
    if (result.method === "Method not established") continue;
    const phase = result.evaluation_phase === "train" ? "train" : result.evaluation_phase;
    const key = `${result.workstream_id}|${phase}|${result.evaluation_variant || "base"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  const sets = [];
  function appendSet(key, items, attemptKey) {
    const methods = [...new Set(items.map((item) => item.method))];
    const metrics = [...new Set(items.map((item) => item.metric))];
    if (methods.length < 2 || !metrics.some((metric) => new Set(items.filter((item) => item.metric === metric).map((item) => item.method)).size >= 2)) return;
    sets.push({
      id: id("ACS", `${key}|${attemptKey}`),
      workstream_id: items[0].workstream_id,
      workstream: items[0].workstream,
      display_label: items[0].display_label || humanizeAnalyticalLabel(items[0].workstream),
      target: items[0].target,
      evaluation_phase: items[0].evaluation_phase,
      evaluation_variant: items[0].evaluation_variant || "base",
      evaluation_attempt_id: id("AEA", attemptKey),
      comparability: "compatible_within_reconstructed_context",
      methods,
      metrics: METRICS.filter((metric) => metrics.includes(metric.key)).map(({ pattern, ...metric }) => metric),
      results: items,
      evidence_ids: [...new Set(items.flatMap((item) => item.evidence_ids))],
    });
  }
  for (const [key, items] of groups) {
    const attempts = new Map();
    for (const item of items) {
      if (!attempts.has(item.evaluation_attempt_id)) attempts.set(item.evaluation_attempt_id, []);
      attempts.get(item.evaluation_attempt_id).push(item);
    }
    const singletonAttempts = [];
    const multiMethodAttempts = [];
    for (const [attemptId, attemptItems] of attempts) {
      if (new Set(attemptItems.map((item) => item.method)).size >= 2) multiMethodAttempts.push({ attemptId, items: attemptItems });
      else singletonAttempts.push(...attemptItems);
    }
    multiMethodAttempts.sort((a, b) => a.items[0].source_locator.localeCompare(b.items[0].source_locator));
    const clusters = [];
    for (const attempt of multiMethodAttempts) {
      const locator = attempt.items[0].source_locator;
      const match = locator.match(/^(.*)#cell-(\d+)$/);
      const prior = clusters.at(-1);
      const priorMatch = prior?.items.at(-1)?.source_locator.match(/^(.*)#cell-(\d+)$/);
      const currentMetrics = new Set(attempt.items.map((item) => item.metric));
      const priorMetrics = new Set(prior?.items.map((item) => item.metric) || []);
      const addsMetric = [...currentMetrics].some((metric) => !priorMetrics.has(metric));
      const overlappingMethods = new Set(attempt.items.filter((item) => prior?.items.some((priorItem) => priorItem.method === item.method)).map((item) => item.method)).size;
      if (prior && match && priorMatch && match[1] === priorMatch[1] && Number(match[2]) - Number(priorMatch[2]) <= 2 && addsMetric && overlappingMethods >= 2) {
        prior.items.push(...attempt.items);
        prior.attemptIds.push(attempt.attemptId);
      } else clusters.push({ items: [...attempt.items], attemptIds: [attempt.attemptId] });
    }
    for (const cluster of clusters) {
      const clusterKey = cluster.attemptIds.sort().join("|");
      appendSet(key, cluster.items, clusterKey);
    }
    if (new Set(singletonAttempts.map((item) => item.method)).size >= 2) {
      const locators = [...new Set(singletonAttempts.map((item) => item.source_locator))].sort().join("|");
      appendSet(key, singletonAttempts, `aggregate|${locators}`);
    }
  }
  return sets;
}

function bracketMatrices(value) {
  const matrices = [];
  for (let start = value.indexOf("[["); start >= 0; start = value.indexOf("[[", start + 2)) {
    let depth = 0;
    let end = -1;
    for (let index = start; index < value.length; index += 1) {
      if (value[index] === "[") depth += 1;
      if (value[index] === "]") depth -= 1;
      if (depth === 0) { end = index + 1; break; }
    }
    if (end < 0) continue;
    const block = value.slice(start, end);
    const rows = [...block.matchAll(/\[\s*([^\[\]]+?)\s*\]/g)].map((match) => [...match[1].matchAll(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)].map((number) => numeric(number[0]))).filter((row) => row.length);
    if (rows.length >= 2 && rows.every((row) => row.length === rows[0].length)) matrices.push({ start, rows });
  }
  return matrices;
}

function classLabels(source, size) {
  const match = source.match(/class_names\s*=\s*\[([^\]]+)\]/i);
  const labels = match ? [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]) : [];
  return labels.length === size ? labels : Array.from({ length: size }, (_, index) => String(index));
}

function diagnosticObjects(sources) {
  const diagnostics = [];
  for (const source of sources) {
    let carriedConfusionPhase = "unspecified";
    for (const cell of source.cells || []) {
    if (hasPersistedError(cell)) continue;
    const stream = workstreamKey(cell, source);
    const directPhase = evaluationPhase(cell.source, outputs(cell));
    if (/confusion_matrix\([^\n]*(?:y_test|test_y|Y2)/i.test(cell.source)) carriedConfusionPhase = "test";
    else if (/confusion_matrix\([^\n]*(?:y_train|train_y|Y1)/i.test(cell.source)) carriedConfusionPhase = "train";
    const phase = directPhase === "unspecified" && /confusion|cnf_matrix/i.test(`${cell.source}\n${outputs(cell)}`) ? carriedConfusionPhase : directPhase;
    const variant = evaluationVariant(cell);
    if (/confusion/i.test(`${cell.source}\n${outputs(cell)}`) || (methodLabels(cell).length >= 2 && outputs(cell).includes("[["))) for (const segment of methodSegments(cell)) {
      for (const matrix of bracketMatrices(segment.text)) {
        const labels = classLabels(cell.source, matrix.rows.length);
        diagnostics.push({
          id: id("AD", `${cell.locator}|${segment.method}|${JSON.stringify(matrix.rows)}`),
          type: "confusion_matrix",
          workstream_id: stream.id,
          workstream: stream.name,
          display_label: humanizeAnalyticalLabel(stream.name),
          target: stream.name,
          method: segment.method,
          evaluation_phase: phase,
          evaluation_variant: variant,
          labels,
          values: matrix.rows,
          normalized: /normalized confusion matrix/i.test(segment.text),
          epistemic: "OBSERVED",
          evidence_ids: [cell.evidence_id],
          source_locator: cell.locator,
        });
      }
    }
    const trainTest = outputs(cell).match(/Accuracy on training dataset\s*=\s*([\d.]+)\s*%[\s\S]*?Accuracy on test dataset\s*=\s*([\d.]+)\s*%/i);
    if (trainTest) diagnostics.push({
      id: id("AD", `${cell.locator}|train-test`), type: "train_validation",
      workstream_id: stream.id, workstream: stream.name, method: methodLabels(cell)[0] || "Method not established",
      display_label: humanizeAnalyticalLabel(stream.name), target: stream.name,
      evaluation_phase: phase, evaluation_variant: variant,
      train_value: numeric(trainTest[1]) / 100, validation_value: numeric(trainTest[2]) / 100, metric: "accuracy",
      epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
    });
  }
  }
  return diagnostics;
}

function featureObjects(sources) {
  const features = [];
  for (const source of sources) for (const cell of source.cells || []) {
    if (hasPersistedError(cell)) continue;
    if (!/feature_importances_|\bimportance\b/i.test(`${cell.source}\n${outputs(cell)}`)) continue;
    const stream = workstreamKey(cell, source);
    const method = methodLabels(cell)[0] || (/xgb/i.test(cell.source) ? "XGBoost" : /forest/i.test(cell.source) ? "Random Forest" : "Method not established");
    const found = [];
    for (const match of outputs(cell).matchAll(/\(\s*[uU]?["']([^"']+)["']\s*,\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*\)/g)) found.push([match[1], numeric(match[2])]);
    if (!found.length && /importance/i.test(outputs(cell))) {
      for (const line of outputs(cell).split(/\r?\n/)) {
        const match = line.match(/^\s*(.+?)\s+(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*$/i);
        if (!match || /importance|^\d+$|<\/|<div|dtype|name:/i.test(match[1])) continue;
        found.push([match[1].trim(), numeric(match[2])]);
      }
    }
    found.filter(([, value]) => value !== null && value >= 0).slice(0, 20).forEach(([feature, value], index) => features.push({
      id: id("AF", `${cell.locator}|${method}|${feature}|${value}`), workstream_id: stream.id, workstream: stream.name,
      display_label: humanizeAnalyticalLabel(stream.name),
      target: stream.name, method, feature, evidence_type: "feature_importance", value, rank: index + 1,
      direction: null, epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
    }));
  }
  return features;
}

function missingnessObjects(sources) {
  const items = [];
  for (const source of sources) for (const cell of source.cells || []) {
    const stream = workstreamKey(cell, source);
    const fieldMatches = [...cell.source.matchAll(/["']([^"']+)["']\]\.(?:isna|isnull)\(\)\.sum\(\)/g)].map((match) => match[1]);
    const plainNumbers = outputs(cell).split(/\r?\n/).map((line) => numeric(line.trim())).filter((value) => value !== null);
    if (fieldMatches.length && plainNumbers.length >= fieldMatches.length) fieldMatches.forEach((field, index) => items.push({
      id: id("AM", `${cell.locator}|${field}|${plainNumbers[index]}`), workstream_id: stream.id, field,
      value: plainNumbers[index], unit: /\*\s*100|percentage|%\s*NA/i.test(cell.source) ? "percent" : "count",
      stage: "before_preparation", epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
    }));
    for (const match of outputs(cell).matchAll(/(?:%\s*NA\s*for|percentage\s+missing\s+for)\s+(.+?)\s+is\s+([\d.]+)/gi)) items.push({
      id: id("AM", `${cell.locator}|${match[1]}|${match[2]}`), workstream_id: stream.id, field: cleanLabel(match[1]), value: numeric(match[2]),
      unit: "percent", stage: "before_preparation", epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
    });
  }
  return items.filter((item, index, all) => all.findIndex((other) => other.field === item.field && other.value === item.value && other.evidence_ids[0] === item.evidence_ids[0]) === index);
}

function preparationObjects(sources) {
  const stages = [];
  const patterns = [
    { type: "imputation", regex: /([A-Za-z_][\w]*\[["'][^"']+["']\])\.fillna\(([^,\n)]+)[^\n]*\)/g, label: (m) => `Fill missing values in ${m[1].match(/["']([^"']+)["']/)?.[1] || m[1]} using ${cleanLabel(m[2])}` },
    { type: "encoding", regex: /pd\.get_dummies\(([^)]+)\)/g, label: (m) => `Encode categorical values from ${cleanLabel(m[1])}` },
    { type: "transformation", regex: /(?:np\.)?(log10|log)\(([^)]+)\)/g, label: (m) => `Apply ${m[1]} transformation to ${cleanLabel(m[2])}` },
    { type: "transformation", regex: /(?:StandardScaler|preprocessing\.scale)\s*\(/g, label: () => "Standardize numerical features" },
    { type: "target_construction", regex: /pd\.cut\(([^,]+),\s*([^\n]+)\)/g, label: (m) => `Bin ${cleanLabel(m[1])} using persisted cut points` },
    { type: "join", regex: /\.merge\(([^,\n)]+)/g, label: (m) => `Join analytical data with ${cleanLabel(m[1])}` },
    { type: "filter", regex: /\.drop\([^\n]+inplace\s*=\s*True[^\n]*\)/g, label: () => "Remove persisted rows or fields using an explicit rule" },
  ];
  for (const source of sources) for (const cell of source.cells || []) {
    const stream = workstreamKey(cell, source);
    for (const definition of patterns) {
      definition.regex.lastIndex = 0;
      for (const match of cell.source.matchAll(definition.regex)) stages.push({
        id: id("AP", `${cell.locator}|${definition.type}|${match[0]}`), workstream_id: stream.id, workstream: stream.name,
        operation_type: definition.type, description: definition.label(match), order: cell.index,
        epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
      });
    }
  }
  return stages.filter((item, index, all) => all.findIndex((other) => other.description === item.description && other.workstream_id === item.workstream_id) === index).sort((a, b) => a.order - b.order);
}

function countFromShape(output) {
  const match = output.match(/\(\s*([\d,]+)\s*,\s*[\d,]+\s*\)/);
  return match ? numeric(match[1]) : null;
}

function variableForCell(cell) {
  const shape = cell.source.match(/([A-Za-z_][\w]*)\.shape/);
  if (shape) return shape[1];
  const describeMethod = cell.source.match(/([A-Za-z_][\w]*)\.describe\(\)/);
  if (describeMethod) return describeMethod[1];
  const summary = cell.source.match(/(?:describe|getDfSummary)\(([^)]+)\)/);
  if (summary) return String(summary[1]).trim();
  return null;
}

function isAnalyticalArtefactVariable(variable) {
  return /(?:^|_)(?:x|y)_(?:train|test|valid|validation)(?:$|_)|(?:pred(?:iction)?s?|prob(?:ability|abilities)?|risk[_ ]?scores?|feature[_ ]?importances?|weights?|residuals?|labels?)(?:$|_)/i.test(variable || "");
}

function variableRole(variable) {
  if (/(?:^|_)(?:train|training)(?:$|_)/i.test(variable || "")) return "training";
  if (/(?:^|_)(?:test|eval|evaluation|valid|validation)(?:$|_)/i.test(variable || "")) return "evaluation";
  return "population_stage";
}

function persistedOutputLoads(source) {
  const outputVariables = new Map();
  for (const cell of source.cells || []) {
    for (const line of String(cell.source || "").split(/\r?\n/)) {
      const load = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(?:[A-Za-z_][\w]*\.)?read_(?:file|csv|json|parquet|table|feather|pickle)\s*\((.+)$/i);
      if (!load) continue;
      const semanticIdentity = `${load[1]} ${load[2]}`;
      if (!/(?:^|[^a-z])(?:pred(?:iction)?s?|scor(?:e|ed|ing)|risk|forecast|inference|output)(?:[^a-z]|$)/i.test(semanticIdentity)) continue;
      outputVariables.set(load[1], { cell, semantic_identity: semanticIdentity });
    }
  }
  return outputVariables;
}

function assignmentParents(source) {
  const parents = new Map();
  for (const line of String(source || "").split(/\r?\n/)) {
    const assignment = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const [, child, expression] = assignment;
    if (parents.has(child) && new RegExp(`\\b${child}\\b`).test(expression)) continue;
    const candidates = [];
    const bracket = expression.match(/^([A-Za-z_][\w]*)\s*\[/);
    const call = expression.match(/^[A-Za-z_][\w.]*\(\s*([A-Za-z_][\w]*)/);
    const methodCall = expression.match(/^([A-Za-z_][\w]*)\.[A-Za-z_][\w]*\s*\(/);
    if (bracket) candidates.push(bracket[1]);
    if (call) candidates.push(call[1]);
    if (methodCall) candidates.push(methodCall[1]);
    if (/concat|merge|join/i.test(expression)) {
      for (const match of expression.matchAll(/\b([A-Za-z_][\w]*)\b/g)) {
        if (!/^(?:pd|concat|merge|join|axis|index|columns|true|false)$/i.test(match[1])) candidates.push(match[1]);
      }
    }
    const parent = candidates.find((candidate) => candidate !== child);
    if (parent) parents.set(child, parent);
  }
  return parents;
}

function semanticStageLabel({ variable, source, parentVariable, priorNode, role }) {
  if (role === "training") return "Training sample";
  if (role === "evaluation") return "Evaluation sample";
  const text = `${variable || ""}\n${source || ""}`;
  if (/borough|county|district|region|city|state|postcode|zip/i.test(text) && /==|isin|query|filter/i.test(text)) return "Geographic subset";
  if (/complaint|target|outcome|class|segment|cohort|type/i.test(text) && /==|isin|query|filter/i.test(text)) return "Target population";
  if (/buildfeatures|preparedata|model[_ ]?(?:data|sample)|feature[_ ]?set|dropna|astype|encode|get_dummies/i.test(text)) return "Model-ready population";
  if (priorNode || /\.drop\(|notnull|isnull|>=|<=|==|isin|query|filter/i.test(text)) return "Filtered population";
  if (parentVariable) return "Prepared population";
  return "Source population";
}

function lineageContextKey(cell, source, sliceLabel = null) {
  const base = workstreamKey(cell, source);
  const methods = methodLabels(cell);
  const explicitMethod = methods.length === 1 ? methods[0] : null;
  const section = cleanLabel(cell.section_path?.at(-1) || "");
  const baseWords = normalizedText(base.name);
  const methodWords = normalizedText(explicitMethod || "");
  const methodChangesContext = explicitMethod && methodWords && !baseWords.includes(methodWords);
  let name = methodChangesContext ? `${explicitMethod}${section && normalizedText(section) !== baseWords ? ` — ${section}` : ""}` : base.name;
  if (sliceLabel) name = `${name} · ${cleanLabel(sliceLabel)}`;
  return { id: id("AWS", `${source.path}|${name}`), name };
}

function outputSliceLabel(output, start) {
  const lines = String(output || "").slice(0, start).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    if (/^(?:fitting|epoch|loss|accuracy|precision|recall|f1|brier|roc|auc|train|test|validation)\b/i.test(line)) continue;
    const match = line.match(/^([A-Za-z][A-Za-z _-]{0,28}?)\s*(?:[:=]\s*|\s+)(-?\d+(?:\.\d+)?|[A-Za-z][\w.-]*)$/);
    if (match) return `${cleanLabel(match[1])} ${match[2]}`;
  }
  return null;
}

function populationSplitPairs(cell) {
  const out = outputs(cell, "text");
  const pairs = [];
  const printedLengths = cell.source.match(/print\s*\(\s*len\(\s*([A-Za-z_]\w*)\s*\)\s*,\s*len\(\s*([A-Za-z_]\w*)\s*\)\s*\)/i);
  const tuple = out.match(/^\s*\(\s*([\d,]+)\s*,\s*([\d,]+)\s*\)\s*$/m);
  if (printedLengths && tuple && variableRole(printedLengths[1]) === "training" && variableRole(printedLengths[2]) === "evaluation") {
    pairs.push({
      kind: "explicit_branch_lengths",
      training_count: numeric(tuple[1]), evaluation_count: numeric(tuple[2]),
      training_variable: printedLengths[1], evaluation_variable: printedLengths[2], slice_label: null,
    });
  }

  const namedSplit = /Train obs:\s*([\d,]+)\s+Test obs:\s*([\d,]+)/gi;
  for (const match of out.matchAll(namedSplit)) pairs.push({
    kind: "train_test_split", training_count: numeric(match[1]), evaluation_count: numeric(match[2]),
    training_variable: "persisted_training_branch", evaluation_variable: "persisted_evaluation_branch",
    slice_label: outputSliceLabel(out, match.index),
  });

  const fit = out.match(/Train on\s*([\d,]+)\s+samples?,\s*validate on\s*([\d,]+)\s+samples?/i);
  if (fit) {
    const fitVariables = cell.source.match(/\.fit\(\s*([A-Za-z_]\w*)[\s\S]*?validation_data\s*=\s*\(\s*([A-Za-z_]\w*)/i);
    pairs.push({
      kind: "model_fit_inputs", training_count: numeric(fit[1]), evaluation_count: numeric(fit[2]),
      training_variable: fitVariables?.[1] || "training_model_input", evaluation_variable: fitVariables?.[2] || "validation_model_input", slice_label: null,
    });
  }
  return pairs.filter((pair) => Number.isFinite(pair.training_count) && Number.isFinite(pair.evaluation_count));
}

function sequencePreparedBefore(source, cell) {
  const earlier = (source.cells || []).filter((candidate) => candidate.index < cell.index).map((candidate) => candidate.source).join("\n");
  return /(?:look[_ ]?back|time[_ ]?steps?|sequence)/i.test(earlier) && /(?:create[_ ]?dataset|sliding|window|reshape)/i.test(earlier);
}

function sampleLineage(sources) {
  const nodes = [];
  const edges = [];
  const latestVariable = new Map();
  const variableParent = new Map();
  const latestWorkstream = new Map();
  const latestRole = new Map();
  const edgePairs = new Set();
  const outputLoads = new Map(sources.map((source) => [source.path, persistedOutputLoads(source)]));
  function variableKey(source, variable) { return `${source.path}|${variable}`; }
  function contextualVariableKey(source, variable, workstreamId) { return `${variableKey(source, variable)}|${workstreamId}`; }
  function addEdge(from, to, relation, evidenceId) {
    if (!from || !to || from === to) return;
    const pair = `${from}|${to}`;
    if (edgePairs.has(pair)) return;
    edgePairs.add(pair);
    edges.push({ id: id("ASE", `${pair}|${relation}`), from, to, relation, epistemic: "DERIVED", evidence_ids: [evidenceId] });
  }
  function nearestLocalParent(source, parentVariable, workstreamId) {
    const visited = new Set();
    let current = parentVariable;
    while (current && !visited.has(current)) {
      visited.add(current);
      const key = contextualVariableKey(source, current, workstreamId);
      const node = nodes.find((item) => item.id === latestVariable.get(key));
      if (node) return node;
      current = variableParent.get(key);
    }
    return null;
  }
  function addNode(cell, source, role, count, variable = null, parentVariable = null, context = null, presentation = {}) {
    if (!Number.isFinite(count)) return null;
    const stream = context || workstreamKey(cell, source);
    const localKey = variable ? contextualVariableKey(source, variable, stream.id) : null;
    const priorNode = localKey ? nodes.find((item) => item.id === latestVariable.get(localKey)) : null;
    const localParent = parentVariable ? nearestLocalParent(source, parentVariable, stream.id) : null;
    const parentNode = priorNode || localParent;
    const label = presentation.label || semanticStageLabel({ variable, source: cell.source, parentVariable, priorNode: parentNode, role });

    if (role !== "output" && variable && isAnalyticalArtefactVariable(variable)) {
      const sampleRole = variableRole(variable);
      const attachment = [...nodes].reverse().find((item) => item.workstream_id === stream.id && item.count === count && (sampleRole === "population_stage" || item.role === sampleRole));
      if (attachment) attachment.source_identities = [...new Set([...(attachment.source_identities || []), variable])];
      return attachment || null;
    }

    const relatedDuplicate = nodes.find((item) => item.workstream_id === stream.id && item.count === count && item.role === role
      && (item.id === parentNode?.id || item.source_identities?.includes(variable) || (parentVariable && item.source_identities?.includes(parentVariable))));
    if (relatedDuplicate) {
      relatedDuplicate.source_identities = [...new Set([...(relatedDuplicate.source_identities || []), variable].filter(Boolean))];
      relatedDuplicate.evidence_ids = [...new Set([...relatedDuplicate.evidence_ids, cell.evidence_id])];
      if (localKey) latestVariable.set(localKey, relatedDuplicate.id);
      latestWorkstream.set(stream.id, relatedDuplicate.id);
      latestRole.set(`${stream.id}|${role}`, relatedDuplicate.id);
      return relatedDuplicate;
    }

    const contextIdentity = context && context.id !== workstreamKey(cell, source).id ? `|${stream.id}` : "";
    const node = {
      id: id("ASN", `${cell.locator}|${role}|${label}|${count}${contextIdentity}`), workstream_id: stream.id, workstream: stream.name,
      display_context: humanizeAnalyticalLabel(stream.name), role, label, count, unit: presentation.unit || "observations", epistemic: presentation.epistemic || "OBSERVED",
      evidence_ids: [cell.evidence_id], source_locator: cell.locator, source_identities: variable ? [variable] : [],
    };
    if (presentation.derivation) node.derivation = presentation.derivation;
    nodes.push(node);
    if (parentNode) addEdge(parentNode.id, node.id, priorNode ? "filter" : "subset", cell.evidence_id);
    if (localKey) latestVariable.set(localKey, node.id);
    latestWorkstream.set(stream.id, node.id);
    latestRole.set(`${stream.id}|${role}`, node.id);
    return node;
  }
  function derivedParent(cell, source, context, count, label, unit, operands) {
    const existing = nodes.find((item) => item.workstream_id === context.id && item.role === "population_stage" && item.count === count && item.label === label);
    if (existing) return existing;
    return addNode(cell, source, "population_stage", count, null, null, context, {
      label, unit, epistemic: "DERIVED", derivation: { operation: "sum", operands },
    });
  }
  for (const source of sources) for (const cell of source.cells || []) {
    const baseStream = workstreamKey(cell, source);
    for (const [child, parent] of assignmentParents(cell.source)) variableParent.set(contextualVariableKey(source, child, baseStream.id), parent);
    if (hasPersistedError(cell)) continue;
    const out = outputs(cell, "text");
    const variable = variableForCell(cell);
    const parentVariable = variable ? variableParent.get(contextualVariableKey(source, variable, baseStream.id)) : null;
    const shapeCount = countFromShape(out);
    const persistedOutput = variable ? outputLoads.get(source.path)?.get(variable) : null;
    if (shapeCount !== null && variable) addNode(cell, source, persistedOutput ? "output" : variableRole(variable), shapeCount, variable, parentVariable, null,
      persistedOutput ? { label: "Scored output population", unit: "records" } : {});
    if (variable && /\bcount\s+[\d.]+/i.test(out)) {
      const match = out.match(/\bcount\s+([\d.]+(?:e[-+]?\d+)?)/i);
      if (match) addNode(cell, source, variableRole(variable), numeric(match[1]), variable, parentVariable);
    }
    if (variable && /number_distinct\s+number_nan/i.test(out)) {
      const candidates = [...out.matchAll(/^.+?\s+0\s+([\d,]+)\s*$/gm)].map((match) => numeric(match[1])).filter(Number.isFinite);
      if (candidates.length) addNode(cell, source, variableRole(variable), Math.max(...candidates), variable, parentVariable);
    }
    for (const pair of populationSplitPairs(cell)) {
      const stream = lineageContextKey(cell, source, pair.slice_label);
      const priorTraining = nodes.find((item) => item.id === latestRole.get(`${stream.id}|training`));
      const priorEvaluation = nodes.find((item) => item.id === latestRole.get(`${stream.id}|evaluation`));
      const isSequence = pair.kind === "model_fit_inputs" && sequencePreparedBefore(source, cell);
      const unit = isSequence ? "sequences" : pair.kind === "explicit_branch_lengths" ? "rows" : "observations";
      const trainingLabel = isSequence ? "Training sequences" : pair.kind === "explicit_branch_lengths" ? "Training rows" : "Training sample";
      const evaluationLabel = isSequence ? "Evaluation sequences" : pair.kind === "explicit_branch_lengths" ? "Evaluation rows" : "Evaluation sample";

      let parent = null;
      if (pair.kind !== "model_fit_inputs") {
        const sum = pair.training_count + pair.evaluation_count;
        const candidate = [...nodes].reverse().find((item) => item.workstream_id === stream.id && item.role === "population_stage" && item.count === sum);
        parent = candidate?.count === sum ? candidate : derivedParent(
          cell, source, stream, sum,
          pair.kind === "explicit_branch_lengths" ? "Filtered population" : "Model-ready population",
          unit, [pair.training_count, pair.evaluation_count],
        );
      }

      const train = addNode(cell, source, "training", pair.training_count, pair.training_variable, null, stream, { label: trainingLabel, unit });
      const test = addNode(cell, source, "evaluation", pair.evaluation_count, pair.evaluation_variable, null, stream, { label: evaluationLabel, unit });
      if (parent && train && test) {
        addEdge(parent.id, train.id, "split", cell.evidence_id);
        addEdge(parent.id, test.id, "split", cell.evidence_id);
      } else if (pair.kind === "model_fit_inputs" && train && test) {
        if (priorTraining && priorTraining.count >= train.count) addEdge(priorTraining.id, train.id, isSequence ? "sequence preparation" : "preparation", cell.evidence_id);
        if (priorEvaluation && priorEvaluation.count >= test.count) addEdge(priorEvaluation.id, test.id, isSequence ? "sequence preparation" : "preparation", cell.evidence_id);
      }
    }
  }
  return { nodes, edges, contexts: [], status: nodes.length ? "partial_or_complete" : "unavailable" };
}

function lineageContexts(lineage, results) {
  const byId = new Map(lineage.nodes.map((node) => [node.id, node]));
  const incoming = new Map(lineage.nodes.map((node) => [node.id, []]));
  for (const edge of lineage.edges) if (incoming.has(edge.to)) incoming.get(edge.to).push(edge);
  const resultStreams = new Set(results.map((item) => item.workstream_id));
  const candidateStreams = new Set([
    ...resultStreams,
    ...lineage.nodes.filter((node) => ["training", "evaluation", "output"].includes(node.role)).map((node) => node.workstream_id),
  ]);
  const contexts = [];
  for (const workstreamId of candidateStreams) {
    const own = lineage.nodes.filter((node) => node.workstream_id === workstreamId);
    if (!own.length) continue;
    const included = new Set(own.map((node) => node.id));
    const queue = [...included];
    while (queue.length) {
      const current = queue.shift();
      for (const edge of incoming.get(current) || []) if (!included.has(edge.from)) {
        included.add(edge.from);
        queue.push(edge.from);
      }
    }
    const nodes = [...included].map((nodeId) => byId.get(nodeId)).filter(Boolean);
    const edges = lineage.edges.filter((edge) => included.has(edge.from) && included.has(edge.to));
    const workstream = own[0].workstream;
    const outputContext = own.some((node) => node.role === "output");
    const outputSourceName = own[0].source_locator?.split("#")[0].split("/").at(-1)?.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    const displayLabel = outputContext
      ? `${humanizeAnalyticalLabel(outputSourceName || workstream)} — scoring output`
      : humanizeAnalyticalLabel(workstream);
    contexts.push({
      id: id("ALC", workstreamId), workstream_id: workstreamId, workstream,
      display_label: displayLabel, nodes, edges,
      training_count: own.filter((node) => node.role === "training").at(-1)?.count ?? null,
      evaluation_count: own.filter((node) => node.role === "evaluation").at(-1)?.count ?? null,
      evidence_ids: [...new Set(nodes.flatMap((node) => node.evidence_ids))],
    });
  }
  return contexts;
}

function attempts(sources) {
  const items = [];
  for (const source of sources) for (const cell of source.cells || []) for (const output of cell.outputs || []) if (output.type === "error") {
    const stream = workstreamKey(cell, source);
    items.push({ id: id("AA", `${cell.locator}|${output.text}`), workstream_id: stream.id, workstream: stream.name,
      status: "failed", description: cleanLabel(cell.section_path?.at(-1) || "Analytical attempt"), failure: output.text,
      epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator });
  }
  return items;
}

function sourceVisuals(sources) {
  const visuals = [];
  for (const source of sources) for (const cell of source.cells || []) if ((cell.outputs || []).some((item) => item.type === "image")) {
    const stream = workstreamKey(cell, source);
    visuals.push({ id: id("AV", cell.locator), workstream_id: stream.id, workstream: stream.name,
      type: "notebook_image", source_locator: cell.locator, interpretation: "Persisted project visual; numerical values are not inferred from pixels.",
      epistemic: "OBSERVED", evidence_ids: [cell.evidence_id] });
  }
  return visuals;
}

function workstreams(sources, objects) {
  const map = new Map();
  for (const source of sources) for (const cell of source.cells || []) {
    const stream = workstreamKey(cell, source);
    if (!map.has(stream.id)) map.set(stream.id, { id: stream.id, name: stream.name, analytical_question: stream.name, target_output: stream.name,
      unit: null, population_scope: null, method_families: [], principal_results: [], related_artefacts: [], epistemic: "INTERPRETED_INFERRED", evidence_ids: new Set() });
    map.get(stream.id).evidence_ids.add(cell.evidence_id);
  }
  for (const result of objects.results) {
    const item = map.get(result.workstream_id); if (!item) continue;
    if (!item.method_families.includes(result.method)) item.method_families.push(result.method);
    if (item.principal_results.length < 4) item.principal_results.push(result.id);
  }
  for (const visual of objects.visuals) { const item = map.get(visual.workstream_id); if (item && item.related_artefacts.length < 8) item.related_artefacts.push(visual.id); }
  const used = new Set([
    ...objects.results.map((item) => item.workstream_id), ...objects.features.map((item) => item.workstream_id),
    ...objects.diagnostics.map((item) => item.workstream_id), ...objects.preparation.map((item) => item.workstream_id),
    ...objects.attempts.map((item) => item.workstream_id), ...objects.visuals.map((item) => item.workstream_id),
  ]);
  return [...map.values()].filter((item) => used.has(item.id)).map((item) => {
    const unresolved_fields = ["unit", "population_scope"].filter((field) => !item[field]);
    if (!item.method_families.length) unresolved_fields.push("method_family");
    if (!item.principal_results.length && !item.related_artefacts.length) unresolved_fields.push("principal_output");
    return { ...item, contract_status: unresolved_fields.length ? "partial" : "complete", unresolved_fields, evidence_ids: [...item.evidence_ids] };
  });
}

function metricKeyFromLabel(value) {
  if (/r\s*[²2]|r2[_ -]?score/i.test(String(value || ""))) return "r2";
  const normalized = normalizedText(value);
  if (/average precision/.test(normalized)) return "average_precision";
  if (/roc auc|area under.*receiver/.test(normalized)) return "roc_auc";
  if (/pr auc|precision recall auc/.test(normalized)) return "pr_auc";
  if (/brier/.test(normalized)) return "brier_loss";
  if (/accuracy/.test(normalized)) return "accuracy";
  if (/recall/.test(normalized)) return "recall";
  if (/precision/.test(normalized)) return "precision";
  if (/\bf1\b|f score/.test(normalized)) return "f1";
  if (/\bmae\b/.test(normalized)) return "mae";
  if (/\brmse\b/.test(normalized)) return "rmse";
  return null;
}

export function scalarResultValue(result) {
  if (!result || result.state !== "established") return null;
  const display = String(result.display_value ?? "").trim();
  if (!display || /\[|\]|\{|\}|matrix|array|vector|distribution|ranking/i.test(`${display} ${result.metric || ""}`)) return null;
  const matches = [...display.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[-+]?\d+)?/gi)];
  if (matches.length !== 1) return null;
  const value = numeric(matches[0][0]);
  if (!Number.isFinite(value)) return null;
  return /%/.test(display) ? value / 100 : value;
}

function canonicalPrecision(result) {
  const match = String(result?.display_value || "").match(/-?\d+(?:,\d{3})*(?:\.(\d+))?/);
  return Math.max(0, Math.min(6, match?.[1]?.length ?? 2));
}

function resultMatchScore(canonical, candidate) {
  if (!canonical || !candidate) return -Infinity;
  let score = 0;
  const canonicalMetric = metricKeyFromLabel(canonical.metric);
  if (canonicalMetric && canonicalMetric === candidate.metric) score += 5;
  else if (canonicalMetric) score -= 5;
  const canonicalMethod = prettyMethod(canonical.method);
  if (canonicalMethod !== "Method not established" && canonicalMethod === candidate.method) score += 5;
  const expected = scalarResultValue(canonical);
  if (Number.isFinite(expected)) {
    const difference = Math.abs(expected - candidate.value);
    if (difference <= 1e-12) score += 5;
    else if (difference <= 0.0055) score += 4;
    else if (difference <= 0.02) score += 1;
    else score -= 2;
  }
  score += semanticOverlap(`${canonical.task_target} ${canonical.evaluation_context}`, `${candidate.target} ${candidate.workstream} ${candidate.evaluation_context}`) * 5;
  if (canonical.evidence_ids?.some((evidenceId) => candidate.evidence_ids.includes(evidenceId))) score += 2;
  return score;
}

function bindCanonicalResults(record, results) {
  const canonical = record?.reconstruction?.results_evaluation;
  if (!canonical) return { bindings: [], byResultId: new Map() };
  const fields = [
    { role: "primary", index: 0, value: canonical.primary_result },
    ...(canonical.material_results || []).map((value, index) => ({ role: "material", index, value })),
  ];
  const bindings = [];
  const byResultId = new Map();
  const attemptRichness = new Map();
  for (const result of results) {
    const key = result.evaluation_attempt_id;
    if (!attemptRichness.has(key)) attemptRichness.set(key, { methods: new Set(), metrics: new Set() });
    attemptRichness.get(key).methods.add(result.method);
    attemptRichness.get(key).metrics.add(result.metric);
  }
  for (const field of fields) {
    if (scalarResultValue(field.value) === null) {
      bindings.push({ ...field, result: null, score: null, rejection: "not_a_supervisor_scalar" });
      continue;
    }
    const ranked = results.map((result) => {
      const richness = attemptRichness.get(result.evaluation_attempt_id);
      return { result, score: resultMatchScore(field.value, result) + Math.min(1.5, ((richness?.methods.size || 0) * 0.1) + ((richness?.metrics.size || 0) * 0.12)) };
    })
      .sort((a, b) => b.score - a.score || a.result.source_locator.localeCompare(b.result.source_locator) || a.result.id.localeCompare(b.result.id));
    const match = ranked[0]?.score >= 6 ? ranked[0] : null;
    const binding = { ...field, result: match?.result || null, score: match?.score ?? null, rejection: match ? null : "analytical_identity_not_established" };
    bindings.push(binding);
    if (match) byResultId.set(match.result.id, {
      canonical_role: field.role,
      canonical_index: field.index,
      canonical_display_value: field.value.display_value,
      persisted_display_precision: canonicalPrecision(field.value),
      display_precision: 3,
    });
  }
  return { bindings, byResultId };
}

function primaryAnalyticalContext(record, bindings) {
  const canonical = record?.reconstruction?.results_evaluation?.primary_result;
  const binding = bindings.find((item) => item.role === "primary");
  const result = binding?.result;
  const samples = record?.reconstruction?.samples || {};
  const period = record?.reconstruction?.data?.period;
  const evaluationDesign = record?.reconstruction?.results_evaluation?.evaluation_design;
  return {
    id: result ? id("APC", `${result.workstream_id}|${result.evaluation_phase}|${result.evaluation_variant}|${result.evaluation_attempt_id}`) : "APC-UNRESOLVED",
    status: result ? "established" : canonical?.state === "established" ? "partial" : "unavailable",
    result_id: result?.id || null,
    workstream_id: result?.workstream_id || null,
    workstream: result?.workstream || null,
    display_label: result?.display_label || humanizeAnalyticalLabel(canonical?.task_target || "Primary analytical context"),
    target: result?.target || canonical?.task_target || null,
    method: result?.method || canonical?.method || null,
    metric: result?.metric || metricKeyFromLabel(canonical?.metric),
    evaluation_phase: result?.evaluation_phase || "unspecified",
    evaluation_variant: result?.evaluation_variant || "base",
    evaluation_attempt_id: result?.evaluation_attempt_id || null,
    source_locator: result?.source_locator || null,
    model_sample_count: Number.isFinite(samples.model_sample?.count) ? samples.model_sample.count : null,
    evaluation_sample_count: Number.isFinite(samples.evaluation_sample?.count) ? samples.evaluation_sample.count : null,
    evaluation_design: evaluationDesign?.state === "established" ? evaluationDesign.value : null,
    period: period?.state === "established" ? period.value : null,
    evidence_ids: [...new Set([...(canonical?.evidence_ids || []), ...(result?.evidence_ids || [])])],
  };
}

function contextScore(item, primary, { method = false, attempt = false } = {}) {
  if (!primary?.workstream_id) return 0;
  let score = item.workstream_id === primary.workstream_id ? 20 : 0;
  if (item.evaluation_phase === primary.evaluation_phase) score += 5;
  if ((item.evaluation_variant || "base") === (primary.evaluation_variant || "base")) score += 3;
  if (method && item.method === primary.method) score += 4;
  if (attempt && (item.evaluation_attempt_id === primary.evaluation_attempt_id || item.results?.some((result) => result.id === primary.result_id))) score += 7;
  return score;
}

function orderedByPrimary(items, primary, options) {
  return items.map((item, index) => ({ item, index })).sort((a, b) => contextScore(b.item, primary, options) - contextScore(a.item, primary, options)
    || (a.item.display_label || a.item.workstream || "").localeCompare(b.item.display_label || b.item.workstream || "")
    || a.index - b.index).map(({ item }) => item);
}

function headlineResults(record, bindings, primary) {
  const projected = [];
  for (const binding of bindings) {
    if (binding.role === "material" && (!binding.result || !primary.workstream_id || binding.result.workstream_id !== primary.workstream_id)) continue;
    if (binding.role === "primary" && scalarResultValue(binding.value) === null) continue;
    const rawValue = binding.result?.value ?? scalarResultValue(binding.value);
    projected.push({
      ...binding.value,
      raw_value: rawValue,
      persisted_display_precision: canonicalPrecision(binding.value),
      display_precision: 2,
      analytical_result_id: binding.result?.id || null,
      analytical_context_id: binding.result ? id("APC", `${binding.result.workstream_id}|${binding.result.evaluation_phase}|${binding.result.evaluation_variant}|${binding.result.evaluation_attempt_id}`) : null,
      canonical_role: binding.role,
      canonical_index: binding.index,
    });
  }
  return projected.slice(0, 3);
}

const DIAGNOSTIC_PRIORITY = { confusion_matrix: 1, train_validation: 2, ranking_lift: 3, threshold_behaviour: 4, prediction_distribution: 5 };

export function diagnosticPresentationOrder(diagnostics, primary = null) {
  const locatorDistance = (diagnostic) => {
    const diagnosticMatch = diagnostic?.source_locator?.match(/^(.*)#cell-(\d+)$/);
    const primaryMatch = primary?.source_locator?.match(/^(.*)#cell-(\d+)$/);
    if (!diagnosticMatch || !primaryMatch || diagnosticMatch[1] !== primaryMatch[1]) return Number.MAX_SAFE_INTEGER;
    return Math.abs(Number(diagnosticMatch[2]) - Number(primaryMatch[2]));
  };
  return orderedByPrimary(diagnostics, primary).sort((a, b) => contextScore(b, primary) - contextScore(a, primary)
    || (DIAGNOSTIC_PRIORITY[a.type] || 99) - (DIAGNOSTIC_PRIORITY[b.type] || 99)
    || locatorDistance(a) - locatorDistance(b)
    || String(a.method || "").localeCompare(String(b.method || ""))
    || a.source_locator.localeCompare(b.source_locator));
}

function analyticalConsistency(record, results, comparisons, diagnostics, lineage, primary, bindings) {
  const conflicts = [];
  const developmentFailures = [];
  const resultMap = new Map(results.map((result) => [result.id, result]));
  for (const set of comparisons) for (const result of set.results) {
    const canonical = resultMap.get(result.id);
    if (!canonical || canonical.value !== result.value) developmentFailures.push({ type: "comparison_result_reference", result_id: result.id });
  }
  for (const binding of bindings) if (binding.result) {
    const raw = resultMap.get(binding.result.id)?.value;
    if (raw !== binding.result.value) developmentFailures.push({ type: "canonical_raw_value_reuse", result_id: binding.result.id });
  }
  const identities = new Map();
  for (const result of results) {
    const key = `${result.workstream_id}|${result.evaluation_phase}|${result.evaluation_variant}|${result.evaluation_attempt_id}|${result.method}|${result.metric}`;
    if (!identities.has(key)) identities.set(key, new Set());
    identities.get(key).add(result.value);
  }
  for (const [identity, values] of identities) if (values.size > 1) conflicts.push({ type: "result_value_conflict", identity, values: [...values] });
  const lineageContext = lineage.contexts.find((context) => context.workstream_id === primary.workstream_id);
  if (lineageContext) {
    if (Number.isFinite(primary.model_sample_count) && Number.isFinite(lineageContext.training_count) && primary.model_sample_count !== lineageContext.training_count) conflicts.push({ type: "training_sample_conflict", canonical: primary.model_sample_count, lineage: lineageContext.training_count, context_id: lineageContext.id });
    if (Number.isFinite(primary.evaluation_sample_count) && Number.isFinite(lineageContext.evaluation_count) && primary.evaluation_sample_count !== lineageContext.evaluation_count) conflicts.push({ type: "evaluation_sample_conflict", canonical: primary.evaluation_sample_count, lineage: lineageContext.evaluation_count, context_id: lineageContext.id });
  }
  for (const diagnostic of diagnostics.filter((item) => item.type === "confusion_matrix" && !item.normalized)) {
    if (diagnostic.workstream_id !== primary.workstream_id || diagnostic.evaluation_phase !== primary.evaluation_phase || !Number.isFinite(primary.evaluation_sample_count)) continue;
    const total = diagnostic.values.flat().reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    if (total !== primary.evaluation_sample_count) conflicts.push({ type: "diagnostic_sample_conflict", diagnostic_id: diagnostic.id, diagnostic_total: total, canonical: primary.evaluation_sample_count });
  }
  return {
    status: developmentFailures.length ? "invalid_projection" : conflicts.length ? "unresolved_evidence_conflict" : "consistent",
    conflicts,
    development_failures: developmentFailures,
    checks: {
      canonical_raw_value_reuse: !developmentFailures.some((item) => item.type === "canonical_raw_value_reuse"),
      comparison_reference_integrity: !developmentFailures.some((item) => item.type === "comparison_result_reference"),
      primary_sample_alignment: !conflicts.some((item) => /sample_conflict/.test(item.type)),
      context_identity_applied: Boolean(primary.id),
    },
  };
}

export function buildAnalyticalLayer(record, { sources = [] } = {}) {
  const extractedResults = resultObjects(sources);
  const canonical = bindCanonicalResults(record, extractedResults);
  const legacyResults = extractedResults.map((result) => ({ ...result, ...(canonical.byResultId.get(result.id) || {}), raw_value: result.value }));
  const legacyPrimaryContext = primaryAnalyticalContext(record, canonical.bindings);
  const legacyComparisons = orderedByPrimary(comparisonSets(legacyResults), legacyPrimaryContext, { attempt: true });
  const legacyDiagnostics = diagnosticPresentationOrder(diagnosticObjects(sources), legacyPrimaryContext);
  const legacyFeatures = orderedByPrimary(featureObjects(sources), legacyPrimaryContext, { method: true });
  const legacyPreparation = preparationObjects(sources);
  const legacyMissingness = missingnessObjects(sources);
  const legacyLineage = sampleLineage(sources);
  legacyLineage.contexts = orderedByPrimary(lineageContexts(legacyLineage, legacyResults), legacyPrimaryContext);
  const projectedProjectPopulation = projectPopulation(record, sources);
  const graph = buildReconstructionGraph(record, { sources, legacy: { results: legacyResults, comparison_sets: legacyComparisons, diagnostics: legacyDiagnostics, feature_evidence: legacyFeatures } });
  const typed = graph.target_definitions.length > 0;
  const results = typed ? graph.metric_observations.map((result) => ({ ...result, value: result.exact_value, raw_value: result.exact_value, direction: result.direction_of_better, metric_subtype: result.score_input })) : legacyResults;
  const historicalBinding = graph.evidence_bindings.find((item) => item.canonical_role === "primary" && item.object_type === "MetricObservation" && item.status === "bound");
  const historicalMetric = graph.metric_observations.find((item) => item.id === historicalBinding?.object_id);
  const historicalTarget = graph.target_definitions.find((item) => item.id === historicalMetric?.target_id);
  const primaryContext = historicalMetric ? {
    ...legacyPrimaryContext,
    id: id("APC", `${historicalMetric.target_id}|${historicalMetric.evaluation_attempt_id}`),
    status: "established",
    result_id: historicalMetric.id,
    workstream_id: historicalTarget.workstream_id,
    workstream: historicalTarget.workstream,
    display_label: historicalTarget.semantic_name,
    target: historicalTarget.semantic_name,
    method: historicalMetric.method,
    metric: historicalMetric.metric,
    evaluation_phase: historicalMetric.evaluation_phase,
    evaluation_variant: historicalMetric.estimator_variant,
    evaluation_attempt_id: historicalMetric.evaluation_attempt_id,
    source_locator: historicalMetric.source_locator,
    evidence_ids: historicalMetric.evidence_ids,
  } : legacyPrimaryContext;
  const focalTargetId = graph.best_final_result?.target_id || historicalMetric?.target_id || null;
  const targetOrder = (item) => (item.target_id === focalTargetId ? 0 : 1);
  const comparisons = typed ? [...graph.final_comparison_sets] : legacyComparisons;
  const orderedComparisons = typed ? comparisons.sort((a, b) => targetOrder(a) - targetOrder(b) || a.display_label.localeCompare(b.display_label)) : comparisons;
  const diagnostics = typed ? [...graph.diagnostic_observations].sort((a, b) => targetOrder(a) - targetOrder(b) || Number(b.final) - Number(a.final) || String(a.method).localeCompare(String(b.method))) : legacyDiagnostics;
  const features = typed ? [...graph.feature_evidence].sort((a, b) => targetOrder(a) - targetOrder(b) || String(a.method).localeCompare(String(b.method)) || (a.rank || 0) - (b.rank || 0)) : legacyFeatures;
  const preparation = typed ? graph.data_formation_stages : legacyPreparation;
  const missingness = typed ? graph.missingness_observations : legacyMissingness;
  const lineage = typed ? graph.population_graph : legacyLineage;
  const failedAttempts = attempts(sources);
  const visuals = sourceVisuals(sources);
  const objects = { results, diagnostics, features, preparation, attempts: failedAttempts, visuals };
  const streams = typed ? graph.target_definitions.map((target) => ({ id: target.workstream_id, name: target.workstream, analytical_question: target.semantic_name, target_output: target.source_field,
    unit: "property-level binary label", population_scope: target.population_ids, method_families: [...new Set(graph.model_runs.filter((run) => run.target_id === target.id).map((run) => run.method))],
    principal_results: graph.metric_observations.filter((metric) => metric.target_id === target.id && metric.final).map((metric) => metric.id).slice(0, 4), related_artefacts: graph.persisted_artefacts.filter((artefact) => target.evidence_ids.some((evidenceId) => artefact.evidence_ids.includes(evidenceId))).map((artefact) => artefact.id),
    contract_status: "complete", unresolved_fields: [], epistemic: target.epistemic, evidence_ids: target.evidence_ids })) : workstreams(sources, objects);
  const projectedHeadlineResults = typed && graph.best_final_result ? [{ ...graph.best_final_result, canonical_role: graph.best_final_result.selection_mode === "canonical_primary_fallback" ? "primary" : "best_final" }] : headlineResults(record, canonical.bindings, primaryContext);
  const mainTargetStory = buildMainTargetStory({
    record,
    primaryContext,
    headlineResults: projectedHeadlineResults,
    bestFinalResult: graph.best_final_result || projectedHeadlineResults.find((item) => item.canonical_role === "primary") || null,
    focalResultsEvaluation: graph.focal_results_evaluation,
    projectPopulation: projectedProjectPopulation,
    comparisonSets: orderedComparisons,
    features,
    diagnostics,
    lineage,
    missingness,
    targetDefinitions: graph.target_definitions,
  });
  const consistency = analyticalConsistency(record, legacyResults, legacyComparisons, legacyDiagnostics, legacyLineage, legacyPrimaryContext, canonical.bindings);
  if (consistency.development_failures.length) throw new Error(`Analytical projection consistency failed: ${JSON.stringify(consistency.development_failures)}`);
  const sectionComponentState = (id) => mainTargetStory.section_answers[id]?.state === "answered"
    ? "available"
    : mainTargetStory.section_answers[id]?.state === "partial" ? "partial" : "unavailable";
  const componentAvailability = {
    workstreams: streams.length ? "available" : "unavailable",
    model_comparison: sectionComponentState("model_comparison"),
    evaluation_behaviour: sectionComponentState("evaluation_behaviour"),
    feature_driver_evidence: sectionComponentState("feature_driver_evidence"),
    sample_lineage: sectionComponentState("population_lineage"),
    data_preparation: preparation.length || missingness.length ? "available" : "unavailable",
    analytical_attempts: failedAttempts.length ? "available" : "unavailable",
    source_visuals: visuals.length ? "available" : "unavailable",
  };
  return {
    schema_version: "boveda-analytical-reconstruction-0.13.2",
    project_id: record?.project_id || null,
    audit_id: record?.audit_id || null,
    derivation: "deterministic_persisted_evidence_v0.13.2",
    provider_calls: 0,
    component_availability: componentAvailability,
    primary_context: primaryContext,
    consistency,
    presentation: {
      headline_results: projectedHeadlineResults,
      best_final_result: graph.best_final_result || null,
      focal_results_evaluation: graph.focal_results_evaluation || null,
      historical_primary_result: historicalMetric ? { ...historicalMetric, target_name: historicalTarget?.semantic_name || null, canonical_binding_id: historicalBinding.id } : null,
      selected_model: graph.selected_model,
      default_comparison_set_id: orderedComparisons[0]?.id || null,
      default_feature_context: features[0] ? `${features[0].target_id}|${features[0].model_run_id}|${features[0].evidence_type}` : null,
      default_diagnostic_id: diagnostics[0]?.id || null,
      default_lineage_context_id: lineage.contexts[0]?.id || null,
      main_target_story: mainTargetStory,
      ...(projectedProjectPopulation ? { project_population: projectedProjectPopulation } : {}),
    },
    workstreams: streams,
    results,
    comparison_sets: orderedComparisons,
    diagnostics,
    feature_evidence: features,
    sample_lineage: lineage,
    data_preparation: { stages: preparation, missingness },
    analytical_attempts: failedAttempts,
    source_visuals: visuals,
    object_graph: graph,
    target_definitions: graph.target_definitions,
    target_relations: graph.target_relations,
    target_construction_steps: graph.target_construction_steps,
    target_construction_edges: graph.target_construction_edges,
    target_construction_graphs: graph.target_construction_graphs,
    model_runs: graph.model_runs,
    hyperparameter_searches: graph.hyperparameter_searches,
    evaluation_attempts: graph.evaluation_attempts,
    metric_observations: graph.metric_observations,
    prevalence_observations: graph.prevalence_observations,
    baseline_relations: graph.baseline_relations,
    feature_evidence_sets: graph.feature_evidence_sets,
    selection_statements: graph.selection_statements,
    output_production_statements: graph.output_production_statements,
    persisted_artefacts: graph.persisted_artefacts,
    scoped_limitations: graph.scoped_limitations,
    evidence_bindings: graph.evidence_bindings,
    notebook_execution_contexts: graph.notebook_execution_contexts,
    focal_results_evaluation: graph.focal_results_evaluation,
    selected_model: graph.selected_model,
    unresolved: Object.entries(componentAvailability).filter(([, value]) => value === "unavailable").map(([component]) => ({ component, reason: "Minimum persisted evidence contract not satisfied." })),
  };
}
