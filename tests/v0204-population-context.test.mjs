import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { populationLineageContexts, samplesForPopulationContext } from "../src/population-context.mjs";

const sample = (count, unit = "entities") => ({ state: "established", display: `${count} ${unit}`, count, unit, epistemic: "OBSERVED", evidence_ids: ["E-PROJECT"] });

test("the broad project population stays fixed while the selected workstream supplies downstream samples", () => {
  const projectSamples = { source_data: sample(10_000), model_sample: sample(400), evaluation_sample: sample(100) };
  const contexts = [
    { id: "context-tabular", training_count: 400, evaluation_count: 100, nodes: [
      { id: "train-tabular", role: "training", count: 400, unit: "entities", epistemic: "OBSERVED", evidence_ids: ["E-A"] },
      { id: "test-tabular", role: "evaluation", count: 100, unit: "entities", epistemic: "OBSERVED", evidence_ids: ["E-A"] },
    ] },
    { id: "context-sequence", training_count: 2_990, evaluation_count: 990, nodes: [
      { id: "train-rows", role: "training", count: 3_000, unit: "rows", epistemic: "OBSERVED", evidence_ids: ["E-B"] },
      { id: "train-sequences", role: "training", count: 2_990, unit: "sequences", epistemic: "OBSERVED", evidence_ids: ["E-C"] },
      { id: "test-sequences", role: "evaluation", count: 990, unit: "sequences", epistemic: "OBSERVED", evidence_ids: ["E-C"] },
    ] },
  ];
  const displayed = samplesForPopulationContext(projectSamples, contexts[1]);
  assert.equal(displayed.source_data, projectSamples.source_data);
  assert.equal(displayed.model_sample.count, 2_990);
  assert.equal(displayed.model_sample.unit, "sequences");
  assert.equal(displayed.evaluation_sample.count, 990);
  assert.deepEqual(displayed.model_sample.evidence_ids, ["E-C"]);
});

test("the default context preserves a more specific canonical sample description", () => {
  const projectSamples = {
    source_data: sample(1_000, "properties"),
    model_sample: { ...sample(80, "properties"), display: "80 training properties" },
    evaluation_sample: { ...sample(20, "properties"), display: "20 held-out properties" },
  };
  const context = { id: "context-default", training_count: 80, evaluation_count: 20, nodes: [
    { id: "train", role: "training", count: 80, unit: "observations", evidence_ids: ["E-A"] },
    { id: "test", role: "evaluation", count: 20, unit: "observations", evidence_ids: ["E-A"] },
  ] };
  const displayed = samplesForPopulationContext(projectSamples, context);
  assert.equal(displayed.model_sample.display, "80 training properties");
  assert.equal(displayed.evaluation_sample.display, "20 held-out properties");
});

test("an output-only context does not inherit unrelated model and evaluation samples", () => {
  const projectSamples = { source_data: sample(500), model_sample: sample(300), evaluation_sample: sample(200) };
  const output = { id: "context-output", nodes: [{ id: "output", role: "output", count: 480, unit: "entities", evidence_ids: ["E-OUTPUT"] }] };
  const displayed = samplesForPopulationContext(projectSamples, output);
  assert.equal(displayed.source_data.count, 500);
  assert.equal(displayed.model_sample.state, "not_applicable");
  assert.equal(displayed.evaluation_sample.state, "not_applicable");
  assert.equal(displayed.model_sample.epistemic, "DERIVED");
  assert.match(displayed.model_sample.display, /output context/);
});

test("lineage contexts are derived from generic workstream identities when no context projection exists", () => {
  const lineage = {
    nodes: [
      { id: "a", workstream_id: "stream-a", workstream: "Unrelated analysis", role: "training", count: 80 },
      { id: "b", workstream_id: "stream-a", workstream: "Unrelated analysis", role: "evaluation", count: 20 },
    ],
    edges: [{ id: "edge", from: "a", to: "b", relation: "split" }],
  };
  const contexts = populationLineageContexts(lineage);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].workstream_id, "stream-a");
  assert.deepEqual(contexts[0].edges.map((edge) => edge.id), ["edge"]);
});

test("the dashboard and lineage map share the focal target story", async () => {
  const [main, view] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(main, /const displayedSamples = mainTargetStory\?\.populations \|\| r\.samples/);
  assert.match(main, /<HeroPopulationStrip samples=\{displayedSamples\}/);
  assert.match(main, /<PopulationFunnel samples=\{displayedSamples\}/);
  assert.match(main, /<AnalyticalData layer=\{analyticalLayer\} reconstruction=\{r\} onTrail=\{onTrail\}/);
  assert.match(main, /samples-card--wide-downstream/);
  assert.match(view, /answers\.population_lineage\?\.dashboard_available \? answers\.population_lineage\.answer\?\.lineage/);
  assert.match(view, /contexts\.length > 1 \? <ContextSwitcher/);
});
