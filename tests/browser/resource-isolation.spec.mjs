import { test as base, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import { startResourceHarness } from "./resource-harness-server.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const call = (page, method, ...args) => page.evaluate(({ method, args }) => window.resourceHarness[method](...args), { method, args });
const job = (page, name) => call(page, "job", name);
const waitSession = async (pages, id) => {
  for (const page of pages) await expect.poll(async () => {
    const state = await call(page, "session"); return `${state.status}:${state.userId}`;
  }).toBe(`connected:${id}`);
};
async function saveDownload(page, testInfo, filename) {
  const event = page.waitForEvent("download");
  await page.locator("#download").click();
  const download = await event; const file = testInfo.outputPath(filename);
  await download.saveAs(file); return file;
}
const test = base.extend({
  withoutLocks: [false, { option: true }],
  server: [async ({ browserName }, provide) => {
    if (browserName !== "chromium") throw new Error("This fixture requires Chromium CDP for refresh interruption tests");
    const server = await startResourceHarness();
    try { await provide(server); } finally { await server.close(); }
  }, { scope: "worker" }],
  sandbox: async ({ context, browser, server, withoutLocks }, provide, testInfo) => {
    const namespace = `e2e-${randomUUID()}`;
    const forbidden = [];
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin) return route.continue();
      forbidden.push(url.origin); return route.abort();
    });
    if (withoutLocks) await context.addInitScript(() => Object.defineProperty(navigator, "locks", { configurable: true, get: () => undefined }));
    const pages = [await context.newPage(), await context.newPage()];
    const url = `${server.baseURL}?namespace=${namespace}`;
    for (const page of pages) {
      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
    }
    await call(pages[0], "seed"); await call(pages[0], "signIn", A); await waitSession(pages, A);
    const flags = await pages[0].evaluate(() => window.resourceHarness.flags);
    expect(flags).toEqual({ ACCOUNT_SCOPED_RESOURCES_ENABLED: false, CLOUD_SYNC_SUSPENDED: true });
    const initial = await call(pages[0], "snapshot");
    try { await provide({ pages, url, initial, context, namespace }); }
    finally {
      expect(forbidden, "no remote or Supabase request is permitted").toEqual([]);
      for (const page of pages) {
        if (page.isClosed()) continue;
        const storageKeys = await page.evaluate(() => Object.keys(localStorage));
        expect(storageKeys.every(k => k.startsWith(`tpc-browser-test:${namespace}:`))).toBe(true);
      }
      await testInfo.attach("browser-evidence.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({
        browser: browser.version(), browserName: "Chrome", pages: pages.length, sameOrigin: server.origin,
        namespace, flags, forbiddenRequests: forbidden,
      }, null, 2)) });
    }
  },
});

export { test, expect, call, job, key, A, B };

test("deux onglets : exclusion Web Locks et refus de la deuxième liste périmée", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  await call(one, "load", "one"); await call(two, "load", "two");
  await call(one, "holdLock", "barrier");
  await call(one, "startSave", "write-one", "one", "from-one");
  await call(two, "startSave", "write-two", "two", "from-two");
  await expect.poll(async () => (await call(two, "pendingLocks")).pending.length).toBe(2);
  const locks = await call(two, "pendingLocks");
  expect(locks.held).toHaveLength(1);
  expect(locks.pending.every(lock => lock.name === locks.held[0].name)).toBe(true);
  await info.attach("native-lock-query.json", { body: Buffer.from(JSON.stringify(locks)), contentType: "application/json" });
  await call(one, "releaseLock", "barrier");
  await expect.poll(async () => [await job(one, "write-one"), await job(two, "write-two")].filter(j => j?.status !== "pending").length).toBe(2);
  const results = [await job(one, "write-one"), await job(two, "write-two")];
  expect(results.map(j => j.status).sort()).toEqual(["fulfilled", "rejected"]);
  const after = await call(one, "snapshot");
  expect(JSON.parse(after[key(A, "resource-import-journal")])).toHaveLength(1);
  await info.attach("concurrent-write-observation.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({
    results, canonicalState: after[key(A, "resource-import-state")], canonicalResources: after[key(A, "resources")],
    traces: [await call(one, "trace"), await call(two, "trace")],
  }, null, 2)) });
  expect(after[key(B, "resources")]).toBe(sandbox.initial[key(B, "resources")]);
  expect(after["json-backup-sentinel"]).toBe(sandbox.initial["json-backup-sentinel"]);
  expect(JSON.parse(after[key(A, "resource-import-state")])).toMatchObject({ status: "verified" });
  expect(results.find(j => j.status === "rejected").error).toContain("Conflit Ressources");
  const screenshot = info.outputPath("two-real-tabs.png");
  await two.screenshot({ path: screenshot });
  await info.attach("two-real-tabs.png", { path: screenshot, contentType: "image/png" });
});

