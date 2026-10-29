import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";
const load = createTsLoader();
const { createAccountScopedStorage } = load("app/lib/accountScopedStorage.ts");
const { createAccountBusinessStorage } = load("app/lib/accountBusinessStorage.ts");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const plain = value => JSON.parse(JSON.stringify(value));
const marker = userId => ({
  userId, status: "verified", active: false,
  createdAt: "2026-10-29T10:00:00.000Z", verifiedAt: "2026-10-29T10:00:01.000Z",
  sourceFingerprint: "a".repeat(64),
});
const business = {
  prospects: [{ id: "p-a", firstName: "Sandra", notes: "private A", tags: ["legacy-tag"], conversationHistory: [{ content: "hello" }], extraField: { preserved: true } }],
  resources: [{ id: "r-a", title: "A resource", type: "legacy-type", extraField: 42 }],
  settings: { userDisplayName: "Sandra", defaultFollowUpDays: 3, customField: "preserved" },
  "custom-message-templates": { "legacy-custom-template": "Keep original text {{name}}" },
  "street-marketing-survey": {
    surveys: [{ id: "survey-a", name: "A survey", questions: ["Q1", "Q2"], createdAt: "old", updatedAt: "old", extraField: true }],
    activeSurveyId: "survey-a",
  },
};
function setup() {
  let session = { userId: A, revision: 1 };
  let failRead = false, failWrite = false;
  const data = new Map([["travel-prospect-crm-prospects", '[{"id":"unowned-legacy"}]']]);
  const reads = [];
  let writes = 0;
  const storage = {
    getItem(k) {
      reads.push(k);
      assert.ok(k.startsWith("travel-prospect-crm:account:v1:"), "no legacy access allowed");
      if (failRead) throw new Error("storage read denied");
      return data.get(k) ?? null;
    },
    setItem(k, value) {
      if (failWrite) throw new Error("storage quota exceeded");
      writes++;
      data.set(k, value);
    },
    removeItem() { throw new Error("No deletion allowed"); },
  };
  const scoped = createAccountScopedStorage({
    getSessionSnapshot: () => session,
    validateUser: async () => session.userId ? { id: session.userId } : null,
    getStorage: () => storage,
  });
  const adapter = createAccountBusinessStorage(scoped);
  return {
    data, reads, scoped, adapter, writes: () => writes,
    switchUser(userId) { session = { userId, revision: session.revision + 1 }; },
    failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; },
    seed(id, values = business) {
      data.set(key(id, "migration-state"), JSON.stringify(marker(id)));
      for (const [name, value] of Object.entries(values)) data.set(key(id, name), JSON.stringify(value));
    },
  };
}

// Missing migration never synthesizes data, even if isolated/legacy prospects exist.
{
  const s = setup();
  assert.equal(s.reads.length, 0, "factory is inert");
  assert.throws(() => s.adapter.forOwner(undefined));
  assert.throws(() => s.adapter.forOwner({ userId: A }));
  assert.equal(s.reads.length, 0);
  const store = s.adapter.forOwner(await s.scoped.validateOwner(A));
  assert.deepEqual(plain(store.getStatus()), { status: "migration-required", label: "Migration nécessaire", reason: "missing" });
  s.data.set(key(A, "prospects"), JSON.stringify(business.prospects));
  const before = [...s.data];
  assert.equal(store.loadProspects().status, "migration-required");
  assert.throws(() => store.saveProspects([]), /Migration nécessaire/);
  assert.equal(s.reads.every(k => k.endsWith(":migration-state")), true);
  assert.equal(s.writes(), 0);
  assert.deepEqual([...s.data], before);
}

// Only a complete, verified marker belonging to this account unlocks the adapter.
for (const invalid of [
  "not JSON", "null", "[]",
  JSON.stringify({ ...marker(A), status: "copying" }),
  JSON.stringify({ ...marker(A), userId: B }),
  JSON.stringify({ ...marker(A), verifiedAt: null }),
  JSON.stringify({ ...marker(A), createdAt: "invalid" }),
  JSON.stringify({ ...marker(A), sourceFingerprint: "invalid" }),
  JSON.stringify({ ...marker(A), active: true }),
]) {
  const s = setup(); s.seed(A); s.data.set(key(A, "migration-state"), invalid);
  const store = s.adapter.forOwner(await s.scoped.validateOwner(A));
  const before = [...s.data];
  assert.equal(store.getStatus().status, "migration-required");
  assert.equal((await store.loadResources()).status, "migration-required");
  assert.throws(() => store.saveResources([]));
  assert.deepEqual([...s.data], before);
}

