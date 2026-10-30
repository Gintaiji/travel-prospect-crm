/* eslint-disable @typescript-eslint/no-require-imports -- Closed offline recipe loader. */
/* global require */
const React = require("react"), { createRoot } = require("react-dom/client");
const { createUserSessionStore } = require("app/lib/userSessionStore");
const { createResourceBackupJson } = require("app/lib/resourceBackupJson");
const { createResourceAccess } = require("app/lib/resourceAccess");
const { createResourceAccountInitialization } = require("app/lib/resourceAccountInitialization");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const namespace = new URL(location.href).searchParams.get("namespace");
if (!/^e2e-[a-z0-9-]+$/.test(namespace ?? "")) throw Error("Dedicated namespace required");
const prefix = `tpc-chain:${namespace}:`, nativeStorage = window.localStorage;
if (globalThis.ResourcePilotShell && Object.keys(nativeStorage).some(k => !k.startsWith(prefix))) throw Error("Pilot refuses a profile containing unrelated storage");
const events = [], listeners = new Set();
let fault = null, clockOffset = 0, quotaBytes = null, quotaAfterJournal = false;
const nativeUsageBytes = () => Object.keys(nativeStorage).reduce((sum, name) => sum + (name.length + nativeStorage.getItem(name).length) * 2, 0);
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
    const previous = nativeStorage.getItem(qualified);
    const projected = nativeUsageBytes() + (value.length - (previous?.length ?? 0) + (previous === null ? qualified.length : 0)) * 2;
    if (quotaBytes !== null && projected > quotaBytes) {
      events.push({ action: "quota-refusal", key, projectedBytes: projected, quotaBytes });
      throw new DOMException("Synthetic measured localStorage quota exceeded", "QuotaExceededError");
    }
    if (fault === "journal" && key.endsWith(":resource-import-journal")) throw Error("Synthetic quota failure at journal");
    if (fault === "verified" && key.endsWith(":resource-import-state") && JSON.parse(value).status === "verified") throw Error("Synthetic quota failure at verified");
    try { nativeStorage.setItem(qualified, value); }
    catch (error) { events.push({ action: "native-storage-refusal", key, projectedBytes: projected, candidateValueUtf16Bytes: value.length * 2, errorName: error.name }); throw error; }
    events.push({ action: "write", key });
    if (quotaAfterJournal && key.endsWith(":resource-import-journal")) {
      quotaBytes = nativeUsageBytes() + 1024; quotaAfterJournal = false;
      events.push({ action: "quota-armed-after-journal", quotaBytes });
    }
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
const quotaPreviews = new Map(), quotaLocks = new Map();
globalThis.chainRecipe = {
  store, A, B, events,
  flags: { isolated: require("app/lib/resourceIsolationSettings").ACCOUNT_SCOPED_RESOURCES_ENABLED, recovery: require("app/lib/resourceBackupJson").MANUAL_RESOURCE_RECOVERY_ENABLED, jsonReplacement: require("app/lib/resourceBackupJson").RESOURCE_JSON_REPLACEMENT_ENABLED, cloudSuspended: require("app/lib/cloudSyncSuspension").CLOUD_SYNC_SUSPENDED },
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
  storageUsage: () => ({ estimatedUtf16KeyValueBytes: nativeUsageBytes(), quotaBytes }),
  recoverySpace: () => ({ usedBytes: nativeUsageBytes(), availableBytes: Math.max(0, (quotaBytes ?? 4 * 1024 * 1024) - nativeUsageBytes()), source: "fictional measured quota budget" }),
  setQuota(bytes) { if (bytes !== null && (!Number.isSafeInteger(bytes) || bytes < 0)) throw Error("Invalid fictional quota"); quotaBytes = bytes; },
  quotaAfterJournal() { quotaAfterJournal = true; },
  async quotaPreview(name) { const p = await backup.previewRecovery(capture()); quotaPreviews.set(name, p); backup.verifyRecoverySafetyBackup(p, p.diagnosticJson); return p; },
  quotaExport(name, index = 0) { const p = quotaPreviews.get(name); return backup.exportRecoveryCopy(p, p.copies[index]); },
  quotaVerify(name, json, index = 0) { const p = quotaPreviews.get(name); return backup.verifyRecoveryCopyExport(p, p.copies[index], json); },
  quotaSpace(name) { const p = quotaPreviews.get(name); return backup.inspectRecoverySpace(p, p.copies[0]); },
  quotaApply(name) { const p = quotaPreviews.get(name); return backup.applyRecovery(p, p.copies[0], { ownerUserId: p.userId, previewReviewed: true, recoverExplicitly: true }); },
  async holdQuotaLock(name) {
    let entered, release;
    const ready = new Promise(resolve => { entered = resolve; });
    const held = navigator.locks.request(`travel-prospect-crm:resource-write:v1:${A}`, async () => { entered(); await new Promise(resolve => { release = resolve; }); });
    await ready; quotaLocks.set(name, { held, release });
  },
  async releaseQuotaLock(name) { const lock = quotaLocks.get(name); lock.release(); await lock.held; },
  corruptQuotaCopy() {
    const journalKey = prefix + key(A, "resource-import-journal"), entries = JSON.parse(nativeStorage.getItem(journalKey));
    entries.at(-1).beforeRaw = JSON.stringify([resource("corrupt-but-valid-json")]);
    nativeStorage.setItem(journalKey, JSON.stringify(entries));
  },
  saturateNativeQuota() {
    // Dedicated disposable profile, dedicated fictional key; never clear/delete existing values.
    const fillerKey = prefix + "fictional-quota-filler";
    let filler = "", refusals = 0;
    for (let step = 1024 * 1024; step >= 1; step = Math.floor(step / 2)) {
      while (true) {
        const next = filler + "x".repeat(step);
        if (next.length > 16 * 1024 * 1024) throw Error("Native quota not reached within the bounded fictional fill");
        try { nativeStorage.setItem(fillerKey, next); filler = next; }
        catch (error) { if (error.name !== "QuotaExceededError") throw error; refusals++; break; }
      }
    }
    return { refusals, errorName: "QuotaExceededError", fillerCharacters: filler.length, usageBytes: nativeUsageBytes() };
  },
  session: () => store.getSnapshot(),
  async exportJson() { return backup.exportResources(capture()); },
  async initialize() { return createResourceAccountInitialization({ enabled: true, store }).initialize(capture(), { ownerUserId: capture().userId, emptySpaceConfirmed: true }); },
  async importJson(json) {
    const p = await backup.preview(json, capture());
    backup.verifyImportSafetyBackup(p, p.safetyJson); // API-only fixture; actual file readback is covered by the UI recipe.
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
const pilotShell = globalThis.ResourcePilotShell ?? React.Fragment;
if (globalThis.ResourcePilotShell) {
  if (nativeStorage.length === 0) globalThis.chainRecipe.seed(false);
  else if (Object.keys(nativeStorage).some(k => !k.startsWith(prefix))) throw Error("Pilot refuses a profile containing unrelated storage");
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a");
    if (link?.getAttribute("href") === "/sauvegarde#local-migration-title") { event.preventDefault(); document.getElementById("migration").scrollIntoView(); }
  });
}
createRoot(document.getElementById("root")).render(React.createElement(pilotShell, null, React.createElement(UserSessionProvider, null,
  React.createElement("div", { id: "migration" }, React.createElement(Migration)),
  React.createElement("div", { id: "resource-page" }, React.createElement(Page)),
  React.createElement("div", { id: "backup" }, React.createElement(Backup)),
  React.createElement("div", { id: "prospect-resources" }, React.createElement(IsolatedProspectResources, { message: "FICTIONAL" })),
)));
document.documentElement.dataset.chainReady = "true";
