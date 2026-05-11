"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadProspects } from "./lib/prospectStorage";
import {
  PROSPECT_STATUSES,
  PROSPECT_TEMPERATURES,
  SOCIAL_PLATFORMS,
  type Prospect,
} from "./lib/types";

function getProspectName(prospect: Prospect) {
  const fullName = `${prospect.firstName} ${prospect.lastName}`.trim();

  return prospect.displayName.trim() || fullName || "Prospect sans nom";
}

function compareDateStrings(firstDate: string, secondDate: string) {
  if (firstDate === secondDate) {
    return 0;
  }

  return firstDate < secondDate ? -1 : 1;
}

export default function HomePage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [todayDate, setTodayDate] = useState("");
  const [hasLoadedProspects, setHasLoadedProspects] = useState(false);

  useEffect(() => {
    const loadDashboardData = window.setTimeout(() => {
      setProspects(loadProspects());
      setTodayDate(new Date().toISOString().slice(0, 10));
      setHasLoadedProspects(true);
    }, 0);

    return () => window.clearTimeout(loadDashboardData);
  }, []);

  const dashboardStats = useMemo(() => {
    const prospectsWithFollowUp = prospects.filter((prospect) =>
      prospect.nextActionDate.trim(),
    );

    return {
      totalProspects: prospects.length,
      hotProspects: prospects.filter((prospect) => prospect.temperature === "Chaud").length,
      highPriorityProspects: prospects.filter((prospect) => prospect.score >= 75).length,
      openConversations: prospects.filter(
        (prospect) => prospect.status === "Conversation ouverte",
      ).length,
      plannedFollowUps: prospectsWithFollowUp.length,
      lateFollowUps: todayDate
        ? prospectsWithFollowUp.filter((prospect) => prospect.nextActionDate < todayDate).length
        : 0,
    };
  }, [prospects, todayDate]);

  const pipelineStats = useMemo(() => {
    return PROSPECT_STATUSES.map((status) => ({
      status,
      count: prospects.filter((prospect) => prospect.status === status).length,
    }));
  }, [prospects]);

  const temperatureStats = useMemo(() => {
    return PROSPECT_TEMPERATURES.map((temperature) => ({
      temperature,
      count: prospects.filter((prospect) => prospect.temperature === temperature).length,
    }));
  }, [prospects]);

  const platformStats = useMemo(() => {
    return SOCIAL_PLATFORMS.map((platform) => ({
      platform,
      count: prospects.filter((prospect) => prospect.mainPlatform === platform).length,
    }));
  }, [prospects]);

  const topPriorityProspects = useMemo(() => {
    return prospects
      .sort((firstProspect, secondProspect) => {
        if (firstProspect.score !== secondProspect.score) {
          return secondProspect.score - firstProspect.score;
        }

        return getProspectName(firstProspect).localeCompare(
          getProspectName(secondProspect),
          "fr",
          { sensitivity: "base" },
        );
      })
      .slice(0, 5);
  }, [prospects]);

  const urgentFollowUps = useMemo(() => {
    if (!todayDate) {
      return [];
    }

    return prospects
      .filter(
        (prospect) =>
          Boolean(prospect.nextActionDate.trim()) &&
          compareDateStrings(prospect.nextActionDate, todayDate) <= 0,
      )
      .sort((firstProspect, secondProspect) =>
        compareDateStrings(firstProspect.nextActionDate, secondProspect.nextActionDate),
      )
      .slice(0, 5);
  }, [prospects, todayDate]);

  const statCards = [
    { label: "Total prospects", value: dashboardStats.totalProspects },
    { label: "Prospects chauds", value: dashboardStats.hotProspects },
    { label: "Priorité haute", value: dashboardStats.highPriorityProspects },
    { label: "Conversations ouvertes", value: dashboardStats.openConversations },
    { label: "Relances prévues", value: dashboardStats.plannedFollowUps },
    { label: "Relances en retard", value: dashboardStats.lateFollowUps },
  ];
  const hasProspectData = hasLoadedProspects && prospects.length > 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
              Dashboard
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">
              Travel Prospect CRM
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Pilote tes conversations voyage sans forcer, sans perdre le fil.
            </p>
          </div>

          <Link
            href="/prospects"
            className="inline-flex w-fit rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Voir tous les prospects
          </Link>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {!hasProspectData ? (
          <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
            <p className="text-lg font-semibold text-white">Aucune donnée pour le moment.</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Ajoute tes premiers prospects pour alimenter le dashboard.
            </p>
          </section>
        ) : null}

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
                Vue d&apos;ensemble du pipeline
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Répartition des prospects par statut.
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              {pipelineStats.map((pipelineStat) => {
                const percentage =
                  dashboardStats.totalProspects > 0
                    ? Math.round((pipelineStat.count / dashboardStats.totalProspects) * 100)
                    : 0;

                return (
                  <div className="grid gap-2" key={pipelineStat.status}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-200">{pipelineStat.status}</span>
                      <span className="text-slate-400">{pipelineStat.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-5">
            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
                Température du marché
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {temperatureStats.map((temperatureStat) => (
                  <article
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-center"
                    key={temperatureStat.temperature}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {temperatureStat.temperature}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">{temperatureStat.count}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
                Plateformes principales
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {platformStats.map((platformStat) => (
                  <div
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm"
                    key={platformStat.platform}
                  >
                    <span className="font-medium text-slate-200">{platformStat.platform}</span>
                    <span className="text-white">{platformStat.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
                  Top priorités
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Les 5 meilleurs scores à suivre de près.
                </p>
              </div>
              <Link
                href="/prospects"
                className="w-fit rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
              >
                Voir tous les prospects
              </Link>
            </div>

            {topPriorityProspects.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 text-sm text-slate-300">
                Aucune donnée pour le moment.
              </div>
            ) : (
              <div className="grid gap-3">
                {topPriorityProspects.map((prospect) => (
                  <article
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                    key={prospect.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-white">
                          {getProspectName(prospect)}
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                            {prospect.status}
                          </span>
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                            {prospect.temperature}
                          </span>
                          {prospect.nextActionDate ? (
                            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sky-200">
                              Relance : {prospect.nextActionDate}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-center">
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
                          Score
                        </p>
                        <p className="mt-1 text-2xl font-bold text-white">{prospect.score}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
                  Relances urgentes
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  En retard ou prévues aujourd’hui.
                </p>
              </div>
              <Link
                href="/prospects"
                className="w-fit rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
              >
                Gérer les relances
              </Link>
            </div>

            {urgentFollowUps.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 text-sm text-slate-300">
                Aucune donnée pour le moment.
              </div>
            ) : (
              <div className="grid gap-3">
                {urgentFollowUps.map((prospect) => (
                  <article
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                    key={prospect.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-white">
                          {getProspectName(prospect)}
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                          <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sky-200">
                            {prospect.nextActionDate}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                            {prospect.status}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-center">
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
                          Score
                        </p>
                        <p className="mt-1 text-2xl font-bold text-white">{prospect.score}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">
            V1 locale
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            Tes données sont stockées dans ce navigateur. Pense à exporter régulièrement tes prospects depuis la page Prospects.
          </p>
        </section>
      </section>
    </main>
  );
}
