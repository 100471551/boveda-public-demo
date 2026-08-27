import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { executeGraphCheck, executeGraphChecks, GRAPH_CHECK_RESULTS as R } from "../engine/graph-signals.mjs";

const ev = (value) => ({ evidence_ids: ["EV-SYNTHETIC"], epistemic: "OBSERVED", ...value });

function graphFixture() {
  const target = ev({ id: "TARGET-Z", semantic_name: "Outcome Z", workstream_id: "WORK-Z", construction_graph_id: "TCG-Z" });
  const run = ev({ id: "RUN-Z", target_id: target.id, method: "Method Z", estimator_class: "EstimatorZ", parameters: { depth: 4 }, roles: ["final_evaluated", "feature_producing", "export_producing"] });
  const attempt = ev({ id: "EVAL-Z", target_id: target.id, population_id: "POP-EVAL", status: "persisted", model_run_ids: [run.id] });
  const metric = ev({ id: "METRIC-Z", target_id: target.id, model_run_id: run.id, evaluation_attempt_id: attempt.id, population_id: attempt.population_id, metric: "pr_auc", metric_label: "Precision-recall area", computation: "curve_area", score_input: "probability" });
  const nodes = [
    ev({ id: "POP-SOURCE", role: "source", count: 100, unit: "units" }),
    ev({ id: "POP-ELIGIBLE", role: "eligible_population", count: 80, unit: "units" }),
    ev({ id: "POP-LABELLED", role: "labelled_population", count: 40, unit: "units" }),
    ev({ id: "POP-TRAIN", role: "training", count: 30, unit: "units", target_ids: [target.id] }),
    ev({ id: "POP-EVAL", role: "evaluation", count: 10, unit: "units", target_ids: [target.id] }),
    ev({ id: "POP-INTENDED", role: "intended_prediction", count: 40, unit: "units", target_ids: [target.id], derivation: { operation: "difference", operands: ["POP-ELIGIBLE", "POP-LABELLED"] } }),
    ev({ id: "POP-SCORING", role: "actual_scoring", count: 80, unit: "units", target_ids: [target.id] }),
  ];
  const edges = [
    ev({ id: "REL-1", from: "POP-SOURCE", to: "POP-ELIGIBLE", relation: "filter" }),
    ev({ id: "REL-2", from: "POP-ELIGIBLE", to: "POP-LABELLED", relation: "label_availability_filter" }),
    ev({ id: "REL-3", from: "POP-LABELLED", to: "POP-TRAIN", relation: "split" }),
    ev({ id: "REL-4", from: "POP-LABELLED", to: "POP-EVAL", relation: "split" }),
    ev({ id: "REL-5", from: "POP-ELIGIBLE", to: "POP-INTENDED", relation: "derived_remainder" }),
    ev({ id: "REL-6", from: "POP-ELIGIBLE", to: "POP-SCORING", relation: "scoring_scope" }),
  ];
  const output = ev({ id: "OUTPUT-Z", output_type: "prediction_export", target_id: target.id, producer_model_run_id: run.id, assigned_prediction_column: "score_z", selected_export_columns: ["entity", "score_z"] });
  return {
    best_final_result: ev({ id: "FOCAL-Z", state: "established", analytical_result_id: metric.id, target_id: target.id, model_run_id: run.id, evaluation_attempt_id: attempt.id, evaluation_population_id: attempt.population_id, metric_priority: { metric: "pr_auc" } }),
    target_definitions: [target],
    target_construction_graphs: [ev({ id: "TCG-Z", target_id: target.id, root_step_id: "STEP-ROOT", step_ids: ["STEP-SOURCE", "STEP-ROOT"], edge_ids: ["EDGE-Z"], terminal_source_fields: ["recorded_indicator_z"], status: "complete", issues: [] })],
    target_construction_steps: [
      ev({ id: "STEP-SOURCE", operation_type: "source_field", inputs: [], output: "recorded_indicator_z", state: "established" }),
      ev({ id: "STEP-ROOT", operation_type: "threshold", inputs: ["recorded_indicator_z"], output: "outcome_z", state: "established" }),
    ],
    target_construction_edges: [ev({ id: "EDGE-Z", from_step_id: "STEP-SOURCE", to_step_id: "STEP-ROOT", relation: "dataflow_dependency" })],
    population_graph: { nodes, edges },
    data_formation_stages: [ev({ id: "FIT-TRAIN", operation_type: "preprocessor_fit", fit_scope: "training", workstream_id: target.workstream_id })],
    model_runs: [run],
    hyperparameter_searches: [ev({ id: "SEARCH-Z", target_id: target.id, method: run.method, predecessor_id: null, best_parameters: { depth: 4 }, final_model_run_id: run.id })],
    evaluation_attempts: [attempt],
    metric_observations: [metric],
    final_comparison_sets: [ev({ id: "COMPARE-Z", target_id: target.id, results: [metric] })],
    diagnostic_observations: [ev({ id: "DIAG-Z", type: "confusion_matrix", final: true, target_id: target.id, model_run_id: run.id, evaluation_attempt_id: attempt.id, tn: 6, fp: 1, fn: 2, tp: 1, orientation: { rows: "actual", columns: "predicted" } })],
    feature_evidence_sets: [ev({ id: "FEATURE-Z", target_id: target.id, model_run_id: run.id, method: run.method })],
    selection_statements: [ev({ id: "BEST-Z", type: "best_final_on_metric", status: "established", target_id: target.id, metric: "pr_auc", model_run_id: run.id, method: run.method })],
    output_production_statements: [output],
    scoped_limitations: [], evidence_bindings: [],
    notebook_execution_contexts: [ev({ id: "EXEC-CODE-Z", execution_count: 4, persisted_output: true })],
    dataset_snapshots: [ev({ id: "SNAPSHOT-Z", identity_status: "resolved" })],
    environment_configurations: [ev({ id: "ENV-Z" })],
    prediction_label_artifacts: [ev({ id: "PREDLABEL-Z", metric_observation_ids: [metric.id] })],
  };
}

