"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadProspects, saveProspects } from "../lib/prospectStorage";
import type { Prospect } from "../lib/types";

type FollowUpFilter = "Toutes les relances" | "En retard" | "Aujourd’hui" | "À venir";

type FollowUpSection = {
  title: Exclude<FollowUpFilter, "Toutes les relances">;
  prospects: Prospect[];
};

const followUpFilters: FollowUpFilter[] = [
  "Toutes les relances",
  "En retard",
  "Aujourd’hui",
  "À venir",
];

function getProspectName(prospect: Prospect) {
  const fullName = `${prospect.firstName} ${prospect.lastName}`.trim();

  return prospect.displayName.trim() || fullName || "Prospect sans nom";
}

function formatFutureLocalDate(daysToAdd: number) {
  const futureDate = new Date();
  futureDate.setHours(12, 0, 0, 0);
  futureDate.setDate(futureDate.getDate() + daysToAdd);

  const year = futureDate.getFullYear();
  const month = String(futureDate.getMonth() + 1).padStart(2, "0");
  const day = String(futureDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function compareDateStrings(firstDate: string, secondDate: string) {
  if (firstDate === secondDate) {
    return 0;
  }

  return firstDate < secondDate ? -1 : 1;
}

function getSearchableText(prospect: Prospect) {
  return [
    prospect.firstName,
    prospect.lastName,
    prospect.displayName,
    prospect.mainPlatform,
    prospect.status,
    prospect.temperature,
    prospect.notes,
  ]
    .join(" ")
    .toLowerCase();
}

export default function FollowUpsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [todayDate, setTodayDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("Toutes les relances");

  useEffect(() => {
    const loadStoredProspects = window.setTimeout(() => {
      setProspects(loadProspects());
      setTodayDate(formatFutureLocalDate(0));
    }, 0);

    return () => window.clearTimeout(loadStoredProspects);
  }, []);

  const followUpProspects = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    return prospects
      .filter((prospect) => prospect.nextActionDate.trim())
      .filter(
        (prospect) =>
          !normalizedSearchQuery ||
          getSearchableText(prospect).includes(normalizedSearchQuery),
      )
      .sort((firstProspect, secondProspect) =>
        compareDateStrings(firstProspect.nextActionDate, secondProspect.nextActionDate),
      );
  }, [prospects, searchQuery]);

  const followUpGroups = useMemo(() => {
    const lateProspects = followUpProspects.filter(
      (prospect) => todayDate && compareDateStrings(prospect.nextActionDate, todayDate) < 0,
    );
    const todayProspects = followUpProspects.filter(
      (prospect) => todayDate && compareDateStrings(prospect.nextActionDate, todayDate) === 0,
    );
    const upcomingProspects = followUpProspects.filter(
      (prospect) => todayDate && compareDateStrings(prospect.nextActionDate, todayDate) > 0,
    );

    return {
      lateProspects,
      todayProspects,
      upcomingProspects,
    };
  }, [followUpProspects, todayDate]);

  const followUpSections: FollowUpSection[] = [
    {
      title: "En retard",
      prospects: followUpGroups.lateProspects,
    },
    {
      title: "Aujourd’hui",
      prospects: followUpGroups.todayProspects,
    },
    {
      title: "À venir",
      prospects: followUpGroups.upcomingProspects,
    },
  ];
  const visibleSections = followUpSections.filter(
    (section) =>
      followUpFilter === "Toutes les relances" || section.title === followUpFilter,
  );
  const totalPlannedFollowUps = followUpGroups.lateProspects.length +
    followUpGroups.todayProspects.length +
    followUpGroups.upcomingProspects.length;
  const statCards = [
    { label: "Relances prévues", value: totalPlannedFollowUps },
    { label: "En retard", value: followUpGroups.lateProspects.length },
    { label: "Aujourd’hui", value: followUpGroups.todayProspects.length },
    { label: "À venir", value: followUpGroups.upcomingProspects.length },
  ];

  function updateProspectFollowUpDate(prospectId: string, nextActionDate: string) {
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

  function renderProspectCard(prospect: Prospect) {
    const conversationHistory = prospect.conversationHistory ?? [];
    const lastConversationEntry =
      conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1]
        : null;
    const prospectTags = prospect.tags ?? [];

    return (
      <article
        className="rounded-3xl border border-white/10 bg-slate-950/60 p-4 shadow-xl"
        key={prospect.id}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-white">
              {getProspectName(prospect)}
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

          <div className="grid grid-cols-2 gap-2 text-sm sm:text-right">
            <p>
              <span className="text-slate-500">Score :</span>{" "}
              <span className="font-semibold text-white">{prospect.score}</span>
            </p>
            <p>
              <span className="text-slate-500">Relance :</span>{" "}
              <span className="font-semibold text-white">{prospect.nextActionDate}</span>
            </p>
          </div>
        </div>

        {lastConversationEntry ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
            <p className="line-clamp-3 leading-6 text-slate-100">
              {lastConversationEntry.content}
            </p>
            {lastConversationEntry.nextAction ? (
              <p className="mt-2 text-xs font-medium text-emerald-300">
                Prochaine action : {lastConversationEntry.nextAction}
              </p>
            ) : null}
          </div>
        ) : null}

        {prospectTags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {prospectTags.map((tag) => (
              <span
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
            type="button"
            onClick={() => updateProspectFollowUpDate(prospect.id, "")}
          >
            Marquer comme relancé
          </button>
          <button
            className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
            type="button"
            onClick={() => updateProspectFollowUpDate(prospect.id, formatFutureLocalDate(1))}
          >
            Reporter demain
          </button>
          <button
            className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
            type="button"
            onClick={() => updateProspectFollowUpDate(prospect.id, formatFutureLocalDate(3))}
          >
            Reporter +3 jours
          </button>
          <button
            className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
            type="button"
            onClick={() => updateProspectFollowUpDate(prospect.id, formatFutureLocalDate(7))}
          >
            Reporter +7 jours
          </button>
          <Link
            className="min-h-10 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20"
            href={`/prospects?focus=${encodeURIComponent(prospect.id)}`}
          >
            Voir dans Prospects
          </Link>
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Suivi quotidien
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Relances
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Gère les conversations à reprendre aujourd’hui sans perdre le fil.
          </p>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((statCard) => (
            <article
              className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl"
              key={statCard.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {statCard.label}
              </p>
              <p className="mt-3 text-4xl font-bold text-white">{statCard.value}</p>
            </article>
          ))}
        </section>

        <section className="mb-6 rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              Recherche
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Nom, plateforme, statut, notes..."
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              Filtre
              <select
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                value={followUpFilter}
                onChange={(event) => setFollowUpFilter(event.target.value as FollowUpFilter)}
              >
                {followUpFilters.map((filter) => (
                  <option key={filter} value={filter}>
                    {filter}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {totalPlannedFollowUps === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-xl">
            <p className="text-sm text-slate-300">
              Aucune relance prévue. Le terrain est calme.
            </p>
          </section>
        ) : (
          <section className="grid gap-5">
            {visibleSections.map((section) => (
              <section
                className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
                key={section.title}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
                      {section.title}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-semibold text-slate-200">
                    {section.prospects.length}
                  </span>
                </div>

                {section.prospects.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                    Rien ici pour le moment.
                  </p>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {section.prospects.map((prospect) => renderProspectCard(prospect))}
                  </div>
                )}
              </section>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
