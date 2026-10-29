import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";
const load = createTsLoader();
const { createResourceBackupJson, parseResourceBackup, isHistoricalBackup } = load("app/lib/resourceBackupJson.ts");
const { createAccountScopedStorage } = load("app/lib/accountScopedStorage.ts");
const { createAccountBusinessStorage } = load("app/lib/accountBusinessStorage.ts");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const resource = (id, title) => ({ id, title, type: "Site", url: `https://example.test/${id}`, notes: "original notes", isFavorite: false,
  createdAt: "2026-10-29T10:00:00.000Z", updatedAt: "2026-10-29T10:00:00.000Z", extraField: { keep: true } });
const historical = { appName: "Travel Prospect CRM", version: 4, exportedAt: "2026-10-29T10:00:00.000Z",
  prospects: [{ id: "historical-person" }], resources: [resource("new", "Incoming")], settings: { userDisplayName: "historical" },
  streetMarketingSurvey: { surveys: [], activeSurveyId: "" }, customMessageTemplates: { "legacy-id": "original text" } };
const confirmation = id => ({ ownerUserId: id, ownershipCertain: true, legacyOwnershipVerified: true,
  previewReviewed: true, safetyBackupSaved: true, replaceExisting: true });
const ownedJson = () => JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: historical.resources });
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(enabled = true, replacementPolicy = "coordinated") {
  const data = new Map([["travel-prospect-crm-resources", "legacy untouched"]]);
  let session = { userId: A, generation: 1 }, ownerPromise;
  let failWrite = () => false;
  let reads = 0, writes = 0;
  let lock = operation => operation();
  const scopedStorage = createAccountScopedStorage({
    getSessionSnapshot: () => ({ userId: session.userId, revision: session.generation }),
    validateUser: async () => ({ id: session.userId }),
    getStorage: () => ({
      getItem(name) { reads++; assert.ok(!name.startsWith("travel-prospect-crm-resources"), "No legacy read"); return data.get(name) ?? null; },
      setItem(name, value) { writes++; const action = failWrite(name, value); if (action === true) throw new Error("quota"); data.set(name, action === "corrupt" ? "corrupt" : value); },
      removeItem() { throw new Error("No deletion allowed"); },
    }),
  });
  const business = createAccountBusinessStorage(scopedStorage);
  const assertCurrent = capture => { if (capture.userId !== session.userId || capture.generation !== session.generation || !session.userId) throw new Error("stale session"); };
  const store = { scopedStorage, async beginOperation(capture) {
    const captured = { ...capture }; assertCurrent(captured);
    ownerPromise ??= scopedStorage.validateOwner(captured.userId);
    const owner = await ownerPromise; assertCurrent(captured);
    return { ...captured, owner, business: business.forOwner(owner), assertCurrent: () => assertCurrent(captured) };
  } };
  // Positive replacement tests simulate the future coordinated writer environment.
  // The production panel deliberately does NOT opt in to this policy.
  const api = createResourceBackupJson({ enabled, store, replacementPolicy, resourceLocks: { request: (_name, _options, operation) => lock(operation) } });
  return { api, store, data, capture: () => ({ ...session }), counts: () => ({ reads, writes }),
    switchUser(userId) { session = { userId, generation: session.generation + 1 }; ownerPromise = null; },
    setLock(fn) { lock = fn; }, fail(fn) { failWrite = fn; },
    seed(id, resources = [resource("old", "Previous")]) {
      data.set(key(id, "migration-state"), JSON.stringify({ userId: id, status: "verified", active: false,
        createdAt: historical.exportedAt, verifiedAt: historical.exportedAt, sourceFingerprint: "a".repeat(64) }));
      if (resources !== null) data.set(key(id, "resources"), JSON.stringify(resources));
      data.set(key(id, "prospects"), '[{"id":"isolated-person"}]');
      data.set(key(id, "settings"), '{"businessName":"unchanged"}');
    },
  };
}

