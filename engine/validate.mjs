import { FIELD_STATES, EPISTEMIC_STATES, NOT_ESTABLISHED, EXECUTION_REQUIRED } from "./contract.mjs";

function walkMaterial(value, trail = "record", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkMaterial(item, `${trail}[${index}]`, found));
    return found;
  }
  if (typeof value.state === "string" && Array.isArray(value.evidence_ids)) found.push({ trail, value });
  for (const [key, child] of Object.entries(value)) {
    if (!["evidence", "source_project"].includes(key)) walkMaterial(child, `${trail}.${key}`, found);
  }
  return found;
}

const NUMBER_TOKEN = /(?:\d{1,3}(?:,\d{3})+|(?:\d+(?:\.\d+)?|\.\d+))(?:(?:\s*(?:%|percent(?:age)?))|(?:\s*[km]\b))?/gi;
const CURRENCY_CODES = new Set(["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "KRW", "NZD", "SEK", "SGD", "USD"]);

function numberLikeIdentifier(text, start, end) {
  let left = start;
  let right = end;
  while (left > 0 && /[A-Za-z0-9_-]/.test(text[left - 1])) left -= 1;
  while (right < text.length && /[A-Za-z0-9_-]/.test(text[right])) right += 1;
  const compact = text.slice(left, right);
  if (/[A-Za-z]/.test(compact) && /\d/.test(compact)) {
    if (/(?:within|less_than|greater_than|threshold|limit)[_-]\d+$/i.test(compact)) return false;
    return true;
  }

  const acronym = text.slice(0, start).match(/\b([A-Z]{2,8})\s+$/)?.[1];
  const digits = text.slice(start, end).replace(/,/g, "");
  const following = text.slice(end, end + 36);
  if (/^\d{2,4}$/.test(digits) && /^\s+(?:source coverage|service(?:\s+requests?)?)\b/i.test(following)) return true;
  return Boolean(acronym && !CURRENCY_CODES.has(acronym) && /^\d{2,4}$/.test(digits));
}

function numericOccurrences(text) {
  const rendered = String(text || "");
  const occurrences = [];
  for (const match of rendered.matchAll(NUMBER_TOKEN)) {
    const core = match[0].match(/^(?:\d{1,3}(?:,\d{3})+|(?:\d+(?:\.\d+)?|\.\d+))/)?.[0];
    if (!core) continue;
    const start = match.index;
    const end = start + core.length;
    const percentage = /%|percent/i.test(match[0]);
    const magnitude = match[0].match(/\s*([km])\b/i)?.[1]?.toLowerCase() || null;
    if (!magnitude && numberLikeIdentifier(rendered, start, end)) continue;
    const scale = magnitude === "k" ? 1_000 : magnitude === "m" ? 1_000_000 : 1;
    occurrences.push({
      token: percentage ? `${core}%` : magnitude ? `${core}${magnitude.toUpperCase()}` : core,
      numeric: Number(core.replace(/,/g, "")) * scale,
      percentage,
      magnitude,
      start,
      end: start + match[0].length,
    });
  }
  return occurrences.filter((item) => Number.isFinite(item.numeric));
}

function numberTokens(text) {
  return numericOccurrences(text).map((item) => item.token);
}

function normalizedNumericForms(token) {
  const raw = token.replace(/,/g, "");
  const numeric = Number(raw.replace("%", ""));
  const forms = new Set([token, raw, String(numeric)]);
  if (Number.isFinite(numeric)) forms.add(numeric.toLocaleString("en-US", { maximumFractionDigits: 12 }));
  if (raw.endsWith("%")) forms.add(String(numeric / 100));
  else if (numeric >= 0 && numeric <= 1) forms.add(`${Math.round(numeric * 100)}%`);
  return [...forms];
}

function nearby(text, occurrence, radius = 72) {
  return String(text || "").slice(Math.max(0, occurrence.start - radius), occurrence.end + radius).toLowerCase();
}

function splitContext(text) {
  const value = String(text || "").toLowerCase();
  if (/train_test_split|tr_te_split|test_size|train_size|split_prop|held[-_ ]?out/.test(value)) return true;
  return /\btrain(?:ing)?\b/.test(value) && /\btest(?:ing)?\b/.test(value) && !/accuracy|precision|recall|\bf1\b|roc|auc|metric|score/.test(value);
}

function numericRole(rendered, occurrence, trail) {
  const context = nearby(rendered, occurrence);
  const tight = nearby(rendered, occurrence, 34);
  if (Number.isInteger(occurrence.numeric) && occurrence.numeric >= 1900 && occurrence.numeric <= 2100) return "year";
  const ratioBefore = String(rendered || "").slice(Math.max(0, occurrence.start - 12), occurrence.start);
  const ratioAfter = String(rendered || "").slice(occurrence.end, occurrence.end + 12);
  if (/^\s*\/\s*\d/.test(ratioAfter) || /\d\s*\/\s*$/.test(ratioBefore)) return "split";
  if (/\$\s*$/.test(String(rendered || "").slice(Math.max(0, occurrence.start - 4), occurrence.start)) || /\b(?:usd|eur|gbp|price|cost)\b/.test(tight)) return "currency";
  if (trail.endsWith(".period") && /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{1,4}[/-]\d{1,2}/i.test(context)) return "date";
  if (/^\s*(?:days?|weeks?|months?|years?|hours?|minutes?)\b/.test(String(rendered || "").slice(occurrence.end, occurrence.end + 18).toLowerCase())) return "duration";
  if (/\bthresholds?\b/.test(tight)) return "threshold";
  if (trail.startsWith("record.samples.")) return "sample_count";
  if (/accuracy|precision|recall|\bf1\b|r2_score|roc|auc|brier|metric|score|loss/.test(tight)) return "metric";
  if (/\brows?\b|\brecords?\b|\bobservations?\b|\bsamples?\b|\bcases\b|\bnarratives?\b|\bcalls?\b|\bproperties\b|\bparcels\b|\bestablishments?\b|\bdescriptions?\b|truth deck/.test(tight)) return "sample_count";
  const following = String(rendered || "").slice(occurrence.end, occurrence.end + 22).toLowerCase();
  if (/^\s*(?:seeds?|seeded|simulations?|runs?)\b/.test(following)) return "generic";
  if (/\blabels?\b|\bclasses?\b|\bcategories\b|\bconcerns?\b/.test(tight)) return "label_count";
  if (splitContext(tight) || (trail.endsWith("evaluation_design") && /\btrain(?:ing)?\b|\btest(?:ing)?\b|\bsplit\b/.test(tight))) return "split";
  if (splitContext(context) || (trail.endsWith("evaluation_design") && /\btrain(?:ing)?\b|\btest(?:ing)?\b|\bsplit\b/.test(context))) return "split";
  if (/\brows?\b|\brecords?\b|\bobservations?\b|\bsamples?\b|\bcases\b|\bnarratives?\b|\bcalls?\b|\bproperties\b|\bparcels\b|\bestablishments?\b|\bdescriptions?\b|truth deck/.test(context)) return "sample_count";
  return "generic";
}

function evidenceRoles(excerpt, occurrence) {
  let context = nearby(excerpt, occurrence, 220);
  const codeBlockStart = String(excerpt || "").lastIndexOf("[CODE FOR OUTPUT]", occurrence.start);
  const outputStart = String(excerpt || "").lastIndexOf("[PERSISTED OUTPUT]", occurrence.start);
  if (codeBlockStart >= 0 && outputStart > codeBlockStart && occurrence.start - codeBlockStart <= 1_200) {
    context += ` ${String(excerpt || "").slice(codeBlockStart, occurrence.end + 120).toLowerCase()}`;
  }
  const roles = new Set();
  if (Number.isInteger(occurrence.numeric) && occurrence.numeric >= 1900 && occurrence.numeric <= 2100) roles.add("year");
  if (/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/.test(context)) roles.add("date");
  if (/\$|\b(?:usd|eur|gbp|sale_price|price|cost)\b|less_than_\d+k\b/.test(context)) roles.add("currency");
  if (/\bdays?\b|\bweeks?\b|\bmonths?\b|\byears?\b|\bhours?\b|\bminutes?\b|resolution_time|duration|within_\d+\b/.test(context)) roles.add("duration");
  if (/\bthresholds?\b/.test(context)) roles.add("threshold");
  if (splitContext(context)) roles.add("split");
  if (/accuracy|precision|recall|\bf1\b|roc|auc|brier|metric|score|loss/.test(context)) roles.add("metric");
  if (/\blabels?\b|\bclasses?\b|\bcategories\b|\bconcerns?\b/.test(context)) roles.add("label_count");
  if (/row count including header|\bnrow\b|\bdim\s*\(|\.shape\b|\brows?\b|\brecords?\b|\bobservations?\b|\bsamples?\b|\bnarratives?\b|\bcalls?\b|\bobs\b|\bproperties\b|\bparcels\b|\bestablishments?\b|\bdescriptions?\b|truth deck/.test(context)) roles.add("sample_count");
  return roles;
}

function numericallyEquivalent(claim, evidence) {
  if (claim.percentage === evidence.percentage) return Math.abs(claim.numeric - evidence.numeric) < 1e-12;
  const percentage = claim.percentage ? claim : evidence;
  const decimal = claim.percentage ? evidence : claim;
  return Math.abs((percentage.numeric / 100) - decimal.numeric) < 1e-12;
}

function directlyGrounded(claim, role, evidenceItems) {
  for (const item of evidenceItems) {
    for (const occurrence of numericOccurrences(item.excerpt)) {
      if (!numericallyEquivalent(claim, occurrence)) continue;
      const supportRoles = evidenceRoles(item.excerpt, occurrence);
      if (role === "generic" || supportRoles.has(role)) return true;
    }
  }
  return false;
}

function rowCountsExcludingHeader(evidenceItems) {
  const counts = new Set();
  for (const item of evidenceItems) {
    for (const match of String(item.excerpt || "").matchAll(/\[(?:DETERMINISTIC\s+)?ROW COUNT INCLUDING HEADER:\s*([\d,]+)\]/gi)) {
      const includingHeader = Number(match[1].replace(/,/g, ""));
      if (Number.isSafeInteger(includingHeader) && includingHeader > 1) counts.add(includingHeader - 1);
    }
  }
  return [...counts];
}

function explicitLabelCounts(evidenceItems) {
  const counts = new Set();
  const patterns = [
    /\b(?:labels?|class_names|target_names)\s*(?:=|<-)\s*\[([\s\S]*?)\]/gi,
    /\b(?:labels?|class_names|target_names)\s*(?:=|<-)\s*c\s*\(([\s\S]*?)\)/gi,
  ];
  for (const item of evidenceItems) {
    for (const pattern of patterns) {
      for (const match of String(item.excerpt || "").matchAll(pattern)) {
        const members = match[1].match(/["'][^"'\r\n]*["']/g) || [];
        if (members.length) counts.add(members.length);
      }
    }
  }
  return [...counts];
}

function unambiguousSplit(evidenceItems) {
  const support = evidenceItems.map((item) => String(item.excerpt || "")).join("\n");
  const testFractions = new Set();
  for (const match of support.matchAll(/\btest_size\s*=\s*((?:\d+(?:\.\d+)?|\.\d+)%?)/g)) {
    const percentage = match[1].endsWith("%");
    const numeric = Number(match[1].replace("%", ""));
    const fraction = percentage ? numeric / 100 : numeric;
    if (fraction > 0 && fraction < 1) testFractions.add(fraction);
  }
  const trainFractions = new Set();
  for (const match of support.matchAll(/\btr_te_split\s*\(\s*((?:\d+(?:\.\d+)?|\.\d+)%?)/g)) {
    const percentage = match[1].endsWith("%");
    const numeric = Number(match[1].replace("%", ""));
    const fraction = percentage ? numeric / 100 : numeric;
    if (fraction > 0 && fraction < 1) trainFractions.add(fraction);
  }
  if (testFractions.size === 1 && trainFractions.size === 0) {
    const testFraction = [...testFractions][0];
    return { testFraction, trainFraction: 1 - testFraction, rowCounts: rowCountsExcludingHeader(evidenceItems), countRounding: /\btrain_test_split\s*\(/.test(support) };
  }
  if (trainFractions.size === 1 && testFractions.size === 0) {
    const trainFraction = [...trainFractions][0];
    return { testFraction: 1 - trainFraction, trainFraction, rowCounts: [], countRounding: false };
  }
  return null;
}

function splitTarget(rendered, occurrence) {
  const ratioBefore = String(rendered || "").slice(Math.max(0, occurrence.start - 18), occurrence.start);
  const ratioAfter = String(rendered || "").slice(occurrence.end, occurrence.end + 18);
  if (/^\s*\/\s*\d/.test(ratioAfter)) return "train";
  if (/\d\s*\/\s*$/.test(ratioBefore)) return "test";
  const following = String(rendered || "").slice(occurrence.end, occurrence.end + 36).toLowerCase();
  if (/\btrain(?:ing)?\b/.test(following)) return "train";
  if (/\btest(?:ing)?\b|\bevaluation\b|held[- ]?out/.test(following)) return "test";
  const preceding = String(rendered || "").slice(Math.max(0, occurrence.start - 36), occurrence.start).toLowerCase();
  if (/\btrain(?:ing)?\b/.test(preceding)) return "train";
  if (/\btest(?:ing)?\b|\bevaluation\b|held[- ]?out/.test(preceding)) return "test";
  return null;
}

function deterministicallyGrounded({ claim, role, rendered, trail, value, evidenceItems }) {
  if (!Number.isInteger(claim.numeric)) return false;
  if (role === "label_count" && explicitLabelCounts(evidenceItems).includes(claim.numeric)) return true;

  const rowCounts = rowCountsExcludingHeader(evidenceItems);
  if (role === "sample_count" && rowCounts.includes(claim.numeric)) return true;

  const split = unambiguousSplit(evidenceItems);
  if (!split) return false;
  if (role === "sample_count" && split.countRounding && Number(value.count) === claim.numeric && split.rowCounts.length === 1) {
    const total = split.rowCounts[0];
    const evaluation = Math.ceil(total * split.testFraction);
    if (trail === "record.samples.model_sample" && claim.numeric === total - evaluation) return true;
    if (trail === "record.samples.evaluation_sample" && claim.numeric === evaluation) return true;
  }
  if (role === "split") {
    const ratioContext = String(rendered || "").slice(Math.max(0, claim.start - 18), claim.end + 18);
    const fraction = claim.percentage || (claim.numeric > 1 && claim.numeric <= 100 && /\d\s*\/\s*\d/.test(ratioContext)) ? claim.numeric / 100 : claim.numeric;
    const target = splitTarget(rendered, claim);
    if (target === "test" && Math.abs(fraction - split.testFraction) < 1e-12) return true;
    if (target === "train" && Math.abs(fraction - split.trainFraction) < 1e-12) return true;
  }
  return false;
}

export function validateReconstruction(reconstruction, evidence) {
  const errors = [];
  const warnings = [];
  const evidenceMap = new Map(evidence.map((item) => [item.id, item]));
  for (const { trail, value } of walkMaterial(reconstruction)) {
    if (!FIELD_STATES.includes(value.state)) errors.push(`${trail}: invalid state`);
    if (!EPISTEMIC_STATES.includes(value.epistemic)) errors.push(`${trail}: invalid epistemic state`);
    for (const id of value.evidence_ids) if (!evidenceMap.has(id)) errors.push(`${trail}: unknown evidence reference ${id}`);
    if (value.state === "established" && value.evidence_ids.length === 0) errors.push(`${trail}: established value has no evidence`);
    if (value.state !== "established" && value.evidence_ids.length > 0) warnings.push(`${trail}: unresolved value carries evidence references`);
    const rendered = value.value ?? value.display ?? value.display_value ?? "";
    if (value.state === "not_established" && rendered && ![NOT_ESTABLISHED, "–"].includes(rendered)) errors.push(`${trail}: non-standard missing value`);
    if (value.state === "execution_required" && rendered && ![EXECUTION_REQUIRED, "–"].includes(rendered)) errors.push(`${trail}: non-standard execution-required value`);
    if (value.state === "established") {
      const evidenceItems = value.evidence_ids.map((id) => evidenceMap.get(id)).filter(Boolean);
      for (const claim of numericOccurrences(rendered)) {
        const role = numericRole(rendered, claim, trail);
        if (!directlyGrounded(claim, role, evidenceItems) && !deterministicallyGrounded({ claim, role, rendered, trail, value, evidenceItems })) {
          errors.push(`${trail}: numeric value ${claim.token} is not grounded in cited evidence`);
        }
      }
    }
  }
  const result = reconstruction?.results_evaluation?.primary_result;
  if (result?.state === "established" && !result.metric.trim()) errors.push("primary result: metric is required");
  const secondaryResults = reconstruction?.results_evaluation?.material_results || [];
  const maximumAdditional = result?.state === "established" ? 2 : 3;
  if (secondaryResults.length > maximumAdditional) errors.push(`additional material results: maximum is ${maximumAdditional}`);
  if (secondaryResults.some((item) => item.state === "established") && reconstruction?.results_evaluation?.other_material_result?.state !== "established") {
    errors.push("other material result summary is required when an additional material result is established");
  }
  const confidenceIds = reconstruction?.confidence?.evidence_ids || [];
  for (const id of confidenceIds) if (!evidenceMap.has(id)) errors.push(`confidence: unknown evidence reference ${id}`);
  if (result?.state !== "established" && reconstruction?.confidence?.level !== "Not established") errors.push("confidence must be Not established when no primary result exists");
  const modelSample = reconstruction?.samples?.model_sample;
  const evaluationSample = reconstruction?.samples?.evaluation_sample;
  for (const [name, sample] of Object.entries(reconstruction?.samples || {})) {
    if (sample?.state === "established" && numberTokens(sample.display).length === 0) errors.push(`${name}: established sample display has no numeric quantity`);
    if (sample?.state === "established" && /%|percent|percentage|share|ratio/i.test(`${sample.display} ${sample.unit}`)) errors.push(`${name}: sample indicator uses a proportion instead of an absolute count`);
  }
  if (modelSample?.state === "established" && evaluationSample?.state === "established" && Number.isFinite(evaluationSample.count)) {
    const evaluationForms = normalizedNumericForms(String(evaluationSample.count));
    if (evaluationForms.some((form) => String(modelSample.display).includes(form)) && modelSample.count !== evaluationSample.count) {
      errors.push("model sample display includes the held-out evaluation count");
    }
    const possibleTrainingCount = Number(modelSample.count) - Number(evaluationSample.count);
    const design = reconstruction?.results_evaluation?.evaluation_design?.value || "";
    if (Number.isFinite(modelSample.count) && possibleTrainingCount > 0 && normalizedNumericForms(String(possibleTrainingCount)).some((form) => design.includes(form))) {
      errors.push("model sample appears to combine the explicitly stated training and evaluation counts");
    }
  }
  return { status: errors.length ? "INVALID" : "VALID", errors, warnings };
}

export function assertValidRecord(record) {
  if (record.schema_version !== "boveda-supervisory-record-0.9.0") throw new Error("Unsupported record schema.");
  const validation = validateReconstruction(record.reconstruction, record.evidence);
  if (validation.status !== "VALID") throw new Error(`Invalid record: ${validation.errors.join("; ")}`);
  return validation;
}
