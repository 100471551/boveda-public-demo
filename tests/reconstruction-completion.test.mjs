import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { APPLICATION_VERSION } from "../engine/version.mjs";
import { featureContextLabel } from "../src/analytical-presentation.mjs";

function markdown(value) { return { cell_type: "markdown", source: [value], outputs: [] }; }
function code(source, output = "", execution_count = 1) {
  return { cell_type: "code", execution_count, source: [source], outputs: output ? [{ output_type: "stream", text: [output] }] : [] };
}
function source(cells, path, evidenceId) {
  return notebookFragments(JSON.stringify({ cells }), { id: evidenceId, path, kind: "notebook" });
}

function preparationSource() {
  return source([
    markdown("# Prepare tidal observations"),
    code("observations.shape", "(1013, 14)", 2),
    code("observations = observations[observations['eligible habitat'] == 1]\nobservations.shape", "(977, 14)", 3),
    code("observations['salinity'].fillna(0, inplace=True)\nobservations['temperature'].fillna(observations['temperature'].median(), inplace=True)", "", 4),
    code("encoded = pd.get_dummies(observations['current use'])", "", 4),
    code("print(observations['temperature'].isna().sum()/913*100)", "temperature missing 6.7", 5),
    code("stress_components = ['chloride flag', 'oxygen flag']\nobservations['stress_total'] = observations[stress_components].sum(axis=1)\nobservations['lagoon_stress'] = observations.stress_total.mask(observations.stress_total > 0, 1)", "0 746\n1 267", 6),
    code("oxygen_components = ['oxygen flag']\nobservations['oxygen_total'] = observations[oxygen_components].sum(axis=1)\nobservations['oxygen_proxy'] = observations.oxygen_total.mask(observations.oxygen_total > 0, 1)", "0 864\n1 113", 7),
    code("labelled = observations[observations['inspected'] == 1]\nprint(labelled.lagoon_stress.sum()/labelled.shape[0])", "0.3", 8),
  ], "preparation/formation.ipynb", "E-PREP");
}

