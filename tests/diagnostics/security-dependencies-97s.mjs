import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw new Error("Use before or after");
const directory = path.resolve("test-results/security-97s", stage);
if (fs.existsSync(directory)) throw new Error("Evidence already exists; refusing overwrite");
fs.mkdirSync(directory, { recursive: true });
const hashes = {};
function inventory(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) inventory(file);
    else hashes[file.replaceAll("\\", "/")] = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  }
}
inventory("app"); inventory("public");
fs.writeFileSync(path.join(directory, "protected-hashes.json"), JSON.stringify(hashes, null, 2));
for (const file of ["package.json", "package-lock.json"]) fs.copyFileSync(file, path.join(directory, file));
const commands = [
  ["audit.json", ["audit", "--json"]],
  ["audit-production.json", ["audit", "--omit=dev", "--json"]],
  ["installed.json", ["ls", "--all", "--json"]],
  ["next-registry.json", ["view", "next@16.4.3", "version", "peerDependencies", "dependencies", "optionalDependencies", "engines", "--json"]],
  ["react-registry.json", ["view", "react@19.2.4", "version", "--json"]],
];
for (const [file, args] of commands) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    shell: process.platform === "win32", encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(directory, file), result.stdout ?? "");
  fs.writeFileSync(path.join(directory, file + ".stderr.txt"), result.stderr ?? "");
  const parsed = JSON.parse(result.stdout);
  if (parsed.error) throw new Error(`npm command unavailable: ${file}`);
  console.log(file, result.status, parsed.metadata?.vulnerabilities ?? "captured");
}
if (stage === "after") {
  const before = JSON.parse(fs.readFileSync("test-results/security-97s/before/protected-hashes.json"));
  if (JSON.stringify(hashes) !== JSON.stringify(before)) throw new Error("Application/public files changed");
  console.log("Application, PWA, session/migration and safety flags unchanged (SHA-256).");
}
