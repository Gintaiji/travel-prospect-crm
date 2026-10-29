import config from "./playwright.resource.config.mjs";
const chainConfig = {
  ...config,
  testMatch: ["resource-chain.spec.mjs", "resource-diagnostic.spec.mjs", "resource-manual-recovery.spec.mjs"],
  outputDir: "test-results/resource-chain-97C-2B3D5/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-chain-97C-2B3D5/browser-results.json" }]],
};
export default chainConfig;