// Isolated export is owned by A and never includes the other four shared categories.
{
  const s = fixture(); s.seed(A); s.seed(B, [resource("b", "B only")]);
  const before = [...s.data];
  const json = await s.api.exportResources(s.capture());
  const backup = JSON.parse(json);
  assert.equal(backup.ownerUserId, A); assert.equal(backup.storageScope, "account-resources");
  assert.equal(backup.resources[0].title, "Previous");
  assert.equal(Object.hasOwn(backup, "prospects"), false);
  assert.equal(isHistoricalBackup(backup), false);
  assert.deepEqual([...s.data], before);
  s.switchUser(B);
  await assert.rejects(s.api.preview(json, s.capture()), /autre compte/);
  assert.deepEqual([...s.data], before);
}
// All five legacy categories remain parseable and unchanged; ownership stays unknown.
for (const version of [1, 2, 3, 4]) {
  const backup = { ...historical, version };
  const parsed = parseResourceBackup(JSON.stringify(backup));
  assert.equal(parsed.ownerUserId, null);
  assert.deepEqual(plain(parsed.payload), backup);
  assert.equal(parsed.categories.length, 5);
  assert.equal(isHistoricalBackup(backup), true);
}
// A replacement requires an owned backup; historical parser compatibility stays separate.
{
  const s = fixture(); s.seed(A);
  const before = [...s.data];
  const p = await s.api.preview(ownedJson(), s.capture()); s.api.verifyImportSafetyBackup(p, p.safetyJson);
  await assert.rejects(s.api.preview(JSON.stringify(historical), s.capture()), /sans propriétaire vérifié/);
  assert.equal(p.sourceOwnerUserId, A); assert.equal(p.destinationCount, 1);
  assert.equal(JSON.parse(p.safetyJson).ownerUserId, A);
  assert.equal(JSON.parse(p.safetyJson).rawResources, s.data.get(key(A, "resources")));
  for (const overrides of [{ ownershipCertain: false }, { ownerUserId: B },
    { previewReviewed: false }, { safetyBackupSaved: false }, { replaceExisting: false }]) {
    await assert.rejects(s.api.apply(p, { ...confirmation(A), ...overrides }));
    assert.deepEqual([...s.data], before);
  }
  const originalRaw = s.data.get(key(A, "resources"));
  // Modifying the displayed copy cannot alter the captured candidate.
  p.resources[0].title = "tampered preview";
  await s.api.apply(p, confirmation(A));
  assert.equal(JSON.parse(s.data.get(key(A, "resources")))[0].title, "Incoming");
  const journal = JSON.parse(s.data.get(key(A, "resource-import-journal")));
  assert.equal(journal[0].beforeRaw, originalRaw);
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-state"))).status, "verified");
  const op = await s.store.beginOperation(s.capture());
  assert.equal((await op.business.loadResources()).data[0].title, "Incoming");
  assert.equal(s.data.get(key(A, "prospects")), '[{"id":"isolated-person"}]');
  assert.equal(s.data.get(key(A, "settings")), '{"businessName":"unchanged"}');
  assert.equal(s.data.get("travel-prospect-crm-resources"), "legacy untouched");
  // A second successful import appends its safety copy instead of replacing the first.
  const next = await s.api.preview(ownedJson(), s.capture()); s.api.verifyImportSafetyBackup(next, next.safetyJson);
  await s.api.apply(next, confirmation(A));
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-journal"))).length, 2);
}
// Destination changes after preview cannot be overwritten, even with old consent.
{
  const s = fixture(true, "blocked"); s.seed(A);
  const p = await s.api.preview(ownedJson(), s.capture()); s.api.verifyImportSafetyBackup(p, p.safetyJson);
  const before = [...s.data];
  assert.equal(p.replacementAllowed, false);
  await assert.rejects(s.api.apply(p, confirmation(A)), /remplacement bloqué/);
  assert.deepEqual([...s.data], before);
}
{
  const s = fixture(); s.seed(A); const p = await s.api.preview(ownedJson(), s.capture()); s.api.verifyImportSafetyBackup(p, p.safetyJson);
  s.data.set(key(A, "resources"), JSON.stringify([resource("concurrent", "Newer")]));
  const before = [...s.data];
  await assert.rejects(s.api.apply(p, confirmation(A)), /modifiée/); assert.deepEqual([...s.data], before);
}
// Both a changed session and a change while waiting for the import lock are rejected.
for (const delayed of [false, true]) {
  const s = fixture(); s.seed(A); s.seed(B);
  const p = await s.api.preview(ownedJson(), s.capture()); s.api.verifyImportSafetyBackup(p, p.safetyJson);
  const before = [...s.data];
  if (delayed) s.setLock(async operation => { s.switchUser(B); return operation(); });
  else s.switchUser(B);
  await assert.rejects(s.api.apply(p, confirmation(A))); assert.deepEqual([...s.data], before);
}
// Failed writes and silent corruption preserve the safety journal, block resources,
// and leave the other business categories readable and untouched.
for (const corrupt of [false, true]) {
  const s = fixture(); s.seed(A); const p = await s.api.preview(ownedJson(), s.capture()); s.api.verifyImportSafetyBackup(p, p.safetyJson);
  const originalRaw = s.data.get(key(A, "resources"));
  s.fail(name => {
    if (name !== key(A, "resources")) return false;
    if (corrupt) return "corrupt";
    return true;
  });
  await assert.rejects(s.api.apply(p, confirmation(A)));
  const journal = JSON.parse(s.data.get(key(A, "resource-import-journal")));
  assert.equal(journal[0].beforeRaw, originalRaw);
  const op = await s.store.beginOperation(s.capture());
  await assert.rejects(op.business.loadResources(), /non vérifié/);
  await assert.rejects(op.business.saveResources([], originalRaw), /non vérifié/);
  assert.equal(op.business.loadProspects().data[0].id, "isolated-person");
}
// Absence never becomes an invented export; importing into an absent key is explicit.
{
  const s = fixture(); s.seed(A, null);
  await assert.rejects(s.api.exportResources(s.capture()), /absentes/);
  const p = await s.api.preview(ownedJson(), s.capture()); s.api.verifyImportSafetyBackup(p, p.safetyJson);
  assert.equal(p.destinationCount, null);
  assert.equal(JSON.parse(p.safetyJson).rawResources, null);
  await s.api.apply(p, { ...confirmation(A), replaceExisting: false });
  assert.equal(JSON.parse(s.data.get(key(A, "resources")))[0].title, "Incoming");
}
{
  const s = fixture(false);
  await assert.rejects(s.api.exportResources(s.capture()), /désactivées/);
  await assert.rejects(s.api.preview(ownedJson(), s.capture()), /désactivées/);
  assert.deepEqual(s.counts(), { reads: 0, writes: 0 });
}
console.log("PASS: owned JSON A/B, five-category legacy compatibility, explicit ownership, previews, safety snapshots, conflicts, stale sessions and failed-import gates.");
