// Local production-build smoke test. Never uses a real profile or account.
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";

const output = "test-results/security-97s/pwa";
fs.mkdirSync(output, { recursive: true });
const reserve = net.createServer();
reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let serverLog = "";
server.stdout.on("data", data => { serverLog += data; });
server.stderr.on("data", data => { serverLog += data; });
let browser;
const result = { externalRequestsBlocked: 0, checks: [], pageErrors: [] };
try {
  await expect.poll(async () => {
    try { return (await fetch(origin + "/manifest.webmanifest")).status; } catch { return 0; }
  }, { timeout: 20_000 }).toBe(200);
  browser = await chromium.launch({ headless: true, channel: process.env.CRM_E2E_BROWSER_CHANNEL ?? "chrome" });
  const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36" });
  // Context routing blocks external calls before the app can contact Supabase.
  // The existing worker handles only same-origin GET requests.
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    result.externalRequestsBlocked++; return route.abort();
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.on("pageerror", error => result.pageErrors.push(error.message));
  const response = await page.goto(origin + "/aujourdhui");
  expect(response.status()).toBe(200);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const manifest = await (await context.request.get(origin + "/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Travel Prospect CRM", start_url: "/aujourdhui", display: "standalone", scope: "/" });
  for (const icon of manifest.icons) expect((await context.request.get(origin + icon.src)).status()).toBe(200);
  result.checks.push("production page, manifest, start URL and icons served");
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).active.state)).toBe("activated");
  result.checks.push("real service worker activated and controls page");
  await page.reload();
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match(location.href)))).toBe(true);
  await context.setOffline(true);
  const offline = await page.reload();
  expect(offline.status()).toBe(200);
  expect(offline.fromServiceWorker()).toBe(true);
  await expect(page.locator("body")).toContainText("Aujourd");
  result.checks.push("warmed start page reloads offline from service worker cache");
  await context.setOffline(false);
  // Check the app's install handler with an explicit synthetic browser event.
  // This does not assert native Chrome installability or install on the host OS.
  await page.evaluate(() => {
    window.fixturePromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => { window.fixturePromptCalls++; };
    event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "test" });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Installer", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixturePromptCalls)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("travel-prospect-crm-install-dismissed"))).toBe("true");
  result.checks.push("mobile install UI calls prompt and persists dismissal in fresh test profile");
  expect(result.pageErrors).toEqual([]);
  result.checks.push("no uncaught page error");
  result.browser = browser.version(); result.success = true;
  await page.screenshot({ path: output + "/page.png" });
  await context.tracing.stop({ path: output + "/trace.zip" });
  await context.close();
} catch (error) {
  result.success = false; result.error = error.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  fs.writeFileSync(output + "/result.json", JSON.stringify(result, null, 2));
  fs.writeFileSync(output + "/server.log", serverLog);
  console.log(JSON.stringify(result, null, 2));
}
