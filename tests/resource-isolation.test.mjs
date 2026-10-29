import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require(name) {
    assert.ok(name in dependencies, `Unexpected runtime dependency: ${name}`);
    return dependencies[name];
  }, ...globals });
  return exports;
}
const { createAccountScopedStorage } = load("app/lib/accountScopedStorage.ts");
const { createAccountBusinessStorage } = load("app/lib/accountBusinessStorage.ts");
const { createResourceAccess } = load("app/lib/resourceAccess.ts");
const flag = load("app/lib/resourceIsolationSettings.ts");
assert.equal(flag.ACCOUNT_SCOPED_RESOURCES_ENABLED, false, "production must remain disabled");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const resource = (id, title) => ({
  id, title, type: "Site", url: `https://example.test/${id}`, notes: "notes", isFavorite: false,
  createdAt: "2026-10-29T10:00:00.000Z", updatedAt: "2026-10-29T10:00:00.000Z",
});
function fixture() {
  const data = new Map([["travel-prospect-crm-resources", JSON.stringify([resource("legacy", "Unowned")])]]);
  let session = { userId: A, generation: 1 };
  let failWrite = false;
  let legacyReads = 0, legacyWrites = 0;
  const scoped = createAccountScopedStorage({
    getSessionSnapshot: () => ({ userId: session.userId, revision: session.generation }),
    validateUser: async () => session.userId ? { id: session.userId } : null,
    getStorage: () => ({
      getItem: name => data.get(name) ?? null,
      setItem(name, value) { if (failWrite) throw new Error("quota"); data.set(name, value); },
      removeItem() { throw new Error("Deletion forbidden"); },
    }),
  });
  const business = createAccountBusinessStorage(scoped);
  function assertCurrent(capture) {
    if (!session.userId || capture.userId !== session.userId || capture.generation !== session.generation) throw new Error("stale session");
  }
  const sessionStore = {
    assertCurrent,
    async beginOperation(input) {
      const capture = { ...input }; assertCurrent(capture);
      const owner = await scoped.validateOwner(capture.userId);
      assertCurrent(capture);
      return { ...capture, owner, business: business.forOwner(owner), assertCurrent: () => assertCurrent(capture) };
    },
  };
  const legacy = {
    load() { legacyReads++; return JSON.parse(data.get("travel-prospect-crm-resources")); },
    save(value) { legacyWrites++; data.set("travel-prospect-crm-resources", JSON.stringify(value)); },
  };
  return {
    data, sessionStore, legacy,
    isolated: createResourceAccess({ isolated: true, sessionStore, legacy }),
    capture: () => ({ ...session }),
    switchUser(userId) { session = { userId, generation: session.generation + 1 }; },
    failWrites(value) { failWrite = value; },
    legacyCounts: () => [legacyReads, legacyWrites],
    seed(id, resources) {
      data.set(key(id, "migration-state"), JSON.stringify({ userId: id, status: "verified", active: false,
        sourceFingerprint: "a".repeat(64), createdAt: "2026-10-29T10:00:00.000Z", verifiedAt: "2026-10-29T10:00:01.000Z" }));
      if (resources !== undefined) data.set(key(id, "resources"), JSON.stringify(resources));
    },
  };
}

// Different resources, same local ID possible: all handles remain owner-bound.
{
  const s = fixture(); s.seed(A, [resource("same-id", "Private A")]); s.seed(B, [resource("same-id", "Private B")]);
  const before = [...s.data];
  const a = await s.isolated.load(s.capture());
  assert.equal(a.resources[0].title, "Private A");
  s.switchUser(B);
  assert.equal(a.isCurrent(), false);
  assert.throws(() => a.save([]));
  const b = await s.isolated.load(s.capture());
  assert.equal(b.resources[0].title, "Private B");
  assert.deepEqual([...s.data], before);
  b.save([resource("b-new", "B new")]);
  assert.equal(JSON.parse(s.data.get(key(A, "resources")))[0].title, "Private A");
  assert.equal(JSON.parse(s.data.get(key(B, "resources")))[0].id, "b-new");
  s.switchUser(null); assert.throws(() => b.save([]));
  await assert.rejects(s.isolated.load(s.capture()));
  assert.deepEqual(s.legacyCounts(), [0, 0]);
}

// A save that resumes under B is rejected with both existing collections intact.
{
  const s = fixture(); s.seed(A, [resource("a", "A")]); s.seed(B, [resource("b", "B")]);
  const a = await s.isolated.load(s.capture());
  let resume;
  const wait = new Promise(resolve => { resume = resolve; });
  const pending = (async () => { await wait; a.save([resource("late", "Late A")]); })();
  const rejected = assert.rejects(pending);
  const before = [...s.data]; s.switchUser(B); resume(); await rejected;
  assert.deepEqual([...s.data], before);
}

// No migration, partial migration, absent key, empty list: four distinct cases.
{
  const s = fixture();
  s.data.set(key(A, "resources"), JSON.stringify([resource("unverified", "Unverified")]));
  const missing = await s.isolated.load(s.capture());
  assert.equal(missing.status, "migration-required"); assert.equal(missing.label, "Migration nécessaire");
  s.data.set(key(A, "migration-state"), JSON.stringify({ userId: A, status: "copying" }));
  assert.equal((await s.isolated.load(s.capture())).status, "migration-required");
  s.data.delete(key(A, "resources")); s.seed(A);
  assert.equal((await s.isolated.load(s.capture())).status, "absent");
  assert.equal(s.data.has(key(A, "resources")), false);
  s.seed(A, []);
  const empty = await s.isolated.load(s.capture()); assert.equal(empty.status, "available");
  assert.equal(empty.resources.length, 0);
  assert.deepEqual(s.legacyCounts(), [0, 0]);
}

// All read/write errors propagate without fallback or destructive cleanup.
{
  const s = fixture(); s.seed(A, [resource("a", "A")]);
  await assert.rejects(s.isolated.load());
  const a = await s.isolated.load(s.capture());
  const before = [...s.data]; s.failWrites(true);
  assert.throws(() => a.save([]), /quota/); assert.deepEqual([...s.data], before);
  s.data.set(key(A, "resources"), "bad JSON");
  await assert.rejects(s.isolated.load(s.capture()));
  s.data.set(key(A, "resources"), '[{"id":"missing-fields"}]');
  await assert.rejects(s.isolated.load(s.capture()), /Format/);
  assert.deepEqual(s.legacyCounts(), [0, 0]);
}

// Disabled path delegates to existing functions; no identity/migration required.
{
  const s = fixture(); s.switchUser(null);
  const legacy = createResourceAccess({ isolated: false,
    sessionStore: { beginOperation() { throw new Error("Must not inspect auth"); } }, legacy: s.legacy });
  const ready = await legacy.load(); assert.equal(ready.resources[0].id, "legacy");
  ready.save([resource("legacy-update", "Updated")]);
  assert.deepEqual(s.legacyCounts(), [1, 1]);
  assert.equal(JSON.parse(s.data.get("travel-prospect-crm-resources"))[0].id, "legacy-update");
}
console.log("PASS: resource flag off, A/B isolation, verified migrations, absent vs empty, stale async writes, failures and legacy compatibility.");
