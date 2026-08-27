import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { emptyReconstruction } from "../engine/contract.mjs";
import { buildSignalsLayer } from "../engine/signals.mjs";

function markdown(source) {
  return { cell_type: "markdown", source: [source], outputs: [] };
}

function code(source, output = "") {
  return {
    cell_type: "code",
    source: [source],
    outputs: output ? [{ output_type: "stream", text: [output] }] : [],
  };
}

function source(cells, path = "notebooks/service-populations.ipynb", evidenceId = "E-SERVICE") {
  return notebookFragments(JSON.stringify({ cells }), { id: evidenceId, path, kind: "notebook" });
}

function record(unit = "Service account") {
  const reconstruction = emptyReconstruction("Service demand planning");
  reconstruction.purpose_scope.unit = {
    state: "established", value: unit, epistemic: "OBSERVED", evidence_ids: ["E-SCOPE"],
  };
  return { project_id: "PRJ-FIXTURE", audit_id: "AUD-FIXTURE", reconstruction };
}

const completeAccounts = (active, inactive) => `Number of active accounts: ${active}\nNumber of non-active accounts: ${inactive}\nPercentage of accounts that are active: 80`;

test("the project population prefers broad complete entity coverage over larger repeated analytical rows", () => {
  const populations = source([
    markdown("# Population review"),
    code("summarize('../regions/north')", completeAccounts("1,240", "360")),
    code("summarize('../regions/south')", completeAccounts("700", "200")),
    markdown("# Sequence model"),
    code("print(len(train_rows), len(evaluation_rows))", "(4,200, 1,800)"),
  ]);
  const layer = buildAnalyticalLayer(record(), { sources: [populations] });
  const population = layer.presentation.project_population;
  assert.equal(population.role, "project_population");
  assert.equal(population.count, 1600);
  assert.equal(population.unit, "accounts");
  assert.equal(population.scope_label, "north");
  assert.equal(population.coverage, "complete_complementary_partition");
  assert.deepEqual(population.derivation, { operation: "sum", operands: [1240, 360] });
  assert.match(population.selection_basis, /repeated, model, evaluation, and output rows remain downstream/);
});

test("a complete population with an incompatible unit cannot populate the project card", () => {
  const households = source([
    markdown("# Population review"),
    code("summarize_households()", "Number of registered households: 1,240\nNumber of non-registered households: 360\nPercentage of households that are registered: 77.5"),
  ]);
  assert.equal(buildAnalyticalLayer(record("Inspection site"), { sources: [households] }).presentation.project_population, undefined);
});

test("an established broader canonical project population is not displaced by a smaller partition", () => {
  const fixtureRecord = record();
  fixtureRecord.reconstruction.samples.source_data = {
    state: "established", display: "2,000 accounts", count: 2000, unit: "accounts", epistemic: "OBSERVED", evidence_ids: ["E-SCOPE"],
  };
  const populations = source([
    markdown("# Population review"),
    code("summarize_accounts()", completeAccounts("1,240", "360")),
  ]);
  assert.equal(buildAnalyticalLayer(fixtureRecord, { sources: [populations] }).presentation.project_population, undefined);
});

test("a broad documented source inventory is recovered without borrowing downstream model counts", () => {
  const fixtureRecord = record("Sensor reading");
  fixtureRecord.evidence = [
    { id: "E-SCOPE", kind: "documentation", path: "README.md", excerpt: "Sensor readings are the unit of observation." },
    {
      id: "E-ARCHIVE",
      kind: "documentation",
      path: "DATA.md",
      excerpt: "The public archive contains\nmore than 8 million rows collected across monitoring stations. The evaluation dataset contains 12,000 records after the model split.",
    },
  ];
  fixtureRecord.reconstruction.data.data_sources = {
    state: "established", value: "Public sensor archive", epistemic: "OBSERVED", evidence_ids: ["E-ARCHIVE"],
  };
  const layer = buildAnalyticalLayer(fixtureRecord, { sources: [] });
  const population = layer.presentation.project_population;
  assert.equal(population.state, "established");
  assert.equal(population.display, "More than 8 million rows");
  assert.equal(population.count, null);
  assert.equal(population.numeric_value, 8000000);
  assert.equal(population.unit, "Sensor reading");
  assert.deepEqual(population.evidence_ids, ["E-ARCHIVE"]);
  const signals = buildSignalsLayer(fixtureRecord, { analyticalLayer: layer });
  const inventory = signals.checks.find((check) => check.check_id === "CHK-SOURCE-INVENTORY-COVERAGE");
  assert.equal(inventory.inputs.find((input) => input.object_id === "field-source-data").established, true);
  assert.equal(signals.findings.some((finding) => finding.impacts?.some((impact) => impact.object_id === "field-source-data")), false);
});

