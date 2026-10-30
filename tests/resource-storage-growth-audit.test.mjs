import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { journalMetrics, snapshotMetrics } from "./helpers/resourceStorageMetrics.mjs";
import { createTsLoader } from "./helpers/loadTs.mjs";

// Check exact units and traversal bounds independently of the application writer.
{
  const raw = JSON.stringify([{ importId: "unicode", beforeRaw: null, candidateRaw: '["é😀"]' }]);
  assert.equal(journalMetrics(raw).utf16ValueBytes, raw.length * 2);
  assert.equal(journalMetrics(raw).utf8Bytes, Buffer.byteLength(raw));
  const nested = JSON.stringify([{ replacement: { diagnosticJson: JSON.stringify({ rawJournal: raw }), safetyJson: JSON.stringify({ recoveryDiagnostic: { rawJournal: raw } }) } }]);
  const m = journalMetrics(nested); assert.equal(m.embeddedJournalDepth, 1); assert.equal(m.layers[0].duplicatedPreviousJournal, true);
  assert.equal(journalMetrics(nested, { maxLayers: 1 }).bounded, true);
  assert.equal(journalMetrics(nested, { maxDecodedBytes: 1 }).bounded, true);
  assert.equal(journalMetrics("not decoded beyond the limit", { maxDecodedBytes: 1 }).entries, null);
  assert.throws(() => journalMetrics("broken"));
}
// Real modules in memory: bounded audit, not an implementation of a recovery mechanism.
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const resource = id => ({ id, title: id, type: "Site", url: "https://example.invalid", notes: "FICTITIOUS", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" });
const load = createTsLoader();
const data = new Map([[key(A, "resources"), JSON.stringify([resource("old")])], [key(B, "resources"), "B untouched"],
  ["travel-prospect-crm-resources", "legacy untouched"], [key(A, "migration-state"), JSON.stringify({ userId: A, status: "verified", active: false, createdAt: "2026-10-29", verifiedAt: "2026-10-29", sourceFingerprint: "a".repeat(64) })]]);
let budget = 8 * 1024 * 1024;
const scoped = load("app/lib/accountScopedStorage.ts").createAccountScopedStorage({ getSessionSnapshot: () => ({ userId: A, revision: 1 }), validateUser: async () => ({ id: A }), getStorage: () => ({
  getItem: name => data.get(name) ?? null,
  setItem(name, value) {
    const projected = [...data].reduce((sum, [k, v]) => sum + (k.length + (k === name ? value.length : v.length)) * 2, 0) + (data.has(name) ? 0 : (name.length + value.length) * 2);
    if (projected > budget) { const error = new Error("bounded quota audit"); error.name = "QuotaExceededError"; throw error; }
    data.set(name, value);
  }, removeItem() { assert.fail("never delete"); },
}) });
const owner = await scoped.validateOwner(A), business = load("app/lib/accountBusinessStorage.ts").createAccountBusinessStorage(scoped).forOwner(owner);
const store = { scopedStorage: scoped, beginOperation: async () => ({ userId: A, owner, business, assertCurrent() { scoped.read(owner, "migration-state"); } }) };
const api = load("app/lib/resourceBackupJson.ts").createResourceBackupJson({ enabled: true, store, replacementPolicy: "coordinated" });
const confirmation = { ownerUserId: A, ownershipCertain: true, legacyOwnershipVerified: false, previewReviewed: true, safetyBackupSaved: true, replaceExisting: true };
const rows = []; let refused = false;
for (let n = 0; n < 20; n++) {
  const p = await api.preview(JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: [resource(`r${n}`)] }), {});
  api.verifyImportSafetyBackup(p, p.safetyJson); const before = [...data];
  try { await api.apply(p, confirmation); }
  catch (error) {
    assert.equal(error.name, "QuotaExceededError"); assert.deepEqual([...data], before); refused = true; break;
  }
  const m = snapshotMetrics(Object.fromEntries(data), A); rows.push(m);
  assert.equal(data.get(key(B, "resources")), "B untouched"); assert.equal(data.get("travel-prospect-crm-resources"), "legacy untouched");
}
assert.equal(rows.length, 20);
fs.mkdirSync("test-results/resource-flat-archive", { recursive: true });
fs.writeFileSync("test-results/resource-flat-archive/unit-growth.json", JSON.stringify(rows, null, 2));
const integrity = load("app/lib/resourceArchiveIntegrity.ts");
assert.throws(() => integrity.parseResourceArchive(" ".repeat(integrity.RESOURCE_ARCHIVE_MAX_CHARACTERS + 1)), /volumineuse/);
assert.throws(() => integrity.parseResourceArchive("{"));
for (let i = 1; i < rows.length; i++) assert.ok(rows[i].journal.utf16ValueBytes - rows[i - 1].journal.utf16ValueBytes < 2600);
for (const input of ["", "abc", "???", "x".repeat(1000)]) assert.equal(integrity.resourceDigest(input), createHash("sha256").update(input).digest("hex"));
for (const entry of JSON.parse(data.get(key(A, "resource-import-journal")))) { assert.equal(integrity.validFlatEntry(entry, A), true); entry.beforeRaw = "[]"; assert.equal(integrity.validFlatEntry(entry, A), false); } assert.equal(refused, false);
assert.equal(rows.at(-1).journal.embeddedJournalDepth, 0); // Finite historical nesting, not a cyclic JS object.
// A zero-headroom budget must fail before any journal/state/resource change.
budget = [...data].reduce((sum, [k, v]) => sum + (k.length + v.length) * 2, 0);
const p = await api.preview(JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: [] }), {});
api.verifyImportSafetyBackup(p, p.safetyJson); const before = [...data];
await assert.rejects(api.apply(p, confirmation), /quota/); assert.deepEqual([...data], before);
console.log("PASS: exact storage metrics, bounded iterative archive analysis, sequential real-module replacements, measured quota refusal and unchanged data/copies.");
