import config from "./playwright.resource-diagnostic.config.mjs";
const consistencyConfig = {
  ...config,
  outputDir: "test-results/resource-consistency-97C-2B3D3/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-consistency-97C-2B3D3/browser-results.json" }]],
};
export default consistencyConfig;
