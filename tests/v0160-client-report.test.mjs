import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { renderReport } from "../engine/report.mjs";
import { buildSignalsLayer } from "../engine/signals.mjs";
import { buildFindingsPresentation } from "../src/findings-presentation.mjs";

async function syntheticRecord() {
  const source = JSON.parse(await fs.readFile(new URL("../preserved-audits/v0.9.2/records/R3.json", import.meta.url), "utf8"));
  const record = structuredClone(source);
  record.project_id = "PRJ-SYNTHETIC-COAST";
  record.audit_id = "AUD-SYNTHETIC-COAST";
  record.source_project.path = "/projects/coastal-habitat-allocation";
  record.reconstruction.identity.name.value = "Coastal Habitat Allocation";
  record.reconstruction.purpose_scope.summary.value = "Prioritises habitat restoration work across a documented set of coastal parcels.";
  record.reconstruction.purpose_scope.purpose.value = "Help a regional team prioritise habitat restoration work.";
  record.reconstruction.purpose_scope.task.value = "Binary classification of habitat priority.";
  record.reconstruction.purpose_scope.target_outcome.value = "High restoration priority";
  record.reconstruction.purpose_scope.unit.value = "One coastal parcel";
  record.reconstruction.purpose_scope.population_scope.value = "Documented coastal parcels in the study boundary.";
  record.reconstruction.purpose_scope.intended_use.value = "Support review and scheduling of restoration surveys.";
  return record;
}

