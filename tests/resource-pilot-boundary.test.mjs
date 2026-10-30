import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createTsLoader } from "./helpers/loadTs.mjs";

const load = createTsLoader();
assert.equal(load("app/lib/resourceIsolationSettings.ts").ACCOUNT_SCOPED_RESOURCES_ENABLED, false);
assert.equal(load("app/lib/resourceBackupJson.ts").RESOURCE_JSON_REPLACEMENT_ENABLED, false);
assert.equal(load("app/lib/resourceBackupJson.ts").MANUAL_RESOURCE_RECOVERY_ENABLED, false);
assert.equal(load("app/lib/cloudSyncSuspension.ts").CLOUD_SYNC_SUSPENDED, true);
const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
  import assert from 'node:assert/strict';
  import { startResourceChainServer } from './tests/browser/resource-chain-server.mjs';
  await assert.rejects(startResourceChainServer({pilot:true,jsonReplacement:true}), /forbidden in production/);
  await assert.rejects(startResourceChainServer(), /forbidden in production/);
`], { encoding: "utf8", timeout: 10000, windowsHide: true, env: { ...process.env, NODE_ENV: "production" } });
assert.equal(result.status, 0, result.stderr || result.error?.message);
console.log("PASS: production switches remain off, cloud remains suspended, standalone recipe/pilot refuses NODE_ENV=production before loading application modules.");
