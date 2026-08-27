export const PUBLIC_DEMO = (import.meta.env?.VITE_BOVEDA_RUNTIME || "demo") !== "local";
export const DEMO_DATA_VERSION = "v1.0.2";

function publicBase() {
  const base = import.meta.env?.BASE_URL || "/";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function demoAssetUrl(relativePath) {
  return `${publicBase()}/demo-data/${DEMO_DATA_VERSION}/${String(relativePath).replace(/^\/+/, "")}`;
}

export function reportAssetUrl(projectId, extension) {
  return demoAssetUrl(`projects/${encodeURIComponent(projectId)}/report.${extension}`);
}