test("changement A vers B pendant l’attente du verrou : aucune écriture", async ({ sandbox }) => {
  const [one, two] = sandbox.pages;
  await call(two, "load", "old-A"); await call(one, "holdLock", "waiting");
  await call(two, "startSave", "stale", "old-A", "forbidden");
  await expect.poll(async () => (await call(one, "pendingLocks")).pending.length).toBe(1);
  await call(one, "signIn", B); await waitSession(sandbox.pages, B);
  await call(one, "releaseLock", "waiting");
  await expect.poll(async () => (await job(two, "stale"))?.status).toBe("rejected");
  const after = await call(two, "snapshot");
  for (const id of [A, B]) expect(after[key(id, "resources")]).toBe(sandbox.initial[key(id, "resources")]);
  expect(after[key(A, "resource-import-journal")]).toBeUndefined();
  expect(after[key(B, "resource-import-journal")]).toBeUndefined();
});

test("accès inter-comptes et chargement JSON A sous B refusés", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  const json = await call(one, "exportBackup");
  const file = await saveDownload(one, info, "account-A.json"); const beforeHash = digest(file);
  await call(one, "signIn", B); await waitSession(sandbox.pages, B);
  const own = await call(two, "load", "B");
  expect(own.resources.map(r => r.id)).toEqual(["B-original"]);
  expect(await call(two, "readWithForeignOwner", A)).toMatchObject({ accepted: false });
  expect(await call(two, "previewBackup", json)).toMatchObject({ accepted: false, error: expect.stringContaining("autre compte") });
  expect(digest(file)).toBe(beforeHash);
  const after = await call(two, "snapshot");
  for (const id of [A, B]) expect(after[key(id, "resources")]).toBe(sandbox.initial[key(id, "resources")]);
});

test("import réussi puis modification : ancien JSON et journal conservés", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  const exported = await call(one, "exportBackup");
  const file = await saveDownload(one, info, "previous-account-A.json"); const beforeHash = digest(file);
  expect(JSON.parse(exported).ownerUserId).toBe(A);
  await call(one, "prepareImport", "successful-preview", "imported-resource");
  await call(one, "startImport", "successful", "successful-preview");
  await expect.poll(async () => (await job(one, "successful"))?.status).toBe("fulfilled");
  expect((await call(two, "load", "after-import")).resources[0].id).toBe("imported-resource");
  await call(two, "startSave", "after-save", "after-import", "edited-resource");
  await expect.poll(async () => (await job(two, "after-save"))?.status).toBe("fulfilled");
  const after = await call(one, "snapshot");
  const entries = JSON.parse(after[key(A, "resource-import-journal")]);
  expect(entries.map(entry => entry.kind)).toEqual(["import", "edit"]);
  expect(entries[0].beforeRaw).toBe(sandbox.initial[key(A, "resources")]);
  expect(JSON.parse(entries[1].beforeRaw)[0].id).toBe("imported-resource");
  expect(digest(file)).toBe(beforeHash);
  expect(after["json-backup-sentinel"]).toBe(sandbox.initial["json-backup-sentinel"]);
});

