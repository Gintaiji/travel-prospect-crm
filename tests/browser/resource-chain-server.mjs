import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const resolve = createRequire(import.meta.url).resolve;
const allowed = new Set([
  "app/ressources/page", "app/components/UserSessionProvider", "app/components/PreparedResourceViews",
  "app/components/ResourceJsonBackupPanel", "app/components/ResourceManualRecoveryPanel", "app/components/LocalDataMigration",
  "app/components/ResourceAccountInitialization", "app/lib/resourceAccountInitialization",
  "app/hooks/usePreparedResources", "app/lib/accountScopedStorage", "app/lib/accountBusinessStorage",
  "app/lib/resourceAccess", "app/lib/resourceStorage", "app/lib/resourceValidation", "app/lib/resourceWriteCoordinator",
  "app/lib/resourceRecoverySpace", "app/lib/resourceArchiveIntegrity", "app/lib/resourceRecoveryAssessment", "app/lib/resourceBackupJson", "app/lib/legacyDataMigration", "app/lib/types",
  "app/lib/localChangeTracker", "app/lib/userSessionStore", "app/lib/cloudSyncSuspension", "app/lib/resourceIsolationSettings",
]);
// This server is never imported by Next. No environment files or real SDK are loaded.
export async function startResourceChainServer({ jsonReplacement = false } = {}) {
  const modules = new Map();
  function include(id) {
    if (modules.has(id)) return;
    if (id === "app/lib/supabaseClient") { modules.set(id, 'exports.createBrowserSupabaseClient = () => { throw Error("Production SDK forbidden"); };'); return; }
    if (id === "app/lib/resourceIsolationSettings") { modules.set(id, "exports.ACCOUNT_SCOPED_RESOURCES_ENABLED = true;"); return; }
    let source;
    if (["react", "react/jsx-runtime", "react-dom", "react-dom/client", "scheduler"].includes(id)) {
      const packageName = id.split("/")[0];
      const name = { react: "react", "react/jsx-runtime": "react-jsx-runtime", "react-dom": "react-dom", "react-dom/client": "react-dom-client", scheduler: "scheduler" }[id];
      source = fs.readFileSync(path.join(path.dirname(resolve(`${packageName}/package.json`)), "cjs", `${name}.development.js`), "utf8");
    } else {
      if (!allowed.has(id)) throw new Error(`Forbidden recipe dependency: ${id}`);
      const file = [id + ".ts", id + ".tsx"].find(file => fs.existsSync(file));
      source = fs.readFileSync(file, "utf8");
      if (id === "app/lib/resourceBackupJson") {
        const flag = "export const MANUAL_RESOURCE_RECOVERY_ENABLED: boolean = false;";
        if (!source.includes(flag)) throw new Error("Recovery flag source changed: audit fixture injection");
        source = source.replace(flag, "export const MANUAL_RESOURCE_RECOVERY_ENABLED: boolean = true;");
        if (jsonReplacement) {
          const replacementFlag = "export const RESOURCE_JSON_REPLACEMENT_ENABLED: boolean = false;";
          if (!source.includes(replacementFlag)) throw new Error("Replacement flag source changed: audit fixture injection");
          source = source.replace(replacementFlag, "export const RESOURCE_JSON_REPLACEMENT_ENABLED: boolean = true;");
        }
      }
      source = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
      if (id === "app/lib/resourceRecoverySpace") source += "\nexports.readBrowserRecoverySpace = () => globalThis.chainRecipe.recoverySpace();";
      if (id === "app/lib/userSessionStore") source += "\nexports.getUserSessionStore = () => globalThis.chainRecipe.store;";
    }
    modules.set(id, source);
    for (const match of source.matchAll(/require\(["']([^"']+)["']\)/g)) {
      include(match[1].startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(id), match[1])) : match[1]);
    }
  }
  for (const id of allowed) include(id);
  include("react-dom/client");
  const registry = [...modules].map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",\n");
  const entry = fs.readFileSync("tests/browser/resource-chain-harness.mjs", "utf8");
  const bundle = `(()=>{const process={env:{NODE_ENV:"development"}}; const registry={${registry}};const cache={};
    function load(id){if(!registry[id])throw Error('Forbidden module '+id);if(!cache[id]){const m={exports:{}};cache[id]=m;
      registry[id](m,m.exports,name=>{if(!name.startsWith('.'))return load(name);const parts=id.split('/');parts.pop();for(const p of name.split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p);}return load(parts.join('/'));});}return cache[id].exports;}
    const require=load;${entry}\n})();`;
  const prefix = `/resource-chain/${randomUUID()}/`;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'");
    if (url.pathname === prefix) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Recette CRM fictive</title><h1>Recette locale — comptes fictifs uniquement</h1><div id="root"></div><script src="bundle.js"></script></html>');
    } else if (url.pathname === prefix + "bundle.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(bundle); }
    else { response.writeHead(404); response.end("Not a recipe route"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, url: origin + prefix, close: () => new Promise(resolve => server.close(resolve)) };
}
