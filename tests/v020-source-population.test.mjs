import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { emptyReconstruction } from "../engine/contract.mjs";
import { collectEvidence } from "../engine/inventory.mjs";
import { populationPartitionAnnotation, recognizePopulationPartitions } from "../engine/population-evidence.mjs";
import { validateReconstruction } from "../engine/validate.mjs";

const unrelatedPartition = `[PERSISTED OUTPUT]
Number of registered households: 1,240
Number of non-registered households: 360
Percentage of households that are registered: 77.5
`;

test("explicit complementary population categories produce one bounded deterministic total", () => {
  const partitions = recognizePopulationPartitions(unrelatedPartition);
  assert.equal(partitions.length, 1);
  assert.deepEqual(partitions[0], {
    key: "registered households|non-registered households|1240|360|households",
    recognition: "explicit_complementary_population_partition",
    unit: "households",
    components: [
      { label: "registered households", count: 1240 },
      { label: "non-registered households", count: 360 },
    ],
    total: 1600,
  });

  const annotation = populationPartitionAnnotation(unrelatedPartition);
  assert.match(annotation, /DETERMINISTIC POPULATION PARTITION/);
  assert.match(annotation, /Derived population size: 1,600 household records/);
  assert.match(annotation, /separate evidence must connect it to a source, model, evaluation, or scoring role/);
});

test("ordinary category counts are not treated as an exhaustive population partition", () => {
  const unrelatedCategories = `[PERSISTED OUTPUT]
Number of urban households: 1,240
Number of rural households: 360
Percentage of households that are urban: 77.5
`;
  assert.deepEqual(recognizePopulationPartitions(unrelatedCategories), []);

  const missingPopulationContext = `[PERSISTED OUTPUT]
Number of registered households: 1,240
Number of non-registered households: 360
`;
  assert.deepEqual(recognizePopulationPartitions(missingPopulationContext), []);
});

test("notebook collection exposes a grounded derived partition total without changing the source file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-population-partition-"));
  const notebookPath = path.join(root, "population-summary.ipynb");
  const notebook = {
    cells: [{
      cell_type: "code",
      source: ["summarize_households(snapshot)"],
      outputs: [{ output_type: "stream", text: unrelatedPartition.replace("[PERSISTED OUTPUT]\n", "") }],
    }],
  };
  await fs.writeFile(notebookPath, JSON.stringify(notebook));
  const before = await fs.readFile(notebookPath, "utf8");
  const collected = await collectEvidence(root);
  const after = await fs.readFile(notebookPath, "utf8");
  assert.equal(after, before);

  const evidence = collected.evidence.find((item) => item.path === "population-summary.ipynb");
  assert.match(evidence.excerpt, /^\[DETERMINISTIC POPULATION PARTITION\]/);
  assert.match(evidence.excerpt, /1,240 \+ 360 = 1,600/);

  const reconstruction = emptyReconstruction("Household access study");
  reconstruction.samples.source_data = {
    state: "established",
    display: "1,600 household records",
    count: 1600,
    unit: "households",
    epistemic: "DERIVED",
    evidence_ids: [evidence.id],
  };
  assert.equal(validateReconstruction(reconstruction, collected.evidence).status, "VALID");
});
