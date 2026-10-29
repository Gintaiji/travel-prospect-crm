import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

/** Cached real TS module graph; every store remains an injected, in-memory Map. */
export function createTsLoader(globals = {}) {
  const cache = new Map();
  return function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {}; cache.set(absolute, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, {
      exports, crypto: webcrypto, TextEncoder, navigator: globalThis.navigator,
      ...globals,
      require(name) {
        assert.ok(name.startsWith("."), `Unexpected external dependency ${name}`);
        return load(path.join(path.dirname(absolute), name + ".ts"));
      },
    }, { filename: absolute });
    return exports;
  };
}
