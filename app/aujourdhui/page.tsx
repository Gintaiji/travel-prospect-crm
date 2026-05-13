"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadProspects, saveProspects } from "../lib/prospectStorage";
import {
  calculateProspectScore,
  getFutureDateString,
  getProspectDisplayName,
  getTodayDateString,
  isDateBeforeToday,
  isDateToday,
} from "../lib/prospectUtils";
import type { Prospect } from "../lib/types";

type StatCard = {
  label: string;
  value: number;
};

const quickLinks = [
  { href: "/prospects", label: "Ajouter un prospect" },
  { href: "/relances", label: "Voir les relances" },
  { href: "/messages", label: "Ouvrir les messages" },
  { href: "/ressources", label: "Ouvrir les ressources" },
];

function getPriorityRank(prospect: Prospect) {
  const todayDate = getTodayDateString();

  if (prospect.nextActionDate && prospect.nextActionDate < todayDate) {
    return 0;
  }

  if (prospect.nextActionDate && prospect.nextActionDate === todayDate) {
    return 1;
  }

  if (calculateProspectScore(prospect) >= 75) {
    return 2;
  }

  return 3;
}

function getLastConversationEntry(prospect: Prospect) {
  const conversationHistory = prospect.conversationHistory ?? [];

  return conversationHistory.length > 0
    ? conversationHistory[conversationHistory.length - 1]
    : null;
}

export default function TodayPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);

  useEffect(() => {
    setProspects(loadProspects());
  }, []);

  const stats = useMemo<StatCard[]>(() => {
    const lateFollowUps = prospects.filter(
      (prospect) => prospect.nextActionDate && isDateBeforeToday(prospect.nextActionDate),
    );
    const todayFollowUps = prospects.filter(
      (prospect) => prospect.nextActionDate && isDateToday(prospect.nextActionDate),
    );
    const highPriorities = prospects.filter(
      (prospect) => calculateProspectScore(prospect) >= 75,
    );
    const hotProspects = prospects.filter(
      (prospect) => prospect.temperature === "Chaud",
    );

    return [
      { label: "Relances en retard", value: lateFollowUps.length },
      { label: "Relances aujourd’hui", value: todayFollowUps.length },
      { label: "Priorités hautes", value: highPriorities.length },
      { label: "Prospects chauds", value: hotProspects.length },
    ];
  }, [prospects]);

  const priorityProspects = useMemo(() => {
    const priorityProspectMap = new Map<string, Prospect>();

    prospects.forEach((prospect) => {
      const hasLateFollowUp =
        prospect.nextActionDate && isDateBeforeToday(prospect.nextActionDate);
      const hasTodayFollowUp =
        prospect.nextActionDate && isDateToday(prospect.nextActionDate);
      const hasHighScore = calculateProspectScore(prospect) >= 75;
      const isHot = prospect.temperature === "Chaud";

      if (hasLateFollowUp || hasTodayFollowUp || hasHighScore || isHot) {
        priorityProspectMap.set(prospect.id, prospect);
      }
    });

    return Array.from(priorityProspectMap.values()).sort((firstProspect, secondProspect) => {
      const firstRank = getPriorityRank(firstProspect);
      const secondRank = getPriorityRank(secondProspect);

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return calculateProspectScore(secondProspect) - calculateProspectScore(firstProspect);
    });
  }, [prospects]);

  function updateProspectNextActionDate(prospectId: string, nextActionDate: string) {
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      return {
        ...prospect,
        nextActionDate,
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto grid max-w-6xl gap-6">
        <header>
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Focus quotidien
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Aujourd’hui
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Les actions importantes à traiter maintenant.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <article
              className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl"
              key={stat.label}
            >
              <p className="min-h-8 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {stat.label}
              </p>
              <p className="mt-2 text-3xl font-bold text-white">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">À traiter maintenant</h2>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              {priorityProspects.length}
            </span>
          </div>

          {priorityProspects.length === 0 ? (
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
              <p className="text-sm leading-6 text-slate-300">
                Rien d’urgent pour le moment. Tu peux prospecter tranquillement ou
                préparer tes prochains messages.
              </p>
            </section>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {priorityProspects.map((prospect) => {
                const score = calculateProspectScore(prospect);
                const tags = prospect.tags ?? [];
                const lastConversationEntry = getLastConversationEntry(prospect);

                return (
                  <article
                    className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl sm:p-5"
                    key={prospect.id}
                  >
                    <div className="grid gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-white">
                          {getProspectDisplayName(prospect)}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                            {prospect.mainPlatform}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                            {prospect.status}
                          </span>
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                            {prospect.temperature}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                          <span className="block text-xs text-slate-500">Score</span>
                          <span className="font-semibold text-white">{score}</span>
                        </p>
                        <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                          <span className="block text-xs text-slate-500">
                            Prochaine relance
                          </span>
                          <span className="font-semibold text-white">
                            {prospect.nextActionDate || "Non planifiée"}
                          </span>
                        </p>
                      </div>

                      {tags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {tags.map((tag) => (
                            <span
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                              key={tag}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {lastConversationEntry ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Dernier échange
                          </p>
                          <p className="mt-2 line-clamp-3 leading-6 text-slate-100">
                            {lastConversationEntry.content}
                          </p>
                          {lastConversationEntry.nextAction ? (
                            <p className="mt-2 text-xs font-medium text-emerald-300">
                              Prochaine action : {lastConversationEntry.nextAction}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <Link
                        className="flex min-h-12 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-center text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20"
                        href={`/prospects?focus=${encodeURIComponent(prospect.id)}`}
                      >
                        Voir la fiche
                      </Link>
                      <button
                        className="min-h-12 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                        type="button"
                        onClick={() => updateProspectNextActionDate(prospect.id, "")}
                      >
                        Marquer comme traité
                      </button>
                      <button
                        className="min-h-12 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                        type="button"
                        onClick={() =>
                          updateProspectNextActionDate(prospect.id, getFutureDateString(1))
                        }
                      >
                        Reporter demain
                      </button>
                      <button
                        className="min-h-12 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                        type="button"
                        onClick={() =>
                          updateProspectNextActionDate(prospect.id, getFutureDateString(3))
                        }
                      >
                        Reporter +3 jours
                      </button>
                      <button
                        className="min-h-12 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                        type="button"
                        onClick={() =>
                          updateProspectNextActionDate(prospect.id, getFutureDateString(7))
                        }
                      >
                        Reporter +7 jours
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
          <h2 className="text-xl font-bold text-white">Rien d’urgent ?</h2>
          {priorityProspects.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Rien d’urgent pour le moment. Tu peux prospecter tranquillement ou
              préparer tes prochains messages.
            </p>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((quickLink) => (
              <Link
                className="flex min-h-12 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-center text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200"
                href={quickLink.href}
                key={quickLink.href}
              >
                {quickLink.label}
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
