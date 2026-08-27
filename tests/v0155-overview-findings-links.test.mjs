import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import { collectAnalyticalSources } from "../engine/analytical-collection.mjs";
import { buildAnalyticalLayer } from "../engine/analytical.mjs";
import { buildSignalsLayer } from "../engine/signals.mjs";
import { buildAnalyticalFindingAssociations, buildOverviewFindingAssociations, relatedFindingLabel } from "../src/overview-finding-associations.mjs";

function associationFixture() {
  return {
    overview: {
      sections: [
        { id: "section-a", groups: [{ field_ids: ["field-a"] }] },
        { id: "section-b", groups: [{ field_ids: ["field-b"] }] },
        { id: "section-empty", groups: [{ field_ids: ["field-empty"] }] },
      ],
    },
    findings: [
      { finding_id: "F-1", signal_id: "SIG-CANONICAL", finding_type: "signal", status: "active", impacts: [{ object_type: "overview_field", object_id: "field-a" }] },
      { finding_id: "F-1-DUPLICATE", signal_id: "SIG-CANONICAL", finding_type: "signal", status: "active", impacts: [{ object_type: "overview_field", object_id: "field-b" }] },
      { finding_id: "F-2", evidence_gap_id: "GAP-CANONICAL", finding_type: "evidence_gap", status: "active", impacts: [{ object_type: "overview_field", object_id: "field-b" }] },
      { finding_id: "F-INACTIVE", signal_id: "SIG-INACTIVE", finding_type: "signal", status: "inactive", impacts: [{ object_type: "overview_field", object_id: "field-a" }] },
      { finding_id: "F-CHECK", signal_id: "SIG-CHECK-ONLY", finding_type: "signal", status: "active", impacts: [{ object_type: "check_execution", object_id: "EXEC-1" }] },
    ],
  };
}

test("Overview associations use canonical active Findings and structured field impacts", () => {
  const associations = buildOverviewFindingAssociations(associationFixture());
  assert.deepEqual(associations["section-a"], {
    section_id: "section-a",
    signal_ids: ["SIG-CANONICAL"],
    evidence_gap_ids: [],
    signal_count: 1,
    evidence_gap_count: 0,
  });
  assert.deepEqual(associations["section-b"], {
    section_id: "section-b",
    signal_ids: ["SIG-CANONICAL"],
    evidence_gap_ids: ["GAP-CANONICAL"],
    signal_count: 1,
    evidence_gap_count: 1,
  });
  assert.equal(associations["section-empty"].signal_count, 0);
  assert.equal(associations["section-empty"].evidence_gap_count, 0);
});

test("related Finding labels use dynamic singular and plural copy", () => {
  assert.equal(relatedFindingLabel(1, "related signal", "related signals"), "1 related signal");
  assert.equal(relatedFindingLabel(2, "related signal", "related signals"), "2 related signals");
  assert.equal(relatedFindingLabel(1, "evidence gap", "evidence gaps"), "1 evidence gap");
  assert.equal(relatedFindingLabel(3, "evidence gap", "evidence gaps"), "3 evidence gaps");
});

