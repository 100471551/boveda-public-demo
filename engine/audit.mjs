import path from "node:path";
import fs from "node:fs/promises";
import { auditId, projectId, VERSION } from "./contract.mjs";
import { collectEvidence, contentSnapshot } from "./inventory.mjs";
import { reconstruct } from "./reconstruct.mjs";
import { saveRecord } from "./persistence.mjs";
import { evidencePackSummary } from "./diagnostics.mjs";

export async function analyseProject(projectPath, options = {}) {
  const auditStartedAt = Date.now();
  const stages = [];
  if (!projectPath || typeof projectPath !== "string") throw new Error("A project directory is required.");
  const resolutionStarted = Date.now();
  const resolved = await fs.realpath(path.resolve(projectPath));
  stages.push({ stage: "source_resolution", status: "succeeded", duration_ms: Date.now() - resolutionStarted });

  const evidenceStarted = Date.now();
  const before = await contentSnapshot(resolved);
  const collected = await collectEvidence(resolved);
  const pack = evidencePackSummary(collected.evidence);
  stages.push({
    stage: "evidence_collection",
    status: "succeeded",
    duration_ms: Date.now() - evidenceStarted,
    evidence_items: pack.item_count,
    evidence_characters: pack.character_count,
    evidence_pack_sha256: pack.sha256,
    eligible_files: collected.inventory?.eligible_files ?? null,
    collected_items: collected.inventory?.collected_items ?? null,
  });

  const reconstructionStarted = Date.now();
  const generated = await reconstruct({
    projectRoot: resolved,
    evidence: collected.evidence,
    model: options.model,
    allowFallback: options.allowFallback !== false,
  });
  stages.push({
    stage: "llm_reconstruction",
    status: generated.diagnostics.result,
    duration_ms: Date.now() - reconstructionStarted,
    attempts: generated.diagnostics.attempt_count,
    provider_calls: generated.diagnostics.provider_call_count,
    validation_status: generated.validation.status,
  });

  const integrityStarted = Date.now();
  const after = await contentSnapshot(resolved);
  if (before !== after) throw new Error("Read-only invariant failed: imported project content changed during analysis.");
  stages.push({ stage: "source_integrity", status: "succeeded", duration_ms: Date.now() - integrityStarted, content_unchanged: true });

  const id = auditId();
  const completedAt = new Date().toISOString();
  stages.push({ stage: "final_record", status: "succeeded", duration_ms: 0 });
  const record = {
    schema_version: "boveda-supervisory-record-0.9.0",
    product_version: VERSION,
    project_id: projectId(resolved),
    audit_id: id,
    analysed_at: completedAt,
    source_project: { path: resolved, content_snapshot_before: before, content_snapshot_after: after, modified: false },
    inventory: collected.inventory,
    provider: generated.provider,
    validation: generated.validation,
    reconstruction: generated.reconstruction,
    evidence: collected.evidence,
    diagnostics: {
      schema_version: "boveda-audit-diagnostics-0.9.3",
      availability: "complete",
      historical: false,
      audit_id: id,
      audit_started_at: new Date(auditStartedAt).toISOString(),
      audit_completed_at: completedAt,
      total_duration_ms: Date.now() - auditStartedAt,
      stages,
      evidence_pack: pack,
      llm: generated.diagnostics,
      final: {
        generation_mode: generated.provider.generation_mode,
        validation_status: generated.validation.status,
        source_unchanged: true,
      },
    },
  };
  if (options.persist !== false) await saveRecord(record);
  return record;
}
