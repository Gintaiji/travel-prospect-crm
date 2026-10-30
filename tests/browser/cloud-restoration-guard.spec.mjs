import { test, expect } from "@playwright/test";
import fs from "node:fs";

const snapshot = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));

test("suspension : vraie page, clic sans restauration et aller-retour JSON local", async ({ page, context }, info) => {
  const external = [], errors = [], dialogs = [];
  // Fail closed BEFORE navigation: never send a request to any configured remote project.
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:31498") return route.continue();
    external.push({ method: route.request().method(), type: route.request().resourceType() });
    return route.abort();
  });
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", async d => { dialogs.push(d.message()); await d.accept(); });
  await context.addInitScript(() => {
    // Dedicated fresh context. Only a fictional unrelated sentinel is seeded.
    if (localStorage.getItem("fictional-98B-sentinel") === null) localStorage.setItem("fictional-98B-sentinel", "keep-exactly");
  });
  await page.goto("/sauvegarde");
  await expect(page.getByText("Restauration depuis le cloud indisponible", { exact: false })).toBeVisible();
  const button = page.getByRole("button", { name: "Charger depuis le cloud", exact: true });
  await expect(button).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sauvegarder dans le cloud", exact: true })).toBeDisabled();
  await expect(page.getByText("Aucun utilisateur connecté.", { exact: true })).toBeVisible();
  const before = await snapshot(page);
  await button.scrollIntoViewIfNeeded();
  const rect = await button.boundingBox();
  if (info.project.name === "mobile") await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  else await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  expect(dialogs).toEqual([]);
  expect(await snapshot(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath("suspended.png") });

  // Exercise the real existing local JSON handlers with a downloaded fictional snapshot.
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder mes données", exact: true }).click();
  const file = info.outputPath("fictional-local-backup.json"); await (await pending).saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(exported.prospects).toEqual([]); expect(exported.resources).toEqual([]);
  expect(exported.appName).toBe("Travel Prospect CRM");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(page.getByText("Sauvegarde complète chargée avec succès.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("fictional-98B-sentinel"))).toBe("keep-exactly");
  await expect(button).toBeDisabled();
  expect(errors).toEqual([]);
  // No remote request even attempted with this fresh, unauthenticated fake profile.
  expect(external).toEqual([]);
});
