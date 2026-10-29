import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let now = 1_800_000_000_000, timerId = 0;
  const timers = new Map();
  let callback, user = null, unavailable = false;
  let subscriptions = 0, unsubscriptions = 0, userCalls = 0;
  const initial = deferred();
  let sessionRequest = () => initial.promise;
  let userRequest = async () => unavailable
    ? { data: { user: null }, error: new Error("network unavailable") }
    : { data: { user }, error: null };
  const auth = {
    getSession: () => sessionRequest(),
    getUser: () => { userCalls++; return userRequest(); },
    onAuthStateChange(fn) {
      subscriptions++; callback = fn;
      return { data: { subscription: { unsubscribe() { unsubscriptions++; } } } };
    },
  };
  const data = new Map([["travel-prospect-crm-prospects", "legacy-unchanged"]]);
  let storageWrites = 0;
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, {
      exports,
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; },
      clearTimeout(id) { timers.delete(id); },
      require(name) {
        if (name === "./supabaseClient") return { createBrowserSupabaseClient: () => ({ auth }) };
        assert.ok(name.startsWith("."), `Unexpected runtime dependency ${name}`);
        return load(path.resolve(path.dirname(file), name + ".ts"));
      },
    }, { filename: file });
    return exports;
  }
  const { createUserSessionStore } = load("app/lib/userSessionStore.ts");
  const dependencies = {
    getClient: () => ({ auth }), now: () => now,
    getStorage: () => ({
      getItem: key => data.get(key) ?? null,
      setItem(key, value) { storageWrites++; data.set(key, value); },
      removeItem() { throw new Error("Storage removal forbidden"); },
    }),
  };
  const store = createUserSessionStore(dependencies);
  function session(id, seconds = 60) {
    return { user: { id, email: `${id}@example.test` }, expires_at: now / 1000 + seconds, access_token: "fake-token" };
  }
  return {
    store, initial, data, dependencies, createUserSessionStore,
    counters: () => ({ subscriptions, unsubscriptions, userCalls, storageWrites }),
    snapshot: () => store.getSnapshot(),
    capture: () => ({ userId: store.getSnapshot().userId, generation: store.getSnapshot().generation }),
    setUserRequest(fn) { userRequest = fn; },
    setSessionRequest(fn) { sessionRequest = fn; },
    offline(value) { unavailable = value; },
    elapseWithoutTimers(ms) { now += ms; },
    emit(event, id, seconds) { user = id ? session(id, seconds).user : null; callback(event, id ? session(id, seconds) : null); },
    async tick(ms = 0) {
      now += ms;
      // Flush callbacks scheduled by resolved promises as well as timer callbacks.
      await flush();
      for (let count = 0; count < 100; count++) {
        const next = [...timers].find(([, timer]) => timer.at <= now);
        if (!next) break;
        timers.delete(next[0]); next[1].fn(); await flush();
      }
    },
    seed(id, prospectId) {
      data.set(`travel-prospect-crm:account:v1:${id}:migration-state`, JSON.stringify({
        userId: id, status: "verified", active: false, sourceFingerprint: "a".repeat(64),
        createdAt: "2026-10-29T10:00:00.000Z", verifiedAt: "2026-10-29T10:00:01.000Z",
      }));
      data.set(`travel-prospect-crm:account:v1:${id}:prospects`, JSON.stringify([{ id: prospectId }]));
    },
  };
}

