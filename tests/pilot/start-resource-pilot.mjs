import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { startResourceChainServer } from "../browser/resource-chain-server.mjs";

if (process.env.NODE_ENV === "production") throw Error("Pilot forbidden in production");
const profile = path.resolve("test-results/resource-functional-pilot", `profile-${randomUUID()}`);
fs.mkdirSync(profile, { recursive: true });
const server = await startResourceChainServer({ pilot: true, jsonReplacement: true });
const context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: !process.argv.includes("--headed"), acceptDownloads: true, serviceWorkers: "block" });
await context.route("**/*", route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
const page = context.pages()[0] ?? await context.newPage();
await page.goto(server.url);
console.log(`Fictional local pilot: ${server.url}\nNew dedicated profile: ${profile}\nCtrl+C to close. No production activation.`);
let closing = false;
async function close() { if (closing) return; closing = true; await context.close(); await server.close(); }
process.on("SIGINT", () => { void close(); });
process.on("SIGTERM", () => { void close(); });
context.on("close", () => { void close(); });
