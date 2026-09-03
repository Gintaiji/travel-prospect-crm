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

function normalizeFollowUp4DaysMessage(message: string) {
  return message
    .replaceAll("[lieu de rencontre]", "{{lieu de rencontre}}")
    .replaceAll("c’est Kévin", "c’est {{nom_affiche}}")
    .replaceAll("Je suis désolée", "Je suis désolé");
}

function normalizeCustomMessageTemplate(
  templateId: FollowUpMessageTemplateId,
  message: string,
) {
  return templateId === "follow-up-4-days"
    ? normalizeFollowUp4DaysMessage(message)
    : message;
}

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
        const allowedTemplateId = templateId as FollowUpMessageTemplateId;
        normalizedTemplates[allowedTemplateId] = normalizeCustomMessageTemplate(
          allowedTemplateId,
          message,
        );
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
    const customTemplates = normalizeCustomMessageTemplates(JSON.parse(storedTemplates));

    if (storedTemplates !== JSON.stringify(customTemplates)) {
      saveCustomMessageTemplates(customTemplates);
    }

    return customTemplates;
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
