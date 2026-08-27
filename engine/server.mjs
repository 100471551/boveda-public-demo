import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { analyseProject } from "./audit.mjs";
import { deleteProject, listProjects, readRecord, reorderProjects, ROOT } from "./persistence.mjs";
import { projectId } from "./contract.mjs";
import { contentSnapshot, projectStaticEvidence } from "./inventory.mjs";
import { sourceMatchesAudit } from "./audit-freshness.mjs";
import { diagnosticsForRecord } from "./diagnostics.mjs";
import { legacyAuditsForProject, legacyReportPath } from "./legacy-audits.mjs";
import { APPLICATION_VERSION } from "./version.mjs";
import { createProjectReportProjection, renderProjectReportHtml, renderReportPdf } from "./report-export.mjs";
import { buildSignalsLayer } from "./signals.mjs";
import { buildHistoryLayer } from "./history.mjs";
import { collectHistorySources } from "./history-collection.mjs";
import { collectAnalyticalSources } from "./analytical-collection.mjs";
import { buildAnalyticalLayer } from "./analytical.mjs";

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json({ limit: "1mb" }));

async function readProjectedRecord(id) {
  const record = await readRecord(id);
  return record ? projectStaticEvidence(record) : null;
}

app.get("/api/health", (_request, response) => response.json({ ok: true, version: APPLICATION_VERSION }));
app.get("/api/projects", async (_request, response, next) => { try { response.json(await listProjects()); } catch (error) { next(error); } });
app.put("/api/projects/order", async (request, response, next) => {
  try { response.json(await reorderProjects(request.body?.project_ids)); }
  catch (error) { if (error.code === "INVALID_PROJECT_ORDER") return response.status(400).json({ error: error.message }); next(error); }
});
app.get("/api/projects/:id", async (request, response, next) => {
  try { const record = await readProjectedRecord(request.params.id); if (!record) return response.status(404).json({ error: "Project not found." }); response.json(record); } catch (error) { next(error); }
});
app.get("/api/projects/:id/signals", async (request, response, next) => {
  try {
    const record = await readProjectedRecord(request.params.id);
    if (!record) return response.status(404).json({ error: "Project not found." });
    const sources = await collectAnalyticalSources(record);
    const analyticalLayer = buildAnalyticalLayer(record, { sources });
    response.json(buildSignalsLayer(record, { analyticalLayer }));
  } catch (error) { next(error); }
});
app.get("/api/projects/:id/history", async (request, response, next) => {
  try {
    const record = await readProjectedRecord(request.params.id);
    if (!record) return response.status(404).json({ error: "Project not found." });
    const analyticalSources = await collectAnalyticalSources(record);
    const analyticalLayer = buildAnalyticalLayer(record, { sources: analyticalSources });
    const signals = buildSignalsLayer(record, { analyticalLayer });
    const sourceCollection = await collectHistorySources(record);
    response.json(buildHistoryLayer(record, { findings: signals.findings, sourceCollection }));
  } catch (error) { next(error); }
});
app.get("/api/projects/:id/analytical", async (request, response, next) => {
  try {
    const record = await readProjectedRecord(request.params.id);
    if (!record) return response.status(404).json({ error: "Project not found." });
    const sources = await collectAnalyticalSources(record);
    response.json(buildAnalyticalLayer(record, { sources }));
  } catch (error) { next(error); }
});
app.get("/api/projects/:id/diagnostics", async (request, response, next) => {
  try {
    const record = await readProjectedRecord(request.params.id);
    if (!record) return response.status(404).json({ error: "Project not found." });
    response.json(diagnosticsForRecord(record, await legacyAuditsForProject(record.project_id)));
  } catch (error) { next(error); }
});
app.get("/api/legacy-audits/:auditId/report", async (request, response, next) => {
  try {
    const report = await legacyReportPath(request.params.auditId);
    if (!report) return response.status(404).send("Legacy audit report not found.");
    response.sendFile(report);
  } catch (error) { next(error); }
});
app.post("/api/analyse", async (request, response, next) => {
  try {
    const selectedPath = request.body?.path;
    if (!selectedPath || typeof selectedPath !== "string") throw new Error("A project directory is required.");
    const resolved = await fs.realpath(path.resolve(selectedPath));
    const existing = await readRecord(projectId(resolved));
    if (existing) {
      const currentSnapshot = await contentSnapshot(resolved);
      if (sourceMatchesAudit(existing, currentSnapshot)) {
        response.setHeader("X-Boveda-Audit", "preserved");
        return response.json(existing);
      }
    }
    response.status(201).json(await analyseProject(resolved));
  } catch (error) { next(error); }
});
app.post("/api/projects/:id/reanalyse", async (request, response, next) => {
  try {
    const current = await readRecord(request.params.id);
    if (!current) return response.status(404).json({ error: "Project not found." });
    response.json(await analyseProject(current.source_project.path));
  } catch (error) { next(error); }
});
app.delete("/api/projects/:id", async (request, response, next) => { try { await deleteProject(request.params.id); response.status(204).end(); } catch (error) { next(error); } });
function reportFilename(record, extension) {
  const name = record.reconstruction.identity.name.value || "project";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const audit = String(record.audit_id || "report").replace(/[^a-z0-9-]+/gi, "-");
  return `boveda-${slug}-${audit}.${extension}`;
}

app.get(["/api/projects/:id/report", "/api/projects/:id/report.html"], async (request, response, next) => {
  try {
    const record = await readProjectedRecord(request.params.id);
    if (!record) return response.status(404).send("Project not found.");
    const projection = await createProjectReportProjection(record);
    const html = renderProjectReportHtml(projection);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${reportFilename(record, "html")}"`);
    response.send(html);
  } catch (error) { next(error); }
});
app.get("/api/projects/:id/report.pdf", async (request, response, next) => {
  try {
    const record = await readProjectedRecord(request.params.id);
    if (!record) return response.status(404).send("Project not found.");
    const projection = await createProjectReportProjection(record);
    const html = renderProjectReportHtml(projection);
    const pdf = await renderReportPdf(html);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${reportFilename(record, "pdf")}"`);
    response.send(pdf);
  } catch (error) { next(error); }
});
app.post("/api/browse", async (_request, response, next) => {
  try {
    if (process.platform !== "darwin") return response.status(501).json({ error: "Native directory browsing is available on macOS only." });
    const script = 'POSIX path of (choose folder with prompt "Select a local ML or AI project")';
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 120000 });
    response.json({ path: stdout.trim().replace(/\/$/, "") });
  } catch (error) {
    if (/User canceled/.test(error.stderr || error.message)) return response.status(400).json({ error: "Directory selection cancelled." });
    next(error);
  }
});

app.use(express.static(path.join(ROOT, "dist")));
app.get("/{*path}", (_request, response) => response.sendFile(path.join(ROOT, "dist", "index.html")));
app.use((error, _request, response, _next) => {
  const safe = String(error?.message || "Unexpected error").replace(/sk-[A-Za-z0-9_-]+/g, "[credential redacted]");
  response.status(500).json({ error: safe });
});

const port = Number(process.env.BOVEDA_PORT || 4310);
app.listen(port, "127.0.0.1", () => console.log(`Bóveda API listening at http://127.0.0.1:${port}`));
