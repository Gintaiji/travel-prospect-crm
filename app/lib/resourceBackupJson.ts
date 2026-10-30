import { archiveReceipt, parseResourceArchive, resourceDigest, verifiedResourceCopyFingerprint } from "./resourceArchiveIntegrity";
import { assertResources } from "./resourceAccess";
import type { Resource } from "./types";
import type { SessionCapture, UserSessionStore } from "./userSessionStore";
import { coordinateResourceRead, coordinateResourceWrite, exportResourceRecoveryDiagnostic, ResourceRecoveryRequiredError, type ResourceLockManager } from "./resourceWriteCoordinator";
import type { ResourceSpaceEstimate } from "./resourceRecoverySpace";
import { recoverableResourceCopies } from "./resourceRecoveryAssessment";

export const MANUAL_RESOURCE_RECOVERY_ENABLED: boolean = false;
export const RESOURCE_JSON_REPLACEMENT_ENABLED: boolean = false;
export type ResourceRecoveryPreview = Readonly<{
  userId: string; diagnosticJson: string;
  copies: readonly { operationId: string; side: "beforeRaw" | "candidateRaw"; resources: readonly Resource[] }[];
}>;

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
  const value: unknown = parseResourceArchive(json);
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
  if (value.archiveVersion !== undefined) {
    if (value.archiveVersion !== 2 || value.purpose !== "before-resource-import" || typeof value.rawResources !== "string" ||
      value.resourceFingerprint !== resourceDigest(value.rawResources) || JSON.stringify(value.resources) !== JSON.stringify(parseResourceArchive(value.rawResources))) {
      throw new Error("Format ou empreinte de sauvegarde Ressources invalide.");
    }
  }
  if (value.copyVersion !== undefined) {
    if (value.copyVersion !== 1 || value.purpose !== "resource-recovery-copy" || typeof value.rawResources !== "string" ||
      value.resourceFingerprint !== resourceDigest(value.rawResources) || JSON.stringify(value.resources) !== JSON.stringify(parseResourceArchive(value.rawResources))) {
      throw new Error("Copie de récupération : format ou empreinte SHA-256 invalide.");
    }
  }
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
  currentResources: readonly Resource[] | null;
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
  /** Injection reserved for fictional fixtures; production uses the false source switch. */
  recoveryEnabled?: boolean;
  recoverySpace?: () => ResourceSpaceEstimate;
}) {
  type Operation = Awaited<ReturnType<UserSessionStore["beginOperation"]>>;
  const previews = new WeakMap<ResourceImportPreview, { operation: Operation; before: string | null; candidate: string; diagnosticJson: string; safetyJson: string; backupVerified: boolean }>();
  const replacementAllowed = () => (dependencies.replacementPolicy ?? (RESOURCE_JSON_REPLACEMENT_ENABLED ? "coordinated" : "blocked")) === "coordinated";
  const recoveries = new WeakMap<ResourceRecoveryPreview, { operation: Operation; json: string; backupVerified: boolean; copies: ReturnType<typeof recoverableResourceCopies>;
    exports: Map<string, { json: string; verified: boolean }> }>();
  function recoveryEnabled() {
    enabled();
    if (!(dependencies.recoveryEnabled ?? MANUAL_RESOURCE_RECOVERY_ENABLED)) throw new Error("Récupération manuelle désactivée.");
  }
  function enabled() { if (!dependencies.enabled) throw new Error("Sauvegardes isolées désactivées."); }
  function resourceEnvelope(userId: string, resources: Resource[]) {
    return { appName: "Travel Prospect CRM", version: 5, storageScope: "account-resources", ownerUserId: userId,
      exportedAt: new Date().toISOString(), resources };
  }
  async function exportResources(capture: SessionCapture) {
    enabled();
    const op = await dependencies.store.beginOperation(capture);
    const result = await op.business.loadResources();
    if (result.status !== "available") throw new Error(result.status === "fresh-account" ? "Compte neuf sans données : initialisation explicite nécessaire." : result.status === "migration-required" ? "Migration nécessaire" : "Ressources absentes : aucune liste vide inventée.");
    assertResources(result.data); op.assertCurrent();
    return JSON.stringify(resourceEnvelope(op.userId, result.data), null, 2);
  }
  async function preview(json: string, capture: SessionCapture): Promise<ResourceImportPreview> {
    enabled();
    const parsed = parseResourceBackup(json);
    const op = await dependencies.store.beginOperation(capture);
    if (parsed.ownerUserId === null) throw new Error("Chargement refusé : sauvegarde sans propriétaire vérifié pour ce compte.");
    if (parsed.ownerUserId !== null && parsed.ownerUserId !== op.userId) throw new Error("Cette sauvegarde appartient à un autre compte. Chargement refusé.");
    const diagnosticJson = await exportResourceRecoveryDiagnostic(dependencies.store.scopedStorage, op.owner, dependencies.resourceLocks, () => {
      op.assertCurrent();
      const status = op.business.getResourceStatus();
      if (status.status !== "available") throw new Error(status.status === "fresh-account" ? "Compte neuf sans données : initialisation explicite nécessaire." : "Migration nécessaire");
    });
    op.assertCurrent();
    const diagnostic = JSON.parse(diagnosticJson);
    if (diagnostic.status !== "ready") throw new ResourceRecoveryRequiredError("destination non vérifiée avant aperçu");
    const before: string | null = diagnostic.rawResources;
    const currentResources: Resource[] | null = before === null ? null : JSON.parse(before);
    if (currentResources !== null) assertResources(currentResources);
    const candidate = JSON.stringify(parsed.resources);
    const safetyJson = JSON.stringify({
      ...resourceEnvelope(op.userId, currentResources ?? []),
      // Absence is explicit; this recovery artifact is not accepted as a normal resource export.
      ...(before === null ? { storageScope: "account-resource-safety", resources: null } : {}),
      resourceFingerprint: before === null ? null : resourceDigest(before), rawResources: before, purpose: "before-resource-import", archiveVersion: 2,
      recoveryReceipt: archiveReceipt(op.userId, diagnosticJson),
    }, null, 2);
    // The displayed preview is detached from the immutable string used for the copy.
    const output: ResourceImportPreview = Object.freeze({
      userId: op.userId, sourceOwnerUserId: parsed.ownerUserId, sourceCount: parsed.resources.length,
      destinationCount: currentResources === null ? null : currentResources.length,
      categories: Object.freeze(parsed.categories), resources: Object.freeze(JSON.parse(candidate)) as Resource[], safetyJson,
      currentResources: currentResources === null ? null : Object.freeze(JSON.parse(before!)) as Resource[],
      replacementAllowed: replacementAllowed(),
    });
    previews.set(output, { operation: op, before, candidate, diagnosticJson, safetyJson, backupVerified: false });
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
      preview.sourceOwnerUserId !== captured.operation.userId) throw new Error("Propriétaire incertain : chargement refusé.");
    if (!confirmation.previewReviewed || !confirmation.safetyBackupSaved) throw new Error("Aperçu et sauvegarde préalable obligatoires.");
    if (captured.before !== null && !replacementAllowed()) {
      throw new Error("Destination existante : remplacement bloqué par la politique d’activation.");
    }
    if (captured.before !== null && !confirmation.replaceExisting) throw new Error("Destination existante : remplacement non autorisé.");
    if (captured.before !== null && !captured.backupVerified) throw new Error("Sauvegarde préalable complète non relue ou différente de cet aperçu.");
    const { operation: op, before, candidate } = captured;
    op.assertCurrent();
    previews.delete(preview); // One attempt; failure requires a fresh snapshot and backup.
    await coordinateResourceWrite({
      scoped: dependencies.store.scopedStorage, owner: op.owner, expectedRaw: before, candidateRaw: candidate,
      kind: "import", locks: dependencies.resourceLocks, sourceOwnerUserId: preview.sourceOwnerUserId,
      ...(before === null ? {} : { replacement: { diagnosticJson: captured.diagnosticJson, safetyJson: captured.safetyJson,
        verifiedSafetyJson: captured.safetyJson, confirmedOwnerUserId: confirmation.ownerUserId } }),
      preflight: () => {
        op.assertCurrent();
        if (op.business.getResourceStatus().status !== "available") throw new Error("Migration nécessaire");
      },
    });
    op.assertCurrent(); previews.delete(preview);
    return { userId: op.userId, resourcesCount: JSON.parse(candidate).length as number };
  }
  function verifyImportSafetyBackup(preview: ResourceImportPreview, savedJson: string) {
    enabled();
    const captured = previews.get(preview);
    if (!captured) throw new Error("Aperçu d’import inconnu ou consommé.");
    captured.operation.assertCurrent(); captured.backupVerified = false;
    if (savedJson !== captured.safetyJson) throw new Error("Sauvegarde préalable différente de l’état actuel de cet aperçu.");
    captured.backupVerified = true;
  }
  async function exportRecoveryDiagnostic(capture: SessionCapture) {
    enabled();
    const op = await dependencies.store.beginOperation(capture);
    const json = await exportResourceRecoveryDiagnostic(dependencies.store.scopedStorage, op.owner, dependencies.resourceLocks);
    op.assertCurrent();
    return json;
  }
  async function inspectRecoveryBackup(json: string, capture: SessionCapture) {
    enabled();
    const op = await dependencies.store.beginOperation(capture);
    const parsed = parseResourceBackup(json);
    if (parsed.ownerUserId !== op.userId) throw new Error("Sauvegarde non attribuée à ce compte confirmé : vérification refusée.");
    op.assertCurrent();
    return { ownerUserId: op.userId, resourcesCount: parsed.resources.length };
  }
  async function previewRecovery(capture: SessionCapture): Promise<ResourceRecoveryPreview> {
    recoveryEnabled();
    const operation = await dependencies.store.beginOperation(capture);
    const json = await exportResourceRecoveryDiagnostic(dependencies.store.scopedStorage, operation.owner, dependencies.resourceLocks);
    operation.assertCurrent();
    const d = JSON.parse(json);
    if (d.status !== "recovery-required") throw new Error("Aucune récupération nécessaire.");
    const copies = recoverableResourceCopies(operation.userId, d.rawResources, d.rawJournal, d.rawState);
    if (!copies.length) throw new Error("Aucune copie récupérable.");
    const result: ResourceRecoveryPreview = Object.freeze({ userId: operation.userId, diagnosticJson: json,
      copies: Object.freeze(copies.map(copy => Object.freeze({ operationId: copy.operationId, side: copy.side,
        resources: Object.freeze(JSON.parse(copy.raw)) as Resource[] }))) });
    recoveries.set(result, { operation, json, copies, backupVerified: false, exports: new Map() });
    return result;
  }
  function verifyRecoverySafetyBackup(preview: ResourceRecoveryPreview, savedJson: string) {
    recoveryEnabled();
    const captured = recoveries.get(preview);
    if (!captured) throw new Error("Aperçu de récupération inconnu.");
    captured.operation.assertCurrent();
    captured.backupVerified = false;
    // Reloaded file must contain exactly the snapshot, journal and diagnostic being replaced.
    if (savedJson !== captured.json) throw new Error("Sauvegarde préalable différente du diagnostic de cet aperçu.");
    captured.backupVerified = true;
  }
  type Selection = { operationId: string; side: "beforeRaw" | "candidateRaw" };
  const selectionKey = (selection: Selection) => JSON.stringify([selection.operationId, selection.side]);

  /** Revalidate the exact diagnostic and all source integrity under the existing account lock. */
  async function withRecoverySnapshot<T>(preview: ResourceRecoveryPreview, read: (captured: NonNullable<ReturnType<typeof recoveries.get>>) => T) {
    recoveryEnabled();
    const captured = recoveries.get(preview);
    if (!captured) throw new Error("Aperçu de récupération inconnu ou consommé.");
    const op = captured.operation;
    return coordinateResourceRead({ scoped: dependencies.store.scopedStorage, owner: op.owner, locks: dependencies.resourceLocks, read: () => {
      op.assertCurrent();
      const d = JSON.parse(captured.json);
      for (const [name, field] of [["resources", "rawResources"], ["resource-import-journal", "rawJournal"], ["resource-import-state", "rawState"], ["migration-state", "rawMigrationState"]] as const) {
        if (dependencies.store.scopedStorage.read(op.owner, name) !== d[field]) throw new Error("Conflit de récupération : état modifié depuis l’aperçu.");
      }
      recoverableResourceCopies(op.userId, d.rawResources, d.rawJournal, d.rawState);
      return read(captured);
    } });
  }

  async function exportRecoveryCopy(preview: ResourceRecoveryPreview, selection: Selection) {
    return withRecoverySnapshot(preview, captured => {
      const copy = captured.copies.find(c => c.operationId === selection.operationId && c.side === selection.side);
      if (!copy) throw new Error("Copie absente de l’aperçu.");
      const d = JSON.parse(captured.json);
      const entry = (parseResourceArchive(d.rawJournal) as Record<string, unknown>[]).find(e => e.importId === selection.operationId);
      const fingerprint = verifiedResourceCopyFingerprint(entry, captured.operation.userId, copy.side, copy.raw);
      const json = JSON.stringify({ ...resourceEnvelope(captured.operation.userId, JSON.parse(copy.raw)), purpose: "resource-recovery-copy", copyVersion: 1,
        source: { operationId: copy.operationId, side: copy.side, archiveVersion: 2 }, rawResources: copy.raw, resourceFingerprint: fingerprint }, null, 2);
      // Round-trip before download does not prove that the external file has been saved.
      parseResourceBackup(json);
      captured.exports.set(selectionKey(selection), { json, verified: false });
      return json;
    });
  }

  async function verifyRecoveryCopyExport(preview: ResourceRecoveryPreview, selection: Selection, savedJson: string) {
    const captured = recoveries.get(preview);
    const exported = captured?.exports.get(selectionKey(selection));
    if (exported) exported.verified = false;
    return withRecoverySnapshot(preview, captured => {
      if (!exported || exported.json !== savedJson) throw new Error("Export non vérifié : relire le fichier exact téléchargé pour cette copie.");
      const parsed = parseResourceBackup(savedJson);
      if (parsed.ownerUserId !== captured.operation.userId) throw new Error("Propriétaire de l’export incorrect.");
      exported.verified = true;
      const verifiedCopies = captured.copies.filter(c => captured.exports.get(selectionKey(c))?.verified).length;
      return { verifiedCopies, totalCopies: captured.copies.length, allVerified: verifiedCopies === captured.copies.length };
    });
  }

  async function inspectRecoverySpace(preview: ResourceRecoveryPreview, selection: Selection) {
    recoveryEnabled();
    const captured = recoveries.get(preview);
    if (!captured) throw new Error("Aperçu de récupération inconnu ou consommé.");
    const copy = captured.copies.find(c => c.operationId === selection.operationId && c.side === selection.side);
    if (!copy) throw new Error("Copie absente de l’aperçu.");
    const result = await coordinateResourceWrite({ scoped: dependencies.store.scopedStorage, owner: captured.operation.owner,
      expectedRaw: JSON.parse(captured.json).rawResources, candidateRaw: copy.raw, kind: "recovery", manualRecoveryEnabled: true, inspectRecoveryOnly: true,
      recoverySpace: dependencies.recoverySpace, locks: dependencies.resourceLocks,
      recovery: { diagnosticJson: captured.json, verifiedBackupJson: captured.json, operationId: copy.operationId, side: copy.side,
        confirmedOwnerUserId: captured.operation.userId, previewReviewed: true } });
    captured.operation.assertCurrent();
    if (!result) throw new Error("Estimation de récupération indisponible.");
    return result;
  }
  async function applyRecovery(preview: ResourceRecoveryPreview, selection: { operationId: string; side: "beforeRaw" | "candidateRaw" }, confirmation: {
    ownerUserId: string; previewReviewed: boolean; recoverExplicitly: boolean;
  }) {
    recoveryEnabled();
    const captured = recoveries.get(preview);
    if (!captured || !captured.backupVerified || !confirmation.recoverExplicitly || !confirmation.previewReviewed || confirmation.ownerUserId !== captured.operation.userId) {
      throw new Error("Sauvegarde préalable relue et confirmation explicite obligatoires.");
    }
    captured.operation.assertCurrent();
    const copy = captured.copies.find(item => item.operationId === selection.operationId && item.side === selection.side);
    if (!copy) throw new Error("Copie non proposée ou absente.");
    // One attempt consumes the preview, including on failure: fresh diagnosis required.
    recoveries.delete(preview);
    await coordinateResourceWrite({ scoped: dependencies.store.scopedStorage, owner: captured.operation.owner,
      expectedRaw: JSON.parse(captured.json).rawResources, candidateRaw: copy.raw, kind: "recovery", manualRecoveryEnabled: true, locks: dependencies.resourceLocks,
      recoverySpace: dependencies.recoverySpace,
      recovery: { diagnosticJson: captured.json, verifiedBackupJson: captured.json, operationId: copy.operationId, side: copy.side,
        confirmedOwnerUserId: confirmation.ownerUserId, previewReviewed: confirmation.previewReviewed },
      preflight: () => captured.operation.assertCurrent(),
    });
    captured.operation.assertCurrent();
    return { userId: captured.operation.userId, resourcesCount: JSON.parse(copy.raw).length as number };
  }
  return { exportResources, preview, apply, verifyImportSafetyBackup, exportRecoveryDiagnostic, inspectRecoveryBackup, previewRecovery, verifyRecoverySafetyBackup,
    exportRecoveryCopy, verifyRecoveryCopyExport, inspectRecoverySpace, applyRecovery };
}
