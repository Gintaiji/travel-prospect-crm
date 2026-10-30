import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createTsLoader } from "./loadTs.mjs";
import { journalMetrics } from "./resourceStorageMetrics.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const budget = 4 * 1024 * 1024, measurements = [];
for (const noteCharacters of [0, 1024, 65536]) {
  const resource = n => ({ id: `fictional-${String(n).padStart(5, "0")}`, title: "Fictional retention audit", type: "Site", url: "https://example.invalid", notes: "x".repeat(noteCharacters), isFavorite: false, createdAt: "2026-10-30", updatedAt: "2026-10-30" });
  const data = new Map([[key(A, "resources"), JSON.stringify([resource(0)])], [key(B, "resources"), "foreign untouched"], ["legacy", "legacy untouched"],
    [key(A, "migration-state"), JSON.stringify({ userId: A, status: "verified", active: false, createdAt: "2026-10-30", verifiedAt: "2026-10-30", sourceFingerprint: "a".repeat(64) })]]);
  const used = () => [...data].reduce((n, [k, v]) => n + 2 * (k.length + v.length), 0);
  const load = createTsLoader();
  const scoped = load("app/lib/accountScopedStorage.ts").createAccountScopedStorage({ getSessionSnapshot: () => ({ userId: A, revision: 1 }), validateUser: async () => ({ id: A }), getStorage: () => ({
    getItem: k => data.get(k) ?? null,
    setItem(k, v) {
      const projected = used() + 2 * (v.length - (data.get(k)?.length ?? 0) + (data.has(k) ? 0 : k.length));
      if (projected > budget) { const e = Error("Fictional retention quota"); e.name = "QuotaExceededError"; throw e; }
      data.set(k, v);
    }, removeItem() { assert.fail("Never delete history"); },
  }) });
  const owner = await scoped.validateOwner(A), business = load("app/lib/accountBusinessStorage.ts").createAccountBusinessStorage(scoped).forOwner(owner);
  const api = load("app/lib/resourceBackupJson.ts").createResourceBackupJson({ enabled: true, replacementPolicy: "coordinated", store: {
    scopedStorage: scoped, beginOperation: async () => ({ userId: A, owner, business, assertCurrent() { scoped.read(owner, "migration-state"); } }),
  } });
  const rows = [], initialBytes = used(); let refused = null;
  for (let round = 1; round <= 20; round++) {
    const preview = await api.preview(JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: [resource(round)] }), {});
    api.verifyImportSafetyBackup(preview, preview.safetyJson);
    const before = [...data];
    try { await api.apply(preview, { ownerUserId: A, ownershipCertain: true, legacyOwnershipVerified: false, previewReviewed: true, safetyBackupSaved: true, replaceExisting: true }); }
    catch (error) {
      assert.equal(error.name, "QuotaExceededError"); assert.deepEqual([...data], before);
      refused = { round, error: error.name, exactStoragePreserved: true }; break;
    }
    const raw = data.get(key(A, "resource-import-journal")), m = journalMetrics(raw), entries = JSON.parse(raw);
    assert.equal(m.embeddedJournalDepth, 0); assert.equal(entries.length, round);
    assert.equal(data.get(key(B, "resources")), "foreign untouched"); assert.equal(data.get("legacy"), "legacy untouched");
    for (const entry of entries) for (const side of ["beforeRaw", "candidateRaw"]) {
      assert.equal(entry.fingerprints[side], createHash("sha256").update(entry[side]).digest("hex"));
    }
    rows.push({ round, usedBytes: used(), journalBytes: m.utf16ValueBytes, resourceBytes: data.get(key(A, "resources")).length * 2, embeddedJournalDepth: m.embeddedJournalDepth, safetyUtf8Bytes: Buffer.byteLength(preview.safetyJson) });
  }
  assert.equal(noteCharacters === 65536 ? !!refused : rows.length === 20, true);
  measurements.push({ noteCharacters, budgetBytes: budget, initialBytes, successfulReplacements: rows.length, refused, rows });
  console.log(`Retention audit: ${noteCharacters} note characters, ${rows.length} successes, refusal ${refused?.round ?? "none"}`);
}
fs.mkdirSync("test-results/resource-final-v2", { recursive: true });
fs.writeFileSync("test-results/resource-final-v2/retention.json", JSON.stringify(measurements, null, 2));
