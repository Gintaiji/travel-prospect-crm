import { calculateProspectScore } from "./prospectUtils";
import { PROSPECT_TAGS, type Prospect } from "./types";
import { markLocalDataChanged } from "./localChangeTracker";

const PROSPECTS_STORAGE_KEY = "travel-prospect-crm-prospects";

function isBrowser() {
  return typeof window !== "undefined";
}

function cleanProspectTags(prospects: Prospect[]) {
  let hasChanged = false;

  const cleanedProspects = prospects.map((prospect) => {
    const currentTags = Array.isArray(prospect.tags) ? prospect.tags : [];
    const cleanedTags = currentTags.filter((tag): tag is Prospect["tags"][number] =>
      PROSPECT_TAGS.includes(tag as Prospect["tags"][number]),
    );

    if (cleanedTags.length === currentTags.length) {
      return prospect;
    }

    hasChanged = true;

    const cleanedProspect: Prospect = {
      ...prospect,
      tags: cleanedTags,
    };

    return {
      ...cleanedProspect,
      score: calculateProspectScore(cleanedProspect),
    };
  });

  return { cleanedProspects, hasChanged };
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
    const parsedProspects = JSON.parse(storedProspects) as Prospect[];
    const { cleanedProspects, hasChanged } = cleanProspectTags(parsedProspects);

    if (hasChanged) {
      saveProspects(cleanedProspects);
    }

    return cleanedProspects;
  } catch {
    return [];
  }
}

export function saveProspects(prospects: Prospect[]) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(PROSPECTS_STORAGE_KEY, JSON.stringify(prospects));
  markLocalDataChanged();
}

export function createProspectId() {
  return crypto.randomUUID();
}
