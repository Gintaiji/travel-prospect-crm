import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createTsLoader } from "./helpers/loadTs.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (name, owner = A) => `travel-prospect-crm:account:v1:${owner}:${name}`;
const raw = id => JSON.stringify([{ id, title: id, type: "Site", url: "https://example.invalid", notes: "FICTIONAL", isFavorite: false, createdAt: "2026-10-30", updatedAt: "2026-10-30" }]);
const confirm = { ownerUserId: A, previewReviewed: true, recoverExplicitly: true };
async function fixture() {
  const load = createTsLoader(), data = new Map([[key("resources"), raw("old")], [key("resources", B), "foreign unchanged"], ["legacy", "unchanged"]]);
  let revision = 1, userId = A, writes = 0, budget = 4 * 1024 * 1024, onWrite = () => {}, estimateOverride = null;
  const usage = () => [...data].reduce((n, [k, v]) => n + (k.length + v.length) * 2, 0);
  const scoped = load("app/lib/accountScopedStorage.ts").createAccountScopedStorage({ getSessionSnapshot: () => ({ userId, revision }), validateUser: async () => ({ id: userId }), getStorage: () => ({
    getItem: k => data.get(k) ?? null,
    setItem(k, v) {
      writes++; onWrite(k, v, writes);
      const projected = usage() + 2 * (v.length - (data.get(k)?.length ?? 0) + (data.has(k) ? 0 : k.length));
      if (projected > budget) { const error = new Error("Fictional quota"); error.name = "QuotaExceededError"; throw error; }
      data.set(k, v);
    }, removeItem() { assert.fail("No deletion"); },
  }) });
  const owner = await scoped.validateOwner(A), coordinator = load("app/lib/resourceWriteCoordinator.ts");
  onWrite = k => { if (k.endsWith(":resource-import-state") && data.get(k)?.includes('"pending"')) throw Error("Interrupted before final marker"); };
  await assert.rejects(coordinator.coordinateResourceWrite({ scoped, owner, expectedRaw: raw("old"), candidateRaw: raw("new"), kind: "edit" }));
  onWrite = () => {};
  const op = { userId: A, owner, assertCurrent() { scoped.read(owner, "migration-state"); } };
  const recoverySpace = () => estimateOverride ?? ({ usedBytes: usage(), availableBytes: Math.max(0, budget - usage()), source: "fictional measured budget" });
  const api = load("app/lib/resourceBackupJson.ts").createResourceBackupJson({ enabled: true, recoveryEnabled: true, recoverySpace,
    store: { scopedStorage: scoped, beginOperation: async () => { op.assertCurrent(); return op; } } });
  return { load, data, scoped, owner, api, usage, writes: () => writes, snapshot: () => [...data],
    setBudget(n) { budget = n; }, setEstimate(v) { estimateOverride = v; }, onWrite(fn) { onWrite = fn; },
    switchAccount() { revision++; userId = B; },
    async prepare() { const p = await api.previewRecovery({}); api.verifyRecoverySafetyBackup(p, p.diagnosticJson); return p; },
  };
}

