import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import { CHECK_RESULT_LABELS, friendlyCheckResult, HELP_COPY } from "../src/communication-copy.mjs";
import { evaluationStandoutSummary, featureStandoutSummary, modelComparisonStandoutSummary } from "../src/analytical-presentation.mjs";
import { signalSeverity } from "../src/findings-presentation.mjs";
import { GRAPH_CHECK_RESULTS } from "../engine/graph-signals.mjs";
import { SUPERVISOR_ACCESSIBILITY_CONTRACT } from "../engine/reconstruct.mjs";

test("the reusable Help control uses the exact Figma asset and accessible non-shifting interaction", async () => {
  const [component, css, asset] = await Promise.all([
    fs.readFile(new URL("../src/help-popover.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/ui/Help.svg", import.meta.url)),
  ]);
  assert.equal(crypto.createHash("sha256").update(asset).digest("hex"), "6ea11bab9a3c2612e137bcb730bdcb43f9c50c0485ce3cc9cd99850ee51bf6fc");
  assert.match(component, /aria-expanded=\{open\}/);
  assert.match(component, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(component, /onBlur=/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /pointerdown/);
  assert.match(css, /\.help-popover[^}]*width:\s*24px[^}]*height:\s*24px/s);
  assert.match(css, /\.help-popover__content[^}]*position:\s*absolute/s);
});

test("specified Overview areas receive contextual Help while Purpose and lineage intentionally do not", async () => {
  const [main, analytical, report, standoutIcon] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../engine/client-report.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/ui/What_Stands_Out.svg", import.meta.url)),
  ]);
  for (const key of ["bestRecordedResult", "heroDataPopulations", "reconstructionConfidence", "resultsEvaluation", "dataPopulations"]) assert.match(main, new RegExp(`HELP_COPY\\.${key}`));
  for (const key of ["featureEvidence", "modelComparison", "evaluationBehaviour", "missingData"]) assert.match(analytical, new RegExp(`HELP_COPY\\.${key}`));
  assert.doesNotMatch(main, /HELP_COPY\.purposeScope/);
  assert.doesNotMatch(analytical, /HELP_COPY\.dataLineage/);
  assert.doesNotMatch(main, /primary-card__metric[^\n]*EvidenceButton/);
  assert.doesNotMatch(analytical, /How to read this/);
  assert.match(analytical, /What stands out/);
  assert.match(analytical, /src="\/ui\/What_Stands_Out\.svg"/);
  assert.equal(crypto.createHash("sha256").update(standoutIcon).digest("hex"), "e14b9f44f59dd69e9c166e02ff7777642cfa101f81d69b3a335e938d3ff50ade");
  assert.match(report, /Best recorded result/);
  assert.doesNotMatch(report, /Best final result/);
});

test("static Help copy is direct and keeps reconstruction confidence semantically bounded", () => {
  assert.match(HELP_COPY.bestRecordedResult, /not necessarily the model formally selected/i);
  assert.match(HELP_COPY.featureEvidence, /does not show cause and effect/i);
  assert.match(HELP_COPY.reconstructionConfidence, /trace the main evaluation result/i);
  assert.match(HELP_COPY.reconstructionConfidence, /important applicable analytical areas/i);
  assert.doesNotMatch(HELP_COPY.reconstructionConfidence, /model quality|project quality|governance|compliance|performance/i);
});

test("feature summaries follow the currently displayed runtime context without causal language", () => {
  const first = [
    { value: .41, display_label: "Rainfall history", target_name: "Reservoir demand", method: "Alder" },
    { value: .31, display_label: "Season", target_name: "Reservoir demand", method: "Alder" },
  ];
  const second = [
    { value: .56, display_label: "Tide height", target_name: "Marsh recovery", method: "Willow" },
    { value: .22, display_label: "Salinity", target_name: "Marsh recovery", method: "Willow" },
  ];
  assert.equal(featureStandoutSummary(first), "For Reservoir demand, the displayed Alder model relies most on Rainfall history (0.41) and Season (0.31). These are the two highest recorded importance values in this displayed context; the ranking describes model reliance, not whether either input drives the outcome.");
  assert.equal(featureStandoutSummary(second), "For Marsh recovery, the displayed Willow model relies most on Tide height (0.56) and Salinity (0.22). These are the two highest recorded importance values in this displayed context; the ranking describes model reliance, not whether either input drives the outcome.");
  assert.doesNotMatch(featureStandoutSummary(first), /cause|causal|determine/i);
});

