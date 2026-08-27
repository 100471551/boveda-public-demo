import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { buildSignalsLayer } from "../engine/signals.mjs";
import { renderReport } from "../engine/report.mjs";
import {
  displayStateLabel,
  displayReconstructionText,
  fieldMissingLabel,
  projectDescriptionField,
  reconstructionConfidenceExplanation,
  reconstructionConfidenceLabel,
  sampleMissingLabel,
} from "../src/reconstruction-display.mjs";

async function preserved(id) {
  return JSON.parse(await fs.readFile(new URL(`../preserved-audits/v0.9.2/records/${id}.json`, import.meta.url), "utf8"));
}

test("v0.10.2 reconstruction language is display-only and leaves coverage labels unchanged", () => {
  assert.equal(displayStateLabel("Established"), "Reconstructed");
  assert.equal(displayStateLabel("Partially established"), "Partially reconstructed");
  assert.equal(displayStateLabel("Not established"), "Missing information");
  assert.equal(displayStateLabel("Not assessed"), "Not assessed");
  assert.equal(displayStateLabel("Sufficiently covered"), "Sufficiently covered");
  assert.equal(displayStateLabel({ label: "Material limitation", state_reason_ids: ["EGAP-123"] }), "Material information gap");
  assert.equal(displayReconstructionText("The starting date is not established."), "The starting date is missing.");
});

test("missing sample wording names the missing property without erasing reconstructed values", async () => {
  const reconstruction = (await preserved("R3")).reconstruction;
  assert.equal(sampleMissingLabel("model_sample", reconstruction.samples.model_sample, reconstruction), "Model sample size missing");
  assert.equal(sampleMissingLabel("evaluation_sample", reconstruction.samples.evaluation_sample, reconstruction), "Evaluation sample size missing");

  const reconstructedWithoutCount = { state: "established", display: "More than 16,000,000 rows", count: null, evidence_ids: ["E-1"] };
  assert.equal(sampleMissingLabel("source_data", reconstructedWithoutCount, reconstruction), "More than 16,000,000 rows");
  assert.equal(fieldMissingLabel(reconstruction.data.period, "field-period", reconstruction), reconstruction.data.period.value);
});

test("the compact project description composes existing reconstructed fields offline", async () => {
  const record = await preserved("R1");
  const before = JSON.stringify(record);
  const description = projectDescriptionField(record.reconstruction);
  assert.match(description.value, /Machine-learning project/);
  assert.match(description.value, /Predict housing-related public-health hazards/);
  assert.match(description.value, /relevant scope is/);
  assert.match(description.value, /intended use is/);
  assert.doesNotMatch(description.value, /…/);
  assert.equal(description.epistemic, "DERIVED");
  assert.ok(description.evidence_ids.length >= 2);
  assert.equal(JSON.stringify(record), before);
});

test("reconstruction-confidence copy is precise while score and derivation stay deterministic", async () => {
  const record = await preserved("R2");
  const before = JSON.stringify(record);
  const confidence = buildSignalsLayer(record).result_confidence;
  assert.equal(confidence.score, 4);
  assert.equal(confidence.derivation, "deterministic_cumulative_v0.10.1");
  assert.equal(reconstructionConfidenceLabel(confidence), "Evaluation context traced");
  assert.match(reconstructionConfidenceExplanation(confidence, record.reconstruction), /evaluation period is (?:still )?missing/i);
  assert.doesNotMatch(reconstructionConfidenceExplanation(confidence, record.reconstruction), /not established|bounded|step\s*\d/i);
  assert.equal(JSON.stringify(record), before);
});

test("downloaded report keeps canonical Findings, evidence trails, and supervisor-facing reconstruction wording", async () => {
  const record = await preserved("R3");
  const before = JSON.stringify(record);
  const report = renderReport(record);
  const layer = buildSignalsLayer(record);
  assert.match(report, /How completely Bóveda reconstructed the project/);
  assert.match(report, /What Bóveda found/);
  assert.match(report, /Where the record is incomplete/);
  assert.match(report, /Evidence appendix/);
  assert.match(report, new RegExp(layer.findings[0].finding_id));
  assert.equal((report.match(/class="finding (?:signal|gap)"/g) || []).length, layer.finding_count);
  assert.doesNotMatch(report.slice(0, report.indexOf("Technical appendix")), /Steps?\s+\d|step\s+\d|Sample bounded|Evaluation bounded/i);
  assert.equal(JSON.stringify(record), before);
});

test("v0.10.2 layout refinements are explicit in the UI source", async () => {
  const [app, view, css] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /project-directory-badge[\s\S]*record-title-actions[\s\S]*Reanalyse_Top[\s\S]*ReportDownloadMenu/);
  assert.match(app, /function ReportDownloadMenu[\s\S]*Download_Top/);
  assert.match(app, /function ProjectIcon/);
  assert.match(app, /Reconstruction confidence/);
  assert.doesNotMatch(app, />Result confidence</);
  assert.doesNotMatch(view, /Also affects → Finding/);
  assert.match(view, /\{finding\.name\}/);
  assert.doesNotMatch(view, /Evidence Gap · \{finding\.name\}/);
  assert.match(css, /\.status-dot > span \{[^}]*background: var\(--status-colour\);[^}]*\}/);
  assert.doesNotMatch(css.match(/\.status-dot > span \{[^}]*\}/)?.[0] || "", /box-shadow|border:/);
  assert.match(css, /\.data-table dt \{[^}]*font-weight: 500/);
  assert.match(css, /\.finding-reference--evidence_gap \{[^}]*#ffe6de[^}]*border-left/);
  assert.match(css, /\.check-summary--insufficient-evidence > span:first-child \{[^}]*#8c8c8c/);
});
