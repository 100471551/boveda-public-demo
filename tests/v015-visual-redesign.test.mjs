import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

async function sources() {
  return Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/history-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
}

test("Projects is the default data-driven surface and retains import, open, and removal", async () => {
  const [app] = await sources();
  assert.match(app, /function ProjectsSurface/);
  assert.match(app, /projects\.map\(\(project, index\)/);
  assert.match(app, /onOpen\(project\.project_id\)/);
  assert.match(app, /onDelete\(\{ \.\.\.project, name: title \}\)/);
  assert.match(app, /className="projects-import" onClick=\{onAdd\}/);
  assert.match(app, /api\("\/api\/projects"\)\.then\(\(items\)/);
  assert.doesNotMatch(app, /function Sidebar/);
});

test("project navigation uses the directory badge and keeps all three record views", async () => {
  const [app] = await sources();
  assert.match(app, /aria-label="Back to Projects"/);
  assert.match(app, /function showProjects\(\)/);
  assert.match(app, />Overview<\/button>/);
  assert.match(app, />Findings\{signalsLayer/);
  assert.match(app, />History<\/button>/);
  assert.match(app, /Download Report/);
});

test("normal Overview removes reconstruction status dots without removing coverage", async () => {
  const [app, signals] = await sources();
  const table = app.match(/function DataTable[\s\S]*?\n\}/)?.[0] || "";
  const heading = app.match(/function SectionHeading[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(table, /StatusDot/);
  assert.doesNotMatch(heading, /StatusDot/);
  assert.match(app, /showStatus=\{false\}/);
  assert.match(signals, /function CoverageIndicator[\s\S]*StatusDot/);
});

test("Findings counts and cards are runtime-derived while checks remain collapsed by default", async () => {
  const [, signals] = await sources();
  assert.match(signals, /presentation\.signals\.length/);
  assert.match(signals, /presentation\.evidence_gaps\.length/);
  assert.match(signals, /layer\.checks\.length/);
  assert.match(signals, /presentation\.signals\.slice\(0, signalLimit\)/);
  assert.match(signals, /onClick=\{\(\) => onInspect\(item\.trail_entry\)\}/);
  assert.match(signals, /<details className="checks-performed">/);
  assert.doesNotMatch(signals, /<details className="checks-performed" open/);
});

test("History and reconstruction detail use accessible progressive disclosure", async () => {
  const [, , history, analytical] = await sources();
  assert.match(history, /<details className=\{`history-event/);
  assert.match(history, /<details className="history-supporting">/);
  assert.match(history, /<details className="history-limitations">/);
  assert.match(analytical, /<details className="analytical-details analytical-frame">/);
});

test("generic chart-reading guidance moves to Help while visible summaries stay project-specific", async () => {
  const [, , , analytical] = await sources();
  assert.doesNotMatch(analytical, /How to read this/);
  assert.match(analytical, /featureStandoutSummary\(displayed\)/);
  assert.match(analytical, /modelComparisonStandoutSummary\(set\)/);
  assert.match(analytical, /evaluationStandoutSummary/);
  assert.match(analytical, /What stands out/);
});

test("the authorised local Flink family and exported Figma navigation assets are bundled", async () => {
  const [app, , , , css] = await sources();
  for (const file of ["FlinkRegular.otf", "FlinkRegularItalic.otf", "FlinkBold.otf", "FlinkBoldItalic.otf"]) {
    const asset = await fs.stat(new URL(`../public/fonts/${file}`, import.meta.url));
    assert.ok(asset.size > 0, file);
    assert.match(css, new RegExp(file.replace(".", "\\.")));
  }
  for (const file of ["Import_Project.svg", "Arrow_Forward.svg", "Folder.svg", "Menu.svg"]) {
    const source = await fs.readFile(new URL(`../public/ui/${file}`, import.meta.url), "utf8");
    assert.match(source, /^<svg/);
    assert.match(app, new RegExp(`name=\\"${file.replace(".svg", "")}\\"`));
  }
});
