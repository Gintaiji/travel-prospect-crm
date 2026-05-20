const LAST_BACKUP_DATE_STORAGE_KEY = "travel-prospect-crm-last-backup-date";
const BACKUP_REMINDER_DELAY_IN_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadLastBackupDate() {
  if (!isBrowser()) {
    return "";
  }

  return localStorage.getItem(LAST_BACKUP_DATE_STORAGE_KEY) ?? "";
}

export function saveLastBackupDate(date: string) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(LAST_BACKUP_DATE_STORAGE_KEY, date);
}

export function clearLastBackupDate() {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(LAST_BACKUP_DATE_STORAGE_KEY);
}

export function shouldShowBackupReminder(lastBackupDate: string) {
  if (!lastBackupDate) {
    return true;
  }

  const lastBackupTime = new Date(lastBackupDate).getTime();

  if (!Number.isFinite(lastBackupTime)) {
    return true;
  }

  const elapsedDays = (Date.now() - lastBackupTime) / MILLISECONDS_PER_DAY;

  return elapsedDays > BACKUP_REMINDER_DELAY_IN_DAYS;
}
