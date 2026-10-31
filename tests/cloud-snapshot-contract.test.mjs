import test from "node:test";
import assert from "node:assert/strict";
import { createTsLoader } from "./helpers/loadTs.mjs";

const load = createTsLoader();
const contract = load("app/lib/cloudSnapshotContract.ts");
const diagnostic = load("app/lib/cloudRawDiagnostics.ts");
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fixtures = {
  prospects: [{ id: "p-fiction", notes: "texte long " .repeat(1000), conversationHistory: [{ content: "fiction" }] }],
  resources: [{ id: "r-fiction", notes: "fiction", futureField: { preserved: true } }],
  settings: { businessName: "Fiction", futureField: "conservé" },
  "custom-message-templates": { "legacy-fiction": "message fictif" },
  "street-marketing-survey": { activeSurveyId: "s-fiction", surveys: [{ id: "s-fiction", questions: ["Fiction ?"] }] },
};
test("98C: five raw categories preserve exact bytes without mutation or attribution", () => {
  const entries = new Map(Object.entries(fixtures).map(([name, value]) => [diagnostic.LEGACY_DIAGNOSTIC_KEYS[name], JSON.stringify(value, null, 2)]));
  const before = [...entries];
  const reads = [];
  const result = diagnostic.readLegacyCloudDiagnostic({ getItem(key) { reads.push(key); return entries.get(key) ?? null; } });
  assert.equal(reads.length, 5);
  assert.deepEqual([...entries], before);
  assert.equal(result.syncEligible, false);
  assert.equal(result.owner, "unverified");
  assert.equal(result.revision, "unknown");
  for (const name of contract.BUSINESS_CATEGORIES) {
    assert.equal(result.categories[name].status, "present");
    assert.equal(result.categories[name].raw, entries.get(diagnostic.LEGACY_DIAGNOSTIC_KEYS[name]));
    assert.equal(JSON.stringify(result.categories[name].value), JSON.stringify(fixtures[name]));
  }
});
test("98C: absence, empty, corruption and unreadable remain distinct for all categories", () => {
  for (const name of contract.BUSINESS_CATEGORIES) {
    const empty = name === "prospects" || name === "resources" ? [] : name === "street-marketing-survey" ? { surveys: [], activeSurveyId: "" } : {};
    assert.equal(diagnostic.diagnoseRawCategory(name, null).status, "absent");
    assert.equal(diagnostic.diagnoseRawCategory(name, JSON.stringify(empty)).status, "empty");
    for (const raw of ["", "{", "null", "42", '"text"']) assert.equal(diagnostic.diagnoseRawCategory(name, raw).status, "corrupt");
  }
  const denied = diagnostic.readLegacyCloudDiagnostic({ getItem() { throw Error("denied"); } });
  assert.ok(Object.values(denied.categories).every(item => item.status === "unreadable"));
  for (const raw of ['[{}]', '[{"id":"x"},{"id":"x"}]', '[{"id":""}]']) {
    assert.equal(diagnostic.diagnoseRawCategory("resources", raw).status, "corrupt");
  }
  assert.equal(diagnostic.diagnoseRawCategory("street-marketing-survey", '{"surveys":[],"activeSurveyId":"missing"}').status, "corrupt");
});
test("98C: revisions retain bigint precision and reject unknown or noncanonical versions", () => {
  for (const value of ["0", "9007199254740993", "9223372036854775807"]) assert.equal(contract.parseCloudRevision(value), value);
  for (const value of [null, 1, "", "01", "-1", "1.0", "1e3", "9223372036854775808"]) {
    assert.throws(() => contract.parseCloudRevision(value), error => error.code === "invalid-revision");
  }
});
test("98C: envelope fails closed on owner, schema, incomplete data and integrity metadata", () => {
  const envelope = { schemaVersion: 1, ownerUserId: owner, revision: "9007199254740993", fingerprint: "a".repeat(64), serverTimestamp: "2026-10-31T12:00:00.000Z", data: fixtures };
  assert.equal(contract.inspectSnapshotEnvelope(envelope, owner).revision, envelope.revision);
  for (const [patch, code] of [
    [{ ownerUserId: "another" }, "owner-unverified"], [{ schemaVersion: 2 }, "unsupported-schema"],
    [{ revision: null }, "invalid-revision"], [{ data: {} }, "invalid-payload"],
    [{ data: { ...fixtures, history: [] } }, "invalid-payload"],
    [{ fingerprint: "unknown" }, "integrity-unverified"], [{ serverTimestamp: "2026-02-30T12:00:00.000Z" }, "integrity-unverified"],
  ]) assert.throws(() => contract.inspectSnapshotEnvelope({ ...envelope, ...patch }, owner), error => error.code === code);
  assert.throws(() => contract.inspectSnapshotEnvelope(envelope, ""));
});
