import type { AccountStorageName, ValidatedStorageOwner } from "./accountScopedStorage";

export type ResourceLockManager = {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
};
export type ResourceWritePermit = Readonly<{ userId: string }>;
type Scoped = {
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

/** Read-only integrity audit, including the journal-before-marker crash window. */
export function assertResourceRecoveryClear(scoped: Scoped, owner: ValidatedStorageOwner) {
  const journalRaw = scoped.read(owner, "resource-import-journal");
  const stateRaw = scoped.read(owner, "resource-import-state");
  if (journalRaw === null && stateRaw === null) return;
  let entries: unknown, state: unknown;
  try { entries = journalRaw === null ? null : JSON.parse(journalRaw); state = stateRaw === null ? null : JSON.parse(stateRaw); }
  catch { fail("journal ou état illisible"); }
  if (!Array.isArray(entries) || !entries.length || !object(state)) fail("journal et état incomplets");
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!object(entry) || entry.userId !== owner.userId || typeof entry.importId !== "string" || !entry.importId || ids.has(entry.importId) ||
      (entry.beforeRaw !== null && typeof entry.beforeRaw !== "string") ||
      (entry.candidateRaw !== null && typeof entry.candidateRaw !== "string")) fail("journal incohérent ou propriétaire incorrect");
    if (typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))) fail("date du journal invalide");
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

/** Stable, owner-bound forensic export. Never marks an operation repaired or verified. */
export async function exportResourceRecoveryDiagnostic(scoped: Scoped, owner: ValidatedStorageOwner, locks?: ResourceLockManager) {
  scoped.read(owner, "resources");
  return (locks ?? browserLocks()).request(resourceWriteLockName(owner.userId), { mode: "exclusive" }, async () => {
    let status = "ready", reason: string | null = null;
    try { assertResourceRecoveryClear(scoped, owner); }
    catch (error) {
      if (!(error instanceof ResourceRecoveryRequiredError)) throw error;
      status = "recovery-required"; reason = error.message;
    }
    return JSON.stringify({
      appName: "Travel Prospect CRM", storageScope: "resource-recovery-diagnostic", userId: owner.userId,
      capturedAt: new Date().toISOString(), status, reason,
      rawResources: scoped.read(owner, "resources"),
      rawJournal: scoped.read(owner, "resource-import-journal"),
      rawState: scoped.read(owner, "resource-import-state"),
      rawMigrationState: scoped.read(owner, "migration-state"),
    }, null, 2);
  });
}

/** Sole writer of resource data and its append-only recovery journal. */
export async function coordinateResourceWrite(options: {
  scoped: Scoped;
  owner: ValidatedStorageOwner;
  expectedRaw: string | null;
  candidateRaw: string | null;
  kind: "edit" | "import" | "migration";
  locks?: ResourceLockManager;
  sourceOwnerUserId?: string | null;
  preflight?: () => void;
  // Migration's other categories remain under the resource lock until fully verified.
  work?: () => Promise<void> | void;
}) {
  const { scoped, owner, expectedRaw, candidateRaw } = options;
  // Capture before waiting. No lock is ever implemented through a localStorage key.
  scoped.read(owner, "resources");
  if (candidateRaw === null && (expectedRaw !== null || options.kind !== "migration")) throw new Error("Suppression de clé Ressources interdite.");
  if (candidateRaw !== null && !Array.isArray(JSON.parse(candidateRaw))) throw new Error("Le candidat Ressources doit être une liste JSON.");
  return (options.locks ?? browserLocks()).request(resourceWriteLockName(owner.userId), { mode: "exclusive" }, async () => {
    scoped.read(owner, "resources"); // Owner/session validated again after lock wait.
    assertResourceRecoveryClear(scoped, owner);
    if (scoped.read(owner, "resources") !== expectedRaw) throw new Error("Conflit Ressources : destination modifiée depuis la lecture. Rechargez avant de recommencer.");
    options.preflight?.();
    const permit = Object.freeze({ userId: owner.userId });
    permits.set(permit, { scoped, owner });
    try {
      const old = scoped.read(owner, "resource-import-journal");
      const entries = old === null ? [] : JSON.parse(old) as unknown[];
      const importId = crypto.randomUUID(), createdAt = new Date().toISOString();
      const journal = JSON.stringify([...entries, { importId, userId: owner.userId, createdAt, kind: options.kind,
        sourceOwnerUserId: options.sourceOwnerUserId ?? null, beforeRaw: expectedRaw, candidateRaw }]);
      scoped.write(owner, "resource-import-journal", journal, permit);
      if (scoped.read(owner, "resource-import-journal") !== journal) fail("copie du journal non vérifiée");
      const pending = JSON.stringify({ userId: owner.userId, importId, createdAt, kind: options.kind, status: "pending" });
      scoped.write(owner, "resource-import-state", pending, permit);
      if (scoped.read(owner, "resource-import-state") !== pending) fail("état de préparation non vérifié");
      if (scoped.read(owner, "resources") !== expectedRaw) fail("destination modifiée pendant la préparation");
      if (candidateRaw !== null) scoped.write(owner, "resources", candidateRaw, permit);
      if (scoped.read(owner, "resources") !== candidateRaw) fail("copie Ressources non vérifiée");
      await options.work?.();
      if (scoped.read(owner, "resources") !== candidateRaw) fail("vérification finale Ressources échouée");
      const verified = JSON.stringify({ userId: owner.userId, importId, createdAt, kind: options.kind, status: "verified", verifiedAt: new Date().toISOString() });
      scoped.write(owner, "resource-import-state", verified, permit);
      if (scoped.read(owner, "resource-import-state") !== verified) fail("état final non vérifié");
    } catch (error) {
      try { assertResourceRecoveryClear(scoped, owner); }
      catch (recovery) { if (recovery instanceof ResourceRecoveryRequiredError) throw recovery; }
      throw error;
    } finally { permits.delete(permit); }
  });
}