function syntheticAnalytical(record, evidenceId) {
  const best = { raw_value: 0.7314, display_precision: 4, metric: "ROC AUC", metric_key: "roc_auc", method: "Gradient Booster", task_target: "High restoration priority", evaluation_context: "held-out evaluation · 120 parcels", target_id: "TARGET-COAST", evidence_ids: [evidenceId] };
  const established = (value) => ({ state: "established", value, epistemic: "DERIVED", evidence_ids: [evidenceId] });
  const result = (method, value) => ({ method, metric: "roc_auc", value, persisted_precision: 4, evidence_ids: [evidenceId] });
  const analytical = {
    presentation: {
      best_final_result: best,
      focal_results_evaluation: {
        result: best,
        method: established("Gradient Booster"),
        target: established("High restoration priority"),
        evaluation_sample: established("120 held-out coastal parcels"),
        evaluation_design: established("The model was evaluated once on 120 held-out coastal parcels."),
        known_limitation: established("The held-out parcels cover only the documented study boundary."),
        establishes: established("The stored model achieved 0.7314 ROC AUC on the held-out sample."),
        does_not_establish: established("Performance outside the documented study boundary is not established."),
      },
    },
    object_graph: {
      schema_version: "synthetic-analytical-1",
      derivation: { mode: "deterministic_test_fixture" },
      provider_calls: 0,
      completeness: { state: "bounded" },
      best_final_result: best,
      target_definitions: [{ id: "TARGET-COAST", semantic_name: "High restoration priority", source_field: "priority_flag", construction_rule: "priority_score > threshold", positive_class: 1, interpretation: "derived_binary_target", epistemic: "OBSERVED", evidence_ids: [evidenceId] }],
      target_construction_steps: [{ id: "STEP-COAST", target_id: "TARGET-COAST", operation: "threshold", expression: "priority_score > threshold", epistemic: "OBSERVED", evidence_ids: [evidenceId] }],
      population_nodes: [{ id: "POP-SOURCE", role: "source", label: "Eligible coastal parcels", count: 600, unit: "parcels", epistemic: "OBSERVED", evidence_ids: [evidenceId] }, { id: "POP-EVAL", role: "evaluation", label: "Held-out evaluation parcels", count: 120, unit: "parcels", epistemic: "DERIVED", evidence_ids: [evidenceId] }],
      population_relations: [{ id: "REL-COAST", from: "POP-SOURCE", to: "POP-EVAL", relation: "held_out_split", predicate: "120 parcels were held out before fitting.", epistemic: "DERIVED", evidence_ids: [evidenceId] }],
      final_comparison_sets: [{ id: "COMPARE-COAST", target_id: "TARGET-COAST", display_label: "High restoration priority", methods: ["Gradient Booster", "Linear Model"], metrics: [{ key: "roc_auc", label: "ROC AUC", direction_of_better: "higher", score_input: "probability" }], results: [result("Gradient Booster", 0.7314), result("Linear Model", 0.6842)], evidence_ids: [evidenceId] }],
      diagnostic_observations: [{ id: "DIAG-COAST", type: "confusion_matrix", target_id: "TARGET-COAST", method: "Gradient Booster", final: true, tn: 68, fp: 12, fn: 17, tp: 23, orientation: { rows: "actual", columns: "predicted" }, evidence_ids: [evidenceId] }],
      prevalence_observations: [{ id: "PREV-COAST", target_id: "TARGET-COAST", population_id: "POP-EVAL", value: 0.3333, positive_count: 40, denominator: 120, evidence_ids: [evidenceId] }],
      feature_evidence_sets: [{ id: "FEATURE-SET-COAST", target_id: "TARGET-COAST", method: "Gradient Booster", estimator_variant: "final", feature_ids: ["FEATURE-A", "FEATURE-B"], evidence_ids: [evidenceId] }],
      feature_evidence: [{ id: "FEATURE-A", display_label: "Tidal exposure", value: 0.42, target_id: "TARGET-COAST", method: "Gradient Booster", target_name: "High restoration priority", evidence_ids: [evidenceId] }, { id: "FEATURE-B", display_label: "Vegetation cover", value: 0.31, target_id: "TARGET-COAST", method: "Gradient Booster", target_name: "High restoration priority", evidence_ids: [evidenceId] }],
      hyperparameter_searches: [{ id: "SEARCH-COAST", target_id: "TARGET-COAST", method: "Gradient Booster", search_type: "grid_search", stage_index: 1, cv_folds: 4, candidate_count: 8, best_score: 0.72, final_relationship: "compatible", evidence_ids: [evidenceId] }],
      model_runs: [{ id: "MODEL-COAST", target_id: "TARGET-COAST", method: "Gradient Booster", estimator_class: "SyntheticGradientBooster", roles: ["final"], parameters: { depth: 3 }, source_path: "models/coast.py", evidence_ids: [evidenceId] }],
      selection_statements: [{ id: "SELECT-COAST", type: "best_final_on_metric", target_id: "TARGET-COAST", method: "Gradient Booster", metric: "roc_auc", value: 0.7314, status: "established", evidence_ids: [evidenceId] }],
      output_production_statements: [{ id: "OUTPUT-COAST", target_id: "TARGET-COAST", producer_method: "Gradient Booster", output_type: "prediction_export", target_path: "outputs/priorities.csv", artefact_existence: "observed", consistency: "compatible", evidence_ids: [evidenceId] }],
      scoped_limitations: [{ id: "LIMIT-COAST", kind: "geographic_scope", subject_type: "PopulationNode", observed_fact: "The evaluation covers the documented study boundary.", derived_relationship: "Evaluation and intended use share the same recorded boundary.", bounded_interpretation: "Performance elsewhere is not established.", evidence_ids: [evidenceId] }],
    },
  };
  const source = { id: "POP-SOURCE", state: "established", display: "600 coastal parcels", count: 600, unit: "parcels", epistemic: "OBSERVED", evidence_ids: [evidenceId] };
  const training = { id: "POP-TRAIN", state: "established", display: "480 training parcels", count: 480, unit: "parcels", epistemic: "DERIVED", evidence_ids: [evidenceId] };
  const evaluation = { id: "POP-EVAL", state: "established", display: "120 held-out parcels", count: 120, unit: "parcels", epistemic: "DERIVED", evidence_ids: [evidenceId] };
  const comparisonSet = analytical.object_graph.final_comparison_sets[0];
  const diagnostic = { ...analytical.object_graph.diagnostic_observations[0], labels: ["standard", "priority"], values: [[68, 12], [17, 23]] };
  const featureItems = analytical.object_graph.feature_evidence;
  const lineage = { nodes: [source, training, evaluation], edges: [{ id: "REL-TRAIN", from: source.id, to: training.id, relation: "split", evidence_ids: [evidenceId] }, { id: "REL-EVAL", from: source.id, to: evaluation.id, relation: "split", evidence_ids: [evidenceId] }], contexts: [{ id: "LINEAGE-COAST", display_label: "High restoration priority", nodes: [source, training, evaluation], edges: [{ id: "REL-TRAIN", from: source.id, to: training.id, relation: "split", evidence_ids: [evidenceId] }, { id: "REL-EVAL", from: source.id, to: evaluation.id, relation: "split", evidence_ids: [evidenceId] }] }] };
  const answered = (answer, evidence = [evidenceId]) => ({ state: "answered", dashboard_available: true, answer, evidence_ids: evidence, related_evidence_ids: evidence, missing_requirements: [] });
  analytical.presentation.main_target_story = {
    status: "established",
    target: { id: "TARGET-COAST", label: "High restoration priority", workstream_id: "STREAM-COAST", evidence_ids: [evidenceId] },
    method: "Gradient Booster",
    result: best,
    evaluation_design: analytical.presentation.focal_results_evaluation.evaluation_design,
    comparison_sets: [comparisonSet],
    feature_evidence: featureItems,
    diagnostics: [diagnostic],
    populations: { source_data: source, model_sample: training, evaluation_sample: evaluation },
    population_lineage: lineage,
    section_answers: {
      purpose_scope: answered({ fields: record.reconstruction.purpose_scope }),
      results_evaluation: answered({ result: best, evaluation_design: analytical.presentation.focal_results_evaluation.evaluation_design }),
      feature_driver_evidence: answered({ items: featureItems }),
      model_comparison: answered({ sets: [comparisonSet] }),
      evaluation_behaviour: answered({ diagnostics: [diagnostic] }),
      data_populations_samples: answered({ populations: { source_data: source, model_sample: training, evaluation_sample: evaluation } }),
      data_missingness: { state: "unavailable", dashboard_available: false, answer: null, evidence_ids: [], related_evidence_ids: [], missing_requirements: ["quantified missingness"] },
      population_lineage: answered({ lineage }),
    },
  };
  return analytical;
}

