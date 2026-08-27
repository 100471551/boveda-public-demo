import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSupervisorProjectTitleForRecord } from "../src/project-display.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORAGE = path.join(ROOT, "storage");
const PROJECTS = path.join(STORAGE, "projects");
const REGISTRY = path.join(STORAGE, "registry.json");
const PRESERVED = path.join(ROOT, "preserved-audits", "v0.9.3");
const PRESERVED_MARKER = ".v0.9.3-audits-imported.json";
let preservedImport;

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, file);
}

function summaryFor(record) {
  return {
    project_id: record.project_id,
    audit_id: record.audit_id,
    name: record.reconstruction?.identity?.name?.value,
    analysed_at: record.analysed_at,
    generation_mode: record.provider?.generation_mode,
  };
}

function definedSummaryFor(record) {
  return Object.fromEntries(Object.entries(summaryFor(record)).filter(([, value]) => value !== undefined));
}

async function storedRecords(storage) {
  const projectsPath = path.join(storage, "projects");
  let entries;
  try {
    entries = await fs.readdir(projectsPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const record = await readJson(path.join(projectsPath, entry.name, "record.json"), null);
    if (!record || record.project_id !== entry.name) continue;
    records.push(record);
  }
  return records;
}

export async function reconcileRegistry({ storage = STORAGE } = {}) {
  const registryPath = path.join(storage, "registry.json");
  const registry = await readJson(registryPath, { schema_version: "boveda-registry-0.9.0", projects: [] });
  const recordsById = new Map((await storedRecords(storage)).map((record) => [record.project_id, record]));
  const existingIds = new Set(registry.projects.map((summary) => summary.project_id));
  const projects = registry.projects
    .filter((summary) => recordsById.has(summary.project_id))
    .map((summary) => ({ ...summary, ...definedSummaryFor(recordsById.get(summary.project_id)) }));
  const recovered = [...recordsById.values()]
    .filter((record) => !existingIds.has(record.project_id))
    .sort((a, b) => String(a.analysed_at || "").localeCompare(String(b.analysed_at || "")) || String(a.project_id).localeCompare(String(b.project_id)))
    .map(definedSummaryFor);
  projects.push(...recovered);
  const reconciled = { ...registry, projects };

  if (JSON.stringify(reconciled) !== JSON.stringify(registry)) await atomicWrite(registryPath, reconciled);
  return reconciled;
}

export async function importPreservedAudits({ storage = STORAGE, preserved = PRESERVED } = {}) {
  const marker = path.join(storage, PRESERVED_MARKER);
  if (await readJson(marker, null)) return { imported: 0, skipped: true };

  const manifest = await readJson(path.join(preserved, "manifest.json"), null);
  if (!manifest) return { imported: 0, skipped: true };

  const projectsPath = path.join(storage, "projects");
  const registryPath = path.join(storage, "registry.json");
  const registry = await readJson(registryPath, { schema_version: "boveda-registry-0.9.0", projects: [] });
  let imported = 0;

  for (const relative of manifest.records) {
    const source = path.join(preserved, relative);
    const record = await readJson(source, null);
    if (!record) continue;
    const destination = path.join(projectsPath, record.project_id, "record.json");
    try {
      await fs.access(destination);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
      imported += 1;
    }
    if (!registry.projects.some((item) => item.project_id === record.project_id)) registry.projects.push(summaryFor(record));
  }

  await atomicWrite(registryPath, registry);
  await atomicWrite(marker, {
    source_release: manifest.source_release,
    migration: manifest.migration,
    imported_project_ids: registry.projects.map((item) => item.project_id),
  });
  return { imported, skipped: false };
}

async function ensurePreservedAudits() {
  preservedImport ||= importPreservedAudits();
  return preservedImport;
}

export async function listProjects({ storage = STORAGE } = {}) {
  if (storage === STORAGE) await ensurePreservedAudits();
  const registry = await reconcileRegistry({ storage });
  return Promise.all(registry.projects.map(async (summary) => {
    const record = await readJson(path.join(storage, "projects", summary.project_id, "record.json"), null);
    return {
      ...summary,
      supervisor_project_title: record ? canonicalSupervisorProjectTitleForRecord(record) : summary.name,
      source_project_path: record?.source_project?.path || null,
      identity_name: record?.reconstruction?.identity?.name || null,
      project_purpose: record?.reconstruction?.purpose_scope?.purpose?.state === "established"
        ? record.reconstruction.purpose_scope.purpose.value
        : null,
      primary_task_target: record?.reconstruction?.results_evaluation?.primary_result?.state === "established"
        ? record.reconstruction.results_evaluation.primary_result.task_target
        : null,
      analytical_task: record?.reconstruction?.purpose_scope?.task?.state === "established"
        ? record.reconstruction.purpose_scope.task.value
        : null,
    };
  }));
}

export async function readRecord(id) {
  await ensurePreservedAudits();
  return readJson(path.join(PROJECTS, id, "record.json"), null);
}

export async function saveRecord(record, { storage = STORAGE } = {}) {
  await atomicWrite(path.join(storage, "projects", record.project_id, "record.json"), record);
  const registryPath = path.join(storage, "registry.json");
  const registry = await readJson(registryPath, { schema_version: "boveda-registry-0.9.0", projects: [] });
  const summary = summaryFor(record);
  const existingIndex = registry.projects.findIndex((item) => item.project_id === record.project_id);
  if (existingIndex >= 0) registry.projects[existingIndex] = summary;
  else registry.projects.push(summary);
  await atomicWrite(registryPath, registry);
  return record;
}

export async function reorderProjects(projectIds, { storage = STORAGE } = {}) {
  const registryPath = path.join(storage, "registry.json");
  const registry = await reconcileRegistry({ storage });
  const requested = Array.isArray(projectIds) ? projectIds : [];
  const currentIds = registry.projects.map((project) => project.project_id);
  const requestedIds = new Set(requested);
  const hasExactMembership = requested.length === currentIds.length
    && requestedIds.size === requested.length
    && currentIds.every((projectId) => requestedIds.has(projectId));

  if (!hasExactMembership) {
    const error = new Error("Project order must contain every current project exactly once.");
    error.code = "INVALID_PROJECT_ORDER";
    throw error;
  }

  const projectsById = new Map(registry.projects.map((project) => [project.project_id, project]));
  const reordered = { ...registry, projects: requested.map((projectId) => projectsById.get(projectId)) };
  await atomicWrite(registryPath, reordered);
  return reordered.projects;
}

export async function deleteProject(id) {
  await fs.rm(path.join(PROJECTS, id), { recursive: true, force: true });
  const registry = await readJson(REGISTRY, { schema_version: "boveda-registry-0.9.0", projects: [] });
  registry.projects = registry.projects.filter((item) => item.project_id !== id);
  await atomicWrite(REGISTRY, registry);
}

export { ROOT };
