import fs from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { yauzl } = require("../../node_modules/playwright-core/lib/utilsBundle.js");
const source = "test-results/resource-browser-observed-race/trace.zip";
const hash = () => createHash("sha256").update(fs.readFileSync(source)).digest("hex");
const before = hash();
const entries = [];
const events = [];
await new Promise((resolve, reject) => yauzl.open(source, { lazyEntries: true }, (error, zip) => {
  if (error) return reject(error);
  zip.on("entry", entry => {
    entries.push({ name: entry.fileName, size: entry.uncompressedSize });
    if (!entry.fileName.endsWith(".trace")) { zip.readEntry(); return; }
    zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = [];
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => {
        for (const line of Buffer.concat(chunks).toString("utf8").split("\n")) {
          if (!line) continue;
          const event = JSON.parse(line);
          // No DOM snapshots, contents, cookies, tokens or raw expression payloads.
          if (event.type === "before" && /evaluate|expect/.test(event.method ?? "")) {
            const serialized = JSON.stringify(event.params ?? {});
            const method = ["pendingLocks", "releaseLock", "startSave", "job", "snapshot"].find(name => serialized.includes(`"${name}"`));
            if (method) events.push({ file: entry.fileName, type: event.type, callId: event.callId, time: event.startTime, method });
          }
          if (event.type === "after" && /Récupération nécessaire|Conflit Ressources/.test(JSON.stringify(event.result ?? event.error ?? {}))) {
            const text = JSON.stringify(event.result ?? event.error);
            events.push({ file: entry.fileName, type: event.type, callId: event.callId, time: event.endTime,
              reason: text.includes("Récupération nécessaire") ? "RECOVERY_REQUIRED" : "RESOURCE_CONFLICT" });
          }
        }
        zip.readEntry();
      });
    });
  });
  zip.on("error", reject); zip.on("end", resolve); zip.readEntry();
}));
if (hash() !== before) throw new Error("Original trace changed");
const result = { originalSha256: before, entries, timeline: events };
fs.mkdirSync("test-results/resource-diagnostic-97C-2B3D2", { recursive: true });
fs.writeFileSync("test-results/resource-diagnostic-97C-2B3D2/first-trace-summary.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
