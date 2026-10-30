import config from "./playwright.resource-functional-pilot.config.mjs";

const phase = process.env.CRM_RESOURCE_RESPONSIVE_PHASE === "before" ? "before" : "after";
const root = `test-results/resource-mobile-recovery/${phase}`;
const mobile = config.projects.find(project => project.name === "pilot-mobile");
const responsiveRecoveryConfig = {
  ...config,
  outputDir: `${root}/browser`,
  reporter: [["list"], ["json", { outputFile: `${root}/results.json` }]],
  projects: [
    config.projects.find(project => project.name === "regression-chrome"),
    config.projects.find(project => project.name === "pilot-pc"),
    ...[[320, 640], [375, 812], [390, 844]].map(([width, height]) => ({ ...mobile, name: `pilot-mobile-${width}`, use: { ...mobile.use, viewport: { width, height } } })),
  ],
};
export default responsiveRecoveryConfig;
