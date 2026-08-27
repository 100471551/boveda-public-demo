const GENERIC_MISSING = /^(?:[–—-]|not established(?: from available evidence)?\.?|missing information)$/i;

function textOf(field) {
  return String(field?.value ?? field?.display ?? field?.display_value ?? "").trim();
}

function reconstructed(field) {
  return field?.state === "established" && !GENERIC_MISSING.test(textOf(field));
}

function sentence(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ").replace(/[.;:,\s]+$/, "");
  return text ? `${text}.` : "";
}

function phrase(value) {
  return String(value || "").trim().replace(/\s+/g, " ").replace(/[.;:,\s]+$/, "");
}

export function displayStateLabel(state) {
  const label = typeof state === "string" ? state : state?.label;
  if (label === "Established") return "Reconstructed";
  if (label === "Partially established") return "Partially reconstructed";
  if (label === "Not established") return "Missing information";
  if (label === "Material limitation" && state?.state_reason_ids?.some((id) => String(id).startsWith("EGAP-"))) return "Material information gap";
  return label || "Not assessed";
}

export function displayReconstructionText(value) {
  return String(value ?? "")
    .replace(/stored reconstruction graph|reconstruction graph/gi, "available project record")
    .replace(/insufficient reconstruction support/gi, "not enough supporting evidence")
    .replace(/unresolved identity/gi, "identity that could not be established")
    .replace(/missing dependency/gi, "missing supporting information")
    .replace(/partially established/gi, "partially reconstructed")
    .replace(/not established from available evidence/gi, "missing from available evidence")
    .replace(/not established/gi, "missing")
    .replace(/\bestablished\b/gi, "reconstructed");
}

export function fieldMissingLabel(field, fieldId, reconstruction) {
  if (field?.state === "execution_required") return "Execution required";
  const existing = textOf(field);
  if (existing && !GENERIC_MISSING.test(existing)) return existing;
  if (fieldId === "field-source-data" && reconstructed(reconstruction?.data?.data_sources)) return "Source data size missing";
  if (fieldId === "field-model-sample" && reconstructed(reconstruction?.results_evaluation?.primary_result)) return "Model sample size missing";
  if (fieldId === "field-evaluation-sample" && reconstructed(reconstruction?.results_evaluation?.evaluation_design)) return "Evaluation sample size missing";
  if (fieldId === "field-period" && reconstructed(reconstruction?.results_evaluation?.evaluation_design)) return "Evaluation period missing";
  return "Missing information";
}

export function sampleMissingLabel(name, sample, reconstruction) {
  const fieldId = { source_data: "field-source-data", model_sample: "field-model-sample", evaluation_sample: "field-evaluation-sample" }[name];
  if (reconstructed(sample)) return fieldMissingLabel(sample, fieldId, reconstruction);
  if (!Number.isFinite(sample?.count)) {
    if (name === "source_data" && reconstructed(reconstruction?.data?.data_sources)) return "Source data size missing";
    if (name === "model_sample" && reconstructed(reconstruction?.results_evaluation?.primary_result)) return "Model sample size missing";
    if (name === "evaluation_sample" && reconstructed(reconstruction?.results_evaluation?.evaluation_design)) return "Evaluation sample size missing";
  }
  return fieldMissingLabel(sample, fieldId, reconstruction);
}

export function projectDescriptionField(reconstruction) {
  const descriptionField = reconstruction?.identity?.description;
  const summaryField = reconstruction?.purpose_scope?.summary;
  const taskField = reconstruction?.purpose_scope?.task;
  const targetField = reconstruction?.purpose_scope?.target_outcome;
  const populationField = reconstruction?.purpose_scope?.population_scope;
  const intendedUseField = reconstruction?.purpose_scope?.intended_use;
  const fields = [descriptionField, reconstructed(summaryField) ? summaryField : taskField, reconstructed(summaryField) ? null : targetField, populationField, intendedUseField].filter(Boolean);
  const description = reconstructed(descriptionField) ? textOf(descriptionField) : "";
  const summary = reconstructed(summaryField)
    ? textOf(summaryField)
    : [reconstructed(taskField) ? textOf(taskField) : "", reconstructed(targetField) ? textOf(targetField) : ""].filter(Boolean).join("; ");
  const population = reconstructed(populationField) ? textOf(populationField) : "";
  const intendedUse = reconstructed(intendedUseField) ? textOf(intendedUseField) : "";
  const parts = [
    sentence(description),
    sentence(summary),
    sentence([population ? `The relevant scope is ${phrase(population)}` : "", intendedUse ? `${population ? "its" : "The"} intended use is ${phrase(intendedUse)}` : ""].filter(Boolean).join("; ")),
  ].filter(Boolean);
  const evidenceIds = [...new Set(fields.flatMap((field) => field?.evidence_ids || []))];
  return {
    state: parts.length ? "established" : "not_established",
    value: displayReconstructionText(parts.join(" ")),
    epistemic: "DERIVED",
    evidence_ids: evidenceIds,
  };
}

