import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(process.env.CRM_RESOURCE_AUDIT_ROOT ?? "test-results/resource-final-v2");
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const before = read("source-before.json");
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const changed = Object.entries(before.files).filter(([file, hash]) => !fs.existsSync(file) || digest(file) !== hash).map(([file]) => file);
const wanted = new Set(["growth-measurements.json", "native-quota-saturation.json", "quota-read-only-export.json", "legacy-integrity-browser.json", "chain-evidence.json", "browser-evidence.json"]);
function collectRun(relative) {
  const result = read(relative), attachments = [], cases = [];
  function walk(v) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (v.title && v.tests) cases.push({ title: v.title, file: v.file, ok: v.ok,
      results: v.tests.flatMap(t => t.results.map(r => ({ status: r.status, retry: r.retry, errors: r.errors?.map(e => e.message) ?? [] }))) });
    if (wanted.has(v.name) && (v.body || v.path)) {
      let buffer;
      if (v.body) buffer = Buffer.from(v.body, "base64");
      else {
        const file = path.resolve(v.path);
        assert.ok(file.startsWith(root + path.sep), "Read only this audit's artifacts"); buffer = fs.readFileSync(file);
      }
      attachments.push({ name: v.name, data: JSON.parse(buffer.toString("utf8")) });
    }
    Object.values(v).forEach(walk);
  }
  walk(result);
  return { stats: result.stats, cases, attachments };
}
const full = collectRun("full/results.json");
const concurrency = fs.existsSync(path.join(root, "concurrency/results.json")) ? collectRun("concurrency/results.json") : null;
const markers = ["chainRecipe", "resourceHarness", "tpc-chain:", "tpc-browser-test:", "fictional-quota-filler", "D9 CRITICAL"];
const markerHits = []; let scanned = 0;
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(?:js|json|mjs|html|txt|map)$/.test(file)) {
      scanned++; const source = fs.readFileSync(file, "utf8");
      for (const marker of markers) if (source.includes(marker)) markerHits.push({ file, marker });
    }
  }
}
for (const dir of [".next/server", ".next/static"]) scan(dir);
const manifest = JSON.parse(fs.readFileSync(".next/server/app-paths-manifest.json", "utf8"));
const summary = { sourceUnchanged: changed.length === 0, sourceFiles: Object.keys(before.files).length, changed,
  build: { scanned, markerHits, appRoutes: Object.keys(manifest) },
  full, concurrency, node: read("node-repetitions/summary.json"), retention: read("retention.json"), legacyUnit: read("legacy-integrity-unit.json") };
fs.writeFileSync(path.join(root, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ sourceUnchanged: summary.sourceUnchanged, sourceFiles: summary.sourceFiles, build: summary.build, full: full.stats,
  concurrency: concurrency?.stats, node: { runs: summary.node.runs, passed: summary.node.passed },
  storage: full.attachments.filter(a => ["growth-measurements.json", "native-quota-saturation.json", "quota-read-only-export.json"].includes(a.name)).map(a => ({ name: a.name,
    data: a.name === "growth-measurements.json" ? { successes: a.data.successes, depth: a.data.maximumEmbeddedJournalDepth, rows: a.data.rows.map(r => ({ round: r.round, journal: r.journal.utf16ValueBytes, total: r.usage.estimatedUtf16KeyValueBytes, safety: r.safetyUtf8Bytes })) } : a.data })),
  retention: summary.retention.map(r => ({ noteCharacters: r.noteCharacters, successes: r.successfulReplacements, refused: r.refused, last: r.rows.at(-1) })), legacyUnit: { outcome: summary.legacyUnit.outcome, writes: summary.legacyUnit.writes } }, null, 2));
assert.equal(changed.length, 0, "Application/source must stay unchanged during audit");
assert.equal(markerHits.length, 0, "No test code in production build");
