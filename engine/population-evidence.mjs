function integer(text) {
  const value = Number(String(text || "").replace(/,/g, ""));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizedLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9 -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function complementaryLabel(value) {
  const label = normalizedLabel(value);
  const match = label.match(/^(?:non[- ]|not |without )(.+)$/);
  return match ? { base: match[1].trim(), negative: true } : { base: label, negative: false };
}

function format(value) {
  return value.toLocaleString("en-US");
}

function recordUnit(value) {
  const unit = normalizedLabel(value);
  return unit.endsWith("s") && !unit.endsWith("ss") ? unit.slice(0, -1) : unit;
}

function parentUnit(block) {
  const match = String(block || "").match(/\bpercentage\s+of\s+([a-z][a-z -]{1,40}?)(?=\s+(?:that|which|with|who|are|were|is|was)\b|\s*:)/i);
  return normalizedLabel(match?.[1]);
}

function persistedBlocks(text) {
  const rendered = String(text || "");
  const marked = rendered.split("[PERSISTED OUTPUT]").slice(1).map((part) => part.split(/\n\n\[(?:CODE|MARKDOWN|RAW|PERSISTED OUTPUT)/)[0]);
  return marked.length ? marked : [rendered];
}

export function recognizePopulationPartitions(text) {
  const found = [];
  for (const block of persistedBlocks(text)) {
    const unit = parentUnit(block);
    if (!unit) continue;

    const entries = [];
    for (const match of block.matchAll(/^\s*(?:number|count)\s+of\s+([^:\n]{1,80}?)\s*:\s*([\d,]+)\s*$/gim)) {
      const count = integer(match[2]);
      if (count === null) continue;
      entries.push({ label: normalizedLabel(match[1]), count, ...complementaryLabel(match[1]) });
    }

    for (const positive of entries.filter((entry) => !entry.negative)) {
      if (/\b(?:with|having|where|whose|that)\b/.test(positive.base)) continue;
      const complements = entries.filter((entry) => entry.negative && entry.base === positive.base);
      if (complements.length !== 1) continue;
      const negative = complements[0];
      const total = positive.count + negative.count;
      if (!Number.isSafeInteger(total) || total <= 0) continue;
      const key = `${positive.label}|${negative.label}|${positive.count}|${negative.count}|${unit}`;
      if (found.some((item) => item.key === key)) continue;
      found.push({
        key,
        recognition: "explicit_complementary_population_partition",
        unit,
        components: [
          { label: positive.label, count: positive.count },
          { label: negative.label, count: negative.count },
        ],
        total,
      });
    }
  }
  return found;
}

export function populationPartitionAnnotation(text) {
  const partitions = recognizePopulationPartitions(text);
  if (!partitions.length) return "";
  return partitions.map((partition) => {
    const [first, second] = partition.components;
    return `[DETERMINISTIC POPULATION PARTITION]\n` +
      `Persisted output reports ${format(first.count)} ${first.label} and ${format(second.count)} ${second.label} as complementary categories in one population of ${partition.unit}.\n` +
      `Derived population size: ${format(partition.total)} ${recordUnit(partition.unit)} records.\n` +
      `Operation: ${format(first.count)} + ${format(second.count)} = ${format(partition.total)}.\n` +
      `Boundary: this establishes the size of that complete persisted population only; separate evidence must connect it to a source, model, evaluation, or scoring role.`;
  }).join("\n\n");
}
