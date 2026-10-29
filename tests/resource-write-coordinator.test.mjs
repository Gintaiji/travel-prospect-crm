import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { createTsLoader } from "./helpers/loadTs.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const raw = id => JSON.stringify([{ id, title: id, type: "Site", url: "https://example.test", notes: "", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" }]);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

async function context(data, globals) {
  // Separate module graphs model different tabs, sharing only origin storage/locks.
  const load = createTsLoader(globals);
  const coordinator = load("app/lib/resourceWriteCoordinator.ts");
  let session = { userId: A, revision: 1 }, fail = () => false;
  const { createAccountScopedStorage } = load("app/lib/accountScopedStorage.ts");
  const scoped = createAccountScopedStorage({
    getSessionSnapshot: () => session,
    validateUser: async () => ({ id: session.userId }),
    getStorage: () => ({
      getItem: k => data.get(k) ?? null,
      setItem(k, value) { if (fail(k, value)) throw new Error("quota"); data.set(k, value); },
      removeItem() { throw new Error("Never delete"); },
    }),
  });
  const owner = await scoped.validateOwner(A);
  const write = (expectedRaw, candidateRaw, options = {}) => coordinator.coordinateResourceWrite({ scoped, owner, expectedRaw, candidateRaw, kind: "edit", ...options });
  return { load, scoped, owner, write, ...coordinator,
    switchUser(userId) { session = { userId, revision: session.revision + 1 }; },
    failWhen(fn) { fail = fn; },
  };
}

// Two independent tab contexts, real native Web Locks, stale second snapshot rejected.
{
  const data = new Map([[key(A, "resources"), raw("old")], ["travel-prospect-crm-resources", "source unchanged"]]);
  const tab1 = await context(data), tab2 = await context(data);
  const entered = deferred(), release = deferred(); let secondEntered = false;
  const first = tab1.write(raw("old"), raw("first"), { work: async () => { entered.resolve(); await release.promise; } });
  await entered.promise;
  const second = tab2.write(raw("old"), raw("second"), { work: () => { secondEntered = true; } });
  const rejection = assert.rejects(second, /Conflit/);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(secondEntered, false);
  release.resolve(); await first; await rejection;
  assert.equal(data.get(key(A, "resources")), raw("first"));
  assert.equal(JSON.parse(data.get(key(A, "resource-import-journal"))).length, 1);
  assert.equal(data.get("travel-prospect-crm-resources"), "source unchanged");
  // A refreshed snapshot may save next; previous snapshots are retained.
  await tab2.write(raw("first"), raw("second"));
  assert.equal(JSON.parse(data.get(key(A, "resource-import-journal"))).length, 2);
}

// Direct resource/metadata writes and all key deletions cannot bypass coordination.
{
  const data = new Map([[key(A, "resources"), raw("old")]]);
  const tab = await context(data);
  for (const name of ["resources", "resource-import-journal", "resource-import-state"]) {
    assert.throws(() => tab.scoped.write(tab.owner, name, "[]"));
    assert.throws(() => tab.scoped.write(tab.owner, name, "[]", { userId: A }));
    assert.throws(() => tab.scoped.remove(tab.owner, name));
  }
  assert.equal(data.size, 1);
}

