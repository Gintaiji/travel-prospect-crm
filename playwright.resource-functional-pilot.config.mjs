import config from "./playwright.resource-restoration-integrity.config.mjs";

const artifactRoot = process.env.CRM_RESOURCE_PILOT_RUN === "review" ? "test-results/resource-functional-pilot/review" : "test-results/resource-functional-pilot";
const pilotConfig = {
  ...config,
  outputDir: `${artifactRoot}/browser`,
  reporter: [["list"], ["json", { outputFile: `${artifactRoot}/browser-results.json` }]],
  projects: [
    { name: "regression-chrome", testMatch: config.testMatch },
    { name: "pilot-pc", testMatch: "resource-functional-pilot.spec.mjs", timeout: 90000, use: { viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" } },
    { name: "pilot-mobile", testMatch: "resource-functional-pilot.spec.mjs", timeout: 90000, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: "block" } },
  ],
};
export default pilotConfig;
