import {
  FOLLOW_UP_MESSAGE_TEMPLATES,
  type FollowUpMessageTemplateId,
} from "./messageTemplates";
import { markLocalDataChanged } from "./localChangeTracker";

const CUSTOM_MESSAGE_TEMPLATES_STORAGE_KEY =
  "travel-prospect-crm-custom-message-templates";

export type CustomMessageTemplates = Partial<Record<FollowUpMessageTemplateId, string>>;

const allowedTemplateIds = new Set<FollowUpMessageTemplateId>(
  FOLLOW_UP_MESSAGE_TEMPLATES.map((template) => template.id),
);

function isBrowser() {
  return typeof window !== "undefined";
}

export function normalizeCustomMessageTemplates(
  value: unknown,
): CustomMessageTemplates {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<CustomMessageTemplates>(
    (normalizedTemplates, [templateId, message]) => {
      if (allowedTemplateIds.has(templateId as FollowUpMessageTemplateId) && typeof message === "string") {
        normalizedTemplates[templateId as FollowUpMessageTemplateId] = message;
      }

      return normalizedTemplates;
    },
    {},
  );
}

export function loadCustomMessageTemplates(): CustomMessageTemplates {
  if (!isBrowser()) {
    return {};
  }

  const storedTemplates = localStorage.getItem(CUSTOM_MESSAGE_TEMPLATES_STORAGE_KEY);

  if (!storedTemplates) {
    return {};
  }

  try {
    return normalizeCustomMessageTemplates(JSON.parse(storedTemplates));
  } catch {
    return {};
  }
}

export function saveCustomMessageTemplates(customTemplates: CustomMessageTemplates) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(
    CUSTOM_MESSAGE_TEMPLATES_STORAGE_KEY,
    JSON.stringify(normalizeCustomMessageTemplates(customTemplates)),
  );
  markLocalDataChanged();
}

export function clearCustomMessageTemplates() {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(CUSTOM_MESSAGE_TEMPLATES_STORAGE_KEY);
  markLocalDataChanged();
}
