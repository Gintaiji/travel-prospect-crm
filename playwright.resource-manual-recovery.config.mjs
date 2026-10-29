import config from "./playwright.resource-diagnostic.config.mjs";
const manualRecoveryConfig = {
  ...config,
  testMatch: ["resource-diagnostic.spec.mjs", "resource-manual-recovery.spec.mjs"],
  outputDir: "test-results/resource-manual-recovery-97C-2B3D4B/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-manual-recovery-97C-2B3D4B/browser-results.json" }]],
};
export default manualRecoveryConfig;
