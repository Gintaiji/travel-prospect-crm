import type { Resource } from "./types";
import type { SessionCapture, UserSessionStore } from "./userSessionStore";
import { ResourceRecoveryRequiredError } from "./resourceWriteCoordinator";

export type AvailableResources = {
  status: "available";
  resources: Resource[];
  userId: string | null;
  generation: number | null;
  save: (resources: Resource[]) => void | Promise<void>;
  assertCurrent: () => void;
  isCurrent: () => boolean;
};
export type ResourceAccessResult = AvailableResources | {
  status: "recovery-required";
  label: string;
} | {
  status: "migration-required";
  label: "Migration nécessaire";
} | {
  status: "absent";
  label: string;
};

export function assertResources(resources: Resource[]) {
  if (!Array.isArray(resources) || resources.some(resource =>
    !resource || [resource.id, resource.title, resource.type, resource.url, resource.notes,
      resource.createdAt, resource.updatedAt].some(value => typeof value !== "string") ||
    typeof resource.isFavorite !== "boolean" ||
    (resource.subCategory !== undefined && typeof resource.subCategory !== "string"))) {
    throw new Error("Format des ressources isolées invalide. Aucune donnée remplacée.");
  }
}

/** Shared resource-only seam. Legacy access is a mode, NEVER a fallback for isolated errors. */
export function createResourceAccess(dependencies: {
  isolated: boolean;
  sessionStore: UserSessionStore;
  legacy: { load: () => Resource[]; save: (resources: Resource[]) => void };
}) {
  async function load(capture?: SessionCapture): Promise<ResourceAccessResult> {
    if (!dependencies.isolated) {
      return { status: "available", resources: dependencies.legacy.load(), userId: null, generation: null,
        save: dependencies.legacy.save, assertCurrent: () => {}, isCurrent: () => true };
    }
    if (!capture) throw new Error("Identité confirmée nécessaire pour lire les ressources.");
    const operation = await dependencies.sessionStore.beginOperation(capture);
    operation.assertCurrent();
    let result;
    try { result = operation.business.loadResources(); }
    catch (error) {
      if (error instanceof ResourceRecoveryRequiredError) return { status: "recovery-required", label: error.message };
      throw error;
    }
    if (result.status === "migration-required") return { status: "migration-required", label: "Migration nécessaire" };
    if (result.status === "absent") return {
      status: "absent", label: "Données Ressources absentes du stockage isolé. Vérification manuelle nécessaire.",
    };
    assertResources(result.data);
    let expectedRaw = dependencies.sessionStore.scopedStorage.read(operation.owner, "resources");
    if (expectedRaw === null || JSON.stringify(JSON.parse(expectedRaw)) !== JSON.stringify(result.data)) throw new Error("Ressources modifiées pendant la lecture. Rechargez.");
    return {
      status: "available", resources: result.data, userId: operation.userId, generation: operation.generation,
      assertCurrent: operation.assertCurrent,
      isCurrent: () => { try { operation.assertCurrent(); return true; } catch { return false; } },
      async save(resources) {
        operation.assertCurrent();
        assertResources(resources);
        const before = expectedRaw;
        const candidate = JSON.stringify(resources);
        await operation.business.saveResources(JSON.parse(candidate), before);
        operation.assertCurrent();
        expectedRaw = candidate;
      },
    };
  }
  return { load };
}
