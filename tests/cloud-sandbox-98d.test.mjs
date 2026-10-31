import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createTsLoader } from "./helpers/loadTs.mjs";
import { IMAGE, DATABASE, LABEL, createSandboxPlan, containerArguments, dockerEnvironment,
  assertSandboxIdentity, refuseNetworkTarget, executeSandbox } from "./cloud-98d/sandbox.mjs";

const imageId = `sha256:${"a".repeat(64)}`, containerId = "b".repeat(64);
function info(plan, running = false) {
  return { Id: containerId, Name: `/${plan.name}`, Image: imageId, Config: {
    Labels: { [LABEL]: plan.nonce }, Env: [`POSTGRES_DB=${DATABASE}`],
  }, HostConfig: { NetworkMode: "none", Privileged: false, PortBindings: {}, Tmpfs: { "/var/lib/postgresql/data": "rw" } },
  NetworkSettings: { Ports: {} }, Mounts: [], State: { Running: running } };
}
function mockDocker({ mutate, failSql, interrupt, stage } = {}) {
  let plan, current, sqlCalls = 0;
  const calls = [];
  const docker = async (args, input) => {
    calls.push({ args, input });
    switch (args[0]) {
      case "version": return "fictional-daemon";
      case "image": assert.equal(args[2], IMAGE); return JSON.stringify([{ Id: imageId }]);
      case "create": {
        const label = args[args.indexOf("--label") + 1];
        plan = createSandboxPlan(label.slice(LABEL.length + 1)); current = info(plan);
        return containerId;
      }
      case "inspect": {
        const value = structuredClone(current); mutate?.(value, sqlCalls); return JSON.stringify([value]);
      }
      case "start": current.State.Running = true; return "started";
      case "stop": current.State.Running = false; return "stopped";
      case "exec":
        if (args.includes("pg_isready")) return "ready";
        sqlCalls++;
        if (input.includes("current_database")) return DATABASE;
        if (input === "SCHEMA") {
          if (failSql) throw Error("fictional SQL failure");
          interrupt?.(); return "COMMIT";
        }
        if (input === "ASSERTIONS") return "ROLLBACK\n98D_SQL_ASSERTIONS_PASSED";
        assert.fail("unexpected SQL"); break;
      default: assert.fail("unexpected Docker command");
    }
  };
  return { calls, docker, onStage: stage };
}