for (const headroom of [0, 512, 65536]) {
  const s = await fixture(); s.setBudget(s.usage() + headroom);
  const before = s.snapshot(), writes = s.writes(), p = await s.prepare(), selection = p.copies[0];
  const space = await s.api.inspectRecoverySpace(p, selection);
  assert.equal(space.status, "insufficient");
  assert.ok(space.requiredAdditionalBytes > 0);
  await assert.rejects(s.api.verifyRecoveryCopyExport(p, selection, "{}"), /non vérifié/);
  const exported = await s.api.exportRecoveryCopy(p, selection), file = JSON.parse(exported);
  assert.equal(file.ownerUserId, A); assert.equal(file.rawResources, raw("old"));
  assert.equal(file.resourceFingerprint, createHash("sha256").update(raw("old")).digest("hex"));
  assert.ok(!exported.includes("rawJournal"));
  await assert.rejects(s.api.verifyRecoveryCopyExport(p, selection, exported + " "), /non vérifié/);
  const first = await s.api.verifyRecoveryCopyExport(p, selection, exported);
  assert.equal(first.allVerified, false); assert.equal(first.verifiedCopies, 1);
  const next = p.copies[1], nextJson = await s.api.exportRecoveryCopy(p, next);
  assert.equal((await s.api.verifyRecoveryCopyExport(p, next, nextJson)).allVerified, true);
  const altered = JSON.parse(exported); altered.rawResources = raw("altered");
  assert.throws(() => s.load("app/lib/resourceBackupJson.ts").parseResourceBackup(JSON.stringify(altered)), /SHA-256/);
  assert.equal(s.writes(), writes); assert.deepEqual(s.snapshot(), before);
  await assert.rejects(s.api.applyRecovery(p, selection, confirm), /bloquée.*insuffisant/);
  assert.equal(s.writes(), writes); assert.deepEqual(s.snapshot(), before);
}
// Unknown availability fails closed without writes. A favorable estimate is never a reservation.
{
  const s = await fixture(), p = await s.prepare(), before = s.snapshot(), writes = s.writes();
  assert.equal((await s.api.inspectRecoverySpace(p, p.copies[0])).status, "sufficient-estimate");
  s.setBudget(s.usage()); // Another consumer exhausted the budget after the displayed estimate.
  await assert.rejects(s.api.applyRecovery(p, p.copies[0], confirm), /bloquée.*insuffisant/);
  assert.deepEqual(s.snapshot(), before); assert.equal(s.writes(), writes);
}
{
  const s = await fixture(), p = await s.prepare(), before = s.snapshot(), writes = s.writes();
  s.setEstimate({ availableBytes: null, usedBytes: null, source: "unavailable" });
  assert.equal((await s.api.inspectRecoverySpace(p, p.copies[0])).status, "unknown");
  await assert.rejects(s.api.applyRecovery(p, p.copies[0], confirm), /inconnu/);
  assert.deepEqual(s.snapshot(), before); assert.equal(s.writes(), writes);
}
for (const stopAt of [1, 2, 3, 4]) {
  const s = await fixture(), p = await s.prepare(), before = s.snapshot(), writes = s.writes();
  assert.equal((await s.api.inspectRecoverySpace(p, p.copies[0])).status, "sufficient-estimate");
  s.onWrite((_k, _v, n) => { if (n === writes + stopAt) { const e = Error("Native quota race"); e.name = "QuotaExceededError"; throw e; } });
  await assert.rejects(s.api.applyRecovery(p, p.copies[0], confirm), e => e.name === "QuotaExceededError" && /espace localStorage insuffisant/.test(e.message));
  if (stopAt === 1) assert.deepEqual(s.snapshot(), before);
  else {
    const entries = JSON.parse(s.data.get(key("resource-import-journal")));
    assert.deepEqual(entries[0], JSON.parse(before.find(([k]) => k === key("resource-import-journal"))[1])[0]);
    assert.equal(entries.at(-1).beforeRaw, raw("new")); assert.equal(entries.at(-1).candidateRaw, raw("old"));
    const fresh = await s.api.previewRecovery({});
    const json = await s.api.exportRecoveryCopy(fresh, fresh.copies[0]);
    assert.equal(JSON.parse(json).rawResources, raw("old"));
  }
  assert.equal(s.data.get(key("resources", B)), "foreign unchanged"); assert.equal(s.data.get("legacy"), "unchanged");
}
// A persisted SHA mismatch, valid JSON with changed content, foreign ownership, and legacy hashes are refused.
for (const mode of ["corrupt", "foreign", "legacy"]) {
  const s = await fixture(), entries = JSON.parse(s.data.get(key("resource-import-journal")));
  if (mode === "corrupt") entries[0].beforeRaw = raw("tampered");
  if (mode === "foreign") entries[0].userId = B;
  if (mode === "legacy") { delete entries[0].archiveVersion; delete entries[0].fingerprints; delete entries[0].receipts; }
  s.data.set(key("resource-import-journal"), JSON.stringify(entries)); const before = s.snapshot();
  if (mode === "legacy") { const p = await s.prepare(); await assert.rejects(s.api.exportRecoveryCopy(p, p.copies[0]), /sans empreinte/); }
  else await assert.rejects(s.api.previewRecovery({}), /invalides/);
  assert.deepEqual(s.snapshot(), before);
}
// The saved file and all async operations stay bound to the session and locked diagnostic.
{
  const s = await fixture(), p = await s.prepare(), saved = await s.api.exportRecoveryCopy(p, p.copies[0]), before = s.snapshot();
  let release, enter;
  const ready = new Promise(resolve => { enter = resolve; });
  const held = navigator.locks.request(`travel-prospect-crm:resource-write:v1:${A}`, async () => { enter(); await new Promise(resolve => { release = resolve; }); });
  await ready;
  const tasks = [s.api.exportRecoveryCopy(p, p.copies[0]), s.api.verifyRecoveryCopyExport(p, p.copies[0], saved), s.api.inspectRecoverySpace(p, p.copies[0])];
  const settled = Promise.allSettled(tasks); s.switchAccount(); release(); await held;
  assert.ok((await settled).every(r => r.status === "rejected")); assert.deepEqual(s.snapshot(), before);
  await assert.rejects(s.api.applyRecovery(p, p.copies[0], confirm));
}
{
  const s = await fixture(), p = await s.prepare(), q = await s.prepare();
  const result = await Promise.allSettled([s.api.applyRecovery(p, p.copies[0], confirm), s.api.applyRecovery(q, q.copies[0], confirm)]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  assert.match(result.find(r => r.status === "rejected").reason.message, /Conflit/);
  assert.equal(s.data.get(key("resources")), raw("old"));
}
{
  const s = await fixture(), p = await s.prepare(), before = s.snapshot();
  s.data.set(key("resource-import-journal"), s.data.get(key("resource-import-journal")) + "\n");
  await assert.rejects(s.api.exportRecoveryCopy(p, p.copies[0]), /Conflit/);
  assert.deepEqual(s.snapshot().filter(([k]) => k !== key("resource-import-journal")), before.filter(([k]) => k !== key("resource-import-journal")));
}
const space = createTsLoader()("app/lib/resourceRecoverySpace.ts");
for (const error of [{ name: "QuotaExceededError" }, { name: "NS_ERROR_DOM_QUOTA_REACHED" }, { code: 22 }, { code: 1014 }]) assert.equal(space.isResourceQuotaError(error), true);
assert.equal(space.isResourceQuotaError(Error("unrelated")), false);
assert.equal(space.readBrowserRecoverySpace().availableBytes, null);
{
  const localStorage = { length: 1, key: () => "fictional-origin-key", getItem: () => "x".repeat(4 * 1024 * 1024), setItem() { assert.fail("No quota probe writes"); } };
  const estimate = createTsLoader({ window: { localStorage } })("app/lib/resourceRecoverySpace.ts").readBrowserRecoverySpace();
  assert.equal(estimate.availableBytes, 0); assert.ok(estimate.usedBytes > 4 * 1024 * 1024);
  localStorage.getItem = () => { throw Error("Read denied"); };
  assert.equal(createTsLoader({ window: { localStorage } })("app/lib/resourceRecoverySpace.ts").readBrowserRecoverySpace().availableBytes, null);
}
console.log("PASS: saturated/near quota, read-only SHA-256 exports and exact file verification, space preflight, unknown space refusal, native quota races at four writes, session changes, two writers, legacy/corrupt refusal, exact copy preservation.");
