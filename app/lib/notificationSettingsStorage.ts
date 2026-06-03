export type NotificationSettings = {
  notificationsEnabled: boolean;
  notifyProspectsToContact: boolean;
  notifyLateFollowUps: boolean;
  lastNotificationDate: string;
  updatedAt: string;
};

const NOTIFICATION_SETTINGS_STORAGE_KEY =
  "travel-prospect-crm-notification-settings";

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeNotificationSettings(
  settings: Partial<NotificationSettings>,
): NotificationSettings {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...settings,
    notificationsEnabled:
      typeof settings.notificationsEnabled === "boolean"
        ? settings.notificationsEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.notificationsEnabled,
    notifyProspectsToContact:
      typeof settings.notifyProspectsToContact === "boolean"
        ? settings.notifyProspectsToContact
        : DEFAULT_NOTIFICATION_SETTINGS.notifyProspectsToContact,
    notifyLateFollowUps:
      typeof settings.notifyLateFollowUps === "boolean"
        ? settings.notifyLateFollowUps
        : DEFAULT_NOTIFICATION_SETTINGS.notifyLateFollowUps,
  };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notificationsEnabled: false,
  notifyProspectsToContact: true,
  notifyLateFollowUps: true,
  lastNotificationDate: "",
  updatedAt: "",
};

export function loadNotificationSettings(): NotificationSettings {
  if (!isBrowser()) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  const storedSettings = localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);

  if (!storedSettings) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  try {
    return normalizeNotificationSettings(
      JSON.parse(storedSettings) as Partial<NotificationSettings>,
    );
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(
    NOTIFICATION_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeNotificationSettings(settings)),
  );
  window.dispatchEvent(new Event("travel-prospect-crm-notification-settings"));
}

export function subscribeToNotificationSettingsChanges(
  callback: () => void,
) {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(
    "travel-prospect-crm-notification-settings",
    callback,
  );
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(
      "travel-prospect-crm-notification-settings",
      callback,
    );
    window.removeEventListener("storage", callback);
  };
}
