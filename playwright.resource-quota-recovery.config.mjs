import config from "./playwright.resource-flat-archive.config.mjs";
const quotaRecoveryConfig = {
  ...config,
  testMatch: ["resource-quota-recovery.spec.mjs", "resource-final-audit.spec.mjs", "resource-diagnostic.spec.mjs", "resource-manual-recovery.spec.mjs"],
  outputDir: "test-results/resource-quota-recovery/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-quota-recovery/browser-results.json" }]],
};
export default quotaRecoveryConfig;
