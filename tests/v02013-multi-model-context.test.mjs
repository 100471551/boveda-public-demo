import assert from "node:assert/strict";
import test from "node:test";
import { buildOverviewModelContexts, modelContextByKey, modelMetricKey, modelResult, sectionDefaultModelKey } from "../src/overview-model-context.mjs";

const evidence = (id) => ({ epistemic: "OBSERVED", evidence_ids: [id] });

function fixture() {
  const result = (id, method, metric, value, run, extra = {}) => ({ id, method, metric, metric_label: metric === "roc_auc" ? "ROC AUC" : "F1", value, model_run_id: run, target_id: "TARGET-TIDAL", workstream_id: "STREAM-TIDAL", evaluation_phase: "test", estimator_variant: "final", population_id: "POP-TEST", ...evidence(`E-${id}`), ...extra });
  const cedarRoc = result("RESULT-CEDAR-ROC", "Cedar", "roc_auc", .74, "RUN-CEDAR");
  return {
    presentation: { main_target_story: {
      target: { id: "TARGET-TIDAL", workstream_id: "STREAM-TIDAL", label: "Tidal flooding" },
      method: "Cedar",
      result: { ...cedarRoc, state: "established", analytical_result_id: cedarRoc.id, metric_key: "roc_auc", raw_value: .74, display_value: "0.74", task_target: "Tidal flooding" },
      section_answers: { model_comparison: { dashboard_available: true, answer: { sets: [{
        id: "COMPARE-TIDAL", target_id: "TARGET-TIDAL", workstream_id: "STREAM-TIDAL", evaluation_phase: "test", estimator_variant: "final",
        methods: ["Cedar", "Willow", "No Skill"], metrics: [{ key: "roc_auc", label: "ROC AUC", direction: "higher" }, { key: "f1", label: "F1", direction: "higher" }],
        results: [cedarRoc, result("RESULT-CEDAR-F1", "Cedar", "f1", .61, "RUN-CEDAR"), result("RESULT-WILLOW-ROC", "Willow", "roc_auc", .69, "RUN-WILLOW"), result("RESULT-WILLOW-F1", "Willow", "f1", .65, "RUN-WILLOW"), result("RESULT-BASE-ROC", "No Skill", "roc_auc", .5, null), result("RESULT-BASE-F1", "No Skill", "f1", .2, null)],
      }] } } },
    } },
    model_runs: [{ id: "RUN-CEDAR", target_id: "TARGET-TIDAL", method: "Cedar" }, { id: "RUN-WILLOW", target_id: "TARGET-TIDAL", method: "Willow" }],
    diagnostics: [
      { id: "DIAG-CEDAR", type: "confusion_matrix", method: "Cedar", model_run_id: "RUN-CEDAR", target_id: "TARGET-TIDAL", evaluation_phase: "test", estimator_variant: "final", population_id: "POP-TEST", labels: ["0", "1"], values: [[8, 2], [3, 7]], ...evidence("E-DIAG-CEDAR") },
      { id: "DIAG-WILLOW", type: "confusion_matrix", method: "Willow", model_run_id: "RUN-WILLOW", target_id: "TARGET-TIDAL", evaluation_phase: "test", estimator_variant: "final", population_id: "POP-TEST", labels: ["0", "1"], values: [[7, 3], [2, 8]], ...evidence("E-DIAG-WILLOW") },
      { id: "DIAG-WRONG-RUN", type: "confusion_matrix", method: "Cedar", model_run_id: "RUN-CEDAR-OTHER", target_id: "TARGET-TIDAL", evaluation_phase: "test", estimator_variant: "final", population_id: "POP-TEST", labels: ["0", "1"], values: [[9, 1], [1, 9]], ...evidence("E-DIAG-WRONG") },
      { id: "DIAG-OTHER-TARGET", type: "confusion_matrix", method: "Willow", model_run_id: "RUN-WILLOW", target_id: "TARGET-OTHER", labels: ["0", "1"], values: [[9, 1], [1, 9]], ...evidence("E-DIAG-OTHER") },
    ],
    feature_evidence: [
      { id: "FEATURE-CEDAR", target_id: "TARGET-TIDAL", method: "Cedar", model_run_id: "RUN-CEDAR", estimator_variant: "final", feature: "tide height", value: .42, ...evidence("E-FEATURE-CEDAR") },
      { id: "FEATURE-WRONG-RUN", target_id: "TARGET-TIDAL", method: "Cedar", model_run_id: "RUN-CEDAR-OTHER", estimator_variant: "final", feature: "wind", value: .8, ...evidence("E-FEATURE-WRONG") },
      { id: "FEATURE-WILLOW-USAGE", target_id: "TARGET-TIDAL", method: "Willow", model_run_id: "RUN-WILLOW", estimator_variant: "final", feature: "rain", value: null, ...evidence("E-FEATURE-USAGE") },
    ],
  };
}

test("the focal comparable result becomes the default global model and metric", () => {
  const presentation = buildOverviewModelContexts(fixture());
  assert.deepEqual(presentation.contexts.map((item) => item.method), ["Cedar", "Willow"]);
  assert.equal(modelContextByKey(presentation, presentation.default_model_key).method, "Cedar");
  assert.equal(presentation.default_metric_key, "roc_auc");
  assert.equal(modelResult(modelContextByKey(presentation, presentation.default_model_key), presentation.default_metric_key).raw_value, .74);
});