function modellingSource({ prAuc = 0.612, includePriorityComparison = true, featureName = "tidal_gradient" } = {}) {
  const cells = [
    markdown("# Predictive modeling: Lagoon stress"),
    code("lagoon = labelled.copy()\nlagoon.shape", "(890, 12)", 1),
    code("print('Train obs: 619 Test obs: 271')", "Train obs: 619 Test obs: 271", 2),
    code("X_train = lagoon[lagoon['split flag'] == 0].drop(columns=['lagoon_stress'])\nX_test = lagoon[lagoon['split flag'] == 1].drop(columns=['lagoon_stress'])\ny_train = lagoon[lagoon['split flag'] == 0][['lagoon_stress']]\ny_test = lagoon[lagoon['split flag'] == 1][['lagoon_stress']]", "", 3),
    code("print(y_train.sum())", "lagoon_stress    201.0", 4),
    code("y_test.lagoon_stress.sum()", "66.0", 5),
    code("scale = StandardScaler()\nscale.fit(X_train)\nscale.fit(X_test)", "", 6),
    markdown("## Random Forest"),
    code("forest = RandomForestClassifier(random_state=7)\nforest.fit(X_train, y_train)\npredicted = forest.predict(X_test)\nprint(average_precision_score(y_test, predicted))\nprint('number predicted: 79')", "0.431\nnumber predicted: 79", 7),
    code("grid_values = {'n_estimators': [55, 77], 'max_depth': [8]}\ngrid = GridSearchCV(forest, grid_values, cv=4, scoring='average_precision')", "", 8),
    code("grid.fit(X_train, y_train)", "Fitting 4 folds for each of 2 candidates, totalling 8 fits", 9),
    code("print(grid.best_params_)\nprint(grid.best_score_)", "{'n_estimators': 77, 'max_depth': 8}\n0.704", 10),
    markdown("## Comparing all models"),
    code("forest = RandomForestClassifier(n_estimators=77, max_depth=9, random_state=7)\nforest.fit(X_train, y_train)\npredicted = forest.predict(X_test)\nforest_ap = average_precision_score(y_test, predicted)\nprint(forest_ap)", "0.482731", 11),
    code("boost = XGBClassifier(n_estimators=66, random_state=7)\nboost.fit(X_train, y_train)\nboosted = boost.predict(X_test)\nboost_ap = average_precision_score(y_test, boosted)\nprint(boost_ap)", "0.497114", 12),
    code("summary(y_test, boosted, model_name='XGBoost')\nsummary(y_test, predicted, model_name='Random Forest')", "XGBoost\n[[183 22]\n [ 31 35]]\nAverage Precision Score: 0.5\nAccuracy: 0.8\nRecall: 0.53\nPrecision: 0.61\nF1 score: 0.57\nRandom Forest\n[[188 17]\n [ 38 28]]\nAverage Precision Score: 0.48\nAccuracy: 0.8\nRecall: 0.42\nPrecision: 0.62\nF1 score: 0.5", 13),
  ];
  if (includePriorityComparison) cells.push(code("boost_probs = boost.predict_proba(X_test)[:,1]\nforest_probs = forest.predict_proba(X_test)[:,1]\nboost_precision, boost_recall, _ = precision_recall_curve(y_test, boost_probs)\nforest_precision, forest_recall, _ = precision_recall_curve(y_test, forest_probs)\nboost_auc = auc(boost_recall, boost_precision)\nforest_auc = auc(forest_recall, forest_precision)\nprint('XGBoost: f1=%.3f auc=%.3f' % (0.57, boost_auc))\nprint('Random Forest: f1=%.3f auc=%.3f' % (0.50, forest_auc))", `XGBoost: f1=0.570 auc=${prAuc}\nRandom Forest: f1=0.500 auc=0.607`, 14));
  cells.push(code("feature_values = pd.DataFrame(forest.feature_importances_, index=X_train.columns, columns=['importance']).sort_values('importance', ascending=False)\nfeature_values.head(2)", `                         importance\n${featureName}              0.271\nhabitat__sheltered          0.119`, 15));
  cells.push(code("export_values = pd.DataFrame(boost.predict_proba(scoring_frame))\nscoring_frame['lagoon probability'] = export_values[1]\nscoring_frame[['record id', 'different probability']].to_csv('lagoon_predictions.csv')", "", null));
  return source(cells, "models/lagoon-stress.ipynb", "E-MODEL-A");
}

function dependencySource(title = "Oxygen proxy") {
  return source([
    markdown(`# Predictive modeling: ${title}`),
    code("X_train = lagoon[lagoon['split flag'] == 0].drop(columns=['oxygen_proxy'])\nX_test = lagoon[lagoon['split flag'] == 1].drop(columns=['oxygen_proxy'])\ny_train = lagoon[lagoon['split flag'] == 0][['oxygen_proxy']]\ny_test = lagoon[lagoon['split flag'] == 1][['oxygen_proxy']]", "", 1),
  ], "models/oxygen-proxy.ipynb", "E-MODEL-B");
}

