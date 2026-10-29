import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Real module, in-memory compilation/storage. No Supabase, browser, or credentials.
const exports = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync("app/lib/accountScopedStorage.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { exports });
const { createAccountScopedStorage, ACCOUNT_STORAGE_NAMES } = exports;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const legacyKey = "travel-prospect-crm-prospects";
const data = new Map([[legacyKey, "legacy prospects"]]);
let accesses = 0;
const storage = {
  getItem(key) { accesses++; return data.get(key) ?? null; },
  setItem(key, value) { accesses++; data.set(key, value); },
  removeItem(key) { accesses++; data.delete(key); },
};
let session = { userId: null, revision: 0 };
let validateUser = async () => session.userId ? { id: session.userId } : null;
const dependencies = {
  getSessionSnapshot: () => session,
  validateUser: () => validateUser(),
  getStorage: () => storage,
};
const store = createAccountScopedStorage(dependencies);
assert.equal(accesses, 0, "constructing the store must not touch storage");
await assert.rejects(store.validateOwner(A));
assert.throws(() => store.read({ userId: A }, "prospects"));
assert.equal(accesses, 0);

session = { userId: A, revision: 1 };
await assert.rejects(store.validateOwner("person@example.com"));
validateUser = async () => null;
await assert.rejects(store.validateOwner(A));
validateUser = async () => ({ id: B });
await assert.rejects(store.validateOwner(A));
validateUser = async () => ({ id: session.userId });
const ownerA = await store.validateOwner(A);
assert.equal(store.read(ownerA, "prospects"), null, "no legacy fallback");
for (const name of ACCOUNT_STORAGE_NAMES) store.write(ownerA, name, `A:${name}`);
assert.throws(() => store.write(ownerA, "../prospects", "invalid"));
assert.throws(() => store.read({ ...ownerA }, "prospects"), "copies are not capabilities");
const otherStore = createAccountScopedStorage(dependencies);
assert.throws(() => otherStore.read(ownerA, "prospects"));

// Account changes invalidate a captured operation without rewriting its owner to B.
session = { userId: B, revision: 2 };
const beforeStaleAccess = accesses;
for (const operation of [
  () => store.read(ownerA, "prospects"),
  () => store.write(ownerA, "prospects", "stale"),
  () => store.remove(ownerA, "prospects"),
]) assert.throws(operation);
assert.equal(accesses, beforeStaleAccess);
const ownerB = await store.validateOwner(B);
for (const name of ACCOUNT_STORAGE_NAMES) {
  assert.equal(store.read(ownerB, name), null);
  store.write(ownerB, name, `B:${name}`);
}
store.remove(ownerB, "resources");
assert.equal(store.read(ownerB, "resources"), null);
const beforeLogout = [...data];
session = { userId: null, revision: 3 };
store.invalidateSession();
assert.throws(() => store.read(ownerB, "prospects"));
assert.deepEqual([...data], beforeLogout, "logout must preserve all stored values");
session = { userId: A, revision: 4 };
assert.throws(() => store.write(ownerA, "prospects", "old login"));
const newOwnerA = await store.validateOwner(A);
for (const name of ACCOUNT_STORAGE_NAMES) assert.equal(store.read(newOwnerA, name), `A:${name}`);
assert.equal(data.get(legacyKey), "legacy prospects");

// Validation itself can be in flight when accounts change.
let resolveValidation;
validateUser = () => new Promise(resolve => { resolveValidation = resolve; });
const pending = store.validateOwner(A);
session = { userId: B, revision: 5 };
resolveValidation({ id: A });
await assert.rejects(pending);
assert.throws(() => store.read(newOwnerA, "prospects"));
// Also reject logout/login to the same ID during validation.
session = { userId: A, revision: 6 };
const sameUserPending = store.validateOwner(A);
session = { userId: A, revision: 8 };
resolveValidation({ id: A });
await assert.rejects(sameUserPending);

validateUser = async () => ({ id: A });
const current = await store.validateOwner(A);
const unavailable = createAccountScopedStorage({
  ...dependencies,
  getStorage() { throw new Error("Storage denied"); },
});
const unavailableOwner = await unavailable.validateOwner(A);
assert.throws(() => unavailable.read(unavailableOwner, "prospects"), /Storage denied/);
assert.equal(store.read(current, "prospects"), "A:prospects");
assert.equal(data.get(legacyKey), "legacy prospects");
console.log("PASS: two-account isolation, validated owners, stale operations, logout, legacy preservation, and storage failures.");
