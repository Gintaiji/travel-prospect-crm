import type { Resource } from "./types";

export function assertResources(resources: Resource[]) {
  if (!Array.isArray(resources) || resources.some(resource =>
    !resource || [resource.id, resource.title, resource.type, resource.url, resource.notes,
      resource.createdAt, resource.updatedAt].some(value => typeof value !== "string") ||
    typeof resource.isFavorite !== "boolean" ||
    (resource.subCategory !== undefined && typeof resource.subCategory !== "string"))) {
    throw new Error("Format des ressources isolées invalide. Aucune donnée remplacée.");
  }
}