function record({ metricPriority = true, semanticEvidence = "" } = {}) {
  const established = (value, evidence_ids = ["E-DOC"]) => ({ state: "established", value, epistemic: "OBSERVED", evidence_ids });
  return {
    project_id: "PRJ-SYNTHETIC-COMPLETION", audit_id: "AUD-SYNTHETIC-COMPLETION",
    evidence: metricPriority ? [{ id: "E-DOC", path: "PROJECT.md", excerpt: `Hyperparameters and final evaluation use the area under the precision-recall curve. ${semanticEvidence}`.trim() }] : [{ id: "E-DOC", path: "PROJECT.md", excerpt: "Several metrics are reported without a primary metric." }],
    reconstruction: {
      purpose_scope: { population_scope: established("Eligible observations, with predictions intended for the uninspected remainder.") },
      samples: { source_data: { ...established("1013 source observations"), count: 1013 }, model_sample: { ...established("619 training observations", ["E-MODEL-A"]), count: 619 }, evaluation_sample: { ...established("271 held-out observations", ["E-MODEL-A"]), count: 271 } },
      data: { summary: established("977 eligible observations and 890 inspected observations."), population_filters: established("Restricted to eligible habitat and inspected observations."), population_limitation: established("Evaluation is inspected while the intended remainder is uninspected."), period: established("Recorded interval") },
      results_evaluation: {
        primary_result: { state: "established", display_value: "0.431", metric: "Average precision", method: "Untuned Random Forest classifier", task_target: "Lagoon stress", evaluation_context: "held-out test", epistemic: "OBSERVED", evidence_ids: ["E-MODEL-A"] },
        material_results: [{ state: "established", display_value: "35", metric: "True positives", method: "XGBoost", task_target: "Lagoon stress", evaluation_context: "final confusion matrix", epistemic: "DERIVED", evidence_ids: ["E-MODEL-A"] }],
        evaluation_design: established("Training observations were separated from a held-out evaluation branch.", ["E-MODEL-A"]),
      },
    },
  };
}

function layer(options = {}) {
  return buildAnalyticalLayer(record(options), { sources: [preparationSource(), modellingSource(options), dependencySource(options.dependencyTitle)] });
}

test("target construction, positive class, and component dependency are reconstructed from expressions", () => {
  const graph = layer().object_graph;
  assert.deepEqual(graph.target_definitions.map((item) => item.source_field).sort(), ["lagoon_stress", "oxygen_proxy"]);
  assert.equal(graph.target_definitions.find((item) => item.source_field === "lagoon_stress").source_fields.length, 2);
  assert.equal(graph.target_relations.length, 1);
  assert.equal(graph.target_relations[0].relation, "source_component_subset");
});

test("population branches and derived remainder retain typed roles and evidence operands", () => {
  const graph = layer().object_graph;
  const counts = Object.fromEntries(graph.population_nodes.map((item) => [item.role, item.count]));
  assert.deepEqual(counts, { source: 1013, eligible_population: 977, labelled_population: 890, training: 619, evaluation: 271, intended_prediction: 87, actual_scoring: 977 });
  const remainder = graph.population_nodes.find((item) => item.role === "intended_prediction");
  assert.equal(remainder.epistemic, "DERIVED");
  assert.equal(remainder.derivation.operation, "difference");

  const sourceOnlyRecord = record();
  delete sourceOnlyRecord.reconstruction.samples;
  const sourceOnly = buildAnalyticalLayer(sourceOnlyRecord, { sources: [preparationSource(), modellingSource(), dependencySource()] }).object_graph;
  assert.deepEqual(Object.fromEntries(sourceOnly.population_nodes.map((item) => [item.role, item.count])), counts);
  assert.ok(sourceOnly.population_nodes.find((item) => item.role === "training").source_locator.endsWith("#cell-2"));
});

test("untuned and final model runs, GridSearchCV stages, and final mismatch remain distinct", () => {
  const graph = layer().object_graph;
  const forest = graph.model_runs.filter((item) => item.method === "Random Forest" && item.target_id === graph.target_definitions.find((target) => target.source_field === "lagoon_stress").id);
  assert.ok(forest.some((item) => item.roles.includes("held_out_untuned")));
  assert.ok(forest.some((item) => item.roles.includes("final_evaluated")));
  const search = graph.hyperparameter_searches.find((item) => item.search_type === "GridSearchCV" && item.method === "Random Forest");
  assert.equal(search.cv_folds, 4);
  assert.equal(search.candidate_count, 2);
  assert.equal(search.best_score, 0.704);
  assert.equal(search.final_relationship, "parameter_mismatch");
});

test("metric computation typing separates hard-label AP from trapezoidal PR AUC", () => {
  const graph = layer().object_graph;
  assert.ok(graph.metric_observations.some((item) => item.metric === "average_precision" && item.score_input === "hard_label" && item.computation === "average_precision_score"));
  assert.ok(graph.metric_observations.some((item) => item.metric === "pr_auc" && item.score_input === "probability" && item.computation === "trapezoidal_auc_over_precision_recall_curve"));
  assert.ok(graph.final_comparison_sets[0].results.some((item) => item.metric === "average_precision" && item.value === 0.497114));
});

