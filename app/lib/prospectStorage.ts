import type { Prospect } from "./types";

const PROSPECTS_STORAGE_KEY = "travel-prospect-crm-prospects";

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadProspects(): Prospect[] {
  if (!isBrowser()) {
    return [];
  }

  const storedProspects = localStorage.getItem(PROSPECTS_STORAGE_KEY);

  if (!storedProspects) {
    return [];
  }

  try {
    return JSON.parse(storedProspects) as Prospect[];
  } catch {
    return [];
  }
}

export function saveProspects(prospects: Prospect[]) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(PROSPECTS_STORAGE_KEY, JSON.stringify(prospects));
}

export function createProspectId() {
  return crypto.randomUUID();
}