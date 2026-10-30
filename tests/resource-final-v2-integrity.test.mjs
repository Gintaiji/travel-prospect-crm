import assert from "node:assert/strict";
import fs from "node:fs";
import { createTsLoader } from "./helpers/loadTs.mjs";

// Deliberately enforce D9's refusal requirement. Do not weaken this audit if legacy recovery succeeds.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const raw = id => JSON.stringify([{ id, title: id, type: "Site", url: "https://example.invalid", notes: "FICTIONAL AUDIT", isFavorite: false, createdAt: "2026-10-30", updatedAt: "2026-10-30" }]);
const legacy = { importId: "fictional-legacy-no-sha", userId: A, sourceOwnerUserId: A, kind: "import", createdAt: "2026-10-30", beforeRaw: raw("unverifiable-previous"), candidateRaw: raw("current") };
const data = new Map([[key(A, "resources"), raw("current")], [key(B, "resources"), "foreign unchanged"],
  [key(A, "resource-import-journal"), JSON.stringify([legacy])],
  [key(A, "resource-import-state"), JSON.stringify({ userId: A, importId: legacy.importId, status: "pending", createdAt: "2026-10-30" })]]);
let writes = 0;
const load = createTsLoader();
const scoped = load("app/lib/accountScopedStorage.ts").createAccountScopedStorage({
  getSessionSnapshot: () => ({ userId: A, revision: 1 }), validateUser: async () => ({ id: A }),
  getStorage: () => ({ getItem: k => data.get(k) ?? null, setItem(k, v) { writes++; data.set(k, v); }, removeItem() { assert.fail("No deletion in audit"); } }),
});
const owner = await scoped.validateOwner(A);
const api = load("app/lib/resourceBackupJson.ts").createResourceBackupJson({ enabled: true, recoveryEnabled: true,
  recoverySpace: () => ({ availableBytes: 4 * 1024 * 1024, usedBytes: 0, source: "fictional audit" }),
  store: { scopedStorage: scoped, beginOperation: async () => ({ userId: A, owner, assertCurrent() { scoped.read(owner, "migration-state"); } }) },
});
const before = [...data], preview = await api.previewRecovery({});
let exportRefused = false;
try { await api.exportRecoveryCopy(preview, preview.copies[0]); }
catch (error) { exportRefused = /sans empreinte/.test(error.message); }
api.verifyRecoverySafetyBackup(preview, preview.diagnosticJson);
let outcome;
try {
  const result = await api.applyRecovery(preview, preview.copies[0], { ownerUserId: A, previewReviewed: true, recoverExplicitly: true });
  outcome = { status: "fulfilled", result };
} catch (error) { outcome = { status: "rejected", message: error.message }; }
fs.mkdirSync("test-results/resource-restoration-integrity", { recursive: true });
fs.writeFileSync("test-results/resource-restoration-integrity/legacy-integrity-unit.json", JSON.stringify({ requirement: "refuse recovery without verifiable persisted SHA-256", exportRefused,
  outcome, writes, before: Object.fromEntries(before), after: Object.fromEntries(data), priorJournalEntryPreserved: JSON.stringify(JSON.parse(data.get(key(A, "resource-import-journal")))[0]) === JSON.stringify(legacy) }, null, 2));
assert.equal(exportRefused, true, "Export must refuse a legacy copy without persisted SHA-256");
assert.equal(outcome.status, "rejected", "D9 CRITICAL: recovery must refuse a copy without verifiable persisted integrity");
assert.match(outcome.message, /intégrité|empreinte|SHA-256/i);
assert.equal(writes, 0); assert.deepEqual([...data], before);
