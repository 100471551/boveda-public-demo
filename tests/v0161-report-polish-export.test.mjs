import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { readRecord } from "../engine/persistence.mjs";
import { createProjectReportProjection, renderProjectReportHtml, renderReportPdf } from "../engine/report-export.mjs";
import { buildFindingsPresentation } from "../src/findings-presentation.mjs";
import { reconstructionConfidenceExplanation } from "../src/reconstruction-display.mjs";

const STORED_PROJECT = "PRJ-1D50CE481C";
let record;
let snapshot;
let projection;
let report;

test.before(async () => {
  record = await readRecord(STORED_PROJECT);
  snapshot = structuredClone(record);
  projection = await createProjectReportProjection(record, { generatedAt: "2032-04-05T12:00:00.000Z" });
  report = renderProjectReportHtml(projection);
});

test("Executive Summary keeps reconstruction wording once and gives the whole-record evidence position", () => {
  const executive = report.match(/<section class="report-section major" id="executive-summary">([\s\S]*?)<\/section>/)?.[0] || "";
  const reconstruction = reconstructionConfidenceExplanation(projection.signalsLayer.result_confidence || record.reconstruction.confidence, record.reconstruction);
  assert.equal(executive.split(reconstruction).length - 1, 1);
  const overall = executive.match(/<p class="label">Overall evidence position<\/p><p class="lead">([^<]+)/)?.[1] || "";
  assert.ok(overall);
  assert.doesNotMatch(overall, /Bóveda could trace the main result to the data, model and evaluation sample/);
  const gaps = buildFindingsPresentation(projection.signalsLayer).evidence_gaps.length;
  if (gaps) assert.match(overall, new RegExp(`${gaps} evidence gap`));
  assert.doesNotMatch(executive, /Evidence coverage is partially covered|>Partially covered</i);
});

test("main report copy avoids internal implementation vocabulary", () => {
  const main = report.split('id="technical-appendix"')[0];
  for (const phrase of [
    "canonical Project Record",
    "compatible analytical contexts",
    "compatible modelling contexts",
    "affected metric contexts",
    "affected modelling contexts",
    "scoped execution",
    "canonical identity",
    "dependency identity",
    "persisted",
    "Evidence coverage is partially covered",
  ]) assert.doesNotMatch(main, new RegExp(phrase, "i"));
});

test("Evidence Token references remain complete and visually secondary", () => {
  const links = [...report.matchAll(/href="#(evidence-[^"]+)"/g)].map((match) => match[1]);
  assert.ok(links.length > 0);
  for (const id of new Set(links)) assert.match(report, new RegExp(`id="${id}"`));
  assert.match(report, /\.evidence-links\{[^}]*font-size:9px[^}]*opacity:\.72/);
});

test("print CSS keeps normal appendix text readable and gives wide tables a landscape page", () => {
  assert.match(report, /@page technical-wide\{size:A4 landscape/);
  assert.match(report, /\.technical\{min-width:0;font-size:8pt;line-height:1\.32/);
  assert.doesNotMatch(report, /\.technical\{min-width:0;font-size:6\.6pt/);
  assert.match(report, /\.table-wrap--wide\{page:technical-wide/);
  assert.match(report, /longer material is clearly marked as partial in print/);
});

test("HTML and PDF are rendered from one provider-free projection without changing analytical state", async () => {
  assert.equal(projection.analyticalLayer.object_graph.provider_calls, 0);
  assert.equal(projection.signalsLayer.provider_calls, 0);
  assert.deepEqual(record, snapshot);
  assert.match(report, /Alpha 0\.20\.13/);
  assert.doesNotMatch(report, /<(?:script|link)[^>]+(?:src|href)=["']https?:/i);
  const pdf = await renderReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  const parsed = await pdfParse(pdf);
  assert.match(parsed.text, /Project analysis report/);
  assert.match(parsed.text, /Executive summary/i);
  assert.match(parsed.text, /Technical appendix/i);
  assert.match(parsed.text, /Evidence appendix/i);
});

test("report format menu offers exactly PDF and HTML with accessible non-shifting interaction", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const menu = app.slice(app.indexOf("function ReportDownloadMenu"), app.indexOf("function ProjectMenuDrawer"));
  assert.equal((menu.match(/label: "Download PDF"/g) || []).length, 1);
  assert.equal((menu.match(/label: "Download HTML"/g) || []).length, 1);
  assert.equal((menu.match(/label: "Download (?!PDF|HTML)[^"]+"/g) || []).length, 0);
  assert.match(menu, /report\.pdf/);
  assert.match(menu, /report\.html/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /pointerdown/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /ArrowDown/);
  assert.match(menu, /role="menuitem"/);
  assert.match(css, /\.report-download-menu\s*\{\s*position:\s*relative/);
  assert.doesNotMatch(app, /report-download-menu analytical-selector/);
  assert.match(css, /\.analytical-selector__menu\s*\{[^}]*position:\s*absolute/);
});

test("server exposes one shared HTML projection and a real local PDF projection", async () => {
  const server = await fs.readFile(new URL("../engine/server.mjs", import.meta.url), "utf8");
  const route = server.slice(server.indexOf('app.get(["/api/projects/:id/report"'), server.indexOf('app.post("/api/browse"'));
  assert.match(route, /createProjectReportProjection\(record\)/);
  assert.match(route, /renderProjectReportHtml\(projection\)/);
  assert.match(route, /renderReportPdf\(html\)/);
  assert.doesNotMatch(route, /provider|analyseProject|reanalyse|buildSignalsLayer|buildAnalyticalLayer/);
  assert.doesNotMatch(await fs.readFile(new URL("../engine/client-report.mjs", import.meta.url), "utf8"), /Chelsea|R1_public|PRJ-1D50CE481C/);
});
