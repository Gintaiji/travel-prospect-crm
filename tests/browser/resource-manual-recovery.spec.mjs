import { createHash } from "node:crypto";
import { test, expect, call, job, key, A, B } from "./resource-isolation.spec.mjs";

async function finished(page, name) {
  await expect.poll(async () => (await job(page, name))?.status).not.toBe("pending");
  return job(page, name);
}
async function interruptedImport(page) {
  await call(page, "prepareImport", "import-preview", "candidate");
  await call(page, "setFailure", "verified");
  await call(page, "startImport", "interrupted", "import-preview");
  expect((await finished(page, "interrupted")).status).toBe("rejected");
  await call(page, "setFailure", null);
}
async function prepare(page, name) {
  const preview = await call(page, "prepareRecovery", name);
  await call(page, "verifyRecovery", name, preview.diagnosticJson);
  return preview;
}
function preserved(after, initial) {
  expect(after[key(B, "resources")]).toBe(initial[key(B, "resources")]);
  expect(after["json-backup-sentinel"]).toBe(initial["json-backup-sentinel"]);
}
test("récupération manuelle : deux onglets, un succès et un conflit, copies conservées", async ({ sandbox }) => {
  const [one, two] = sandbox.pages;
  await interruptedImport(one);
  const p = await prepare(one, "p"); await prepare(two, "q");
  await call(one, "holdLock", "barrier");
  await call(one, "startRecovery", "r1", "p"); await call(two, "startRecovery", "r2", "q");
  await expect.poll(async () => (await call(two, "pendingLocks")).pending.length).toBe(2);
  await call(one, "releaseLock", "barrier");
  const results = [await finished(one, "r1"), await finished(two, "r2")];
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find(r => r.status === "rejected").error).toContain("Conflit");
  const after = await call(two, "snapshot"); preserved(after, sandbox.initial);
  const journal = JSON.parse(after[key(A, "resource-import-journal")]);
  expect(journal).toHaveLength(2); expect(journal[0]).toEqual(JSON.parse(JSON.parse(p.diagnosticJson).rawJournal)[0]);
  expect(after[key(A, "resources")]).toBe(sandbox.initial[key(A, "resources")]);
  expect((await call(two, "diagnostic")).status).toBe("ready");
});
test("récupération interrompue puis rafraîchissement : nouvelle intervention manuelle obligatoire", async ({ sandbox }) => {
  const [one, two] = sandbox.pages;
  await interruptedImport(one); const first = await prepare(one, "p");
  await call(one, "setFailure", "resources"); await call(one, "startRecovery", "failed", "p");
  expect((await finished(one, "failed")).status).toBe("rejected");
  await one.reload(); await expect(one.locator("#session")).toHaveText(`connected:${A}`);
  const diagnostic = await call(one, "diagnostic"); expect(diagnostic.status).toBe("recovery-required");
  expect(JSON.parse(diagnostic.rawJournal)).toHaveLength(2);
  expect(JSON.parse(diagnostic.rawJournal)[1].receipts.diagnostic.sha256).toBe(createHash("sha256").update(first.diagnosticJson).digest("hex"));
  const before = await call(two, "snapshot"); await call(one, "load", "blocked"); expect(await call(two, "snapshot")).toEqual(before);
  await prepare(one, "fresh"); await call(one, "startRecovery", "retry", "fresh");
  expect((await finished(one, "retry")).status).toBe("fulfilled");
  const after = await call(two, "snapshot"); preserved(after, sandbox.initial);
  expect(JSON.parse(after[key(A, "resource-import-journal")])).toHaveLength(3);
  expect((await call(two, "diagnostic")).status).toBe("ready");
});
