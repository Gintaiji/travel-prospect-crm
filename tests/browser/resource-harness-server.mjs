import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomUUID } from "node:crypto";
import ts from "typescript";

// Standalone test server, NOT a Next route. No .env files, real SDK or account tokens.
export async function startResourceHarness() {
  const token = randomUUID();
  const prefix = `/resource-test/${token}/`;
  const root = path.resolve("app/lib");
  const allowed = new Set(["accountScopedStorage", "accountBusinessStorage", "resourceWriteCoordinator",
    "resourceAccess", "resourceBackupJson", "userSessionStore", "resourceIsolationSettings", "cloudSyncSuspension"]);
  const modules = new Map();
  function include(name) {
    if (modules.has(name)) return;
    if (name === "supabaseClient") {
      modules.set(name, 'exports.createBrowserSupabaseClient = () => { throw new Error("Real authentication forbidden in browser fixture"); };');
      return;
    }
    if (!allowed.has(name)) throw new Error(`Forbidden fixture dependency: ${name}`);
    const source = fs.readFileSync(path.join(root, `${name}.ts`), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    modules.set(name, compiled);
    for (const match of compiled.matchAll(/require\("\.\/([^\"]+)"\)/g)) include(match[1]);
    if (/require\("(?!\.\/)/.test(compiled)) throw new Error("External runtime dependency forbidden in fixture");
  }
  for (const name of allowed) include(name);
  const registry = [...modules].map(([name, code]) => `${JSON.stringify(name)}: function(exports, require) {\n${code}\n}`).join(",\n");
  const fixture = fs.readFileSync("tests/browser/resource-harness.mjs", "utf8");
  const bundle = `(() => { "use strict"; const modules = {${registry}}; const cache = {};
    function require(name) { name = name.replace(/^\\.\\//, ""); if (!modules[name]) throw new Error("Unknown module " + name);
      if (!cache[name]) { cache[name] = {}; modules[name](cache[name], require); } return cache[name]; }
    ${fixture}\n})();`;
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>CRM — fixture isolée</title>
    <h1>Recette Ressources — données fictives uniquement</h1><p id="session">Chargement</p>
    <p id="status" role="status">Prêt</p><button id="download">Télécharger la sauvegarde de test</button>
    <pre id="resources"></pre><script src="${prefix}fixture.js"></script></html>`;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'");
    if (url.pathname === prefix) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html);
    } else if (url.pathname === `${prefix}fixture.js`) {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }); response.end(bundle);
    } else { response.writeHead(404); response.end("Not a test route"); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, baseURL: `${origin}${prefix}`, token, close: () => new Promise(resolve => server.close(resolve)) };
}
