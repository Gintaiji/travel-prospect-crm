import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dockerEnvironment, executeSandbox } from "./sandbox.mjs";

const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

function docker(args, input, signal) {
  return new Promise((resolve, reject) => {
    const env = dockerEnvironment();
    const child = spawn("docker", ["--host", env.DOCKER_HOST, ...args], { shell: false, windowsHide: true, env,
      stdio: ["pipe", "pipe", "pipe"], signal, timeout: 15000 });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    // Do not log stderr/arguments: they may contain the one-run database secret.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.once("error", () => reject(Error("98D: local Docker unavailable or interrupted; network blocked")));
    child.once("exit", code => code === 0 ? resolve(output) : reject(Error("98D: local Docker command failed; no fallback")));
    child.stdin.end(input ?? "");
  });
}

try {
  if (process.argv.length !== 2) throw Error("98D: no host/URL/options accepted");
  const schema = await readFile(new URL("../../supabase/98d/schema.sql", import.meta.url), "utf8");
  const assertions = await readFile(new URL("../../supabase/98d/assertions.sql", import.meta.url), "utf8");
  const result = await executeSandbox({ docker, schema, assertions, signal: controller.signal,
    onStage: stage => console.log(`98D: ${stage}`) });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(`NO-GO 98E — ${error.message}`);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