function comparison(results) {
  return {
    display_label: "Wetland recovery",
    methods: ["Alder", "Birch"],
    metrics: [
      { key: "accuracy", label: "Accuracy", direction: "higher" },
      { key: "error", label: "Error", direction: "lower" },
    ],
    results,
  };
}

test("model-comparison summaries respect direction, missing values, and ties", () => {
  const split = comparison([
    { method: "Alder", metric: "accuracy", value: .82 }, { method: "Birch", metric: "accuracy", value: .79 },
    { method: "Alder", metric: "error", value: .24 }, { method: "Birch", metric: "error", value: .18 },
  ]);
  assert.equal(modelComparisonStandoutSummary(split), "Alder records the strongest Accuracy (0.82), while Birch leads on Error (0.18). No single model leads across every available metric, and the rows should be interpreted separately because they measure different aspects of performance.");

  const tied = comparison([
    { method: "Alder", metric: "accuracy", value: .8 }, { method: "Birch", metric: "accuracy", value: .8 },
    { method: "Alder", metric: "error", value: .2 }, { method: "Birch", metric: "error", value: .3 },
  ]);
  assert.match(modelComparisonStandoutSummary(tied), /share the strongest recorded Accuracy/);

  const missing = comparison([{ method: "Alder", metric: "accuracy", value: .8 }]);
  assert.match(modelComparisonStandoutSummary(missing), /do not contain enough/);
});

test("evaluation summaries require resolved orientation and stay inside the displayed sample", () => {
  const diagnostic = {
    type: "confusion_matrix",
    display_label: "Flood warning",
    method: "Cedar",
    orientation: { rows: "actual", columns: "predicted" },
    tn: 71,
    fp: 9,
    fn: 6,
    tp: 14,
  };
  assert.equal(evaluationStandoutSummary(diagnostic), "For Flood warning, Cedar correctly identifies 14 of 20 positive cases and misses 6. It also correctly excludes 71 of 80 negative cases while flagging 9 negatives as positive, describing the full error balance in this displayed evaluation sample.");
  assert.equal(evaluationStandoutSummary({ ...diagnostic, orientation: null }), null);
});

test("Signal severity reuses deterministic materiality and never applies to Evidence Gaps", () => {
  const signal = { finding_type: "signal", materiality: { level: "medium" }, presentation: { title: "First wording" } };
  assert.equal(signalSeverity(signal), "Medium");
  assert.equal(signalSeverity({ ...signal, presentation: { title: "Changed wording" } }), "Medium");
  assert.equal(signalSeverity({ finding_type: "evidence_gap", materiality: { level: "high" } }), null);
});