test("prevalence and baseline relations remain target- and population-scoped", () => {
  const graph = layer().object_graph;
  const evaluation = graph.population_nodes.find((item) => item.role === "evaluation");
  const prevalence = graph.prevalence_observations.find((item) => item.population_id === evaluation.id && item.target_id === graph.target_definitions.find((target) => target.source_field === "lagoon_stress").id);
  assert.equal(prevalence.positive_count, 66);
  assert.ok(graph.baseline_relations.every((item) => graph.metric_observations.find((metric) => metric.id === item.metric_id)?.population_id === prevalence.population_id));
});

test("diagnostics cannot bind as scalar rates, while feature and output objects retain producer variants", () => {
  const graph = layer().object_graph;
  const material = graph.evidence_bindings.find((item) => item.canonical_role === "material");
  assert.equal(material.object_type, "DiagnosticObservation");
  assert.equal(material.dimension, "count");
  assert.equal(graph.feature_evidence_sets[0].estimator_variant, "final");
  const output = graph.output_production_statements.find((item) => item.output_type === "prediction_export");
  assert.equal(output.consistency, "assigned_column_not_selected");
  assert.ok(graph.scoped_limitations.some((item) => item.subject_id === output.id));
});

test("Best Final Result uses one evidenced metric without weighting and falls back when priority is unresolved", () => {
  const selected = layer().presentation.best_final_result;
  assert.equal(selected.selection_mode, "best_final_result");
  assert.equal(selected.metric_key, "pr_auc");
  assert.equal(selected.raw_value, 0.612);
  const fallback = layer({ metricPriority: false }).presentation.best_final_result;
  assert.equal(fallback.selection_mode, "canonical_primary_fallback");
  assert.equal(fallback.raw_value, 0.431);
});

test("value mutation, target-label mutation, and evidence removal change only evidence-derived projections", () => {
  assert.equal(layer({ prAuc: 0.733 }).presentation.best_final_result.raw_value, 0.733);
  const renamed = modellingSource();
  renamed.cells[0].source = "# Predictive modeling: Marsh condition";
  renamed.cells.forEach((cell) => { cell.workstream = "Predictive modeling: Marsh condition"; });
  const renamedLayer = buildAnalyticalLayer(record(), { sources: [preparationSource(), renamed, dependencySource()] });
  assert.equal(renamedLayer.target_definitions.find((item) => item.source_field === "lagoon_stress").semantic_name, "Marsh condition");
  const removed = buildAnalyticalLayer(record(), { sources: [preparationSource(), modellingSource({ includePriorityComparison: false }), dependencySource()] });
  assert.equal(removed.presentation.best_final_result.selection_mode, "canonical_primary_fallback");
});

test("focal result projection switches method, result, sample, narrative, and compatible limitation together", () => {
  const boost = layer({ prAuc: 0.733 }).presentation.focal_results_evaluation;
  const forest = layer({ prAuc: 0.501 }).presentation.focal_results_evaluation;
  assert.equal(boost.result, boost.best_final_result);
  assert.equal(boost.result.method, "XGBoost");
  assert.equal(forest.result.method, "Random Forest");
  assert.equal(forest.result.raw_value, 0.607);
  for (const focal of [boost, forest]) {
    assert.equal(focal.evaluation_sample.count, 271);
    assert.match(focal.evaluation_design.value, new RegExp(focal.result.method));
    assert.match(focal.establishes.value, new RegExp(`${focal.result.method} achieved`));
    assert.equal(focal.known_limitation.limitation_kind, "evaluation_population_disconnect");
    assert.doesNotMatch(focal.known_limitation.value, /average.precision|hard class/i);
  }
});

