import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyseProject } from "../engine/audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "validation", "corpus.json"), "utf8"));
const live = process.argv.includes("--live");
const includeControls = process.argv.includes("--include-controls");
const model = process.env.BOVEDA_OPENAI_MODEL || "gpt-5.6-sol";
const runName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${live ? "live" : "fallback"}`;
const output = path.join(ROOT, "validation", "results", runName);
await fs.mkdir(path.join(output, "records"), { recursive: true });
const activeCaseIds = new Set(manifest.active_development_cases || manifest.cases.map((item) => item.case_id));
const cases = includeControls ? manifest.cases : manifest.cases.filter((item) => activeCaseIds.has(item.case_id));

function completeness(record) {
  const r = record.reconstruction;
  const fields = {
    identity: [r.identity.name, r.identity.description],
    purpose_scope: Object.values(r.purpose_scope),
    samples: Object.values(r.samples),
    results_evaluation: [r.results_evaluation.primary_result, ...r.results_evaluation.material_results, r.results_evaluation.evaluation_design, r.results_evaluation.other_material_result, r.results_evaluation.known_limitation, r.results_evaluation.establishes, r.results_evaluation.does_not_establish],
    data: Object.values(r.data),
  };
  return Object.fromEntries(Object.entries(fields).map(([section, items]) => [section, {
    established: items.filter((item) => item.state === "established").length,
    not_established: items.filter((item) => item.state === "not_established").length,
    execution_required: items.filter((item) => item.state === "execution_required").length,
  }]));
}

function unresolvedFields(record) {
  const output = [];
  function visit(value, trail = "reconstruction") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${trail}[${index}]`));
    if (value.state && value.state !== "established") output.push({ field: trail, state: value.state, value: value.value ?? value.display ?? value.display_value });
    for (const [key, child] of Object.entries(value)) visit(child, `${trail}.${key}`);
  }
  visit(record.reconstruction);
  return output;
}

const summaries = [];
for (const item of cases) {
  let record;
  try {
    record = await analyseProject(item.project_path, { persist: false, model, allowFallback: !live });
  } catch (error) {
    const failure = {
      case_id: item.case_id,
      project_path: item.project_path,
      outcome: "FAILED",
      error: String(error?.message || error),
      diagnostics: error?.diagnostics || null,
    };
    await fs.writeFile(path.join(output, "records", `${item.case_id}-failure.json`), `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 });
    summaries.push(failure);
    console.log(`${item.case_id}: FAILED · diagnostics preserved · no automatic rerun`);
    continue;
  }
  await fs.writeFile(path.join(output, "records", `${item.case_id}.json`), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  const summary = {
    case_id: item.case_id, project_name: record.reconstruction.identity.name.value, audit_id: record.audit_id,
    generation_mode: record.provider.generation_mode, model: record.provider.model, validation: record.validation.status,
    read_only: !record.source_project.modified && record.source_project.content_snapshot_before === record.source_project.content_snapshot_after,
    evidence_items: record.evidence.length, sections: completeness(record),
    unresolved: unresolvedFields(record),
    primary_result: record.reconstruction.results_evaluation.primary_result,
    provider_attempts: record.provider.attempts || 0,
    rejected_candidates: record.provider.rejected_candidates || [],
  };
  summaries.push(summary);
  console.log(`${item.case_id}: ${summary.generation_mode} · ${summary.validation} · ${summary.evidence_items} evidence items`);
}
const result = {
  schema_version: "boveda-v0.9-corpus-results-1",
  run: runName,
  live,
  model: live ? model : null,
  development_scope: includeControls ? "active_and_controls" : "active_only",
  active_development_cases: [...activeCaseIds],
  control_cases: manifest.control_cases || [],
  cases: summaries,
};
await fs.writeFile(path.join(output, "summary.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(`Results: ${output}`);
