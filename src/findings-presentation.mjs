const INTERNAL_TOKEN = /\b(?:CHK|EXEC|SIG|EGAP|GAP|ATD|APN|AMR|AEA|AMO|ADF|AHS|ASL|E)-[A-Z0-9-]+\b/g;

const SIGNAL_TEMPLATES = Object.freeze({
  "CHK-MATERIAL-EVIDENCE-ABSENCE": {
    title: "Important analytical evidence is missing",
    why_it_matters: "The missing evidence prevents Bóveda from meaningfully assessing an important part of the project, rather than merely limiting a detail within an otherwise assessable area.",
  },
  "CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT": {
    title: "The model was tested on a different population from the one it is meant to prioritise",
    why_it_matters: "Performance observed in the tested group may not carry over directly to the population where the model is intended to be used.",
  },
  "CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE": {
    title: "Evaluation data was used to fit part of the preprocessing",
    why_it_matters: "The evaluation data influenced part of the model-preparation process, so the reported held-out performance needs additional context.",
  },
  "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY": {
    title: "Some Average Precision values were calculated from yes/no predictions",
    why_it_matters: "These values depend on the chosen decision threshold and should not be read as a full measure of ranking performance.",
  },
  "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY": {
    title: "One evaluated model did not identify any positive cases",
    why_it_matters: "A summary performance score can hide the fact that this model did not identify the positive class in this evaluation.",
  },
  "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE": {
    title: "The final model settings differ from the best settings found during tuning",
    why_it_matters: "The project record does not show that the best tuning configuration was the exact configuration ultimately evaluated.",
  },
  "CHK-OUTPUT-COLUMN-CONSISTENCY": {
    title: "The export may use a different prediction field",
    why_it_matters: "The available code does not clearly establish that the exported file contains the prediction intended for that target.",
  },
  "CHK-ANALYTICAL-ROLE-ALIGNMENT": {
    title: "Different models are used for different parts of the analysis",
    why_it_matters: "The available project record does not clearly document one formally selected model that reconciles these roles.",
  },
});

const EVIDENCE_GAP_TEMPLATES = Object.freeze({
  "area-main-result": {
    title: "The main result cannot be assessed",
    condition_summary: "Bóveda found an applicable analytical workflow, but not enough evidence to reconstruct any main result.",
    why_it_matters: "Without a result, a supervisor cannot assess what happened when the project evaluated its main analysis.",
  },
  "area-model-result-comparison": {
    title: "Model comparison cannot be assessed",
    condition_summary: "Bóveda found evidence of multiple relevant models, but not enough comparable results to assess how they performed against each other.",
    why_it_matters: "Without like-for-like results, a supervisor cannot assess why one model should be preferred over the alternatives.",
  },
  "area-feature-driver-evidence": {
    title: "Feature and driver evidence cannot be assessed",
    condition_summary: "Bóveda found a main model result, but no linked evidence showing which inputs the model used or considered important.",
    why_it_matters: "Without linked feature evidence, a supervisor cannot meaningfully assess what drove the displayed model result.",
  },
  "area-evaluation-behaviour": {
    title: "Evaluation behaviour cannot be assessed",
    condition_summary: "Bóveda found an applicable classification result, but no linked diagnostic evidence showing false positives, false negatives or other behaviour behind the headline score.",
    why_it_matters: "Without diagnostic evidence, a supervisor cannot see important error patterns that may be hidden by the headline metric.",
  },
  "area-population-lineage": {
    title: "Population and sample lineage cannot be assessed",
    condition_summary: "Bóveda found a main result, but not enough population evidence to reconstruct how the original data became the training and evaluation samples.",
    why_it_matters: "Without population lineage, a supervisor cannot meaningfully assess which observations supported model fitting and evaluation.",
  },
  "area-data-missingness": {
    title: "Missing-data handling cannot be assessed",
    condition_summary: "Bóveda found missing-value handling in the focal analytical workflow, but no stage- and denominator-aware measurements showing how much data was missing.",
    why_it_matters: "Without those measurements, a supervisor cannot assess the scale of missingness or how much the handling step affected the analytical data.",
  },
  "evidence-analytical-code": {
    title: "The reported result is not linked to the analytical code that produced it",
    condition_summary: "Bóveda found a reported result, but not a supported link to the analytical code that produced that result.",
    why_it_matters: "Without that link, Bóveda cannot establish the complete analytical path from the project inputs to the reported result.",
  },
  "evidence-executable": {
    title: "Executable analytical evidence is missing",
    condition_summary: "The available project record does not contain executable analytical code linked to the reported result.",
    why_it_matters: "Without executable code, Bóveda cannot independently recreate the analysis behind the reported result.",
  },
  "evidence-prediction-label-artifacts": {
    title: "Bóveda cannot fully link the predictions to the labels used to evaluate them",
    condition_summary: "The available project record does not contain enough information to reconstruct the complete link between predictions and evaluation labels.",
    why_it_matters: "Without that link, Bóveda cannot fully reproduce or independently verify the reported evaluation result.",
  },
  "evidence-configuration": {
    title: "The exact software environment cannot be fully reconstructed",
    condition_summary: "Some configuration or environment details needed to recreate the analysis are missing from the available project record.",
    why_it_matters: "Without these details, Bóveda cannot establish the complete execution setup behind the reported result.",
  },
  "evidence-execution-context": {
    title: "The run that produced the reported result is not fully recorded",
    condition_summary: "Bóveda found the reported result, but not enough information about the exact run that produced it.",
    why_it_matters: "The run context is needed to connect the result to the code, settings, data, and outputs used at that time.",
  },
  "evidence-metric-origin": {
    title: "The reported metric cannot be traced through its complete calculation",
    condition_summary: "Bóveda found the reported metric, but not a complete link to the calculation and score inputs that produced it.",
    why_it_matters: "Without that calculation trail, Bóveda cannot fully verify how the reported value was obtained.",
  },
  "evidence-data-snapshot": {
    title: "The exact data version used for the result is not fully identified",
    condition_summary: "Bóveda found the project data, but not enough information to identify the precise dataset snapshot behind the reported result.",
    why_it_matters: "A precise data version is needed to reproduce the same analysis from the same inputs.",
  },
});

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? "")
    .replace(INTERNAL_TOKEN, "")
    .replace(/stored reconstruction graph|reconstruction graph/gi, "available project record")
    .replace(/insufficient reconstruction support/gi, "not enough supporting evidence")
    .replace(/unresolved identity/gi, "identity that could not be established")
    .replace(/structurally established/gi, "supported")
    .replace(/missing dependency/gi, "missing supporting information")
    .replace(/bounded coverage/gi, "available evidence")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(value) {
  const text = cleanText(value).replace(/[.\s]+$/, "");
  return text ? `${text}.` : "";
}