const one = (id, graph) => executeGraphCheck(id, graph, { project_id: "PROJECT-Z", audit_id: "AUDIT-Z" });
const state = (id, graph) => one(id, graph)[0].result;

test("typed focal-result origin implements all four states", () => {
  const compatible = graphFixture();
  assert.equal(state("CHK-TYPED-FOCAL-RESULT-ORIGIN", compatible), R.ABSENT);
  const incompatible = graphFixture(); incompatible.metric_observations[0].target_id = "TARGET-DIFFERENT";
  assert.equal(state("CHK-TYPED-FOCAL-RESULT-ORIGIN", incompatible), R.PRESENT);
  const missing = graphFixture(); missing.model_runs = [];
  assert.equal(state("CHK-TYPED-FOCAL-RESULT-ORIGIN", missing), R.INSUFFICIENT);
  const absent = graphFixture(); delete absent.best_final_result;
  assert.equal(state("CHK-TYPED-FOCAL-RESULT-ORIGIN", absent), R.NOT_APPLICABLE);
});

test("target construction ancestry distinguishes complete, dangling, and contradictory graphs", () => {
  const complete = graphFixture(); assert.equal(state("CHK-TARGET-CONSTRUCTION-ANCESTRY", complete), R.ABSENT);
  const dangling = graphFixture(); dangling.target_construction_graphs[0].step_ids.push("STEP-MISSING");
  assert.equal(state("CHK-TARGET-CONSTRUCTION-ANCESTRY", dangling), R.INSUFFICIENT);
  const cyclic = graphFixture(); cyclic.target_construction_edges.push(ev({ id: "EDGE-CYCLE", from_step_id: "STEP-ROOT", to_step_id: "STEP-SOURCE" })); cyclic.target_construction_graphs[0].edge_ids.push("EDGE-CYCLE");
  assert.equal(state("CHK-TARGET-CONSTRUCTION-ANCESTRY", cyclic), R.PRESENT);
  const none = graphFixture(); none.target_definitions = [];
  assert.equal(state("CHK-TARGET-CONSTRUCTION-ANCESTRY", none), R.NOT_APPLICABLE);
});

test("population lineage evaluates compatible, inconsistent, insufficient, and inapplicable graphs", () => {
  assert.equal(state("CHK-POPULATION-LINEAGE-COMPATIBILITY", graphFixture()), R.ABSENT);
  const inconsistent = graphFixture(); inconsistent.population_graph.nodes.find((node) => node.role === "training").count = 31;
  assert.equal(state("CHK-POPULATION-LINEAGE-COMPATIBILITY", inconsistent), R.PRESENT);
  const missing = graphFixture(); missing.population_graph.nodes = missing.population_graph.nodes.filter((node) => node.role !== "evaluation");
  assert.equal(state("CHK-POPULATION-LINEAGE-COMPATIBILITY", missing), R.INSUFFICIENT);
  const none = graphFixture(); none.population_graph = { nodes: [], edges: [] };
  assert.equal(state("CHK-POPULATION-LINEAGE-COMPATIBILITY", none), R.NOT_APPLICABLE);
});

