const STARTUP_RESTORE_STATUS_STORAGE_KEY =
  "travel-prospect-crm-startup-restore-status";
const STARTUP_CLOUD_CHECK_RUNNING_STORAGE_KEY =
  "travel-prospect-crm-startup-cloud-check-running";

export type StartupRestoreStatus = {
  lastCheckedAt: string;
  lastRestoredAt: string;
  lastMessage: string;
};

const EMPTY_STARTUP_RESTORE_STATUS: StartupRestoreStatus = {
  lastCheckedAt: "",
  lastRestoredAt: "",
  lastMessage: "",
};

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeStartupRestoreStatus(
  status: Partial<StartupRestoreStatus> | null,
): StartupRestoreStatus {
  return {
    lastCheckedAt:
      typeof status?.lastCheckedAt === "string" ? status.lastCheckedAt : "",
    lastRestoredAt:
      typeof status?.lastRestoredAt === "string" ? status.lastRestoredAt : "",
    lastMessage:
      typeof status?.lastMessage === "string" ? status.lastMessage : "",
  };
}

export function loadStartupRestoreStatus(): StartupRestoreStatus {
  if (!isBrowser()) {
    return EMPTY_STARTUP_RESTORE_STATUS;
  }

  const savedStatus = localStorage.getItem(STARTUP_RESTORE_STATUS_STORAGE_KEY);

  if (!savedStatus) {
    return EMPTY_STARTUP_RESTORE_STATUS;
  }

  try {
    return normalizeStartupRestoreStatus(JSON.parse(savedStatus));
  } catch {
    return EMPTY_STARTUP_RESTORE_STATUS;
  }
}

export function saveStartupRestoreStatus(status: StartupRestoreStatus) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(
    STARTUP_RESTORE_STATUS_STORAGE_KEY,
    JSON.stringify(normalizeStartupRestoreStatus(status)),
  );
}

export function clearStartupRestoreStatus() {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(STARTUP_RESTORE_STATUS_STORAGE_KEY);
}

export function isStartupCloudCheckRunning() {
  if (!isBrowser()) {
    return false;
  }

  return (
    localStorage.getItem(STARTUP_CLOUD_CHECK_RUNNING_STORAGE_KEY) === "true"
  );
}

export function setStartupCloudCheckRunning(isRunning: boolean) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(
    STARTUP_CLOUD_CHECK_RUNNING_STORAGE_KEY,
    String(isRunning),
  );
}