test("historical untuned result remains typed but cannot populate the distinct focal result", () => {
  const built = layer();
  const historical = built.presentation.historical_primary_result;
  const focal = built.presentation.focal_results_evaluation;
  assert.equal(historical.estimator_variant, "untuned");
  assert.equal(historical.score_input, "hard_label");
  assert.notEqual(historical.id, focal.focal_result_id);
  assert.notEqual(historical.method, focal.result.method);
  assert.equal(focal.known_limitation.limitation_kind, "evaluation_population_disconnect");
});

test("feature selector identity derives from target, model, and variant rather than feature names", () => {
  const base = { target_name: "Marsh condition", method: "Cedar", estimator_variant: "final", display_label: "salinity", raw_feature: "salinity" };
  assert.equal(featureContextLabel(base), "Marsh condition · Cedar · final");
  assert.equal(featureContextLabel({ ...base, display_label: "temperature", raw_feature: "temperature" }), featureContextLabel(base));
  assert.equal(featureContextLabel({ ...base, target_name: "Reef condition", method: "Willow", estimator_variant: "tuned" }), "Reef condition · Willow · tuned");
});

test("unresolved project selection stays valid and supervisor feature copy says displayed model", async () => {
  assert.equal(layer().presentation.selected_model.status, "unresolved");
  const view = await fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8");
  assert.match(view, /inputs the displayed model relied on most/);
  assert.doesNotMatch(view, /inputs the selected model relied on most/);
});

test("proxy typing requires affirmative evidence of a broader represented construct", () => {
  const derived = layer().target_definitions.find((target) => target.source_field === "oxygen_proxy");
  assert.equal(derived.semantic_subtype, "derived_binary_target");
  const explicit = layer({ dependencyTitle: "Marsh collapse", semanticEvidence: "The oxygen flag is used as a proxy for marsh collapse." }).target_definitions.find((target) => target.source_field === "oxygen_proxy");
  assert.equal(explicit.semantic_subtype, "proxy_target");
  assert.equal(explicit.semantic_basis, "explicit_persisted_semantic_relationship");
});

test("malformed encoded feature labels use a source-family fallback without known-case mapping", () => {
  const first = layer({ featureName: "n use" }).feature_evidence.find((feature) => feature.raw_feature === "n use");
  const changed = layer({ featureName: "x use" }).feature_evidence.find((feature) => feature.raw_feature === "x use");
  assert.equal(first.display_label, "Current use category · unresolved label");
  assert.equal(changed.display_label, first.display_label);
  assert.equal(first.provenance.label_resolution, "bounded_family_fallback");
});

test("Overview and report use shared focal semantics while application, UI, and report share one version", async () => {
  const [app, report, packageText] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../engine/client-report.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.equal(APPLICATION_VERSION, JSON.parse(packageText).version);
  assert.match(app, /version as applicationVersion[^]*Alpha \{applicationVersion\}/);
  assert.match(report, /import \{ APPLICATION_VERSION \}[^]*Bóveda Alpha \$\{esc\(APPLICATION_VERSION\)\}/);
  assert.doesNotMatch(report, /Bóveda Alpha \$\{esc\(record\.product_version\)\}/);
  assert.match(app, /const focalEvaluation = analyticalLayer\?\.presentation\?\.focal_results_evaluation/);
  assert.match(app, /\["Best recorded result", focalEvaluation\.result/);
  assert.doesNotMatch(app, /\["Historical canonical result"/);
  assert.match(report, /presentation\?\.focal_results_evaluation/);
  assert.doesNotMatch(report, /Historical canonical reconstruction/);
});

test("runtime reconstruction contains no development-case identifiers or audit-answer ingestion", async () => {
  const runtime = (await Promise.all(["../engine/reconstruction-graph.mjs", "../engine/analytical.mjs", "../engine/analytical-collection.mjs", "../src/analytical-presentation.mjs"].map((file) => fs.readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(runtime, /Chelsea|Public Health Housing|R1_Reconstruction_Completion_Audit|0\.565|0\.562|0\.504|7036|5989|1611|1263|348/);
  assert.doesNotMatch(runtime, /project[_ .-]*(?:name|path)[\s\S]{0,80}(?:if|switch)/i);
});
