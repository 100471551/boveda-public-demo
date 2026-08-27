import assert from "node:assert/strict";
import test from "node:test";
import { metricRatioValue } from "../src/format-display.mjs";
import { splitDashboardTitle } from "../src/project-display.mjs";

test("headline indicator uses either a recorded ratio or equivalent percentage evidence", () => {
  assert.equal(metricRatioValue({ raw_value: 0.736, display_value: "0.736" }), 0.736);
  assert.equal(metricRatioValue({ raw_value: null, display_value: "62.5%" }), 0.625);
  assert.equal(metricRatioValue({ raw_value: 62.5, display_value: "62.5%" }), 0.625);
  assert.equal(metricRatioValue({ display_value: "F1: 62.5%" }), 0.625);
  assert.ok(Math.abs(metricRatioValue({ display_value: "Correct return rate: 90.1%" }) - 0.901) < Number.EPSILON);
  assert.ok(Number.isNaN(metricRatioValue({ display_value: "Result unavailable" })));
});

test("dashboard titles expose a stable first line for nearby actions", () => {
  assert.deepEqual(splitDashboardTitle("Housing Safety Violations Model"), ["Housing Safety Violations", "Model"]);
  assert.deepEqual(splitDashboardTitle("Recorded Correct Industry Classification Model"), ["Recorded Correct Industry", "Classification Model"]);
  assert.deepEqual(splitDashboardTitle("Crash Risk Model"), ["Crash Risk Model"]);
});
