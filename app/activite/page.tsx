"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadProspects } from "../lib/prospectStorage";
import {
  getFutureDateString,
  getProspectDisplayName,
  getTodayDateString,
} from "../lib/prospectUtils";
import type { Prospect } from "../lib/types";

type ChannelFilter =
  | "Tous"
  | "Instagram"
  | "Facebook"
  | "TikTok"
  | "LinkedIn"
  | "YouTube"
  | "WhatsApp"
  | "Email"
  | "Téléphone"
  | "Autre";

type PeriodFilter = "Tous" | "Aujourd’hui" | "7 derniers jours" | "30 derniers jours";

type ActivityEntry = {
  id: string;
  prospectId: string;
  prospectName: string;
  date: string;
  channel: Prospect["mainPlatform"];
  content: string;
  nextAction: string;
  status: Prospect["status"];
  temperature: Prospect["temperature"];
  score: number;
};

const channelFilters: ChannelFilter[] = [
  "Tous",
  "Instagram",
  "Facebook",
  "TikTok",
  "LinkedIn",
  "YouTube",
  "WhatsApp",
  "Email",
  "Téléphone",
  "Autre",
];

const periodFilters: PeriodFilter[] = [
  "Tous",
  "Aujourd’hui",
  "7 derniers jours",
  "30 derniers jours",
];

function compareDateDesc(firstDate: string, secondDate: string) {
  if (firstDate === secondDate) {
    return 0;
  }

  return firstDate > secondDate ? -1 : 1;
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isDateInPeriod(date: string, periodFilter: PeriodFilter) {
  if (periodFilter === "Tous") {
    return true;
  }

  const today = getTodayDateString();

  if (periodFilter === "Aujourd’hui") {
    return date === today;
  }

  const startDate = periodFilter === "7 derniers jours"
    ? getFutureDateString(-6)
    : getFutureDateString(-29);

  return date >= startDate && date <= today;
}

export default function ActivityPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [hasLoadedProspects, setHasLoadedProspects] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("Tous");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("Tous");

  useEffect(() => {
    const loadStoredProspects = window.setTimeout(() => {
      setProspects(loadProspects());
      setHasLoadedProspects(true);
    }, 0);

    return () => window.clearTimeout(loadStoredProspects);
  }, []);

  const activityEntries = useMemo(() => {
    return prospects
      .flatMap((prospect) =>
        (prospect.conversationHistory ?? []).map((conversationEntry, entryIndex) => ({
          id: `${prospect.id}-${conversationEntry.id || entryIndex}`,
          prospectId: prospect.id,
          prospectName: getProspectDisplayName(prospect),
          date: conversationEntry.date,
          channel: conversationEntry.channel,
          content: conversationEntry.content,
          nextAction: conversationEntry.nextAction,
          status: prospect.status,
          temperature: prospect.temperature,
          score: prospect.score,
        })),
      )
      .sort((firstEntry, secondEntry) => compareDateDesc(firstEntry.date, secondEntry.date));
  }, [prospects]);

  const filteredActivityEntries = useMemo(() => {
    const normalizedSearchQuery = normalizeText(searchQuery);

    return activityEntries.filter((activityEntry) => {
      const matchesSearch = normalizedSearchQuery
        ? normalizeText([
          activityEntry.prospectName,
          activityEntry.channel,
          activityEntry.content,
          activityEntry.nextAction,
          activityEntry.status,
          activityEntry.temperature,
        ].join(" ")).includes(normalizedSearchQuery)
        : true;

      const matchesChannel =
        channelFilter === "Tous" || activityEntry.channel === channelFilter;
      const matchesPeriod = isDateInPeriod(activityEntry.date, periodFilter);

      return matchesSearch && matchesChannel && matchesPeriod;
    });
  }, [activityEntries, channelFilter, periodFilter, searchQuery]);

  const activityStats = useMemo(() => {
    const today = getTodayDateString();
    const prospectIdsWithActivity = new Set(
      activityEntries.map((activityEntry) => activityEntry.prospectId),
    );

    return {
      totalEntries: activityEntries.length,
      todayEntries: activityEntries.filter((activityEntry) => activityEntry.date === today).length,
      prospectsWithActivity: prospectIdsWithActivity.size,
      entriesWithNextAction: activityEntries.filter((activityEntry) =>
        activityEntry.nextAction.trim(),
      ).length,
    };
  }, [activityEntries]);

  const hasActiveFilters =
    searchQuery.trim() !== "" || channelFilter !== "Tous" || periodFilter !== "Tous";
  const hasActivity = activityEntries.length > 0;

  function resetFilters() {
    setSearchQuery("");
    setChannelFilter("Tous");
    setPeriodFilter("Tous");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
              Historique global
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Activité</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Retrouve l’historique de tes échanges et les prochaines actions associées.
            </p>
          </div>
          <Link
            href="/prospects"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Voir les prospects
          </Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Échanges</p>
            <p className="mt-2 text-3xl font-bold text-white">{activityStats.totalEntries}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Aujourd’hui</p>
            <p className="mt-2 text-3xl font-bold text-white">{activityStats.todayEntries}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Prospects actifs</p>
            <p className="mt-2 text-3xl font-bold text-white">
              {activityStats.prospectsWithActivity}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Actions liées</p>
            <p className="mt-2 text-3xl font-bold text-white">
              {activityStats.entriesWithNextAction}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_200px_auto] lg:items-end">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
              Recherche
              <input
                className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Nom, canal, résumé, action..."
                type="search"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
              Canal
              <select
                className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}
              >
                {channelFilters.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
              Période
              <select
                className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
              >
                {periodFilters.map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="min-h-11 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
            >
              Réinitialiser les filtres
            </button>
          </div>
        </section>

        <section className="mt-6">
          {!hasLoadedProspects ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Chargement de l’activité...
            </p>
          ) : !hasActivity ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Aucun échange enregistré pour le moment.
            </p>
          ) : filteredActivityEntries.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Aucun échange ne correspond à ta recherche.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredActivityEntries.map((activityEntry) => (
                <article
                  key={activityEntry.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-emerald-400/30 hover:bg-white/[0.07]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                        {activityEntry.date || "Date non renseignée"}
                      </p>
                      <h2 className="mt-2 truncate text-lg font-semibold text-white">
                        {activityEntry.prospectName}
                      </h2>
                    </div>
                    <span className="w-fit rounded-full border border-white/10 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-200">
                      {activityEntry.channel}
                    </span>
                  </div>

                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-300">
                    {activityEntry.content || "Aucun résumé renseigné."}
                  </p>

                  <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Prochaine action
                    </p>
                    <p className="mt-1 text-sm text-slate-200">
                      {activityEntry.nextAction || "Aucune action renseignée."}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                      {activityEntry.status}
                    </span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                      {activityEntry.temperature}
                    </span>
                    <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sky-200">
                      Score {activityEntry.score}
                    </span>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Link
                      href={`/prospects?focus=${activityEntry.prospectId}`}
                      className="inline-flex min-h-10 items-center rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                    >
                      Voir la fiche
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
