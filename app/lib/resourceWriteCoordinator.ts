import { archiveReceipt, resourceDigest, validFlatEntry, parseResourceArchive } from "./resourceArchiveIntegrity";
import { assessRecoverySpace, isResourceQuotaError, readBrowserRecoverySpace, ResourceQuotaError, ResourceRecoverySpaceError, type ResourceSpaceEstimate } from "./resourceRecoverySpace";
import type { AccountStorageName, ValidatedStorageOwner } from "./accountScopedStorage";
import { assessResourceRecovery, recoverableResourceCopies, validRecoveryStage, validReplacementStage } from "./resourceRecoveryAssessment";

export type ResourceLockManager = {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
};
export type ResourceWritePermit = Readonly<{ userId: string }>;
type Scoped = {
  isAccountEmpty?(owner: ValidatedStorageOwner): boolean;
  read(owner: ValidatedStorageOwner, name: AccountStorageName): string | null;
  write(owner: ValidatedStorageOwner, name: AccountStorageName, raw: string, permit?: ResourceWritePermit): void;
};
const permits = new WeakMap<object, { scoped: object; owner: object }>();
export const RESOURCE_RECOVERY_LABEL = "Récupération nécessaire";
export class ResourceRecoveryRequiredError extends Error {
  constructor(reason: string) { super(`${RESOURCE_RECOVERY_LABEL} : ${reason}. Sources et copies de sécurité conservées.`); }
}
export const resourceWriteLockName = (userId: string) => `travel-prospect-crm:resource-write:v1:${userId}`;

/** A lock-scoped capability, revoked in finally; cannot be reused by a queued callback. */
export function assertResourceWritePermit(permit: ResourceWritePermit | undefined, scoped: object, owner: object) {
  const active = permit && permits.get(permit);
  if (!active || active.scoped !== scoped || active.owner !== owner) throw new Error("Écriture Ressources refusée hors du coordinateur commun.");
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fail(reason: string): never { throw new ResourceRecoveryRequiredError(reason); }

/** Internal integrity audit: callers must hold the account resource lock throughout. */
export function assertResourceRecoveryClear(scoped: Scoped, owner: ValidatedStorageOwner) {
  const journalRaw = scoped.read(owner, "resource-import-journal");
  const stateRaw = scoped.read(owner, "resource-import-state");
  if (journalRaw === null && stateRaw === null) return;
  let entries: unknown, state: unknown;
  try { entries = journalRaw === null ? null : parseResourceArchive(journalRaw); state = stateRaw === null ? null : JSON.parse(stateRaw); }
  catch { fail("journal ou état illisible"); }
  if (!Array.isArray(entries) || !entries.length || !object(state)) fail("journal et état incomplets");
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!object(entry) || entry.userId !== owner.userId || typeof entry.importId !== "string" || !entry.importId || ids.has(entry.importId) ||
      (entry.beforeRaw !== null && typeof entry.beforeRaw !== "string") ||
      (entry.candidateRaw !== null && typeof entry.candidateRaw !== "string")) fail("journal incohérent ou propriétaire incorrect");
    if (typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))) fail("date du journal invalide");
    if (entry.kind === "initialization" && (ids.size !== 0 || entry.beforeRaw !== null || entry.candidateRaw !== "[]")) fail("journal d’initialisation invalide");
    if (!validFlatEntry(entry, owner.userId)) fail("empreinte ou format de copie invalide");
    if (!validRecoveryStage(entry, owner.userId)) fail("préparation de récupération invalide");
    if (!validReplacementStage(entry, owner.userId)) fail("préparation de remplacement invalide");
    for (const raw of [entry.beforeRaw, entry.candidateRaw]) {
      if (raw !== null) {
        try { if (!Array.isArray(JSON.parse(raw as string))) fail("snapshot du journal invalide"); }
        catch { fail("snapshot du journal illisible"); }
      }
    }
    ids.add(entry.importId);
  }
  const latest = entries[entries.length - 1] as Record<string, unknown>;
  if (state.userId !== owner.userId || state.status !== "verified" || state.importId !== latest.importId ||
    typeof state.verifiedAt !== "string" || !Number.isFinite(Date.parse(state.verifiedAt))) fail("opération interrompue ou non vérifiée");
  if (scoped.read(owner, "resources") !== latest.candidateRaw) fail("contenu Ressources différent de la dernière copie vérifiée");
}

