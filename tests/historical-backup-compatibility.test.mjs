import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createHookHarness, jsx, findNodes, text } from "./helpers/resourceHookHarness.mjs";

function runtime(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require(name) { assert.ok(name.startsWith(".")); return runtime(path.join(path.dirname(file), name + ".ts")); },
  });
  return exports;
}
const resourceBackupJson = runtime("app/lib/resourceBackupJson.ts");
const settings = { userDisplayName: "", businessName: "CRM", clubName: "club", defaultCountry: "France", defaultRegion: "", defaultCity: "",
  defaultFollowUpDays: 3, defaultPresentationLink: "", messageSignature: "", publicWording: "voyage", updatedAt: "2026-10-29T10:00:00.000Z" };
const fixture = { appName: "Travel Prospect CRM", version: 4, exportedAt: settings.updatedAt,
  prospects: [{ id: "p", conversationHistory: [] }], resources: [{ id: "r", title: "Resource", type: "Site", url: "https://example.test", notes: "", isFavorite: false, createdAt: settings.updatedAt, updatedAt: settings.updatedAt }],
  settings, streetMarketingSurvey: { surveys: [], activeSurveyId: "" }, customMessageTemplates: { "follow-up-4-days": "Hello" } };
const plain = value => JSON.parse(JSON.stringify(value));

for (const isolated of [false, true]) {
  const h = createHookHarness();
  let stateIndex = 0, downloadedBlob, cloudRestores = 0, confirmations = 0;
  const writes = new Map();
  const values = [fixture.prospects, fixture.resources, fixture.settings, fixture.streetMarketingSurvey, fixture.customMessageTemplates];
  const source = fs.readFileSync("app/sauvegarde/page.tsx", "utf8");
  const dependencies = {};
  for (const match of source.matchAll(/from "([^\"]+)"/g)) dependencies[match[1]] = {};
  Object.assign(dependencies, {
    react: { ...h.react, useState(initial) { const i = stateIndex++; return h.react.useState(i < 5 ? values[i] : initial); } },
    "react/jsx-runtime": jsx,
    "next/link": { default: "a" },
    "../lib/cloudSyncSuspension": { CLOUD_SYNC_SUSPENDED: true, CLOUD_SYNC_SUSPENSION_MESSAGE: "suspended" },
    "../lib/cloudSync": { restoreCloudDataToLocal() { cloudRestores++; throw Error("Cloud restore must stay blocked"); } },
    "../lib/resourceIsolationSettings": { ACCOUNT_SCOPED_RESOURCES_ENABLED: isolated },
    "../lib/resourceBackupJson": resourceBackupJson,
    "../lib/backupReminderStorage": { saveLastBackupDate() {} },
    "../lib/cloudSyncSettingsStorage": { DEFAULT_CLOUD_SYNC_SETTINGS: { autoSyncEnabled: true, autoSyncDelaySeconds: 30, updatedAt: "" } },
    "../lib/settingsStorage": { DEFAULT_APP_SETTINGS: settings, saveSettings: value => writes.set("settings", value) },
    "../lib/prospectStorage": { saveProspects: value => writes.set("prospects", value) },
    "../lib/prospectUtils": { getTodayDateString: () => "2026-10-29" },
    "../lib/resourceStorage": { normalizeResources: resources => ({ resources }), saveResources: value => writes.set("resources", value) },
    "../lib/streetMarketingSurveyStorage": { loadStreetMarketingSurvey: () => fixture.streetMarketingSurvey, saveStreetMarketingSurvey: value => writes.set("streetMarketingSurvey", value) },
    "../lib/messageTemplateStorage": { normalizeCustomMessageTemplates: value => value, saveCustomMessageTemplates: value => writes.set("customMessageTemplates", value) },
    "../lib/supabaseClient": { isSupabaseConfigured: () => false },
  });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Blob, require(name) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
    URL: { createObjectURL(blob) { downloadedBlob = blob; return "blob:test"; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) },
    window: { confirm: () => { confirmations++; return true; } },
    FileReader: class { readAsText(file) { this.result = file.content; this.onload(); } },
  });
  const render = () => { stateIndex = 0; return h.render(() => exports.default()); };
  let tree = render();
  const cloudButtons = findNodes(tree, node => node.type === "button" && text(node) === "Charger depuis le cloud");
  assert.ok(cloudButtons.length > 0);
  for (const button of cloudButtons) {
    assert.equal(button.props.disabled, true);
    await button.props.onClick(); // Deliberate UI-handler bypass; still no confirmation or restore.
  }
  assert.equal(cloudRestores, 0);
  assert.equal(confirmations, 0);
  assert.equal(writes.size, 0);
  assert.ok(text(tree).includes("Restauration depuis le cloud indisponible"));
  const exportButton = findNodes(tree, node => node.type === "button" && text(node) === (isolated ? "Exporter l’historique partagé (non isolé)" : "Sauvegarder mes données"))[0];
  exportButton.props.onClick();
  const exported = JSON.parse(await downloadedBlob.text());
  for (const category of ["prospects", "resources", "settings", "streetMarketingSurvey", "customMessageTemplates"]) assert.deepEqual(exported[category], fixture[category]);
  assert.equal(Object.hasOwn(exported, "ownerUserId"), false);
  assert.equal(exported.storageScope, isolated ? "legacy-shared" : undefined);
  const fileInput = findNodes(tree, node => node.type === "input" && node.props.type === "file")[0];
  assert.equal(fileInput.props.disabled, isolated);
  const importFile = content => fileInput.props.onChange({ target: { files: [{ name: "backup.json", content: JSON.stringify(content) }], value: "file" } });
  importFile(fixture);
  if (isolated) assert.equal(writes.size, 0, "old importer cannot run in isolated mode");
  else {
    assert.equal(writes.size, 5);
    for (const [category, value] of writes) assert.deepEqual(plain(value), fixture[category]);
    writes.clear();
    importFile({ ...fixture, version: 5, storageScope: "account-resources", ownerUserId: "11111111-1111-4111-8111-111111111111" });
    assert.equal(writes.size, 0, "account files cannot be downgraded through old importer");
  }
  tree = render();
  assert.ok(text(tree).includes(isolated ? "chargement isolé" : "Fichier invalide"));
}
console.log("PASS: actual historical backup handlers preserve all five categories when off, label shared exports when on and refuse account files in the legacy importer.");