const SUPERVISOR_CONFIDENCE_LABELS = [
  "Result not established",
  "Result identified",
  "Result evidence found",
  "Result linked to model and target",
  "Evaluation context traced",
  "Main result traced",
  "Reproduction supported",
  "Main result strongly supported",
  "Complete evidence trail",
];

function confidenceScore(confidence) {
  return Math.max(0, Math.min(8, Number.isFinite(confidence?.score) ? Math.trunc(confidence.score) : 0));
}

function isFindingCapped(confidence) {
  return Number.isFinite(confidence?.evidence_score)
    && Number.isFinite(confidence?.finding_cap)
    && confidence.finding_cap < confidence.evidence_score;
}

function joinedOrdinaryClauses(items) {
  if (items.length <= 1) return items[0] || "some of the required information is still missing";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function incompleteEvaluationCopy(reconstruction) {
  const sample = reconstruction?.samples?.evaluation_sample;
  const sampleIdentified = reconstructed(sample);
  const sampleSizeIdentified = Number.isFinite(sample?.count);
  const periodIdentified = reconstructed(reconstruction?.data?.period);
  const unresolved = [];
  if (!sampleIdentified && !sampleSizeIdentified) unresolved.push("could not fully identify the evaluation sample or its size");
  else if (!sampleIdentified) unresolved.push("could not fully identify the evaluation sample");
  else if (!sampleSizeIdentified) unresolved.push("could not fully identify the size of the evaluation sample");
  if (!periodIdentified) unresolved.push("the evaluation period is still missing");
  return `Bóveda could reconstruct how the result was evaluated, but ${joinedOrdinaryClauses(unresolved)}.`;
}

function tracedResultCapability(score) {
  return [
    "Bóveda could not establish a supported main result.",
    "Bóveda could identify the main result.",
    "Bóveda could verify the recorded result against supporting evidence.",
    "Bóveda could connect the result to its model and target.",
    "Bóveda could reconstruct how the result was evaluated.",
    "Bóveda could trace the main result to the data, model and evaluation sample behind it.",
    "Bóveda found enough information to reproduce the main result.",
    "The main result is strongly supported and reproducible.",
    "The main result has a complete evidence trail within the recorded scope.",
  ][Math.max(0, Math.min(8, score))];
}

export function reconstructionConfidenceExplanation(confidence, reconstruction, { plainReproductionBoundary = false } = {}) {
  if (!confidence) return "Bóveda could not determine reconstruction confidence from the available project record.";
  const score = confidenceScore(confidence);
  if (confidence.material_evidence_absence?.active) {
    const count = confidence.material_evidence_absence.affected_area_count || 1;
    const areas = count === 1 ? "one important applicable analytical area could not be reconstructed" : `${count} important applicable analytical areas could not be reconstructed`;
    return `${tracedResultCapability(confidence.result_trace_score ?? confidence.evidence_score ?? score)} However, ${areas}, so the overall reconstruction remains partial.`;
  }
  if (score === 0) return "Bóveda could not identify a sufficiently supported main evaluation result in the available project record.";
  if (isFindingCapped(confidence)) {
    const capability = [
      "",
      "Bóveda could identify the main result.",
      "Bóveda could verify the recorded result against supporting evidence.",
      "Bóveda could connect the result to its model and target.",
      "Bóveda could reconstruct how the result was evaluated.",
      "Bóveda could trace the main result through its evaluation sample.",
      "Bóveda found enough information to reproduce the main result.",
      "The main result is strongly supported and reproducible.",
    ][score];
    return `${capability} However, unresolved evidence still limits how completely Bóveda can support that reconstruction.`;
  }
  if (score === 1) return "Bóveda could identify a main evaluation result, but could not fully verify its recorded metric and value against the available project evidence.";
  if (score === 2) return "Bóveda found the recorded result and its supporting evidence, but could not fully connect it to the model and target that produced it.";
  if (score === 3) return "Bóveda could connect the result to its model and target, but some information about how it was evaluated is still missing.";
  if (score === 4) return incompleteEvaluationCopy(reconstruction);
  if (score === 5) return plainReproductionBoundary
    ? "Bóveda could trace the main result to the data, model and evaluation sample behind it. Some independent inputs needed to reproduce the analysis exactly are still missing."
    : "Bóveda could trace the main result to the data, model and evaluation sample behind it. Some information needed to reproduce the analysis exactly—such as the software setup or data links—is still missing.";
  if (score === 6) return "Bóveda found enough information to reconstruct and reproduce the main result, but some material limitations or unresolved evidence still qualify how it should be interpreted.";
  if (score === 7) return "The main result is strongly supported and reproducible, but some parts of its evidence trail or documented boundaries remain incomplete.";
  return "Bóveda could trace the main result through its model, evaluation, supporting evidence and reproducibility information without a material gap in the recorded trail.";
}

export function reconstructionConfidenceLabel(confidence) {
  if (!confidence) return "Unavailable";
  if (confidence.material_evidence_absence?.active && (confidence.result_trace_score ?? 0) > 0) return "Partial reconstruction";
  return SUPERVISOR_CONFIDENCE_LABELS[confidenceScore(confidence)];
}
