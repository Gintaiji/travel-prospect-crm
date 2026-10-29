import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHookHarness } from "./helpers/resourceHookHarness.mjs";

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const harness = createHookHarness();
let session = { status: "connected", userId: "A", generation: 1 };
let pending = [], loads = 0;
const store = {
  assertCurrent(capture) { assert.equal(capture.userId, session.userId); assert.equal(capture.generation, session.generation); },
};
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/hooks/usePreparedResources.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports, require(name) {
  if (name === "react") return harness.react;
  if (name === "../components/UserSessionProvider") return { useUserSession: () => ({ ...session, store }) };
  if (name === "../lib/resourceIsolationSettings") return { ACCOUNT_SCOPED_RESOURCES_ENABLED: false };
  if (name === "../lib/resourceStorage") return {
    loadResources() { throw new Error("No fallback allowed"); }, saveResources() { throw new Error("No legacy writes"); },
  };
  if (name === "../lib/resourceAccess") return {
    createResourceAccess: () => ({ load(capture) {
      loads++;
      return new Promise(resolve => pending.push({ capture, resolve }));
    } }),
  };
  throw new Error(`Unexpected dependency ${name}`);
} });
const render = enabled => harness.render(() => exports.usePreparedResources(enabled));
assert.equal(render().state.status, "disabled"); harness.effects(); assert.equal(loads, 0);
assert.equal(render(true).state.status, "loading"); harness.effects();
pending.shift().resolve({ status: "available", resources: [{ id: "A-resource" }] }); await flush();
assert.equal(render(true).state.resources[0].id, "A-resource");

// A is masked during the first B render, before cleanup/effect and before B's read.
session = { status: "connected", userId: "B", generation: 2 };
assert.equal(render(true).state.status, "loading"); harness.effects();
pending.shift().resolve({ status: "available", resources: [{ id: "B-resource" }] }); await flush();
assert.equal(render(true).state.resources[0].id, "B-resource");

// Late old-generation responses are ignored, including identical account IDs.
session = { status: "connected", userId: "A", generation: 3 };
render(true); harness.effects(); const old = pending.shift();
session = { status: "connected", userId: "B", generation: 4 };
render(true); harness.effects();
old.resolve({ status: "available", resources: [{ id: "late-A" }] }); await flush();
assert.equal(render(true).state.status, "loading");
pending.shift().resolve({ status: "migration-required", label: "Migration nécessaire" }); await flush();
assert.equal(render(true).state.status, "migration-required");
session = { status: "disconnected", userId: null, generation: 5 };
assert.equal(render(true).state.status, "session-required"); harness.effects();
session = { status: "error", userId: null, generation: 6, error: "offline" };
assert.equal(render(true).state.label, "offline"); harness.effects();
harness.unmount();
console.log("PASS: resources hook off by default, account reload, immediate old-data masking and ignored stale reads.");
