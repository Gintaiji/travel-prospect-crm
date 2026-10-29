import config from "./playwright.resource.config.mjs";
const diagnosticConfig = {
  ...config,
  testMatch: "resource-diagnostic.spec.mjs",
  outputDir: "test-results/resource-diagnostic-97C-2B3D2/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-diagnostic-97C-2B3D2/browser-results.json" }]],
};
export default diagnosticConfig;
