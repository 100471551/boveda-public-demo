const NUMBER = String.raw`[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const NUMBER_PATTERN = new RegExp(NUMBER);
const QUALIFIER_PATTERN = /[+~≈>]|\b(?:about|approximately|approx\.?|around|roughly|estimated|more than|over|at least|no fewer than|minimum(?: of)?)\b/i;
const COUNT_UNIT_PATTERN = /records?|rows?|observations?|properties|parcels?|cases?|requests?|events?|establishments?|examples?|samples?|items?|people|persons?|users?|transactions?|documents?|images?|files?/i;
const SCALES = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9, trillion: 1e12, t: 1e12 };
const METRIC_PREFIX = String.raw`((?:accuracy|auc|roc(?:[- ]auc)?|average precision|precision|recall|f1(?: score)?|f-score|r2(?:_score)?|r²|rmse|mae|mape|brier(?: loss)?|error|loss|score|rate)\s*[:=]?\s*)`;

function numberFrom(value) {
  return Number(String(value).replaceAll(",", ""));
}

function fixed(value) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function countExpression() {
  return new RegExp(`${NUMBER}(?:\\s*\\+)?(?:\\s*(?:thousand|million|billion|trillion|[KMBT])\\b)?(?:\\s*\\+)?`, "i");
}

function numericSampleValue(sample) {
  if (Number.isFinite(sample?.count)) return sample.count;
  const display = String(sample?.display ?? "");
  const match = display.match(new RegExp(`(${NUMBER})\\s*(thousand|million|billion|trillion|[KMBT])?\\b`, "i"));
  if (!match) return Number.NaN;
  const scale = match[2] ? SCALES[match[2].toLowerCase()] : 1;
  return numberFrom(match[1]) * scale;
}

export function formatMetricValue(value) {
  const text = String(value ?? "–");
  const match = text.match(NUMBER_PATTERN);
  if (!match) return text;
  const numeric = numberFrom(match[0]);
  if (!Number.isFinite(numeric)) return text;
  const percentageEnd = match.index + match[0].length;
  const percentageSuffix = text.slice(percentageEnd).match(/^\s*%/);
  return percentageSuffix
    ? text.replace(`${match[0]}${percentageSuffix[0]}`, fixed(numeric / 100))
    : text.replace(match[0], fixed(numeric));
}

export function metricRatioValue(result) {
  if (!result || typeof result !== "object") return Number.NaN;
  const display = String(result.display_value ?? "");
  const percentageMatch = display.match(new RegExp(`(${NUMBER})\\s*%`));
  if (Number.isFinite(result.raw_value)) {
    return percentageMatch && result.raw_value > 1 && result.raw_value <= 100
      ? result.raw_value / 100
      : result.raw_value;
  }

  const match = percentageMatch || display.match(NUMBER_PATTERN);
  if (!match) return Number.NaN;
  const numeric = numberFrom(percentageMatch ? match[1] : match[0]);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return percentageMatch ? numeric / 100 : numeric;
}

export function formatAnalyticalMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "–";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: Math.max(0, Math.min(6, precision)) });
}

export function formatCompactCount(value, qualified = false) {
  const numeric = numberFrom(value);
  if (!Number.isFinite(numeric)) return String(value ?? "–");
  const absolute = Math.abs(numeric);
  let divisor = 1;
  let suffix = "";
  if (absolute >= 1e6) [divisor, suffix] = [1e6, "M"];
  else if (absolute >= 1e3) [divisor, suffix] = [1e3, "K"];
  const formatted = (numeric / divisor).toLocaleString("en-US", { maximumFractionDigits: suffix ? 1 : 0 });
  return `${formatted}${suffix}${qualified ? "+" : ""}`;
}

export function formatCountValue(sample) {
  const display = String(sample?.display ?? "–");
  if (sample?.state && sample.state !== "established") return display;
  const numeric = numericSampleValue(sample);
  if (!Number.isFinite(numeric)) return display;
  const qualified = QUALIFIER_PATTERN.test(`${display} ${sample?.unit ?? ""}`);
  const expression = countExpression();
  const formatted = formatCompactCount(numeric, qualified);
  return expression.test(display) ? display.replace(expression, formatted) : formatted;
}

export function formatSampleNumber(sample) {
  if (sample?.state !== "established") return "–";
  const numeric = numericSampleValue(sample);
  if (!Number.isFinite(numeric)) return "–";
  return formatCompactCount(numeric, QUALIFIER_PATTERN.test(`${sample.display ?? ""} ${sample.unit ?? ""}`));
}

export function formatSampleDetail(sample) {
  if (sample?.state !== "established") return sample?.state === "execution_required" ? "Execution required" : "Not established";
  const withoutQualifier = String(sample.display ?? "")
    .replace(/^\s*(?:about|approximately|approx\.?|around|roughly|estimated|more than|over|at least|no fewer than|minimum(?: of)?)\s+/i, "")
    .replace(countExpression(), "")
    .replace(/^\s*[-–—:;,·]+\s*|\s*[-–—:;,·]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return withoutQualifier || sample.unit || "records";
}

function protectedReplacement(text, pattern, formatter, values) {
  return text.replace(pattern, (...args) => {
    const token = `\uE000${values.length.toString(36)}\uE001`;
    values.push(formatter(...args));
    return token;
  });
}

export function formatSupervisorSummary(value) {
  let text = String(value ?? "–");
  const protectedValues = [];

  text = protectedReplacement(text, new RegExp(`${METRIC_PREFIX}(${NUMBER})\\s*%`, "gi"),
    (_match, prefix, number) => `${prefix}${fixed(numberFrom(number) / 100)}`, protectedValues);
  text = protectedReplacement(text, new RegExp(`(${NUMBER})\\s*%`, "g"), (_match, number) => `${fixed(numberFrom(number))}%`, protectedValues);
  text = protectedReplacement(text, new RegExp(`(${NUMBER})\\s*(\\+)?\\s*(thousand|million|billion|trillion|[KMBT])\\b\\s*(\\+)?`, "gi"),
    (_match, number, before, scale, after, offset, source) => {
      const prior = source.slice(Math.max(0, offset - 24), offset);
      const qualified = Boolean(before || after || QUALIFIER_PATTERN.test(prior));
      return formatCompactCount(numberFrom(number) * SCALES[scale.toLowerCase()], qualified);
    }, protectedValues);
  text = protectedReplacement(text, /([+-]?\d{1,3}(?:,\d{3})+)(\s*\+)?/g,
    (_match, number, plus, offset, source) => formatCompactCount(number, Boolean(plus || QUALIFIER_PATTERN.test(source.slice(Math.max(0, offset - 24), offset)))), protectedValues);
  text = protectedReplacement(text, new RegExp(`([+-]?\\d{4,})(\\s*\\+)?(?=\\s*(?:${COUNT_UNIT_PATTERN.source})\\b)`, "gi"),
    (_match, number, plus, offset, source) => formatCompactCount(number, Boolean(plus || QUALIFIER_PATTERN.test(source.slice(Math.max(0, offset - 24), offset)))), protectedValues);

  text = text.replace(new RegExp(`${METRIC_PREFIX}(${NUMBER})`, "gi"), (_match, prefix, number) => `${prefix}${fixed(numberFrom(number))}`);

  return text.replace(/\uE000([0-9a-z]+)\uE001/g, (_match, index) => protectedValues[Number.parseInt(index, 36)]);
}

export function formatSupervisorCopy(value, maximumCharacters = 180) {
  const formatted = formatSupervisorSummary(value);
  if (formatted.length <= maximumCharacters) return formatted;
  const firstSentence = formatted.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length >= 50 && firstSentence.length <= maximumCharacters) return firstSentence;
  const slice = formatted.slice(0, maximumCharacters + 1);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > maximumCharacters * 0.7 ? boundary : maximumCharacters).trimEnd()}…`;
}
