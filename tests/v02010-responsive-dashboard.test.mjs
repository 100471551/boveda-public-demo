import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("tablet widths use one vertical dashboard composition", async () => {
  const css = await read("../src/styles.css");
  assert.match(css, /v0\.20\.10 — vertical dashboard composition below the approved desktop width/);
  assert.match(css, /@media \(max-width: 1380px\)\s*\{[\s\S]*\.overview--overview \.hero-cards\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.overview--overview \.purpose-section,[\s\S]*\.overview--overview \.results-section\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.overview--overview \.analytical-body--feature\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.overview--overview \.analytical-body--evaluation\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});

test("comparison, population, and preparation content remain inside their cards", async () => {
  const css = await read("../src/styles.css");
  assert.match(css, /\.overview--overview \.comparison-component:not\(\.analytical-frame--empty\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*max-width:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.analytical-body--comparison > \.analytical-visual\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.overview--overview \.data-section,[\s\S]*\.overview--overview \.analytical-data\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*\.comparison-table\s*\{[^}]*min-width:\s*500px/s);
});

test("responsive overrides are bounded below the approved desktop breakpoint", async () => {
  const css = await read("../src/styles.css");
  const marker = css.indexOf("v0.20.10 — vertical dashboard composition below the approved desktop width");
  assert.ok(marker > 0);
  const responsive = css.slice(marker);
  assert.match(responsive, /@media \(max-width: 1380px\)/);
  assert.doesNotMatch(responsive, /@media \(min-width: 1381px\)/);
  assert.doesNotMatch(responsive, /R[1-6]_public|Chelsea|Insight Lane|NYC-311|22,466|2,283|1,026/);
});
