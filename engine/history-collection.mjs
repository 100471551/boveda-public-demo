import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const HISTORY_COLLECTION_SCHEMA_VERSION = "boveda-history-collection-0.11.1";
export const MAX_GIT_COMMITS = 300;
export const MAX_GIT_TAGS = 200;
export const MAX_CHANGED_FILES_PER_COMMIT = 60;
export const MAX_MLFLOW_FILES = 600;
const MAX_COMMIT_SUBJECT_CHARS = 500;
const MAX_COMMIT_BODY_CHARS = 4000;

const slash = (value) => value.split(path.sep).join("/");

async function git(root, args, options = {}) {
  return execFile("git", ["-c", `safe.directory=${root}`, ...args], {
    cwd: root,
    maxBuffer: options.maxBuffer || 24 * 1024 * 1024,
  });
}

function changedFiles(value) {
  return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const parts = line.split("\t");
    if (parts.length < 2 || !/^[A-Z][0-9]*$/.test(parts[0])) return [];
    return [{ status: parts[0][0], path: parts.slice(1).join("\t") }];
  });
}

function parseCommits(stdout) {
  return stdout.split("\x1e").map((row) => row.replace(/^\n+/, "")).filter(Boolean).flatMap((row) => {
    const [oid, authoredAt, subject, body, fileBlock = ""] = row.split("\x1f");
    if (!/^[a-f0-9]{40}$/i.test(String(oid || "").trim())) return [];
    const files = changedFiles(fileBlock);
    const fullSubject = String(subject || "").trim() || "Untitled change";
    const fullBody = String(body || "").trim();
    return [{
      oid: oid.trim(),
      authored_at: String(authoredAt || "").trim() || null,
      subject: fullSubject.slice(0, MAX_COMMIT_SUBJECT_CHARS),
      body: fullBody.slice(0, MAX_COMMIT_BODY_CHARS),
      message_truncated: fullSubject.length > MAX_COMMIT_SUBJECT_CHARS || fullBody.length > MAX_COMMIT_BODY_CHARS,
      changed_file_count: files.length,
      changed_files: files.slice(0, MAX_CHANGED_FILES_PER_COMMIT),
      changed_files_truncated: files.length > MAX_CHANGED_FILES_PER_COMMIT,
    }];
  });
}

function parseTags(stdout) {
  return stdout.split("\x1e").map((row) => row.trim()).filter(Boolean).flatMap((row) => {
    const [name, object, dereferenced, createdAt, subject] = row.split("\x1f");
    if (!name || !(dereferenced || object)) return [];
    return [{
      name: name.trim(),
      commit_oid: String(dereferenced || object).trim(),
      created_at: String(createdAt || "").trim() || null,
      subject: String(subject || "").trim().slice(0, MAX_COMMIT_SUBJECT_CHARS),
    }];
  });
}

