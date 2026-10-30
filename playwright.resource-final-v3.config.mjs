import config from "./playwright.resource-restoration-integrity.config.mjs";

const concurrency = process.env.CRM_RESOURCE_AUDIT_MODE === "concurrency";
const mode = concurrency ? "concurrency" : "full";
const finalV3Config = {
  ...config,
  retries: 0,
  repeatEach: concurrency ? 3 : 1,
  ...(concurrency ? { grep: /deux onglets|deux aperçus|résistance bornée/ } : {}),
  outputDir: `test-results/resource-final-v3/${mode}/browser`,
  reporter: [["list"], ["json", { outputFile: `test-results/resource-final-v3/${mode}/results.json` }]],
};
export default finalV3Config;
