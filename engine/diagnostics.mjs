import crypto from "node:crypto";

const CREDENTIAL = /(?:sk-[A-Za-z0-9_-]+|Bearer\s+[^\s]+|(?:api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+)/gi;

export function sanitizeDiagnosticMessage(value, maximum = 500) {
  const safe = String(value || "Unknown failure").replace(CREDENTIAL, "[credential redacted]").replace(/\s+/g, " ").trim();
  return safe.length > maximum ? `${safe.slice(0, maximum - 1)}…` : safe;
}

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

export function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const normalized = {
    input_tokens: finite(usage.input_tokens),
    cached_input_tokens: finite(usage.input_tokens_details?.cached_tokens),
    cache_write_input_tokens: finite(usage.input_tokens_details?.cache_write_tokens),
    output_tokens: finite(usage.output_tokens),
    reasoning_output_tokens: finite(usage.output_tokens_details?.reasoning_tokens),
    total_tokens: finite(usage.total_tokens),
  };
  return Object.values(normalized).some((value) => value !== null) ? normalized : null;
}

export function aggregateUsage(attempts) {
  const withUsage = attempts.map((attempt) => attempt.usage).filter(Boolean);
  if (!withUsage.length) return null;
  const keys = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
  const totals = { attempts_with_usage: withUsage.length };
  for (const key of keys) {
    const values = withUsage.map((usage) => usage[key]).filter(Number.isFinite);
    totals[key] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  return totals;
}

export function paidModelActivity(attempts) {
  if (attempts.some((attempt) => Number(attempt.usage?.total_tokens) > 0)) return true;
  if (!attempts.some((attempt) => attempt.provider_call_started)) return false;
  return null;
}

export function classifyValidationFailure(errors = []) {
  const grounding = errors.some((error) => /evidence|numeric value|ground/i.test(error));
  const semantic = errors.some((error) => !/evidence|numeric value|ground/i.test(error));
  if (grounding && semantic) return "grounding_and_validation";
  return grounding ? "grounding" : "validation";
}

export function evidencePackSummary(evidence = []) {
  const packed = evidence.map((item) => `${item.id}\n${item.kind}\n${item.path}\n${item.sha256}\n${item.excerpt}`).join("\n\n");
  return {
    item_count: evidence.length,
    character_count: evidence.reduce((sum, item) => sum + String(item.excerpt || "").length, 0),
    sha256: crypto.createHash("sha256").update(packed).digest("hex"),
  };
}

export class AttemptError extends Error {
  constructor(stage, message, metadata = {}) {
    super(sanitizeDiagnosticMessage(message));
    this.name = "AttemptError";
    this.stage = stage;
    this.metadata = metadata;
  }
}

export function attemptFailure(stage, message, metadata = {}) {
  return new AttemptError(stage, message, metadata);
}

function historicalPaidStatus(provider) {
  return Number(provider?.usage?.total_tokens) > 0 ? true : null;
}

export function diagnosticsForRecord(record, relatedLegacyAudits = []) {
  if (record?.diagnostics?.schema_version === "boveda-audit-diagnostics-0.9.3") {
    return { ...record.diagnostics, related_legacy_audits: relatedLegacyAudits };
  }
  const provider = record?.provider || {};
  return {
    schema_version: "boveda-audit-diagnostics-0.9.3",
    availability: "historical_partial",
    historical: true,
    note: "This audit predates v0.9.3 instrumentation. Only metadata already present in the preserved record is shown; attempt timing and failed-attempt usage are unavailable.",
    audit_id: record?.audit_id || null,
    audit_started_at: null,
    audit_completed_at: record?.analysed_at || null,
    total_duration_ms: null,
    stages: [],
    llm: {
      provider: provider.provider || null,
      model: provider.model || null,
      result: provider.generation_mode || "unknown",
      attempt_count: Number.isFinite(provider.attempts) ? provider.attempts : null,
      provider_call_count: null,
      paid_model_activity: historicalPaidStatus(provider),
      total_usage: normalizeUsage(provider.usage),
      response_id: provider.response_id || null,
      rejected_candidates: Array.isArray(provider.rejected_candidates) ? provider.rejected_candidates : [],
      fallback_reason: provider.fallback_reason ? sanitizeDiagnosticMessage(provider.fallback_reason) : null,
      attempts: [],
    },
    final: {
      generation_mode: provider.generation_mode || null,
      validation_status: record?.validation?.status || null,
    },
    unavailable: [
      "Audit and stage duration",
      "Per-attempt token usage",
      "Provider versus structured-output failure stage",
      "Whether fallback followed unrecorded paid attempts",
    ],
    related_legacy_audits: relatedLegacyAudits,
  };
}
