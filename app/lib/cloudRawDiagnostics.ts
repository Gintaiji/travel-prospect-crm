import { BUSINESS_CATEGORIES, isRecord, type SnapshotCategory } from "./cloudSnapshotContract";

/** Explicit historical keys only. Never enumerate storage or infer an owner. */
export const LEGACY_DIAGNOSTIC_KEYS: Readonly<Record<SnapshotCategory, string>> = Object.freeze({
  prospects: "travel-prospect-crm-prospects",
  resources: "travel-prospect-crm-resources",
  settings: "travel-prospect-crm-settings",
  "custom-message-templates": "travel-prospect-crm-custom-message-templates",
  "street-marketing-survey": "travel-prospect-crm-street-marketing-survey",
});
export type RawCategoryDiagnostic =
  | { status: "unreadable" }
  | { status: "absent"; raw: null }
  | { status: "corrupt"; raw: string; reason: "json" | "container" }
  | { status: "empty" | "present"; raw: string; value: unknown };

function identifiedList(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(item => isRecord(item) &&
    typeof item.id === "string" && item.id.trim() !== "") &&
    new Set(value.map(item => item.id)).size === value.length;
}

/** Container diagnosis only, never a business-schema or ownership certificate. */
export function diagnoseRawCategory(name: SnapshotCategory, raw: string | null): RawCategoryDiagnostic {
  if (raw === null) return { status: "absent", raw };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { status: "corrupt", raw, reason: "json" }; }
  let valid = false;
  let empty = false;
  switch (name) {
    case "prospects": case "resources":
      valid = identifiedList(value); empty = Array.isArray(value) && value.length === 0; break;
    case "settings":
      valid = isRecord(value); empty = valid && Object.keys(value as object).length === 0; break;
    case "custom-message-templates":
      valid = isRecord(value) && Object.values(value).every(item => typeof item === "string");
      empty = valid && Object.keys(value as object).length === 0; break;
    case "street-marketing-survey":
      valid = isRecord(value) && typeof value.activeSurveyId === "string" && identifiedList(value.surveys) &&
        value.surveys.every(survey => Array.isArray(survey.questions) && survey.questions.every(q => typeof q === "string")) &&
        (value.activeSurveyId === "" || value.surveys.some(survey => survey.id === value.activeSurveyId));
      empty = valid && isRecord(value) && (value.surveys as unknown[]).length === 0; break;
  }
  return valid ? { status: empty ? "empty" : "present", raw, value } : { status: "corrupt", raw, reason: "container" };
}

/** Injected read capability only; no browser globals, loaders, auth, or SDK imports.
 * Sequential reads are diagnostic, NOT an atomic snapshot. Even a fully present
 * result is ineligible for sync: owner, version and integrity remain unverified.
 */
export function readLegacyCloudDiagnostic(storage: Pick<Storage, "getItem">) {
  const categories = {} as Record<SnapshotCategory, RawCategoryDiagnostic>;
  for (const name of BUSINESS_CATEGORIES) {
    try { categories[name] = diagnoseRawCategory(name, storage.getItem(LEGACY_DIAGNOSTIC_KEYS[name])); }
    catch { categories[name] = { status: "unreadable" }; }
  }
  return { source: "legacy-global" as const, owner: "unverified" as const,
    revision: "unknown" as const, syncEligible: false as const, categories };
}
