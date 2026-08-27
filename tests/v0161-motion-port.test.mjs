import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("v0.16.1 retains the two-effect entrance system from v0.15.6", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /effect: "fade"/);
  assert.match(app, /effect: "slide"/);
  assert.match(app, /!element\.classList\.contains\("is-motion-visible"\)\) observer\.observe\(element\)/);
  assert.match(css, /@keyframes boveda-fade-in/);
  assert.match(css, /@keyframes boveda-slide-fade-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the Data and Populations introduction and table never depend on entrance animation visibility", async () => {
  const app = await fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const motionGroups = app.slice(app.indexOf("const MOTION_GROUPS"), app.indexOf("function useSiteMotion"));
  assert.doesNotMatch(motionGroups, /data-section \.data-heading|data-section \.data-table/);
  assert.match(motionGroups, /data-section \.population-funnel/);
});

test("the History introduction card uses the corrected vertical alignment", async () => {
  const css = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.history-intro \{[^}]*align-items:\s*center;[^}]*min-height:\s*280px;/s);
});
