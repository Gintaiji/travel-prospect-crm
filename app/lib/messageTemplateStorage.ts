import type { MessageStyle, MessageTunnelStep } from "./messageTemplates";

const CUSTOM_MESSAGE_TEMPLATES_STORAGE_KEY =
  "travel-prospect-crm-custom-message-templates";

export type CustomMessageTemplates = Partial<
  Record<MessageTunnelStep, Partial<Record<MessageStyle, string>>>
>;

function isBrowser() {
  return typeof window !== "undefined";
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
    const parsedTemplates = JSON.parse(storedTemplates);

    return parsedTemplates && typeof parsedTemplates === "object"
      ? (parsedTemplates as CustomMessageTemplates)
      : {};
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
    JSON.stringify(customTemplates),
  );
}

export function clearCustomMessageTemplates() {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(CUSTOM_MESSAGE_TEMPLATES_STORAGE_KEY);
}
