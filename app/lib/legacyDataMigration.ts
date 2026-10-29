import type { createAccountScopedStorage, ValidatedStorageOwner } from "./accountScopedStorage";

export const BUSINESS_STORAGE_NAMES = [
  "prospects", "resources", "settings", "street-marketing-survey", "custom-message-templates",
] as const;
type Name = (typeof BUSINESS_STORAGE_NAMES)[number];
type RawData = Record<Name, string | null>;
type ScopedStorage = ReturnType<typeof createAccountScopedStorage>;
type RawStorage = Pick<Storage, "getItem" | "setItem">;
export const LEGACY_MIGRATION_CLAIM_KEY = "travel-prospect-crm:legacy-migration:v1";
export const LEGACY_MIGRATION_LOCK = "travel-prospect-crm:legacy-migration";

export type MigrationPreview = Readonly<{
  userId: string;
  fingerprint: string;
  prospectsCount: number;
  available: readonly Name[];
  backupJson: string;
}>;

/** Manual copy only. No removals, normalization, cloud calls, or data activation. */
export function createLegacyDataMigration(dependencies: {
  scoped: ScopedStorage;
  getLegacyStorage: () => RawStorage;
  // Mandatory cross-tab exclusion; callers must fail closed if Web Locks is unavailable.
  withExclusiveLock: <T>(operation: () => Promise<T>) => Promise<T>;
}) {
  const previews = new WeakMap<MigrationPreview, { owner: ValidatedStorageOwner; raw: RawData }>();
  const storage = () => dependencies.getLegacyStorage();
  const readRaw = () => Object.fromEntries(BUSINESS_STORAGE_NAMES.map(name => [
    name, storage().getItem(`travel-prospect-crm-${name}`),
  ])) as RawData;
  const same = (a: RawData, b: RawData) => BUSINESS_STORAGE_NAMES.every(name => a[name] === b[name]);
  async function fingerprintOf(raw: RawData) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(raw)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function assertDestinationEmpty(owner: ValidatedStorageOwner) {
    for (const name of [...BUSINESS_STORAGE_NAMES, "migration-state"] as const) {
      if (dependencies.scoped.read(owner, name) !== null) {
        throw new Error("Destination déjà présente : aucune donnée ne sera écrasée.");
      }
    }
    if (storage().getItem(LEGACY_MIGRATION_CLAIM_KEY) !== null) {
      throw new Error("Ces données historiques ont déjà une migration réservée. Vérification manuelle requise.");
    }
  }

  async function preview(owner: ValidatedStorageOwner): Promise<MigrationPreview> {
    assertDestinationEmpty(owner);
    const raw = readRaw();
    const available = BUSINESS_STORAGE_NAMES.filter(name => raw[name] !== null);
    if (!available.length) throw new Error("Aucune donnée historique à copier.");
    const parsed: Partial<Record<Name, unknown>> = {};
    for (const name of available) {
      const value: unknown = JSON.parse(raw[name]!);
      const arrayExpected = name === "prospects" || name === "resources";
      if (arrayExpected ? !Array.isArray(value) : !value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Données historiques invalides : ${name}.`);
      }
      parsed[name] = value;
    }
    const fingerprint = await fingerprintOf(raw);
    assertDestinationEmpty(owner); // Revalidate account and destination after await.
    if (!same(raw, readRaw())) throw new Error("Les données historiques ont changé. Refaire l'aperçu.");
    const result: MigrationPreview = Object.freeze({
      userId: owner.userId, fingerprint,
      prospectsCount: (parsed.prospects as unknown[] | undefined)?.length ?? 0,
      available: Object.freeze(available),
      // Compatible with the current backup importer, plus exact raw strings for recovery.
      backupJson: JSON.stringify({
        appName: "Travel Prospect CRM", version: 4, exportedAt: new Date().toISOString(),
        prospects: parsed.prospects ?? [], resources: parsed.resources ?? [],
        settings: parsed.settings, streetMarketingSurvey: parsed["street-marketing-survey"],
        customMessageTemplates: parsed["custom-message-templates"],
        rawLegacyData: raw, sourceFingerprint: fingerprint,
      }, null, 2),
    });
    previews.set(result, { owner, raw });
    return result;
  }

  async function copy(preview: MigrationPreview, confirmation: {
    ownershipCertain: boolean;
    ownerUserId: string;
    jsonBackupSaved: boolean;
  }) {
    const captured = previews.get(preview);
    if (!captured || !confirmation.ownershipCertain || confirmation.ownerUserId !== preview.userId) {
      throw new Error("Propriétaire incertain : copie refusée.");
    }
    if (!confirmation.jsonBackupSaved) throw new Error("Une sauvegarde JSON préalable est obligatoire.");
    return dependencies.withExclusiveLock(async () => {
      const { owner, raw } = captured;
      assertDestinationEmpty(owner);
      if (!same(raw, readRaw())) throw new Error("Les données historiques ont changé. Refaire l'aperçu.");
      const createdAt = new Date().toISOString();
      const claim = JSON.stringify({ userId: owner.userId, sourceFingerprint: preview.fingerprint, createdAt });
      // Reserve globally before copying so the same unowned legacy set cannot be assigned
      // to another account. A failed attempt stays reserved for manual recovery.
      storage().setItem(LEGACY_MIGRATION_CLAIM_KEY, claim);
      if (storage().getItem(LEGACY_MIGRATION_CLAIM_KEY) !== claim) throw new Error("Réservation non vérifiée.");
      const state = { userId: owner.userId, createdAt, sourceFingerprint: preview.fingerprint, active: false };
      const pending = JSON.stringify({ ...state, status: "copying" });
      dependencies.scoped.write(owner, "migration-state", pending);
      if (dependencies.scoped.read(owner, "migration-state") !== pending) throw new Error("État non vérifié.");
      for (const name of preview.available) {
        if (!same(raw, readRaw())) throw new Error("Source modifiée pendant la copie.");
        if (dependencies.scoped.read(owner, name) !== null) throw new Error("Conflit de destination.");
        dependencies.scoped.write(owner, name, raw[name]!);
        if (dependencies.scoped.read(owner, name) !== raw[name]) throw new Error(`Copie non vérifiée : ${name}.`);
      }
      for (const name of BUSINESS_STORAGE_NAMES) {
        if (dependencies.scoped.read(owner, name) !== raw[name]) throw new Error("Vérification finale échouée.");
      }
      if (!same(raw, readRaw())) throw new Error("Source modifiée pendant la copie.");
      const completed = JSON.stringify({ ...state, status: "verified", verifiedAt: new Date().toISOString() });
      dependencies.scoped.write(owner, "migration-state", completed);
      if (dependencies.scoped.read(owner, "migration-state") !== completed) throw new Error("État final non vérifié.");
      return { ...state, status: "verified" as const };
    });
  }
  async function inspectState(owner: ValidatedStorageOwner) {
    const saved = dependencies.scoped.read(owner, "migration-state");
    if (saved === null) return null;
    const state = JSON.parse(saved);
    if (!state || state.userId !== owner.userId || typeof state.sourceFingerprint !== "string") {
      throw new Error("État de migration invalide.");
    }
    const raw = readRaw();
    const fingerprint = await fingerprintOf(raw);
    if (dependencies.scoped.read(owner, "migration-state") !== saved || !same(raw, readRaw())) {
      throw new Error("État modifié pendant la vérification.");
    }
    return { status: state.status as string, createdAt: state.createdAt as string,
      active: false as const, sourceChanged: fingerprint !== state.sourceFingerprint };
  }
  return { preview, copy, inspectState };
}
