import { expect } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { test, call, key, A, B, migrate, add, download } from "./resource-chain.spec.mjs";
import { prepare } from "./resource-json-replacement.spec.mjs";
import { snapshotMetrics } from "../helpers/resourceStorageMetrics.mjs";

const digest = value => createHash("sha256").update(value ?? "").digest("hex");
async function evidence(info, name, payload) {
  const file = info.outputPath(name); fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  await info.attach(name, { path: file, contentType: "application/json" });
}
test.describe("audit final : croissance et quota", () => {
  test.use({ replacementEnabled: true });
  test("mesure bornée de remplacements successifs jusqu’au quota natif", async ({ chain }, info) => {
    const { page, initial } = chain; await migrate(page, info);
    const rows = [{ round: 0, status: "migration-verified", ...snapshotMetrics(await call(page, "snapshot"), A), usage: await call(page, "storageUsage") }];
    let terminal = "eight-attempt-bound", successes = 0;
    try {
      for (let round = 1; round <= 8; round++) {
        const started = performance.now();
        const p = await prepare(page, info, `round-${round}`, `round-${round}-safety.json`);
        const safetyUtf8Bytes = fs.statSync(p.file).size;
        if (safetyUtf8Bytes > 16 * 1024 * 1024) { terminal = "16-MiB-safety-analysis-bound"; break; }
        const beforeMetrics = snapshotMetrics(p.before, A), applied = performance.now();
        await p.button.click(); await expect(p.button).toHaveCount(0);
        const message = await page.locator("#backup").innerText(), after = await call(page, "snapshot");
        const metrics = snapshotMetrics(after, A), success = message.includes("1 ressource(s) copiée(s) et vérifiée(s)");
        const row = { round, status: success ? "verified" : "refused", safetyUtf8Bytes,
          previewAndReadbackMs: applied - started, clickToOutcomeMs: performance.now() - applied,
          previousResourceSha256: digest(p.before[key(A, "resources")]), currentResourceSha256: digest(after[key(A, "resources")]),
          journalGrowthRatio: metrics.journal.utf16ValueBytes / beforeMetrics.journal.utf16ValueBytes,
          ...metrics, usage: await call(page, "storageUsage") };
        rows.push(row);
        expect(after[key(B, "resources")]).toBe(initial[key(B, "resources")]);
        expect(after["travel-prospect-crm-resources"]).toBe(initial["travel-prospect-crm-resources"]);
        const previousEntries = JSON.parse(p.before[key(A, "resource-import-journal")]);
        const entries = JSON.parse(after[key(A, "resource-import-journal")]);
        expect(digest(JSON.stringify(entries.slice(0, previousEntries.length)))).toBe(digest(JSON.stringify(previousEntries)));
        expect(metrics.journal.bounded).toBe(false);
        if (!success) {
          expect(message).toMatch(/quota/i); expect(after[key(A, "resources")]).toBe(p.before[key(A, "resources")]);
          row.allStorageUnchanged = digest(JSON.stringify(after)) === digest(JSON.stringify(p.before));
          terminal = "native-localStorage-quota"; break;
        }
        successes++; expect(JSON.parse(after[key(A, "resources")])[0].id).toBe(`round-${round}`);
      }
      expect(successes).toBeGreaterThanOrEqual(3);
    } finally {
      const successfulRows = rows.filter(row => row.status === "verified");
      await evidence(info, "growth-measurements.json", { browser: await page.context().browser().version(), terminal, successes,
        units: { journal: "UTF-16 value estimate, excluding keys/browser overhead", safety: "actual UTF-8 downloaded file bytes", usage: "UTF-16 physical keys and values estimate" },
        maximumEmbeddedJournalDepth: Math.max(...rows.map(row => row.journal.embeddedJournalDepth)),
        excessiveGrowthObserved: successfulRows.some(row => row.journal.utf16ValueBytes > row.resourceUtf16Bytes * 100),
        nativeStorageRefusals: await page.evaluate(() => window.chainRecipe.events.filter(event => event.action === "native-storage-refusal")), rows });
    }
  });
  test("quota mesuré avant journal : état intégral précédent et sauvegarde conservés", async ({ chain }, info) => {
    const { page } = chain; await migrate(page, info); const p = await prepare(page, info, "refused-by-budget", "quota-before.json");
    const usage = await call(page, "storageUsage"); await call(page, "setQuota", usage.estimatedUtf16KeyValueBytes);
    await p.button.click(); await expect(page.locator("#backup")).toContainText("Récupération nécessaire");
    const after = await call(page, "snapshot"); expect(after).toEqual(p.before); expect(fs.existsSync(p.file)).toBe(true);
    await evidence(info, "quota-before-journal.json", { usage, afterUsage: await call(page, "storageUsage"), unchanged: true, safetyUtf8Bytes: fs.statSync(p.file).size,
      events: await page.evaluate(() => window.chainRecipe.events.filter(event => event.action.startsWith("quota"))) });
  });
  test("quota après journal : ressources précédentes intactes, interruption diagnostiquable", async ({ chain }, info) => {
    const { page } = chain; await migrate(page, info); const before = await call(page, "snapshot");
    const incoming = { id: "quota-large", title: "quota-large", type: "Site", url: "https://example.invalid/quota", notes: "x".repeat(64 * 1024), isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" };
    const file = info.outputPath("large-source.json"); fs.writeFileSync(file, JSON.stringify({ appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: A, resources: [incoming] }));
    await page.getByLabel("Prévisualiser un fichier JSON", { exact: true }).setInputFiles(file);
    const safety = await download(page, page.getByRole("button", { name: "Télécharger la sauvegarde préalable de la destination" }), info, "quota-after-safety.json");
    await page.getByLabel("Relire la sauvegarde préalable complète enregistrée", { exact: true }).setInputFiles(safety);
    await expect(page.locator("#backup")).toContainText("complète relue et vérifiée");
    await page.getByLabel("J’ai vérifié l’aperçu.", { exact: true }).check(); await page.getByLabel("Ces ressources appartiennent exclusivement", { exact: false }).check();
    await page.getByLabel("Recopiez le user.id du propriétaire", { exact: true }).fill(A); await page.getByLabel("J’autorise explicitement le remplacement de la destination sauvegardée.", { exact: true }).check();
    await call(page, "quotaAfterJournal"); await page.getByRole("button", { name: "Charger uniquement les ressources après vérification" }).click();
    await expect(page.locator("#backup")).toContainText("Récupération nécessaire");
    const after = await call(page, "snapshot"); expect(after[key(A, "resources")]).toBe(before[key(A, "resources")]); expect(after[key(B, "resources")]).toBe(before[key(B, "resources")]);
    const entries = JSON.parse(after[key(A, "resource-import-journal")]); expect(entries).toHaveLength(2);
    expect(entries[1].beforeRaw).toBe(before[key(A, "resources")]); expect(entries[1].replacement.safetyJson).toBe(fs.readFileSync(safety, "utf8"));
    expect(JSON.parse(after[key(A, "resource-import-state")]).status).toBe("pending");
    const diagnosticFile = await download(page, page.getByRole("button", { name: "Exporter un diagnostic local sans modifier les données" }), info, "quota-after-diagnostic.json");
    expect(JSON.parse(fs.readFileSync(diagnosticFile, "utf8")).status).toBe("recovery-required");
    // Manual recovery also needs journal space; do not silently remove the imposed quota.
    await page.getByRole("button", { name: "Préparer un aperçu de récupération" }).click();
    const recovery = page.locator("section").filter({ has: page.getByRole("heading", { name: "Récupération manuelle des ressources", exact: true }) }).last();
    const recoveryFile = await download(page, recovery.getByRole("button", { name: "Enregistrer la sauvegarde préalable complète et le diagnostic" }), info, "quota-recovery-safety.json");
    await recovery.getByLabel("Relire le fichier enregistré", { exact: false }).setInputFiles(recoveryFile); await expect(recovery).toContainText("relue et identique");
    await recovery.getByLabel("Recopier le propriétaire").fill(A); await recovery.getByLabel("J’ai vérifié le contenu de cette copie.").check();
    await recovery.getByLabel("Je demande explicitement", { exact: false }).check(); await recovery.getByRole("button", { name: "Récupérer les ressources de ce compte", exact: true }).click();
    await expect(recovery).toContainText("Échec :"); expect(await call(page, "snapshot")).toEqual(after);
    await evidence(info, "quota-after-journal.json", { previous: snapshotMetrics(before, A), current: snapshotMetrics(after, A), usage: await call(page, "storageUsage"),
      previousDataPreserved: true, recoveryAtSameQuota: "refused-with-copies-preserved", events: await page.evaluate(() => window.chainRecipe.events.filter(event => event.action.startsWith("quota"))) });
  });
});
test.describe("audit final : CRUD des deux comptes", () => {
  test.use({ freshB: true });
  test("A migré, B initialisé, CRUD B puis A et expiration : originaux conservés", async ({ chain }, info) => {
    const { page, initial } = chain; await migrate(page, info); const exactA = (await call(page, "snapshot"))[key(A, "resources")];
    await call(page, "signIn", null); await expect(page.locator("#resource-page article")).toHaveCount(0);
    await call(page, "signIn", B); await expect(page.locator("#resource-page")).toContainText("Compte neuf sans données");
    const init = page.getByRole("region", { name: "Initialisation Ressources" });
    await init.getByLabel("Confirmez votre user.id pour initialiser").fill(B); await init.getByLabel("Je demande un espace Ressources vide pour ce compte.").check();
    await init.getByRole("button", { name: "Initialiser mes ressources" }).click();
    for (const [owner, prefix] of [[B, "B"], [A, "A"]]) {
      if (owner === A) { await call(page, "signIn", A); await expect.poll(async () => (await call(page, "session")).userId).toBe(A); expect((await call(page, "snapshot"))[key(A, "resources")]).toBe(exactA); }
      await add(page, `${prefix}-create`);
      const card = page.locator("#resource-page article").filter({ hasText: `${prefix}-create` });
      await card.getByRole("button", { name: "Modifier", exact: true }).click(); await card.getByLabel("Titre", { exact: true }).fill(`${prefix}-edited`);
      await card.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await expect(page.locator("#resource-page article").filter({ hasText: `${prefix}-edited` })).toHaveCount(1);
      await add(page, `${prefix}-delete`); const removed = page.locator("#resource-page article").filter({ hasText: `${prefix}-delete` }); await removed.getByRole("button", { name: "Supprimer", exact: true }).click(); await expect(removed).toHaveCount(0);
    }
    const before = await call(page, "snapshot"); expect(before["travel-prospect-crm-resources"]).toBe(initial["travel-prospect-crm-resources"]);
    await call(page, "signIn", B); await expect(page.locator("#resource-page article")).toHaveCount(1); await expect(page.locator("#resource-page")).not.toContainText("A-edited");
    await call(page, "staleHandle"); await call(page, "expire"); await expect(page.locator("#resource-page")).toContainText("Session expirée");
    await expect(call(page, "saveStale")).rejects.toThrow(); await expect(call(page, "exportJson")).rejects.toThrow();
    const after = await call(page, "snapshot"); for (const owner of [A, B]) expect(after[key(owner, "resources")]).toBe(before[key(owner, "resources")]);
  });
});
