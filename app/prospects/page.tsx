"use client";

import { useEffect, useState } from "react";
import { loadProspects } from "../lib/prospectStorage";
import type { Prospect } from "../lib/types";

export default function ProspectsPage () {
  const [prospects, setProspects] = useState<Prospect[]>([]);

  useEffect(() => {
    const storedProspects = loadProspects();
    setProspects(storedProspects);
  }, []);

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

          <button className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">
            Ajouter un prospect
          </button>
        </header>

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
