import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHookHarness, jsx, findNodes, text } from "./helpers/resourceHookHarness.mjs";

const owner = "11111111-1111-4111-8111-111111111111";
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
function fixture(enabled, fail = false) {
  const h = createHookHarness(), exports = {};
  let applied = 0, savedVerified = false;
  const preview = { userId: owner, diagnosticJson: '{"fictional":"safety"}', copies: [{ operationId: "import-1", side: "beforeRaw", resources: [{ id: "r", title: "Fictional" }] }] };
  const api = {
    async previewRecovery() { return preview; },
    verifyRecoverySafetyBackup(_p, json) { if (json !== preview.diagnosticJson) throw new Error("different"); savedVerified = true; },
    async applyRecovery(p, selection, confirmation) {
      assert.equal(p, preview); assert.equal(selection, preview.copies[0]); assert.equal(savedVerified, true);
      assert.equal(confirmation.ownerUserId, owner); assert.equal(confirmation.previewReviewed, true); assert.equal(confirmation.recoverExplicitly, true);
      applied++; if (fail) throw new Error("interrupted"); return { resourcesCount: 1 };
    },
  };
  const dependencies = {
    react: h.react, "react/jsx-runtime": jsx,
    "./UserSessionProvider": { useUserSession: () => ({ userId: owner, generation: 1, store: { assertCurrent() {} } }) },
    "../lib/resourceIsolationSettings": { ACCOUNT_SCOPED_RESOURCES_ENABLED: true },
    "../lib/resourceBackupJson": { MANUAL_RESOURCE_RECOVERY_ENABLED: enabled, createResourceBackupJson: () => api },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/components/ResourceManualRecoveryPanel.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) { assert.ok(name in dependencies); return dependencies[name]; }, window: { confirm: () => true } });
  return { render: () => h.render(() => exports.default()), applied: () => applied, preview };
}
{
  const s = fixture(false), tree = s.render(); assert.match(text(tree), /désactivée/); assert.equal(findNodes(tree, n => n.type === "button").length, 0);
}
for (const fail of [false, true]) {
  const s = fixture(true, fail);
  const button = (tree, label) => findNodes(tree, n => n.type === "button" && text(n) === label)[0];
  button(s.render(), "Préparer un aperçu de récupération").props.onClick(); await settle();
  let tree = s.render(); assert.match(text(tree), /Fictional/);
  assert.equal(button(tree, "Récupérer les ressources de ce compte").props.disabled, true);
  const input = findNodes(tree, n => n.type === "input" && n.props.type === "file")[0];
  input.props.onChange({ target: { files: [{ text: async () => "bad" }], value: "file" } }); await settle();
  tree = s.render(); assert.match(text(tree), /non vérifiée/); assert.equal(button(tree, "Récupérer les ressources de ce compte").props.disabled, true);
  input.props.onChange({ target: { files: [{ text: async () => s.preview.diagnosticJson }], value: "file" } }); await settle();
  tree = s.render();
  findNodes(tree, n => n.type === "input" && !n.props.type)[0].props.onChange({ target: { value: owner } });
  for (const checkbox of findNodes(tree, n => n.type === "input" && n.props.type === "checkbox")) checkbox.props.onChange({ target: { checked: true } });
  tree = s.render(); assert.equal(button(tree, "Récupérer les ressources de ce compte").props.disabled, false);
  button(tree, "Récupérer les ressources de ce compte").props.onClick(); await settle();
  tree = s.render(); assert.equal(s.applied(), 1);
  assert.match(text(tree), fail ? /nouvelle intervention/ : /récupérée/);
  assert.equal(findNodes(tree, n => n.type === "input" && n.props.type === "file").length, 0);
}
console.log("PASS: manual recovery UI disabled by default, preview, safety file rejection/readback, explicit confirmation gates, verified success and failure requiring new diagnosis.");
