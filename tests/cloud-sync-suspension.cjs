/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
﻿const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Compile in memory: no browser storage, credentials, or network client is used.
function load(path, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
      return dependencies[name];
    },
    ...globals,
  }, { filename: path });
  return exports;
}
const suspension = load("app/lib/cloudSyncSuspension.ts", {});
let clientCalls = 0;
const deps = {};
const source = fs.readFileSync("app/lib/cloudSync.ts", "utf8");
for (const match of source.matchAll(/from "([^"]+)"/g)) deps[match[1]] = {};
deps["./cloudSyncSuspension"] = suspension;
deps["./supabaseClient"] = {
  createBrowserSupabaseClient() {
    clientCalls++;
    return {
      auth: { getUser: async () => ({ data: { user: { id: "test-account" } } }) },
      from(table) {
        assert.equal(table, "crm_backup_history");
        const query = {
          select() { return query; },
          eq(column, value) { assert.equal(column, "user_id"); assert.equal(value, "test-account"); return query; },
          order() { return query; },
          async limit(n) { assert.equal(n, 20); return { data: [], error: null }; },
        };
        return query;
      },
    };
  },
};
(async () => {
  const cloud = load("app/lib/cloudSync.ts", deps);
  for (const options of [{}, { backupType: "manual" }, { backupType: "auto" }]) {
    await assert.rejects(cloud.uploadLocalDataToCloud(options), { message: suspension.CLOUD_SYNC_SUSPENSION_MESSAGE });
  }
  await assert.rejects(cloud.restoreCloudBackupHistoryToLocal("test-backup"), { message: suspension.CLOUD_SYNC_SUSPENSION_MESSAGE });
  assert.equal(clientCalls, 0, "blocked writes must not even create a cloud client");
  const status = await cloud.getCloudSyncStatus();
  assert.equal(status.statusLabel, suspension.CLOUD_SYNC_SUSPENSION_MESSAGE);
  assert.equal(status.needsSync, true);
  assert.equal(clientCalls, 0);
  assert.equal((await cloud.getCloudBackupHistory()).length, 0);
  assert.equal(clientCalls, 1, "history remains readable");

  let localChange, authChange, cleanup, timers = 0;
  const autoDeps = {
    "../lib/cloudSyncSuspension": suspension,
    "../lib/userSessionStore": { getUserSessionStore: () => ({
      subscribe(fn) { authChange = fn; return () => {}; },
    }) },
    react: { useRef: value => ({ current: value }), useEffect: fn => { cleanup = fn(); } },
    "../lib/cloudSyncSettingsStorage": {
      loadCloudSyncSettings: () => ({ autoSyncEnabled: true, autoSyncDelaySeconds: 30 }),
      subscribeToCloudSyncSettingsChanges: () => () => {},
    },
    "../lib/localChangeTracker": {
      subscribeToLocalDataChanges: fn => { localChange = fn; return () => {}; },
    },
    "../lib/cloudSync": {},
    "../lib/cloudStartupRestoreStorage": {},
  };
  load("app/components/CloudAutoSync.tsx", autoDeps, {
    window: { setTimeout() { timers++; }, clearTimeout() {} },
  }).default();
  localChange();
  authChange("SIGNED_OUT", null);
  authChange("SIGNED_IN", { user: { id: "other-account" } });
  localChange();
  cleanup();
  assert.equal(timers, 0, "suspension must never schedule uploads");

  // Even when the temporary switch is later lifted, stale queued callbacks
  // must not start under another session.
  let queuedCallback, safetyCalls = 0, clearedTimers = 0;
  autoDeps["../lib/cloudSyncSuspension"] = { CLOUD_SYNC_SUSPENDED: false };
  autoDeps["../lib/cloudSync"] = {
    canUploadLocalDataSafely: async () => { safetyCalls++; return { canUpload: true }; },
  };
  load("app/components/CloudAutoSync.tsx", autoDeps, {
    window: {
      setTimeout(fn) { queuedCallback = fn; return 1; },
      clearTimeout() { clearedTimers++; },
    },
  }).default();
  localChange();
  authChange("SIGNED_IN", { user: { id: "another-account" } });
  queuedCallback();
  await Promise.resolve();
  assert.equal(safetyCalls, 0);
  assert.ok(clearedTimers > 0);
  cleanup();

  load("app/components/CloudStartupRestore.tsx", {
    react: { useRef: value => ({ current: value }), useEffect: fn => fn() },
    "../lib/cloudSyncSuspension": suspension,
    "../lib/cloudSync": {},
    "../lib/cloudStartupRestoreStorage": {},
    "../lib/supabaseClient": { createBrowserSupabaseClient() { throw new Error("Startup must remain inactive"); } },
  }).default();
  console.log("PASS: central writes blocked, history readable, suspended status, no automatic upload or startup restore.");
})().catch(error => { console.error(error); process.exitCode = 1; });
