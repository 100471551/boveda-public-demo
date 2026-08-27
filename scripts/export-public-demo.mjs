import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listProjects, readRecord } from "../engine/persistence.mjs";
import { createProjectReportProjection, renderProjectReportHtml, renderReportPdf } from "../engine/report-export.mjs";
import { diagnosticsForRecord } from "../engine/diagnostics.mjs";
import { legacyAuditsForProject } from "../engine/legacy-audits.mjs";
import { validatePublicArtifacts } from "./public-demo-privacy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "v1.0.2";
const DESTINATION = path.join(ROOT, "public", "demo-data", VERSION);

const CREDENTIALS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

function cleanString(value, sourceRoot) {
  let clean = String(value);
  if (sourceRoot) clean = clean.replaceAll(sourceRoot, `/${path.basename(sourceRoot)}`);
  clean = clean
    .replace(/\/Users\/[^/\s"'<>]+(?:\/[^\s"'<>]+)*/g, "[local path removed]")
    .replace(/\/home\/[^/\s"'<>]+(?:\/[^\s"'<>]+)*/g, "[local path removed]")
    .replace(/[A-Za-z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]+)*/g, "[local path removed]");
  for (const pattern of CREDENTIALS) clean = clean.replace(pattern, "[credential redacted]");
  return clean;
}

function sanitize(value, sourceRoot) {
  if (typeof value === "string") return cleanString(value, sourceRoot);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, sourceRoot));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["environment", "request_headers", "credentials"].includes(key))
    .map(([key, item]) => [key, sanitize(item, sourceRoot)]));
}

function publicDemoProjectSequence(project) {
  const match = String(project?.source_project_path || "").match(/^\/R(\d+)_/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exportProject(summary) {
  const stored = await readRecord(summary.project_id);
  if (!stored) throw new Error(`Stored project ${summary.project_id} is missing.`);
  const sourceRoot = stored.source_project?.path || "";
  const projection = await createProjectReportProjection(stored, { generatedAt: stored.analysed_at });
  const directory = path.join(DESTINATION, "projects", stored.project_id);
  const record = sanitize(projection.record, sourceRoot);
  const analytical = sanitize(projection.analyticalLayer, sourceRoot);
  const signals = sanitize(projection.signalsLayer, sourceRoot);
  const history = sanitize(projection.historyLayer, sourceRoot);
  const legacy = (await legacyAuditsForProject(stored.project_id)).map((item) => ({
    ...item,
    report_url: `/demo-data/${VERSION}/legacy-audits/${encodeURIComponent(item.audit_id)}.html`,
  }));
  const diagnostics = sanitize(diagnosticsForRecord(stored, legacy), sourceRoot);
  const reportHtml = cleanString(renderProjectReportHtml({ record, analyticalLayer: analytical, signalsLayer: signals, historyLayer: history, generatedAt: stored.analysed_at }), sourceRoot);

  await fs.mkdir(directory, { recursive: true });
  await Promise.all([
    writeJson(path.join(directory, "record.json"), record),
    writeJson(path.join(directory, "signals.json"), signals),
    writeJson(path.join(directory, "history.json"), history),
    writeJson(path.join(directory, "analytical.json"), analytical),
    writeJson(path.join(directory, "diagnostics.json"), diagnostics),
    fs.writeFile(path.join(directory, "report.html"), reportHtml, "utf8"),
    renderReportPdf(reportHtml).then((pdf) => fs.writeFile(path.join(directory, "report.pdf"), pdf)),
  ]);

  return sanitize({ ...summary, source_project_path: `/${path.basename(sourceRoot)}`, finding_count: signals.finding_count }, sourceRoot);
}

async function main() {
  const summaries = await listProjects();
  if (!summaries.length) throw new Error("No stored demo projects are available to export.");
  await fs.rm(DESTINATION, { recursive: true, force: true });
  await fs.mkdir(DESTINATION, { recursive: true });
  const publicSummaries = [];
  for (const summary of summaries) {
    console.log(`Exporting ${summary.project_id}…`);
    publicSummaries.push(await exportProject(summary));
  }
  publicSummaries.sort((left, right) => publicDemoProjectSequence(left) - publicDemoProjectSequence(right));
  await writeJson(path.join(DESTINATION, "projects.json"), publicSummaries);
  await writeJson(path.join(DESTINATION, "manifest.json"), {
    schema_version: "boveda-public-demo-1",
    application_version: "1.0.2",
    generated_from: "pre-analysed local snapshots",
    project_ids: publicSummaries.map((project) => project.project_id),
  });
  const validation = await validatePublicArtifacts(DESTINATION);
  console.log(`Export complete: ${publicSummaries.length} projects, ${validation.files_scanned} public files validated.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
