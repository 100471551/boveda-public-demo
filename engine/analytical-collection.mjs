import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MAX_CELL_TEXT = 36_000;
const NOTEBOOK_KIND = "notebook";

function text(value) {
  if (Array.isArray(value)) return value.join("");
  return String(value ?? "");
}

function bounded(value) {
  return text(value).replace(/\u0000/g, "").slice(0, MAX_CELL_TEXT).trim();
}

function headingFrom(source) {
  const match = source.match(/^\s*(#{1,6})\s+(.+?)\s*$/m);
  return match ? { level: match[1].length, label: match[2].replace(/[*_`]/g, "").trim() } : null;
}

function isStructuralHeading(label) {
  return /^(?:\d+(?:\.\d+)*\.?\s*)?(?:import|load|prepare|select|compar|display|label|model tuning|train(?:ing)?[ -]?test|evaluation metric|feature import|export|using\b|for\s+.+(?:classifier|model)|logistic regression|decision tree|random forest|xgboost|lasso|helpers?\b|data processing\b|lift chart|check sensitivity)/i.test(label);
}

function isWorkstreamHeading(label) {
  return !isStructuralHeading(label)
    && /predict|forecast|analysis|model(?:ling)?|benchmark|cluster|intervention|storm|classif|explor|resolution|risk|complaint|prepar|clean/i.test(label);
}

function outputBlocks(output) {
  const blocks = [];
  if (output?.output_type === "error") {
    blocks.push({ type: "error", text: bounded(`${output.ename || "Error"}: ${output.evalue || ""}`) });
  }
  const plain = output?.data?.["text/plain"] ?? output?.text;
  const rendered = bounded(plain);
  if (rendered) blocks.push({ type: "text", text: rendered });
  const images = Object.keys(output?.data || {}).filter((key) => key.startsWith("image/"));
  for (const media_type of images) blocks.push({ type: "image", media_type, text: "Persisted notebook image output" });
  return blocks;
}

export function notebookFragments(raw, evidence) {
  const notebook = JSON.parse(raw);
  const cells = [];
  const headingStack = [];
  let workstream = null;
  for (let index = 0; index < (notebook.cells || []).length; index += 1) {
    const cell = notebook.cells[index];
    const source = bounded(cell.source);
    const heading = cell.cell_type === "markdown" ? headingFrom(source) : null;
    if (heading) {
      headingStack.splice(heading.level - 1);
      headingStack[heading.level - 1] = heading.label;
      if (isWorkstreamHeading(heading.label)) workstream = heading.label;
    }
    const outputs = (cell.outputs || []).flatMap(outputBlocks);
    if (!source && !outputs.length) continue;
    cells.push({
      index,
      type: cell.cell_type || "cell",
      source,
      outputs,
      heading,
      section_path: headingStack.filter(Boolean),
      workstream: workstream || headingStack.find(Boolean) || path.basename(evidence.path, path.extname(evidence.path)),
      locator: `${evidence.path}#cell-${index}`,
      evidence_id: evidence.id,
      execution_count: Number.isInteger(cell.execution_count) ? cell.execution_count : null,
    });
  }
  return {
    evidence_id: evidence.id,
    path: evidence.path,
    kind: NOTEBOOK_KIND,
    cells,
  };
}

function excerptFragments(evidence) {
  const excerpt = bounded(evidence.excerpt);
  if (!excerpt) return null;
  const cells = [];
  const parts = excerpt.split(/\[CODE FOR OUTPUT\]/g).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const [source, ...outputs] = parts[index].split(/\[PERSISTED OUTPUT\]/g);
    cells.push({
      index,
      type: "recovered_excerpt",
      source: bounded(source),
      outputs: outputs.map((item) => ({ type: "text", text: bounded(item) })).filter((item) => item.text),
      heading: null,
      section_path: [],
      workstream: path.basename(evidence.path, path.extname(evidence.path)),
      locator: evidence.path,
      evidence_id: evidence.id,
      execution_count: null,
    });
  }
  return { evidence_id: evidence.id, path: evidence.path, kind: evidence.kind, cells };
}

export async function collectAnalyticalSources(record) {
  const evidence = (record?.evidence || []).filter((item) => item?.id && item?.path && item.path !== ".");
  const root = record?.source_project?.path;
  const sources = [];
  for (const item of evidence) {
    if (item.kind !== NOTEBOOK_KIND) continue;
    let source = null;
    if (root) {
      try {
        const absolute = path.resolve(root, item.path);
        const relative = path.relative(path.resolve(root), absolute);
        if (!relative.startsWith("..") && !path.isAbsolute(relative)) source = notebookFragments(await fs.readFile(absolute, "utf8"), item);
      } catch {}
    }
    sources.push(source || excerptFragments(item));
  }
  const collected = sources.filter(Boolean);
  collected.persisted_artefacts = await collectPersistedArtefacts(root, collected);
  return collected;
}

function referencedPaths(sources) {
  const references = [];
  const pattern = /(?:savefig|to_csv|to_excel|dump|save)\s*\(\s*[rRuUbBfF]*["']([^"']+)["']/g;
  for (const source of sources) for (const cell of source.cells || []) {
    pattern.lastIndex = 0;
    for (const match of cell.source.matchAll(pattern)) references.push({ path: match[1].replaceAll("\\", "/"), cell });
  }
  return references;
}

async function filesUnder(root, current = root, depth = 0, files = []) {
  if (!root || depth > 4) return files;
  let entries = [];
  try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || [".git", "node_modules", ".venv", "dist", "build"].includes(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await filesUnder(root, absolute, depth + 1, files);
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function collectPersistedArtefacts(root, sources) {
  if (!root) return [];
  const files = await filesUnder(root);
  const byBasename = new Map();
  const byStem = new Map();
  for (const file of files) {
    const key = path.basename(file).toLowerCase();
    if (!byBasename.has(key)) byBasename.set(key, []);
    byBasename.get(key).push(file);
    const stem = path.basename(file, path.extname(file)).toLowerCase();
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(file);
  }
  const artefacts = [];
  for (const reference of referencedPaths(sources)) {
    const candidates = [];
    const resolved = path.resolve(root, reference.path);
    const relative = path.relative(path.resolve(root), resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) candidates.push(resolved);
    candidates.push(...(byBasename.get(path.basename(reference.path).toLowerCase()) || []));
    candidates.push(...(byStem.get(path.basename(reference.path, path.extname(reference.path)).toLowerCase()) || []));
    const existing = [...new Set(candidates)].find((candidate) => files.includes(candidate));
    if (!existing) continue;
    const persistedPath = path.relative(root, existing);
    if (artefacts.some((item) => item.path === persistedPath)) continue;
    const bytes = await fs.readFile(existing);
    artefacts.push({
      id: `PA-${crypto.createHash("sha256").update(persistedPath).digest("hex").slice(0, 10).toUpperCase()}`,
      path: persistedPath,
      media_type: path.extname(existing).slice(1).toLowerCase() || "file",
      size_bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      existence: "persisted",
      source_locator: reference.cell.locator,
      evidence_ids: [reference.cell.evidence_id],
      epistemic: "OBSERVED",
    });
  }
  return artefacts;
}

export function analyticalSourcesFromEvidence(evidence = []) {
  return evidence.filter((item) => item?.kind === NOTEBOOK_KIND).map(excerptFragments).filter(Boolean);
}
