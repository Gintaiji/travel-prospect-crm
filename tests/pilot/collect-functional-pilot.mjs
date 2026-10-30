import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = "test-results/resource-functional-pilot";
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const before = read("source-before.json");
const changed = Object.entries(before.files).filter(([file, hash]) => createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== hash).map(([file]) => file);
function collect(file) {
  const result = read(file), cases = [], evidence = [];
  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    if (value.tests && value.title) {
      for (const test of value.tests) cases.push({ title: value.title, project: test.projectName, results: test.results.map(r => ({ status: r.status, retry: r.retry, error: r.error?.message })) });
    }
    if (["functional-pilot-evidence.json", "confirmation-hit-test.json"].includes(value.name) && value.body) evidence.push({ name: value.name, data: JSON.parse(Buffer.from(value.body, "base64").toString()) });
    Object.values(value).forEach(walk);
  }
  walk(result); return { stats: result.stats, cases, evidence };
}
const summary = { sourceUnchanged: changed.length === 0, sourceFileCount: Object.keys(before.files).length, changed,
  production: read("production-build.json"), full: collect("browser-results.json"), review: collect("review/browser-results.json"), legacyIntegrity: read("legacy-integrity-unit.json") };
fs.writeFileSync(path.join(root, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ sourceUnchanged: summary.sourceUnchanged, sourceFileCount: summary.sourceFileCount,
  production: { flag: summary.production.productionSourceFlag, compiledLegacyBranch: summary.production.compiledProductionLegacyBranch, scanned: summary.production.scanned, hits: summary.production.pilotMarkerHits },
  full: summary.full.stats, review: summary.review.stats,
  reviewCases: summary.review.cases.map(c => ({ project: c.project, title: c.title, statuses: c.results.map(r => r.status) })),
  reviewScreens: summary.review.evidence.filter(e => e.name === "functional-pilot-evidence.json").map(e => ({ project: e.data.project, fresh: e.data.initialProfileWasEmpty, blocked: e.data.blocked, errors: e.data.errors, screens: e.data.screens })),
  hitTests: summary.review.evidence.filter(e => e.name === "confirmation-hit-test.json") }, null, 2));
assert.deepEqual(changed, [], "Business source must remain unchanged");
assert.equal(summary.production.productionSourceFlag, false);
assert.deepEqual(summary.production.pilotMarkerHits, []);
