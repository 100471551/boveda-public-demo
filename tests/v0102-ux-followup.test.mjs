import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { selectProjectIcon } from "../src/project-icon.mjs";

function reconstruction({ name, description, task, target, population }) {
  const field = (value) => ({ state: "established", value });
  return {
    identity: { name: field(name), description: field(description) },
    purpose_scope: {
      task: field(task),
      target_outcome: field(target),
      population_scope: field(population),
    },
  };
}

const latestFreshAudits = [
  {
    auditId: "AUD-C5E6A76463",
    expectedIcon: "housing",
    record: reconstruction({
      name: "Public Health Housing Chelsea",
      description: "Predicts housing-code violations and related public-health hazards for Chelsea properties using linked municipal data to support proactive inspection prioritization.",
      task: "Train supervised classifiers to identify Chelsea properties likely to have specified housing-code violations.",
      target: "Binary predictions for any, elevated-public-health-risk, and overcrowding-associated code violations.",
      population: "Chelsea residential properties, with model development and evaluation restricted to properties inspected during 2014–2019.",
    }),
  },
  {
    auditId: "AUD-1D38F125ED",
    expectedIcon: "road",
    record: reconstruction({
      name: "Crash Modeling",
      description: "Machine-learning system combining road-network, historical crash, and safety-concern data to estimate road-segment crash risk and support transportation departments in targeting safety interventions.",
      task: "Classify and rank road segments using historical crashes, road characteristics, and safety concerns.",
      target: "Probability of a crash occurring on each road segment during the target week.",
      population: "Urban road networks in participating cities; the persisted benchmark analysis is limited to Boston.",
    }),
  },
  {
    auditId: "AUD-F3A32B9940",
    expectedIcon: "public_service",
    record: reconstruction({
      name: "Analysis of NYC-311 Service Request Data",
      description: "Analyzes NYC 311 non-emergency service requests and models complaint-resolution intervals and call volumes to support city understanding, resource planning, and resident expectations.",
      task: "Describe request patterns, classify resolution-time ranges, and forecast daily complaint volumes.",
      target: "Three resolution-time classes: under two days, two to six days, and over a week.",
      population: "NYC 311 non-emergency requests, with the evaluated resolution model restricted to Brooklyn heat and hot-water complaints.",
    }),
  },
];

test("latest fresh R1-R3 audits select distinct, domain-appropriate local icons", () => {
  const results = latestFreshAudits.map(({ auditId, record, expectedIcon }) => ({ auditId, expectedIcon, actualIcon: selectProjectIcon(record) }));
  assert.deepEqual(results.map(({ actualIcon }) => actualIcon), ["housing", "road", "public_service"]);
  assert.equal(new Set(results.map(({ actualIcon }) => actualIcon)).size, 3);
  for (const result of results) assert.equal(result.actualIcon, result.expectedIcon, result.auditId);
});

test("v0.15 visual redesign remains presentation-only and data-driven", async () => {
  const [app, view, css] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/signals-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  const descriptionMarkup = app.match(/<div className="description">[\s\S]*?<FieldValue[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(descriptionMarkup, /<FieldValue/);
  assert.doesNotMatch(descriptionMarkup, /EvidenceButton/);
  assert.match(app, /function ProjectsSurface/);
  assert.doesNotMatch(app, /function Sidebar/);
  assert.match(app, /projects\.map\(\(project, index\)/);
  assert.match(app, /project\.source_project_path/);
  assert.match(app, /project\.analysed_at/);
  assert.match(app, /aria-label="Back to Projects"/);
  assert.match(app, /onBack=\{showProjects\}/);
  assert.match(css, /@font-face[^}]*FlinkRegular\.otf/s);
  assert.match(css, /--v15-page-gradient:/);
  assert.doesNotMatch(view, /Also affects → Finding|finding-reference--secondary|primaryRows/);
  assert.match(view, /<span>\{finding\.finding_type === "signal" \? "⚠" : "!"\}<\/span>\{finding\.name\}/);
  assert.match(view, /coverage-indicator__status"><StatusDot[^>]*\/><strong>\{coverage\.label\}<\/strong>/);
  assert.match(app, /showStatus=\{false\}/);
  const dataTable = app.match(/function DataTable[\s\S]*?\n\}/)?.[0] || "";
  const sectionHeading = app.match(/function SectionHeading[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(dataTable, /StatusDot|data-table__status/);
  assert.doesNotMatch(sectionHeading, /StatusDot/);
  assert.match(css, /\.data-table__status \{ display: none; \}/);
  assert.match(css, /\.record-tabs > button\.is-active \{ background: #222; color: #fff; \}/);
  assert.match(css, /\.coverage-indicator \{[^}]*width: 174px;[^}]*height: 60px;/);
});
