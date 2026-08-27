import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { populationPartitionAnnotation } from "./population-evidence.mjs";

const IGNORE = new Set([".git", "node_modules", ".venv", "venv", "dist", "build", ".next", "__pycache__", ".cache"]);
const TEXT_EXTENSIONS = new Set([".md", ".rmd", ".qmd", ".txt", ".rst", ".py", ".r", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".lock", ".csv", ".tsv", ".sql", ".sh", ".html", ".xml"]);
const SPECIAL_EXTENSIONS = new Set([".ipynb", ".pdf", ".xlsx", ".xlsm"]);
const SPECIAL_FILENAMES = new Set(["dockerfile", "pipfile", "gemfile"]);
const MAX_FILES = 200;
const MAX_TOTAL_CHARS = 320_000;
const MAX_FILE_BYTES = 8_000_000;
const MAX_ITEM_CHARS = 28_000;
const MAX_MANIFEST_CHARS = 12_000;
const MAX_LOCK_EXCERPT_CHARS = 4_000;
const ENVIRONMENT_MANIFEST = /^(?:requirements(?:[-_.].*)?\.txt|environment(?:[-_.].*)?\.ya?ml|conda(?:[-_.].*)?\.lock|pipfile(?:\.lock)?|poetry\.lock|pyproject\.toml|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|renv\.lock|dockerfile)$/i;

function isEnvironmentManifest(relativePath) {
  return ENVIRONMENT_MANIFEST.test(path.basename(relativePath));
}

function priority(relativePath) {
  const p = relativePath.toLowerCase();
  const name = path.basename(p);
  const rootLevel = !p.includes("/");
  let score = 0;
  if (/^readme/.test(name)) score += 100;
  if (rootLevel && isEnvironmentManifest(name)) score += 90;
  if (/report|results?|metrics?|evaluat|validat|performance|model[ _-]?card|data[._ -]?dict|documentation/.test(p)) score += 60;
  if (/\.ipynb$/.test(p)) score += 50;
  if (/(?:^|[/_.-])(?:train|fit|model|predict|score|infer|feature)(?:[/_.-]|$)/.test(p)) score += 45;
  if (/(?:^|[/_.-])(?:(?:prepare|preprocess|transform|construct|build|make)[_-]?(?:data|dataset|features?)|canon(?:ical)?[_-]?dataset)(?:[/_.-]|$)/.test(p)) score += 45;
  if (/(?:^|[/_.-])(?:pipeline|workflow|output|export|deploy|serve|api|upload|finali[sz])(?:[/_.-]|$)/.test(p)) score += 40;
  if (/param|config|manifest|dvc\.lock/.test(p)) score += 35;
  if (/test|example/.test(p)) score -= 15;
  if (/license|contributing/.test(p)) score -= 25;
  if (!rootLevel && /lock|environment|requirement/.test(p)) score -= 10;
  return score;
}

async function walk(root, current = root, files = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink() || IGNORE.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, files);
    else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(ext) || SPECIAL_EXTENSIONS.has(ext) || SPECIAL_FILENAMES.has(entry.name.toLowerCase())) {
        const stat = await fs.stat(absolute);
        if (stat.size <= MAX_FILE_BYTES) files.push({ absolute, relative: path.relative(root, absolute), ext, size: stat.size });
      }
    }
  }
  return files;
}

function clean(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .slice(0, MAX_ITEM_CHARS)
    .trim();
}

function notebookText(raw) {
  const notebook = JSON.parse(raw);
  const metricPairs = [];
  const outputPairs = [];
  const narrative = [];
  const evaluationCode = [];
  const code = [];
  for (const cell of notebook.cells || []) {
    const source = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source || "");
    const renderedOutputs = [];
    for (const output of cell.outputs || []) {
      const plain = output?.data?.["text/plain"] ?? output?.text;
      const rendered = Array.isArray(plain) ? plain.join("") : plain;
      if (rendered && String(rendered).trim()) renderedOutputs.push(`[PERSISTED OUTPUT]\n${rendered}`);
    }
    if (renderedOutputs.length) {
      const pair = `${source.trim() ? `[CODE FOR OUTPUT]\n${source}\n\n` : ""}${renderedOutputs.join("\n\n")}`;
      const populationPartitions = populationPartitionAnnotation(pair);
      const annotatedPair = populationPartitions ? `${populationPartitions}\n\n${pair}` : pair;
      (/accuracy|auc|precision|recall|confusion|f1|r2|r²|mae|rmse|mape|score|train|test|shape|len\(/i.test(`${source}\n${renderedOutputs.join("\n")}`) ? metricPairs : outputPairs).push(annotatedPair);
      continue;
    }
    if (source.trim()) {
      const renderedSource = `[${String(cell.cell_type || "cell").toUpperCase()}]\n${source}`;
      if (cell.cell_type !== "code") narrative.push(renderedSource);
      else if (/train_test_split|y_test|accuracy_score|roc_auc|precision_recall|confusion_matrix|f1_score|cross_val|evaluate|metric/i.test(source)) evaluationCode.push(renderedSource);
      else code.push(renderedSource);
    }
  }
  return [...metricPairs, ...outputPairs, ...evaluationCode, ...narrative, ...code].join("\n\n");
}

function spreadsheetText(file) {
  try {
    const xml = execFileSync("unzip", ["-p", file, "xl/sharedStrings.xml"], { encoding: "utf8", maxBuffer: 4_000_000 });
    return xml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  } catch {
    return "Spreadsheet present; textual cells were not extractable.";
  }
}

