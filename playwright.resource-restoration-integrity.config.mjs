import config from "./playwright.resource-final-v2.config.mjs";

const restorationIntegrityConfig = {
  ...config,
  repeatEach: 1,
  grep: undefined,
  outputDir: "test-results/resource-restoration-integrity/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-restoration-integrity/browser-results.json" }]],
};
export default restorationIntegrityConfig;