for (const point of ["pending", "verified"]) {
  test(`rafraîchissement pendant import avant marqueur ${point} : récupération nécessaire`, async ({ sandbox }, info) => {
    const [one, two] = sandbox.pages;
    await call(two, "load", "pre-refresh-writer");
    await call(one, "prepareImport", "preview", "import-candidate");
    const file = await saveDownload(one, info, `before-import-${point}.json`); const beforeHash = digest(file);
    const cdp = await sandbox.context.newCDPSession(one);
    await cdp.send("Debugger.enable");
    await call(one, "pauseImportAt", point);
    const paused = new Promise(resolve => cdp.once("Debugger.paused", resolve));
    const started = call(one, "startImport", "interrupted", "preview").catch(error => error.message);
    await paused;
    // Observe durable storage from the OTHER real tab while the first is paused.
    const during = await call(two, "snapshot");
    expect(JSON.parse(during[key(A, "resource-import-journal")])[0].beforeRaw).toBe(sandbox.initial[key(A, "resources")]);
    if (point === "pending") expect(during[key(A, "resource-import-state")]).toBeUndefined();
    else expect(JSON.parse(during[key(A, "resource-import-state")]).status).toBe("pending");
    const reloaded = one.waitForEvent("domcontentloaded");
    await cdp.send("Page.reload", { ignoreCache: true });
    await reloaded; await started;
    await expect(one.locator("html")).toHaveAttribute("data-fixture-ready", "true");
    await waitSession(sandbox.pages, A);
    const result = await call(one, "load", "recovery");
    expect(result.status).toBe("recovery-required");
    await expect(one.locator("#status")).toContainText("Récupération nécessaire");
    const beforeRetry = await call(one, "snapshot");
    await call(two, "startSave", "after-refresh", "pre-refresh-writer", "forbidden-after-refresh");
    await expect.poll(async () => (await job(two, "after-refresh"))?.status).toBe("rejected");
    expect((await job(two, "after-refresh")).error).toContain("Récupération nécessaire");
    const diagnostic = await call(two, "diagnostic");
    expect(diagnostic.status).toBe("recovery-required");
    expect(JSON.parse(diagnostic.rawJournal)[0].beforeRaw).toBe(sandbox.initial[key(A, "resources")]);
    expect(await call(one, "snapshot")).toEqual(beforeRetry);
    expect(digest(file)).toBe(beforeHash);
    expect(beforeRetry[key(B, "resources")]).toBe(sandbox.initial[key(B, "resources")]);
    expect(beforeRetry["json-backup-sentinel"]).toBe(sandbox.initial["json-backup-sentinel"]);
    const screenshot = info.outputPath(`recovery-${point}.png`);
    await one.screenshot({ path: screenshot });
    await info.attach(`recovery-${point}.png`, { path: screenshot, contentType: "image/png" });
    await cdp.detach();
  });
}

for (const point of ["journal", "resources", "verified"]) {
  test(`échec stockage ${point} : source et sauvegarde conservées`, async ({ sandbox }) => {
    const [one, two] = sandbox.pages;
    await call(one, "load", "writer"); await call(one, "setFailure", point);
    await call(one, "startSave", "failed", "writer", "candidate");
    await expect.poll(async () => (await job(one, "failed"))?.status).toBe("rejected");
    const after = await call(two, "snapshot");
    expect(after[key(B, "resources")]).toBe(sandbox.initial[key(B, "resources")]);
    expect(after["json-backup-sentinel"]).toBe(sandbox.initial["json-backup-sentinel"]);
    if (point === "journal") {
      expect(after[key(A, "resources")]).toBe(sandbox.initial[key(A, "resources")]);
      expect(after[key(A, "resource-import-journal")]).toBeUndefined();
    } else {
      const entries = JSON.parse(after[key(A, "resource-import-journal")]);
      expect(entries[0].beforeRaw).toBe(sandbox.initial[key(A, "resources")]);
      const blocked = await call(two, "load", "blocked"); expect(blocked.status).toBe("recovery-required");
      // The already loaded handle is also refused after the fault is removed.
      await call(one, "setFailure", null);
      await call(one, "startSave", "retry", "writer", "must-not-overwrite");
      await expect.poll(async () => (await job(one, "retry"))?.status).toBe("rejected");
      expect(await call(two, "snapshot")).toEqual(after);
    }
  });
}

test.describe("navigateur sans Web Locks", () => {
  test.use({ withoutLocks: true });
  test("refus sans verrou localStorage de secours", async ({ sandbox }) => {
    const [one] = sandbox.pages;
    await call(one, "load", "writer"); await call(one, "startSave", "denied", "writer", "forbidden");
    await expect.poll(async () => (await job(one, "denied"))?.status).toBe("rejected");
    expect((await job(one, "denied")).error).toContain("Web Locks indisponible");
    expect(await call(one, "snapshot")).toEqual(sandbox.initial);
  });
});