test("each model retains its own metrics, diagnostics, and numerical feature evidence", () => {
  const presentation = buildOverviewModelContexts(fixture());
  const cedar = presentation.contexts.find((item) => item.method === "Cedar");
  const willow = presentation.contexts.find((item) => item.method === "Willow");
  assert.deepEqual(cedar.metrics.map((item) => item.key), ["roc_auc", "f1"]);
  assert.deepEqual(cedar.diagnostics.map((item) => item.id), ["DIAG-CEDAR"]);
  assert.deepEqual(cedar.features.map((item) => item.id), ["FEATURE-CEDAR"]);
  assert.deepEqual(willow.diagnostics.map((item) => item.id), ["DIAG-WILLOW"]);
  assert.deepEqual(willow.features, []);
  assert.equal(modelMetricKey(willow, "f1"), "f1");
});

test("section defaults prefer available evidence without changing explicit local eligibility", () => {
  const presentation = buildOverviewModelContexts(fixture());
  const cedar = presentation.contexts.find((item) => item.method === "Cedar");
  const willow = presentation.contexts.find((item) => item.method === "Willow");
  assert.equal(sectionDefaultModelKey(presentation, willow.id, "features"), cedar.id);
  assert.equal(sectionDefaultModelKey(presentation, willow.id, "diagnostics"), willow.id);

  const alternateOnly = {
    contexts: [
      { id: "FOCAL", features: [] },
      { id: "SUPPORTED-LOW", features: [{ id: "FEATURE-LOW" }], metrics: [{ key: "score", direction: "higher", result: { value: .62 } }] },
      { id: "SUPPORTED-HIGH", features: [{ id: "FEATURE-HIGH" }], metrics: [{ key: "score", direction: "higher", result: { value: .81 } }] },
    ],
    default_model_key: "FOCAL",
    default_metric_key: "score",
  };
  assert.equal(sectionDefaultModelKey(alternateOnly, "FOCAL", "features"), "SUPPORTED-HIGH");
  assert.equal(sectionDefaultModelKey(alternateOnly, "FOCAL", "diagnostics"), "FOCAL");
});

test("a legacy comparison can use a comparison-scoped method identity without borrowing another target", () => {
  const input = fixture();
  for (const item of input.presentation.main_target_story.section_answers.model_comparison.answer.sets[0].results) delete item.model_run_id;
  input.model_runs = [];
  input.presentation.main_target_story.section_answers.model_comparison.answer.sets[0].results.forEach((item) => { if (item.method !== "No Skill") item.method_role = "candidate"; });
  input.diagnostics = [{ id: "LEGACY-DIAG", type: "confusion_matrix", method: "Willow classifier", workstream_id: "STREAM-TIDAL", evaluation_phase: "test", labels: ["0", "1"], values: [[5, 1], [2, 4]], ...evidence("E-LEGACY-DIAG") }];
  const presentation = buildOverviewModelContexts(input);
  assert.deepEqual(presentation.contexts.find((item) => item.method === "Willow").diagnostics.map((item) => item.id), ["LEGACY-DIAG"]);
  assert.equal(presentation.contexts.some((item) => item.method === "No Skill"), false);
});

test("the presentation capability contains no development-project identities or expected values", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/overview-model-context.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /\bR[1-7]\b|Chelsea|Crash|NYC.?311|XGBoost|302720|22466|2283|1026/);
});

test("the global model resets section contexts while section selectors remain local presentation state", async () => {
  const fs = await import("node:fs/promises");
  const [main, analytical] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(main, /setGlobalModelKey\(overviewModelPresentation\.contexts\[index\]\?\.id[\s\S]*ariaLabel="Global Overview model"/);
  assert.match(main, /setResultsModelKey\(effectiveGlobalModelKey\);[\s\S]*setResultsMetricKey\([\s\S]*\[record\.project_id, effectiveGlobalModelKey\]/);
  assert.match(main, /primaryResultLabel = globalSelectionIsDefault \? "Best recorded result" : "Recorded result"/);
  assert.match(main, /<AnalyticalResults[\s\S]*globalModelKey=\{effectiveGlobalModelKey\}/);
  assert.ok((analytical.match(/useEffect\(\(\) => setSelectedModelKey\(globalModelKey\), \[globalModelKey\]\);/g) || []).length >= 1);
  assert.ok((analytical.match(/useEffect\(\(\) => setSelectedModelKey\(defaultModelKey\), \[globalModelKey, defaultModelKey\]\);/g) || []).length >= 2);
  assert.match(analytical, /ariaLabel="Feature evidence model"/);
  assert.match(analytical, /ariaLabel="Evaluation Behaviour model"/);
  assert.match(analytical, /ariaLabel="Model Comparison highlighted model"/);
  assert.match(analytical, /function sectionModelOptions\(modelPresentation\)\s*\{\s*return modelPresentation\?\.contexts \|\| \[\];\s*\}/);
  assert.doesNotMatch(analytical, /setGlobalModelKey/);
});
