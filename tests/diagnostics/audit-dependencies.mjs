import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

// Read-only npm commands only. No install, update, fix, or package/lockfile writes.
const output = path.resolve("test-results/resource-diagnostic-97C-2B3D2");
fs.mkdirSync(output, { recursive: true });
const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const watched = ["package.json", "package-lock.json", "app/lib/resourceIsolationSettings.ts", "app/lib/cloudSyncSuspension.ts",
  "test-results/resource-browser-observed-race/trace.zip", "test-results/resource-browser-observed-race/first-failure-results.json"];
const before = Object.fromEntries(watched.map(file => [file, sha(file)]));
const commands = [
  ["audit-all.json", ["audit", "--json"]],
  ["audit-production.json", ["audit", "--omit=dev", "--json"]],
  ["npm-ls-all.json", ["ls", "--all", "--json"]],
];
const results = [];
for (const [name, args] of commands) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    encoding: "utf8", shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(output, name), result.stdout ?? "");
  fs.writeFileSync(path.join(output, name + ".stderr.txt"), result.stderr ?? "");
  let json;
  try { json = JSON.parse(result.stdout); } catch { throw new Error(`Command did not return JSON: npm ${args.join(" ")}`); }
  if (json.error && args[0] === "audit") throw new Error(`Audit unavailable: ${json.error.code ?? "unknown"}`);
  results.push({ command: `npm ${args.join(" ")}`, exitCode: result.status, vulnerabilityCounts: json.metadata?.vulnerabilities });
}
const after = Object.fromEntries(watched.map(file => [file, sha(file)]));
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Protected input changed during read-only audit");
fs.writeFileSync(path.join(output, "audit-execution.json"), JSON.stringify({ date: new Date().toISOString(), before, after, results }, null, 2));
console.log(JSON.stringify(results, null, 2));
