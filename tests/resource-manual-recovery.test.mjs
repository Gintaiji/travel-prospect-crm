import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const raw = id => JSON.stringify([{ id, title: id, type: "Site", url: "", notes: "", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" }]);
const confirmation = { ownerUserId: A, previewReviewed: true, recoverExplicitly: true };
async function fixture() {
  const load = createTsLoader();
  const coordinator = load("app/lib/resourceWriteCoordinator.ts");
  const entry = { importId: "interrupted", userId: A, kind: "import", createdAt: "2026-10-29", beforeRaw: raw("old"), candidateRaw: raw("new") };
  const data = new Map([[key(A, "resources"), raw("new")], [key(A, "resource-import-journal"), JSON.stringify([entry])],
    [key(A, "resource-import-state"), JSON.stringify({ userId: A, importId: "interrupted", status: "pending", createdAt: "2026-10-29" })],
    [key(B, "resources"), "account B untouched"], ["travel-prospect-crm-resources", "legacy untouched"]]);
  let session = { userId: A, revision: 1 }, writes = 0, readFailure = null;
  let onWrite = () => {};
  const scoped = load("app/lib/accountScopedStorage.ts").createAccountScopedStorage({ getSessionSnapshot: () => session,
    validateUser: async () => ({ id: session.userId }), getStorage: () => ({
      getItem(k) { if (k === readFailure) throw new Error("read failure"); return data.get(k) ?? null; },
      setItem(k, v) { writes++; const altered = onWrite(k, v, writes); data.set(k, altered ?? v); },
      removeItem() { assert.fail("deletion forbidden"); },
    }) });
  const owner = await scoped.validateOwner(A);
  const op = { owner, userId: A, assertCurrent() { scoped.read(owner, "migration-state"); } };
  const store = { scopedStorage: scoped, beginOperation: async () => { op.assertCurrent(); return op; } };
  const create = overrides => load("app/lib/resourceBackupJson.ts").createResourceBackupJson({ enabled: true, recoveryEnabled: true, store, ...overrides });
  const api = create();
  return { load, data, entry, scoped, owner, coordinator, api, create,
    switchAccount() { session = { userId: B, revision: 2 }; },
    onWrite(fn) { onWrite = fn; }, failRead(name) { readFailure = key(A, name); }, writes: () => writes,
    async prepared(customApi = api) { const preview = await customApi.previewRecovery({}); customApi.verifyRecoverySafetyBackup(preview, preview.diagnosticJson); return preview; },
    put(name, value) { data.set(key(A, name), value); },
    inspect: async () => JSON.parse(await coordinator.exportResourceRecoveryDiagnostic(scoped, owner)),
  };
}
const select = preview => ({ operationId: preview.copies[0].operationId, side: preview.copies[0].side });
{
  const s = await fixture(), before = [...s.data];
  const p = await s.api.previewRecovery({});
  assert.equal(s.writes(), 0); assert.equal(p.copies.length, 2);
  await assert.rejects(s.api.applyRecovery(p, select(p), confirmation), /Sauvegarde/);
  assert.throws(() => s.api.verifyRecoverySafetyBackup(p, p.diagnosticJson + " "), /différente/);
  s.api.verifyRecoverySafetyBackup(p, p.diagnosticJson);
  for (const bad of [{ ...confirmation, ownerUserId: B }, { ...confirmation, previewReviewed: false }, { ...confirmation, recoverExplicitly: false }]) await assert.rejects(s.api.applyRecovery(p, select(p), bad));
  await assert.rejects(s.api.applyRecovery(p, { operationId: "fake", side: "beforeRaw" }, confirmation));
  assert.deepEqual([...s.data], before);
  // Display mutation cannot change the captured raw candidate.
  p.copies[0].resources[0].title = "tampered display";
  const result = await s.api.applyRecovery(p, select(p), confirmation);
  assert.equal(result.resourcesCount, 1); assert.equal(s.data.get(key(A, "resources")), raw("old"));
  const journal = JSON.parse(s.data.get(key(A, "resource-import-journal")));
  assert.equal(journal.length, 2); assert.deepEqual(journal[0], s.entry);
  assert.equal(journal[1].receipts.diagnostic.sha256, createHash("sha256").update(p.diagnosticJson).digest("hex")); assert.equal(journal[1].candidateRaw, raw("old"));
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-state"))).status, "verified");
  assert.equal((await s.inspect()).status, "ready");
  assert.equal(s.data.get(key(B, "resources")), "account B untouched"); assert.equal(s.data.get("travel-prospect-crm-resources"), "legacy untouched");
  await assert.rejects(s.api.applyRecovery(p, select(p), confirmation));
  // Ordinary coordinated writes work after verified manual recovery.
  await s.coordinator.coordinateResourceWrite({ scoped: s.scoped, owner: s.owner, kind: "edit", expectedRaw: raw("old"), candidateRaw: raw("later") });
}
for (const mode of ["absent-journal", "bad-journal", "bad-copy", "absent-copies", "wrong-owner", "wrong-source", "wrong-state", "bad-current"]) {
  const s = await fixture();
  if (mode === "absent-journal") s.data.delete(key(A, "resource-import-journal"));
  if (mode === "bad-journal") s.put("resource-import-journal", "[");
  if (mode === "bad-current") s.put("resources", "broken");
  if (mode === "wrong-state") s.put("resource-import-state", JSON.stringify({ userId: B }));
  if (["bad-copy", "absent-copies", "wrong-owner", "wrong-source"].includes(mode)) {
    if (mode === "bad-copy") s.entry.beforeRaw = "[{}]";
    if (mode === "absent-copies") s.entry.beforeRaw = s.entry.candidateRaw = null;
    if (mode === "wrong-owner") s.entry.userId = B;
    if (mode === "wrong-source") s.entry.sourceOwnerUserId = B;
    s.put("resource-import-journal", JSON.stringify([s.entry]));
  }
  const before = [...s.data]; await assert.rejects(s.api.previewRecovery({})); assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
// Missing marker or destination is not silently turned into an invented empty copy.
for (const missing of ["resource-import-state", "resources"]) {
  const s = await fixture(); s.data.delete(key(A, missing));
  const p = await s.prepared(); await s.api.applyRecovery(p, select(p), confirmation);
  assert.equal(s.data.get(key(A, "resources")), raw("old")); assert.equal((await s.inspect()).status, "ready");
}
for (const name of ["resources", "resource-import-state", "resource-import-journal", "migration-state"]) {
  const s = await fixture(), p = await s.prepared();
  s.put(name, "concurrent change"); const before = [...s.data];
  await assert.rejects(s.api.applyRecovery(p, select(p), confirmation), /Conflit/); assert.deepEqual([...s.data], before);
}
// Two independent API previews queued on the same native account Web Lock.
{
  const s = await fixture(), other = s.create(), p = await s.prepared(), q = await s.prepared(other);
  const results = await Promise.allSettled([s.api.applyRecovery(p, select(p), confirmation), other.applyRecovery(q, select(q), confirmation)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.match(results.find(r => r.status === "rejected").reason.message, /Conflit/);
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-journal"))).length, 2);
}
// Session revoked during native lock wait: zero writes.
{
  const s = await fixture(), p = await s.prepared();
  let release, entered;
  const held = new Promise(resolve => { entered = resolve; });
  const blocker = navigator.locks.request(s.coordinator.resourceWriteLockName(A), async () => { entered(); await new Promise(resolve => { release = resolve; }); });
  await held;
  const pending = s.api.applyRecovery(p, select(p), confirmation); const rejected = assert.rejects(pending, /owner|expired/);
  s.switchAccount(); release(); await blocker; await rejected; assert.equal(s.writes(), 0);
}
// Each write can fail or be interrupted after persistence. Every case preserves old copies.
for (const afterPersist of [false, true]) for (const stopAt of [1, 2, 3, 4]) {
  const s = await fixture(), p = await s.prepared();
  s.onWrite((k, v, n) => {
    if (n === stopAt) { if (afterPersist) s.data.set(k, v); throw new Error("simulated interruption/quota"); }
  });
  await assert.rejects(s.api.applyRecovery(p, select(p), confirmation));
  s.onWrite(() => {});
  const journal = JSON.parse(s.data.get(key(A, "resource-import-journal")));
  assert.deepEqual(journal[0], s.entry);
  if (journal.length > 1) assert.equal(journal[1].receipts.diagnostic.sha256, createHash("sha256").update(p.diagnosticJson).digest("hex"));
  if (!(afterPersist && stopAt === 4)) {
    assert.equal((await s.inspect()).status, "recovery-required");
    // New manual diagnosis can prepare another attempt; no automatic retry.
    const retry = await s.prepared(); await s.api.applyRecovery(retry, select(retry), confirmation);
    assert.equal((await s.inspect()).status, "ready");
  }
  assert.equal(s.data.get(key(B, "resources")), "account B untouched");
}
// Silently altered writes and post-write read errors must never report success.
for (const mode of ["alter-data", "alter-journal", "alter-marker", "read-after-data"]) {
  const s = await fixture(), p = await s.prepared();
  s.onWrite((k, _v, n) => {
    if (mode === "alter-data" && n === 3) return raw("different");
    if (mode === "alter-journal" && n === 1) return "[]";
    if (mode === "alter-marker" && n === 4) return "{}";
    if (mode === "read-after-data" && k === key(A, "resources")) s.failRead("resources");
  });
  await assert.rejects(s.api.applyRecovery(p, select(p), confirmation));
}
{
  const s = await fixture(); await assert.rejects(s.create({ recoveryEnabled: undefined }).previewRecovery({}), /désactivée/);
  await assert.rejects(s.create({ enabled: false }).previewRecovery({}), /désactivées/); assert.equal(s.writes(), 0);
  await assert.rejects(s.coordinator.coordinateResourceWrite({ scoped: s.scoped, owner: s.owner, kind: "recovery", expectedRaw: raw("new"), candidateRaw: raw("old") }), /désactivée/);
}
console.log("PASS: manual recovery healthy copies, verified safety file, confirmations, strict ownership/integrity, native lock concurrency, stale sessions, interruptions/quota, exact readback, retained evidence and disabled defaults.");