test("evaluation/intended population alignment implements the four-state contract", () => {
  assert.equal(state("CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT", graphFixture()), R.PRESENT);
  const aligned = graphFixture(); aligned.evaluation_attempts[0].population_id = "POP-INTENDED";
  assert.equal(state("CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT", aligned), R.ABSENT);
  const unresolved = graphFixture(); unresolved.population_graph.nodes.find((node) => node.role === "intended_prediction").evidence_ids = [];
  assert.equal(state("CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT", unresolved), R.INSUFFICIENT);
  const none = graphFixture(); none.population_graph.nodes = none.population_graph.nodes.filter((node) => node.role !== "intended_prediction");
  assert.equal(state("CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT", none), R.NOT_APPLICABLE);
});

test("preprocessor fit scope implements the four-state contract", () => {
  assert.equal(state("CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE", graphFixture()), R.ABSENT);
  const evaluationFit = graphFixture(); evaluationFit.data_formation_stages.push(ev({ id: "FIT-EVAL", operation_type: "preprocessor_fit", fit_scope: "evaluation", workstream_id: "WORK-Z" }));
  assert.equal(state("CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE", evaluationFit), R.PRESENT);
  const stateless = graphFixture(); stateless.data_formation_stages = [ev({ id: "LOG-Z", operation_type: "log_transform" })];
  assert.equal(state("CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE", stateless), R.NOT_APPLICABLE);
  const unresolved = graphFixture(); unresolved.data_formation_stages[0].fit_scope = null;
  assert.equal(state("CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE", unresolved), R.INSUFFICIENT);
});

test("metric semantics protects compatible PR AUC and identifies hard-label ranking inputs", () => {
  assert.equal(state("CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", graphFixture()), R.ABSENT);
  const hard = graphFixture(); hard.metric_observations[0].metric = "average_precision"; hard.metric_observations[0].metric_label = "Average precision"; hard.metric_observations[0].score_input = "hard_label";
  assert.equal(state("CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", hard), R.PRESENT);
  const unresolved = graphFixture(); delete unresolved.metric_observations[0].score_input;
  assert.equal(state("CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", unresolved), R.INSUFFICIENT);
  const unrelated = graphFixture(); unrelated.metric_observations[0].metric = "accuracy";
  assert.equal(state("CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", unrelated), R.NOT_APPLICABLE);
});

test("positive-class detection degeneracy implements the four-state contract", () => {
  assert.equal(state("CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", graphFixture()), R.ABSENT);
  const zero = graphFixture(); Object.assign(zero.diagnostic_observations[0], { fp: 0, tp: 0, fn: 3 });
  assert.equal(state("CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", zero), R.PRESENT);
  const noActual = graphFixture(); Object.assign(noActual.diagnostic_observations[0], { fp: 0, tp: 0, fn: 0 });
  assert.equal(state("CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", noActual), R.NOT_APPLICABLE);
  const unresolved = graphFixture(); delete unresolved.diagnostic_observations[0].orientation;
  assert.equal(state("CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", unresolved), R.INSUFFICIENT);
});

test("terminal search/final correspondence implements the four-state contract", () => {
  assert.equal(state("CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE", graphFixture()), R.ABSENT);
  const difference = graphFixture(); difference.model_runs[0].parameters.depth = 7;
  assert.equal(state("CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE", difference), R.PRESENT);
  const none = graphFixture(); none.hyperparameter_searches = [];
  assert.equal(state("CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE", none), R.NOT_APPLICABLE);
  const unresolved = graphFixture(); unresolved.hyperparameter_searches[0].final_model_run_id = "RUN-UNKNOWN";
  assert.equal(state("CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE", unresolved), R.INSUFFICIENT);
});

