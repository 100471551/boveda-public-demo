import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { clearDemoSession, createDemoSession, readDemoSession, storeDemoSession } from "../src/demo-session.mjs";
import { DEMO_LOGIN } from "../src/demo-login-config.mjs";
import { buildWorkspaceSummary } from "../src/workspace-summary.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/workspace-dashboard.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("v1.1.0 creates a shared demo session without storing visitor identity", () => {
  const session = createDemoSession(` ${DEMO_LOGIN.username.toUpperCase()} `, DEMO_LOGIN.password, () => "2026-08-30T08:00:00.000Z");
  assert.deepEqual(session, { kind: "shared-public-demo", displayName: "Demo supervisor", signedInAt: "2026-08-30T08:00:00.000Z" });
  assert.equal(createDemoSession("visitor@example.com", DEMO_LOGIN.password), null);
  assert.equal(createDemoSession(DEMO_LOGIN.username, "wrong-password"), null);
  const storage = memoryStorage();
  assert.equal(storeDemoSession({ ...session, email: "visitor@example.com" }, storage), true);
  assert.doesNotMatch(storage.getItem("boveda.demo-session.v1.1.0"), /visitor@example\.com/);
  assert.deepEqual(readDemoSession(storage), session);
  assert.equal(clearDemoSession(storage), true);
  assert.equal(readDemoSession(storage), null);
});

test("v1.1.0 derives supervisory KPIs and activity from project layers", () => {
  const projects = [
    { project_id: "P1", name: "Alpha", finding_count: 3, analysed_at: "2026-08-29T10:00:00.000Z" },
    { project_id: "P2", name: "Beta", finding_count: 4, analysed_at: "2026-08-30T10:00:00.000Z" },
  ];
  const layers = {
    P1: { signals: { finding_breakdown: { signals: 1, evidence_gaps: 2 }, findings: [{ finding_id: "S1", finding_type: "signal", status: "active", materiality: { level: "high" }, presentation: { title: "Review Alpha" } }] }, history: { events: [] }, diagnostics: { llm: { total_usage: { total_tokens: 1000 } } } },
    P2: { signals: { finding_breakdown: { signals: 2, evidence_gaps: 2 }, findings: [{ finding_id: "S2", finding_type: "signal", status: "active", materiality: { level: "medium" }, presentation: { title: "Review Beta" } }] }, history: { events: [] }, diagnostics: { llm: { total_usage: { total_tokens: 2500 } } } },
  };
  const summary = buildWorkspaceSummary(projects, layers);
  assert.equal(summary.activeProjects, 2);
  assert.equal(summary.openSignals, 3);
  assert.equal(summary.evidenceGaps, 4);
  assert.deepEqual(summary.signalBreakdown, { high: 1, medium: 1, low: 0, review: 0 });
  assert.equal(summary.totalTokens, 3500);
  assert.equal(summary.usageProjects, 2);
  assert.equal(summary.attention[0].projectId, "P2");
  assert.equal(summary.signals[0].findingId, "S1");
  assert.equal(summary.signals[0].reviewStatus, "new");
  assert.equal(summary.activity[0].projectId, "P2");
});

test("v1.1.0 gates workspace routes with an honest local demo session", () => {
  assert.equal(metadata.version, "1.1.0");
  assert.match(main, /function LoginModal/);
  assert.match(main, /Enter your username and password to continue/);
  assert.doesNotMatch(main, /Shared demo credentials/);
  assert.doesNotMatch(main, /Credentials are checked only in this browser/);
  assert.doesNotMatch(main, /Demo username|Demo password/);
  assert.doesNotMatch(main, /name@organisation\.com/);
  assert.match(main, /welcome-sign-in[\s\S]*?Login/);
  assert.match(main, /function AccountMenu/);
  assert.match(main, /Shared public demo/);
  assert.match(main, /login-panel__brand/);
  assert.match(main, /function logout\(\)/);
  assert.match(styles, /\.login-backdrop\s*\{[\s\S]*?backdrop-filter:\s*blur/);
  assert.match(styles, /\.login-panel\s*\{[\s\S]*?background:\s*rgba\(255, 255, 255, \.68\)/);
  assert.match(styles, /\.login-panel\s*\{[\s\S]*?-webkit-backdrop-filter:\s*blur\(42px\)[\s\S]*?backdrop-filter:\s*blur\(42px\)/);
  assert.match(styles, /\.account-menu__popover\s*\{[\s\S]*?backdrop-filter:\s*blur/);
});

test("v1.1.0 provides the evidence-backed supervisory workspace without changing project dashboards", () => {
  assert.match(workspace, /Active Projects/);
  assert.match(workspace, /Signals to review/);
  assert.match(workspace, /Evidence Gaps/);
  assert.doesNotMatch(workspace, /onOpenFindings\(summary\.attention\[0\]/);
  assert.match(workspace, /workspace-kpi workspace-kpi--signals/);
  assert.match(workspace, /<article className="workspace-kpi"><span>Evidence Gaps/);
  assert.match(workspace, /Projects requiring attention/);
  assert.match(workspace, /Requires attention/);
  assert.match(workspace, /Recent activity/);
  assert.match(workspace, /Signals by severity/);
  assert.match(workspace, /Repositories/);
  assert.match(workspace, /projectRepository\(project\.source_project_path\)/);
  assert.match(workspace, /repository\.href/);
  assert.match(workspace, /What needs<br \/>your attention\?/);
  assert.match(workspace, /Tokens/);
  assert.match(workspace, /Reconstruction ·/);
  assert.match(workspace, /onOpenSignal\(signal\.projectId, signal\.findingId\)/);
  assert.match(workspace, /onOpenHistory\(event\.projectId\)/);
  assert.match(workspace, /data-demo-disabled="true"/);
  assert.match(main, /<Overview record=\{record\}/);
  assert.match(main, /<WorkspaceDashboard projects=\{projects\}/);
  assert.match(main, /navigateRoute\(\{ screen: "workspace" \}, \{ replace: true \}\)/);
  assert.match(styles, /\.v100b-app\.is-authenticated \.brand__demo \{ background: var\(--ui-red\); \}/);
  assert.match(styles, /\.workspace-overview \{ display: grid;/);
  assert.match(styles, /\.workspace-project-row__open \.ui-icon \{[^}]*opacity: \.65;/);
  assert.match(styles, /\.workspace-signal-row > \.ui-icon \{[^}]*opacity: \.65;/);
  assert.match(styles, /\.workspace-dashboard__lower \{ display: grid;/);
  assert.match(styles, /\.workspace-repositories/);
});
