import { archiveReceipt, validFlatEntry, parseResourceArchive, resourceDigest } from "./resourceArchiveIntegrity";
import { assertResources } from "./resourceValidation";
import type { Resource } from "./types";

export const RESOURCE_JOURNAL_WARNING_BYTES = 1024 * 1024;

export function validReplacementStage(entry: Record<string, unknown>, userId: string) {
  if (entry.archiveVersion !== undefined) return validFlatEntry(entry, userId);
  if (entry.replacement === undefined) return true;
  const stage = entry.replacement as Record<string, unknown> | null;
  if (entry.kind !== "import" || entry.sourceOwnerUserId !== userId || typeof entry.beforeRaw !== "string" || !stage || stage.stagedRaw !== entry.candidateRaw ||
    typeof stage.diagnosticJson !== "string" || typeof stage.safetyJson !== "string") return false;
  try {
    const d = JSON.parse(stage.diagnosticJson), backup = JSON.parse(stage.safetyJson);
    return d?.appName === "Travel Prospect CRM" && d.storageScope === "resource-recovery-diagnostic" && d.userId === userId && d.status === "ready" &&
      d.rawResources === entry.beforeRaw && backup?.appName === "Travel Prospect CRM" && backup.storageScope === "account-resources" && backup.ownerUserId === userId &&
      backup.version === 5 && backup.purpose === "before-resource-import" && backup.rawResources === entry.beforeRaw &&
      JSON.stringify(backup.resources) === JSON.stringify(JSON.parse(entry.beforeRaw)) && (backup.archiveVersion === 2 ? backup.resourceFingerprint === resourceDigest(entry.beforeRaw as string) && JSON.stringify(backup.recoveryReceipt) === JSON.stringify(archiveReceipt(userId, stage.diagnosticJson as string)) : backup.archiveVersion === undefined && JSON.stringify(backup.recoveryDiagnostic) === JSON.stringify(d));
  } catch { return false; }
}

export function validRecoveryStage(entry: Record<string, unknown>, userId: string) {
  if (entry.archiveVersion !== undefined) return validFlatEntry(entry, userId);
  if (entry.kind !== "recovery") return true;
  if (entry.stagedRaw !== entry.candidateRaw || typeof entry.diagnosticJson !== "string") return false;
  try {
    const d = JSON.parse(entry.diagnosticJson);
    const source = entry.recoveredFrom as { operationId?: unknown; side?: unknown } | null;
    return d?.appName === "Travel Prospect CRM" && d.storageScope === "resource-recovery-diagnostic" && d.userId === userId &&
      d.status === "recovery-required" && d.rawResources === entry.beforeRaw && typeof d.rawJournal === "string" &&
      !!source && typeof source.operationId === "string" && ["beforeRaw", "candidateRaw"].includes(String(source.side));
  } catch { return false; }
}

