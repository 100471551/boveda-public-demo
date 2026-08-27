import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { collectHistorySources, MAX_GIT_COMMITS } from "../engine/history-collection.mjs";
import { buildHistoryLayer, commitMateriality, explicitDateFromText, HISTORY_SCHEMA_VERSION } from "../engine/history.mjs";

const execFile = promisify(execFileCallback);

function field(value, evidenceIds = ["EV-PERIOD"], epistemic = "OBSERVED") {
  return { state: "established", value, epistemic, evidence_ids: evidenceIds };
}

function fixture() {
  return {
    schema_version: "boveda-supervisory-record-0.9.0",
    project_id: "PRJ-HISTORY",
    audit_id: "AUD-HISTORY",
    analysed_at: "2026-08-21T11:44:50.807Z",
    reconstruction: {
      data: { period: field("Inspection outcomes from 2014–2019; training inspections through 2018.") },
      results_evaluation: {
        primary_result: {
          state: "established", display_value: "0.62", metric: "Test accuracy", method: "Random forest classifier",
          task_target: "Three-class resolution timing", evaluation_context: "Held-out test partition", epistemic: "OBSERVED", evidence_ids: ["EV-RESULT"],
        },
      },
    },
    evidence: [
      { id: "EV-PERIOD", kind: "documentation", path: "README.md", excerpt: "2014–2019" },
      { id: "EV-RESULT", kind: "notebook", path: "model.ipynb", excerpt: "Test accuracy: 0.62" },
      { id: "E-SYSTEM-GIT", kind: "git_identity", path: ".git", excerpt: "HEAD: abc" },
      ...Array.from({ length: 20 }, (_, index) => ({ id: `EV-ROUTINE-${index}`, kind: "source_code", path: `src/file-${index}.js`, excerpt: `Routine edit on 2020-01-${String(index + 1).padStart(2, "0")}` })),
    ],
    diagnostics: {
      audit_completed_at: "2026-08-21T11:44:50.807Z",
      llm: { attempts: [{ attempt: 1, outcome: "rejected", retry_scheduled: true }, { attempt: 2, outcome: "accepted", retry_scheduled: false }] },
    },
  };
}

test("explicit dates remain bounded to supported year and range forms", () => {
  assert.deepEqual(explicitDateFromText("Data from 2014–2019"), {
    label: "2014–2019", start: "2014-01-01", end: "2019-12-31", precision: "year_range", sort_at: "2019-12-31T23:59:59.999Z",
  });
  assert.equal(explicitDateFromText("No date recorded"), null);
  assert.equal(explicitDateFromText("2017 target week 19").label, "2017 · Week 19");
  assert.equal(explicitDateFromText("2016 safety concerns and 2017 data through target week 19").label, "2016–2017");
});

test("History is a deterministic passive projection with a complete trail", () => {
  const record = fixture();
  const original = JSON.stringify(record);
  const layer = buildHistoryLayer(record);
  assert.equal(layer.schema_version, HISTORY_SCHEMA_VERSION);
  assert.equal(layer.event_count, 3);
  assert.equal(layer.host_event_count, 2);
  assert.equal(layer.boveda_event_count, 1);
  assert.deepEqual(layer.events.map((event) => event.event_type), ["data_period", "evaluation", "boveda_audit"]);
  assert.equal(layer.events[0].date.label, "2014–2019");
  assert.equal(layer.events[1].date.label, "Date unresolved");
  assert.equal(layer.events[2].status, "completed_after_retry");
  assert.match(layer.events[2].description, /2 reconstruction attempts.*1 did not pass validation.*1 triggered a retry/);
  assert.ok(layer.events.every((event) => event.evidence_ids.length || event.related.some((item) => item.type === "boveda_audit")));
  assert.equal(layer.events.some((event) => event.event_type === "source_code"), false, "routine file evidence must not become History events");
  assert.match(layer.limitations.join(" "), /no commit messages and timestamps could be recovered/);
  assert.equal(JSON.stringify(record), original, "History must not mutate the canonical Project Record");
  assert.deepEqual(buildHistoryLayer(record), layer, "the same record must produce the same History layer");
});

test("commit materiality is conservative and path-aware", () => {
  const change = (subject, changedFiles, body = "") => commitMateriality({ subject, body, changed_files: changedFiles.map((file) => ({ status: "M", path: file })) });
  assert.equal(change("Bump scikit-learn from 1.4 to 1.5", ["requirements.txt"]).material, false);
  assert.equal(change("Update model tests", ["tests/model.test.py"]).material, false);
  assert.equal(commitMateriality({ subject: "Add files via upload", body: "", changed_files: [{ status: "A", path: "models/predictor.ipynb" }] }).material, true);
  assert.equal(change("Snapshot evaluation population", ["data/evaluation_sample.csv"]).material, true);
  assert.equal(change("Evaluate random forest with held-out accuracy", ["notebooks/evaluation.ipynb"]).material, true);
  assert.equal(change("Record approved target decision", ["docs/decisions/target.md"], "Approval rationale and trade-off.").material, true);
});

