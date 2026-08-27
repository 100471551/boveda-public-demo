import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectEvidence, contentSnapshot, projectStaticEvidence } from "../engine/inventory.mjs";
import { buildReconstructionGraph } from "../engine/reconstruction-graph.mjs";

test("standard environment manifests are retained as evidence and reconstructed generically", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-estuary-manifests-"));
  try {
    await fs.writeFile(path.join(root, "README.md"), "Synthetic estuary classifier.\n");
    await fs.writeFile(path.join(root, "requirements.txt"), "pandas==2.3.0\nscikit-learn==1.7.0\n");
    await fs.writeFile(path.join(root, "environment_linux.yml"), "name: estuary\ndependencies:\n  - python=3.12\n");
    await fs.writeFile(path.join(root, "conda-linux-64.lock"), "# exact synthetic lock\npython 3.12\n");
    await fs.writeFile(path.join(root, "Dockerfile"), "FROM python:3.12-slim\n");
    const collected = await collectEvidence(root);
    const manifests = collected.evidence.filter((item) => item.kind === "environment_or_dependency_manifest");
    assert.deepEqual(new Set(manifests.map((item) => item.path)), new Set(["requirements.txt", "environment_linux.yml", "conda-linux-64.lock", "Dockerfile"]));

    const preserved = JSON.parse(await fs.readFile(new URL("../preserved-audits/v0.9.2/records/R3.json", import.meta.url), "utf8"));
    const record = structuredClone(preserved);
    const snapshot = await contentSnapshot(root);
    record.source_project = { path: root, content_snapshot_before: snapshot, content_snapshot_after: snapshot, modified: false };
    record.evidence = record.evidence.filter((item) => item.kind !== "environment_or_dependency_manifest");
    const projected = await projectStaticEvidence(record);
    assert.equal(projected.evidence.filter((item) => item.kind === "environment_or_dependency_manifest").length, 4);
    const graph = buildReconstructionGraph(projected, { sources: [], legacy: {} });
    assert.equal(graph.environment_configurations.length, 4);
    assert.ok(graph.environment_configurations.every((item) => item.evidence_ids.length === 1 && item.content_sha256));
    assert.equal(graph.completeness.environments, "available");

    await fs.writeFile(path.join(root, "requirements.txt"), "pandas==2.4.0\n");
    const staleProjection = await projectStaticEvidence(record);
    assert.equal(staleProjection, record);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