/** Pure analysis of the existing, locked diagnostic snapshot. No storage access. */
export function assessResourceRecovery(userId: string, rawResources: string | null, rawJournal: string | null, rawState: string | null) {
  const integrity = (raw: unknown) => {
    if (raw === null) return "absent";
    if (typeof raw !== "string") return "corrupt";
    try {
      const value = JSON.parse(raw);
      if (!Array.isArray(value)) return "corrupt";
      assertResources(value as Resource[]);
      return "valid";
    } catch { return "corrupt"; }
  };
  let journal: unknown = null, state: unknown = null;
  let journalIntegrity = rawJournal === null ? "absent" : "valid";
  try { journal = rawJournal === null ? null : parseResourceArchive(rawJournal); }
  catch { journalIntegrity = "corrupt"; }
  try { state = rawState === null ? null : JSON.parse(rawState); } catch { /* reported separately */ }
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const entries = Array.isArray(journal) ? journal : [];
  if (rawJournal !== null && (!Array.isArray(journal) || !entries.length)) journalIntegrity = "corrupt";
  const ids = new Set<string>();
  const copies = entries.map((entry: unknown, index: number) => {
    if (!record(entry) || entry.userId !== userId) {
      journalIntegrity = "corrupt";
      return { operationId: null, before: "untrusted", candidate: "untrusted" };
    }
    const before = integrity(entry.beforeRaw), candidate = integrity(entry.candidateRaw);
    if (entry.kind === "initialization" && (index !== 0 || entry.beforeRaw !== null || entry.candidateRaw !== "[]")) journalIntegrity = "corrupt";
    if (typeof entry.importId !== "string" || !entry.importId || ids.has(entry.importId) ||
      typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt)) ||
      !["edit", "import", "migration", "recovery", "initialization"].includes(String(entry.kind)) || before === "corrupt" || candidate === "corrupt" || !validRecoveryStage(entry, userId) || !validReplacementStage(entry, userId)) journalIntegrity = "corrupt";
    ids.add(String(entry.importId));
    return { operationId: typeof entry.importId === "string" ? entry.importId : null, before, candidate };
  });
  const latest = entries.at(-1);
  const trusted = record(latest) && latest.userId === userId;
  const stateIntegrity = rawState === null ? "absent" : record(state) && state.userId === userId &&
    typeof state.importId === "string" && ["pending", "verified"].includes(String(state.status)) &&
    typeof state.createdAt === "string" && Number.isFinite(Date.parse(state.createdAt)) &&
    (state.status !== "verified" || (typeof state.verifiedAt === "string" && Number.isFinite(Date.parse(state.verifiedAt)))) ? "valid" : "corrupt";
  const resourcesIntegrity = integrity(rawResources);
  const journalBytes = rawJournal === null ? 0 : rawJournal.length * 2;
  const stateBytes = rawState === null ? 0 : rawState.length * 2;
  const options = ["Conserver et exporter le diagnostic avant toute décision."];
  if (resourcesIntegrity === "valid") options.push("Examiner la conservation des données actuelles après comparaison manuelle.");
  if (trusted && copies.at(-1)?.before === "valid") options.push("Examiner un retour à la copie avant opération, sans l’exécuter.");
  if (trusted && copies.at(-1)?.candidate === "valid") options.push("Examiner le candidat de l’opération, sans le valider ni le recopier.");
  options.push("Faire vérifier une sauvegarde JSON externe du même compte avant toute restauration ; aucun fichier externe n’a été inspecté.");
  return {
    resourcesIntegrity, journalIntegrity, stateIntegrity,
    corruptionDetected: [resourcesIntegrity, journalIntegrity, stateIntegrity].includes("corrupt"),
    operation: trusted ? { id: latest.importId, ownerUserId: userId, kind: latest.kind, createdAt: latest.createdAt,
      status: record(state) && state.importId === latest.importId ? state.status : "incomplete",
      matchesBefore: rawResources === latest.beforeRaw, matchesCandidate: rawResources === latest.candidateRaw } : null,
    copies, externalBackup: "not-inspected", options,
    journalStorage: { journalBytes, stateBytes, totalBytes: journalBytes + stateBytes,
      unit: "UTF-16 value bytes (estimate, excludes keys and browser overhead)",
      warningThresholdBytes: RESOURCE_JOURNAL_WARNING_BYTES, oversized: journalBytes + stateBytes >= RESOURCE_JOURNAL_WARNING_BYTES },
    retention: "Conserver tous les journaux et snapshots pendant une récupération. Prévoir ensuite un archivage exporté, relu et vérifié pour le même propriétaire, puis une politique explicite de conservation par âge et volume. Tout nettoyage futur exige une décision distincte, un verrou et une nouvelle vérification de session ; aucune suppression disponible ici.",
  };
}

/** Conservative eligibility: never reinterpret a damaged journal or foreign marker. */
export function recoverableResourceCopies(userId: string, rawResources: string | null, rawJournal: string | null, rawState: string | null) {
  const assessment = assessResourceRecovery(userId, rawResources, rawJournal, rawState);
  if (assessment.journalIntegrity !== "valid" || assessment.stateIntegrity === "corrupt" || assessment.resourcesIntegrity === "corrupt") {
    throw new Error("Récupération refusée : journal, état ou données invalides. Expertise manuelle nécessaire.");
  }
  const entries = JSON.parse(rawJournal!) as { importId: string; beforeRaw: string | null; candidateRaw: string | null; sourceOwnerUserId?: unknown }[];
  if (entries.some(entry => entry.sourceOwnerUserId != null && entry.sourceOwnerUserId !== userId)) throw new Error("Propriétaire de la source non confirmé pour ce compte.");
  return entries.flatMap(entry => (["beforeRaw", "candidateRaw"] as const).flatMap(side => {
    const raw = entry[side];
    return raw === null ? [] : [{ operationId: entry.importId, side, raw }];
  }));
}