test("bounded source collection reconstructs Git and MLflow activity without mutating the record", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "boveda-history-"));
  const runGit = (args, date = null) => execFile("git", args, {
    cwd: root,
    env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env,
  });
  try {
    await runGit(["init", "-q"]);
    await runGit(["config", "user.name", "History Test"]);
    await runGit(["config", "user.email", "history@example.test"]);
    await fs.writeFile(path.join(root, "README.md"), "Project notes\n");
    await runGit(["add", "README.md"]);
    await runGit(["commit", "-q", "-m", "Document project setup"], "2024-01-02T10:00:00Z");
    await fs.mkdir(path.join(root, "models"));
    await fs.writeFile(path.join(root, "models", "model.py"), "metric = 'accuracy'\n");
    await runGit(["add", "models/model.py"]);
    await runGit(["commit", "-q", "-m", "Evaluate random forest model with holdout metric", "-m", "Records why the held-out accuracy was selected."], "2024-02-03T11:00:00Z");
    const { stdout: head } = await runGit(["rev-parse", "HEAD"]);
    await runGit(["tag", "v1.0.0"]);

    const runRoot = path.join(root, "mlruns", "7", "run-a");
    await fs.mkdir(path.join(runRoot, "tags"), { recursive: true });
    await fs.mkdir(path.join(runRoot, "metrics"), { recursive: true });
    await fs.writeFile(path.join(runRoot, "meta.yaml"), "status: FAILED\nstart_time: 1706958000000\nend_time: 1706958060000\n");
    await fs.writeFile(path.join(runRoot, "tags", "mlflow.source.git.commit"), head.trim());
    await fs.writeFile(path.join(runRoot, "metrics", "accuracy"), "1706958060000 0.73 0\n");

    const record = fixture();
    record.source_project = { path: root };
    const original = JSON.stringify(record);
    const sourceCollection = await collectHistorySources(record);
    const layer = buildHistoryLayer(record, { sourceCollection });

    assert.equal(sourceCollection.git.total_commit_count, 2);
    assert.equal(sourceCollection.git.recovered_commit_count, 2);
    assert.equal(sourceCollection.git.commit_limit, MAX_GIT_COMMITS);
    assert.deepEqual(sourceCollection.git.commits[0].changed_files, [{ status: "A", path: "models/model.py" }]);
    assert.equal(sourceCollection.git.tags[0].name, "v1.0.0");
    assert.equal(sourceCollection.mlflow.recovered_run_count, 1);
    assert.equal(layer.collection_summary.git_recovered_commits, 2);
    assert.equal(layer.collection_summary.mlflow_runs, 1);
    assert.equal(layer.events.some((event) => event.event_type === "git_commit" && event.title.startsWith("Evaluate random forest")), true);
    assert.equal(layer.events.some((event) => event.event_type === "git_tag" && event.title === "Release tag v1.0.0"), true);
    assert.equal(layer.events.some((event) => event.event_type === "execution" && event.status === "failed"), true);
    assert.equal(layer.supporting_events.some((event) => event.title === "Document project setup"), true);
    assert.ok(layer.evidence.every((item) => item.id.startsWith("E-HIS-") && item.sha256.length === 64));
    assert.equal(JSON.stringify(record), original);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Findings link only through an explicit temporal relationship", () => {
  const record = fixture();
  const first = buildHistoryLayer(record, { findings: [{ finding_id: "FND-UNLINKED" }] });
  assert.deepEqual(first.events.flatMap((event) => event.finding_ids), []);
  const evaluation = first.events.find((event) => event.event_type === "evaluation");
  const linked = buildHistoryLayer(record, { findings: [{ finding_id: "FND-LINKED", temporal_relationships: [{ event_id: evaluation.event_id }] }] });
  assert.deepEqual(linked.events.find((event) => event.event_id === evaluation.event_id).finding_ids, ["FND-LINKED"]);
});

test("History UI is additive and preserves existing Overview and Findings routing", async () => {
  const [main, view, server, css] = await Promise.all([
    fs.readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/history-view.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../engine/server.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(main, />Overview<\/button>.*>Findings.*>History<\/button>/s);
  assert.match(main, /activeView === "signals" \? <SignalsView.*activeView === "history" \? <HistoryView/s);
  assert.match(server, /app\.get\("\/api\/projects\/:id\/history"/);
  assert.match(view, /history-event--\$\{event\.source\}/);
  assert.match(view, /Open audit diagnostics/);
  assert.match(view, /Supporting project activity/);
  assert.match(view, /could not connect to a material data, model, evaluation, or release decision/);
  assert.match(main, /historyLayer\?\.evidence/);
  assert.match(css, /\.history-event--boveda > summary/);
  assert.match(css, /\.history-supporting > summary/);
  assert.doesNotMatch(view, /fetch\(|\/reanalyse|\/analyse/);
});
