import { expect } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { test, call, key, A, B, migrate, download } from "./resource-chain.spec.mjs";
import { prepare } from "./resource-json-replacement.spec.mjs";

async function interrupted(page, info) {
  await migrate(page, info);
  const p = await prepare(page, info, "quota-recovery-fictional", "before-quota.json");
  await call(page, "fault", "verified"); await p.button.click();
  await expect(page.locator("#backup")).toContainText("Récupération nécessaire"); await call(page, "fault", null);
  return call(page, "snapshot");
}
const panel = page => page.locator("section").filter({ has: page.getByRole("heading", { name: "Récupération manuelle des ressources", exact: true }) }).last();
test.describe("récupération sûre sous quota fictif", () => {
  test.use({ replacementEnabled: true });
  for (const headroom of [0, 512]) test(`quota restant ${headroom} octets : export SHA-256 sans écriture et récupération bloquée`, async ({ chain }, info) => {
    const { page } = chain, before = await interrupted(page, info), usage = await call(page, "storageUsage");
    await call(page, "setQuota", usage.estimatedUtf16KeyValueBytes + headroom);
    const writesBefore = await page.evaluate(() => window.chainRecipe.events.filter(e => e.action === "write").length);
    await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click();
    const recovery = panel(page); await expect(recovery).toContainText("Récupération par écriture bloquée");
    const safety = await download(page, recovery.getByRole("button", { name: "Enregistrer la sauvegarde préalable complète et le diagnostic" }), info, "diagnostic.json");
    await recovery.getByLabel("Relire le fichier enregistré", { exact: false }).setInputFiles(safety);
    await recovery.getByLabel("Recopier le propriétaire").fill(A);
    await recovery.getByLabel("J’ai vérifié le contenu de cette copie.").check();
    await recovery.getByLabel("Je demande explicitement", { exact: false }).check();
    await expect(recovery.getByRole("button", { name: "Récupérer les ressources de ce compte", exact: true })).toBeDisabled();
    await expect(recovery.getByLabel("Procédure manuelle après sauvegardes vérifiées")).toHaveCount(0);
    const copies = await recovery.locator("select option").count();
    for (let index = 0; index < copies; index++) {
      await recovery.locator("select").selectOption({ index });
      const file = await download(page, recovery.getByRole("button", { name: "Exporter la copie sélectionnée sans écriture localStorage" }), info, `copy-${index}.json`);
      const rawFile = fs.readFileSync(file, "utf8"), copy = JSON.parse(rawFile);
      expect(copy.ownerUserId).toBe(A); expect(copy.resourceFingerprint).toBe(createHash("sha256").update(copy.rawResources).digest("hex"));
      expect(copy.resources).toEqual(JSON.parse(copy.rawResources)); expect(copy.rawJournal).toBeUndefined();
      await expect(recovery).toContainText("Fichier non vérifié");
      await recovery.getByLabel("Relire la copie JSON exportée", { exact: false }).setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(rawFile + " ") });
      await expect(recovery).toContainText("Export non vérifié");
      await recovery.getByLabel("Relire la copie JSON exportée", { exact: false }).setInputFiles(file);
      await expect(recovery).toContainText("propriétaire et SHA-256 vérifiés");
    }
    await expect(recovery.getByLabel("Procédure manuelle après sauvegardes vérifiées")).toBeVisible();
    expect(await call(page, "snapshot")).toEqual(before);
    expect(await page.evaluate(() => window.chainRecipe.events.filter(e => e.action === "write").length)).toBe(writesBefore);
    await info.attach("quota-read-only-export.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({ headroom, copies, noStorageWrites: true, unchanged: true, usage })) });
  });
  test("copie corrompue : refus sans modification supplémentaire", async ({ chain }, info) => {
    const { page } = chain; await interrupted(page, info); await call(page, "corruptQuotaCopy"); const before = await call(page, "snapshot");
    await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click();
    await expect(panel(page)).toContainText("invalides");
    await expect(panel(page).getByRole("button", { name: "Exporter la copie sélectionnée sans écriture localStorage" })).toHaveCount(0);
    expect(await call(page, "snapshot")).toEqual(before);
  });
  test("quota natif Chrome saturé : copie téléchargée puis relue sans aucune écriture", async ({ chain }, info) => {
    const { page } = chain; await interrupted(page, info);
    const saturation = await call(page, "saturateNativeQuota"); expect(saturation.errorName).toBe("QuotaExceededError"); expect(saturation.refusals).toBeGreaterThan(0);
    const before = await call(page, "snapshot"), digest = createHash("sha256").update(JSON.stringify(before)).digest("hex");
    await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click();
    const recovery = panel(page); await expect(recovery).toContainText("Récupération par écriture bloquée");
    const file = await download(page, recovery.getByRole("button", { name: "Exporter la copie sélectionnée sans écriture localStorage" }), info, "native-full-copy.json");
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(json.resourceFingerprint).toBe(createHash("sha256").update(json.rawResources).digest("hex"));
    await recovery.getByLabel("Relire la copie JSON exportée", { exact: false }).setInputFiles(file);
    await expect(recovery).toContainText("propriétaire et SHA-256 vérifiés");
    expect(createHash("sha256").update(JSON.stringify(await call(page, "snapshot"))).digest("hex")).toBe(digest);
    await info.attach("native-quota-saturation.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({ ...saturation, storageDigestBeforeAndAfter: digest, exportVerified: true })) });
  });
  test("export et relecture en attente puis changement de compte : anciens résultats refusés", async ({ chain }, info) => {
    const { page } = chain, before = await interrupted(page, info);
    await call(page, "quotaPreview", "stale"); const saved = await call(page, "quotaExport", "stale");
    await call(page, "holdQuotaLock", "barrier");
    await page.evaluate(saved => {
      window.quotaJobs = Promise.allSettled([window.chainRecipe.quotaExport("stale"), window.chainRecipe.quotaVerify("stale", saved), window.chainRecipe.quotaSpace("stale")]).then(rs => rs.map(r => r.status));
    }, saved);
    await call(page, "signIn", B); await call(page, "releaseQuotaLock", "barrier");
    expect(await page.evaluate(() => window.quotaJobs)).toEqual(["rejected", "rejected", "rejected"]);
    const after = await call(page, "snapshot");
    for (const [k, v] of Object.entries(before)) if (k !== "fake-auth") expect(after[k]).toBe(v);
  });
  test("deux onglets : exports sous quota saturé, puis récupération avec espace suffisant et conflit", async ({ chain }, info) => {
    const { page, context, url } = chain, before = await interrupted(page, info);
    const two = await context.newPage(); await two.goto(url); await expect(two.locator("html")).toHaveAttribute("data-chain-ready", "true");
    await expect.poll(async () => (await call(two, "session")).userId).toBe(A);
    await call(page, "quotaPreview", "one"); await call(two, "quotaPreview", "two");
    const usage = await call(page, "storageUsage");
    for (const p of [page, two]) await call(p, "setQuota", usage.estimatedUtf16KeyValueBytes);
    const exports = await Promise.all([call(page, "quotaExport", "one"), call(two, "quotaExport", "two")]);
    expect(exports.every(json => JSON.parse(json).ownerUserId === A)).toBe(true); expect(await call(page, "snapshot")).toEqual(before);
    for (const p of [page, two]) await call(p, "setQuota", null);
    const outcomes = await Promise.allSettled([call(page, "quotaApply", "one"), call(two, "quotaApply", "two")]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(r => r.status === "rejected").reason.message).toContain("Conflit");
    expect((await call(page, "snapshot"))[key(A, "resources")]).toBe(JSON.parse(exports[0]).rawResources);
  });
});
