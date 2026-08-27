import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SECRET_PATTERNS = [
  { label: "OpenAI-style credential", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: "GitHub credential", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { label: "Google API credential", pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/g },
  { label: "Slack credential", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { label: "macOS user path", pattern: /\/Users\/[^/\s"'<>]+\//g },
  { label: "Linux user path", pattern: /\/home\/[^/\s"'<>]+\//g },
  { label: "Windows user path", pattern: /[A-Za-z]:\\Users\\[^\\\s"'<>]+\\/g },
];

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".jsx", ".json", ".map", ".md", ".mjs", ".svg", ".txt"]);

async function filesWithin(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesWithin(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export async function validatePublicArtifacts(root) {
  const failures = [];
  for (const file of await filesWithin(root)) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const text = await fs.readFile(file, "utf8");
    for (const { label, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) failures.push({ file: path.relative(root, file), label, sample: match[0].slice(0, 80) });
    }
  }
  if (failures.length) {
    const error = new Error(`Public artefact privacy validation failed:\n${failures.map((item) => `- ${item.file}: ${item.label}`).join("\n")}`);
    error.failures = failures;
    throw error;
  }
  return { ok: true, files_scanned: (await filesWithin(root)).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const root = path.resolve(process.argv[2] || "public/demo-data/v1.0.2");
  validatePublicArtifacts(root).then((result) => console.log(`Privacy validation passed (${result.files_scanned} files).`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
