function established(value) {
  return value?.state === "established";
}

function executionRequired(value) {
  return value?.state === "execution_required";
}

function knownText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function primaryResult(reconstruction) {
  return reconstruction?.results_evaluation?.primary_result || null;
}

function hasRecordedResult(reconstruction) {
  return established(primaryResult(reconstruction))
    || established(reconstruction?.results_evaluation?.other_material_result);
}

function hasDataContext(reconstruction) {
  return established(reconstruction?.data?.summary)
    || established(reconstruction?.data?.data_sources)
    || established(reconstruction?.purpose_scope?.population_scope);
}

function hasSampleCount(reconstruction) {
  return ["source_data", "model_sample", "evaluation_sample"]
    .some((key) => established(reconstruction?.samples?.[key]) && Number.isFinite(reconstruction.samples[key].count));
}

export function primaryResultAvailability(result) {
  if (executionRequired(result)) {
    const method = knownText(result?.method);
    const target = knownText(result?.task_target);
    const subject = method && target ? `${method} for ${target}` : method || (target ? `the analysis for ${target}` : "the evaluation pipeline");
    return {
      title: "Evaluation result not recorded",
      detail: `Bóveda found ${subject}, but no recorded quantitative result. The evaluation must be run and its output retained before performance can be stated.`,
    };
  }
  return {
    title: "Evaluation result not established",
    detail: "Bóveda did not find enough supported quantitative evidence to state a primary result for this project.",
  };
}

export function analyticalAvailabilityMessage(kind, reconstruction) {
  const primary = primaryResult(reconstruction);
  const recordedResult = hasRecordedResult(reconstruction);
  if (kind === "model_comparison") {
    if (recordedResult) return "Bóveda found evaluation results, but not enough comparable model results for the same target and evaluation setup to show a reliable comparison.";
    if (executionRequired(primary)) return "Bóveda found an evaluation plan, but no recorded result values that could support a model comparison.";
    return "Bóveda did not find recorded, like-for-like model results that could support a reliable comparison.";
  }
  if (kind === "feature_driver_evidence") {
    if (recordedResult) return "Bóveda found a recorded model result, but no linked feature or driver values showing which inputs the displayed model relied on most.";
    if (executionRequired(primary)) return "Bóveda found a model workflow, but no recorded model output or feature-importance values to explain its main drivers.";
    return "Bóveda did not find recorded feature or driver values linked to an evaluated model.";
  }
  if (kind === "evaluation_behaviour") {
    if (recordedResult) return "Bóveda found a headline evaluation result, but no linked diagnostic output showing the performance patterns behind that score.";
    if (executionRequired(primary)) return "Bóveda found an evaluation plan, but no recorded result or diagnostic output showing how the model behaved.";
    return "Bóveda did not find recorded diagnostic output that could explain evaluation behaviour.";
  }
  if (kind === "sample_lineage") {
    if (hasSampleCount(reconstruction)) return "Bóveda found one or more population or sample counts, but not enough recorded relationships to reconstruct how the data was filtered and split.";
    if (hasDataContext(reconstruction)) return "Bóveda found information about the data or population, but not the counts and relationships needed to reconstruct how observations moved through filtering and splitting.";
    return "Bóveda did not find enough recorded population, sample, or split evidence to reconstruct how the analytical data was formed.";
  }
  if (kind === "data_missingness") {
    if (hasDataContext(reconstruction)) return "Bóveda found information about the project data, but no stage- and denominator-aware missing-data measurements that could be compared reliably.";
    return "Bóveda did not find recorded missing-data measurements with enough context to present reliably.";
  }
  return "The available project record does not contain enough evidence to present this analysis reliably.";
}

export function overviewAvailabilityMessage(kind, reconstruction) {
  if (kind === "purpose_scope") {
    return "Bóveda found the project files, but not enough supported information to explain the project's purpose, scope and intended use.";
  }
  if (kind === "results_evaluation") {
    return primaryResultAvailability(primaryResult(reconstruction)).detail;
  }
  if (kind === "data_populations") {
    return "Bóveda found the project files, but not enough supported information to explain the data, observation unit and analytical population.";
  }
  if (kind === "project_samples") {
    if (hasDataContext(reconstruction)) return "Bóveda found information about the project data, but not supported counts for the original, training or evaluation populations.";
    return "Bóveda could not establish supported population or sample counts from the available project record.";
  }
  return "Bóveda could not reconstruct this area reliably from the available project record.";
}
