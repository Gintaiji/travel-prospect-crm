export type ResourceSpaceEstimate = { availableBytes: number | null; usedBytes: number | null; source: string };
export type ResourceRecoverySpace = ResourceSpaceEstimate & {
  requiredAdditionalBytes: number; reserveBytes: number; status: "sufficient-estimate" | "insufficient" | "unknown";
};
// A conservative application budget, NOT the browser's actual localStorage quota.
export const RESOURCE_RECOVERY_BUDGET_BYTES = 4 * 1024 * 1024;
export const RESOURCE_RECOVERY_RESERVE_BYTES = 64 * 1024;

/** Aggregate origin usage only; never expose other accounts' keys or values. No probe writes. */
export function readBrowserRecoverySpace(): ResourceSpaceEstimate {
  try {
    if (typeof window === "undefined") throw new Error("Browser required");
    const storage = window.localStorage;
    if (!Number.isSafeInteger(storage.length) || typeof storage.key !== "function") throw new Error("Storage enumeration unavailable");
    let usedBytes = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null) throw new Error("Storage changed");
      const raw = storage.getItem(key);
      if (raw === null) throw new Error("Storage changed");
      usedBytes += (key.length + raw.length) * 2;
    }
    return { availableBytes: Math.max(0, RESOURCE_RECOVERY_BUDGET_BYTES - usedBytes), usedBytes, source: "UTF-16 origin estimate; conservative 4 MiB policy, not browser quota" };
  } catch {
    return { availableBytes: null, usedBytes: null, source: "unavailable" };
  }
}

/** Peak net growth across the exact journal/pending/data/verified writes, with a reserve. */
export function assessRecoverySpace(estimate: ResourceSpaceEstimate, changes: readonly { key: string; before: string | null; after: string }[]): ResourceRecoverySpace {
  let growth = 0, peak = 0;
  for (const change of changes) {
    growth += 2 * (change.after.length - (change.before?.length ?? 0) + (change.before === null ? change.key.length : 0));
    peak = Math.max(peak, growth);
  }
  const valid = (n: number | null) => n !== null && Number.isSafeInteger(n) && n >= 0;
  const availableBytes = valid(estimate.availableBytes) ? estimate.availableBytes : null;
  return { availableBytes, usedBytes: valid(estimate.usedBytes) ? estimate.usedBytes : null, source: estimate.source,
    requiredAdditionalBytes: peak, reserveBytes: RESOURCE_RECOVERY_RESERVE_BYTES,
    status: availableBytes === null ? "unknown" : availableBytes < peak + RESOURCE_RECOVERY_RESERVE_BYTES ? "insufficient" : "sufficient-estimate" };
}

export function isResourceQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; code?: unknown };
  return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014;
}

export class ResourceQuotaError extends Error {
  constructor() {
    super("Récupération nécessaire : espace localStorage insuffisant (QuotaExceededError). Aucune récupération par écriture n’est garantie. Conserver les données et exporter les copies saines, puis relire les fichiers pour les vérifier.");
    this.name = "QuotaExceededError";
  }
}

export class ResourceRecoverySpaceError extends Error {
  constructor(public readonly assessment: ResourceRecoverySpace) {
    super(assessment.status === "unknown"
      ? "Récupération par écriture bloquée : espace disponible inconnu. Exporter et vérifier les copies sans écrire dans localStorage."
      : "Récupération par écriture bloquée : espace localStorage estimé insuffisant. Exporter et vérifier toutes les copies avant toute libération manuelle d’espace.");
    this.name = "ResourceRecoverySpaceError";
  }
}
