import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { collectAnalyticalSources } from "./analytical-collection.mjs";
import { buildAnalyticalLayer } from "./analytical.mjs";
import { collectHistorySources } from "./history-collection.mjs";
import { buildHistoryLayer } from "./history.mjs";
import { renderReport } from "./report.mjs";
import { buildSignalsLayer } from "./signals.mjs";
import { projectStaticEvidence } from "./inventory.mjs";

const CHROMIUM_CANDIDATES = [
  process.env.BOVEDA_CHROMIUM_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export async function createProjectReportProjection(record, { generatedAt = new Date().toISOString() } = {}) {
  record = await projectStaticEvidence(record);
  const analyticalLayer = buildAnalyticalLayer(record, { sources: await collectAnalyticalSources(record) });
  const signalsLayer = buildSignalsLayer(record, { analyticalLayer });
  const historyLayer = buildHistoryLayer(record, {
    findings: signalsLayer.findings,
    sourceCollection: await collectHistorySources(record),
  });
  return { record, analyticalLayer, signalsLayer, historyLayer, generatedAt };
}

export function renderProjectReportHtml(projection) {
  return renderReport(projection.record, projection);
}

async function chromiumExecutable(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : CHROMIUM_CANDIDATES;
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("A local Chromium-based browser is required to render the report PDF.");
}

function runChromium(executable, args, timeoutMs, pdfPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "ignore", detached: true });
    let settled = false;
    let lastSize = 0;
    let stableChecks = 0;
    const stopProcessGroup = () => {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(outputCheck);
      stopProcessGroup();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      finish(new Error("PDF rendering exceeded the local browser time limit."));
    }, timeoutMs);
    const outputCheck = setInterval(async () => {
      try {
        const size = (await fs.stat(pdfPath)).size;
        stableChecks = size > 1024 && size === lastSize ? stableChecks + 1 : 0;
        lastSize = size;
        if (stableChecks >= 5) finish();
      } catch {}
    }, 120);
    child.once("error", (error) => {
      finish(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      if (code === 0) finish();
      else finish(new Error(`Local PDF rendering failed (${signal || `exit ${code}`}).`));
    });
  });
}

export async function renderReportPdf(html, { chromiumPath, timeoutMs = 120_000 } = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-report-pdf-"));
  const htmlPath = path.join(temporary, "report.html");
  const pdfPath = path.join(temporary, "report.pdf");
  try {
    await fs.writeFile(htmlPath, html, "utf8");
    const executable = await chromiumExecutable(chromiumPath);
    await runChromium(executable, [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-pdf-header-footer",
      `--user-data-dir=${path.join(temporary, "browser-profile")}`,
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], timeoutMs, pdfPath);
    const pdf = await fs.readFile(pdfPath);
    if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Local PDF rendering did not produce a valid PDF document.");
    return pdf;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
