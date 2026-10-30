import { spawn } from "node:child_process";
import { once } from "node:events";

// Own one direct child, avoiding Windows shell/taskkill teardown of webServer.
// Production application code is served only on loopback; browser requests to
// every external origin are blocked before navigation by the test fixture.
export default async function setup() {
  const url = "http://127.0.0.1:31498/sauvegarde";
  if (await fetch(url).then(() => true, () => false)) throw Error("Recipe port already occupied; refusing to reuse it");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "31498"], {
    shell: false, windowsHide: true, stdio: "ignore",
  });
  let exited = false, failure;
  child.on("exit", () => { exited = true; });
  child.on("error", error => { failure = error; });
  async function close() {
    if (exited || !child.pid) return;
    const done = once(child, "exit");
    child.kill();
    let timer;
    try {
      await Promise.race([done, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Recipe server did not stop")), 5000); })]);
    } finally { clearTimeout(timer); }
  }
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (exited) throw Error("Recipe server exited before readiness");
      if (await fetch(url).then(r => r.ok, () => false)) return close;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error("Recipe server readiness timed out");
  } catch (error) { await close(); throw error; }
}