test("output-column consistency implements the four-state contract", () => {
  assert.equal(state("CHK-OUTPUT-COLUMN-CONSISTENCY", graphFixture()), R.ABSENT);
  const different = graphFixture(); different.output_production_statements[0].selected_export_columns = ["entity", "another_score"];
  assert.equal(state("CHK-OUTPUT-COLUMN-CONSISTENCY", different), R.PRESENT);
  const none = graphFixture(); none.output_production_statements = [];
  assert.equal(state("CHK-OUTPUT-COLUMN-CONSISTENCY", none), R.NOT_APPLICABLE);
  const unresolved = graphFixture(); delete unresolved.output_production_statements[0].selected_export_columns;
  assert.equal(state("CHK-OUTPUT-COLUMN-CONSISTENCY", unresolved), R.INSUFFICIENT);
});

test("analytical-role alignment never synthesizes formal selection", () => {
  assert.equal(state("CHK-ANALYTICAL-ROLE-ALIGNMENT", graphFixture()), R.ABSENT);
  const divergence = graphFixture(); divergence.model_runs.push(ev({ id: "RUN-OTHER", target_id: "TARGET-Z", method: "Other Z", estimator_class: "EstimatorOther", parameters: {} })); divergence.output_production_statements[0].producer_model_run_id = "RUN-OTHER";
  assert.equal(state("CHK-ANALYTICAL-ROLE-ALIGNMENT", divergence), R.PRESENT);
  divergence.selection_statements.push(ev({ id: "SELECT-Z", type: "project_selected_model", status: "established", target_id: "TARGET-Z", model_run_id: "RUN-Z" }));
  assert.equal(state("CHK-ANALYTICAL-ROLE-ALIGNMENT", divergence), R.ABSENT);
  const unresolved = graphFixture(); unresolved.feature_evidence_sets[0].model_run_id = "RUN-UNKNOWN";
  assert.equal(state("CHK-ANALYTICAL-ROLE-ALIGNMENT", unresolved), R.INSUFFICIENT);
  const oneRole = graphFixture(); oneRole.feature_evidence_sets = []; oneRole.output_production_statements = []; oneRole.selection_statements = oneRole.selection_statements.filter((item) => item.type !== "best_final_on_metric");
  assert.equal(state("CHK-ANALYTICAL-ROLE-ALIGNMENT", oneRole), R.NOT_APPLICABLE);
});

test("reproduction coverage is four-state evidence coverage and never a project Signal", () => {
  assert.equal(state("CHK-REPRODUCTION-INPUT-COVERAGE-V2", graphFixture()), R.ABSENT);
  const missing = graphFixture(); missing.environment_configurations = [];
  assert.equal(state("CHK-REPRODUCTION-INPUT-COVERAGE-V2", missing), R.INSUFFICIENT);
  const notRequired = graphFixture(); notRequired.reproduction_requirements = { material_result: false };
  assert.equal(state("CHK-REPRODUCTION-INPUT-COVERAGE-V2", notRequired), R.NOT_APPLICABLE);
  assert.ok(!executeGraphChecks(missing).some((execution) => execution.check_id === "CHK-REPRODUCTION-INPUT-COVERAGE-V2" && execution.result === R.PRESENT));
});

test("focal-target evidence corrects check applicability when the richer graph is incomplete", () => {
  const graph = graphFixture();
  graph.target_definitions = [];
  graph.metric_observations = [];
  graph.evaluation_attempts = [];
  graph.final_comparison_sets = [];
  graph.hyperparameter_searches = [];
  graph.feature_evidence_sets = [];
  const result = ev({ id: "RESULT-ESTUARY", method: "Cedar", metric: "roc_auc", metric_label: "ROC AUC", metric_subtype: "probability_based", value: 0.78 });
  const story = {
    status: "established",
    target: ev({ id: null, label: "High salinity next month", workstream_id: "STREAM-ESTUARY" }),
    method: "Cedar",
    result: ev({ metric: "ROC AUC", method: "Cedar", task_target: "High salinity next month", evaluation_context: "Held-out estuary stations" }),
    material_results: [result],
    comparison_sets: [{ methods: ["Cedar", "Willow"], metrics: [{ key: "roc_auc", label: "ROC AUC", direction: "higher" }], results: [result, ev({ id: "RESULT-WILLOW", method: "Willow", metric: "roc_auc", metric_label: "ROC AUC", metric_subtype: "probability_based", value: 0.71 })] }],
    feature_evidence: [ev({ id: "FEATURE-ESTUARY", method: "Cedar", feature: "tidal_range", value: 0.4 })],
    populations: { evaluation_sample: ev({ id: "POP-ESTUARY-EVAL", role: "evaluation", label: "Evaluation data", count: 40, unit: "stations" }) },
  };
  const checks = executeGraphChecks(graph, {
    project_id: "PROJECT-ESTUARY",
    audit_id: "AUDIT-ESTUARY",
    main_target_story: story,
    focal_evaluation_design: ev({ value: "Candidate settings were tuned before held-out evaluation." }),
  });
  const results = (id) => checks.filter((item) => item.check_id === id).map((item) => item.result);
  assert.deepEqual(results("CHK-TYPED-FOCAL-RESULT-ORIGIN"), [R.ABSENT]);
  assert.deepEqual(results("CHK-TARGET-CONSTRUCTION-ANCESTRY"), [R.INSUFFICIENT]);
  assert.ok(results("CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY").every((value) => value === R.ABSENT));
  assert.deepEqual(results("CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE"), [R.INSUFFICIENT]);
  assert.deepEqual(results("CHK-ANALYTICAL-ROLE-ALIGNMENT"), [R.ABSENT]);
  assert.ok(checks.filter((item) => ["CHK-TYPED-FOCAL-RESULT-ORIGIN", "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", "CHK-ANALYTICAL-ROLE-ALIGNMENT"].includes(item.check_id)).every((item) => item.implementation_status === "implemented_reconstruction_native"));
});