test("v0.16.0 report uses runtime identity, purpose, result, counts, and deterministic Signal severity", async () => {
  const record = await syntheticRecord();
  const evidenceId = record.evidence[0].id;
  const analytical = syntheticAnalytical(record, evidenceId);
  const signals = buildSignalsLayer(record, { analyticalLayer: analytical });
  const presentation = buildFindingsPresentation(signals);
  const report = renderReport(record, { analyticalLayer: analytical, signalsLayer: signals, generatedAt: "2032-04-05T12:00:00.000Z" });
  assert.match(report, /Coastal Habitat Allocation/);
  assert.match(report, /Prioritises habitat restoration work/);
  assert.match(report, /ROC AUC/);
  assert.match(report, /0\.7314/);
  assert.match(report, /Gradient Booster/);
  assert.match(report, new RegExp(`>${presentation.signals.length}<`));
  assert.match(report, new RegExp(`>${presentation.evidence_gaps.length}<`));
  for (const signal of presentation.signals) assert.match(report, new RegExp(`>${signal.severity}<`));
});

test("Signals and Evidence Gaps remain separate and canonical duplicates render once", async () => {
  const record = await syntheticRecord();
  const analytical = syntheticAnalytical(record, record.evidence[0].id);
  const signals = buildSignalsLayer(record, { analyticalLayer: analytical });
  const original = buildFindingsPresentation(signals);
  if (signals.findings.length) signals.findings.push(structuredClone(signals.findings[0]));
  const deduplicated = buildFindingsPresentation(signals);
  const report = renderReport(record, { analyticalLayer: analytical, signalsLayer: signals });
  assert.equal(deduplicated.signals.length, original.signals.length);
  assert.equal(deduplicated.evidence_gaps.length, original.evidence_gaps.length);
  assert.equal((report.match(/class="finding signal"/g) || []).length, original.signals.length);
  assert.equal((report.match(/class="finding gap"/g) || []).length, original.evidence_gaps.length);
  assert.doesNotMatch(report, /Evidence Gap<\/b>[\s\S]{0,120}severity/i);
});

