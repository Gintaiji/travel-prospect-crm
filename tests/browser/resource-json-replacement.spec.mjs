import { expect } from "@playwright/test";
import fs from "node:fs";
import { test, call, key, A, B, download, migrate } from "./resource-chain.spec.mjs";

const resource = id => ({ id, title: id, type: "Site", url: `https://example.invalid/${id}`, notes: "FICTITIOUS", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" });
const source = (id, owner = A) => JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: owner, resources: id === null ? [] : [resource(id)] });
async function preview(page, json, name) {
  await page.getByLabel("Prévisualiser un fichier JSON", { exact: true }).setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(json) });
}
async function prepare(page, info, id, name = "safety.json", checkBadFile = false) {
  const before = await call(page, "snapshot");
  await preview(page, source(id), `${name}-incoming.json`);
  const button = page.getByRole("button", { name: "Charger uniquement les ressources après vérification", exact: true });
  await expect(button).toBeDisabled();
  await expect(page.locator("#backup")).toContainText("Ressources actuelles"); await expect(page.locator("#backup")).toContainText("Ressources à charger");
  const file = await download(page, page.getByRole("button", { name: "Télécharger la sauvegarde préalable de la destination" }), info, name);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(backup.rawResources).toBe(before[key(A, "resources")]); expect(backup.recoveryDiagnostic.rawJournal).toBe(before[key(A, "resource-import-journal")]);
  if (checkBadFile) {
    await page.getByLabel("Relire la sauvegarde préalable complète enregistrée", { exact: true }).setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    await expect(page.locator("#backup")).toContainText("Sauvegarde préalable non vérifiée"); await expect(button).toBeDisabled();
    expect(await call(page, "snapshot")).toEqual(before);
  }
  await page.getByLabel("Relire la sauvegarde préalable complète enregistrée", { exact: true }).setInputFiles(file);
  await expect(page.locator("#backup")).toContainText("Sauvegarde préalable complète relue et vérifiée");
  await page.getByLabel("J’ai vérifié l’aperçu.", { exact: true }).check();
  await page.getByLabel("Ces ressources appartiennent exclusivement", { exact: false }).check();
  await page.getByLabel("Recopiez le user.id du propriétaire", { exact: true }).fill(A);
  await expect(button).toBeDisabled(); // Replacement consent is independently required.
  await page.getByLabel("J’autorise explicitement le remplacement de la destination sauvegardée.", { exact: true }).check();
  await expect(button).toBeEnabled();
  return { before, file, button };
}
export { prepare };
test.describe("remplacement JSON activé uniquement dans le bundle de recette", () => {
  test.use({ replacementEnabled: true });
  test("interface : remplacement A, sauvegarde relue, B inchangé et liste vide volontaire", async ({ chain }, info) => {
    const { page, initial } = chain; await migrate(page, info);
    const { before, file, button } = await prepare(page, info, "A-replaced", "A-before.json", true);
    await button.click(); await expect(page.locator("#backup")).toContainText("1 ressource(s) copiée(s) et vérifiée(s)");
    let after = await call(page, "snapshot"); expect(JSON.parse(after[key(A, "resources")])).toEqual([resource("A-replaced")]);
    expect(after[key(B, "resources")]).toBe(initial[key(B, "resources")]); expect(after["travel-prospect-crm-resources"]).toBe(initial["travel-prospect-crm-resources"]);
    let journal = JSON.parse(after[key(A, "resource-import-journal")]);
    expect(journal[0]).toEqual(JSON.parse(before[key(A, "resource-import-journal")])[0]);
    expect(journal.at(-1).beforeRaw).toBe(before[key(A, "resources")]); expect(journal.at(-1).replacement.safetyJson).toBe(fs.readFileSync(file, "utf8"));
    const empty = await prepare(page, info, null, "A-before-empty.json");
    await expect(page.locator("#backup")).toContainText("Liste volontairement vide");
    await empty.button.click(); await expect(page.locator("#backup")).toContainText("0 ressource(s) copiée(s) et vérifiée(s)");
    after = await call(page, "snapshot"); expect(after[key(A, "resources")]).toBe("[]");
    journal = JSON.parse(after[key(A, "resource-import-journal")]); expect(journal).toHaveLength(3); expect(JSON.parse(journal.at(-1).beforeRaw)).toEqual([resource("A-replaced")]);
  });
  test("mauvais propriétaire, JSON corrompu et fichier historique refusés sans écriture", async ({ chain }, info) => {
    const { page } = chain; await migrate(page, info); const before = await call(page, "snapshot");
    for (const [json, expected] of [[source("foreign", B), "autre compte"], ["{", ""], [JSON.stringify({ appName: "Travel Prospect CRM", version: 4, prospects: [], resources: [] }), "sans propriétaire vérifié"]]) {
      await preview(page, json, "refused.json");
      await expect(page.getByRole("button", { name: "Charger uniquement les ressources après vérification" })).toHaveCount(0);
      if (expected) await expect(page.locator("#backup")).toContainText(expected);
      await expect(page.getByRole("button", { name: "Exporter uniquement mes ressources isolées" })).toBeEnabled();
      expect(await call(page, "snapshot")).toEqual(before);
    }
  });
  test("sauvegarde impossible à journaliser : aucun remplacement, copie externe conservée", async ({ chain }, info) => {
    const { page } = chain; await migrate(page, info); const p = await prepare(page, info, "never-written");
    await call(page, "fault", "journal"); await p.button.click();
    await expect(page.locator("#backup")).toContainText("Récupération nécessaire");
    expect(await call(page, "snapshot")).toEqual(p.before); expect(fs.existsSync(p.file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(p.file, "utf8")).rawResources).toBe(p.before[key(A, "resources")]);
  });
  test("deux aperçus dans deux onglets : un remplacement, un conflit", async ({ chain }, info) => {
    const { page, context, url } = chain; await migrate(page, info);
    const two = await context.newPage(); two.on("dialog", d => d.accept()); await two.goto(url);
    await expect(two.locator("html")).toHaveAttribute("data-chain-ready", "true");
    await expect.poll(async () => (await call(two, "session")).userId).toBe(A);
    const p = await prepare(page, info, "one", "one-safety.json"), q = await prepare(two, info, "two", "two-safety.json");
    await Promise.all([p.button.click(), q.button.click()]);
    await expect.poll(async () => {
      const messages = await Promise.all([page.locator("#backup").innerText(), two.locator("#backup").innerText()]);
      return messages.filter(text => text.includes("1 ressource(s) copiée(s) et vérifiée(s)")).length;
    }).toBe(1);
    const messages = await Promise.all([page.locator("#backup").innerText(), two.locator("#backup").innerText()]);
    expect(messages.filter(text => text.includes("Conflit Ressources"))).toHaveLength(1);
    const after = await call(page, "snapshot"); expect(JSON.parse(after[key(A, "resource-import-journal")])).toHaveLength(2);
    expect(after[key(B, "resources")]).toBe(p.before[key(B, "resources")]);
  });
  test("remplacement en attente puis changement de compte : aucune écriture", async ({ chain }, info) => {
    const { page, context, url } = chain; await migrate(page, info); const p = await prepare(page, info, "stale");
    const two = await context.newPage(); await two.goto(url); await expect(two.locator("html")).toHaveAttribute("data-chain-ready", "true");
    await two.evaluate(userId => new Promise(entered => {
      void navigator.locks.request(`travel-prospect-crm:resource-write:v1:${userId}`, { mode: "exclusive" }, async () => { entered(); await new Promise(resolve => { window.releaseReplacementLock = resolve; }); });
    }), A);
    await p.button.click(); await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.length)).toBeGreaterThan(0);
    await call(page, "signIn", B); await expect.poll(async () => (await call(page, "session")).userId).toBe(B);
    await two.evaluate(() => window.releaseReplacementLock());
    await expect(page.locator("#backup")).toContainText(`Compte confirmé : ${B}`);
    const after = await call(page, "snapshot"); delete p.before["fake-auth"]; delete after["fake-auth"]; expect(after).toEqual(p.before);
  });
  test("interruption puis récupération manuelle exacte depuis la copie précédente", async ({ chain }, info) => {
    const { page } = chain; await migrate(page, info); const p = await prepare(page, info, "interrupted", "before-interruption.json");
    await call(page, "fault", "verified"); await p.button.click(); await expect(page.locator("#backup")).toContainText("Récupération nécessaire");
    await page.reload(); await expect(page.locator("#resource-page")).toContainText("Récupération nécessaire");
    const failed = await call(page, "snapshot"), importEntry = JSON.parse(failed[key(A, "resource-import-journal")]).at(-1);
    expect(JSON.parse(failed[key(A, "resources")])).toEqual([resource("interrupted")]); expect(importEntry.beforeRaw).toBe(p.before[key(A, "resources")]);
    await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click();
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Récupération manuelle des ressources", exact: true }) }).last();
    const option = await panel.getByRole("combobox").locator("option").evaluateAll((options, operationId) => options.find(o => o.textContent.includes(operationId) && o.textContent.includes("avant opération")).value, importEntry.importId);
    await panel.getByRole("combobox").selectOption(option);
    const recoveryFile = await download(page, panel.getByRole("button", { name: "Enregistrer la sauvegarde préalable complète et le diagnostic" }), info, "before-manual-recovery.json");
    await panel.getByLabel("Relire le fichier enregistré", { exact: false }).setInputFiles(recoveryFile); await expect(panel).toContainText("relue et identique");
    await panel.getByLabel("Recopier le propriétaire").fill(A); await panel.getByLabel("J’ai vérifié le contenu de cette copie.").check();
    await panel.getByLabel("Je demande explicitement", { exact: false }).check(); await panel.getByRole("button", { name: "Récupérer les ressources de ce compte", exact: true }).click();
    await expect(panel).toContainText("relue(s) et vérifiée(s)"); const after = await call(page, "snapshot");
    expect(after[key(A, "resources")]).toBe(p.before[key(A, "resources")]); expect(after[key(B, "resources")]).toBe(p.before[key(B, "resources")]);
    expect(JSON.parse(after[key(A, "resource-import-journal")])[1]).toEqual(importEntry);
  });
});
