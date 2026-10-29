import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToString } from "react-dom/server";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let state = { status: "connected", userId: A, generation: 1 };
const captures = [];
let starts = 0;
const store = {
  getSnapshot: () => state,
  getServerSnapshot: () => ({ status: "loading", userId: null, generation: 0 }),
  subscribe: () => () => {},
  start() { starts++; return () => {}; },
  refresh() {},
  beginOperation(capture) {
    captures.push(capture);
    if (capture.generation !== state.generation || capture.userId !== state.userId) throw new Error("stale");
    return Promise.resolve({});
  },
};
const code = ts.transpileModule(fs.readFileSync("app/components/UserSessionProvider.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function load(react, jsx) {
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "../lib/userSessionStore") return { getUserSessionStore: () => store };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return exports;
}

// Real server rendering must never include an old browser identity or private subtree.
const actual = load(React, jsxRuntime);
const html = renderToString(React.createElement(actual.UserSessionProvider, null,
  React.createElement(actual.AccountSessionBoundary, { fallback: "session-loading" }, "private-prospects")));
assert.ok(html.includes("session-loading"));
assert.equal(html.includes("private-prospects"), false);
assert.equal(html.includes(A), false);
assert.equal(starts, 0, "server render must not start auth");

// Test the hook's captured generation and boundary branches with deterministic hooks.
const mock = load({
  createContext: () => ({}), Fragment: "fragment",
  useContext: () => store,
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useMemo: fn => fn(),
}, { jsx: (type, props, key) => ({ type, props, key }) });
const hookA = mock.useUserSession();
const boundaryA = mock.AccountSessionBoundary({ children: "A-memory" });
assert.equal(boundaryA.key, `${A}:1`);
state = { status: "disconnected", userId: null, generation: 2 };
assert.equal(mock.AccountSessionBoundary({ children: "A-memory", fallback: "signed-out" }), "signed-out");
state = { status: "connected", userId: B, generation: 3 };
const boundaryB = mock.AccountSessionBoundary({ children: "B-memory" });
assert.notEqual(boundaryA.key, boundaryB.key, "React must remount isolated memory for the new owner");
assert.throws(() => hookA.beginOperation(), /stale/);
assert.equal(captures[0].userId, A);
assert.equal(mock.useUserSession().userId, B);
state = { status: "error", userId: null, generation: 4 };
assert.equal(mock.AccountSessionBoundary({ children: "B-memory" }), null);
assert.throws(() => mock.useUserSession().beginOperation(), /confirmée/);
console.log("PASS: session context SSR privacy, boundary reset keys, disconnected/error fallback and captured hook generation.");