function titleText(value) {
  return cleanText(value).replace(/[.\s]+$/, "");
}

function fieldOrder(layer) {
  const order = new Map();
  let position = 0;
  for (const section of layer?.overview?.sections || []) {
    for (const group of section.groups || []) {
      for (const fieldId of group.field_ids || []) {
        if (!order.has(fieldId)) order.set(fieldId, { section: position, field: order.size });
      }
    }
    position += 1;
  }
  return order;
}

function questionOrder(layer) {
  const order = new Map();
  let position = 0;
  for (const section of layer?.overview?.sections || []) {
    for (const group of section.groups || []) {
      for (const fieldId of group.field_ids || []) {
        for (const question of layer?.overview?.fields?.[fieldId]?.questions || []) {
          if (!order.has(question.id)) order.set(question.id, position++);
        }
      }
    }
  }
  for (const domain of layer?.project_evidence_coverage?.domains || []) {
    for (const question of domain.questions || []) {
      if (!order.has(question.id)) order.set(question.id, position++);
    }
  }
  return order;
}

function owningField(finding, layer, order) {
  const candidates = (finding.impacts || [])
    .filter((impact) => impact.object_type === "overview_field")
    .sort((left, right) => Number(Boolean(right.primary_owner)) - Number(Boolean(left.primary_owner))
      || (order.get(left.object_id)?.field ?? Number.MAX_SAFE_INTEGER) - (order.get(right.object_id)?.field ?? Number.MAX_SAFE_INTEGER));
  const selected = candidates[0];
  if (!selected) return null;
  return { id: selected.object_id, label: layer?.overview?.fields?.[selected.object_id]?.label || "Project context" };
}

function coverageScope(finding, layer) {
  const coverageId = (finding.impacts || []).find((impact) => impact.object_type === "coverage_domain")?.object_id;
  const label = layer?.project_evidence_coverage?.domains?.find((domain) => domain.id === coverageId)?.label;
  return label?.replace(/\s+coverage$/i, "") || null;
}

function evidenceGapTitle(finding) {
  const supplied = titleText(finding.presentation?.title);
  if (supplied) return supplied;
  const name = titleText(finding.name)
    .replace(/\s+evidence\s+is\s+insufficient$/i, "")
    .replace(/\s+is\s+insufficient$/i, "");
  return name ? `${name} is incomplete` : "Required evidence is incomplete";
}

function signalTitle(finding) {
  const supplied = titleText(finding.presentation?.title);
  if (supplied) return supplied;
  const condition = titleText(finding.result?.exact_condition || finding.condition);
  return condition || "Material supervisory condition detected";
}

function conditionSummary(finding) {
  return sentence(
    finding.presentation?.condition_summary
      || finding.result?.exact_condition
      || finding.condition,
  );
}

function whyItMatters(finding) {
  return sentence(
    finding.presentation?.why_it_matters
      || finding.explanation
      || finding.claims?.allowed?.[0],
  );
}

