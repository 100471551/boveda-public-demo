import { demoAssetUrl, PUBLIC_DEMO } from "./runtime-config.mjs";

export function publicDemoRequestUrl(url, method = "GET") {
  if (method.toUpperCase() !== "GET") return null;
  if (url === "/api/projects") return demoAssetUrl("projects.json");
  const match = url.match(/^\/api\/projects\/([^/]+)(?:\/(signals|history|analytical|diagnostics))?$/);
  if (!match) return null;
  const [, projectId, layer = "record"] = match;
  return demoAssetUrl(`projects/${encodeURIComponent(projectId)}/${layer}.json`);
}

async function jsonResponse(response, url) {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (response.status === 404 && url === "/api/projects/order") {
      const error = new Error("The local Bóveda server needs to restart before projects can be reordered.");
      error.code = "PROJECT_ORDER_ENDPOINT_UNAVAILABLE";
      throw error;
    }
    throw new Error(response.ok ? "Bóveda received an unexpected response." : `Request failed (${response.status}).`);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Bóveda received an invalid response."); }
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

export async function requestBovedaJson(url, options = {}, fetchImpl = fetch) {
  const method = String(options.method || "GET").toUpperCase();
  if (PUBLIC_DEMO) {
    const staticUrl = publicDemoRequestUrl(url, method);
    if (!staticUrl) {
      const error = new Error("This action is unavailable in the public demo.");
      error.code = "PUBLIC_DEMO_READ_ONLY";
      throw error;
    }
    return jsonResponse(await fetchImpl(staticUrl, { headers: { Accept: "application/json" } }), staticUrl);
  }

  const response = await fetchImpl(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  return jsonResponse(response, url);
}
