import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = "test-results/resource-final-v2/node-repetitions";
fs.mkdirSync(dir, { recursive: true });
const results = [];
for (let round = 1; round <= 30; round++) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ["--test", "tests/resource-write-coordinator.test.mjs"], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const log = path.join(dir, `round-${round}.log`);
  fs.writeFileSync(log, (result.stdout ?? "") + (result.stderr ?? ""));
  results.push({ round, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, ms: Date.now() - started, log });
  if (round % 5 === 0 || result.status !== 0) console.log(`Node audit ${round}/30: ${result.status === 0 ? "PASS" : "FAIL"}`);
}
const summary = { node: process.version, versions: process.versions, runs: results.length, passed: results.filter(r => r.exitCode === 0).length, results };
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`Node audit complete: ${summary.passed}/${summary.runs}`);
process.exitCode = summary.passed === summary.runs ? 0 : 1;
