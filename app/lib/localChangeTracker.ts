const LAST_LOCAL_CHANGE_DATE_STORAGE_KEY =
  "travel-prospect-crm-last-local-change-date";
const LOCAL_DATA_CHANGED_EVENT = "travel-prospect-crm-local-data-changed";

let isLocalChangeTrackingPausedValue = false;

function isBrowser() {
  return typeof window !== "undefined";
}

export function pauseLocalChangeTracking() {
  isLocalChangeTrackingPausedValue = true;
}

export function resumeLocalChangeTracking() {
  isLocalChangeTrackingPausedValue = false;
}

export function isLocalChangeTrackingPaused() {
  return isLocalChangeTrackingPausedValue;
}

export function markLocalDataChanged() {
  if (!isBrowser() || isLocalChangeTrackingPaused()) {
    return;
  }

  localStorage.setItem(
    LAST_LOCAL_CHANGE_DATE_STORAGE_KEY,
    new Date().toISOString(),
  );
  window.dispatchEvent(new Event(LOCAL_DATA_CHANGED_EVENT));
}

export function loadLastLocalChangeDate() {
  if (!isBrowser()) {
    return "";
  }

  return localStorage.getItem(LAST_LOCAL_CHANGE_DATE_STORAGE_KEY) ?? "";
}

export function clearLastLocalChangeDate() {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(LAST_LOCAL_CHANGE_DATE_STORAGE_KEY);
}

export function subscribeToLocalDataChanges(callback: () => void) {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(LOCAL_DATA_CHANGED_EVENT, callback);

  return () => window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, callback);
}
