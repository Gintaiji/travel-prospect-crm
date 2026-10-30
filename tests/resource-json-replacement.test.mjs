import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const resource = id => ({ id, title: id, type: "Site", url: "https://example.invalid", notes: "fictif", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" });
const json = (ownerUserId = A, resources = [resource("incoming")]) => JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId, resources });
const confirmation = { ownerUserId: A, ownershipCertain: true, legacyOwnershipVerified: false, previewReviewed: true, safetyBackupSaved: true, replaceExisting: true };
async function fixture() {
  const load = createTsLoader();
  const data = new Map([[key(A, "resources"), JSON.stringify([resource("old")], null, 2)], [key(B, "resources"), "B unchanged"],
    ["travel-prospect-crm-resources", "legacy unchanged"], ["travel-prospect-crm:legacy-migration:v1", "reservation unchanged"],
    [key(A, "migration-state"), JSON.stringify({ userId: A, status: "verified", active: false, createdAt: "2026-10-29", verifiedAt: "2026-10-29", sourceFingerprint: "a".repeat(64) })]]);
  let session = { userId: A, revision: 1 }, failRead = null, writes = 0, onWrite = () => {};
  const scoped = load("app/lib/accountScopedStorage.ts").createAccountScopedStorage({ getSessionSnapshot: () => session,
    validateUser: async () => ({ id: session.userId }), getStorage: () => ({
      getItem(k) { assert.ok(k.startsWith(`travel-prospect-crm:account:v1:${A}:`), "never read foreign/shared data"); if (k === key(A, failRead)) throw Error("read impossible"); return data.get(k) ?? null; },
      setItem(k, v) { assert.ok(k.startsWith(`travel-prospect-crm:account:v1:${A}:`)); writes++; const altered = onWrite(k, v, writes); data.set(k, altered ?? v); },
      removeItem() { assert.fail("never delete"); },
    }) });
  const owner = await scoped.validateOwner(A);
  const business = load("app/lib/accountBusinessStorage.ts").createAccountBusinessStorage(scoped).forOwner(owner);
  const op = { userId: A, owner, business, assertCurrent() { scoped.read(owner, "migration-state"); } };
  const store = { scopedStorage: scoped, beginOperation: async () => { op.assertCurrent(); return op; } };
  const backupModule = load("app/lib/resourceBackupJson.ts"), coordinator = load("app/lib/resourceWriteCoordinator.ts");
  assert.equal(backupModule.RESOURCE_JSON_REPLACEMENT_ENABLED, false);
  const create = overrides => backupModule.createResourceBackupJson({ enabled: true, store, replacementPolicy: "coordinated", recoveryEnabled: true, ...overrides });
  const api = create();
  return { load, data, owner, scoped, api, coordinator, create, writes: () => writes,
    async prepared(source = json(), customApi = api) { const p = await customApi.preview(source, {}); customApi.verifyImportSafetyBackup(p, p.safetyJson); return p; },
    switchAccount() { session = { userId: B, revision: 2 }; }, fail(name) { failRead = name; }, onWrite(fn) { onWrite = fn; },
    diagnostic: async () => JSON.parse(await coordinator.exportResourceRecoveryDiagnostic(scoped, owner)),
  };
}
{
  const s = await fixture(), before = [...s.data], p = await s.api.preview(json(), {});
  assert.equal(s.writes(), 0); assert.equal(p.currentResources[0].id, "old"); assert.equal(p.resources[0].id, "incoming");
  assert.equal(JSON.parse(p.safetyJson).rawResources, s.data.get(key(A, "resources")));
  assert.equal(JSON.parse(p.safetyJson).recoveryReceipt.ownerUserId, A);
  await assert.rejects(s.api.apply(p, confirmation), /non relue/);
  assert.throws(() => s.api.verifyImportSafetyBackup(p, "{}"), /différente/);
  s.api.verifyImportSafetyBackup(p, p.safetyJson);
  for (const field of ["replaceExisting", "safetyBackupSaved", "previewReviewed", "ownershipCertain"]) await assert.rejects(s.api.apply(p, { ...confirmation, [field]: false }));
  await assert.rejects(s.api.apply(p, { ...confirmation, ownerUserId: B })); assert.deepEqual([...s.data], before);
  p.currentResources[0].title = "display mutation"; p.resources[0].title = "display mutation";
  await s.api.apply(p, confirmation);
  assert.equal(JSON.parse(s.data.get(key(A, "resources")))[0].title, "incoming");
  const entries = JSON.parse(s.data.get(key(A, "resource-import-journal")));
  assert.equal(entries[0].beforeRaw, before.find(([k]) => k === key(A, "resources"))[1]);
  assert.equal(entries[0].receipts.safety.sha256, createHash("sha256").update(p.safetyJson).digest("hex")); assert.equal(entries[0].candidateRaw, s.data.get(key(A, "resources")));
  assert.equal((await s.diagnostic()).status, "ready");
  for (const [k, v] of before) if (k !== key(A, "resources")) assert.equal(s.data.get(k), v);
  await assert.rejects(s.api.apply(p, confirmation));
}
{
  const s = await fixture(), api = s.create({ replacementPolicy: undefined }); const p = await api.preview(json(), {});
  assert.equal(p.replacementAllowed, false); api.verifyImportSafetyBackup(p, p.safetyJson);
  await assert.rejects(api.apply(p, confirmation), /remplacement bloqué/); assert.equal(s.writes(), 0);
}
for (const bad of [json(B), "{", json(A, [{}]), json(A, null), JSON.stringify({ appName: "Travel Prospect CRM", version: 4, prospects: [], resources: [] })]) {
  const s = await fixture(), before = [...s.data]; await assert.rejects(s.api.preview(bad, {})); assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
{
  const s = await fixture(); s.data.delete(key(A, "resources"));
  const before = [...s.data];
  await assert.rejects(s.api.preview(JSON.stringify({ appName: "Travel Prospect CRM", version: 4, prospects: [], resources: [] }), {}), /sans propriétaire vérifié/);
  assert.deepEqual([...s.data], before);
}
for (const name of ["resources", "resource-import-journal", "resource-import-state", "migration-state"]) {
  const s = await fixture(); s.fail(name); const before = [...s.data]; await assert.rejects(s.api.preview(json(), {}), /impossible/); assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
// Coherent journal/marker changes and migration changes are conflicts even with identical resources.
for (const name of ["resource-import-journal", "resource-import-state", "migration-state"]) {
  const s = await fixture(), beforeRaw = s.data.get(key(A, "resources"));
  await s.coordinator.coordinateResourceWrite({ scoped: s.scoped, owner: s.owner, kind: "edit", expectedRaw: beforeRaw, candidateRaw: beforeRaw });
  const p = await s.prepared();
  s.data.set(key(A, name), s.data.get(key(A, name)) + "\n"); const before = [...s.data];
  await assert.rejects(s.api.apply(p, confirmation), /modifié/); assert.deepEqual([...s.data], before);
}
{
  const s = await fixture(), other = s.create(), p = await s.prepared(), q = await s.prepared(json(A, [resource("second")]), other);
  const results = await Promise.allSettled([s.api.apply(p, confirmation), other.apply(q, confirmation)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.match(results.find(r => r.status === "rejected").reason.message, /Conflit/);
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-journal"))).length, 1);
}
{
  const s = await fixture(), p = await s.prepared(); let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const held = navigator.locks.request(s.coordinator.resourceWriteLockName(A), async () => { entered(); await new Promise(resolve => { release = resolve; }); });
  await ready; const operation = s.api.apply(p, confirmation), refused = assert.rejects(operation);
  s.switchAccount(); release(); await held; await refused; assert.equal(s.writes(), 0);
}
for (const stopAt of [1, 2, 3, 4]) for (const afterPersist of [false, true]) {
  const s = await fixture(), p = await s.prepared(), old = s.data.get(key(A, "resources"));
  s.onWrite((k, v, n) => { if (n === stopAt) { if (afterPersist) s.data.set(k, v); throw Error("interruption/quota"); } });
  await assert.rejects(s.api.apply(p, confirmation)); s.onWrite(() => {});
  if (s.data.has(key(A, "resource-import-journal"))) {
    const first = JSON.parse(s.data.get(key(A, "resource-import-journal")))[0];
    assert.equal(first.beforeRaw, old); assert.equal(first.receipts.safety.sha256, createHash("sha256").update(p.safetyJson).digest("hex"));
  } else assert.equal(s.data.get(key(A, "resources")), old);
  const d = await s.diagnostic();
  assert.equal(d.status, (stopAt === 1 && !afterPersist) || (stopAt === 4 && afterPersist) ? "ready" : "recovery-required");
  await assert.rejects(s.api.apply(p, confirmation)); // Consumed preview, no blind retry.
}
// An interrupted replacement can be manually restored from its exact previous copy.
{
  const s = await fixture(), old = s.data.get(key(A, "resources")), p = await s.prepared();
  s.onWrite((_k, _v, n) => { if (n === 4) throw Error("final marker interrupted"); });
  await assert.rejects(s.api.apply(p, confirmation)); s.onWrite(() => {});
  const recovery = await s.api.previewRecovery({}); s.api.verifyRecoverySafetyBackup(recovery, recovery.diagnosticJson);
  const selection = recovery.copies.find(copy => copy.side === "beforeRaw");
  await s.api.applyRecovery(recovery, selection, { ownerUserId: A, previewReviewed: true, recoverExplicitly: true });
  assert.equal(s.data.get(key(A, "resources")), old);
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-journal")))[0].receipts.safety.sha256, createHash("sha256").update(p.safetyJson).digest("hex"));
  assert.equal((await s.diagnostic()).status, "ready");
}
{
  const s = await fixture(), old = s.data.get(key(A, "resources")), p = await s.prepared(json(A, []));
  await s.api.apply(p, confirmation); assert.equal(s.data.get(key(A, "resources")), "[]");
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-journal")))[0].beforeRaw, old);
}
for (const mode of ["alter-resources", "alter-marker", "read-after-copy"]) {
  const s = await fixture(), p = await s.prepared();
  s.onWrite((_k, _v, n) => {
    if (mode === "alter-resources" && n === 3) return "[]";
    if (mode === "alter-marker" && n === 4) return "{}";
    if (mode === "read-after-copy" && n === 3) s.fail("resources");
  });
  await assert.rejects(s.api.apply(p, confirmation));
}
// Historical nested archives are read without recursive decoding or conversion.
{
  const s = await fixture(), beforeRaw = s.data.get(key(A, "resources"));
  const d = { appName: "Travel Prospect CRM", storageScope: "resource-recovery-diagnostic", userId: A, status: "ready", rawResources: beforeRaw, rawJournal: "[]" };
  const diagnosticJson = JSON.stringify(d);
  const safetyJson = JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A,
    purpose: "before-resource-import", rawResources: beforeRaw, resources: JSON.parse(beforeRaw), recoveryDiagnostic: d });
  const historical = JSON.stringify([{ importId: "historical", userId: A, kind: "import", sourceOwnerUserId: A, createdAt: "2026-10-29",
    beforeRaw, candidateRaw: beforeRaw, replacement: { stagedRaw: beforeRaw, diagnosticJson, safetyJson } }], null, 2);
  s.data.set(key(A, "resource-import-journal"), historical);
  s.data.set(key(A, "resource-import-state"), JSON.stringify({ userId: A, importId: "historical", status: "verified", createdAt: "2026-10-29", verifiedAt: "2026-10-29" }));
  assert.equal((await s.diagnostic()).status, "ready");
  const p = await s.prepared();
  assert.equal(p.safetyJson.includes("rawJournal"), false);
  await s.api.apply(p, confirmation);
  const appended = s.data.get(key(A, "resource-import-journal"));
  assert.ok(appended.startsWith(historical.slice(0, -1))); // Exact old whitespace and bytes.
  assert.deepEqual(JSON.parse(appended)[0], JSON.parse(historical)[0]);
  assert.equal(JSON.parse(appended)[1].replacement, undefined);
  const corrupt = JSON.parse(appended); corrupt[0].replacement.safetyJson = "{";
  s.data.set(key(A, "resource-import-journal"), JSON.stringify(corrupt));
  const unchanged = [...s.data];
  await assert.rejects(s.api.preview(json(), {})); assert.deepEqual([...s.data], unchanged);
}
for (const field of ["sourceOwnerUserId", "safetyJson", "stagedRaw", "archiveVersion", "fingerprints", "receipts"]) {
  const s = await fixture(), p = await s.prepared(); await s.api.apply(p, confirmation);
  const journal = JSON.parse(s.data.get(key(A, "resource-import-journal")));
  if (field === "sourceOwnerUserId") journal[0].sourceOwnerUserId = B;
  else journal[0][field] = "invalid";
  s.data.set(key(A, "resource-import-journal"), JSON.stringify(journal));
  assert.equal((await s.diagnostic()).status, "recovery-required");
  await assert.rejects(s.api.preview(json(), {}));
}
console.log("PASS: owned JSON replacement, complete saved/read safety backup, exact before/after, full snapshot conflicts, native-lock concurrency, session change, four interruption points, manual previous-copy recovery, empty list and disabled production default.");