// A -> logout -> B: reject stale reads, writes AND application of old UI results.
{
  const s = fixture(); s.seed(A, "prospect-A"); s.seed(B, "prospect-B");
  const before = [...s.data];
  const stop = s.store.start();
  assert.equal(s.snapshot().status, "loading");
  await assert.rejects(s.store.beginOperation({ userId: A, generation: 0 }));
  s.emit("SIGNED_IN", A);
  assert.equal(s.snapshot().userId, null, "event identity alone is not confirmed");
  assert.equal(s.counters().userCalls, 0, "never call auth.getUser inside auth callback");
  await s.tick();
  assert.equal(s.snapshot().status, "connected");
  assert.equal(s.snapshot().userId, A);
  const input = s.capture();
  const [operationA, parallelA] = await Promise.all([s.store.beginOperation(input), s.store.beginOperation(s.capture())]);
  assert.equal(operationA.owner, parallelA.owner, "parallel consumers share the validated owner");
  assert.equal(operationA.business.loadProspects().data[0].id, "prospect-A");
  s.emit("SIGNED_OUT", null);
  assert.equal(s.snapshot().status, "disconnected");
  assert.equal(s.snapshot().userId, null);
  assert.throws(() => operationA.business.loadProspects());
  assert.throws(() => operationA.business.saveProspects([]));
  let applied = false;
  assert.throws(() => operationA.commit(() => { applied = true; }));
  s.emit("SIGNED_IN", B); await s.tick();
  const operationB = await s.store.beginOperation(s.capture());
  assert.equal(operationB.business.loadProspects().data[0].id, "prospect-B");
  // Mutating a caller-owned capture cannot rebind an operation to B.
  Object.assign(input, s.capture());
  assert.throws(() => operationA.commit(() => { applied = true; }));
  assert.equal(applied, false);
  assert.deepEqual([...s.data], before);
  assert.equal(s.counters().storageWrites, 0);
  stop(); assert.throws(() => operationB.business.saveProspects([]));
}

// An initial lookup from A cannot revive A after logout/B login.
{
  const s = fixture(); const stop = s.store.start();
  s.emit("SIGNED_OUT", null);
  s.initial.resolve({ data: { session: { user: { id: A }, expires_at: 1_800_000_060 } }, error: null });
  await s.tick(); assert.equal(s.snapshot().status, "disconnected");
  s.emit("SIGNED_IN", B); await s.tick();
  assert.equal(s.snapshot().userId, B); stop();
}

// Old network validation and owner confirmation cannot succeed under a newer account.
{
  const s = fixture(); const stop = s.store.start();
  const pending = deferred(); s.setUserRequest(() => pending.promise);
  s.emit("SIGNED_IN", A); await s.tick();
  s.emit("SIGNED_IN", B);
  s.setUserRequest(async () => ({ data: { user: { id: B } }, error: null }));
  await s.tick();
  pending.resolve({ data: { user: { id: A } }, error: null });
  await s.tick(); assert.equal(s.snapshot().userId, B); stop();
}
{
  const s = fixture(); s.seed(A, "A"); const stop = s.store.start();
  s.emit("SIGNED_IN", A); await s.tick();
  const pending = deferred(); s.setUserRequest(() => pending.promise);
  const operation = s.store.beginOperation(s.capture());
  // Attach rejection handler before completing the old promise.
  const rejection = assert.rejects(operation);
  s.emit("SIGNED_IN", B);
  s.setUserRequest(async () => ({ data: { user: { id: B } }, error: null })); await s.tick();
  pending.resolve({ data: { user: { id: A } }, error: null });
  await rejection;
  assert.equal(s.snapshot().userId, B, "old failures must not disconnect B"); stop();
}

// Same-user reconnect and token refresh revoke previous generations as well.
{
  const s = fixture(); s.seed(A, "A"); const stop = s.store.start();
  s.emit("SIGNED_IN", A); await s.tick();
  const old = await s.store.beginOperation(s.capture());
  s.emit("SIGNED_OUT", null); s.emit("SIGNED_IN", A); await s.tick();
  assert.throws(() => old.assertCurrent());
  const renewed = await s.store.beginOperation(s.capture());
  s.emit("TOKEN_REFRESHED", A);
  assert.throws(() => renewed.business.saveProspects([]));
  await s.tick(); assert.equal(s.snapshot().userId, A); stop();
}

// A throttled background tab must refuse expired writes even before its timer runs.
{
  const s = fixture(); s.seed(A, "A"); const stop = s.store.start();
  s.emit("SIGNED_IN", A, 1); await s.tick();
  const op = await s.store.beginOperation(s.capture());
  const before = [...s.data];
  s.elapseWithoutTimers(1001);
  assert.throws(() => op.business.saveProspects([]));
  assert.equal(s.snapshot().userId, null);
  assert.deepEqual([...s.data], before); stop();
}

// An SDK that delivers INITIAL_SESSION synchronously still gets exactly one observer.
{
  const s = fixture();
  const auth = s.dependencies.getClient().auth;
  const subscribe = auth.onAuthStateChange;
  auth.onAuthStateChange = callback => {
    const subscription = subscribe(callback);
    s.emit("INITIAL_SESSION", A);
    return subscription;
  };
  s.setSessionRequest(() => { throw new Error("Redundant initial lookup"); });
  const stop = s.store.start(); await s.tick();
  assert.equal(s.snapshot().userId, A);
  assert.equal(s.counters().subscriptions, 1); stop();
}