function browserLocks(): ResourceLockManager {
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("Web Locks indisponible : écriture isolée refusée. Aucun verrou localStorage de substitution.");
  return { request: async (name, options, callback) => await navigator.locks.request(name, options, callback) };
}

/** Serialize resource snapshots with writers. Never call from an already-held resource lock. */
export async function coordinateResourceRead<T>(options: {
  scoped: Scoped;
  owner: ValidatedStorageOwner;
  locks?: ResourceLockManager;
  // Synchronous callback keeps validation, journal checks and data capture in one lock.
  read: () => T;
}): Promise<T> {
  const { scoped, owner } = options;
  scoped.read(owner, "migration-state"); // Validate the captured owner before waiting.
  const snapshot = await (options.locks ?? browserLocks()).request(resourceWriteLockName(owner.userId), { mode: "exclusive" }, async () => {
    scoped.read(owner, "migration-state"); // Session may have changed while queued.
    const snapshot = options.read();
    scoped.read(owner, "migration-state"); // Refuse a revoked owner before publishing data.
    return snapshot;
  });
  scoped.read(owner, "migration-state"); // Also validate after the asynchronous lock handoff.
  return snapshot;
}

/** Stable, owner-bound forensic export. Never marks an operation repaired or verified. */
export async function exportResourceRecoveryDiagnostic(scoped: Scoped, owner: ValidatedStorageOwner, locks?: ResourceLockManager, validate?: () => void) {
  const diagnostic = await coordinateResourceRead({ scoped, owner, locks, read: () => {
    const rawResources = scoped.read(owner, "resources");
    const rawJournal = scoped.read(owner, "resource-import-journal");
    const rawState = scoped.read(owner, "resource-import-state");
    const rawMigrationState = scoped.read(owner, "migration-state");
    const captured = { resources: rawResources, "resource-import-journal": rawJournal, "resource-import-state": rawState };
    let status = "ready", reason: string | null = null;
    try { assertResourceRecoveryClear({ ...scoped, read: (_owner, name) => captured[name as keyof typeof captured] }, owner); }
    catch (error) {
      if (!(error instanceof ResourceRecoveryRequiredError)) throw error;
      status = "recovery-required"; reason = error.message;
    }
    const assessment = assessResourceRecovery(owner.userId, rawResources, rawJournal, rawState);
    if (assessment.corruptionDetected) { status = "recovery-required"; reason ??= "Structure des données ou copies invalide après lecture réussie."; }
    if (status === "ready") validate?.();
    return {
      appName: "Travel Prospect CRM", storageScope: "resource-recovery-diagnostic", userId: owner.userId,
      capturedAt: new Date().toISOString(), status, reason,
      rawResources, rawJournal, rawState, rawMigrationState, assessment,
    };
  } });
  return JSON.stringify(diagnostic, null, 2);
}