test("population compatibility does not require operational roles that are absent by design", () => {
  const graph = graphFixture();
  graph.population_graph.nodes = graph.population_graph.nodes.filter((item) => !["intended_prediction", "actual_scoring"].includes(item.role));
  graph.population_graph.edges = graph.population_graph.edges.filter((item) => graph.population_graph.nodes.some((node) => node.id === item.from) && graph.population_graph.nodes.some((node) => node.id === item.to));
  assert.equal(state("CHK-POPULATION-LINEAGE-COMPATIBILITY", graph), R.ABSENT);
});

test("synthetic renames and unrelated counts do not encode a known project answer", () => {
  const baseline = graphFixture();
  const renamed = structuredClone(baseline);
  renamed.target_definitions[0].semantic_name = "Renamed synthetic endpoint";
  renamed.model_runs[0].method = "Renamed synthetic method";
  renamed.model_runs[0].estimator_class = "RenamedEstimator";
  renamed.selection_statements[0].method = "Renamed synthetic method";
  renamed.feature_evidence_sets[0].method = "Renamed synthetic method";
  renamed.population_graph.nodes.find((node) => node.role === "source").count = 140;
  renamed.population_graph.nodes.find((node) => node.role === "eligible_population").count = 120;
  renamed.population_graph.nodes.find((node) => node.role === "labelled_population").count = 60;
  renamed.population_graph.nodes.find((node) => node.role === "training").count = 45;
  renamed.population_graph.nodes.find((node) => node.role === "evaluation").count = 15;
  renamed.population_graph.nodes.find((node) => node.role === "intended_prediction").count = 60;
  renamed.population_graph.nodes.find((node) => node.role === "actual_scoring").count = 120;
  const relevant = ["CHK-TYPED-FOCAL-RESULT-ORIGIN", "CHK-TARGET-CONSTRUCTION-ANCESTRY", "CHK-POPULATION-LINEAGE-COMPATIBILITY", "CHK-EVALUATION-INTENDED-POPULATION-ALIGNMENT", "CHK-EVALUATION-PREPROCESSOR-FIT-SCOPE", "CHK-METRIC-COMPUTATION-CLAIM-COMPATIBILITY", "CHK-POSITIVE-CLASS-DETECTION-DEGENERACY", "CHK-TERMINAL-SEARCH-FINAL-CORRESPONDENCE", "CHK-OUTPUT-COLUMN-CONSISTENCY", "CHK-ANALYTICAL-ROLE-ALIGNMENT"];
  assert.deepEqual(relevant.map((id) => state(id, renamed)), relevant.map((id) => state(id, baseline)));
});

test("runtime graph checks contain no reference-case selectors or expected answers", async () => {
  const source = await fs.readFile(new URL("../engine/graph-signals.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Chelsea|Public Health Housing|PRJ-1D50CE481C|ATD-[A-F0-9]{10}|AMR-[A-F0-9]{10}|APN-[A-F0-9]{10}/i);
  assert.doesNotMatch(source, /0\.565|7036|5989|1611|1263|4378|probability of high risk|probability of overcrowding/i);
});