// Expiry, absent session, unavailable auth, rejected network lookup and retry.
{
  const s = fixture(); const stop = s.store.start();
  s.emit("SIGNED_IN", A, -1);
  assert.equal(s.snapshot().status, "error"); assert.equal(s.snapshot().userId, null);
  s.emit("SIGNED_IN", A, 1); await s.tick();
  assert.equal(s.snapshot().status, "connected");
  const op = await s.store.beginOperation(s.capture());
  await s.tick(1001);
  assert.equal(s.snapshot().status, "error"); assert.equal(s.snapshot().userId, null);
  assert.throws(() => op.assertCurrent()); stop();
}
{
  const s = fixture(); const stop = s.store.start();
  s.initial.resolve({ data: { session: null }, error: null }); await s.tick();
  assert.equal(s.snapshot().status, "disconnected");
  s.offline(true); s.emit("SIGNED_IN", A); await s.tick();
  assert.equal(s.snapshot().status, "error"); assert.equal(s.snapshot().userId, null);
  s.offline(false); s.emit("SIGNED_IN", A); await s.tick();
  s.offline(true); await assert.rejects(s.store.beginOperation(s.capture()));
  assert.equal(s.snapshot().status, "error"); assert.equal(s.snapshot().userId, null);
  s.offline(false);
  s.setSessionRequest(async () => ({ data: { session: { user: { id: A }, expires_at: 1_800_000_060 } }, error: null }));
  await s.store.refresh(); await s.tick(); assert.equal(s.snapshot().status, "connected"); stop();
}
{
  const s = fixture(); const stop = s.store.start();
  s.initial.reject(new Error("network failed")); await s.tick();
  assert.equal(s.snapshot().status, "error"); assert.equal(s.snapshot().userId, null); stop();
}
{
  const s = fixture();
  const store = s.createUserSessionStore({ ...s.dependencies, getClient: () => null });
  const stop = store.start(); assert.equal(store.getSnapshot().status, "error");
  await assert.rejects(store.beginOperation({ userId: A, generation: store.getSnapshot().generation })); stop();
}

// One SDK subscription even with multiple providers; stop is idempotent and late callbacks ignored.
{
  const s = fixture();
  s.dependencies.getClient().auth.onAuthStateChange = () => { throw new Error("Observer unavailable"); };
  const stop = s.store.start();
  assert.equal(s.snapshot().status, "error");
  await s.store.refresh();
  assert.equal(s.snapshot().status, "error", "cannot confirm identity without a working auth observer");
  assert.equal(s.snapshot().userId, null); stop();
}
{
  const s = fixture();
  const stop1 = s.store.start(), stop2 = s.store.start();
  assert.equal(s.counters().subscriptions, 1);
  stop1(); stop1(); assert.equal(s.counters().unsubscriptions, 0);
  s.emit("SIGNED_IN", A); await s.tick(); assert.equal(s.snapshot().userId, A);
  stop2(); assert.equal(s.counters().unsubscriptions, 1);
  const generation = s.snapshot().generation;
  s.emit("SIGNED_IN", B); await s.tick(); assert.equal(s.snapshot().generation, generation);
  const stop3 = s.store.start(); assert.equal(s.counters().subscriptions, 2);
  s.emit("SIGNED_IN", B); await s.tick(); assert.equal(s.snapshot().userId, B); stop3();
}

// The existing client factory keeps one browser auth client and none on the server.
{
  const source = ts.transpileModule(fs.readFileSync("app/lib/supabaseClient.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let created = 0;
  const run = browser => {
    const exports = {};
    vm.runInNewContext(source, {
      exports, console,
      ...(browser ? { window: {} } : {}),
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-test-key" } },
      require(name) { assert.equal(name, "@supabase/supabase-js"); return { createClient() { created++; return { auth: {} }; } }; },
    });
    return exports;
  };
  const server = run(false); assert.equal(server.createBrowserSupabaseClient(), null); assert.equal(created, 0);
  const browser = run(true);
  assert.equal(browser.createBrowserSupabaseClient(), browser.createBrowserSupabaseClient());
  assert.equal(created, 1);
}
console.log("PASS: central sessions A/logout/B, stale async/UI results, expiry, network errors, retry, cleanup, shared subscription and browser client.");
