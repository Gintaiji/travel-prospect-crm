"use client";

import { useEffect, useState } from "react";
import {
  createProspectId,
  loadProspects,
  saveProspects,
} from "../lib/prospectStorage";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_COLOR_TYPES,
  PROSPECT_TEMPERATURES,
  SOCIAL_PLATFORMS,
  type Prospect,
} from "../lib/types";

type ProspectFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  mainPlatform: Prospect["mainPlatform"];
  profileUrl: string;
  category: Prospect["category"];
  temperature: Prospect["temperature"];
  colorType: Prospect["colorType"];
  city: string;
  country: string;
  notes: string;
};

const initialFormState: ProspectFormState = {
  firstName: "",
  lastName: "",
  displayName: "",
  mainPlatform: SOCIAL_PLATFORMS[0],
  profileUrl: "",
  category: PROSPECT_CATEGORIES[0],
  temperature: PROSPECT_TEMPERATURES[0],
  colorType: PROSPECT_COLOR_TYPES[0],
  city: "",
  country: "",
  notes: "",
};

export default function ProspectsPage () {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [formState, setFormState] = useState<ProspectFormState>(initialFormState);

  useEffect(() => {
    const storedProspects = loadProspects();
    setProspects(storedProspects);
  }, []);

  function updateFormField<Field extends keyof ProspectFormState>(
    field: Field,
    value: ProspectFormState[Field],
  ) {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const now = new Date().toISOString();
    const newProspect: Prospect = {
      id: createProspectId(),
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      displayName: formState.displayName.trim(),
      jobTitle: "",
      businessArea: "",
      city: formState.city.trim(),
      region: "",
      country: formState.country.trim(),
      phone: "",
      whatsapp: "",
      email: "",
      mainPlatform: formState.mainPlatform,
      profileUrl: formState.profileUrl.trim(),
      socialLinks: {
        facebook: "",
        instagram: "",
        linkedin: "",
        tiktok: "",
        youtube: "",
        other: "",
      },
      category: formState.category,
      status: "À contacter",
      temperature: formState.temperature,
      colorType: formState.colorType,
      score: 0,
      tags: [],
      isFollower: false,
      hasSentMessage: false,
      interactionStats: {
        followerSinceDate: "",
        commentsCount: 0,
        interactionsCount: 0,
        likesCount: 0,
        messagesCount: 0,
      },
      lastInteractionDate: "",
      nextActionDate: "",
      conversationHistory: [],
      notes: formState.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };

    const updatedProspects = [newProspect, ...prospects];
    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setFormState(initialFormState);
    setIsFormVisible(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">CRM</p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
              <h1 className="text-4xl font-bold tracking-tight">Prospects</h1>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                {prospects.length} prospect{prospects.length > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-slate-300">
              Ici, tu retrouveras les personnes repérées sur les réseaux sociaux,
              leur niveau d’intérêt, le statut de la conversation et les prochaines
              actions à faire.
            </p>
          </div>

          <button
            className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            type="button"
            onClick={() => setIsFormVisible((currentValue) => !currentValue)}
          >
            {isFormVisible ? "Masquer le formulaire" : "Ajouter un prospect"}
          </button>
        </header>

        {isFormVisible ? (
          <form
            className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl"
            onSubmit={handleSubmit}
          >
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
                Nouveau prospect
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Pour la V1, on ajoute les prospects manuellement afin de garder un suivi propre et naturel.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                Prénom
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.firstName}
                  onChange={(event) => updateFormField("firstName", event.target.value)}
                  placeholder="Prénom"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Nom
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.lastName}
                  onChange={(event) => updateFormField("lastName", event.target.value)}
                  placeholder="Nom"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Nom affiché / pseudo
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.displayName}
                  onChange={(event) => updateFormField("displayName", event.target.value)}
                  placeholder="@pseudo"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Plateforme principale
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.mainPlatform}
                  onChange={(event) =>
                    updateFormField("mainPlatform", event.target.value as Prospect["mainPlatform"])
                  }
                >
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                Lien du profil
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.profileUrl}
                  onChange={(event) => updateFormField("profileUrl", event.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Catégorie
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.category}
                  onChange={(event) =>
                    updateFormField("category", event.target.value as Prospect["category"])
                  }
                >
                  {PROSPECT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Température / marché
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.temperature}
                  onChange={(event) =>
                    updateFormField("temperature", event.target.value as Prospect["temperature"])
                  }
                >
                  {PROSPECT_TEMPERATURES.map((temperature) => (
                    <option key={temperature} value={temperature}>
                      {temperature}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Type couleur
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.colorType}
                  onChange={(event) =>
                    updateFormField("colorType", event.target.value as Prospect["colorType"])
                  }
                >
                  {PROSPECT_COLOR_TYPES.map((colorType) => (
                    <option key={colorType} value={colorType}>
                      {colorType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Ville
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.city}
                  onChange={(event) => updateFormField("city", event.target.value)}
                  placeholder="Ville"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Pays
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.country}
                  onChange={(event) => updateFormField("country", event.target.value)}
                  placeholder="Pays"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                Notes
                <textarea
                  className="min-h-32 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.notes}
                  onChange={(event) => updateFormField("notes", event.target.value)}
                  placeholder="Contexte, intérêts, prochaine idée de message..."
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                type="submit"
              >
                Enregistrer le prospect
              </button>
              <button
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                type="button"
                onClick={() => {
                  setFormState(initialFormState);
                  setIsFormVisible(false);
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : null}

        {prospects.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <div className="mb-5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-emerald-300">
                Aucun prospect pour le moment
              </div>

              <h2 className="text-2xl font-bold">
                Commence par ajouter les profils les plus intéressants.
              </h2>

              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                Pour la V1, tu ajouteras les profils manuellement. L’objectif est
                de rester propre, naturel et organisé : pas de spam, pas de robot,
                juste un vrai suivi des conversations.
              </p>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Liste</p>
                <h2 className="text-2xl font-bold text-white">Prospects enregistrés</h2>
              </div>
              <p className="text-sm text-slate-300">Dernière mise à jour côté navigateur.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {prospects.map((prospect) => {
                const name = prospect.displayName?.trim()
                  ? prospect.displayName
                  : `${prospect.firstName} ${prospect.lastName}`;

                return (
                  <article
                    key={prospect.id}
                    className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl transition hover:border-emerald-400/30"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{name}</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          {prospect.jobTitle || "Pas de poste renseigné"}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                        {prospect.mainPlatform}
                      </span>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-300">
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Catégorie</p>
                        <p className="mt-1 font-medium text-white">{prospect.category}</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Température</p>
                        <p className="mt-1 font-medium text-white">{prospect.temperature}</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Statut</p>
                        <p className="mt-1 font-medium text-white">{prospect.status}</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Localisation</p>
                        <p className="mt-1 font-medium text-white">{prospect.city || "—"} / {prospect.country || "—"}</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Score</p>
                        <p className="mt-1 font-medium text-white">{prospect.score}</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dernière interaction</p>
                        <p className="mt-1 font-medium text-white">{prospect.lastInteractionDate || "—"}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
