import config from "./playwright.resource-chain.config.mjs";
const initializationConfig = {
  ...config,
  outputDir: "test-results/resource-initialization-97C-2B3D6A/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-initialization-97C-2B3D6A/browser-results.json" }]],
};
export default initializationConfig;
