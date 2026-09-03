import type { AiCommand } from "./aiCommandTypes";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_COLOR_TYPES,
  PROSPECT_STATUSES,
  PROSPECT_TAGS,
  PROSPECT_TEMPERATURES,
} from "./types";

const commandKeys = ["action", "payload"] as const;
const searchProspectPayloadKeys = ["query"] as const;
const prospectTargetKeys = ["prospectId", "query"] as const;
const createProspectPayloadKeys = [
  "firstName",
  "lastName",
  "meetingPlace",
  "phone",
  "whatsapp",
  "email",
  "category",
  "status",
  "temperature",
  "colorType",
  "tags",
  "notes",
  "nextActionDate",
] as const;
const addNotePayloadKeys = ["target", "note"] as const;
const updateProspectPayloadKeys = ["target", "changes"] as const;
const updateProspectChangeKeys = [
  "colorType",
  "temperature",
  "status",
  "category",
  "tags",
  "nextActionDate",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "";
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isAllowedValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}

function isProspectTags(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((tag) => isAllowedValue(tag, PROSPECT_TAGS))
  );
}

function isOptionalString(value: unknown) {
  return typeof value === "string";
}

function isProspectCommandTarget(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, prospectTargetKeys)) {
    return false;
  }

  const keys = Object.keys(value);

  if (keys.length !== 1) {
    return false;
  }

  if ("prospectId" in value) {
    return isNonEmptyString(value.prospectId);
  }

  return "query" in value && isNonEmptyString(value.query);
}

function isSearchProspectPayload(value: unknown) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, searchProspectPayloadKeys) &&
    isNonEmptyString(value.query)
  );
}

function isCreateProspectPayload(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, createProspectPayloadKeys)) {
    return false;
  }

  if (!isNonEmptyString(value.firstName)) {
    return false;
  }

  return Object.entries(value).every(([key, fieldValue]) => {
    if (
      key === "firstName" ||
      key === "lastName" ||
      key === "meetingPlace" ||
      key === "phone" ||
      key === "whatsapp" ||
      key === "email" ||
      key === "notes" ||
      key === "nextActionDate"
    ) {
      return isOptionalString(fieldValue);
    }

    if (key === "category") {
      return isAllowedValue(fieldValue, PROSPECT_CATEGORIES);
    }

    if (key === "status") {
      return isAllowedValue(fieldValue, PROSPECT_STATUSES);
    }

    if (key === "temperature") {
      return isAllowedValue(fieldValue, PROSPECT_TEMPERATURES);
    }

    if (key === "colorType") {
      return isAllowedValue(fieldValue, PROSPECT_COLOR_TYPES);
    }

    if (key === "tags") {
      return isProspectTags(fieldValue);
    }

    return false;
  });
}

function isAddNotePayload(value: unknown) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, addNotePayloadKeys) &&
    isProspectCommandTarget(value.target) &&
    isNonEmptyString(value.note)
  );
}

function isUpdateProspectChanges(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, updateProspectChangeKeys)) {
    return false;
  }

  const keys = Object.keys(value);

  if (keys.length === 0) {
    return false;
  }

  return Object.entries(value).every(([key, fieldValue]) => {
    if (key === "colorType") {
      return isAllowedValue(fieldValue, PROSPECT_COLOR_TYPES);
    }

    if (key === "temperature") {
      return isAllowedValue(fieldValue, PROSPECT_TEMPERATURES);
    }

    if (key === "status") {
      return isAllowedValue(fieldValue, PROSPECT_STATUSES);
    }

    if (key === "category") {
      return isAllowedValue(fieldValue, PROSPECT_CATEGORIES);
    }

    if (key === "tags") {
      return isProspectTags(fieldValue);
    }

    if (key === "nextActionDate") {
      return typeof fieldValue === "string";
    }

    return false;
  });
}

function isUpdateProspectPayload(value: unknown) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, updateProspectPayloadKeys) &&
    isProspectCommandTarget(value.target) &&
    isUpdateProspectChanges(value.changes)
  );
}

export function isAiCommand(value: unknown): value is AiCommand {
  if (!isRecord(value) || !hasOnlyKeys(value, commandKeys)) {
    return false;
  }

  if (value.action === "searchProspect") {
    return isSearchProspectPayload(value.payload);
  }

  if (value.action === "createProspect") {
    return isCreateProspectPayload(value.payload);
  }

  if (value.action === "addNote") {
    return isAddNotePayload(value.payload);
  }

  if (value.action === "updateProspect") {
    return isUpdateProspectPayload(value.payload);
  }

  return false;
}
