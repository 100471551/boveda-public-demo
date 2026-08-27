import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

function mobileHeroRules(css) {
  const marker = css.indexOf("Mobile hero cards: keep the approved desktop/tablet compositions unchanged");
  assert.ok(marker > 0, "mobile hero-card overrides should have an explicit scope marker");
  const rules = css.slice(marker);
  assert.match(rules, /@media \(max-width: 760px\)/);
  return rules;
}

test("mobile hero cards contain and centre their content", async () => {
  const css = await read("../src/styles.css");
  const rules = mobileHeroRules(css);

  assert.match(rules, /\.overview--overview \.hero-cards > \.primary-card,[\s\S]*text-align:\s*center/s);
  assert.match(rules, /\.overview--overview \.primary-card__value-row\s*\{[^}]*justify-content:\s*center[^}]*width:\s*100%/s);
  assert.match(rules, /\.overview--overview \.primary-card__metric > \.help-popover\s*\{[^}]*left:\s*auto[^}]*right:\s*12px[^}]*top:\s*12px/s);
  assert.match(rules, /\.overview--overview \.primary-card__context\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*justify-content:\s*center[^}]*max-width:\s*296px/s);
  assert.match(rules, /\.overview--overview \.samples-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(rules, /\.overview--overview \.samples-card \.sample--evaluation_sample\s*\{[^}]*width:\s*100%[^}]*transform:\s*none/s);
  assert.match(rules, /\.overview--overview \.confidence-card\s*\{[^}]*align-items:\s*center[^}]*overflow:\s*hidden/s);
  assert.match(rules, /\.overview--overview \.confidence-head\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*center/s);
});

test("mobile population decorations and long labels cannot retain desktop offsets", async () => {
  const css = await read("../src/styles.css");
  const rules = mobileHeroRules(css);

  assert.match(rules, /\.overview--overview \.hero-population-strip\s*\{[^}]*position:\s*relative[^}]*left:\s*auto[^}]*right:\s*auto[^}]*top:\s*auto/s);
  assert.match(rules, /\.overview--overview \.primary-card__target > strong\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(rules, /\.overview--overview \.confidence-head small\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s);
});

test("hero-card correction is mobile-only and project-independent", async () => {
  const css = await read("../src/styles.css");
  const rules = mobileHeroRules(css);

  assert.doesNotMatch(rules, /@media \(min-width:/);
  assert.doesNotMatch(rules, /R[1-7]_public|Chelsea|Crash|Complaints|NAICS|22,466|6K|1\.3K|348/);
});