test("optional analytical sections omit cleanly while technical detail and processing metadata remain", async () => {
  const record = await syntheticRecord();
  const analytical = syntheticAnalytical(record, record.evidence[0].id);
  analytical.object_graph.feature_evidence_sets = [];
  analytical.object_graph.feature_evidence = [];
  analytical.presentation.main_target_story.section_answers.feature_driver_evidence = { state: "unavailable", dashboard_available: false, answer: null, evidence_ids: [], related_evidence_ids: [], missing_requirements: ["numerical importance"] };
  const report = renderReport(record, { analyticalLayer: analytical });
  assert.doesNotMatch(report, /id="feature-evidence"/);
  assert.match(report, /Technical appendix/);
  assert.match(report, /Target-construction ancestry/);
  assert.match(report, /Checks performed/);
  assert.match(report, /Bóveda processing metadata/);
});

test("report sections consume each shared supervisory answer independently", async () => {
  const record = await syntheticRecord();
  const evidenceId = record.evidence[0].id;
  const analytical = syntheticAnalytical(record, evidenceId);
  const unavailable = (requirement) => ({ state: "partial", dashboard_available: false, answer: null, evidence_ids: [], related_evidence_ids: [evidenceId], missing_requirements: [requirement] });
  analytical.presentation.main_target_story.section_answers.results_evaluation = unavailable("complete result story");
  analytical.presentation.main_target_story.section_answers.data_populations_samples = unavailable("three population amounts");
  analytical.presentation.main_target_story.section_answers.population_lineage = unavailable("connected lineage");
  analytical.presentation.main_target_story.section_answers.data_missingness = {
    state: "answered",
    dashboard_available: true,
    answer: { measurements: [{ id: "MISSING-SALINITY", field: "salinity", value: 4.5, unit: "percent", denominator: 600, evidence_ids: [evidenceId], epistemic: "OBSERVED" }] },
    evidence_ids: [evidenceId],
    related_evidence_ids: [evidenceId],
    missing_requirements: [],
  };
  const report = renderReport(record, { analyticalLayer: analytical });
  const dataSection = report.match(/<section class="report-section" id="data-populations">[\s\S]*?<\/section>/)?.[0] || "";
  const resultSection = report.match(/<section class="report-section major" id="results-evaluation">[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(dataSection, /Missing data before preparation|salinity|4\.5%/);
  assert.doesNotMatch(dataSection, /Source data|Model sample|Population \/ sample lineage/);
  assert.match(resultSection, /Model comparison/);
  assert.doesNotMatch(resultSection, /class="hero-result|What the result establishes/);
});

test("report uses the focal-target story when the richer graph cannot link its target", async () => {
  const record = await syntheticRecord();
  const evidenceId = record.evidence[0].id;
  const analytical = syntheticAnalytical(record, evidenceId);
  analytical.object_graph.best_final_result.target_id = null;
  analytical.object_graph.target_definitions = [];
  analytical.object_graph.feature_evidence_sets[0].target_id = null;
  analytical.object_graph.population_nodes.push({ id: "POP-OPERATIONS", role: "actual_scoring", label: "Operational scoring rows", count: 750, unit: "parcels", evidence_ids: [evidenceId] });
  const source = { id: "POP-ORIGINAL", state: "established", label: "Original data", display: "900 documented coastal parcels", count: 900, unit: "coastal parcels", epistemic: "OBSERVED", evidence_ids: [evidenceId] };
  const training = { id: "POP-TRAINING", state: "established", label: "Training data", display: "300 coastal parcels", count: 300, unit: "coastal parcels", epistemic: "OBSERVED", evidence_ids: [evidenceId] };
  const evaluation = { id: "POP-EVALUATION", state: "established", label: "Evaluation data", display: "120 coastal parcels", count: 120, unit: "coastal parcels", epistemic: "OBSERVED", evidence_ids: [evidenceId] };
  const inheritedAnswers = analytical.presentation.main_target_story.section_answers;
  const storyLineage = {
    nodes: [source, training, evaluation],
    edges: [
      { id: "REL-TRAINING", from: source.id, to: training.id, relation: "filter", evidence_ids: [evidenceId] },
      { id: "REL-EVALUATION", from: source.id, to: evaluation.id, relation: "filter", evidence_ids: [evidenceId] },
    ],
  };
  storyLineage.contexts = [{ id: "LINEAGE-STORY", display_label: "High restoration priority", nodes: storyLineage.nodes, edges: storyLineage.edges }];
  const featureItems = analytical.object_graph.feature_evidence.map((item) => ({ ...item, target_name: "High restoration priority" }));
  analytical.presentation.main_target_story = {
    status: "established",
    target: { id: null, label: "High restoration priority", workstream_id: "STREAM-COAST", evidence_ids: [evidenceId] },
    method: "Gradient Booster",
    result: analytical.presentation.best_final_result,
    comparison_sets: analytical.object_graph.final_comparison_sets,
    feature_evidence: featureItems,
    diagnostics: [],
    populations: { source_data: source, model_sample: training, evaluation_sample: evaluation },
    population_lineage: storyLineage,
    section_answers: {
      ...inheritedAnswers,
      feature_driver_evidence: { ...inheritedAnswers.feature_driver_evidence, answer: { items: featureItems } },
      data_populations_samples: { ...inheritedAnswers.data_populations_samples, answer: { populations: { source_data: source, model_sample: training, evaluation_sample: evaluation } } },
      population_lineage: { ...inheritedAnswers.population_lineage, answer: { lineage: storyLineage } },
    },
  };
  const report = renderReport(record, { analyticalLayer: analytical });
  const dataSection = report.match(/<section class="report-section" id="data-populations">[\s\S]*?<\/section>/)?.[0] || "";
  const featureSection = report.match(/<section class="report-section" id="feature-evidence">[\s\S]*?<\/section>/)?.[0] || "";
  const technicalSection = report.match(/<section class="report-section appendix major" id="technical-appendix">[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(dataSection, /900 documented coastal parcels/);
  assert.match(dataSection, /300 coastal parcels/);
  assert.match(dataSection, /120 coastal parcels/);
  assert.doesNotMatch(dataSection, /Operational scoring rows|750/);
  assert.match(featureSection, /High restoration priority/);
  assert.doesNotMatch(featureSection, /Target not established/);
  assert.match(technicalSection, /High restoration priority/);
  assert.match(technicalSection, /Complete construction ancestry not established/);
});

test("related feature evidence cannot override the shared section answer", async () => {
  const record = await syntheticRecord();
  const evidenceId = record.evidence[0].id;
  const analytical = syntheticAnalytical(record, evidenceId);
  analytical.presentation.main_target_story.feature_evidence = [{ id: "FEATURE-FALLBACK", display_label: "Fallback feature", value: 1, evidence_ids: [evidenceId] }];
  const report = renderReport(record, { analyticalLayer: analytical });
  const featureSection = report.match(/<section class="report-section" id="feature-evidence">[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(featureSection, /High restoration priority/);
  assert.doesNotMatch(featureSection, /Fallback feature/);
});

test("a canonical primary fallback keeps using its connected main-target story after target binding", async () => {
  const record = await syntheticRecord();
  const evidenceId = record.evidence[0].id;
  const analytical = syntheticAnalytical(record, evidenceId);
  const targetId = analytical.object_graph.best_final_result.target_id;
  analytical.object_graph.best_final_result.selection_mode = "canonical_primary_fallback";
  analytical.presentation.focal_results_evaluation = null;
  const inheritedAnswers = analytical.presentation.main_target_story.section_answers;
  const storyPopulations = {
    source_data: { id: "POP-STORY-SOURCE", state: "established", label: "Original data", display: "500 coastal records", count: 500, unit: "records", evidence_ids: [evidenceId] },
    model_sample: { id: "POP-STORY-TRAIN", state: "established", label: "Training data", display: "300 records", count: 300, unit: "records", evidence_ids: [evidenceId] },
    evaluation_sample: { id: "POP-STORY-EVAL", state: "established", label: "Evaluation data", display: "100 records", count: 100, unit: "records", evidence_ids: [evidenceId] },
  };
  const storyDesign = { state: "established", value: "A 75/25 train/test split produced 300 training and 100 evaluation observations.", epistemic: "DERIVED", evidence_ids: [evidenceId] };
  analytical.presentation.main_target_story = {
    status: "established",
    target: { id: targetId, label: "High restoration priority", evidence_ids: [evidenceId] },
    method: "Gradient Booster",
    result: analytical.object_graph.best_final_result,
    comparison_sets: analytical.object_graph.final_comparison_sets,
    feature_evidence: [{ id: "FEATURE-STORY", display_label: "Recorded tide level", evidence_type: "feature_usage", value: null, evidence_ids: [evidenceId] }],
    diagnostics: [],
    evaluation_design: storyDesign,
    populations: storyPopulations,
    population_lineage: { nodes: [], edges: [] },
    section_answers: {
      ...inheritedAnswers,
      results_evaluation: { ...inheritedAnswers.results_evaluation, answer: { result: analytical.object_graph.best_final_result, evaluation_design: storyDesign } },
      feature_driver_evidence: { state: "partial", dashboard_available: false, answer: null, evidence_ids: [], related_evidence_ids: [evidenceId], missing_requirements: ["numerical importance"] },
      data_populations_samples: { ...inheritedAnswers.data_populations_samples, answer: { populations: storyPopulations } },
      population_lineage: { state: "partial", dashboard_available: false, answer: null, evidence_ids: [], related_evidence_ids: [evidenceId], missing_requirements: ["connected lineage"] },
    },
  };
  const report = renderReport(record, { analyticalLayer: analytical });
  assert.match(report, /A 75\/25 train\/test split produced 300 training and 100 evaluation observations/);
  assert.doesNotMatch(report, /id="feature-evidence"|Recorded tide level/);
});

test("every report Evidence Token link resolves to the Evidence Appendix", async () => {
  const record = await syntheticRecord();
  const analytical = syntheticAnalytical(record, record.evidence[0].id);
  const report = renderReport(record, { analyticalLayer: analytical });
  const links = [...report.matchAll(/href="#(evidence-[^"]+)"/g)].map((match) => match[1]);
  assert.ok(links.length > 0);
  for (const id of new Set(links)) assert.match(report, new RegExp(`id="${id}"`));
  assert.match(report, /Raw evidence excerpts/);
  assert.match(report, /report applies no further truncation/);
});

test("report generation is self-contained, print-aware, provider-free, and contains no reference-case mapping", async () => {
  const source = await fs.readFile(new URL("../engine/client-report.mjs", import.meta.url), "utf8");
  const server = await fs.readFile(new URL("../engine/server.mjs", import.meta.url), "utf8");
  const record = await syntheticRecord();
  const report = renderReport(record, { analyticalLayer: syntheticAnalytical(record, record.evidence[0].id) });
  assert.match(report, /data:font\/otf;base64/);
  assert.match(report, /data:image\/svg\+xml;base64/);
  assert.match(report, /@page\{size:A4 portrait/);
  assert.match(report, /@media print/);
  assert.doesNotMatch(source, /Chelsea|R1_public|PRJ-1D50CE481C/);
  assert.doesNotMatch(source, /providerClient|generateContent|analyseProject/);
  const route = server.slice(server.indexOf('app.get(["/api/projects/:id/report"'), server.indexOf('app.post("/api/browse"'));
  assert.doesNotMatch(route, /analyseProject|reanalyse|provider/);
});
