import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "resource-isolation.spec.mjs",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 40_000,
  expect: { timeout: 8_000 },
  outputDir: "test-results/resource-browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-browser-results.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.CRM_E2E_BROWSER_PATH ? { executablePath: process.env.CRM_E2E_BROWSER_PATH } : {},
    ...(process.env.CRM_E2E_BROWSER_PATH ? {} : { channel: process.env.CRM_E2E_BROWSER_CHANNEL ?? "chrome" }),
  },
});
