/* eslint-disable @typescript-eslint/no-require-imports -- Closed offline recipe loader. */
/* global require */
const React = require("react"), { createRoot } = require("react-dom/client");
const { createUserSessionStore } = require("app/lib/userSessionStore");
const { createResourceBackupJson } = require("app/lib/resourceBackupJson");
const { createResourceAccess } = require("app/lib/resourceAccess");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const namespace = new URL(location.href).searchParams.get("namespace");
if (!/^e2e-[a-z0-9-]+$/.test(namespace ?? "")) throw Error("Dedicated namespace required");
const prefix = `tpc-chain:${namespace}:`, nativeStorage = window.localStorage;
const events = [], listeners = new Set();
let fault = null, clockOffset = 0;
const validKey = key => {
  if (![A, B].some(id => key.startsWith(`travel-prospect-crm:account:v1:${id}:`)) &&
    !["fake-auth", "travel-prospect-crm-resources", "travel-prospect-crm-prospects", "travel-prospect-crm-settings", "travel-prospect-crm-street-marketing-survey", "travel-prospect-crm-custom-message-templates", "travel-prospect-crm:legacy-migration:v1"].includes(key)) throw Error(`Recipe key forbidden: ${key}`);
  return prefix + key;
};
const storage = {
  getItem(key) {
    const qualified = validKey(key); events.push({ action: "read", key });
    if (fault === "read" && key.endsWith(":resource-import-state")) throw Error("Synthetic read failure");
    return nativeStorage.getItem(qualified);
  },
  setItem(key, value) {
    const qualified = validKey(key);
    if (fault === "verified" && key.endsWith(":resource-import-state") && JSON.parse(value).status === "verified") throw Error("Synthetic quota failure at verified");
    nativeStorage.setItem(qualified, value); events.push({ action: "write", key });
  },
  removeItem() { throw Error("Recipe deletion forbidden"); },
};
Object.defineProperty(window, "localStorage", { value: storage });
const fakeSession = () => {
  const userId = storage.getItem("fake-auth");
  return userId ? { user: { id: userId, email: "fictional@fake.invalid" }, expires_at: Math.floor(Date.now() / 1000) + 3600 } : null;
};
const auth = {
  async getSession() { return { data: { session: fakeSession() } }; },
  async getUser() { return { data: { user: fakeSession()?.user ?? null } }; },
  onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
};
window.addEventListener("storage", event => { if (event.key === prefix + "fake-auth") listeners.forEach(fn => fn("SIGNED_IN", fakeSession())); });
const store = createUserSessionStore({ getClient: () => ({ auth }), getStorage: () => storage, now: () => Date.now() + clockOffset });
const capture = () => { const s = store.getSnapshot(); return { userId: s.userId, generation: s.generation }; };
const backup = createResourceBackupJson({ enabled: true, store, replacementPolicy: "coordinated" });
const access = createResourceAccess({ isolated: true, sessionStore: store, legacy: { load() { throw Error("Legacy fallback"); }, save() { throw Error("Legacy write"); } } });
const key = (id, name) => `travel-prospect-crm:account:v1:${id}:${name}`;
const resource = id => ({ id, title: id, type: "Site", url: `https://example.invalid/${id}`, notes: "FICTITIOUS", isFavorite: false, createdAt: "2026-10-29", updatedAt: "2026-10-29" });
globalThis.chainRecipe = {
  store, A, B, events,
  flags: { isolated: require("app/lib/resourceIsolationSettings").ACCOUNT_SCOPED_RESOURCES_ENABLED, recovery: require("app/lib/resourceBackupJson").MANUAL_RESOURCE_RECOVERY_ENABLED, cloudSuspended: require("app/lib/cloudSyncSuspension").CLOUD_SYNC_SUSPENDED },
  seed(prepareB = true, absentB = false) {
    if (nativeStorage.length) throw Error("Recipe requires an empty browser profile");
    // Synthetic legacy set is attributed manually to A; B starts with a separate, verified empty fixture destination.
    storage.setItem("travel-prospect-crm-resources", JSON.stringify([resource("A-legacy")]));
    storage.setItem("travel-prospect-crm-prospects", "[]");
    if (prepareB) {
      storage.setItem(key(B, "migration-state"), JSON.stringify({ userId: B, status: "verified", active: false, createdAt: "2026-10-29", verifiedAt: "2026-10-29", sourceFingerprint: "b".repeat(64) }));
      if (!absentB) storage.setItem(key(B, "resources"), "[]");
    }
  },
  signIn(id) {
    if (![A, B, null].includes(id)) throw Error("Real account forbidden");
    storage.setItem("fake-auth", id ?? ""); listeners.forEach(fn => fn(id ? "SIGNED_IN" : "SIGNED_OUT", fakeSession()));
  },
  snapshot: () => Object.fromEntries(Object.keys(nativeStorage).sort().map(k => [k.slice(prefix.length), nativeStorage.getItem(k)])),
  physicalKeys: () => Object.keys(nativeStorage),
  session: () => store.getSnapshot(),
  async exportJson() { return backup.exportResources(capture()); },
  async importJson(json) {
    const p = await backup.preview(json, capture());
    // API policy activation is explicit in this fixture. UI replacement remains blocked by default.
    return backup.apply(p, { ownerUserId: p.userId, ownershipCertain: true, legacyOwnershipVerified: false, previewReviewed: true, safetyBackupSaved: true, replaceExisting: true });
  },
  async staleHandle() {
    const old = await access.load(capture());
    globalThis.chainRecipe.saveStale = () => old.save([resource("stale-forbidden")]);
  },
  fault(value) { fault = value; },
  expire() { clockOffset = 7200000; try { store.assertCurrent(capture()); } catch { /* expected */ } },
};
const { UserSessionProvider } = require("app/components/UserSessionProvider");
const Page = require("app/ressources/page").default;
const Migration = require("app/components/LocalDataMigration").default;
const Backup = require("app/components/ResourceJsonBackupPanel").default;
const { IsolatedProspectResources } = require("app/components/PreparedResourceViews");
createRoot(document.getElementById("root")).render(React.createElement(UserSessionProvider, null,
  React.createElement("div", { id: "migration" }, React.createElement(Migration)),
  React.createElement("div", { id: "resource-page" }, React.createElement(Page)),
  React.createElement("div", { id: "backup" }, React.createElement(Backup)),
  React.createElement("div", { id: "prospect-resources" }, React.createElement(IsolatedProspectResources, { message: "FICTIONAL" })),
));
document.documentElement.dataset.chainReady = "true";
