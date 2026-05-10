"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadProspects } from "./lib/prospectStorage";
import type { Prospect } from "./lib/types";

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

  useEffect(() => {
    setProspects(loadProspects());
    setTodayDate(new Date().toISOString().slice(0, 10));
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

  const priorityProspects = useMemo(() => {
    return prospects
      .filter((prospect) => {
        const isLateFollowUp =
          Boolean(todayDate) &&
          Boolean(prospect.nextActionDate.trim()) &&
          prospect.nextActionDate < todayDate;

        return isLateFollowUp || prospect.score >= 75 || prospect.temperature === "Chaud";
      })
      .sort((firstProspect, secondProspect) => {
        const firstIsLate =
          Boolean(todayDate) &&
          Boolean(firstProspect.nextActionDate.trim()) &&
          firstProspect.nextActionDate < todayDate;
        const secondIsLate =
          Boolean(todayDate) &&
          Boolean(secondProspect.nextActionDate.trim()) &&
          secondProspect.nextActionDate < todayDate;

        if (firstIsLate !== secondIsLate) {
          return firstIsLate ? -1 : 1;
        }

        if (firstProspect.score !== secondProspect.score) {
          return secondProspect.score - firstProspect.score;
        }

        return compareDateStrings(
          firstProspect.nextActionDate || "9999-12-31",
          secondProspect.nextActionDate || "9999-12-31",
        );
      })
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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
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
            Ouvrir les prospects
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

        <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                À traiter en priorité
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Relances en retard, prospects chauds et scores élevés.
              </p>
            </div>
          </div>

          {priorityProspects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 text-sm text-slate-300">
              Aucune priorité pour le moment. Le terrain est calme.
            </div>
          ) : (
            <div className="grid gap-3">
              {priorityProspects.map((prospect) => (
                <article
                  className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  key={prospect.id}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
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