// All five formats, nested fields, legacy values and unknown fields remain unchanged.
{
  const s = setup(); s.seed(A);
  const store = s.adapter.forOwner(await s.scoped.validateOwner(A));
  const before = [...s.data];
  assert.equal(store.getStatus().label, "Données disponibles");
  for (const [name, value] of Object.entries(business)) assert.deepEqual(plain((await store.read(name)).data), value);
  assert.deepEqual([...s.data], before, "reading must never normalize/write");
  assert.equal(s.writes(), 0);
  assert.deepEqual(plain(store.loadProspects().data), business.prospects);
  assert.deepEqual(plain((await store.loadResources()).data), business.resources);
  assert.deepEqual(plain(store.loadSettings().data), business.settings);
  assert.deepEqual(plain(store.loadCustomMessageTemplates().data), business["custom-message-templates"]);
  assert.deepEqual(plain(store.loadStreetMarketingSurvey().data), business["street-marketing-survey"]);
  for (const [name, value] of Object.entries(business)) {
    await store.write(name, value);
    assert.deepEqual(JSON.parse(s.data.get(key(A, name))), value);
  }
  assert.throws(() => store.read("migration-state"));
  assert.throws(() => store.write("last-backup-date", "new date"));
  const detached = store.loadProspects().data;
  detached[0].notes = "only in memory";
  assert.equal(store.loadProspects().data[0].notes, "private A");
}

// Absent keys and intentional empty collections are different; neither creates data.
{
  const s = setup(); s.seed(A, {});
  const store = s.adapter.forOwner(await s.scoped.validateOwner(A));
  const before = [...s.data];
  for (const name of Object.keys(business)) assert.equal((await store.read(name)).status, "absent");
  assert.deepEqual([...s.data], before);
  assert.equal(s.writes(), 0);
  store.saveProspects([]);
  await store.saveResources([]);
  store.saveCustomMessageTemplates({});
  store.saveStreetMarketingSurvey({ surveys: [], activeSurveyId: "" });
  assert.deepEqual(plain(store.loadProspects()), { status: "available", data: [] });
  assert.deepEqual(plain(await store.loadResources()), { status: "available", data: [] });
  assert.deepEqual(plain(store.loadCustomMessageTemplates().data), {});
  assert.equal(s.data.has(key(A, "settings")), false);
}

// Two accounts with different prospects; old handles are rejected on logout/switch.
{
  const s = setup(); s.seed(A);
  s.seed(B, { ...business, prospects: [{ id: "p-b", firstName: "Kevin", notes: "private B" }] });
  const storeA = s.adapter.forOwner(await s.scoped.validateOwner(A));
  assert.equal(storeA.loadProspects().data[0].id, "p-a");
  const snapshot = [...s.data];
  s.switchUser(null);
  assert.throws(() => storeA.getStatus());
  assert.throws(() => storeA.loadProspects());
  assert.throws(() => storeA.saveProspects([]));
  await assert.rejects(s.scoped.validateOwner(A));
  s.switchUser(B);
  const storeB = s.adapter.forOwner(await s.scoped.validateOwner(B));
  assert.equal(storeB.loadProspects().data[0].id, "p-b");
  assert.throws(() => storeA.saveProspects([{ id: "stale-a" }]));
  s.switchUser(A);
  assert.throws(() => storeA.saveProspects([]), "same ID, new session remains stale");
  await assert.rejects(storeB.loadResources());
  const freshA = s.adapter.forOwner(await s.scoped.validateOwner(A));
  assert.equal(freshA.loadProspects().data[0].id, "p-a");
  assert.deepEqual([...s.data], snapshot);
}

// Failure/corruption never becomes a default list and never deletes previous values.
{
  const s = setup(); s.seed(A);
  const store = s.adapter.forOwner(await s.scoped.validateOwner(A));
  const before = [...s.data];
  s.failWrite(true);
  assert.throws(() => store.saveProspects([]), /quota/);
  assert.deepEqual([...s.data], before);
  s.failWrite(false); s.failRead(true);
  assert.throws(() => store.loadProspects(), /read denied/);
  assert.throws(() => store.saveProspects([]), /read denied/);
  assert.deepEqual([...s.data], before);
  s.failRead(false);
  for (const invalid of ["broken JSON", "null", "{}", '[null]']) {
    s.data.set(key(A, "prospects"), invalid);
    assert.throws(() => store.loadProspects());
    assert.equal(s.data.get(key(A, "prospects")), invalid);
  }
  const current = [...s.data];
  assert.throws(() => store.saveProspects(null));
  const cyclic = { id: "cycle" }; cyclic.self = cyclic;
  assert.throws(() => store.saveProspects([cyclic]));
  assert.deepEqual([...s.data], current);
}

// Serialization cannot move an A operation to B or bypass a revoked migration marker.
{
  const s = setup(); s.seed(A); s.seed(B);
  const store = s.adapter.forOwner(await s.scoped.validateOwner(A));
  const before = [...s.data];
  assert.throws(() => store.saveProspects([{ id: "p-new", toJSON() { s.switchUser(B); return { id: "p-new" }; } }]));
  assert.deepEqual([...s.data], before);
}
{
  const s = setup(); s.seed(A);
  const store = s.adapter.forOwner(await s.scoped.validateOwner(A));
  const previousProspects = s.data.get(key(A, "prospects"));
  assert.throws(() => store.saveProspects([{ id: "new", toJSON() {
    s.data.set(key(A, "migration-state"), JSON.stringify({ ...marker(A), status: "copying" }));
    return { id: "new" };
  } }]));
  assert.equal(s.data.get(key(A, "prospects")), previousProspects);
}
console.log("PASS: account business isolation, verified migrations, absent vs empty data, stale handles, format preservation, and storage failures.");