test("98D: no HTTP/TCP target can bypass the network refusal, including localhost", () => {
  for (const target of [undefined, "https://project.supabase.co", "https://project.supabase.co.evil.invalid", "http://127.0.0.1:54321", "http://localhost", "http://2130706433", "postgres://user:pass@127.0.0.1/db", "http://[::1]", "file:///tmp/test"]) {
    assert.throws(() => refuseNetworkTarget(target), /forbidden/);
  }
  const env = dockerEnvironment({ PATH: "fictional-path", DOCKER_HOST: "tcp://prod:2375", DOCKER_CONTEXT: "prod",
    DATABASE_URL: "production", NEXT_PUBLIC_SUPABASE_URL: "production", HTTP_PROXY: "production", DOCKER_TLS_VERIFY: "1" });
  assert.match(env.DOCKER_HOST, /^(unix:|npipe:)/);
  for (const key of ["DOCKER_CONTEXT", "DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "HTTP_PROXY", "DOCKER_TLS_VERIFY"]) assert.equal(key in env, false);
});

test("98D: only fresh nonce-bound container with no network/ports/bind mounts is accepted", () => {
  const plan = createSandboxPlan(); assertSandboxIdentity(info(plan), plan, containerId, imageId, false);
  for (const mutate of [v => { v.Id = "c".repeat(64); }, v => { v.Name = "/existing"; }, v => { v.Image = "other"; },
    v => { v.Config.Labels[LABEL] = "other"; }, v => { v.HostConfig.NetworkMode = "bridge"; },
    v => { v.HostConfig.Privileged = true; }, v => { v.HostConfig.PortBindings = { "5432/tcp": [{}] }; },
    v => { v.NetworkSettings.Ports = { "5432/tcp": [{}] }; }, v => { v.Config.Env = []; },
    v => { v.Mounts = [{ Type: "bind", Source: "real-data" }]; }, v => { delete v.Mounts; },
    v => { v.HostConfig.Tmpfs = {}; }, v => { v.State.Running = true; },
    v => { delete v.HostConfig.PortBindings; }, v => { delete v.NetworkSettings.Ports; }]) {
    const value = info(plan); mutate(value);
    assert.throws(() => assertSandboxIdentity(value, plan, containerId, imageId, false), /refused/);
  }
  assert.throws(() => createSandboxPlan("existing; command"));
  const args = containerArguments(plan, imageId, "c".repeat(64));
  assert.ok(args.includes("--pull=never")); assert.ok(args.includes("none")); assert.ok(!args.includes("--publish"));
});

test("98D: executable lifecycle verifies identity before each SQL, stops and retains only its own sandbox", async () => {
  const stages = [], mock = mockDocker();
  const result = await executeSandbox({ ...mock, schema: "SCHEMA", assertions: "ASSERTIONS", onStage: v => stages.push(v) });
  assert.equal(result.status, "passed");
  assert.deepEqual(stages, ["sandbox-started", "schema-applied", "sql-assertions-passed", "sandbox-stopped-retained"]);
  for (let i = 0; i < mock.calls.length; i++) {
    if (mock.calls[i].args.includes("psql")) assert.equal(mock.calls[i - 1].args[0], "inspect");
    assert.ok(!mock.calls[i].args.includes("rm")); assert.ok(!mock.calls[i].args.includes("pull"));
  }
});

test("98D: missing tooling fails before creating a container or running SQL", async () => {
  const calls = [];
  await assert.rejects(executeSandbox({ docker: async args => { calls.push(args); throw Error("missing docker"); }, schema: "SCHEMA", assertions: "ASSERTIONS" }), /missing docker/);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "version");
});

test("98D: missing local image and false SQL success are refused, without fallback", async () => {
  const mock = mockDocker();
  await assert.rejects(executeSandbox({ docker: (args, ...rest) => args[0] === "image" ? Promise.resolve("[]") : mock.docker(args, ...rest),
    schema: "SCHEMA", assertions: "ASSERTIONS" }), /image unavailable/);
  assert.ok(!mock.calls.some(call => call.args[0] === "create"));
  const noProof = mockDocker();
  await assert.rejects(executeSandbox({ docker: (args, input, ...rest) => input === "ASSERTIONS" ? Promise.resolve("partial") : noProof.docker(args, input, ...rest),
    schema: "SCHEMA", assertions: "ASSERTIONS" }), /missing SQL proof/);
  assert.equal(noProof.calls.at(-1).args[0], "stop");
});

test("98D: the real CLI rejects any supplied endpoint before accessing the environment", () => {
  const result = spawnSync(process.execPath, ["tests/cloud-98d/run.mjs", "https://production.supabase.co"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no host\/URL\/options accepted/);
  assert.ok(!result.stdout.includes("sandbox-started"));
});

test("98D: failure or interruption never continues to assertions; cleanup is revalidated", async () => {
  for (const interruption of [false, true]) {
    const controller = new AbortController();
    const mock = mockDocker({ failSql: !interruption, interrupt: interruption ? () => controller.abort() : undefined });
    await assert.rejects(executeSandbox({ ...mock, schema: "SCHEMA", assertions: "ASSERTIONS", signal: controller.signal }));
    assert.ok(!mock.calls.some(call => call.input === "ASSERTIONS"));
    assert.equal(mock.calls.at(-1).args[0], "stop");
    assert.equal(mock.calls.at(-2).args[0], "inspect");
  }
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(executeSandbox({ docker: async () => { calls++; }, signal: controller.signal }), /interrupted/);
  assert.equal(calls, 0);
});

test("98D: changed sandbox identity blocks SQL and also blocks destructive cleanup", async () => {
  const mock = mockDocker({ mutate: (value, sqlCalls) => { if (sqlCalls >= 1) value.HostConfig.NetworkMode = "bridge"; } });
  await assert.rejects(executeSandbox({ ...mock, schema: "SCHEMA", assertions: "ASSERTIONS" }), /refused/);
  assert.ok(!mock.calls.some(call => call.input === "SCHEMA" || call.input === "ASSERTIONS"));
  assert.ok(!mock.calls.some(call => call.args[0] === "stop"));
});

test("98D: synthetic fixtures reuse 98C contracts; SQL files are transaction-scoped without RPC", () => {
  const load = createTsLoader();
  const { parseCloudRevision, inspectSnapshotEnvelope } = load("app/lib/cloudSnapshotContract.ts");
  const { readLegacyCloudDiagnostic, LEGACY_DIAGNOSTIC_KEYS } = load("app/lib/cloudRawDiagnostics.ts");
  const data = { prospects: [{ id: "same-id", notes: "fiction", conversationHistory: [] }], resources: [{ id: "same-id" }],
    settings: { businessName: "fiction" }, "custom-message-templates": { fiction: "message fictif" },
    "street-marketing-survey": { surveys: [], activeSurveyId: "" } };
  const raw = new Map(Object.entries(data).map(([name, value]) => [LEGACY_DIAGNOSTIC_KEYS[name], JSON.stringify(value)]));
  const saved = [...raw];
  const result = readLegacyCloudDiagnostic({ getItem: key => raw.get(key) ?? null });
  assert.equal(result.syncEligible, false); assert.deepEqual([...raw], saved);
  const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const envelope = { schemaVersion: 1, ownerUserId: owner, revision: parseCloudRevision("9007199254740993"), fingerprint: "a".repeat(64), serverTimestamp: "2026-10-31T00:00:00.000Z", data };
  assert.equal(inspectSnapshotEnvelope(envelope, owner).revision, "9007199254740993");
  assert.throws(() => inspectSnapshotEnvelope(envelope, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
  assert.throws(() => parseCloudRevision(null));
  const schema = fs.readFileSync("supabase/98d/schema.sql", "utf8"), assertions = fs.readFileSync("supabase/98d/assertions.sql", "utf8");
  assert.match(schema, /BEGIN;/); assert.match(schema, /COMMIT;/); assert.match(assertions, /ROLLBACK;/);
  assert.ok(!/CREATE (OR REPLACE )?FUNCTION|DROP TABLE|TRUNCATE/i.test(schema));
  assert.ok(!schema.includes("commit_account_snapshot"));
});
