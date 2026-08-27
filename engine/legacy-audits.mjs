import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./persistence.mjs";

const BUNDLE = path.join(ROOT, "preserved-audits", "v0.9.2");
let manifestPromise;

async function manifest() {
  manifestPromise ||= fs.readFile(path.join(BUNDLE, "manifest.json"), "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return { legacy_audits: [] };
      throw error;
    });
  return manifestPromise;
}

export async function legacyAuditsForProject(projectId) {
  const data = await manifest();
  return (data.legacy_audits || []).filter((item) => item.project_id === projectId).map((item) => ({
    audit_id: item.audit_id,
    label: item.label,
    reported_outcome: item.reported_outcome,
    telemetry_availability: item.telemetry_availability,
    report_url: `/api/legacy-audits/${item.audit_id}/report`,
  }));
}

export async function legacyReportPath(auditId) {
  const data = await manifest();
  const item = (data.legacy_audits || []).find((entry) => entry.audit_id === auditId);
  if (!item) return null;
  const resolved = path.resolve(BUNDLE, item.report);
  return resolved.startsWith(`${BUNDLE}${path.sep}`) ? resolved : null;
}
