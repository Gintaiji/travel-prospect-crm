import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHookHarness, jsx, text } from "./helpers/resourceHookHarness.mjs";

const source = fs.readFileSync("app/sauvegarde/page.tsx", "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const settings = { userDisplayName: "", businessName: "CRM fictif", clubName: "club", defaultCountry: "France", defaultRegion: "", defaultCity: "", defaultFollowUpDays: 3, defaultPresentationLink: "", messageSignature: "", publicWording: "voyage", updatedAt: "" };

for (const scenario of ["unconfigured", "disconnected", "error", "connected"]) {
  const h = createHookHarness(), calls = [];
  let queries = 0, timers = 0, cancelled = 0, resolveSession;
  const sessionResult = new Promise(resolve => { resolveSession = resolve; });
  const dependencies = {};
  for (const match of source.matchAll(/from "([^\"]+)"/g)) dependencies[match[1]] = {};
  const summary = { prospectsCount: 0, resourcesCount: 0, streetMarketingSurveysCount: 0, hasCustomMessageTemplates: false, hasSettings: false, hasLocalData: false, hasCloudData: false, lastCloudSyncAt: null };
  Object.assign(dependencies, {
    react: h.react, "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "../lib/cloudSyncSuspension": { CLOUD_SYNC_SUSPENDED: true, CLOUD_SYNC_SUSPENSION_MESSAGE: "suspended" },
    "../lib/resourceIsolationSettings": { ACCOUNT_SCOPED_RESOURCES_ENABLED: false },
    "../lib/settingsStorage": { DEFAULT_APP_SETTINGS: settings },
    "../lib/cloudSyncSettingsStorage": { DEFAULT_CLOUD_SYNC_SETTINGS: { autoSyncEnabled: true, autoSyncDelaySeconds: 30 } },
    "../lib/supabaseClient": {
      isSupabaseConfigured: () => scenario !== "unconfigured",
      createBrowserSupabaseClient: () => scenario === "unconfigured" ? null : { auth: { getSession() { queries++; return sessionResult; } } },
    },
    "../lib/cloudSync": {
      getLocalDataSummary: () => summary,
      async getCloudSyncStatus() { calls.push("status"); return { lastCloudSyncAt: null, needsSync: true, statusLabel: "suspended" }; },
      async getCloudDataSummary() { calls.push("summary"); return summary; },
      async getCloudFreshnessStatus() { calls.push("freshness"); return { cloudLooksNewer: false, statusLabel: "fixture" }; },
      async getCloudBackupHistory() { calls.push("history"); return []; },
      restoreCloudDataToLocal() { assert.fail("Initial session loading must never restore data"); },
      uploadLocalDataToCloud() { assert.fail("Initial session loading must never upload data"); },
    },
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports, require(name) { assert.ok(name in dependencies); return dependencies[name]; },
    window: { setTimeout() { timers++; return 1; }, clearTimeout() { cancelled++; } },
  });
  let tree = h.render(() => exports.default());
  assert.ok(text(tree).includes("Lecture de la session..."));
  h.effects();
  // The pre-existing local-storage loading timer is kept; do not execute it in
  // this session-only test. Chrome exercises the real local loading and JSON UI.
  assert.equal(timers, 1);
  assert.equal(queries, scenario === "unconfigured" ? 0 : 1);
  if (scenario !== "unconfigured") resolveSession({
    data: { session: scenario === "connected" ? { user: { id: "11111111-1111-4111-8111-111111111111", email: "account-a@fake.invalid" } } : null },
    error: scenario === "error" ? { message: "fictional error" } : null,
  });
  await new Promise(setImmediate);
  tree = h.render(() => exports.default()); h.effects();
  assert.ok(text(tree).includes(scenario === "connected" ? "account-a@fake.invalid" : "Aucun utilisateur connecté."));
  assert.deepEqual(calls, scenario === "connected" ? ["status", "summary", "freshness", "history"] : []);
  const before = { queries, calls: [...calls], timers };
  for (let i = 0; i < 4; i++) { h.render(() => exports.default()); h.effects(); }
  await new Promise(setImmediate);
  assert.deepEqual({ queries, calls, timers }, before, "Rerenders must not restart session or backup-history loading");
  h.unmount(); assert.equal(cancelled, 1);
}
console.log("PASS: initial session without configuration, disconnected/error/connected accounts, ordered cloud overview/history reads, stable effects across rerenders, no restore/upload.");
