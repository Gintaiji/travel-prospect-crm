import { randomUUID } from "node:crypto";

export const IMAGE = "supabase/postgres:17.6.1.136";
export const DATABASE = "crm98d_fictional";
export const LABEL = "travel-prospect-crm.98d.nonce";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A caller cannot supply a host, URL, DSN, container name, or existing database. */
export function createSandboxPlan(nonce = randomUUID()) {
  if (!UUID.test(nonce)) throw Error("98D: invalid run identity");
  return Object.freeze({ nonce, name: `crm98d-${nonce}`, database: DATABASE, image: IMAGE });
}

/** Only a local Docker engine is allowed; ignore inherited contexts and TLS config. */
export function dockerEnvironment(env = process.env) {
  const clean = {};
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]) {
    if (env[name] !== undefined) clean[name] = env[name];
  }
  clean.DOCKER_HOST = process.platform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
  return clean;
}

export function containerArguments(plan, imageId, password) {
  if (!/^sha256:[0-9a-f]{64}$/.test(imageId) || !/^[0-9a-f]{64}$/.test(password)) throw Error("98D: invalid image or secret");
  return ["create", "--pull=never", "--name", plan.name, "--network", "none",
    "--label", `${LABEL}=${plan.nonce}`, "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=512m",
    "--env", `POSTGRES_PASSWORD=${password}`, "--env", `POSTGRES_DB=${DATABASE}`,
    "--env", "POSTGRES_HOST=/var/run/postgresql", "--env", "PGDATA=/var/lib/postgresql/data/pgdata",
    imageId];
}

/** Validate BEFORE any exec/start/stop; a label alone is not an identity proof. */
export function assertSandboxIdentity(info, plan, containerId, imageId, running) {
  if (typeof running !== "boolean" || !/^[0-9a-f]{64}$/.test(containerId) || info?.Id !== containerId || info.Name !== `/${plan.name}` ||
      info.Image !== imageId || info.Config?.Labels?.[LABEL] !== plan.nonce ||
      info.HostConfig?.NetworkMode !== "none" || info.HostConfig?.Privileged !== false ||
      !Object.hasOwn(info.HostConfig, "PortBindings") || !info.NetworkSettings || !Object.hasOwn(info.NetworkSettings, "Ports") ||
      Object.keys(info.HostConfig?.PortBindings ?? {}).length !== 0 ||
      Object.keys(info.NetworkSettings?.Ports ?? {}).some(key => info.NetworkSettings.Ports[key]?.length) ||
      info.State?.Running !== running ||
      !info.Config?.Env?.includes(`POSTGRES_DB=${DATABASE}`) ||
      !Array.isArray(info.Mounts) || info.Mounts.some(mount => mount.Type !== "tmpfs") ||
      !info.HostConfig?.Tmpfs?.["/var/lib/postgresql/data"]) {
    throw Error("98D: unverified sandbox; operation refused");
  }
}

/** There is no HTTP transport in 98D. A future transport must be added separately. */
export function refuseNetworkTarget() {
  throw Error("98D: HTTP/TCP/production connections forbidden; isolated Docker exec only");
}

/** Injected Docker commands make interruption/refusal testable without a daemon. */
export async function executeSandbox({ docker, schema, assertions, signal, onStage = () => {} }) {
  const plan = createSandboxPlan();
  let containerId, imageId;
  const checkAbort = () => { if (signal?.aborted) throw Error("98D: interrupted; no further SQL allowed"); };
  const command = async (args, input) => { checkAbort(); return docker(args, input, signal); };
  async function inspect(running) {
    const info = JSON.parse(await command(["inspect", containerId]));
    if (!Array.isArray(info) || info.length !== 1) throw Error("98D: ambiguous identity");
    assertSandboxIdentity(info[0], plan, containerId, imageId, running);
  }
  async function sql(input) {
    await inspect(true); checkAbort();
    return command(["exec", "-i", containerId, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
      "-h", "/var/run/postgresql", "-d", DATABASE], input);
  }
  try {
    // No pull, no external daemon, no connection string or .env read.
    await command(["version", "--format", "{{.Server.Version}}"]);
    const images = JSON.parse(await command(["image", "inspect", IMAGE]));
    imageId = images?.length === 1 ? images[0].Id : undefined;
    if (!/^sha256:[0-9a-f]{64}$/.test(imageId ?? "")) throw Error("98D: local pinned image unavailable");
    containerId = (await command(containerArguments(plan, imageId, randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "")))).trim();
    await inspect(false);
    await command(["start", containerId]);
    onStage("sandbox-started");
    // Readiness probe uses only the verified container's Unix socket.
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      await inspect(true);
      try { await command(["exec", containerId, "pg_isready", "-h", "/var/run/postgresql", "-U", "postgres", "-d", DATABASE]); ready = true; break; }
      catch (error) { checkAbort(); if (attempt === 119) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!ready) throw Error("98D: database not ready");
    const identity = (await sql("SELECT current_database();\n")).trim();
    if (identity !== DATABASE) throw Error("98D: database mismatch");
    // Schema itself asserts fresh public schema and the real Supabase auth objects.
    await sql(schema);
    onStage("schema-applied");
    const result = await sql(assertions);
    checkAbort();
    if (!result.includes("98D_SQL_ASSERTIONS_PASSED")) throw Error("98D: missing SQL proof");
    onStage("sql-assertions-passed");
    return { status: "passed", database: DATABASE, imageId, containerId };
  } finally {
    if (containerId && imageId) {
      // Cleanup is identity-checked again, even after abort. Never rm a volume,
      // reuse a name, force-delete, or touch a container with changed identity.
      const info = JSON.parse(await docker(["inspect", containerId]));
      if (!Array.isArray(info) || info.length !== 1) throw Error("98D: cleanup identity unavailable");
      assertSandboxIdentity(info[0], plan, containerId, imageId, info[0].State.Running);
      if (info[0].State.Running) await docker(["stop", "--time", "5", containerId]);
      onStage("sandbox-stopped-retained");
    }
  }
}
