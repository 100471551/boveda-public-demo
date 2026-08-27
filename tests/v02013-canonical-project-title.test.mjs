import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { canonicalSupervisorProjectTitle, canonicalSupervisorProjectTitleForRecord } from "../src/project-display.mjs";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");
const missingIdentity = { state: "not_established", value: "Not established from available evidence." };

test("canonical titles follow identity, purpose/task, target, then folder priority", () => {
  assert.equal(canonicalSupervisorProjectTitle({
    identityName: { state: "established", value: "Harbour Watch" },
    task: "Estimate vessel congestion for each terminal using arrival records.",
    taskTarget: "Binary congestion during the next week",
    sourcePath: "/Projects/maritime-study",
  }), "Harbour Watch");
  assert.equal(canonicalSupervisorProjectTitle({ identityName: missingIdentity, task: "Estimate and map vessel congestion for each terminal using arrival records.", taskTarget: "Binary congestion during the next week", sourcePath: "/Projects/maritime-study" }), "Vessel Congestion");
  assert.equal(canonicalSupervisorProjectTitle({ identityName: missingIdentity, taskTarget: "Three customer retention classes", sourcePath: "/Projects/subscription-study" }), "Customer Retention");
  assert.equal(canonicalSupervisorProjectTitle({ identityName: missingIdentity, sourcePath: "/Projects/forest-health-monitoring" }), "Forest Health Monitoring");
});

test("canonical titles never add a generic Model suffix", () => {
  const titles = [
    canonicalSupervisorProjectTitle({ identityName: missingIdentity, task: "Predict equipment failure using sensor readings.", sourcePath: "/Projects/equipment" }),
    canonicalSupervisorProjectTitle({ identityName: missingIdentity, taskTarget: "Binary customer attrition outcomes", sourcePath: "/Projects/retention" }),
  ];
  assert.deepEqual(titles, ["Equipment Failure", "Customer Attrition"]);
  for (const title of titles) assert.doesNotMatch(title, /\bModel$/);
});

test("the record helper keeps project identity separate from its focal target", () => {
  const record = {
    source_project: { path: "/Projects/harbour-watch" },
    reconstruction: {
      identity: { name: { state: "established", value: "Harbour Watch" } },
      purpose_scope: { task: { state: "established", value: "Estimate vessel congestion." } },
      results_evaluation: { primary_result: { state: "established", task_target: "Delayed vessel arrival during the next week" } },
    },
  };
  assert.equal(canonicalSupervisorProjectTitleForRecord(record), "Harbour Watch");
});

test("project list, dashboard, sidebar, and report consume the same canonical title", async () => {
  const [main, persistence, report] = await Promise.all([read("../src/main.jsx"), read("../engine/persistence.mjs"), read("../engine/client-report.mjs")]);
  assert.match(persistence, /supervisor_project_title:\s*record \? canonicalSupervisorProjectTitleForRecord\(record\)/);
  assert.match(main, /project\.supervisor_project_title \|\| canonicalSupervisorProjectTitle/);
  assert.match(main, /const projectTitle = canonicalSupervisorProjectTitleForRecord\(record\)/);
  assert.match(report, /const projectName = canonicalSupervisorProjectTitleForRecord\(record\)/);
  assert.match(report, /cover\(record, description, generated, projectName\)/);
  assert.doesNotMatch(main, /displayAnalyticalProjectTitle/);
});

test("the generic naming capability contains no development-project identities", async () => {
  const source = await read("../src/project-display.mjs");
  assert.doesNotMatch(source, /\bR[1-7]\b|Chelsea|Crash|NYC.?311|XGBoost|302720|22466|2283|1026/);
});
