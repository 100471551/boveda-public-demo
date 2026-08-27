import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publicDemoRequestUrl, requestBovedaJson } from "../src/demo-api.mjs";
import { DEMO_DATA_VERSION, PUBLIC_DEMO, reportAssetUrl } from "../src/runtime-config.mjs";
import { validatePublicArtifacts } from "../scripts/public-demo-privacy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = path.join(ROOT, "public", "demo-data", DEMO_DATA_VERSION);

test("public runtime fails closed and maps only read endpoints to static assets", async () => {
  assert.equal(PUBLIC_DEMO, true);
  assert.match(publicDemoRequestUrl("/api/projects"), /projects\.json$/);
  assert.match(publicDemoRequestUrl("/api/projects/PRJ-1/analytical"), /PRJ-1\/analytical\.json$/);
  assert.equal(publicDemoRequestUrl("/api/projects/PRJ-1", "DELETE"), null);
  assert.match(reportAssetUrl("PRJ-1", "pdf"), /PRJ-1\/report\.pdf$/);
  await assert.rejects(() => requestBovedaJson("/api/analyse", { method: "POST" }, async () => { throw new Error("network should not be used"); }), (error) => error.code === "PUBLIC_DEMO_READ_ONLY");
});

test("every public project has the complete immutable dashboard bundle", async () => {
  const projects = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "projects.json"), "utf8"));
  assert.ok(projects.length >= 1);
  for (const project of projects) {
    const directory = path.join(DATA_ROOT, "projects", project.project_id);
    for (const file of ["record.json", "signals.json", "history.json", "analytical.json", "diagnostics.json", "report.html", "report.pdf"]) {
      const stats = await fs.stat(path.join(directory, file));
      assert.ok(stats.size > (file.endsWith(".pdf") ? 1024 : 10), `${project.project_id}/${file}`);
    }
  }
});

test("public source and generated assets pass privacy validation", async () => {
  const dataResult = await validatePublicArtifacts(DATA_ROOT);
  assert.equal(dataResult.ok, true);
  const sourceResult = await validatePublicArtifacts(path.join(ROOT, "src"));
  assert.equal(sourceResult.ok, true);
});

test("deployment configuration contains no serverless or analytical backend", async () => {
  const vercel = JSON.parse(await fs.readFile(path.join(ROOT, "vercel.json"), "utf8"));
  assert.equal(vercel.framework, "vite");
  assert.equal(vercel.outputDirectory, "dist");
  assert.equal(vercel.functions, undefined);
  const workflow = await fs.readFile(path.join(ROOT, ".github", "workflows", "deploy-checks.yml"), "utf8");
  assert.match(workflow, /npm run demo:validate/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|vercel deploy/i);
});

test("read-only actions stay explainable instead of becoming unreachable controls", async () => {
  const main = await fs.readFile(path.join(ROOT, "src", "main.jsx"), "utf8");
  assert.match(main, /data-demo-disabled=\{publicDemo \|\| undefined\}/);
  assert.match(main, /function DemoActionNotice/);
  assert.match(main, /showDemoAction\("import"\)/);
  assert.match(main, /showDemoAction\("delete"\)/);
  assert.match(main, /showDemoAction\("reanalyse"\)/);
  assert.doesNotMatch(main, /aria-disabled=\{publicDemo/);
});
