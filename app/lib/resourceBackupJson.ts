import { assertResources } from "./resourceAccess";
import type { Resource } from "./types";
import type { SessionCapture, UserSessionStore } from "./userSessionStore";
import { coordinateResourceWrite, exportResourceRecoveryDiagnostic, type ResourceLockManager } from "./resourceWriteCoordinator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Do not let a new account file fall through the old five-category importer. */
export function isHistoricalBackup(value: unknown): boolean {
  return record(value) && value.appName === "Travel Prospect CRM" &&
    (value.storageScope === undefined || value.storageScope === "legacy-shared") &&
    !Object.hasOwn(value, "ownerUserId") && Array.isArray(value.prospects) && Array.isArray(value.resources);
}

export function parseResourceBackup(json: string) {
  const value: unknown = JSON.parse(json);
  if (!record(value) || value.appName !== "Travel Prospect CRM") throw new Error("Sauvegarde JSON inconnue.");
  let ownerUserId: string | null = null;
  if (value.storageScope === "account-resources") {
    if (value.version !== 5 || typeof value.ownerUserId !== "string" || !UUID.test(value.ownerUserId)) {
      throw new Error("Propriétaire de sauvegarde invalide.");
    }
    if (["prospects", "settings", "streetMarketingSurvey", "customMessageTemplates"].some(name => Object.hasOwn(value, name))) {
      throw new Error("Une sauvegarde Ressources isolée ne peut pas contenir les autres catégories partagées.");
    }
    ownerUserId = value.ownerUserId;
  } else if (!isHistoricalBackup(value) || (value.version !== undefined && ![1, 2, 3, 4].includes(Number(value.version)))) {
    throw new Error("Format ou périmètre de sauvegarde invalide.");
  }
  if (!Array.isArray(value.resources)) throw new Error("Ressources absentes de la sauvegarde.");
  assertResources(value.resources as Resource[]);
  // Keep the full parsed historical payload for compatibility/preview; import only resources.
  return { payload: value, ownerUserId, resources: value.resources as Resource[],
    categories: ["prospects", "resources", "settings", "streetMarketingSurvey", "customMessageTemplates"].filter(name => Object.hasOwn(value, name)) };
}

export type ResourceImportPreview = Readonly<{
  userId: string;
  sourceOwnerUserId: string | null;
  sourceCount: number;
  destinationCount: number | null;
  categories: readonly string[];
  resources: readonly Resource[];
  safetyJson: string;
  replacementAllowed: boolean;
}>;

