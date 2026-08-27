import crypto from "node:crypto";
import { APPLICATION_VERSION } from "./version.mjs";

export const VERSION = APPLICATION_VERSION;
export const NOT_ESTABLISHED = "Not established from available evidence.";
export const EXECUTION_REQUIRED = "Execution required.";
export const FIELD_STATES = ["established", "not_established", "execution_required"];
export const EPISTEMIC_STATES = ["OBSERVED", "DERIVED", "INTERPRETED_INFERRED", "UNRESOLVED"];

const evidenceIds = { type: "array", items: { type: "string" } };
const field = {
  type: "object",
  additionalProperties: false,
  required: ["state", "value", "epistemic", "evidence_ids"],
  properties: {
    state: { type: "string", enum: FIELD_STATES },
    value: { type: "string" },
    epistemic: { type: "string", enum: EPISTEMIC_STATES },
    evidence_ids: evidenceIds,
  },
};
const sample = {
  type: "object",
  additionalProperties: false,
  required: ["state", "display", "count", "unit", "epistemic", "evidence_ids"],
  properties: {
    state: { type: "string", enum: FIELD_STATES },
    display: { type: "string" },
    count: { anyOf: [{ type: "number" }, { type: "null" }] },
    unit: { type: "string" },
    epistemic: { type: "string", enum: EPISTEMIC_STATES },
    evidence_ids: evidenceIds,
  },
};
const result = {
  type: "object",
  additionalProperties: false,
  required: ["state", "display_value", "metric", "method", "task_target", "evaluation_context", "epistemic", "evidence_ids"],
  properties: {
    state: { type: "string", enum: FIELD_STATES },
    display_value: { type: "string" },
    metric: { type: "string" },
    method: { type: "string" },
    task_target: { type: "string" },
    evaluation_context: { type: "string" },
    epistemic: { type: "string", enum: EPISTEMIC_STATES },
    evidence_ids: evidenceIds,
  },
};

export const reconstructionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["identity", "purpose_scope", "samples", "results_evaluation", "data", "confidence"],
  properties: {
    identity: {
      type: "object", additionalProperties: false, required: ["name", "description"],
      properties: { name: field, description: field },
    },
    purpose_scope: {
      type: "object", additionalProperties: false,
      required: ["summary", "purpose", "task", "target_outcome", "unit", "population_scope", "intended_use"],
      properties: {
        summary: field, purpose: field, task: field, target_outcome: field,
        unit: field, population_scope: field, intended_use: field,
      },
    },
    samples: {
      type: "object", additionalProperties: false,
      required: ["source_data", "model_sample", "evaluation_sample"],
      properties: { source_data: sample, model_sample: sample, evaluation_sample: sample },
    },
    results_evaluation: {
      type: "object", additionalProperties: false,
      required: ["primary_result", "material_results", "evaluation_design", "other_material_result", "known_limitation", "establishes", "does_not_establish"],
      properties: {
        primary_result: result,
        material_results: { type: "array", maxItems: 3, items: result },
        evaluation_design: field,
        other_material_result: field,
        known_limitation: field,
        establishes: field,
        does_not_establish: field,
      },
    },
    data: {
      type: "object", additionalProperties: false,
      required: ["summary", "data_sources", "unit_of_observation", "period", "population_filters", "population_limitation"],
      properties: {
        summary: field, data_sources: field, unit_of_observation: field,
        period: field, population_filters: field, population_limitation: field,
      },
    },
    confidence: {
      type: "object", additionalProperties: false,
      required: ["level", "explanation", "evidence_ids"],
      properties: {
        level: { type: "string", enum: ["High", "Medium", "Low", "Not established"] },
        explanation: { type: "string" },
        evidence_ids: evidenceIds,
      },
    },
  },
};

export function unresolvedField(state = "not_established") {
  return {
    state,
    value: state === "execution_required" ? EXECUTION_REQUIRED : NOT_ESTABLISHED,
    epistemic: "UNRESOLVED",
    evidence_ids: [],
  };
}

export function unresolvedSample(state = "not_established") {
  return {
    state,
    display: state === "execution_required" ? EXECUTION_REQUIRED : "–",
    count: null,
    unit: "",
    epistemic: "UNRESOLVED",
    evidence_ids: [],
  };
}

export function unresolvedResult(state = "not_established") {
  const missing = state === "execution_required" ? EXECUTION_REQUIRED : NOT_ESTABLISHED;
  return {
    state, display_value: state === "execution_required" ? EXECUTION_REQUIRED : "–",
    metric: missing, method: "", task_target: "", evaluation_context: "",
    epistemic: "UNRESOLVED", evidence_ids: [],
  };
}

export function emptyReconstruction(projectName) {
  const missing = unresolvedField();
  return {
    identity: {
      name: { state: "established", value: projectName, epistemic: "OBSERVED", evidence_ids: ["E-SYSTEM-PATH"] },
      description: unresolvedField(),
    },
    purpose_scope: {
      summary: unresolvedField(), purpose: unresolvedField(), task: unresolvedField(),
      target_outcome: unresolvedField(), unit: unresolvedField(), population_scope: unresolvedField(), intended_use: unresolvedField(),
    },
    samples: { source_data: unresolvedSample(), model_sample: unresolvedSample(), evaluation_sample: unresolvedSample() },
    results_evaluation: {
      primary_result: unresolvedResult(), material_results: [], evaluation_design: unresolvedField(),
      other_material_result: unresolvedField(), known_limitation: unresolvedField(),
      establishes: unresolvedField(), does_not_establish: unresolvedField(),
    },
    data: {
      summary: unresolvedField(), data_sources: unresolvedField(), unit_of_observation: unresolvedField(),
      period: unresolvedField(), population_filters: unresolvedField(), population_limitation: unresolvedField(),
    },
    confidence: { level: "Not established", explanation: "Confidence cannot be assessed because no supported performance result was established.", evidence_ids: [] },
  };
}

export function projectId(realPath) {
  return `PRJ-${crypto.createHash("sha256").update(realPath).digest("hex").slice(0, 10).toUpperCase()}`;
}

export function auditId() {
  return `AUD-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}