export function signalSeverity(finding) {
  if (finding?.finding_type !== "signal") return null;
  const level = String(finding.materiality?.level || "").toLocaleLowerCase("en");
  return ["low", "medium", "high", "critical"].includes(level) ? `${level[0].toUpperCase()}${level.slice(1)}` : null;
}

function evidenceGapTemplate(finding) {
  const objectId = finding.result?.missing_object_ids?.[0] || finding.gaps?.[0]?.object_id;
  return EVIDENCE_GAP_TEMPLATES[objectId] || null;
}

function presentationFor(finding, layer, order, checkOrder) {
  const type = finding.finding_type === "evidence_gap" ? "evidence_gap" : "signal";
  const signalTemplate = type === "signal" ? SIGNAL_TEMPLATES[finding.producing_check?.check_id] : null;
  const gapTemplate = type === "evidence_gap" ? evidenceGapTemplate(finding) : null;
  const owner = owningField(finding, layer, order);
  const primaryScope = cleanText(
    finding.presentation?.primary_scope
      || (type === "evidence_gap" ? coverageScope(finding, layer) : ""),
  ) || null;
  const secondaryScopes = unique((finding.presentation?.secondary_scopes || []).map(cleanText));
  const questionPriority = Math.min(
    ...(finding.question_ids || []).map((id) => checkOrder.get(id) ?? Number.MAX_SAFE_INTEGER),
    Number.MAX_SAFE_INTEGER,
  );
  const sectionPriority = owner ? (order.get(owner.id)?.section ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;
  const identity = type === "signal"
    ? finding.signal_id || finding.finding_id
    : finding.evidence_gap_id || finding.finding_id;

  return {
    finding_id: finding.finding_id,
    signal_id: type === "signal" ? identity : null,
    evidence_gap_id: type === "evidence_gap" ? identity : null,
    finding_type: type,
    title: signalTemplate?.title || gapTemplate?.title || (type === "signal" ? signalTitle(finding) : evidenceGapTitle(finding)),
    condition_summary: gapTemplate?.condition_summary || conditionSummary(finding),
    why_it_matters: signalTemplate?.why_it_matters || gapTemplate?.why_it_matters || whyItMatters(finding),
    severity: type === "signal" ? signalSeverity(finding) : null,
    primary_scope: primaryScope,
    secondary_scopes: secondaryScopes,
    owning_field: owner,
    trail_entry: { type: "finding", id: finding.finding_id },
    allowed_claim: unique(finding.claims?.allowed || []),
    prohibited_claim: unique(finding.claims?.prohibited || []),
    related_check_execution_ids: unique(finding.related_check_execution_ids || []),
    evidence_ids: unique(Object.values(finding.evidence || {}).flat()),
    sort_key: [sectionPriority, questionPriority, identity],
  };
}

function mergeCanonical(items) {
  const byIdentity = new Map();
  const stableItems = [...items].sort((left, right) => comparePresentation(left, right)
    || left.title.localeCompare(right.title)
    || String(left.primary_scope || "").localeCompare(String(right.primary_scope || "")));
  for (const item of stableItems) {
    const identity = item.signal_id || item.evidence_gap_id || item.finding_id;
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, item);
      continue;
    }
    existing.secondary_scopes = unique([
      ...existing.secondary_scopes,
      existing.primary_scope !== item.primary_scope ? item.primary_scope : null,
      ...item.secondary_scopes,
    ]);
    existing.related_check_execution_ids = unique([...existing.related_check_execution_ids, ...item.related_check_execution_ids]);
    existing.evidence_ids = unique([...existing.evidence_ids, ...item.evidence_ids]);
  }
  return [...byIdentity.values()].map((item) => ({
    ...item,
    secondary_scopes: [...item.secondary_scopes].sort((left, right) => left.localeCompare(right)),
    related_check_execution_ids: [...item.related_check_execution_ids].sort((left, right) => left.localeCompare(right)),
    evidence_ids: [...item.evidence_ids].sort((left, right) => left.localeCompare(right)),
  }));
}

function comparePresentation(left, right) {
  return (left.sort_key[0] - right.sort_key[0])
    || (left.sort_key[1] - right.sort_key[1])
    || String(left.sort_key[2]).localeCompare(String(right.sort_key[2]));
}

export function buildFindingsPresentation(layer) {
  if (!layer) return { signals: [], evidence_gaps: [], attention_count: 0 };
  const order = fieldOrder(layer);
  const checkOrder = questionOrder(layer);
  const active = (layer.findings || []).filter((finding) => finding.status === "active");
  const projected = mergeCanonical(active.map((finding) => presentationFor(finding, layer, order, checkOrder)));
  const signals = projected.filter((item) => item.finding_type === "signal").sort(comparePresentation);
  const evidenceGaps = projected.filter((item) => item.finding_type === "evidence_gap").sort(comparePresentation);
  return { signals, evidence_gaps: evidenceGaps, attention_count: signals.length + evidenceGaps.length };
}

export const FINDINGS_PRESENTATION_CONTRACT_VERSION = "1.1.0";