async function extract(file) {
  const buffer = await fs.readFile(file.absolute);
  if (file.ext === ".ipynb") return notebookText(buffer.toString("utf8"));
  if (file.ext === ".pdf") {
    const originalWarn = console.warn;
    try {
      console.warn = () => {};
      return (await pdf(buffer)).text;
    } catch { return "PDF present; embedded text was not extractable."; }
    finally { console.warn = originalWarn; }
  }
  if (file.ext === ".xlsx" || file.ext === ".xlsm") return spreadsheetText(file.absolute);
  const text = buffer.toString("utf8");
  if (file.ext === ".csv" || file.ext === ".tsv") {
    const rows = text ? text.split(/\r?\n/).filter(Boolean).length : 0;
    return `[DETERMINISTIC ROW COUNT INCLUDING HEADER: ${rows}]\n${text}`;
  }
  return text;
}

function kindFor(file) {
  const ext = file.ext;
  const name = path.basename(file.relative).toLowerCase();
  if (isEnvironmentManifest(name)) return "environment_or_dependency_manifest";
  if (ext === ".ipynb") return "notebook";
  if (ext === ".pdf") return "report";
  if (ext === ".csv" || ext === ".tsv" || ext === ".xlsx" || ext === ".xlsm") return "data_or_table";
  if ([".yaml", ".yml", ".toml", ".ini", ".cfg", ".json"].includes(ext)) return "configuration_or_metadata";
  if ([".py", ".r", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".sql", ".sh"].includes(ext)) return "source_code";
  return "documentation";
}

export async function collectEvidence(projectPath) {
  const root = await fs.realpath(projectPath);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error("Project path must be a directory.");
  const candidates = (await walk(root)).sort((a, b) => priority(b.relative) - priority(a.relative) || a.relative.localeCompare(b.relative)).slice(0, MAX_FILES);
  const evidence = [{
    id: "E-SYSTEM-PATH", path: ".", kind: "project_identity", epistemic: "OBSERVED",
    excerpt: `Imported directory name: ${path.basename(root)}`, sha256: crypto.createHash("sha256").update(root).digest("hex"),
  }];
  let chars = evidence[0].excerpt.length;
  for (const file of candidates) {
    if (chars >= MAX_TOTAL_CHARS) break;
    let excerpt;
    try { excerpt = clean(await extract(file)); } catch { continue; }
    if (!excerpt) continue;
    excerpt = excerpt.slice(0, Math.min(MAX_ITEM_CHARS, MAX_TOTAL_CHARS - chars));
    const id = `E-${crypto.createHash("sha256").update(file.relative).digest("hex").slice(0, 10).toUpperCase()}`;
    evidence.push({
      id, path: file.relative, kind: kindFor(file), epistemic: "OBSERVED", excerpt,
      sha256: crypto.createHash("sha256").update(await fs.readFile(file.absolute)).digest("hex"),
    });
    chars += excerpt.length;
  }
  let git = null;
  try {
    const commandOptions = { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] };
    const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], commandOptions).trim();
    const branch = execFileSync("git", ["-C", root, "branch", "--show-current"], commandOptions).trim() || "detached";
    git = { head, branch };
    evidence.push({ id: "E-SYSTEM-GIT", path: ".git", kind: "git_identity", epistemic: "OBSERVED", excerpt: `Checked-out branch: ${branch}\nHEAD: ${head}`, sha256: head });
  } catch {}
  return { root, evidence, inventory: { eligible_files: candidates.length, collected_items: evidence.length, bounded_characters: chars, git } };
}

export async function collectEnvironmentEvidence(projectPath) {
  const root = await fs.realpath(projectPath);
  const files = (await walk(root)).filter((file) => isEnvironmentManifest(file.relative)).sort((left, right) => left.relative.localeCompare(right.relative));
  const evidence = [];
  for (const file of files) {
    let excerpt;
    try { excerpt = clean(await extract(file)); } catch { continue; }
    if (!excerpt) continue;
    const cap = /\.lock$/i.test(file.relative) ? MAX_LOCK_EXCERPT_CHARS : MAX_MANIFEST_CHARS;
    const data = await fs.readFile(file.absolute);
    evidence.push({
      id: `E-${crypto.createHash("sha256").update(file.relative).digest("hex").slice(0, 10).toUpperCase()}`,
      path: file.relative,
      kind: "environment_or_dependency_manifest",
      epistemic: "OBSERVED",
      excerpt: excerpt.slice(0, cap),
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    });
  }
  return evidence;
}

export async function projectStaticEvidence(record) {
  const sourcePath = record?.source_project?.path;
  const auditedSnapshot = record?.source_project?.content_snapshot_after || record?.source_project?.content_snapshot_before;
  if (!sourcePath || !auditedSnapshot) return record;
  try {
    if (await contentSnapshot(sourcePath) !== auditedSnapshot) return record;
    const supplemental = await collectEnvironmentEvidence(sourcePath);
    const existing = new Set((record.evidence || []).map((item) => item.id));
    const additions = supplemental.filter((item) => !existing.has(item.id));
    return additions.length ? { ...record, evidence: [...(record.evidence || []), ...additions] } : record;
  } catch {
    return record;
  }
}

export async function contentSnapshot(projectPath) {
  const root = await fs.realpath(projectPath);
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const data = await fs.readFile(absolute);
        files.push(`${path.relative(root, absolute)}:${crypto.createHash("sha256").update(data).digest("hex")}`);
      }
    }
  }
  await visit(root);
  return crypto.createHash("sha256").update(files.sort().join("\n")).digest("hex");
}
