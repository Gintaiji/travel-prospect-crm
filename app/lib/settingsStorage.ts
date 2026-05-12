import type { AppSettings } from "./types";

const SETTINGS_STORAGE_KEY = "travel-prospect-crm-settings";

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    defaultFollowUpDays:
      typeof settings.defaultFollowUpDays === "number"
        ? settings.defaultFollowUpDays
        : DEFAULT_APP_SETTINGS.defaultFollowUpDays,
  };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  userDisplayName: "",
  businessName: "Travel Prospect CRM",
  clubName: "club privé voyage",
  defaultCountry: "France",
  defaultRegion: "",
  defaultCity: "",
  defaultMessageStyle: "Naturel",
  defaultFollowUpDays: 3,
  defaultPresentationLink: "",
  messageSignature: "",
  publicWording: "plateforme voyage avec avantages membres",
  updatedAt: new Date().toISOString(),
};

export function loadSettings(): AppSettings {
  if (!isBrowser()) {
    return DEFAULT_APP_SETTINGS;
  }

  const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);

  if (!storedSettings) {
    return DEFAULT_APP_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(storedSettings) as Partial<AppSettings>);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
