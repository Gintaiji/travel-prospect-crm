import config from "./playwright.cloud-restoration-guard.config.mjs";

const cloudSessionEffectConfig = {
  ...config,
  outputDir: "test-results/cloud-sync-98B-1/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/cloud-sync-98B-1/browser-results.json" }]],
};

export default cloudSessionEffectConfig;
