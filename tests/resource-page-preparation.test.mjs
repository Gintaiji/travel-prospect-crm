import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHookHarness, jsx, findNodes, text } from "./helpers/resourceHookHarness.mjs";

const fixtureResource = title => ({ id: "original", title, type: "Site", url: "https://example.test", notes: "notes", isFavorite: false,
  createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z" });
function compile(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, ...globals });
  return exports;
}
const preventDefault = () => {};
// Exercise the real page handlers and old resourceStorage in the disabled production path.
for (const isolated of [false, true]) {
  const h = createHookHarness();
  let stored = JSON.stringify([fixtureResource(isolated ? "Scoped original" : "Legacy original")]);
  let legacyReads = 0, legacyWrites = 0, isolatedWrites = 0;
  const timers = [];
  const localStorage = {
    getItem() { legacyReads++; if (isolated) throw new Error("No legacy fallback"); return stored; },
    setItem(_key, raw) { legacyWrites++; if (isolated) throw new Error("No legacy writes"); stored = raw; },
  };
  const legacy = compile("app/lib/resourceStorage.ts", { "./localChangeTracker": { markLocalDataChanged() {} } }, {
    window: {}, localStorage, crypto: { randomUUID: () => "created" },
  });
  const scoped = {
    status: "available", resources: [fixtureResource("Scoped original")],
    save(resources) { isolatedWrites++; stored = JSON.stringify(resources); },
    assertCurrent() {}, isCurrent: () => true,
  };
  const pageModule = compile("app/ressources/page.tsx", {
    react: h.react, "react/jsx-runtime": jsx,
    "../lib/resourceStorage": legacy,
    "../lib/types": { RESOURCE_TYPES: ["Site", "Document"] },
    "../lib/resourceIsolationSettings": { ACCOUNT_SCOPED_RESOURCES_ENABLED: isolated },
    "../hooks/usePreparedResources": { usePreparedResources() {
      assert.equal(isolated, true); return { state: scoped, reload() {} };
    } },
    "../components/UserSessionProvider": { AccountSessionBoundary: "boundary" },
    "../components/PreparedResourceViews": { ResourceAccessNotice: "notice" },
  }, { window: { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}, confirm: () => true } });
  let element = pageModule.default();
  if (isolated) element = element.type(element.props).props.children;
  const render = () => h.render(() => element.type(element.props));
  let tree = render(); h.effects(); timers.splice(0).forEach(fn => fn()); tree = render();
  assert.equal(findNodes(tree, n => n.type === "article").length, 1);
  assert.ok(text(tree).includes(isolated ? "Scoped original" : "Legacy original"));

  // Create through form inputs, preserving the existing resource structure.
  let createForm = findNodes(tree, n => n.type === "form")[0];
  let inputs = findNodes(createForm, n => n.type === "input");
  inputs[0].props.onChange({ target: { value: "New resource" } });
  inputs[2].props.onChange({ target: { value: "https://example.test/new" } });
  tree = render(); createForm = findNodes(tree, n => n.type === "form")[0];
  createForm.props.onSubmit({ preventDefault }); tree = render();
  assert.equal(JSON.parse(stored).length, 2);
  assert.equal(JSON.parse(stored)[0].title, "New resource");

  // Edit the new resource through the existing edit form.
  let card = findNodes(tree, n => n.type === "article" && n.key === "created")[0];
  findNodes(card, n => n.type === "button" && text(n) === "Modifier")[0].props.onClick();
  tree = render();
  let editForm = findNodes(tree, n => n.type === "form")[1];
  findNodes(editForm, n => n.type === "input")[0].props.onChange({ target: { value: "Edited resource" } });
  tree = render(); editForm = findNodes(tree, n => n.type === "form")[1];
  editForm.props.onSubmit({ preventDefault }); tree = render();
  assert.equal(JSON.parse(stored).find(r => r.id === "created").title, "Edited resource");

  // Search still filters resource cards, with no storage writes.
  const search = findNodes(tree, n => n.type === "input" && n.props.placeholder?.startsWith("Titre, type"))[0];
  search.props.onChange({ target: { value: "Edited resource" } }); tree = render();
  assert.equal(findNodes(tree, n => n.type === "article").length, 1);
  findNodes(tree, n => n.type === "input" && n.props.placeholder?.startsWith("Titre, type"))[0].props.onChange({ target: { value: "" } });
  tree = render();
  card = findNodes(tree, n => n.type === "article" && n.key === "created")[0];
  findNodes(card, n => n.type === "button" && text(n) === "Supprimer")[0].props.onClick(); tree = render();
  assert.equal(JSON.parse(stored).length, 1);
  assert.equal(JSON.parse(stored)[0].id, "original");
  if (isolated) { assert.equal(legacyReads, 0); assert.equal(legacyWrites, 0); assert.equal(isolatedWrites, 3); }
  else { assert.equal(legacyReads, 1); assert.equal(legacyWrites, 3); assert.equal(isolatedWrites, 0); }
  h.unmount();
}

// The prospect-facing isolated view is read-only and ignores clipboard completions
// from an invalidated owner. It imports no prospect storage/history writer.
{
  const h = createHookHarness();
  let valid = true, finishCopy;
  const access = { status: "available", resources: [fixtureResource("Private resource")],
    assertCurrent() { if (!valid) throw new Error("stale"); }, isCurrent: () => valid };
  const views = compile("app/components/PreparedResourceViews.tsx", {
    react: h.react, "react/jsx-runtime": jsx,
    "./UserSessionProvider": { AccountSessionBoundary: "boundary" },
    "../hooks/usePreparedResources": { usePreparedResources: () => ({ state: access }) },
  }, { navigator: { clipboard: { writeText: () => new Promise(resolve => { finishCopy = resolve; }) } } });
  const boundary = views.IsolatedProspectResources({ message: "message" });
  const content = boundary.props.children;
  const available = content.type(content.props);
  const render = () => h.render(() => available.type(available.props));
  let tree = render(); h.effects();
  findNodes(tree, n => n.type === "select")[0].props.onChange({ target: { value: "original" } });
  tree = render();
  findNodes(tree, n => n.type === "button" && text(n) === "Copier le lien")[0].props.onClick();
  valid = false; finishCopy();
  let blockedLink = false;
  findNodes(tree, n => n.type === "a")[0].props.onClick({ preventDefault() { blockedLink = true; } });
  assert.equal(blockedLink, true);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  tree = render(); assert.equal(text(tree).includes("Copié."), false);
  assert.equal(findNodes(tree, n => n.type === "button" && text(n).includes("historique")).length, 0);
  h.unmount();
}
console.log("PASS: resource page create/edit/delete/search in both modes, legacy path unchanged, isolated prospect resource reader ignores stale completion.");
