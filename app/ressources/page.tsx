"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createResourceId,
  loadResources,
  saveResources,
} from "../lib/resourceStorage";
import { RESOURCE_TYPES, type Resource } from "../lib/types";

type ResourceFormState = {
  title: string;
  type: Resource["type"];
  url: string;
  notes: string;
  isFavorite: boolean;
};

type FavoriteFilter = "Tous" | "Favoris uniquement";
type TypeFilter = "Tous" | Resource["type"];

const initialResourceFormState: ResourceFormState = {
  title: "",
  type: RESOURCE_TYPES[0],
  url: "",
  notes: "",
  isFavorite: false,
};

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function getResourceSearchText(resource: Resource) {
  return normalizeSearchText(
    [
      resource.title,
      resource.type,
      resource.url,
      resource.notes,
    ].join(" "),
  );
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [formState, setFormState] = useState<ResourceFormState>(initialResourceFormState);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editingFormState, setEditingFormState] = useState<ResourceFormState>(initialResourceFormState);
  const [copiedResourceId, setCopiedResourceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("Tous");
  const [favoriteFilter, setFavoriteFilter] = useState<FavoriteFilter>("Tous");

  useEffect(() => {
    const loadStoredResources = window.setTimeout(() => {
      setResources(loadResources());
    }, 0);

    return () => window.clearTimeout(loadStoredResources);
  }, []);

  const filteredResources = useMemo(() => {
    const normalizedSearchQuery = normalizeSearchText(searchQuery);

    return resources
      .filter((resource) => {
        const matchesSearch =
          !normalizedSearchQuery || getResourceSearchText(resource).includes(normalizedSearchQuery);
        const matchesType = typeFilter === "Tous" || resource.type === typeFilter;
        const matchesFavorite =
          favoriteFilter === "Tous" || resource.isFavorite;

        return matchesSearch && matchesType && matchesFavorite;
      })
      .sort((firstResource, secondResource) => {
        if (firstResource.isFavorite !== secondResource.isFavorite) {
          return firstResource.isFavorite ? -1 : 1;
        }

        return secondResource.createdAt.localeCompare(firstResource.createdAt);
      });
  }, [resources, searchQuery, typeFilter, favoriteFilter]);

  function updateFormField<Field extends keyof ResourceFormState>(
    field: Field,
    value: ResourceFormState[Field],
  ) {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateEditingFormField<Field extends keyof ResourceFormState>(
    field: Field,
    value: ResourceFormState[Field],
  ) {
    setEditingFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function handleCreateResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const now = new Date().toISOString();
    const newResource: Resource = {
      id: createResourceId(),
      title: formState.title.trim(),
      type: formState.type,
      url: formState.url.trim(),
      notes: formState.notes.trim(),
      isFavorite: formState.isFavorite,
      createdAt: now,
      updatedAt: now,
    };
    const updatedResources = [newResource, ...resources];

    saveResources(updatedResources);
    setResources(updatedResources);
    setFormState(initialResourceFormState);
  }

  function openEditResourceForm(resource: Resource) {
    setEditingResourceId(resource.id);
    setEditingFormState({
      title: resource.title,
      type: resource.type,
      url: resource.url,
      notes: resource.notes,
      isFavorite: resource.isFavorite,
    });
  }

  function handleUpdateResource(resourceId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const updatedResources = resources.map((resource) => {
      if (resource.id !== resourceId) {
        return resource;
      }

      return {
        ...resource,
        title: editingFormState.title.trim(),
        type: editingFormState.type,
        url: editingFormState.url.trim(),
        notes: editingFormState.notes.trim(),
        isFavorite: editingFormState.isFavorite,
        updatedAt: new Date().toISOString(),
      };
    });

    saveResources(updatedResources);
    setResources(updatedResources);
    setEditingResourceId(null);
    setEditingFormState(initialResourceFormState);
  }

  function handleDeleteResource(resourceId: string) {
    const confirmed = window.confirm("Supprimer cette ressource ? Cette action est définitive.");

    if (!confirmed) {
      return;
    }

    const updatedResources = resources.filter((resource) => resource.id !== resourceId);

    saveResources(updatedResources);
    setResources(updatedResources);

    if (editingResourceId === resourceId) {
      setEditingResourceId(null);
      setEditingFormState(initialResourceFormState);
    }
  }

  async function handleCopyResourceLink(resource: Resource) {
    if (!resource.url || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(resource.url);
    setCopiedResourceId(resource.id);
    window.setTimeout(() => {
      setCopiedResourceId((currentResourceId) =>
        currentResourceId === resource.id ? null : currentResourceId,
      );
    }, 1800);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Liens utiles
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Ressources
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Retrouve rapidement tes liens utiles pour présenter le club privé et accompagner tes conversations.
          </p>
        </header>

        <form
          className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
          onSubmit={handleCreateResource}
        >
          <div className="mb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Nouvelle ressource
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              Titre
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={formState.title}
                onChange={(event) => updateFormField("title", event.target.value)}
                placeholder="Présentation courte"
                required
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              Type
              <select
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                value={formState.type}
                onChange={(event) =>
                  updateFormField("type", event.target.value as Resource["type"])
                }
              >
                {RESOURCE_TYPES.map((resourceType) => (
                  <option key={resourceType} value={resourceType}>
                    {resourceType}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
              URL
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={formState.url}
                onChange={(event) => updateFormField("url", event.target.value)}
                placeholder="https://..."
                required
                type="url"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
              Notes
              <textarea
                className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={formState.notes}
                onChange={(event) => updateFormField("notes", event.target.value)}
                placeholder="Contexte, usage conseillé, audience..."
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              <input
                checked={formState.isFavorite}
                className="h-4 w-4 accent-emerald-400"
                onChange={(event) => updateFormField("isFavorite", event.target.checked)}
                type="checkbox"
              />
              Favori oui/non
            </label>
          </div>

          <button
            className="mt-5 min-h-11 rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            type="submit"
          >
            Ajouter la ressource
          </button>
        </form>

        <section className="mb-6 rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl sm:p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm text-slate-300">
              Recherche
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Titre, type, URL, notes..."
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              Type
              <select
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              >
                <option value="Tous">Tous</option>
                {RESOURCE_TYPES.map((resourceType) => (
                  <option key={resourceType} value={resourceType}>
                    {resourceType}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              Favoris
              <select
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                value={favoriteFilter}
                onChange={(event) => setFavoriteFilter(event.target.value as FavoriteFilter)}
              >
                <option value="Tous">Tous</option>
                <option value="Favoris uniquement">Favoris uniquement</option>
              </select>
            </label>
          </div>
        </section>

        {filteredResources.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-xl">
            <p className="text-sm text-slate-300">
              Aucune ressource pour le moment. Ajoute tes premiers liens utiles.
            </p>
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {filteredResources.map((resource) => {
              const isEditing = editingResourceId === resource.id;

              return (
                <article
                  className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
                  key={resource.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-white">{resource.title}</h2>
                        {resource.isFavorite ? (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                            Favori
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-medium text-emerald-300">{resource.type}</p>
                      <a
                        className="mt-2 block break-all text-sm text-sky-200 underline-offset-4 hover:underline"
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {resource.url}
                      </a>
                    </div>
                  </div>

                  {resource.notes ? (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm leading-6 text-slate-300">
                      {resource.notes}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                      type="button"
                      onClick={() => handleCopyResourceLink(resource)}
                    >
                      Copier le lien
                    </button>
                    <a
                      className="min-h-10 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20"
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir
                    </a>
                    <button
                      className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                      type="button"
                      onClick={() => openEditResourceForm(resource)}
                    >
                      Modifier
                    </button>
                    <button
                      className="min-h-10 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                      type="button"
                      onClick={() => handleDeleteResource(resource.id)}
                    >
                      Supprimer
                    </button>
                    {copiedResourceId === resource.id ? (
                      <p className="flex items-center text-xs font-medium text-emerald-300">
                        Lien copié.
                      </p>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <form
                      className="mt-4 grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3"
                      onSubmit={(event) => handleUpdateResource(resource.id, event)}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1 text-xs text-slate-300">
                          Titre
                          <input
                            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                            value={editingFormState.title}
                            onChange={(event) => updateEditingFormField("title", event.target.value)}
                            required
                          />
                        </label>

                        <label className="grid gap-1 text-xs text-slate-300">
                          Type
                          <select
                            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                            value={editingFormState.type}
                            onChange={(event) =>
                              updateEditingFormField("type", event.target.value as Resource["type"])
                            }
                          >
                            {RESOURCE_TYPES.map((resourceType) => (
                              <option key={resourceType} value={resourceType}>
                                {resourceType}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-1 text-xs text-slate-300 md:col-span-2">
                          URL
                          <input
                            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                            value={editingFormState.url}
                            onChange={(event) => updateEditingFormField("url", event.target.value)}
                            required
                            type="url"
                          />
                        </label>

                        <label className="grid gap-1 text-xs text-slate-300 md:col-span-2">
                          Notes
                          <textarea
                            className="min-h-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                            value={editingFormState.notes}
                            onChange={(event) => updateEditingFormField("notes", event.target.value)}
                          />
                        </label>

                        <label className="flex items-center gap-3 text-xs text-slate-300">
                          <input
                            checked={editingFormState.isFavorite}
                            className="h-4 w-4 accent-emerald-400"
                            onChange={(event) =>
                              updateEditingFormField("isFavorite", event.target.checked)
                            }
                            type="checkbox"
                          />
                          Favori oui/non
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="min-h-10 rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                          type="submit"
                        >
                          Enregistrer
                        </button>
                        <button
                          className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                          type="button"
                          onClick={() => {
                            setEditingResourceId(null);
                            setEditingFormState(initialResourceFormState);
                          }}
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}
