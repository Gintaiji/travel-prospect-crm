import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";
const load = createTsLoader();
const { createAccountScopedStorage } = load("app/lib/accountScopedStorage.ts");
const { createLegacyDataMigration, LEGACY_MIGRATION_CLAIM_KEY } = load("app/lib/legacyDataMigration.ts");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const prefix = id => `travel-prospect-crm:account:v1:${id}:`;
const originals = [
  ["travel-prospect-crm-prospects", '[ { "id": "p1", "notes": "Sandra" } ]'],
  ["travel-prospect-crm-resources", "[]"],
  ["travel-prospect-crm-settings", '{"userDisplayName":"Sandra"}'],
  ["travel-prospect-crm-street-marketing-survey", '{"surveys":[]}'],
  ["travel-prospect-crm-custom-message-templates", '{"hello":"bonjour"}'],
  ["travel-prospect-crm-last-backup-date", "yesterday"],
  ["travel-prospect-crm-cloud-sync-settings", '{"autoSyncEnabled":true}'],
  ["travel-prospect-crm-startup-cloud-check-running", "true"],
];
function setup(initial = originals) {
  const data = new Map(initial);
  let writes = 0;
  let session = { userId: A, revision: 1 };
  let fail = () => false;
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) {
      writes++;
      if (fail(key, value)) throw new Error("quota exceeded");
      data.set(key, value);
    },
    removeItem() { throw new Error("Deletion is forbidden"); },
  };
  const scoped = createAccountScopedStorage({
    getSessionSnapshot: () => session,
    validateUser: async () => ({ id: session.userId }),
    getStorage: () => storage,
  });
  // Serialize operations exactly as the browser's named Web Lock does.
  let queue = Promise.resolve();
  const migration = createLegacyDataMigration({
    scoped, getLegacyStorage: () => storage,
    withExclusiveLock(operation) {
      const result = queue.then(operation);
      queue = result.catch(() => {});
      return result;
    },
  });
  return {
    data, scoped, migration, writes: () => writes,
    switchUser(id) { session = { userId: id, revision: session.revision + 1 }; },
    failWhen(fn) { fail = fn; },
  };
}
const confirm = id => ({ ownerUserId: id, ownershipCertain: true, jsonBackupSaved: true });
const unchanged = data => { for (const [key, value] of originals) assert.equal(data.get(key), value); };

// Preview and rejected confirmations never write anything.
{
  const s = setup();
  const owner = await s.scoped.validateOwner(A);
  const preview = await s.migration.preview(owner);
  assert.equal(preview.prospectsCount, 1);
  assert.equal(preview.available.length, 5);
  assert.equal(s.writes(), 0);
  const backup = JSON.parse(preview.backupJson);
  assert.equal(backup.rawLegacyData.prospects, originals[0][1]);
  for (const confirmation of [
    { ...confirm(A), ownershipCertain: false }, confirm(B),
    { ...confirm(A), jsonBackupSaved: false },
  ]) await assert.rejects(s.migration.copy(preview, confirmation));
  assert.equal(s.writes(), 0);
  await s.migration.copy(preview, confirm(A));
  unchanged(s.data);
  assert.equal(s.data.get(prefix(A) + "prospects"), originals[0][1]);
  assert.equal(s.data.has(prefix(A) + "cloud-sync-settings"), false);
  assert.equal(s.data.has(prefix(A) + "last-backup-date"), false);
  const state = JSON.parse(s.data.get(prefix(A) + "migration-state"));
  assert.equal(state.userId, A);
  assert.equal(state.active, false);
  assert.equal(state.status, "verified");
  assert.equal(state.sourceFingerprint, preview.fingerprint);
  assert.ok(state.createdAt);
  assert.equal((await s.migration.inspectState(owner)).sourceChanged, false);
  s.data.set(originals[0][0], "[]");
  assert.equal((await s.migration.inspectState(owner)).sourceChanged, true);
  s.data.set(...originals[0]);
  await assert.rejects(s.migration.copy(preview, confirm(A)));
  s.switchUser(B);
  const ownerB = await s.scoped.validateOwner(B);
  await assert.rejects(s.migration.preview(ownerB), /réservée/);
  assert.equal(s.data.has(prefix(B) + "prospects"), false);
}
// Either account can be the explicitly confirmed owner; never infer it from login.
{
  const s = setup(); s.switchUser(B);
  const owner = await s.scoped.validateOwner(B);
  const preview = await s.migration.preview(owner);
  assert.equal(s.writes(), 0);
  await s.migration.copy(preview, confirm(B));
  assert.equal(s.data.has(prefix(A) + "prospects"), false);
  unchanged(s.data);
}
// Existing destinations, even empty strings/arrays, are conflicts.
for (const value of ["[]", ""]) {
  const s = setup([...originals, [prefix(A) + "resources", value]]);
  await assert.rejects(s.migration.preview(await s.scoped.validateOwner(A)), /déjà présente/);
  assert.equal(s.writes(), 0);
}
// A conflict appearing after preview must also block all writes.
{
  const s = setup(); const p = await s.migration.preview(await s.scoped.validateOwner(A));
  s.data.set(prefix(A) + "settings", "{}");
  await assert.rejects(s.migration.copy(p, confirm(A)));
  assert.equal(s.writes(), 0);
}
// Source changes or session changes invalidate the preview.
{
  const s = setup(); const p = await s.migration.preview(await s.scoped.validateOwner(A));
  s.data.set(originals[0][0], "[]");
  await assert.rejects(s.migration.copy(p, confirm(A)), /changé/);
  assert.equal(s.writes(), 0);
}
{
  const s = setup(); const p = await s.migration.preview(await s.scoped.validateOwner(A));
  s.switchUser(B);
  await assert.rejects(s.migration.copy(p, confirm(A)));
  assert.equal(s.writes(), 0);
}
// Quota errors and silent corruption preserve source and never activate copied data.
for (const corrupt of [false, true]) {
  const s = setup(); const p = await s.migration.preview(await s.scoped.validateOwner(A));
  s.failWhen(key => {
    if (key !== prefix(A) + "resources") return false;
    if (!corrupt) return true;
    s.data.set(prefix(A) + "prospects", "corrupted");
    return false;
  });
  await assert.rejects(s.migration.copy(p, confirm(A)));
  unchanged(s.data);
  const migrationState = s.data.get(prefix(A) + "migration-state");
  if (migrationState) {
    const state = JSON.parse(migrationState);
    assert.equal(state.active, false); assert.equal(state.status, "copying");
  }
  assert.equal(JSON.parse(s.data.get(prefix(A) + "resource-import-state")).status, "pending");
  assert.ok(s.data.has(LEGACY_MIGRATION_CLAIM_KEY));
}
// Named-lock serialization makes a duplicate copy fail instead of overwriting.
{
  const s = setup(); const p = await s.migration.preview(await s.scoped.validateOwner(A));
  const results = await Promise.allSettled([s.migration.copy(p, confirm(A)), s.migration.copy(p, confirm(A))]);
  assert.deepEqual(results.map(r => r.status), ["fulfilled", "rejected"]);
  unchanged(s.data);
}
// Invalid legacy JSON cannot silently become empty data.
{
  const s = setup([["travel-prospect-crm-prospects", "not JSON"]]);
  await assert.rejects(s.migration.preview(await s.scoped.validateOwner(A)));
  assert.equal(s.writes(), 0);
}
console.log("PASS: manual ownership, two accounts, exact copies, backups, conflicts, stale previews, partial failures, and no activation/deletion.");
