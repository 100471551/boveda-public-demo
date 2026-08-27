import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { notebookFragments } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";

async function notebooks(root, current = root, files = []) {
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || [".git", "node_modules", ".venv", "dist", "build"].includes(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await notebooks(root, absolute, files);
    else if (entry.isFile() && entry.name.endsWith(".ipynb")) files.push(absolute);
  }
  return files;
}

async function validate(projectPath) {
  const root = await fs.realpath(projectPath);
  const sources = [];
  for (const file of await notebooks(root)) {
    const relative = path.relative(root, file);
    const evidence = {
      id: `E-${crypto.createHash("sha256").update(relative).digest("hex").slice(0, 10).toUpperCase()}`,
      path: relative,
      kind: "notebook",
    };
    sources.push(notebookFragments(await fs.readFile(file, "utf8"), evidence));
  }
  const layer = buildAnalyticalLayer({ project_id: "OFFLINE", audit_id: "OFFLINE" }, { sources });
  return {
    project: path.basename(root),
    notebooks: sources.length,
    provider_calls: layer.provider_calls,
    availability: layer.component_availability,
    counts: {
      workstreams: layer.workstreams.length,
      comparison_sets: layer.comparison_sets.length,
      results: layer.results.length,
      diagnostics: layer.diagnostics.length,
      feature_evidence: layer.feature_evidence.length,
      sample_nodes: layer.sample_lineage.nodes.length,
      sample_relations: layer.sample_lineage.edges.length,
      preparation_stages: layer.data_preparation.stages.length,
      missingness_values: layer.data_preparation.missingness.length,
      analytical_attempts: layer.analytical_attempts.length,
      source_visuals: layer.source_visuals.length,
      target_definitions: layer.target_definitions.length,
      target_construction_graphs: layer.target_construction_graphs.length,
      target_construction_steps: layer.target_construction_steps.length,
      target_construction_edges: layer.target_construction_edges.length,
      population_nodes: layer.object_graph.population_nodes.length,
      model_runs: layer.model_runs.length,
      hyperparameter_searches: layer.hyperparameter_searches.length,
      evaluation_attempts: layer.evaluation_attempts.length,
      prevalence_observations: layer.prevalence_observations.length,
      feature_evidence_sets: layer.feature_evidence_sets.length,
      output_production_statements: layer.output_production_statements.length,
      persisted_artefacts: layer.persisted_artefacts.length,
      scoped_limitations: layer.scoped_limitations.length,
      evidence_bindings: layer.evidence_bindings.length,
    },
    comparison_contexts: layer.comparison_sets.map((set) => ({
      workstream: set.workstream,
      methods: set.methods,
      metrics: set.metrics.map((metric) => metric.key),
      evaluation_phase: set.evaluation_phase,
      evaluation_variant: set.evaluation_variant,
    })),
  };
}

const projects = process.argv.slice(2).filter((argument) => argument !== "--");
if (!projects.length) {
  console.error("Usage: pnpm validate:analytical -- /absolute/path/to/project [...]");
  process.exitCode = 2;
} else {
  const results = [];
  for (const project of projects) results.push(await validate(project));
  console.log(JSON.stringify({ schema_version: "boveda-analytical-validation-0.13.2", results }, null, 2));
}
