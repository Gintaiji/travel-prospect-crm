import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const raw = id => JSON.stringify([{ id }]);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

async function fixture(globals = {}) {
  const load = createTsLoader(globals);
  const { createAccountScopedStorage } = load("app/lib/accountScopedStorage.ts");
  const { createAccountBusinessStorage } = load("app/lib/accountBusinessStorage.ts");
  const coordinator = load("app/lib/resourceWriteCoordinator.ts");
  const data = new Map([["legacy-untouched", "legacy"], ["json-backup", "previous backup"]]);
  let session = { userId: A, revision: 1 }, fail = null, writes = 0;
  for (const id of [A, B]) {
    data.set(key(id, "resources"), raw(id === A ? "A-old" : "B-old"));
    data.set(key(id, "migration-state"), JSON.stringify({ userId: id, status: "verified", active: false,
      createdAt: "2026-10-29", verifiedAt: "2026-10-29", sourceFingerprint: "a".repeat(64) }));
  }
  const scoped = createAccountScopedStorage({ getSessionSnapshot: () => session,
    validateUser: async () => ({ id: session.userId }), getStorage: () => ({
      getItem(name) { if (name.endsWith(`:${fail}`)) throw new Error("read denied"); return data.get(name) ?? null; },
      setItem(name, value) { writes++; data.set(name, value); },
      removeItem() { throw new Error("Deletion forbidden"); },
    }) });
  const owner = await scoped.validateOwner(A);
  const business = createAccountBusinessStorage(scoped).forOwner(owner);
  return { data, scoped, owner, business, ...coordinator, writes: () => writes,
    change(userId) { session = { userId, revision: session.revision + 1 }; },
    failRead(name) { fail = name; },
    write(candidate, work) { return coordinator.coordinateResourceWrite({ scoped, owner,
      expectedRaw: data.get(key(A, "resources")), candidateRaw: raw(candidate), kind: "import", work }); },
  };
}

// Active pending marker is not an interruption: readers wait for final verification.
{
  const s = await fixture(); const entered = deferred(), release = deferred();
  const writer = s.write("A-new", async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-state"))).status, "pending");
  let published = false;
  const reader = s.business.loadResourceSnapshot().then(value => { published = true; return value; });
  await Promise.resolve(); assert.equal(published, false);
  const before = [...s.data];
  release.resolve(); await writer;
  const snapshot = await reader;
  assert.equal(snapshot.result.status, "available");
  assert.equal(snapshot.raw, raw("A-new"));
  assert.equal(snapshot.result.data[0].id, "A-new");
  const journal = JSON.parse(s.data.get(key(A, "resource-import-journal")));
  assert.equal(journal[0].beforeRaw, raw("A-old"));
  assert.equal(s.data.get(key(B, "resources")), raw("B-old"));
  assert.equal(s.data.get("json-backup"), "previous backup");
  assert.equal(s.writes(), 4, "only writer's journal/pending/resources/verified writes");
  assert.equal(before.length, s.data.size);
}

// Real interruption stays blocked without any automatic marker/journal repair.
{
  const s = await fixture();
  await assert.rejects(s.write("partial", () => { throw new Error("interrupted import"); }), /Récupération nécessaire/);
  const before = [...s.data], writes = s.writes();
  await assert.rejects(s.business.loadResources(), /Récupération nécessaire/);
  await assert.rejects(s.business.saveResources([], raw("partial")), /Récupération nécessaire/);
  assert.deepEqual([...s.data], before); assert.equal(s.writes(), writes);
  assert.equal(JSON.parse(s.data.get(key(A, "resource-import-journal")))[0].beforeRaw, raw("A-old"));
}

// A read queued under A cannot publish A after logout/switch, even if A logs in again.
for (const next of [null, B, A]) {
  const s = await fixture(); const entered = deferred(), release = deferred();
  const blocker = navigator.locks.request(s.resourceWriteLockName(A), async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const before = [...s.data];
  const reader = s.business.loadResources();
  const rejection = assert.rejects(reader);
  s.change(next); release.resolve(); await blocker; await rejection;
  assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}

// Storage and parsing failures propagate. Neither missing data nor errors invent [].
for (const name of ["migration-state", "resource-import-journal", "resource-import-state", "resources"]) {
  const s = await fixture(); const before = [...s.data];
  s.failRead(name);
  await assert.rejects(s.business.loadResources(), /read denied/);
  assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
{
  const s = await fixture(); s.data.set(key(A, "resources"), "broken JSON");
  const before = [...s.data];
  await assert.rejects(s.business.loadResources());
  assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
{
  const s = await fixture({ navigator: undefined }); const before = [...s.data];
  await assert.rejects(s.business.loadResources(), /Web Locks indisponible/);
  assert.deepEqual([...s.data], before); assert.equal(s.writes(), 0);
}
console.log("PASS: coherent resource snapshots, active-writer wait, real interruption gates, stale queued readers, read failures and immutable backups.");
