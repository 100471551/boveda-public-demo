import assert from "node:assert/strict";
import test from "node:test";
import { parseRoute, routeFor } from "../src/router.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_PROJECT_IDS = ["PRJ-2C27CC9912", "PRJ-1686EC052E", "PRJ-181CCD8192"];

test("routes map stable project URLs to the correct app view", () => {
  assert.deepEqual(parseRoute("/"), { screen: "welcome", projectId: null, activeView: "overview" });
  assert.deepEqual(parseRoute("/how-it-works"), { screen: "how-it-works", projectId: null, activeView: "overview" });
  assert.deepEqual(parseRoute("/projects"), { screen: "projects", projectId: null, activeView: "overview" });
  assert.deepEqual(parseRoute(`/projects/${PUBLIC_PROJECT_IDS[0]}`), { screen: "project", projectId: PUBLIC_PROJECT_IDS[0], activeView: "overview" });
  assert.deepEqual(parseRoute(`/projects/${PUBLIC_PROJECT_IDS[1]}/findings`), { screen: "project", projectId: PUBLIC_PROJECT_IDS[1], activeView: "signals" });
  assert.deepEqual(parseRoute(`/projects/${PUBLIC_PROJECT_IDS[2]}/history`), { screen: "project", projectId: PUBLIC_PROJECT_IDS[2], activeView: "history" });
});

test("route serialization is shareable and preserves project IDs", () => {
  assert.equal(routeFor({ screen: "welcome" }), "/");
  assert.equal(routeFor({ screen: "how-it-works" }), "/how-it-works");
  assert.equal(routeFor({ screen: "projects" }), "/projects");
  assert.equal(routeFor({ screen: "project", projectId: PUBLIC_PROJECT_IDS[0], activeView: "overview" }), `/projects/${PUBLIC_PROJECT_IDS[0]}`);
  assert.equal(routeFor({ screen: "project", projectId: PUBLIC_PROJECT_IDS[0], activeView: "signals" }), `/projects/${PUBLIC_PROJECT_IDS[0]}/findings`);
});

test("unknown and malformed paths fail safely to Projects", () => {
  assert.equal(parseRoute("/not-a-route").screen, "projects");
  assert.equal(parseRoute("/projects/PRJ-1/unknown").notFound, true);
  assert.equal(parseRoute("/projects/%E0%A4%A").notFound, true);
});

test("Vercel serves direct SPA routes through the static entry point", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = JSON.parse(await fs.readFile(path.join(root, "vercel.json"), "utf8"));
  assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/index.html" }]);
});

test("public routes use snapshot project IDs rather than source-folder paths", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const projects = JSON.parse(await fs.readFile(path.join(root, "public", "demo-data", "v1.0.2", "projects.json"), "utf8"));
  assert.deepEqual(projects.map((project) => project.project_id), PUBLIC_PROJECT_IDS);
  for (const project of projects) {
    const route = routeFor({ screen: "project", projectId: project.project_id, activeView: "overview" });
    assert.equal(parseRoute(route).projectId, project.project_id);
    assert.doesNotMatch(route, /R\d+_/);
  }
});
