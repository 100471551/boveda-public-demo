export const POPULATION_DOT_COUNT = 100;

const STAGES = ["source_data", "model_sample", "evaluation_sample"];

function establishedCount(sample) {
  if (sample?.state !== "established") return null;
  if (Number.isFinite(sample.count) && sample.count >= 0) return sample.count;
  const match = String(sample.display || "").match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(thousand|million|billion|trillion|[KMBT])?\b/i);
  if (!match) return null;
  const scale = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9, trillion: 1e12, t: 1e12 };
  const value = Number(match[1].replaceAll(",", "")) * (match[2] ? scale[match[2].toLowerCase()] : 1);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function populationStageDots(samples, totalDots = POPULATION_DOT_COUNT) {
  const dots = Math.max(1, Math.floor(totalDots));
  const counts = {
    source_data: establishedCount(samples?.source_data),
    model_sample: establishedCount(samples?.model_sample),
    evaluation_sample: establishedCount(samples?.evaluation_sample),
  };
  const establishedStages = STAGES.filter((stage) => counts[stage] !== null);
  const comparable = establishedStages.length >= 2
    && counts[establishedStages[0]] > 0
    && establishedStages.every((stage, index) => index === 0 || counts[stage] <= counts[establishedStages[index - 1]]);

  if (!comparable) return { comparable: false, totalDots: dots, counts, filled: null, baseline: establishedStages[0] || null };

  const baseline = establishedStages[0];
  const baselineCount = counts[baseline];

  const proportionalDots = (count) => count === 0
    ? 0
    : Math.max(1, Math.min(dots, Math.round((count / baselineCount) * dots)));

  return {
    comparable: true,
    totalDots: dots,
    counts,
    baseline,
    filled: {
      source_data: counts.source_data === null ? null : proportionalDots(counts.source_data),
      model_sample: counts.model_sample === null ? null : proportionalDots(counts.model_sample),
      evaluation_sample: counts.evaluation_sample === null ? null : proportionalDots(counts.evaluation_sample),
    },
  };
}