/** Sole writer of resource data and its append-only recovery journal. */
export async function coordinateResourceWrite(options: {
  scoped: Scoped;
  owner: ValidatedStorageOwner;
  expectedRaw: string | null;
  candidateRaw: string | null;
  kind: "edit" | "import" | "migration" | "recovery" | "initialization";
  initialization?: { enabled: boolean; confirmed: boolean; ownerUserId: string };
  replacement?: { diagnosticJson: string; safetyJson: string; verifiedSafetyJson: string; confirmedOwnerUserId: string };
  /** Explicit fixture/activation injection; recovery is refused by default here too. */
  manualRecoveryEnabled?: boolean;
  /** Read-only preparation follows the same lock, conflict and integrity checks. */
  inspectRecoveryOnly?: boolean;
  recoverySpace?: () => ResourceSpaceEstimate;
  recovery?: { diagnosticJson: string; verifiedBackupJson: string; operationId: string; side: "beforeRaw" | "candidateRaw"; confirmedOwnerUserId: string; previewReviewed: boolean };
  locks?: ResourceLockManager;
  sourceOwnerUserId?: string | null;
  preflight?: () => void;
  // Migration's other categories remain under the resource lock until fully verified.
  work?: () => Promise<void> | void;
}) {
  const { scoped, owner, expectedRaw, candidateRaw } = options;
  if (options.inspectRecoveryOnly && options.kind !== "recovery") throw new Error("Inspection réservée à la récupération.");
  if (options.kind === "initialization" && (!options.initialization?.enabled || !options.initialization.confirmed ||
    options.initialization.ownerUserId !== owner.userId || expectedRaw !== null || candidateRaw !== "[]")) throw new Error("Initialisation refusée : activation et confirmation du propriétaire obligatoires.");
  if (options.kind === "recovery" && options.manualRecoveryEnabled !== true) throw new Error("Récupération manuelle désactivée dans le coordinateur.");
  // Capture before waiting. No lock is ever implemented through a localStorage key.
  scoped.read(owner, "resources");
  if (candidateRaw === null && (expectedRaw !== null || options.kind !== "migration")) throw new Error("Suppression de clé Ressources interdite.");
  if (candidateRaw !== null && !Array.isArray(JSON.parse(candidateRaw))) throw new Error("Le candidat Ressources doit être une liste JSON.");
  return (options.locks ?? browserLocks()).request(resourceWriteLockName(owner.userId), { mode: "exclusive" }, async () => {
    scoped.read(owner, "resources"); // Owner/session validated again after lock wait.
    if (options.kind === "recovery") {
      const recovery = options.recovery;
      if (!recovery || recovery.verifiedBackupJson !== recovery.diagnosticJson || !recovery.previewReviewed || recovery.confirmedOwnerUserId !== owner.userId) fail("sauvegarde préalable ou confirmation manquante");
      const diagnostic = JSON.parse(recovery.diagnosticJson);
      if (diagnostic.appName !== "Travel Prospect CRM" || diagnostic.storageScope !== "resource-recovery-diagnostic" || diagnostic.userId !== owner.userId || diagnostic.status !== "recovery-required") fail("diagnostic non attribuable ou récupération inutile");
      for (const [name, field] of [["resources", "rawResources"], ["resource-import-journal", "rawJournal"], ["resource-import-state", "rawState"], ["migration-state", "rawMigrationState"]] as const) {
        if (scoped.read(owner, name) !== diagnostic[field]) throw new Error("Conflit de récupération : état modifié depuis l’aperçu.");
      }
      const copies = recoverableResourceCopies(owner.userId, diagnostic.rawResources, diagnostic.rawJournal, diagnostic.rawState);
      if (!copies.some(copy => copy.operationId === recovery.operationId && copy.side === recovery.side && copy.raw === candidateRaw)) fail("copie absente ou non vérifiée");
    } else {
      if (options.recovery) throw new Error("Options de récupération interdites pour une écriture normale.");
      assertResourceRecoveryClear(scoped, owner);
    }
    if (scoped.read(owner, "resources") !== expectedRaw) throw new Error("Conflit Ressources : destination modifiée depuis la lecture. Rechargez avant de recommencer.");
    if (options.replacement) {
      const r = options.replacement;
      if (options.kind !== "import" || expectedRaw === null || options.sourceOwnerUserId !== owner.userId || r.confirmedOwnerUserId !== owner.userId || r.verifiedSafetyJson !== r.safetyJson ||
        !validReplacementStage({ kind: "import", sourceOwnerUserId: options.sourceOwnerUserId, beforeRaw: expectedRaw, candidateRaw, replacement: { diagnosticJson: r.diagnosticJson, safetyJson: r.safetyJson, stagedRaw: candidateRaw } }, owner.userId)) throw new Error("Sauvegarde ou propriétaire du remplacement non vérifié.");
      const diagnostic = JSON.parse(r.diagnosticJson);
      for (const [name, field] of [["resources", "rawResources"], ["resource-import-journal", "rawJournal"], ["resource-import-state", "rawState"], ["migration-state", "rawMigrationState"]] as const) {
        if (scoped.read(owner, name) !== diagnostic[field]) throw new Error("Conflit Ressources : état modifié depuis l’aperçu de remplacement.");
      }
    }
    options.preflight?.();
    if (options.kind === "initialization" && scoped.isAccountEmpty?.(owner) !== true) throw new Error("Initialisation refusée : destination isolée existante. Aucune donnée remplacée.");
    const permit = Object.freeze({ userId: owner.userId });
    permits.set(permit, { scoped, owner });
    try {
      const old = scoped.read(owner, "resource-import-journal");
      const entries = old === null ? [] : JSON.parse(old) as unknown[];
      const importId = crypto.randomUUID(), createdAt = new Date().toISOString();
      // Append without reserializing historical entries; preserve their exact bytes.
      const entry = { importId, userId: owner.userId, createdAt, kind: options.kind,
        archiveVersion: 2, sourceOwnerUserId: options.sourceOwnerUserId ?? null, beforeRaw: expectedRaw, candidateRaw,
        fingerprints: { beforeRaw: expectedRaw === null ? null : resourceDigest(expectedRaw), candidateRaw: candidateRaw === null ? null : resourceDigest(candidateRaw) },
        receipts: {
          ...(options.replacement ? { diagnostic: archiveReceipt(owner.userId, options.replacement.diagnosticJson), safety: archiveReceipt(owner.userId, options.replacement.safetyJson) } : {}),
          ...(options.kind === "recovery" ? { diagnostic: archiveReceipt(owner.userId, options.recovery!.diagnosticJson) } : {}),
        },
        ...(options.kind === "recovery" ? { recoveredFrom: { operationId: options.recovery!.operationId, side: options.recovery!.side } } : {}),
      };
      if (!Array.isArray(entries)) fail("journal illisible");
      const journal = old === null ? JSON.stringify([entry]) : old.slice(0, old.lastIndexOf("]")) + (entries.length ? "," : "") + JSON.stringify(entry) + old.slice(old.lastIndexOf("]"));
      const pending = JSON.stringify({ userId: owner.userId, importId, createdAt, kind: options.kind, status: "pending" });
      const verified = JSON.stringify({ userId: owner.userId, importId, createdAt, kind: options.kind, status: "verified", verifiedAt: new Date().toISOString() });
      if (options.kind === "recovery") {
        let estimate: ResourceSpaceEstimate;
        try { estimate = (options.recoverySpace ?? readBrowserRecoverySpace)(); }
        catch { estimate = { availableBytes: null, usedBytes: null, source: "unavailable" }; }
        const prefix = `travel-prospect-crm:account:v1:${owner.userId}:`;
        const space = assessRecoverySpace(estimate, [
          { key: prefix + "resource-import-journal", before: old, after: journal },
          { key: prefix + "resource-import-state", before: scoped.read(owner, "resource-import-state"), after: pending },
          { key: prefix + "resources", before: expectedRaw, after: candidateRaw! },
          { key: prefix + "resource-import-state", before: pending, after: verified },
        ]);
        scoped.read(owner, "resources"); // The injected estimator cannot revoke a session unnoticed.
        if (options.inspectRecoveryOnly) return space;
        if (space.status !== "sufficient-estimate") throw new ResourceRecoverySpaceError(space);
      }
      scoped.write(owner, "resource-import-journal", journal, permit);
      if (scoped.read(owner, "resource-import-journal") !== journal) fail("copie du journal non vérifiée");
      scoped.write(owner, "resource-import-state", pending, permit);
      if (scoped.read(owner, "resource-import-state") !== pending) fail("état de préparation non vérifié");
      if (scoped.read(owner, "resources") !== expectedRaw) fail("destination modifiée pendant la préparation");
      if (candidateRaw !== null) scoped.write(owner, "resources", candidateRaw, permit);
      if (scoped.read(owner, "resources") !== candidateRaw) fail("copie Ressources non vérifiée");
      await options.work?.();
      if (scoped.read(owner, "resources") !== candidateRaw) fail("vérification finale Ressources échouée");
      scoped.write(owner, "resource-import-state", verified, permit);
      if (scoped.read(owner, "resource-import-state") !== verified) fail("état final non vérifié");
      if (scoped.read(owner, "resource-import-journal") !== journal || scoped.read(owner, "resources") !== candidateRaw) fail("vérification finale des données ou du journal échouée");
      assertResourceRecoveryClear(scoped, owner);
    } catch (error) {
      // Preserve quota identity even if an incomplete journal also requires recovery.
      if (isResourceQuotaError(error)) throw new ResourceQuotaError();
      if (error instanceof ResourceRecoverySpaceError) throw error;
      try { assertResourceRecoveryClear(scoped, owner); }
      catch (recovery) { if (recovery instanceof ResourceRecoveryRequiredError) throw recovery; }
      throw error;
    } finally { permits.delete(permit); }
  });
}
