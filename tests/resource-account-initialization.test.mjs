import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const resource = { id: "B-own", title: "B own", type: "Site", url: "https://example.invalid", notes: "", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" };
async function fixture(data = new Map([["travel-prospect-crm-resources", "A history"], ["travel-prospect-crm:legacy-migration:v1", "reserved for A"], [key(A, "resources"), "A exact data"]])) {
  const load = createTsLoader();
  const { createAccountScopedStorage, ACCOUNT_STORAGE_NAMES } = load("app/lib/accountScopedStorage.ts");
  let session = { userId: B, revision: 1 }, failRead = null, onWrite = () => {}, writes = 0;
  const scoped = createAccountScopedStorage({ getSessionSnapshot: () => session, validateUser: async () => ({ id: session.userId }), getStorage: () => ({
    getItem(k) { assert.ok(k.startsWith(`travel-prospect-crm:account:v1:${B}:`), "no shared or account A read"); if (k === key(B, failRead)) throw new Error("read inaccessible"); return data.get(k) ?? null; },
    setItem(k, v) { assert.ok(k.startsWith(`travel-prospect-crm:account:v1:${B}:`)); writes++; const altered = onWrite(k, v, writes); data.set(k, altered ?? v); },
    removeItem() { assert.fail("never delete"); },
  }) });
  const owner = await scoped.validateOwner(B);
  const business = load("app/lib/accountBusinessStorage.ts").createAccountBusinessStorage(scoped).forOwner(owner);
  const store = { scopedStorage: scoped, beginOperation: async capture => {
    assert.equal(capture.userId, B); scoped.read(owner, "migration-state");
    return { userId: B, owner, business, assertCurrent() { scoped.read(owner, "migration-state"); } };
  } };
  const create = enabled => load("app/lib/resourceAccountInitialization.ts").createResourceAccountInitialization({ enabled, store });
  const api = create(true), capture = { userId: B, generation: 1 }, confirmation = { ownerUserId: B, emptySpaceConfirmed: true };
  return { data, scoped, owner, business, api, create, names: ACCOUNT_STORAGE_NAMES, load,
    initialize: (c = confirmation) => api.initialize(capture, c), writes: () => writes,
    switchAccount() { session = { userId: A, revision: 2 }; }, fail(name) { failRead = name; }, onWrite(fn) { onWrite = fn; },
    diagnostic: async () => JSON.parse(await load("app/lib/resourceWriteCoordinator.ts").exportResourceRecoveryDiagnostic(scoped, owner)),
  };
}
{
  const s = await fixture(), before = [...s.data];
  assert.equal((await s.business.loadResources()).status, "fresh-account"); assert.equal(s.writes(), 0);
  assert.equal(s.business.getStatus().status, "migration-required");
  for (const c of [{ ownerUserId: A, emptySpaceConfirmed: true }, { ownerUserId: B, emptySpaceConfirmed: false }]) await assert.rejects(s.initialize(c));
  await assert.rejects(s.create(false).initialize({ userId: B }, { ownerUserId: B, emptySpaceConfirmed: true }), /désactivée/);
  assert.deepEqual([...s.data], before);
  await s.initialize(); assert.equal(s.data.get(key(B, "resources")), "[]");
  assert.equal(s.data.has(key(B, "migration-state")), false); assert.equal(s.business.getStatus().status, "migration-required");
  assert.equal(s.business.loadProspects().status, "migration-required"); // Other modules stay uninitialized.
  const entry = JSON.parse(s.data.get(key(B, "resource-import-journal")))[0];
  assert.equal(entry.kind, "initialization"); assert.equal(entry.userId, B); assert.equal(entry.beforeRaw, null); assert.equal(entry.candidateRaw, "[]");
  assert.equal((await s.business.loadResources()).status, "available"); await s.business.saveResources([resource]);
  assert.equal(s.data.get(key(B, "resources")), JSON.stringify([resource]));
  const saved = [...s.data]; await assert.rejects(s.initialize()); assert.deepEqual([...s.data], saved);
  for (const [k, v] of before) assert.equal(s.data.get(k), v);
  assert.equal((await s.diagnostic()).status, "ready");
  const json = await s.load("app/lib/resourceBackupJson.ts").createResourceBackupJson({ enabled: true, store: {
    scopedStorage: s.scoped, beginOperation: async () => ({ userId: B, business: s.business, assertCurrent() {} }),
  } }).exportResources({ userId: B });
  assert.equal(JSON.parse(json).ownerUserId, B); assert.deepEqual(JSON.parse(json).resources, [resource]);
}
// Every existing account key, including unrelated metadata, prevents initialization.
{
  const sample = await fixture();
  for (const name of sample.names) {
    const s = await fixture(); s.data.set(key(B, name), "existing or incomplete"); const before = [...s.data];
    await assert.rejects(s.initialize()); assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
  }
}
// Two module graphs / tabs share the same native Web Lock.
{
  const one = await fixture(), two = await fixture(one.data);
  const results = await Promise.allSettled([one.initialize(), two.initialize()]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal(JSON.parse(one.data.get(key(B, "resource-import-journal"))).length, 1);
}
// Account change or a new isolated key while queued is detected after acquisition.
for (const change of ["session", "settings"]) {
  const s = await fixture(); let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const lock = navigator.locks.request(s.load("app/lib/resourceWriteCoordinator.ts").resourceWriteLockName(B), async () => { entered(); await new Promise(resolve => { release = resolve; }); });
  await ready; const pending = s.initialize(); const refused = assert.rejects(pending);
  if (change === "session") s.switchAccount(); else s.data.set(key(B, "settings"), "concurrent");
  const before = [...s.data]; release(); await lock; await refused; assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
for (const name of ["resources", "resource-import-journal", "resource-import-state", "migration-state", "settings", "startup-restore-status"]) {
  const s = await fixture(); s.fail(name); const before = [...s.data]; await assert.rejects(s.initialize(), /inaccessible/); assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
for (const stopAt of [1, 2, 3, 4]) for (const afterPersist of [false, true]) {
  const s = await fixture(); s.onWrite((k, v, n) => { if (n === stopAt) { if (afterPersist) s.data.set(k, v); throw Error("interrupted/quota"); } });
  await assert.rejects(s.initialize()); s.onWrite(() => {});
  const d = await s.diagnostic();
  if (stopAt === 1 && !afterPersist) assert.equal((await s.business.loadResources()).status, "fresh-account");
  else if (stopAt === 4 && afterPersist) assert.equal(d.status, "ready");
  else {
    assert.equal(d.status, "recovery-required"); await assert.rejects(s.business.loadResources(), /Récupération nécessaire/);
    const before = [...s.data]; await assert.rejects(s.initialize()); assert.deepEqual([...s.data], before);
  }
}
// Exact readback and session revocation during persistence cannot signal success.
for (const mode of ["altered", "session"]) {
  const s = await fixture(); s.onWrite((_k, _v, n) => { if (n === 3) { if (mode === "session") s.switchAccount(); else return "[{}]"; } });
  await assert.rejects(s.initialize()); assert.equal(s.data.get("travel-prospect-crm:legacy-migration:v1"), "reserved for A");
}
console.log("PASS: resource-only empty initialization, confirmed ownership, unchanged legacy/A reservation, B writes, all isolated-key guards, native-lock concurrency, stale sessions, storage failures and interruption diagnostics.");
