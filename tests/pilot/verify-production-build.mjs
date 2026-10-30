import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

const source = fs.readFileSync("app/lib/resourceIsolationSettings.ts", "utf8");
const ast = ts.createSourceFile("resourceIsolationSettings.ts", source, ts.ScriptTarget.Latest, true);
let flagFalse = false;
function inspect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "ACCOUNT_SCOPED_RESOURCES_ENABLED") flagFalse = node.initializer?.kind === ts.SyntaxKind.FalseKeyword;
  ts.forEachChild(node, inspect);
}
inspect(ast); assert.equal(flagFalse, true, "Production source flag must remain a literal false");
// Inspect the fresh compiled server render, without starting authentication or accessing Supabase.
const html = fs.readFileSync(".next/server/app/ressources.html", "utf8");
const rendered = html.replace(/<script[\s\S]*?<\/script>/g, "");
assert.ok(rendered.includes("Ajouter la ressource"), "Compiled production route must render the disabled-isolation legacy branch");
assert.ok(!rendered.includes("Compte neuf sans données"), "Production must not render the pilot's isolated account notice");
const manifest = JSON.parse(fs.readFileSync(".next/server/app-paths-manifest.json", "utf8"));
assert.ok(Object.keys(manifest).every(route => !/pilot|resource-chain|resource-test/i.test(route)));
const markers = ["ResourcePilotShell", "Simulations réservées au pilote", "fictional-quota-filler", "chainRecipe", "resourceHarness", "tpc-chain:", "tpc-browser-test:"];
const hits = []; let scanned = 0;
function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) scan(file);
    else if (/\.(?:js|css|json|html|map)$/.test(file)) {
      scanned++; const text = fs.readFileSync(file, "utf8");
      for (const marker of markers) if (text.includes(marker)) hits.push({ file, marker });
    }
  }
}
scan(".next/server"); scan(".next/static"); assert.deepEqual(hits, [], "No pilot mechanism in production artifacts");
const result = { productionSourceFlag: false, compiledProductionLegacyBranch: true, sourceSha256: createHash("sha256").update(source).digest("hex"), renderedHtmlSha256: createHash("sha256").update(html).digest("hex"), scanned, pilotMarkerHits: hits, routes: Object.keys(manifest) };
fs.mkdirSync("test-results/resource-functional-pilot", { recursive: true });
fs.writeFileSync("test-results/resource-functional-pilot/production-build.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({ productionSourceFlag: false, compiledProductionLegacyBranch: true, scanned, pilotMarkerHits: hits }, null, 2));
