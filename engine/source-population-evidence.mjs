const COUNT_SCALE = Object.freeze({
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  m: 1e6,
  billion: 1e9,
  b: 1e9,
  trillion: 1e12,
  t: 1e12,
});

const BROAD_SOURCE_STATEMENT = /\b(?:data(?:set)?|archive|corpus|collection|inventory|population)\b[^.]{0,140}?\b(?:contains?|comprises?|includes?|has|holds?|consists\s+of|covers?)\b[^.]{0,80}?\b((?:more\s+than|over|at\s+least|approximately|about|around|roughly|nearly)\s+)?(\d+(?:,\d{3})*(?:\.\d+)?)\s*(thousand|million|billion|trillion|[KMBT])?\s+(rows?|records?|observations?|requests?|cases?|items?|entities?|accounts?|samples?|examples?|events?|transactions?|properties?|parcels?|sites?)\b/gi;

const DOWNSTREAM_CONTEXT = /\b(?:model|training|train|test|evaluation|validation|holdout|held[ -]?out|split|scor(?:e|ing)|prediction|forecast)\b/i;

function multiplier(scale) {
  return scale ? COUNT_SCALE[String(scale).toLowerCase()] || 1 : 1;
}

function canonicalQualifier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (/^(?:more than|over)$/.test(normalized)) return "more_than";
  if (normalized === "at least") return "at_least";
  if (/^(?:approximately|about|around|roughly)$/.test(normalized)) return "approximate";
  if (normalized === "nearly") return "nearly";
  return "exact";
}

function displayQualifier(qualifier) {
  if (qualifier === "more_than") return "More than ";
  if (qualifier === "at_least") return "At least ";
  if (qualifier === "approximate") return "Approximately ";
  if (qualifier === "nearly") return "Nearly ";
  return "";
}

function displayNumber(raw, scale) {
  const normalizedScale = String(scale || "");
  const suffix = normalizedScale.length === 1 ? normalizedScale.toUpperCase() : normalizedScale ? ` ${normalizedScale.toLowerCase()}` : "";
  return `${String(raw).replaceAll(",", "")}${suffix}`;
}

/**
 * Recognises explicit, broad source-inventory statements in project documentation.
 * Model, split, evaluation, and output statements are deliberately excluded: those
 * counts belong to downstream analytical contexts rather than the project source.
 */
export function sourcePopulationStatements(evidence = [], canonicalUnit = "") {
  const candidates = [];
  for (const item of evidence || []) {
    if (!item?.id || !/^(?:documentation|report|data_documentation)$/i.test(String(item.kind || ""))) continue;
    const excerpt = String(item.excerpt || "");
    BROAD_SOURCE_STATEMENT.lastIndex = 0;
    for (const match of excerpt.matchAll(BROAD_SOURCE_STATEMENT)) {
      if (DOWNSTREAM_CONTEXT.test(match[0])) continue;
      const numeric = Number(match[2].replaceAll(",", "")) * multiplier(match[3]);
      if (!Number.isFinite(numeric) || numeric <= 0) continue;
      const qualifier = canonicalQualifier(match[1]);
      const recordedUnit = match[4].toLowerCase();
      candidates.push({
        id: `document-source-population-${item.id}-${match.index}`,
        role: "project_population",
        state: "established",
        display: `${displayQualifier(qualifier)}${displayNumber(match[2], match[3])} ${recordedUnit}`,
        count: qualifier === "exact" ? numeric : null,
        numeric_value: numeric,
        count_qualifier: qualifier,
        unit: canonicalUnit || recordedUnit,
        recorded_unit: recordedUnit,
        coverage: "explicit_broad_source_statement",
        selection_basis: "explicit project-source inventory statement; downstream model, split, evaluation, and output counts remain separate",
        epistemic: "OBSERVED",
        evidence_ids: [item.id],
        source_locator: item.path || null,
      });
    }
  }
  return candidates.sort((left, right) => right.numeric_value - left.numeric_value || String(left.source_locator).localeCompare(String(right.source_locator)));
}
