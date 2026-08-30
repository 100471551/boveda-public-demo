import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("v1.1.0 retains the public Welcome and extends the simple navigation flow", () => {
  assert.equal(metadata.version, "1.1.0");
  assert.match(main, /useState\(\(\) => parseRoute\(window\.location\.pathname\)\)/);
  assert.match(main, /Auditable by design/);
  assert.match(main, /function GlobalNavigation/);
  assert.match(main, /aria-label="General dashboard"/);
  assert.match(main, /aria-label="Projects"/);
  assert.doesNotMatch(main, /function ProjectMenuDrawer/);
});

test("Projects preserves project management and opens the existing dashboard", () => {
  assert.match(main, /function ProjectsSurface/);
  assert.match(main, /finding_count/);
  assert.match(main, /project\.source_project_path/);
  assert.match(main, /project\.analysed_at/);
  assert.match(main, /aria-label=\{`Remove \$\{title\}`\}/);
  assert.match(main, /Import new project/);
  assert.match(main, /<Overview record=\{record\}/);
});

test("project context uses the intended overlay and sticky navigation treatments", () => {
  assert.match(main, /className="projects-overlay" role="dialog" aria-modal="true"/);
  assert.match(main, /inert=\{projectsOverlayOpen \? true : undefined\}/);
  assert.match(styles, /--v100b-page:\s*#fafafa/);
  assert.match(styles, /--v100b-surface:\s*#fff/);
  assert.match(styles, /--v100b-line:\s*#ebebeb/);
  assert.match(styles, /\.projects-overlay\s*\{[\s\S]*?background:\s*rgba\(255, 255, 255, \.75\)[\s\S]*?backdrop-filter:\s*blur\(11\.15px\)/);
  assert.match(styles, /\.project-sticky-bar\s*\{[\s\S]*?background:\s*rgba\(255, 255, 255, \.76\)[\s\S]*?backdrop-filter:\s*blur\(14px\)/);
});

test("dashboard surfaces stay selective and structural sections remain open", () => {
  const v100bStyles = styles.slice(styles.indexOf("/* v1.0.0b"));
  for (const structuralClass of ["overview-section", "results-section", "analytical-results", "analytical-frame", "analytical-standout", "data-population-zone"]) {
    assert.doesNotMatch(v100bStyles, new RegExp(`^\\.${structuralClass},?$`, "m"));
  }
  assert.doesNotMatch(v100bStyles, /\.data-population-zone\s*\{\s*margin-left:/);
  assert.match(v100bStyles, /\.data-table > div\.is-tinted,/);
  assert.match(v100bStyles, /\.feature-row:nth-child\(odd\),/);
  assert.match(v100bStyles, /\.missingness-row:nth-child\(even\)\s*\{/);
  assert.match(v100bStyles, /\.overview--overview \.feature-row\s*\{\s*padding-left:\s*14px;/);
  assert.match(v100bStyles, /\.analytical-body--evaluation \.diagnostic-item\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(v100bStyles, /\.comparison-component:not\(\.analytical-frame--empty\) > \.analytical-heading,/);
  assert.match(v100bStyles, /\.analytical-body--evaluation \.analytical-visual \{/);
});
