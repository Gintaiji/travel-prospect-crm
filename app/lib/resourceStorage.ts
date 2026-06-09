import type { Resource } from "./types";
import { markLocalDataChanged } from "./localChangeTracker";

const RESOURCES_STORAGE_KEY = "travel-prospect-crm-resources";
const LEGACY_RESERVATION_RESOURCE_TYPE = "Réservation";

type StoredResource = Omit<Resource, "type"> & {
  type: Resource["type"] | typeof LEGACY_RESERVATION_RESOURCE_TYPE;
};

type NormalizedResources = {
  resources: Resource[];
  hasChanges: boolean;
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function normalizeResources(resources: StoredResource[]): NormalizedResources {
  let hasChanges = false;
  const normalizedResources = resources.map<Resource>((resource) => {
    if (resource.type !== LEGACY_RESERVATION_RESOURCE_TYPE) {
      return resource as Resource;
    }

    hasChanges = true;

    return {
      ...resource,
      type: "Rendez-vous",
    };
  });

  return {
    resources: normalizedResources,
    hasChanges,
  };
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
    const normalizedResources = normalizeResources(
      JSON.parse(storedResources) as StoredResource[],
    );

    if (normalizedResources.hasChanges) {
      localStorage.setItem(
        RESOURCES_STORAGE_KEY,
        JSON.stringify(normalizedResources.resources),
      );
      markLocalDataChanged();
    }

    return normalizedResources.resources;
  } catch {
    return [];
  }
}

export function saveResources(resources: Resource[]) {
  if (!isBrowser()) {
    return;
  }

  const normalizedResources = normalizeResources(resources);

  localStorage.setItem(
    RESOURCES_STORAGE_KEY,
    JSON.stringify(normalizedResources.resources),
  );
  markLocalDataChanged();
}

export function createResourceId() {
  return crypto.randomUUID();
}
