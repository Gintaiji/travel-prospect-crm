import config from "./playwright.resource-json-replacement.config.mjs";
const finalAuditConfig = {
  ...config,
  testMatch: ["resource-final-audit.spec.mjs", "resource-diagnostic.spec.mjs", "resource-manual-recovery.spec.mjs"],
  outputDir: "test-results/resource-final-audit-97C-2B3D7/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/resource-final-audit-97C-2B3D7/browser-results.json" }]],
};
export default finalAuditConfig;
