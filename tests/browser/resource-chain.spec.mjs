import { test as base, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import { startResourceChainServer } from "./resource-chain-server.mjs";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const call = (page, method, ...args) => page.evaluate(({ method, args }) => window.chainRecipe[method](...args), { method, args });
const test = base.extend({
  withoutLocks: [false, { option: true }],
  freshB: [false, { option: true }],
  absentB: [false, { option: true }],
  chain: async ({ context, withoutLocks, freshB, absentB }, provide, info) => {
    const server = await startResourceChainServer(), namespace = `e2e-${randomUUID()}`;
    const blocked = [], errors = [];
    const flags = ["app/lib/resourceIsolationSettings.ts", "app/lib/resourceBackupJson.ts", "app/lib/cloudSyncSuspension.ts"];
    const hashes = () => Object.fromEntries(flags.map(file => [file, createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
    const before = hashes();
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin === server.origin) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    if (withoutLocks) await context.addInitScript(() => Object.defineProperty(navigator, "locks", { get: () => undefined }));
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    try {
      await page.goto(`${server.url}?namespace=${namespace}`);
      await expect(page.locator("html")).toHaveAttribute("data-chain-ready", "true");
      await call(page, "seed", !freshB, absentB); await call(page, "signIn", A);
      await expect.poll(async () => (await call(page, "session")).status).toBe("connected");
      const initial = await call(page, "snapshot");
      await provide({ page, initial, context, url: page.url() });
      expect(await page.evaluate(() => window.chainRecipe.flags)).toEqual({ isolated: true, recovery: true, cloudSuspended: true });
      expect((await call(page, "physicalKeys")).every(k => k.startsWith(`tpc-chain:${namespace}:`))).toBe(true);
      expect(blocked).toEqual([]); expect(errors).toEqual([]); expect(hashes()).toEqual(before);
    } finally {
      await info.attach("chain-evidence.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({ namespace, before, after: hashes(), blocked, errors, events: await page.evaluate(() => window.chainRecipe?.events ?? []).catch(() => []) }, null, 2)) });
      await server.close();
    }
  },
});
async function download(page, button, info, name) {
  const event = page.waitForEvent("download"); await button.click();
  const file = info.outputPath(name); await (await event).saveAs(file); return file;
}
async function migrate(page, info) {
  const migration = page.locator("#migration");
  await migration.getByRole("button", { name: "Afficher l’aperçu sans modification" }).click();
  const file = await download(page, migration.getByRole("button", { name: "1. Télécharger la sauvegarde JSON préalable" }), info, "before-migration.json");
  expect(JSON.parse(fs.readFileSync(file, "utf8")).resources[0].id).toBe("A-legacy");
  await migration.getByLabel("J’ai enregistré et vérifié le fichier JSON sur mon appareil.").check();
  await migration.getByLabel("Je suis certain", { exact: false }).check();
  await migration.getByLabel("Recopiez l’identifiant", { exact: false }).fill(A);
  await migration.getByRole("button", { name: "2. Copier vers ce compte sans activer" }).click();
  await expect(migration.getByRole("status")).toContainText("Copie vérifiée");
  await page.locator("#resource-page").getByRole("button", { name: "Recharger les ressources" }).click();
  await expect(page.locator("#resource-page article")).toHaveCount(1);
}
async function add(page, title) {
  const section = page.locator("#resource-page");
  await section.getByLabel("Titre", { exact: true }).first().fill(title);
  await section.getByRole("combobox", { name: "Type", exact: true }).first().selectOption("Site");
  await section.getByLabel("URL", { exact: true }).first().fill(`https://example.invalid/${title}`);
  await section.getByRole("button", { name: "Ajouter la ressource", exact: true }).click();
  await expect(section.locator("article").filter({ hasText: title })).toHaveCount(1);
}
test("chaîne React réelle : migration, CRUD, A/logout/B/A, JSON, interruption et récupération", async ({ chain }, info) => {
  const { page, initial } = chain;
  await expect(page.locator("#resource-page")).toContainText("Migration nécessaire");
  const pre = await call(page, "snapshot");
  expect(pre[key(A, "resources")]).toBeUndefined(); // No implicit migration after sign-in.
  await migrate(page, info);
  let after = await call(page, "snapshot");
  expect(after[key(A, "resources")]).toBe(initial["travel-prospect-crm-resources"]);
  await add(page, "A-created");
  let card = page.locator("#resource-page article").filter({ hasText: "A-created" });
  await card.getByRole("button", { name: "Modifier", exact: true }).click();
  await card.getByLabel("Titre", { exact: true }).fill("A-edited");
  await card.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator("#resource-page article").filter({ hasText: "A-edited" })).toHaveCount(1);
  await add(page, "A-deleted");
  card = page.locator("#resource-page article").filter({ hasText: "A-deleted" });
  await card.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(card).toHaveCount(0);
  const exactA = (await call(page, "snapshot"))[key(A, "resources")];
  const exportFile = await download(page, page.getByRole("button", { name: "Exporter uniquement mes ressources isolées" }), info, "A-resources.json");
  const jsonA = fs.readFileSync(exportFile, "utf8");
  expect(JSON.parse(jsonA).ownerUserId).toBe(A); expect(JSON.parse(jsonA).resources).toEqual(JSON.parse(exactA));
  // Observe the actual production default instead of silently unblocking UI replacement.
  await page.getByLabel("Prévisualiser un fichier JSON", { exact: true }).setInputFiles(exportFile);
  await expect(page.locator("#backup")).toContainText("remplacement maintenu bloqué");
  await expect(page.getByRole("button", { name: "Charger uniquement les ressources après vérification" })).toBeDisabled();
  await call(page, "staleHandle"); await call(page, "signIn", null);
  await expect.poll(async () => (await call(page, "session")).status).toBe("disconnected");
  await expect(page.locator("#resource-page article")).toHaveCount(0);
  const eventOffset = await page.evaluate(() => window.chainRecipe.events.length);
  await call(page, "signIn", B); await expect.poll(async () => (await call(page, "session")).userId).toBe(B);
  await expect(page.locator("#resource-page article")).toHaveCount(0);
  await expect(page.locator("#root")).not.toContainText("A-edited");
  expect(await page.evaluate(({ offset, prefix }) => window.chainRecipe.events.slice(offset).filter(e => e.key.startsWith(prefix)), { offset: eventOffset, prefix: `travel-prospect-crm:account:v1:${A}:` })).toEqual([]);
  const beforeReject = await call(page, "snapshot");
  await expect(call(page, "importJson", jsonA)).rejects.toThrow(/autre compte/);
  await expect(call(page, "saveStale")).rejects.toThrow(/périmée/);
  expect(await call(page, "snapshot")).toEqual(beforeReject);
  await add(page, "B-only"); const exactB = (await call(page, "snapshot"))[key(B, "resources")];
  await call(page, "signIn", A); await expect.poll(async () => (await call(page, "session")).userId).toBe(A);
  await expect(page.locator("#resource-page article")).toHaveCount(2);
  expect((await call(page, "snapshot"))[key(A, "resources")]).toBe(exactA);
  await call(page, "importJson", jsonA); // Explicit coordinated fixture policy; actual parser and writer.
  expect((await call(page, "snapshot"))[key(A, "resources")]).toBe(exactA);
  const prospects = page.locator("#prospect-resources");
  await expect(prospects).toContainText("restent indisponibles");
  expect(await prospects.getByRole("button").allTextContents()).not.toContain("Ajouter à l’historique");
  const prospectBefore = (await call(page, "snapshot"))["travel-prospect-crm-prospects"];
  await prospects.getByRole("combobox").selectOption({ label: "A-edited · Site" });
  await expect(prospects.getByRole("button", { name: /historique|relance/i })).toHaveCount(0);
  expect((await call(page, "snapshot"))["travel-prospect-crm-prospects"]).toBe(prospectBefore);
  await call(page, "fault", "verified"); await expect(call(page, "importJson", jsonA)).rejects.toThrow(/Récupération nécessaire/);
  await call(page, "fault", null); await page.reload();
  await expect(page.locator("#resource-page")).toContainText("Récupération nécessaire");
  const diagnosticFile = await download(page, page.getByRole("button", { name: "Exporter un diagnostic local sans modifier les données" }), info, "interrupted-diagnostic.json");
  expect(JSON.parse(fs.readFileSync(diagnosticFile, "utf8")).status).toBe("recovery-required");
  await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click();
  const safety = await download(page, page.getByRole("button", { name: "Enregistrer la sauvegarde préalable complète et le diagnostic" }), info, "recovery-safety.json");
  const recovery = page.locator("section").filter({ has: page.getByRole("heading", { name: "Récupération manuelle des ressources", exact: true }) }).last();
  const copies = recovery.getByRole("combobox");
  await copies.selectOption(String(await copies.locator("option").count() - 1));
  await recovery.getByLabel("Relire le fichier enregistré", { exact: false }).setInputFiles(safety);
  await expect(recovery).toContainText("relue et identique");
  await recovery.getByLabel("Recopier le propriétaire").fill(A);
  await recovery.getByLabel("J’ai vérifié le contenu de cette copie.").check();
  await recovery.getByLabel("Je demande explicitement", { exact: false }).check();
  await recovery.getByRole("button", { name: "Récupérer les ressources de ce compte", exact: true }).click();
  await expect(recovery).toContainText("relue(s) et vérifiée(s)");
  after = await call(page, "snapshot");
  expect(after[key(A, "resources")]).toBe(exactA); expect(after[key(B, "resources")]).toBe(exactB);
  expect(after["travel-prospect-crm-resources"]).toBe(initial["travel-prospect-crm-resources"]);
  expect(after["travel-prospect-crm-prospects"]).toBe(initial["travel-prospect-crm-prospects"]);
  const journal = JSON.parse(after[key(A, "resource-import-journal")]);
  expect(journal.at(-1).kind).toBe("recovery"); expect(journal.at(-1).diagnosticJson).toBe(fs.readFileSync(safety, "utf8"));
  expect(journal[0].kind).toBe("migration"); expect(JSON.parse(after[key(A, "resource-import-state")]).status).toBe("verified");
  await page.screenshot({ path: info.outputPath("chain-recovered.png"), fullPage: true });
});
test("session expirée : écran masqué et ancienne opération refusée", async ({ chain }, info) => {
  const { page } = chain; await migrate(page, info); await call(page, "staleHandle");
  const before = await call(page, "snapshot"); await call(page, "expire");
  await expect(page.locator("#resource-page")).toContainText("Session expirée");
  await expect(page.locator("#resource-page article")).toHaveCount(0);
  await expect(call(page, "saveStale")).rejects.toThrow(/périmée/); expect(await call(page, "snapshot")).toEqual(before);
});
test("échec de lecture : erreur visible distincte de récupération, aucun effacement", async ({ chain }, info) => {
  const { page } = chain; await migrate(page, info);
  const before = await call(page, "snapshot"); await call(page, "fault", "read"); await call(page, "signIn", A);
  await expect(page.locator("#resource-page")).toContainText("Synthetic read failure");
  await expect(page.locator("#resource-page")).not.toContainText("Récupération nécessaire");
  expect(await call(page, "snapshot")).toEqual(before);
  await call(page, "fault", null); await call(page, "signIn", A);
  await expect(page.locator("#resource-page article")).toHaveCount(1);
});
test.describe("compte B sans préparation préalable", () => {
  test.use({ freshB: true });
  test("limite d’activation : B reste sans parcours d’initialisation après réservation de A", async ({ chain }, info) => {
    const { page } = chain; await migrate(page, info); const before = await call(page, "snapshot");
    await call(page, "signIn", B); await expect.poll(async () => (await call(page, "session")).userId).toBe(B);
    await expect(page.locator("#resource-page")).toContainText("Migration nécessaire");
    await expect(page.locator("#resource-page article")).toHaveCount(0);
    await page.locator("#migration").getByRole("button", { name: "Afficher l’aperçu sans modification" }).click();
    await expect(page.locator("#migration").getByRole("status")).toContainText("migration réservée");
    const after = await call(page, "snapshot");
    expect(after[key(B, "migration-state")]).toBeUndefined(); expect(after[key(B, "resources")]).toBeUndefined();
    expect(after[key(A, "resources")]).toBe(before[key(A, "resources")]);
    await page.screenshot({ path: info.outputPath("fresh-B-blocked.png"), fullPage: true });
    await info.attach("activation-limitation.txt", { contentType: "text/plain", body: Buffer.from("B neuf ne peut pas créer de ressources : migration-state absent et jeu historique déjà réservé à A. Aucun correctif applicatif effectué.") });
  });
});
test.describe("import JSON autorisé vers une destination absente vérifiée", () => {
  test.use({ absentB: true });
  test("interface réelle : aperçu, sauvegarde d’absence explicite, confirmation et import B", async ({ chain }, info) => {
    const { page, initial } = chain;
    await call(page, "signIn", B); await expect.poll(async () => (await call(page, "session")).userId).toBe(B);
    await expect(page.locator("#resource-page")).toContainText("Données Ressources absentes");
    const resource = { id: "B-file", title: "B-file", type: "Site", url: "https://example.invalid/B-file", notes: "FICTITIOUS", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" };
    const json = JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: B, resources: [resource] });
    await page.getByLabel("Prévisualiser un fichier JSON", { exact: true }).setInputFiles({ name: "B-fictional.json", mimeType: "application/json", buffer: Buffer.from(json) });
    const button = page.getByRole("button", { name: "Charger uniquement les ressources après vérification" });
    await expect(button).toBeDisabled();
    const safetyFile = await download(page, page.getByRole("button", { name: "Télécharger la sauvegarde préalable de la destination" }), info, "B-absent-safety.json");
    const safety = JSON.parse(fs.readFileSync(safetyFile, "utf8"));
    expect(safety.storageScope).toBe("account-resource-safety"); expect(safety.resources).toBeNull(); expect(safety.rawResources).toBeNull();
    await page.getByLabel("J’ai vérifié l’aperçu.", { exact: true }).check();
    await page.getByLabel("Ces ressources appartiennent exclusivement", { exact: false }).check();
    await page.getByLabel("Recopiez le user.id du propriétaire", { exact: true }).fill(B);
    await page.getByLabel("J’ai enregistré et vérifié cette sauvegarde préalable.", { exact: true }).check();
    await expect(button).toBeEnabled(); await button.click();
    await expect(page.locator("#backup")).toContainText("1 ressource(s) copiée(s) et vérifiée(s)");
    expect(JSON.parse((await call(page, "snapshot"))[key(B, "resources")])).toEqual([resource]);
    expect((await call(page, "snapshot"))["travel-prospect-crm-resources"]).toBe(initial["travel-prospect-crm-resources"]);
    await page.locator("#resource-page").getByRole("button", { name: "Recharger les ressources" }).click();
    await expect(page.locator("#resource-page article")).toHaveCount(1);
  });
});
test.describe("Web Locks absent", () => {
  test.use({ withoutLocks: true });
  test("migration, lecture et export refusés sans écriture", async ({ chain }, info) => {
    const { page } = chain, before = await call(page, "snapshot");
    await expect(page.locator("#resource-page")).toContainText("Web Locks indisponible");
    await page.locator("#migration").getByRole("button", { name: "Afficher l’aperçu sans modification" }).click();
    const migration = page.locator("#migration");
    await download(page, migration.getByRole("button", { name: "1. Télécharger la sauvegarde JSON préalable" }), info, "before-refused-migration.json");
    await migration.getByLabel("J’ai enregistré et vérifié le fichier JSON sur mon appareil.").check();
    await migration.getByLabel("Je suis certain", { exact: false }).check();
    await migration.getByLabel("Recopiez l’identifiant", { exact: false }).fill(A);
    await migration.getByRole("button", { name: "2. Copier vers ce compte sans activer" }).click();
    await expect(migration.getByRole("status")).toContainText("ne permet pas le verrouillage");
    await expect(call(page, "exportJson")).rejects.toThrow(/Web Locks/);
    expect(await call(page, "snapshot")).toEqual(before);
  });
});
