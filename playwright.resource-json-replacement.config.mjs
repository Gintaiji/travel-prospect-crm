import config from "./playwright.resource-initialization.config.mjs";
const replacementConfig = {
  ...config,
  testMatch: ["resource-json-replacement.spec.mjs", "resource-diagnostic.spec.mjs", "resource-manual-recovery.spec.mjs"],
  outputDir: "test-results/resource-json-replacement-97C-2B3D6B/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-json-replacement-97C-2B3D6B/browser-results.json" }]],
};
export default replacementConfig;
