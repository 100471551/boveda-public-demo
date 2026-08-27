import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("Results & Evaluation selects one model and metric locally and preserves its three-decimal figure", async () => {
  const main = await read("../src/main.jsx");
  assert.match(main, /ariaLabel="Results and Evaluation model"/);
  assert.match(main, /ariaLabel="Results and Evaluation metric"/);
  assert.match(main, /setResultsModelKey\(context\.id\)/);
  assert.match(main, /setResultsMetricKey/);
  assert.match(main, /displayedMaterialResult/);
  assert.doesNotMatch(main, /selectedMaterialResult|material\.map\(\(item, index\) => <div className="result-value"/);
  assert.match(main, /minimumFractionDigits:\s*3/);
  assert.match(main, /maximumFractionDigits:\s*3/);
  assert.match(main, /displayValue=\{resultsMetricDisplay\(displayedMaterialResult\)\}/);
});

test("headline metrics use two-decimal decimal notation rather than percentages", async () => {
  const main = await read("../src/main.jsx");
  assert.match(main, /const primaryMetricDisplay = Number\.isFinite\(primaryMetricRatio\)[\s\S]*heroMetricFormatter\.format\(primaryMetricRatio\)/);
  assert.doesNotMatch(main, /style:\s*["']percent["']/);
  assert.match(main, /const heroMetricFormatter = new Intl\.NumberFormat\("en-US", \{[\s\S]*minimumFractionDigits:\s*2,[\s\S]*maximumFractionDigits:\s*2/);
});

test("analytical selectors retain every option and clearly mark the selected item", async () => {
  const [view, css] = await Promise.all([read("../src/analytical-view.jsx"), read("../src/styles.css")]);
  assert.match(view, /options\.map\(\(option, index\) => <button/);
  assert.match(view, /className=\{index === current \? "is-selected" : ""\}/);
  assert.match(view, /aria-selected=\{index === current\}/);
  assert.doesNotMatch(view, /index === current \? null/);
  assert.match(css, /\.analytical-selector__menu\s*\{[^}]*max-height:\s*none[^}]*overflow:\s*visible/s);
  assert.match(css, /\.analytical-selector__menu > button\.is-selected\s*\{\s*font-weight:\s*700/);
});

test("comparison cards derive their dimensions from table evidence", async () => {
  const [view, css] = await Promise.all([read("../src/analytical-view.jsx"), read("../src/styles.css")]);
  assert.match(view, /"--comparison-card-width": `\$\{Math\.min\(1120, 370 \+ \(set\.methods\.length \* 150\)\)\}px`/);
  assert.match(view, /"--comparison-card-min-height": `\$\{250 \+ \(set\.metrics\.length \* 52\)\}px`/);
  assert.match(css, /\.comparison-component\s*\{[^}]*width:\s*min\(100%, var\(--comparison-card-width, 670px\)\)[^}]*height:\s*auto[^}]*min-height:\s*var\(--comparison-card-min-height, 354px\)/s);
});

test("desktop record actions remain in the title flow", async () => {
  const css = await read("../src/styles.css");
  assert.match(css, /@media \(min-width: 1381px\)[\s\S]*\.record-title-and-actions\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /@media \(min-width: 1381px\)[\s\S]*\.record-title-actions\s*\{[^}]*position:\s*static/s);
});
