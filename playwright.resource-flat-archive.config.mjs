import config from "./playwright.resource-final-audit.config.mjs";

const flatArchiveConfig = {
  ...config,
  outputDir: "test-results/resource-flat-archive/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-flat-archive/browser-results.json" }]],
};
export default flatArchiveConfig;
