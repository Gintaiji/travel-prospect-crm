import { test as base, expect } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { startResourceChainServer } from "./resource-chain-server.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const call = (page, method, ...args) => page.evaluate(({ method, args }) => window.chainRecipe[method](...args), { method, args });
const digest = value => createHash("sha256").update(value).digest("hex");
const test = base.extend({
  pilot: async ({ context }, provide, info) => {
    const server = await startResourceChainServer({ pilot: true, jsonReplacement: true });
    const blocked = [], errors = [], screens = []; let initialKeyCount = null;
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin === server.origin) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => { window.pilotInitialKeys = localStorage.length; });
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
    try {
      await page.goto(server.url);
      await expect(page.locator("[data-resource-pilot]")).toBeVisible();
      initialKeyCount = await page.evaluate(() => window.pilotInitialKeys);
      expect(initialKeyCount).toBe(0);
      expect(await page.evaluate(() => window.chainRecipe.flags)).toEqual({ isolated: true, recovery: true, jsonReplacement: true, cloudSuspended: true });
      const shot = async name => {
        const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, mainPadding: getComputedStyle(document.querySelector("#resource-page main")).paddingLeft }));
        const file = info.outputPath(`${name}.png`); await page.screenshot({ path: file });
        const configuredWidth = page.viewportSize().width;
        screens.push({ name, ...layout, configuredWidth, horizontalOverflow: layout.document > configuredWidth + 1 });
        await info.attach(name, { path: file, contentType: "image/png" });
      };
      await provide({ page, shot });
      expect(blocked).toEqual([]); expect(errors).toEqual([]);
      expect((await call(page, "physicalKeys")).every(k => k.startsWith("tpc-chain:e2e-"))).toBe(true);
    } finally {
      await info.attach("functional-pilot-evidence.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({ origin: server.origin, browser: await context.browser().version(), project: info.project.name,
        initialProfileWasEmpty: initialKeyCount === 0, blocked, errors, screens,
        flags: await page.evaluate(() => window.chainRecipe?.flags).catch(() => null), events: await page.evaluate(() => window.chainRecipe?.events).catch(() => []) }, null, 2)) });
      await server.close();
    }
  },
});
async function nav(page, label) { await page.getByRole("navigation", { name: "Navigation du pilote" }).getByRole("link", { name: label, exact: true }).click(); }
async function login(page, who) {
  await page.getByRole("button", { name: `Connexion fictive ${who}`, exact: true }).click();
  await expect(page.getByRole("status", { name: "Session fictive", exact: true })).toHaveText(`Compte fictif ${who}`);
}
async function download(page, button, info, name) {
  const pending = page.waitForEvent("download"); await button.click(); const file = info.outputPath(name); await (await pending).saveAs(file); return file;
}
async function migrate(page, info) {
  await login(page, "A");
  await page.locator("#resource-page").getByRole("link", { name: "Ouvrir la migration manuelle" }).click();
  const section = page.locator("#migration"); await section.getByRole("button", { name: "Afficher l’aperçu sans modification" }).click();
  const file = await download(page, section.getByRole("button", { name: "1. Télécharger la sauvegarde JSON préalable" }), info, "migration-fictive.json");
  expect(JSON.parse(fs.readFileSync(file, "utf8")).resources[0].id).toBe("A-legacy");
  await section.getByLabel("J’ai enregistré et vérifié le fichier JSON sur mon appareil.").check();
  await section.getByLabel("Je suis certain", { exact: false }).check(); await section.getByLabel("Recopiez l’identifiant", { exact: false }).fill(A);
  await section.getByRole("button", { name: "2. Copier vers ce compte sans activer" }).click();
  await expect(section.getByRole("status")).toContainText("Copie vérifiée");
  await nav(page, "Ressources"); await page.locator("#resource-page").getByRole("button", { name: "Recharger les ressources" }).click();
  await expect(page.locator("#resource-page article")).toHaveCount(1);
}
async function add(page, title) {
  const section = page.locator("#resource-page"); await nav(page, "Ressources");
  await section.getByLabel("Titre", { exact: true }).first().fill(title); await section.getByRole("combobox", { name: "Type", exact: true }).first().selectOption("Site");
  await section.getByLabel("URL", { exact: true }).first().fill(`https://example.invalid/${title}`);
  await section.getByRole("button", { name: "Ajouter la ressource", exact: true }).click();
  await expect(section.locator("article").filter({ hasText: title })).toHaveCount(1);
}
async function simulations(page) {
  const details = page.locator("header details"); if (!(await details.getAttribute("open")) && !(await details.evaluate(e => e.open))) await details.locator("summary").click();
}
async function replacement(page, info, title) {
  await nav(page, "Sauvegarde et récupération");
  const data = { appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: [{ id: title, title, type: "Site", url: `https://example.invalid/${title}`, notes: "FICTIONAL PILOT", isFavorite: false, createdAt: "2026-10-30", updatedAt: "2026-10-30" }] };
  await page.getByLabel("Prévisualiser un fichier JSON", { exact: true }).setInputFiles({ name: `${title}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  const button = page.getByRole("button", { name: "Charger uniquement les ressources après vérification", exact: true }); await expect(button).toBeDisabled();
  const safety = await download(page, page.getByRole("button", { name: "Télécharger la sauvegarde préalable de la destination" }), info, `${title}-avant.json`);
  await page.getByLabel("Relire la sauvegarde préalable complète enregistrée", { exact: true }).setInputFiles(safety);
  await expect(page.locator("#backup")).toContainText("complète relue et vérifiée");
  await page.getByLabel("J’ai vérifié l’aperçu.", { exact: true }).check(); await page.getByLabel("Ces ressources appartiennent exclusivement", { exact: false }).check();
  await page.getByLabel("Recopiez le user.id du propriétaire", { exact: true }).fill(A);
  await page.getByLabel("J’autorise explicitement le remplacement de la destination sauvegardée.", { exact: true }).check();
  return button;
}
const recovery = page => page.locator("section").filter({ has: page.getByRole("heading", { name: "Récupération manuelle des ressources", exact: true }) }).last();

test("pilote : parcours React utilisateur A/B, remplacement, récupération et expiration", async ({ pilot }, info) => {
  const { page, shot } = pilot; await migrate(page, info); await shot("01-migration-A");
  await add(page, "A-created");
  let card = page.locator("#resource-page article").filter({ hasText: "A-created" }); await card.getByRole("button", { name: "Modifier", exact: true }).click();
  await card.getByLabel("Titre", { exact: true }).fill("A-edited"); await card.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator("#resource-page article").filter({ hasText: "A-edited" })).toHaveCount(1);
  await add(page, "A-to-delete"); card = page.locator("#resource-page article").filter({ hasText: "A-to-delete" }); await card.getByRole("button", { name: "Supprimer", exact: true }).click(); await expect(card).toHaveCount(0);
  const exactA = (await call(page, "snapshot"))[key(A, "resources")]; await shot("02-crud-A");
  await nav(page, "Sauvegarde et récupération"); const backup = await download(page, page.getByRole("button", { name: "Exporter uniquement mes ressources isolées" }), info, "A-fictif.json");
  expect(JSON.parse(fs.readFileSync(backup, "utf8")).resources).toEqual(JSON.parse(exactA));
  await call(page, "staleHandle"); await page.getByRole("button", { name: "Déconnexion fictive", exact: true }).click(); await expect(page.locator("#resource-page article")).toHaveCount(0);
  await login(page, "B"); await expect(page.locator("#resource-page")).not.toContainText("A-edited");
  const init = page.getByRole("region", { name: "Initialisation Ressources" });
  await init.getByLabel("Confirmez votre user.id pour initialiser").fill(B); await init.getByLabel("Je demande un espace Ressources vide pour ce compte.").check();
  await init.getByRole("button", { name: "Initialiser mes ressources" }).click(); await expect(page.locator("#resource-page article")).toHaveCount(0);
  expect((await call(page, "snapshot"))[key(B, "resources")]).toBe("[]");
  await add(page, "B-only"); const exactB = (await call(page, "snapshot"))[key(B, "resources")]; await shot("03-compte-B");
  await nav(page, "Sauvegarde et récupération"); const before = await call(page, "snapshot");
  await page.getByLabel("Prévisualiser un fichier JSON", { exact: true }).setInputFiles(backup); await expect(page.locator("#backup")).toContainText("autre compte");
  await expect(call(page, "saveStale")).rejects.toThrow(); expect(await call(page, "snapshot")).toEqual(before);
  await page.getByRole("button", { name: "Déconnexion fictive", exact: true }).click(); await login(page, "A");
  expect((await call(page, "snapshot"))[key(A, "resources")]).toBe(exactA); await expect(page.locator("#resource-page")).not.toContainText("B-only");
  await expect(page.locator("#prospect-resources")).toContainText("restent indisponibles");
  expect(await page.locator("#prospect-resources").getByRole("button", { name: /historique|relance/i }).count()).toBe(0);
  await (await replacement(page, info, "A-replaced")).click(); await expect(page.locator("#backup")).toContainText("1 ressource(s) copiée(s) et vérifiée(s)");
  const verified = await call(page, "snapshot"); expect(verified[key(B, "resources")]).toBe(exactB); await shot("04-remplacement-confirme");
  const interrupted = await replacement(page, info, "A-interrupted"); await simulations(page); await page.getByRole("button", { name: "Interrompre la validation du prochain import" }).click();
  await interrupted.click(); await expect(page.locator("#backup")).toContainText("Récupération nécessaire");
  await page.getByRole("button", { name: "Désactiver l’interruption simulée" }).click(); await page.reload();
  await expect(page.locator("#resource-page")).toContainText("Récupération nécessaire"); await nav(page, "Sauvegarde et récupération");
  const diagnostic = await download(page, page.getByRole("button", { name: "Exporter un diagnostic local sans modifier les données" }), info, "diagnostic-interruption.json");
  expect(JSON.parse(fs.readFileSync(diagnostic, "utf8")).status).toBe("recovery-required");
  const failed = await call(page, "snapshot"), entry = JSON.parse(failed[key(A, "resource-import-journal")]).at(-1);
  await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click(); const panel = recovery(page);
  const choice = await panel.locator("select option").evaluateAll((options, id) => options.find(o => o.textContent.includes(id) && o.textContent.includes("avant opération")).value, entry.importId);
  await panel.locator("select").selectOption(choice); await shot("05-diagnostic-et-copie");
  const safety = await download(page, panel.getByRole("button", { name: "Enregistrer la sauvegarde préalable complète et le diagnostic" }), info, "avant-recuperation.json");
  await panel.getByLabel("Relire le fichier enregistré", { exact: false }).setInputFiles(safety); await expect(panel).toContainText("relue et identique");
  await panel.getByLabel("Recopier le propriétaire").fill(A);
  for (const label of ["J’ai vérifié le contenu de cette copie.", "Je demande explicitement"]) {
    const checkbox = panel.getByLabel(label, { exact: false });
    try { await checkbox.check({ timeout: 10000 }); }
    catch (error) {
      const geometry = await checkbox.evaluate(el => {
        const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { viewport: innerWidth, document: document.documentElement.scrollWidth, scrollX, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, hitTag: hit?.tagName, hitClass: hit?.className, checked: el.checked };
      });
      await info.attach("confirmation-hit-test.json", { contentType: "application/json", body: Buffer.from(JSON.stringify(geometry, null, 2)) });
      throw error;
    }
  }
  await panel.getByRole("button", { name: "Récupérer les ressources de ce compte", exact: true }).click(); await expect(panel).toContainText("relue(s) et vérifiée(s)");
  const restored = await call(page, "snapshot"); expect(restored[key(A, "resources")]).toBe(verified[key(A, "resources")]); expect(restored[key(B, "resources")]).toBe(exactB);
  expect(JSON.parse(restored[key(A, "resource-import-journal")]).slice(0, -1)).toEqual(JSON.parse(failed[key(A, "resource-import-journal")]));
  await nav(page, "Ressources"); await page.locator("#resource-page").getByRole("button", { name: "Recharger les ressources" }).click();
  await expect(page.locator("#resource-page article").filter({ hasText: "A-replaced" })).toHaveCount(1);
  // The concurrently mounted read-only probe still needs its own reload; it remains fail-closed.
  await expect(page.locator("#prospect-resources")).toContainText("Récupération nécessaire");
  expect(await page.locator("#prospect-resources").getByRole("button", { name: /historique|relance/i }).count()).toBe(0);
  expect(restored["travel-prospect-crm-prospects"]).toBe("[]"); await shot("06-recuperation-verifiee");
  await simulations(page); await page.getByRole("button", { name: "Simuler une session expirée" }).click(); await expect(page.locator("#resource-page")).toContainText("Session expirée");
  await expect(call(page, "saveStale")).rejects.toThrow(); expect(await call(page, "snapshot")).toEqual(restored); await shot("07-session-expiree");
});

test("pilote : export de secours et contrôles de relecture sous quota natif saturé", async ({ pilot }, info) => {
  const { page, shot } = pilot; await migrate(page, info); const button = await replacement(page, info, "A-quota");
  await simulations(page); await page.getByRole("button", { name: "Interrompre la validation du prochain import" }).click(); await button.click();
  await expect(page.locator("#backup")).toContainText("Récupération nécessaire"); await page.getByRole("button", { name: "Désactiver l’interruption simulée" }).click();
  await page.getByRole("button", { name: "Saturer le quota natif du profil fictif" }).click();
  const before = digest(JSON.stringify(await call(page, "snapshot"))); const writes = await page.evaluate(() => window.chainRecipe.events.filter(e => e.action === "write").length);
  await nav(page, "Sauvegarde et récupération"); await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click({ timeout: 10000 }); const panel = recovery(page);
  await expect(panel).toContainText("Récupération par écriture bloquée");
  // Secure the external copy first, before attempting any recovery confirmations.
  const file = await download(page, panel.getByRole("button", { name: "Exporter la copie sélectionnée sans écriture localStorage" }), info, "copie-secours.json");
  const json = fs.readFileSync(file, "utf8"), copy = JSON.parse(json); expect(copy.ownerUserId).toBe(A); expect(copy.resourceFingerprint).toBe(digest(copy.rawResources));
  await panel.getByLabel("Relire la copie JSON exportée", { exact: false }).setInputFiles({ name: "wrong.json", mimeType: "application/json", buffer: Buffer.from(json + " ") });
  await expect(panel).toContainText("Export non vérifié"); await panel.getByLabel("Relire la copie JSON exportée", { exact: false }).setInputFiles(file);
  await expect(panel).toContainText("propriétaire et SHA-256 vérifiés");
  expect(digest(JSON.stringify(await call(page, "snapshot")))).toBe(before); expect(await page.evaluate(() => window.chainRecipe.events.filter(e => e.action === "write").length)).toBe(writes);
  await shot("quota-export-verifie");
  const safety = await download(page, panel.getByRole("button", { name: "Enregistrer la sauvegarde préalable complète et le diagnostic" }), info, "quota-diagnostic.json");
  await panel.getByLabel("Relire le fichier enregistré", { exact: false }).setInputFiles(safety); await panel.getByLabel("Recopier le propriétaire").fill(A);
  await panel.getByLabel("J’ai vérifié le contenu de cette copie.").check({ timeout: 10000 }); await panel.getByLabel("Je demande explicitement", { exact: false }).check({ timeout: 10000 });
  await expect(panel.getByRole("button", { name: "Récupérer les ressources de ce compte", exact: true })).toBeDisabled();
  expect(digest(JSON.stringify(await call(page, "snapshot")))).toBe(before); expect(await page.evaluate(() => window.chainRecipe.events.filter(e => e.action === "write").length)).toBe(writes);
});

test("pilote : refus d’un profil contenant un stockage étranger au pilote", async ({ browser }) => {
  const server = await startResourceChainServer({ pilot: true, jsonReplacement: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem("unrelated-fictional-sentinel", "must remain untouched"));
  const page = await context.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(server.url);
    await expect.poll(() => errors.some(e => e.includes("Pilot refuses a profile containing unrelated storage"))).toBe(true);
    await expect(page.locator("[data-resource-pilot]")).toHaveCount(0);
    expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))).toEqual({ "unrelated-fictional-sentinel": "must remain untouched" });
  } finally { await context.close(); await server.close(); }
});
