import config from "./playwright.resource-diagnostic.config.mjs";
const recoveryConfig = {
  ...config,
  outputDir: "test-results/resource-recovery-97C-2B3D4A/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-recovery-97C-2B3D4A/browser-results.json" }]],
};
export default recoveryConfig;
