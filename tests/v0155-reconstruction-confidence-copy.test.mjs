import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { collectAnalyticalSources } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { renderReport } from "../engine/report.mjs";
import { buildSignalsLayer } from "../engine/signals.mjs";
import { reconstructionConfidenceExplanation, reconstructionConfidenceLabel } from "../src/reconstruction-display.mjs";

const labels = [
  "Result not established",
  "Result identified",
  "Result evidence found",
  "Result linked to model and target",
  "Evaluation context traced",
  "Main result traced",
  "Reproduction supported",
  "Main result strongly supported",
  "Complete evidence trail",
];

const reconstruction = {
  samples: { evaluation_sample: { state: "established", count: 120, value: "120 records" } },
  data: { period: { state: "established", value: "2020–2022" } },
};

test("all nine confidence states use supervisor-facing labels and ordinary deterministic explanations", () => {
  for (let score = 0; score <= 8; score += 1) {
    const confidence = { score, evidence_score: score, finding_cap: 8 };
    const label = reconstructionConfidenceLabel(confidence);
    const explanation = reconstructionConfidenceExplanation(confidence, reconstruction);
    assert.equal(label, labels[score]);
    assert.ok(explanation.length > 40);
    assert.doesNotMatch(`${label} ${explanation}`, /\bbounded\b|\bcanonical\b|evidence-bound|reconstruction step|denominator identity|\bdependency\b|support step|steps?\s*\d/i);
  }
});

test("an incomplete focal-story projection can avoid naming reproduction inputs that are already established", () => {
  const confidence = { score: 5, derivation: {} };
  const ordinary = reconstructionConfidenceExplanation(confidence, {}, { plainReproductionBoundary: true });
  assert.match(ordinary, /independent inputs needed to reproduce/i);
  assert.doesNotMatch(ordinary, /software setup|data links/i);
  assert.match(reconstructionConfidenceExplanation(confidence, {}), /software setup or data links/i);
});

test("incomplete evaluation wording describes the actual missing sample details", () => {
  const confidence = { score: 4, evidence_score: 4, finding_cap: 8 };
  assert.match(reconstructionConfidenceExplanation(confidence, {
    samples: { evaluation_sample: { state: "not_established", count: null } },
    data: { period: { state: "not_established" } },
  }), /evaluation sample or its size[\s\S]*evaluation period is still missing/i);
  assert.match(reconstructionConfidenceExplanation(confidence, {
    samples: { evaluation_sample: { state: "established", count: 120, value: "120 records" } },
    data: { period: { state: "not_established" } },
  }), /evaluation period is still missing/i);
});

test("Finding caps use an ordinary explanation instead of exposing the internal ladder", () => {
  const confidence = { score: 4, evidence_score: 6, finding_cap: 4 };
  const explanation = reconstructionConfidenceExplanation(confidence, reconstruction);
  assert.match(explanation, /unresolved evidence still limits/i);
  assert.doesNotMatch(explanation, /cap|step|dependency|bounded/i);
});

test("stored R1 keeps its confidence derivation unchanged while receiving the new projection", async () => {
  const record = JSON.parse(await fs.readFile(new URL("../storage/projects/PRJ-1D50CE481C/record.json", import.meta.url), "utf8"));
  const analyticalLayer = buildAnalyticalLayer(record, { sources: await collectAnalyticalSources(record) });
  const layer = buildSignalsLayer(record, { analyticalLayer });
  const confidence = layer.result_confidence;
  assert.equal(layer.finding_breakdown.signals, 6);
  assert.ok(layer.findings.filter((finding) => finding.finding_type === "signal").every((finding) => finding.confidence_impact === null));
  assert.equal(confidence.score, 5);
  assert.equal(confidence.evidence_score, 5);
  assert.equal(confidence.finding_cap, 6);
  assert.equal(confidence.derivation, "deterministic_cumulative_v0.10.1");
  assert.equal(confidence.label, "Sample bounded");
  assert.equal(reconstructionConfidenceLabel(confidence), "Main result traced");
  assert.match(reconstructionConfidenceExplanation(confidence, record.reconstruction), /could trace the main result to the data, model and evaluation sample/i);
  const report = renderReport(record, { analyticalLayer });
  assert.match(report, /Main result traced/);
  assert.doesNotMatch(report, /Sample bounded|Evaluation bounded|Steps? \d|step \d is not met/i);
});

test("the Overview no longer exposes the internal ladder through its confidence meter", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /ladderTitle|confidence\.ladder\.map/);
  assert.match(app, /confidence-meter" aria-hidden="true"/);
});

test("the Overview confidence card adds its presentation-only Result prefix", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(app, /<small><strong>Result:<\/strong> \{reconstructionConfidenceLabel\(confidence\)\}<\/small>/);
});