test("analytical areas use direct canonical graph relationships rather than inheriting their parent count", () => {
  const layer = associationFixture();
  layer.findings.push(
    { finding_id: "F-FEATURE", signal_id: "SIG-FEATURE", finding_type: "signal", status: "active", impacts: [], trail: { graph_object_refs: [{ object_id: "AFS-1", object_type: "FeatureEvidenceSet" }] } },
    { finding_id: "F-METRIC", signal_id: "SIG-METRIC", finding_type: "signal", status: "active", impacts: [], trail: { graph_object_refs: [{ object_id: "AMO-1", object_type: "MetricObservation" }] } },
    { finding_id: "F-DIAGNOSTIC", signal_id: "SIG-DIAGNOSTIC", finding_type: "signal", status: "active", impacts: [], trail: { graph_object_refs: [{ object_id: "ADO-1", object_type: "DiagnosticObservation" }] } },
    { finding_id: "F-METRIC-GAP", evidence_gap_id: "GAP-METRIC", finding_type: "evidence_gap", status: "active", impacts: [], scopes: { metric_observation_id: "AMO-MISSING" } },
  );
  const associations = buildAnalyticalFindingAssociations(layer);
  assert.deepEqual([associations["area-feature-driver-evidence"].signal_count, associations["area-feature-driver-evidence"].evidence_gap_count], [1, 0]);
  assert.deepEqual([associations["area-model-result-comparison"].signal_count, associations["area-model-result-comparison"].evidence_gap_count], [1, 1]);
  assert.deepEqual([associations["area-evaluation-behaviour"].signal_count, associations["area-evaluation-behaviour"].evidence_gap_count], [1, 0]);
});

test("stored R1 section counts are derived without rerunning the project", async () => {
  const record = JSON.parse(await fs.readFile(new URL("../storage/projects/PRJ-1D50CE481C/record.json", import.meta.url), "utf8"));
  const analyticalLayer = buildAnalyticalLayer(record, { sources: await collectAnalyticalSources(record) });
  const signalsLayer = buildSignalsLayer(record, { analyticalLayer });
  const associations = buildOverviewFindingAssociations(signalsLayer);
  const analyticalAssociations = buildAnalyticalFindingAssociations(signalsLayer);
  assert.deepEqual(Object.fromEntries(Object.entries(associations).map(([id, value]) => [id, [value.signal_count, value.evidence_gap_count]])), {
    "section-purpose-scope": [1, 0],
    "section-results-evaluation": [5, 3],
    "section-data-populations-samples": [0, 0],
  });
  assert.equal(signalsLayer.signal_ids.length, 6);
  assert.equal(signalsLayer.evidence_gap_ids.length, 3);
  assert.deepEqual(Object.fromEntries(Object.entries(analyticalAssociations).map(([id, value]) => [id, [value.signal_count, value.evidence_gap_count]])), {
    "area-feature-driver-evidence": [1, 0],
    "area-model-result-comparison": [1, 3],
    "area-evaluation-behaviour": [1, 0],
    "area-data-missingness": [0, 0],
    "area-population-lineage": [0, 0],
  });
});

test("Overview links use the exact Figma icon assets and route to both Findings groups", async () => {
  const [component, main, analytical, findingsView, signalIcon, gapIcon] = await Promise.all([
    fs.readFile(new URL("../src/overview-finding-links.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/analytical-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/ui/Findings_Signals.svg", import.meta.url)),
    fs.readFile(new URL("../public/ui/Findings_Evidence_Gaps.svg", import.meta.url)),
  ]);
  assert.equal(crypto.createHash("sha256").update(signalIcon).digest("hex"), "b894aa3f920128e24afbf455ecb34b3f3380ef2dadf18f32369881ab71bf001d");
  assert.equal(crypto.createHash("sha256").update(gapIcon).digest("hex"), "44f83166ec9f9306a5f883bc01acf5c0efd90b9608e91228cf858a108befe911");
  assert.match(component, /onNavigate\("signals"\)/);
  assert.match(component, /onNavigate\("gaps"\)/);
  assert.match(component, /if \(!signalCount && !gapCount\) return null/);
  assert.match(main, /buildOverviewFindingAssociations\(signalsLayer\)/);
  assert.match(main, /buildAnalyticalFindingAssociations\(signalsLayer\)/);
  assert.match(analytical, /<OverviewFindingLinks association=\{findingAssociation\}/);
  assert.match(findingsView, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(findingsView, /focusTarget === "gaps" \? "gaps-heading" : "signals-heading"/);
  assert.doesNotMatch([component, main, analytical].join("\n"), /Chelsea|PRJ-1D50CE481C|SIG-[A-F0-9]{8,}/);
});
