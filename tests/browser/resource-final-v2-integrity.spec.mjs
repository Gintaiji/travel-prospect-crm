import { test, expect, call, job, key, A, B } from "./resource-isolation.spec.mjs";

test("D9 : refuser la restauration historique sans empreinte persistée", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  const currentRaw = sandbox.initial[key(A, "resources")];
  const previous = JSON.parse(currentRaw); previous[0].title = "FICTIONAL UNVERIFIABLE PREVIOUS";
  const legacy = { importId: "fictional-legacy-no-sha", userId: A, sourceOwnerUserId: A, kind: "import", createdAt: "2026-10-30", beforeRaw: JSON.stringify(previous), candidateRaw: currentRaw };
  await one.evaluate(({ namespace, A, legacy }) => {
    const prefix = `tpc-browser-test:${namespace}:travel-prospect-crm:account:v1:${A}:`;
    localStorage.setItem(prefix + "resource-import-journal", JSON.stringify([legacy]));
    localStorage.setItem(prefix + "resource-import-state", JSON.stringify({ userId: A, importId: legacy.importId, status: "pending", createdAt: "2026-10-30" }));
  }, { namespace: sandbox.namespace, A, legacy });
  const before = await call(one, "snapshot");
  const preview = await call(one, "prepareRecovery", "unverifiable");
  await call(one, "verifyRecovery", "unverifiable", preview.diagnosticJson);
  await call(one, "startRecovery", "must-refuse", "unverifiable");
  await expect.poll(async () => (await job(one, "must-refuse"))?.status).not.toBe("pending");
  const outcome = await job(one, "must-refuse"), after = await call(two, "snapshot");
  await info.attach("legacy-integrity-browser.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({ browser: await one.context().browser().version(), pages: sandbox.pages.length,
    expected: "refusal without storage writes", outcome, before, after, legacyEntryPreserved: JSON.stringify(JSON.parse(after[key(A, "resource-import-journal")])[0]) === JSON.stringify(legacy) }, null, 2)) });
  expect(after[key(B, "resources")]).toBe(before[key(B, "resources")]);
  expect(outcome.status, "D9 CRITICAL: unverified historical copy must be refused").toBe("rejected");
  expect(outcome.error).toMatch(/intégrité|empreinte|SHA-256/i);
  expect(after).toEqual(before);
});