test("a smaller documented inventory does not displace an established canonical source population", () => {
  const fixtureRecord = record("Service account");
  fixtureRecord.reconstruction.samples.source_data = {
    state: "established", display: "12,000 accounts", count: 12000, unit: "accounts", epistemic: "OBSERVED", evidence_ids: ["E-SCOPE"],
  };
  fixtureRecord.evidence = [{
    id: "E-ARCHIVE", kind: "documentation", path: "DATA.md", excerpt: "The archived dataset contains 8,000 account records.",
  }];
  assert.equal(buildAnalyticalLayer(fixtureRecord, { sources: [] }).presentation.project_population, undefined);
});

test("persisted tabular scoring artefacts retain an output-population role and their own context", () => {
  const scoredOutput = source([
    markdown("# Route prioritisation"),
    code("scored_accounts = pd.read_parquet('../artifacts/account_scores.parquet')"),
    code("print(scored_accounts.shape)", "(875, 6)"),
  ], "notebooks/route-prioritisation.ipynb", "E-OUTPUT");
  const layer = buildAnalyticalLayer(record(), { sources: [scoredOutput] });
  const output = layer.sample_lineage.nodes.find((node) => node.role === "output");
  assert.ok(output);
  assert.equal(output.label, "Scored output population");
  assert.equal(output.count, 875);
  assert.equal(output.unit, "records");
  const context = layer.sample_lineage.contexts.find((item) => item.nodes.some((node) => node.id === output.id));
  assert.ok(context);
  assert.equal(context.nodes.length, 1);
  assert.equal(context.display_label, "Route prioritisation — scoring output");
  assert.equal(layer.component_availability.sample_lineage, "unavailable");
  assert.equal(layer.presentation.main_target_story.section_answers.population_lineage.dashboard_available, false);
});

test("the deterministic project population resolves only the source-inventory field gap", () => {
  const fixtureRecord = record();
  fixtureRecord.evidence = [
    { id: "E-SCOPE", kind: "documentation", path: "README.md", excerpt: "Service accounts are the project unit." },
    { id: "E-SERVICE", kind: "notebook", path: "notebooks/service-populations.ipynb", excerpt: "Persisted account population summary." },
  ];
  fixtureRecord.reconstruction.data.data_sources = {
    state: "established", value: "Authorised service-account extracts", epistemic: "OBSERVED", evidence_ids: ["E-SCOPE"],
  };
  const populations = source([
    markdown("# Population review"),
    code("summarize_accounts()", completeAccounts("1,240", "360")),
  ]);
  const analytical = buildAnalyticalLayer(fixtureRecord, { sources: [populations] });
  const { project_population: _projectPopulation, ...unprojectedPresentation } = analytical.presentation;
  const unprojectedSignals = buildSignalsLayer(fixtureRecord, { analyticalLayer: { ...analytical, presentation: unprojectedPresentation } });
  const signals = buildSignalsLayer(fixtureRecord, { analyticalLayer: analytical });
  const inventory = signals.checks.find((check) => check.check_id === "CHK-SOURCE-INVENTORY-COVERAGE");
  const lineage = signals.checks.find((check) => check.check_id === "CHK-POPULATION-LINEAGE-COMPATIBILITY");
  assert.equal(inventory.result, "NO SIGNAL DETECTED");
  assert.equal(unprojectedSignals.checks.find((check) => check.check_id === "CHK-SOURCE-INVENTORY-COVERAGE").result, "INSUFFICIENT EVIDENCE");
  assert.equal(lineage.result, unprojectedSignals.checks.find((check) => check.check_id === "CHK-POPULATION-LINEAGE-COMPATIBILITY").result);
  assert.equal(signals.findings.some((finding) => finding.impacts?.some((impact) => impact.object_id === "field-source-data")), false);
});
