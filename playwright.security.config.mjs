import diagnosticConfig from "./playwright.resource-diagnostic.config.mjs";

const securityConfig = {
  ...diagnosticConfig,
  outputDir: "test-results/security-97s/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/security-97s/browser-results.json" }]],
};
export default securityConfig;
