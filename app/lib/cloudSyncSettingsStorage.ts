export type CloudSyncSettings = {
  autoSyncEnabled: boolean;
  autoSyncDelaySeconds: number;
  updatedAt: string;
};

const CLOUD_SYNC_SETTINGS_STORAGE_KEY =
  "travel-prospect-crm-cloud-sync-settings";
const CLOUD_SYNC_SETTINGS_CHANGED_EVENT =
  "travel-prospect-crm-cloud-sync-settings-changed";

export const DEFAULT_CLOUD_SYNC_SETTINGS: CloudSyncSettings = {
  autoSyncEnabled: true,
  autoSyncDelaySeconds: 30,
  updatedAt: "",
};

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeCloudSyncSettings(
  settings: Partial<CloudSyncSettings>,
): CloudSyncSettings {
  return {
    autoSyncEnabled:
      typeof settings.autoSyncEnabled === "boolean"
        ? settings.autoSyncEnabled
        : DEFAULT_CLOUD_SYNC_SETTINGS.autoSyncEnabled,
    autoSyncDelaySeconds:
      typeof settings.autoSyncDelaySeconds === "number"
        ? Math.max(10, settings.autoSyncDelaySeconds)
        : DEFAULT_CLOUD_SYNC_SETTINGS.autoSyncDelaySeconds,
    updatedAt:
      typeof settings.updatedAt === "string"
        ? settings.updatedAt
        : DEFAULT_CLOUD_SYNC_SETTINGS.updatedAt,
  };
}

export function loadCloudSyncSettings(): CloudSyncSettings {
  if (!isBrowser()) {
    return DEFAULT_CLOUD_SYNC_SETTINGS;
  }

  const storedSettings = localStorage.getItem(CLOUD_SYNC_SETTINGS_STORAGE_KEY);

  if (!storedSettings) {
    return DEFAULT_CLOUD_SYNC_SETTINGS;
  }

  try {
    return normalizeCloudSyncSettings(
      JSON.parse(storedSettings) as Partial<CloudSyncSettings>,
    );
  } catch {
    return DEFAULT_CLOUD_SYNC_SETTINGS;
  }
}

export function saveCloudSyncSettings(settings: CloudSyncSettings) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(
    CLOUD_SYNC_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeCloudSyncSettings(settings)),
  );
  window.dispatchEvent(new Event(CLOUD_SYNC_SETTINGS_CHANGED_EVENT));
}

export function subscribeToCloudSyncSettingsChanges(callback: () => void) {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(CLOUD_SYNC_SETTINGS_CHANGED_EVENT, callback);

  return () =>
    window.removeEventListener(CLOUD_SYNC_SETTINGS_CHANGED_EVENT, callback);
}