async function collectGit(root) {
  try {
    const [countResult, branchResult, headResult, logResult, tagResult] = await Promise.all([
      git(root, ["rev-list", "--count", "--all"]),
      git(root, ["branch", "--show-current"]),
      git(root, ["rev-parse", "HEAD"]),
      git(root, ["log", "--all", "--date=iso-strict", `--max-count=${MAX_GIT_COMMITS}`, "--no-renames", "--pretty=format:%x1e%H%x1f%aI%x1f%s%x1f%b%x1f", "--name-status"]),
      git(root, ["for-each-ref", "--sort=-creatordate", `--count=${MAX_GIT_TAGS + 1}`, "--format=%(refname:short)%1f%(objectname)%1f%(*objectname)%1f%(creatordate:iso-strict)%1f%(subject)%1e", "refs/tags"]),
    ]);
    const commits = parseCommits(logResult.stdout);
    const recoveredTags = parseTags(tagResult.stdout);
    const total = Number(countResult.stdout.trim());
    return {
      available: true,
      branch: branchResult.stdout.trim() || "detached",
      head_oid: headResult.stdout.trim(),
      total_commit_count: Number.isFinite(total) ? total : commits.length,
      recovered_commit_count: commits.length,
      commit_limit: MAX_GIT_COMMITS,
      truncated: Number.isFinite(total) ? total > commits.length : commits.length === MAX_GIT_COMMITS,
      commits,
      tag_limit: MAX_GIT_TAGS,
      tags_truncated: recoveredTags.length > MAX_GIT_TAGS,
      tags: recoveredTags.slice(0, MAX_GIT_TAGS),
      limitation: null,
    };
  } catch (error) {
    return {
      available: false,
      branch: null,
      head_oid: null,
      total_commit_count: 0,
      recovered_commit_count: 0,
      commit_limit: MAX_GIT_COMMITS,
      truncated: false,
      commits: [],
      tag_limit: MAX_GIT_TAGS,
      tags_truncated: false,
      tags: [],
      limitation: `Git history could not be collected read-only: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function boundedRead(file) {
  const content = await fs.readFile(file, "utf8");
  return content.slice(0, 64 * 1024);
}

function yamlValue(text, key) {
  return text.match(new RegExp(`^${key}:\\s*([^#\\n]+)`, "mi"))?.[1]?.trim().replace(/^['"]|['"]$/g, "") || null;
}

function epochDate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const milliseconds = number < 1e12 ? number * 1000 : number;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function collectMlflow(root) {
  const mlruns = path.join(root, "mlruns");
  const files = [];
  let truncated = false;
  async function walk(directory, depth) {
    if (depth > 6 || files.length >= MAX_MLFLOW_FILES) { truncated = true; return; }
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= MAX_MLFLOW_FILES) { truncated = true; break; }
      if (entry.isSymbolicLink() || entry.name === ".trash" || entry.name === "artifacts" || entry.name === "outputs") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, depth + 1);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await walk(mlruns, 0);
  const runs = new Map();
  for (const absolute of files) {
    const relative = slash(path.relative(root, absolute));
    const match = relative.match(/^mlruns\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) continue;
    const [, experimentId, runId, suffix] = match;
    const key = `${experimentId}/${runId}`;
    if (!runs.has(key)) runs.set(key, { experiment_id: experimentId, run_id: runId, files: [] });
    runs.get(key).files.push({ absolute, relative, suffix });
  }
  const recovered = [];
  for (const run of runs.values()) {
    const metadataFile = run.files.find((item) => item.suffix === "meta.yaml");
    if (!metadataFile) continue;
    const metadata = await boundedRead(metadataFile.absolute);
    const commitFile = run.files.find((item) => /^tags\/.*git(?:\.|_|-)?commit/i.test(item.suffix));
    const metricFiles = run.files.filter((item) => item.suffix.startsWith("metrics/")).slice(0, 20);
    const metrics = [];
    for (const item of metricFiles) {
      const lines = (await boundedRead(item.absolute)).trim().split("\n").filter(Boolean);
      const parts = lines.at(-1)?.trim().split(/\s+/) || [];
      if (parts.length >= 2 && Number.isFinite(Number(parts[1]))) metrics.push({ name: path.basename(item.suffix), value: parts[1] });
    }
    recovered.push({
      experiment_id: run.experiment_id,
      run_id: run.run_id,
      status: yamlValue(metadata, "status") || "UNKNOWN",
      started_at: epochDate(yamlValue(metadata, "start_time")),
      completed_at: epochDate(yamlValue(metadata, "end_time")),
      commit_ref: commitFile ? (await boundedRead(commitFile.absolute)).trim().split(/\s+/)[0] || null : null,
      metrics,
      source_paths: run.files.map((item) => item.relative).slice(0, 40),
      source_paths_truncated: run.files.length > 40,
    });
  }
  return { available: files.length > 0, recovered_run_count: recovered.length, file_count: files.length, truncated, runs: recovered };
}

export async function collectHistorySources(record) {
  if (!record?.source_project?.path) return {
    schema_version: HISTORY_COLLECTION_SCHEMA_VERSION,
    observed_at: new Date().toISOString(),
    root_available: false,
    git: { available: false, commits: [], tags: [], limitation: "The canonical Project Record does not identify a source project path." },
    mlflow: { available: false, runs: [], recovered_run_count: 0, file_count: 0, truncated: false },
  };
  try {
    const root = await fs.realpath(path.resolve(record.source_project.path));
    const info = await fs.stat(root);
    if (!info.isDirectory()) throw new Error("The recorded source project is not a directory.");
    const [gitHistory, mlflow] = await Promise.all([collectGit(root), collectMlflow(root)]);
    return { schema_version: HISTORY_COLLECTION_SCHEMA_VERSION, observed_at: new Date().toISOString(), root_available: true, git: gitHistory, mlflow };
  } catch (error) {
    return {
      schema_version: HISTORY_COLLECTION_SCHEMA_VERSION,
      observed_at: new Date().toISOString(),
      root_available: false,
      git: { available: false, commits: [], tags: [], limitation: `Historical source collection could not open the recorded project path: ${error instanceof Error ? error.message : String(error)}` },
      mlflow: { available: false, runs: [], recovered_run_count: 0, file_count: 0, truncated: false },
    };
  }
}
