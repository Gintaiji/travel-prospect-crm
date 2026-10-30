import config from "./playwright.resource.config.mjs";

const cloudRestorationGuardConfig = {
  ...config,
  testMatch: "cloud-restoration-guard.spec.mjs",
  globalSetup: "./tests/browser/cloud-restoration-guard-setup.mjs",
  outputDir: "test-results/cloud-restoration-98B/browser-direct",
  reporter: [["list"], ["json", { outputFile: "test-results/cloud-restoration-98B/browser-results-direct.json" }]],
  use: { ...config.use, baseURL: "http://127.0.0.1:31498", serviceWorkers: "block" },
  projects: [
    { name: "pc", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
};
export default cloudRestorationGuardConfig;
