import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { layoutLineageGraph } from "../src/analytical-presentation.mjs";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("the project drawer flows dates after multi-line titles", async () => {
  const css = await read("../src/styles.css");
  assert.match(css, /v0\.20\.10 — readable project navigation/);
  assert.match(css, /\.project-menu-projects > article\s*\{[^}]*height:\s*auto[^}]*min-height:\s*145px/s);
  assert.match(css, /\.project-menu-project\s*\{[^}]*position:\s*relative[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.project-menu-project > strong\s*\{[^}]*position:\s*static[^}]*-webkit-line-clamp:\s*2/s);
  assert.match(css, /\.project-menu-project > time\s*\{[^}]*position:\s*static/s);
});

test("reanalysis uses a wider animated busy state and no title warning", async () => {
  const [main, css] = await Promise.all([read("../src/main.jsx"), read("../src/styles.css")]);
  assert.match(main, /is-reanalysing/);
  assert.match(main, /className="reanalysis-dots"/);
  assert.match(css, /\.record-title-action--primary\.is-reanalysing\s*\{[^}]*width:\s*158px/s);
  assert.match(css, /@keyframes reanalysis-dot/);
  assert.doesNotMatch(main, /record-warning|Some material fields are unresolved|function AlertIcon/);
});

test("desktop record actions align with the first title line and remain close to it", async () => {
  const [main, css] = await Promise.all([read("../src/main.jsx"), read("../src/styles.css")]);
  assert.match(main, /splitDashboardTitle\(projectTitle\)/);
  assert.match(main, /className="record-title-line"/);
  assert.match(css, /@media \(min-width: 1381px\)\s*\{[\s\S]*\.record-title-and-actions\s*\{[^}]*align-items:\s*flex-start[^}]*gap:\s*10px/s);
  assert.match(css, /\.record-title-line\s*\{[^}]*display:\s*block[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.record-title-actions\s*\{[^}]*gap:\s*8px[^}]*margin-top:\s*7px/s);
});

test("vertical lineage geometry follows graph depth instead of a fixed tall canvas", () => {
  const graph = layoutLineageGraph({
    nodes: [{ id: "source" }, { id: "train" }, { id: "test" }],
    edges: [
      { id: "one", from: "source", to: "train", relation: "split" },
      { id: "two", from: "source", to: "test", relation: "split" },
    ],
  }, { orientation: "vertical" });
  assert.equal(graph.height, 248);
  assert.ok(graph.height < 520);
});

test("small interface copy and empty states use the requested readable sizes", async () => {
  const css = await read("../src/styles.css");
  assert.doesNotMatch(css, /font-size:\s*11px/);
  assert.match(css, /\.empty-evidence-state__icon\s*\{[^}]*width:\s*30px[^}]*height:\s*30px/s);
  assert.match(css, /\.empty-evidence-state > strong,[\s\S]*font-size:\s*14px/);
  assert.match(css, /\.empty-evidence-state > p,[\s\S]*font-size:\s*12px/);
});

test("the v0.20.10 UX corrections contain no development-project answers", async () => {
  const runtime = await Promise.all([
    read("../src/project-display.mjs"),
    read("../src/main.jsx"),
    read("../src/analytical-presentation.mjs"),
    read("../src/styles.css"),
  ]).then((parts) => parts.join("\n"));
  assert.doesNotMatch(runtime, /R[1-6]_public|Chelsea|Insight Lane|NYC-311|22,466|2,283|1,026/);
});
