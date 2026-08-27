import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argumentsList = process.argv.slice(2);

function option(name, fallback = null) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
}

const manifestPath = path.resolve(option("--manifest", path.join(ROOT, "validation", "v017-corpus.json")));
const engineRoot = path.resolve(option("--engine-root", ROOT));
const phase = option("--phase", "iteration").replace(/[^a-z0-9-]+/gi, "-");
const selectedCases = new Set((option("--cases", "") || "").split(",").map((value) => value.trim()).filter(Boolean));
const live = argumentsList.includes("--live");
const reports = argumentsList.includes("--reports");
const model = process.env.BOVEDA_OPENAI_MODEL || "gpt-5.6-sol";
const runName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${phase}-${live ? "live" : "fallback"}`;
const outputRoot = path.resolve(option("--output-root", path.join(ROOT, "validation", "v017-runs")));
const output = path.join(outputRoot, runName);

if (live && !process.env.OPENAI_API_KEY) {
  const keyFile = process.env.BOVEDA_OPENAI_KEY_FILE;
  if (!keyFile) throw new Error("Set OPENAI_API_KEY or BOVEDA_OPENAI_KEY_FILE before running live validation.");
  const { stdout } = await execFileAsync("textutil", ["-convert", "txt", "-stdout", path.resolve(keyFile)], { maxBuffer: 1_000_000 });
  const match = stdout.match(/sk-[A-Za-z0-9_-]{20,}/);
  if (!match) throw new Error("The local OpenAI credential could not be loaded.");
  process.env.OPENAI_API_KEY = match[0];
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const cases = manifest.cases.filter((item) => !selectedCases.size || selectedCases.has(item.case_id));
if (!cases.length) throw new Error("No corpus cases were selected.");

const auditModule = await import(pathToFileURL(path.join(engineRoot, "engine", "audit.mjs")));
const reportModule = await import(pathToFileURL(path.join(engineRoot, "engine", "report-export.mjs")));
await fs.mkdir(path.join(output, "records"), { recursive: true });
if (reports) await fs.mkdir(path.join(output, "reports"), { recursive: true });

function unresolvedFields(record) {
  const unresolved = [];
  function visit(value, trail = "reconstruction") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${trail}[${index}]`));
    if (value.state && value.state !== "established") {
      unresolved.push({ field: trail, state: value.state, value: value.value ?? value.display ?? value.display_value });
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${trail}.${key}`);
  }
  visit(record.reconstruction);
  return unresolved;
}

function usageFor(record) {
  return record?.diagnostics?.llm?.total_usage || null;
}

function failureLooksLikeProviderAccess(error) {
  const message = String(error?.message || error);
  return /credit|quota|billing|insufficient|rate limit|provider access|authentication|api key/i.test(message);
}

const summaries = [];
let providerAccessStopped = false;
for (const item of cases) {
  if (providerAccessStopped) {
    summaries.push({ case_id: item.case_id, outcome: "NOT_RUN", reason: "provider_access_stopped_after_failure" });
    continue;
  }

  try {
    const record = await auditModule.analyseProject(item.project_path, { persist: false, model, allowFallback: !live });
    const recordPath = path.join(output, "records", `${item.case_id}.json`);
    await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });

    let reportSummary = null;
    let layers = null;
    if (reports) {
      const projection = await reportModule.createProjectReportProjection(record);
      const html = reportModule.renderProjectReportHtml(projection);
      const htmlPath = path.join(output, "reports", `${item.case_id}.html`);
      const pdfPath = path.join(output, "reports", `${item.case_id}.pdf`);
      await fs.writeFile(htmlPath, html, "utf8");
      const pdf = await reportModule.renderReportPdf(html);
      await fs.writeFile(pdfPath, pdf);
      reportSummary = { html_bytes: Buffer.byteLength(html), pdf_bytes: pdf.length, html_path: htmlPath, pdf_path: pdfPath };
      layers = {
        analytical: projection.analyticalLayer,
        signals: projection.signalsLayer,
        history: projection.historyLayer,
      };
      await fs.writeFile(path.join(output, "records", `${item.case_id}-projections.json`), `${JSON.stringify(layers, null, 2)}\n`, { mode: 0o600 });
    }

    const summary = {
      case_id: item.case_id,
      role: item.role,
      project_path: item.project_path,
      outcome: "SUCCEEDED",
      product_version: record.product_version,
      project_id: record.project_id,
      audit_id: record.audit_id,
      generation_mode: record.provider?.generation_mode,
      model: record.provider?.model,
      provider_attempts: record.provider?.attempts || 0,
      provider_usage: usageFor(record),
      validation: record.validation?.status,
      read_only: !record.source_project.modified && record.source_project.content_snapshot_before === record.source_project.content_snapshot_after,
      evidence_items: record.evidence.length,
      inventory: record.inventory,
      identity: record.reconstruction.identity,
      purpose_scope: record.reconstruction.purpose_scope,
      samples: record.reconstruction.samples,
      results_evaluation: record.reconstruction.results_evaluation,
      data: record.reconstruction.data,
      confidence: record.reconstruction.confidence,
      unresolved: unresolvedFields(record),
      projection_counts: layers ? {
        analytical_components: Object.keys(layers.analytical || {}).length,
        check_executions: layers.signals?.checks?.length ?? layers.signals?.executions?.length ?? null,
        findings: layers.signals?.findings?.length ?? null,
        history_events: layers.history?.events?.length ?? null,
      } : null,
      report: reportSummary,
    };
    summaries.push(summary);
    process.stdout.write(`${item.case_id}: SUCCEEDED · ${summary.evidence_items} evidence items · ${summary.provider_usage?.total_tokens ?? 0} tokens\n`);
  } catch (error) {
    const failure = {
      case_id: item.case_id,
      role: item.role,
      project_path: item.project_path,
      outcome: "FAILED",
      error: String(error?.message || error),
      diagnostics: error?.diagnostics || null,
      provider_usage: error?.diagnostics?.total_usage || null,
      provider_access_failure: failureLooksLikeProviderAccess(error),
    };
    await fs.writeFile(path.join(output, "records", `${item.case_id}-failure.json`), `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 });
    summaries.push(failure);
    providerAccessStopped = live && failure.provider_access_failure;
    process.stdout.write(`${item.case_id}: FAILED${providerAccessStopped ? " · remaining provider calls stopped" : ""}\n`);
  }
}

const usageKeys = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
const totalUsage = {};
for (const key of usageKeys) {
  const values = summaries.map((item) => item.provider_usage?.[key]).filter(Number.isFinite);
  totalUsage[key] = values.length ? values.reduce((sum, value) => sum + value, 0) : 0;
}

const result = {
  schema_version: "boveda-v017-corpus-run-1",
  run: runName,
  phase,
  live,
  reports,
  model: live ? model : null,
  engine_root: engineRoot,
  manifest: manifestPath,
  corpus_root: manifest.corpus_root,
  provider_access_stopped: providerAccessStopped,
  provider_usage: totalUsage,
  cases: summaries,
};
await fs.writeFile(path.join(output, "summary.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`Usage: ${JSON.stringify(totalUsage)}\n`);
process.stdout.write(`Results: ${output}\n`);
delete process.env.OPENAI_API_KEY;
