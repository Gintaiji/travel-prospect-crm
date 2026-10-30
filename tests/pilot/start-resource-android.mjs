import { startResourceChainServer } from "../browser/resource-chain-server.mjs";

// Reuse the offline pilot unchanged. ADB forwards the phone's loopback port;
// never expose this server on a LAN interface or start the Next application.
const server = await startResourceChainServer({ pilot: true, jsonReplacement: true });
const port = new URL(server.origin).port;
console.log(`Pilote Android fictif (serveur loopback uniquement)
URL à ouvrir sur le téléphone : ${server.url}
Port : ${port}
Après appairage ADB, dans un second PowerShell :
adb -s SERIAL reverse --no-rebind tcp:${port} tcp:${port}
Conserver exactement 127.0.0.1 et le même port sur le téléphone.
Aucune authentification réelle. Ctrl+C pour arrêter.`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
}
process.on("SIGINT", () => { void close(); });
process.on("SIGTERM", () => { void close(); });
