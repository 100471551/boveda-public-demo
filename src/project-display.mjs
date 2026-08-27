const MISSING_PROJECT_TITLES = new Set([
  "",
  "–",
  "not established",
  "not established from available evidence.",
]);

const GENERIC_PROJECT_TITLES = new Set([
  "analysis",
  "data analysis",
  "data science project",
  "machine learning project",
  "model",
  "modelling",
  "modeling",
  "notebook",
  "project",
  "project analysis",
  "untitled",
  "untitled project",
]);

const ACRONYMS = new Map([
  ["ai", "AI"],
  ["avm", "AVM"],
  ["ml", "ML"],
  ["naics", "NAICS"],
  ["nyc", "NYC"],
  ["ppe", "PPE"],
]);

export function rootFolderName(sourcePath) {
  const normalized = String(sourcePath || "").trim().replace(/[\\/]+$/, "");
  const folder = normalized.split(/[\\/]/).filter(Boolean).at(-1);
  return folder || "Imported project";
}

export function humanizeRootFolderName(sourcePath) {
  const folder = rootFolderName(sourcePath);
  const withoutCasePrefix = folder.replace(/^r\d+(?:[_\-\s]+|$)/i, "");
  const words = withoutCasePrefix.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return "Imported project";
  return words.map((word) => ACRONYMS.get(word.toLowerCase()) || `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}

export function displayProjectTitle(identityName, sourcePath) {
  const value = String(identityName?.value || "").trim();
  const folder = rootFolderName(sourcePath);
  const reliable = identityName?.state === "established"
    && !MISSING_PROJECT_TITLES.has(value.toLowerCase())
    && value.localeCompare(folder, undefined, { sensitivity: "accent" }) !== 0;
  return reliable ? value : humanizeRootFolderName(sourcePath);
}

const LEADING_TARGET_QUALIFIERS = /^(?:(?:a|an|any|the|binary|multiclass|multi-class|continuous|categorical|predicted|estimated|future|specified|weekly|daily|monthly|annual|one|two|three|four|five)\s+)+/i;
const TRAILING_ANALYTICAL_ROLE = /\s+(?:class(?:es)?|labels?|predictions?|probabilit(?:y|ies)|scores?|indicators?|outcomes?|targets?)$/i;
const TEMPORAL_TARGET_CONTEXT = /\s+(?:for|in|during|within|on|at)\s+(?:(?:the\s+)?(?:target|test|evaluation|forecast|following|next|previous|current|specified)\b|(?:week|month|quarter|year|day|period|date)\b|\d{4}\b).*$/i;
const SMALL_TITLE_WORDS = new Set(["and", "for", "in", "of", "on", "or", "the", "to"]);
const PURPOSE_ACTION = /\b(?:analyse|analyze|assess|build|classify|compare|create|describe|detect|develop|estimate|evaluate|examine|find|forecast|identify|map|model|predict|rank|score|study|use)\b/i;
const PURPOSE_ACTION_SOURCE = "(?:analyse|analyze|assess|build|classify|compare|create|describe|detect|develop|estimate|evaluate|examine|find|forecast|identify|map|model|predict|rank|score|study|use)";
const GENERIC_PURPOSE_SUBJECTS = new Set(["case", "cases", "data", "dataset", "datasets", "item", "items", "observation", "observations", "property", "properties", "record", "records", "request", "requests", "row", "rows"]);

function titleCaseTarget(value) {
  return value.split(/\s+/).filter(Boolean).map((word, index) => {
    const pieces = word.split("-");
    return pieces.map((piece) => {
      const lower = piece.toLowerCase();
      if (ACRONYMS.has(lower)) return ACRONYMS.get(lower);
      if (index > 0 && SMALL_TITLE_WORDS.has(lower)) return lower;
      return `${piece.charAt(0).toUpperCase()}${piece.slice(1).toLowerCase()}`;
    }).join("-");
  }).join(" ");
}

function conciseSubject(value) {
  let target = String(value || "").trim().replace(/[.:;]+$/, "");
  target = target.replace(LEADING_TARGET_QUALIFIERS, "");
  target = target.replace(TEMPORAL_TARGET_CONTEXT, "");
  target = target.replace(TRAILING_ANALYTICAL_ROLE, "");
  target = target.replace(/^(?:elevated|high|low)\s+(?=.*\brisk\b)/i, "");
  target = target.replace(/-/g, " ");
  target = target.replace(/\s+/g, " ").trim();
  if (!target || target.length > 54) return "";
  return titleCaseTarget(target);
}

function explicitIdentityTitle(identityName, sourcePath) {
  const value = String(identityName?.value || "").replace(/\s+/g, " ").trim();
  const folder = rootFolderName(sourcePath);
  const normalized = value.toLowerCase().replace(/[.:;]+$/, "");
  if (identityName?.state !== "established"
    || MISSING_PROJECT_TITLES.has(value.toLowerCase())
    || GENERIC_PROJECT_TITLES.has(normalized)
    || value.localeCompare(folder, undefined, { sensitivity: "accent" }) === 0
    || value.length > 72
    || value.split(/\s+/).length > 12) return "";
  return value;
}

function purposeTitle(value) {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  const action = source.match(PURPOSE_ACTION);
  if (!action || action.index === undefined) return "";
  let subject = source.slice(action.index + action[0].length)
    .replace(new RegExp(`^(?:\\s*(?:and|to)\\s+${PURPOSE_ACTION_SOURCE}\\b)+`, "i"), "")
    .split(/[,;.]/, 1)[0]
    .replace(/\s+(?:by|using|with|from|across|within|through|via)\b.*$/i, "")
    .replace(/\s+for\s+(?:each|every|individual|all|selected|the)\b.*$/i, "")
    .replace(/\s+to\s+(?:support|inform|help|enable|reduce|understand|prioriti[sz]e)\b.*$/i, "")
    .replace(/^[\s,:;-]+|[\s,:;-]+$/g, "")
    .trim();
  subject = subject.replace(LEADING_TARGET_QUALIFIERS, "").replace(TRAILING_ANALYTICAL_ROLE, "").trim();
  const normalized = subject.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized || GENERIC_PURPOSE_SUBJECTS.has(normalized) || subject.length > 54 || subject.split(/\s+/).length > 8) return "";
  return titleCaseTarget(subject.replace(/-/g, " "));
}

export function canonicalSupervisorProjectTitle({ identityName, purpose, task, taskTarget, sourcePath }) {
  return explicitIdentityTitle(identityName, sourcePath)
    || purposeTitle(task)
    || purposeTitle(purpose)
    || conciseSubject(taskTarget)
    || humanizeRootFolderName(sourcePath);
}

export function canonicalSupervisorProjectTitleForRecord(record) {
  const reconstruction = record?.reconstruction || {};
  return canonicalSupervisorProjectTitle({
    identityName: reconstruction.identity?.name,
    purpose: reconstruction.purpose_scope?.purpose?.state === "established" ? reconstruction.purpose_scope.purpose.value : "",
    task: reconstruction.purpose_scope?.task?.state === "established" ? reconstruction.purpose_scope.task.value : "",
    taskTarget: reconstruction.results_evaluation?.primary_result?.state === "established" ? reconstruction.results_evaluation.primary_result.task_target : "",
    sourcePath: record?.source_project?.path,
  });
}

export function splitDashboardTitle(value, maximumLineLength = 28) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title || title.length <= maximumLineLength) return [title];

  const words = title.split(" ");
  if (words.length < 2) return [title];
  const withoutLastWord = words.slice(0, -1).join(" ");
  if (withoutLastWord.length <= maximumLineLength) return [withoutLastWord, words.at(-1)];

  const candidates = Array.from({ length: words.length - 1 }, (_, index) => {
    const first = words.slice(0, index + 1).join(" ");
    const second = words.slice(index + 1).join(" ");
    const overflow = Math.max(0, first.length - maximumLineLength) + Math.max(0, second.length - maximumLineLength);
    const balance = Math.abs(first.length - second.length);
    const shorterFirstLine = first.length < second.length ? maximumLineLength : 0;
    return { lines: [first, second], score: (overflow * 100) + balance + shorterFirstLine };
  });
  candidates.sort((left, right) => left.score - right.score);
  return candidates[0].lines;
}
