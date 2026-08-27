import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
if (!process.env.OPENAI_API_KEY) {
  const keyFile = process.env.BOVEDA_OPENAI_KEY_FILE;
  if (!keyFile) throw new Error("Set OPENAI_API_KEY or BOVEDA_OPENAI_KEY_FILE before running live validation.");
  const { stdout } = await execFileAsync("textutil", ["-convert", "txt", "-stdout", path.resolve(keyFile)], { maxBuffer: 1_000_000 });
  const match = stdout.match(/sk-[A-Za-z0-9_-]{20,}/);
  if (!match) throw new Error("The local OpenAI credential could not be loaded.");
  process.env.OPENAI_API_KEY = match[0];
}
process.env.BOVEDA_OPENAI_MODEL ||= "gpt-5.6-sol";
process.argv.push("--live");
try { await import("./validate-corpus.mjs"); }
finally { delete process.env.OPENAI_API_KEY; }