test("Signal cards expose deterministic severity classes for risk-sensitive borders", async () => {
  const [view, css] = await Promise.all([
    fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(view, /supervisor-finding--severity-\$\{item\.severity\.toLowerCase\(\)\}/);
  for (const level of ["low", "medium", "high", "critical"]) assert.match(css, new RegExp(`supervisor-finding--severity-${level}`));
  assert.match(css, /supervisor-finding--signal \.supervisor-finding__scopes span[^}]*var\(--signal-risk-accent/s);
  assert.doesNotMatch(view, /HelpPopover label="Severity"/);
  assert.match(css, /supervisor-finding--evidence_gap::before[^}]*var\(--v15-gap\)/s);
});

test("hero population stages are layered over a full rounded source track", async () => {
  const [main, css] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(main, /hero-population-strip__source" \/>/);
  assert.match(main, /hero-population-strip__model" style=\{\{ width: percentage\(model\) \}\}/);
  assert.match(main, /hero-population-strip__evaluation" style=\{\{ width: percentage\(evaluation\) \}\}/);
  assert.match(css, /\.hero-population-strip i[^}]*position:\s*absolute[^}]*border-radius:\s*999px/s);
  assert.match(css, /\.hero-population-strip__source[^}]*left:\s*0/s);
});

test("Best recorded result uses a two-decimal hero representation without changing the raw value", async () => {
  const main = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /Number\.isFinite\(primaryMetricRatio\)[\s\S]*heroMetricFormatter\.format\(primaryMetricRatio\)/);
  assert.doesNotMatch(main, /style:\s*["']percent["']/);
  assert.match(main, /minimumFractionDigits:\s*2/);
  assert.match(main, /maximumFractionDigits:\s*2/);
});

test("Findings summary and section headings use the exact Figma section icons", async () => {
  const [view, css, signalsIcon, gapsIcon, checksIcon] = await Promise.all([
    fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/ui/Findings_Signals.svg", import.meta.url)),
    fs.readFile(new URL("../public/ui/Findings_Evidence_Gaps.svg", import.meta.url)),
    fs.readFile(new URL("../public/ui/Findings_Checks.svg", import.meta.url)),
  ]);
  assert.equal(crypto.createHash("sha256").update(signalsIcon).digest("hex"), "b894aa3f920128e24afbf455ecb34b3f3380ef2dadf18f32369881ab71bf001d");
  assert.equal(crypto.createHash("sha256").update(gapsIcon).digest("hex"), "44f83166ec9f9306a5f883bc01acf5c0efd90b9608e91228cf858a108befe911");
  assert.equal(crypto.createHash("sha256").update(checksIcon).digest("hex"), "a1d7390e1f6fdb24822eb038891ce62c612bd618409263f58199bfc3335ea5c3");
  for (const asset of ["Findings_Signals.svg", "Findings_Evidence_Gaps.svg", "Findings_Checks.svg"]) assert.match(view, new RegExp(asset.replace(".", "\\.")));
  assert.match(view, /Bóveda had enough evidence to check these conditions, and the deterministic conditions were present\./);
  assert.match(css, /signals-summary-metrics div \+ div::before[^}]*height:\s*56px/s);
  assert.match(css, /finding-group__heading p[^}]*font-size:\s*13px/s);
  assert.match(css, /checks-performed > summary small[^}]*font-size:\s*13px/s);
});

test("Findings headings align their icon, title and explanation while Evaluation keeps a deeper standout gap", async () => {
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.finding-group__heading[^}]*align-items:\s*center/s);
  assert.match(css, /checks-performed > summary > span[^}]*display:\s*flex[^}]*align-items:\s*center/s);
  assert.match(css, /evaluation-behaviour::before[^}]*height:\s*265px/s);
  assert.match(css, /evaluation-behaviour::after[^}]*top:\s*400px/s);
  assert.match(css, /evaluation-behaviour \.diagnostic-item:nth-child\(2\)[\s\S]*top:\s*275px/s);
});

test("friendly check labels leave all four canonical internal states unchanged", () => {
  assert.deepEqual(CHECK_RESULT_LABELS, {
    "SIGNAL PRESENT": "Condition found",
    "NO SIGNAL DETECTED": "Not detected",
    "NOT APPLICABLE": "Not applicable",
    "INSUFFICIENT EVIDENCE": "Not enough evidence",
  });
  assert.equal(friendlyCheckResult(GRAPH_CHECK_RESULTS.PRESENT), "Condition found");
  assert.deepEqual(new Set(Object.values(GRAPH_CHECK_RESULTS)), new Set(Object.keys(CHECK_RESULT_LABELS)));
});

test("reconstruction prompts add ordinary-language guidance without relaxing evidence boundaries", () => {
  assert.match(SUPERVISOR_ACCESSIBILITY_CONTRACT, /may not know machine-learning terminology/);
  assert.match(SUPERVISOR_ACCESSIBILITY_CONTRACT, /Never make the prose more certain/);
  assert.match(SUPERVISOR_ACCESSIBILITY_CONTRACT, /Do not convert missing evidence into evidence that something did not happen/);
  assert.match(SUPERVISOR_ACCESSIBILITY_CONTRACT, /Keep every claim inside the reconstructed target, population, period, model, evaluation and evidence scope/);
});
