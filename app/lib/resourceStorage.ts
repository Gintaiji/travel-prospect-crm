import type { Resource } from "./types";

const RESOURCES_STORAGE_KEY = "travel-prospect-crm-resources";

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadResources(): Resource[] {
  if (!isBrowser()) {
    return [];
  }

  const storedResources = localStorage.getItem(RESOURCES_STORAGE_KEY);

  if (!storedResources) {
    return [];
  }

  try {
    return JSON.parse(storedResources) as Resource[];
  } catch {
    return [];
  }
}

export function saveResources(resources: Resource[]) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(resources));
}

export function createResourceId() {
  return crypto.randomUUID();
}
