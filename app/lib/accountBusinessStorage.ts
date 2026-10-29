import type { createAccountScopedStorage, ValidatedStorageOwner } from "./accountScopedStorage";
import type { Prospect, Resource, AppSettings } from "./types";
import type { CustomMessageTemplates } from "./messageTemplateStorage";
import type { StreetMarketingSurveyStorage } from "./streetMarketingSurveyStorage";

/** 97C-2B1: preparation only. No page imports, auth calls, legacy reads or migration. */
export type AccountBusinessData = {
  prospects: Prospect[];
  resources: Resource[];
  settings: AppSettings;
  "custom-message-templates": CustomMessageTemplates;
  "street-marketing-survey": StreetMarketingSurveyStorage;
};
export type BusinessDataName = keyof AccountBusinessData;
type ScopedStorage = ReturnType<typeof createAccountScopedStorage>;

export type MigrationRequired = {
  status: "migration-required";
  label: "Migration nécessaire";
  reason: "missing" | "unverified" | "invalid";
};
export type BusinessStorageStatus = MigrationRequired | {
  status: "available";
  label: "Données disponibles";
  userId: string;
  verifiedAt: string;
};
export type BusinessReadResult<T> = MigrationRequired | {
  status: "absent";
} | {
  status: "available";
  data: T;
};

const names = new Set<string>([
  "prospects", "resources", "settings", "custom-message-templates", "street-marketing-survey",
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isDate(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}
function migrationRequired(reason: MigrationRequired["reason"]): MigrationRequired {
  return { status: "migration-required", label: "Migration nécessaire", reason };
}

/** Validate JSON containers without normalizing, filtering fields or rewriting legacy values. */
function assertBusinessShape(name: BusinessDataName, value: unknown): void {
  let valid = false;
  switch (name) {
    case "prospects":
    case "resources":
      valid = Array.isArray(value) && value.every(item => isRecord(item) && typeof item.id === "string");
      break;
    case "settings":
      valid = isRecord(value);
      break;
    case "custom-message-templates":
      valid = isRecord(value) && Object.values(value).every(message => typeof message === "string");
      break;
    case "street-marketing-survey":
      valid = isRecord(value) && typeof value.activeSurveyId === "string" &&
        Array.isArray(value.surveys) && value.surveys.every(survey =>
          isRecord(survey) && typeof survey.id === "string" && Array.isArray(survey.questions) &&
          survey.questions.every(question => typeof question === "string"));
      break;
  }
  if (!valid) throw new Error(`Format métier invalide : ${name}. Aucune donnée remplacée par défaut.`);
}

export function createAccountBusinessStorage(scoped: ScopedStorage) {
  /** Capture this owner once per operation/context; never rebind old results to a new account. */
  function forOwner(owner: ValidatedStorageOwner) {
    function getStatus(): BusinessStorageStatus {
      // The scoped layer rejects unknown/expired identities BEFORE reading any stored data.
      const raw = scoped.read(owner, "migration-state");
      if (raw === null) return migrationRequired("missing");
      let state: unknown;
      try { state = JSON.parse(raw); } catch { return migrationRequired("invalid"); }
      if (!isRecord(state) || state.userId !== owner.userId) return migrationRequired("invalid");
      if (state.status !== "verified") return migrationRequired("unverified");
      if (
        !isDate(state.createdAt) || !isDate(state.verifiedAt) ||
        typeof state.sourceFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(state.sourceFingerprint) ||
        state.active !== false
      ) return migrationRequired("invalid");
      // active:false is deliberately preserved: available to this adapter does not activate pages.
      return { status: "available", label: "Données disponibles", userId: owner.userId, verifiedAt: state.verifiedAt };
    }

    function read<K extends BusinessDataName>(name: K): BusinessReadResult<AccountBusinessData[K]> {
      if (!names.has(name)) throw new Error("Nom de données métier inconnu.");
      const status = getStatus();
      if (status.status !== "available") return status;
      const raw = scoped.read(owner, name);
      if (raw === null) return { status: "absent" };
      // Parse/storage errors propagate. Never convert unreadable data to [] or defaults.
      const value: unknown = JSON.parse(raw);
      assertBusinessShape(name, value);
      return { status: "available", data: value as AccountBusinessData[K] };
    }

    function write<K extends BusinessDataName>(name: K, value: AccountBusinessData[K]): void {
      if (!names.has(name)) throw new Error("Nom de données métier inconnu.");
      const status = getStatus();
      if (status.status !== "available") throw new Error(`${status.label} : écriture refusée (${status.reason}).`);
      assertBusinessShape(name, value);
      const raw = JSON.stringify(value);
      // Serialization may invoke application getters/toJSON. Recheck both the marker
      // and owner afterwards, and validate the actual value that will be stored.
      assertBusinessShape(name, JSON.parse(raw));
      const current = getStatus();
      if (current.status !== "available") throw new Error("Migration nécessaire : écriture refusée.");
      // One native setItem; no delete-before-write. Quota failures preserve the old value.
      // scoped.write checks owner/revision again immediately before this synchronous write.
      scoped.write(owner, name, raw);
    }

    getStatus(); // Fail immediately for a forged, missing, or stale owner token.
    return Object.freeze({
      getStatus, read, write,
      loadProspects: () => read("prospects"),
      saveProspects: (value: Prospect[]) => write("prospects", value),
      loadResources: () => read("resources"),
      saveResources: (value: Resource[]) => write("resources", value),
      loadSettings: () => read("settings"),
      saveSettings: (value: AppSettings) => write("settings", value),
      loadCustomMessageTemplates: () => read("custom-message-templates"),
      saveCustomMessageTemplates: (value: CustomMessageTemplates) => write("custom-message-templates", value),
      loadStreetMarketingSurvey: () => read("street-marketing-survey"),
      saveStreetMarketingSurvey: (value: StreetMarketingSurveyStorage) => write("street-marketing-survey", value),
    });
  }
  return Object.freeze({ forOwner });
}