// Every interruption point is detectable; journal-before-marker is NOT treated as clean.
for (const failedName of ["resource-import-state", "resources"]) {
  const data = new Map([[key(A, "resources"), raw("old")]]);
  const tab = await context(data);
  tab.failWhen(k => k === key(A, failedName));
  await assert.rejects(tab.write(raw("old"), raw("new")), /Récupération nécessaire/);
  const journal = JSON.parse(data.get(key(A, "resource-import-journal")));
  assert.equal(journal[0].beforeRaw, raw("old"));
  assert.equal(journal[0].candidateRaw, raw("new"));
  assert.throws(() => tab.assertResourceRecoveryClear(tab.scoped, tab.owner), /Récupération nécessaire/);
  tab.failWhen(() => false);
  const snapshot = [...data];
  const diagnostic = JSON.parse(await tab.exportResourceRecoveryDiagnostic(tab.scoped, tab.owner));
  assert.equal(diagnostic.status, "recovery-required"); assert.equal(diagnostic.userId, A);
  assert.equal(diagnostic.rawResources, data.get(key(A, "resources")));
  assert.equal(JSON.parse(diagnostic.rawJournal)[0].beforeRaw, raw("old"));
  assert.deepEqual([...data], snapshot);
  await assert.rejects(tab.write(data.get(key(A, "resources")), raw("later")), /Récupération nécessaire/);
  assert.deepEqual([...data], snapshot);
}
// Final-marker failure also leaves the successful candidate blocked, with both copies.
{
  const data = new Map([[key(A, "resources"), raw("old")]]);
  const tab = await context(data);
  tab.failWhen((k, value) => k === key(A, "resource-import-state") && JSON.parse(value).status === "verified");
  await assert.rejects(tab.write(raw("old"), raw("candidate")));
  assert.equal(data.get(key(A, "resources")), raw("candidate"));
  assert.throws(() => tab.assertResourceRecoveryClear(tab.scoped, tab.owner), /Récupération nécessaire/);
  assert.equal(JSON.parse(data.get(key(A, "resource-import-journal")))[0].beforeRaw, raw("old"));
}
// Failure before journaling leaves everything intact; no automatic recovery writes.
{
  const data = new Map([[key(A, "resources"), raw("old")]]); const tab = await context(data);
  tab.failWhen(k => k.endsWith(":resource-import-journal"));
  await assert.rejects(tab.write(raw("old"), raw("new")));
  assert.deepEqual([...data], [[key(A, "resources"), raw("old")]]);
  tab.assertResourceRecoveryClear(tab.scoped, tab.owner);
}
// Session changes while waiting for another tab's lock do not write any account.
{
  const data = new Map([[key(A, "resources"), raw("old")]]); const tab = await context(data);
  const held = deferred(), release = deferred();
  const blocker = navigator.locks.request(tab.resourceWriteLockName(A), async () => { held.resolve(); await release.promise; });
  await held.promise;
  const pending = tab.write(raw("old"), raw("forbidden"));
  const rejection = assert.rejects(pending);
  tab.switchUser(B); release.resolve(); await blocker; await rejection;
  assert.deepEqual([...data], [[key(A, "resources"), raw("old")]]);
}
// No Web Locks means refusal, never a localStorage-based pseudo-lock.
{
  const data = new Map([[key(A, "resources"), raw("old")]]);
  const tab = await context(data, { navigator: undefined });
  await assert.rejects(tab.write(raw("old"), raw("new")), /Web Locks indisponible/);
  assert.equal(data.size, 1);
}
// Migration, CRUD and JSON import all pass through exactly the same account lock.
{
  const data = new Map([
    ["travel-prospect-crm-prospects", "[]"], ["travel-prospect-crm-resources", raw("migrated")],
    ["travel-prospect-crm-settings", "{}"], ["travel-prospect-crm-custom-message-templates", "{}"],
    ["travel-prospect-crm-street-marketing-survey", '{"surveys":[],"activeSurveyId":""}'],
  ]);
  const tab = await context(data); const names = [];
  const locks = { request: async (name, options, work) => { names.push(name); return await navigator.locks.request(name, options, work); } };
  const { createLegacyDataMigration } = tab.load("app/lib/legacyDataMigration.ts");
  const migration = createLegacyDataMigration({ scoped: tab.scoped, getLegacyStorage: () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }),
    resourceLocks: locks, withExclusiveLock: async work => await navigator.locks.request("test-legacy-migration", work) });
  await migration.copy(await migration.preview(tab.owner), { ownershipCertain: true, ownerUserId: A, jsonBackupSaved: true });
  const { createAccountBusinessStorage } = tab.load("app/lib/accountBusinessStorage.ts");
  const business = createAccountBusinessStorage(tab.scoped, { resourceLocks: locks }).forOwner(tab.owner);
  await business.loadResources();
  await business.saveResources(JSON.parse(raw("edited")));
  const { createResourceBackupJson } = tab.load("app/lib/resourceBackupJson.ts");
  const store = { scopedStorage: tab.scoped, beginOperation: async () => ({ owner: tab.owner, userId: A, generation: 1, business, assertCurrent() {} }) };
  const api = createResourceBackupJson({ enabled: true, store, resourceLocks: locks, replacementPolicy: "coordinated" });
  const preview = await api.preview(JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: JSON.parse(raw("imported")) }), { userId: A, generation: 1 });
  api.verifyImportSafetyBackup(preview, preview.safetyJson);
  await api.apply(preview, { ownerUserId: A, ownershipCertain: true, legacyOwnershipVerified: false, previewReviewed: true, safetyBackupSaved: true, replaceExisting: true });
  assert.equal(names.length, 5); assert.ok(names.every(name => name === tab.resourceWriteLockName(A)));
  assert.deepEqual(JSON.parse(data.get(key(A, "resource-import-journal"))).map(entry => entry.kind), ["migration", "edit", "import"]);
  assert.equal(data.get("travel-prospect-crm-resources"), raw("migrated"));
}

// Actual cross-thread Web Locks exclusion (not a browser navigation test).
{
  const state = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3);
  const run = () => new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData, locks } = require('node:worker_threads');
      const counters = new Int32Array(workerData);
      const keepAlive = setInterval(() => {}, 1000);
      locks.request('crm-real-cross-context-resource-test', { mode: 'exclusive' }, async () => {
        const active = Atomics.add(counters, 0, 1) + 1;
        Atomics.store(counters, 1, Math.max(active, Atomics.load(counters, 1)));
        await new Promise(resolve => setTimeout(resolve, 15));
        Atomics.sub(counters, 0, 1); Atomics.add(counters, 2, 1);
      }).then(() => { clearInterval(keepAlive); parentPort.postMessage('done'); });
    `, { eval: true, workerData: state });
    let finished = false;
    worker.once("message", () => { finished = true; resolve(); }); worker.once("error", reject);
    worker.once("exit", code => { if (!finished) reject(new Error(`Worker exited before lock completion (${code})`)); });
  });
  await Promise.all([run(), run()]);
  assert.equal(new Int32Array(state)[1], 1); assert.equal(new Int32Array(state)[2], 2);
}
console.log("PASS: shared account Web Locks, two independent contexts/threads, stale conflicts, interrupted journals, denied bypasses, session changes, storage failures and unified migration/CRUD/import.");