/** Explicit, resource-only backup/import. No legacy storage reads, auth calls, or migration. */
export function createResourceBackupJson(dependencies: {
  enabled: boolean;
  store: UserSessionStore;
  resourceLocks?: ResourceLockManager;
  /** Explicit activation policy; stays blocked pending browser/recovery validation. */
  replacementPolicy?: "blocked" | "coordinated";
}) {
  type Operation = Awaited<ReturnType<UserSessionStore["beginOperation"]>>;
  const previews = new WeakMap<ResourceImportPreview, { operation: Operation; before: string | null; candidate: string }>();
  function enabled() { if (!dependencies.enabled) throw new Error("Sauvegardes isolées désactivées."); }
  function resourceEnvelope(userId: string, resources: Resource[]) {
    return { appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: userId,
      exportedAt: new Date().toISOString(), resources };
  }
  async function exportResources(capture: SessionCapture) {
    enabled();
    const op = await dependencies.store.beginOperation(capture);
    const result = op.business.loadResources();
    if (result.status !== "available") throw new Error(result.status === "migration-required" ? "Migration nécessaire" : "Ressources absentes : aucune liste vide inventée.");
    assertResources(result.data); op.assertCurrent();
    return JSON.stringify(resourceEnvelope(op.userId, result.data), null, 2);
  }
  async function preview(json: string, capture: SessionCapture): Promise<ResourceImportPreview> {
    enabled();
    const parsed = parseResourceBackup(json);
    const op = await dependencies.store.beginOperation(capture);
    if (parsed.ownerUserId !== null && parsed.ownerUserId !== op.userId) throw new Error("Cette sauvegarde appartient à un autre compte. Chargement refusé.");
    const before = dependencies.store.scopedStorage.read(op.owner, "resources");
    const result = op.business.loadResources();
    if (result.status === "migration-required") throw new Error("Migration nécessaire");
    if (dependencies.store.scopedStorage.read(op.owner, "resources") !== before ||
      (before === null ? result.status !== "absent" : result.status !== "available" ||
        JSON.stringify(result.data) !== JSON.stringify(JSON.parse(before)))) {
      throw new Error("Destination instable pendant l’aperçu. Recommencez.");
    }
    const candidate = JSON.stringify(parsed.resources);
    const safetyJson = JSON.stringify({
      ...resourceEnvelope(op.userId, result.status === "available" ? result.data : []),
      // Absence is explicit; this recovery artifact is not accepted as a normal resource export.
      ...(result.status === "absent" ? { storageScope: "account-resource-safety", resources: null } : {}),
      rawResources: before, purpose: "before-resource-import",
    }, null, 2);
    // The displayed preview is detached from the immutable string used for the copy.
    const output: ResourceImportPreview = Object.freeze({
      userId: op.userId, sourceOwnerUserId: parsed.ownerUserId, sourceCount: parsed.resources.length,
      destinationCount: result.status === "available" ? result.data.length : null,
      categories: Object.freeze(parsed.categories), resources: Object.freeze(JSON.parse(candidate)) as Resource[], safetyJson,
      replacementAllowed: dependencies.replacementPolicy === "coordinated",
    });
    previews.set(output, { operation: op, before, candidate });
    return output;
  }

  async function apply(preview: ResourceImportPreview, confirmation: {
    ownerUserId: string;
    ownershipCertain: boolean;
    legacyOwnershipVerified: boolean;
    previewReviewed: boolean;
    safetyBackupSaved: boolean;
    replaceExisting: boolean;
  }) {
    enabled();
    const captured = previews.get(preview);
    if (!captured || confirmation.ownerUserId !== preview.userId || !confirmation.ownershipCertain ||
      (preview.sourceOwnerUserId === null && !confirmation.legacyOwnershipVerified)) throw new Error("Propriétaire incertain : chargement refusé.");
    if (!confirmation.previewReviewed || !confirmation.safetyBackupSaved) throw new Error("Aperçu et sauvegarde préalable obligatoires.");
    if (captured.before !== null && dependencies.replacementPolicy !== "coordinated") {
      throw new Error("Destination existante : remplacement bloqué par la politique d’activation.");
    }
    if (captured.before !== null && !confirmation.replaceExisting) throw new Error("Destination existante : remplacement non autorisé.");
    const { operation: op, before, candidate } = captured;
    await coordinateResourceWrite({
      scoped: dependencies.store.scopedStorage, owner: op.owner, expectedRaw: before, candidateRaw: candidate,
      kind: "import", locks: dependencies.resourceLocks, sourceOwnerUserId: preview.sourceOwnerUserId,
      preflight: () => {
        op.assertCurrent();
        if (op.business.getStatus().status !== "available") throw new Error("Migration nécessaire");
      },
    });
    op.assertCurrent(); previews.delete(preview);
    return { userId: op.userId, resourcesCount: JSON.parse(candidate).length as number };
  }
  async function exportRecoveryDiagnostic(capture: SessionCapture) {
    enabled();
    const op = await dependencies.store.beginOperation(capture);
    return exportResourceRecoveryDiagnostic(dependencies.store.scopedStorage, op.owner, dependencies.resourceLocks);
  }
  return { exportResources, preview, apply, exportRecoveryDiagnostic };
}
