import config from "./playwright.resource-quota-recovery.config.mjs";

const concurrency = process.env.CRM_RESOURCE_AUDIT_MODE === "concurrency";
const mode = concurrency ? "concurrency" : "full";
const finalV2Config = {
  ...config,
  testMatch: [...config.testMatch, "resource-final-v2-integrity.spec.mjs"],
  retries: 0,
  repeatEach: concurrency ? 10 : 1,
  ...(concurrency ? { grep: /deux onglets|deux aperçus|résistance bornée/ } : {}),
  outputDir: `test-results/resource-final-v2/${mode}/browser`,
  reporter: [["list"], ["json", { outputFile: `test-results/resource-final-v2/${mode}/results.json` }]],
};
export default finalV2Config;
