import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const raw = id => JSON.stringify([{ id, title: id, type: "Site", url: "", notes: "", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" }]);
async function fixture() {
  const load = createTsLoader();
  const data = new Map([["resources", raw("old")]]);
  let session = { userId: A, revision: 1 }, failure = null;
  const { createAccountScopedStorage } = load("app/lib/accountScopedStorage.ts");
  const scoped = createAccountScopedStorage({ getSessionSnapshot: () => session, validateUser: async () => ({ id: session.userId }), getStorage: () => ({
    getItem(key) {
      assert.ok(key.startsWith(`travel-prospect-crm:account:v1:${A}:`), "never access account B");
      const name = key.split(":").at(-1);
      if (name === failure) throw new Error("read denied");
      return data.get(name) ?? null;
    },
    setItem() { assert.fail("diagnostic must never write"); }, removeItem() { assert.fail("must never delete"); },
  }) });
  const owner = await scoped.validateOwner(A);
  const coordinator = load("app/lib/resourceWriteCoordinator.ts");
  const entry = { importId: "interrupted", userId: A, kind: "import", createdAt: "2026-10-29", beforeRaw: raw("old"), candidateRaw: raw("new") };
  const pending = { userId: A, importId: entry.importId, kind: "import", createdAt: entry.createdAt, status: "pending" };
  data.set("resource-import-journal", JSON.stringify([entry])); data.set("resource-import-state", JSON.stringify(pending));
  const store = { scopedStorage: scoped, beginOperation: async () => ({ owner, userId: A, assertCurrent() { scoped.read(owner, "migration-state"); } }) };
  return { data, entry, pending, coordinator, scoped, owner,
    api: load("app/lib/resourceBackupJson.ts").createResourceBackupJson({ enabled: true, store }),
    inspect: async () => JSON.parse(await coordinator.exportResourceRecoveryDiagnostic(scoped, owner)),
    fail(name) { failure = name; }, change() { session = { userId: B, revision: 2 }; } };
}
for (const stage of ["pending", "missing-state", "candidate-written", "verified", "corrupt-before", "absent-before", "bad-json", "large", "wrong-owner"]) {
  const s = await fixture();
  if (stage === "missing-state") s.data.delete("resource-import-state");
  if (["candidate-written", "verified"].includes(stage)) s.data.set("resources", s.entry.candidateRaw);
  if (stage === "verified") s.data.set("resource-import-state", JSON.stringify({ ...s.pending, status: "verified", verifiedAt: "2026-10-29" }));
  if (stage === "corrupt-before") s.entry.beforeRaw = '[{"id":"incomplete"}]';
  if (stage === "absent-before") s.entry.beforeRaw = null;
  if (stage === "large") s.entry.padding = "x".repeat(600000);
  if (stage === "wrong-owner") s.entry.userId = B;
  if (["corrupt-before", "absent-before", "large", "wrong-owner"].includes(stage)) s.data.set("resource-import-journal", JSON.stringify([s.entry]));
  if (stage === "bad-json") s.data.set("resource-import-journal", "[");
  const before = [...s.data]; const d = await s.inspect();
  assert.deepEqual([...s.data], before);
  assert.equal(d.status, stage === "verified" ? "ready" : "recovery-required");
  assert.equal(d.assessment.corruptionDetected, ["corrupt-before", "bad-json", "wrong-owner"].includes(stage));
  assert.equal(d.assessment.journalStorage.oversized, stage === "large");
  assert.equal(d.assessment.journalStorage.journalBytes, s.data.get("resource-import-journal").length * 2);
  if (stage === "absent-before") assert.equal(d.assessment.copies[0].before, "absent");
  if (stage === "corrupt-before") assert.equal(d.assessment.copies[0].before, "corrupt");
  if (stage === "wrong-owner") assert.equal(d.assessment.operation, null);
  if (stage === "pending") { assert.equal(d.assessment.operation.ownerUserId, A); assert.equal(d.assessment.operation.id, "interrupted"); assert.equal(d.assessment.operation.matchesBefore, true); }
}
for (const name of ["resources", "resource-import-journal", "resource-import-state", "migration-state"]) {
  const s = await fixture(); s.fail(name); const before = [...s.data];
  await assert.rejects(s.inspect(), /read denied/); assert.deepEqual([...s.data], before);
}
{
  const s = await fixture(); s.data.set("resources", "not JSON");
  const before = [...s.data], d = await s.inspect();
  assert.equal(d.assessment.resourcesIntegrity, "corrupt");
  assert.equal(d.assessment.corruptionDetected, true); assert.deepEqual([...s.data], before);
}
// Account transition while queued and after lock handoff: no snapshot may escape.
for (const afterHandoff of [false, true]) {
  const s = await fixture(); const before = [...s.data];
  const locks = { async request(_name, _options, callback) {
    if (!afterHandoff) s.change();
    const value = await callback();
    if (afterHandoff) s.change();
    return value;
  } };
  await assert.rejects(s.coordinator.exportResourceRecoveryDiagnostic(s.scoped, s.owner, locks), /owner|expired/);
  assert.deepEqual([...s.data], before);
}
// Existing parser reused for external backup verification even when recovery blocks reads.
{
  const s = await fixture(), before = [...s.data];
  const envelope = { appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: JSON.parse(raw("backup")) };
  assert.equal((await s.api.inspectRecoveryBackup(JSON.stringify(envelope), {})).resourcesCount, 1);
  for (const json of ["{", JSON.stringify({ ...envelope, resources: [{}] }), JSON.stringify({ ...envelope, ownerUserId: B })]) await assert.rejects(s.api.inspectRecoveryBackup(json, {}));
  assert.deepEqual([...s.data], before);
}
console.log("PASS: read-only recovery preparation, interrupted imports, incomplete journal, coherent data, absent/corrupt copies and files, account transitions, read failures and large journal.");
