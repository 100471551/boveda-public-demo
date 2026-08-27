export const HELP_COPY = Object.freeze({
  bestRecordedResult: "The strongest final evaluation result Bóveda found in the available project record. It shows the metric, model and target associated with that result. It is not necessarily the model formally selected by the project.",
  heroDataPopulations: "Shows how much data was available, how much was used to build the model, and how much was used to evaluate it.",
  reconstructionConfidence: "Summarises the overall quality of the reconstruction by combining how completely Bóveda can trace the main evaluation result with whether important applicable analytical areas could be reconstructed.",
  purposeScope: "Explains what the project is trying to achieve, what it analyses or predicts, who or what it applies to, and how its results are intended to be used.",
  resultsEvaluation: "Shows how the models were tested, what results were recorded, and what those results can and cannot tell us.",
  featureEvidence: "Shows which inputs the displayed model relied on most. Feature importance reflects model reliance; it does not show cause and effect.",
  modelComparison: "Compares models tested on the same target and evaluation setting. Each metric measures something different, so there may not be one model that performs best in every respect.",
  evaluationBehaviour: "Shows a closer view of what the model got right and wrong. These diagnostics can reveal behaviour that a single summary score may hide.",
  dataPopulations: "Shows how the available project data was filtered and split into the populations used for modelling, evaluation and prediction.",
  missingData: "Shows which fields contained missing values before modelling transformations were applied.",
  dataLineage: "Shows how observations moved from the original project data through filtering, modelling and evaluation stages.",
  severity: "Severity reflects how much this condition can change or limit the way a project result, method or output should be interpreted. It is not a score of project quality, compliance or real-world harm.",
});

export const CHECK_RESULT_LABELS = Object.freeze({
  "SIGNAL PRESENT": "Condition found",
  "NO SIGNAL DETECTED": "Not detected",
  "NOT APPLICABLE": "Not applicable",
  "INSUFFICIENT EVIDENCE": "Not enough evidence",
});

export function friendlyCheckResult(result) {
  return CHECK_RESULT_LABELS[result] || result;
}
