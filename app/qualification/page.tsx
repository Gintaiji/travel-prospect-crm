"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadProspects, saveProspects } from "../lib/prospectStorage";
import {
  calculateProspectScore,
  getFutureDateString,
  getProspectDisplayName,
} from "../lib/prospectUtils";
import {
  PROSPECT_STATUSES,
  PROSPECT_TAGS,
  PROSPECT_TEMPERATURES,
  type Prospect,
} from "../lib/types";

type QualificationFilter =
  | "all"
  | "phone-import"
  | "social-import"
  | "social-category"
  | "low-score"
  | "no-follow-up";

type QuickAction =
  | "keep-contact"
  | "make-warm"
  | "make-hot"
  | "follow-up-tomorrow"
  | "follow-up-plus-three"
  | "avoid"
  | "not-now";

const filterOptions: Array<{ id: QualificationFilter; label: string }> = [
  { id: "all", label: "Tous les prospects à qualifier" },
  { id: "phone-import", label: "Importés téléphone" },
  { id: "social-import", label: "Importés réseaux sociaux" },
  { id: "social-category", label: "Réseaux sociaux" },
  { id: "low-score", label: "Score bas" },
  { id: "no-follow-up", label: "Sans relance prévue" },
];

const actionButtons: Array<{ id: QuickAction; label: string; variant: "primary" | "quiet" | "danger" }> = [
  { id: "keep-contact", label: "Garder à contacter", variant: "quiet" },
  { id: "make-warm", label: "Passer en tiède", variant: "primary" },
  { id: "make-hot", label: "Passer en chaud", variant: "primary" },
  { id: "follow-up-tomorrow", label: "Relancer demain", variant: "quiet" },
  { id: "follow-up-plus-three", label: "Relancer +3 jours", variant: "quiet" },
  { id: "avoid", label: "Marquer à éviter", variant: "danger" },
  { id: "not-now", label: "Pas maintenant", variant: "quiet" },
];

const STATUS_TO_CONTACT = getStatus("À contacter");
const STATUS_REFUSED = getStatus("Refus");
const STATUS_NOT_NOW = getStatus("Pas maintenant");
const TEMPERATURE_COLD = getTemperature("Froid");
const TEMPERATURE_WARM = getTemperature("Tiède");
const TEMPERATURE_HOT = getTemperature("Chaud");
const AVOID_TAG = PROSPECT_TAGS.find((tag) => tag === "À éviter");

function getStatus(statusLabel: string): Prospect["status"] {
  return (
    PROSPECT_STATUSES.find((status) => status === statusLabel) ??
    PROSPECT_STATUSES[0]
  );
}

function getTemperature(temperatureLabel: string): Prospect["temperature"] {
  return (
    PROSPECT_TEMPERATURES.find((temperature) => temperature === temperatureLabel) ??
    PROSPECT_TEMPERATURES[0]
  );
}

function getLowerText(value: string | undefined) {
  return (value ?? "").toLocaleLowerCase("fr-FR");
}

function hasImportedNote(prospect: Prospect) {
  return getLowerText(prospect.notes).includes("importé");
}

function isPhoneImported(prospect: Prospect) {
  const notes = getLowerText(prospect.notes);

  return (
    notes.includes("téléphone") ||
    getLowerText(prospect.mainPlatform).includes("téléphone")
  );
}

function isSocialImported(prospect: Prospect) {
  const notes = getLowerText(prospect.notes);

  return (
    hasImportedNote(prospect) &&
    (notes.includes("réseaux sociaux") ||
      notes.includes("instagram") ||
      notes.includes("facebook") ||
      notes.includes("linkedin") ||
      notes.includes("tiktok"))
  );
}

function isSocialCategory(prospect: Prospect) {
  return prospect.category === "Réseaux sociaux";
}

function isLowScore(prospect: Prospect) {
  return calculateProspectScore(prospect) < 40;
}

function isLightlyQualified(prospect: Prospect) {
  return (
    prospect.status === STATUS_TO_CONTACT ||
    isLowScore(prospect) ||
    hasImportedNote(prospect) ||
    isSocialCategory(prospect) ||
    prospect.category === "Connaissance"
  );
}

function isAlreadyHandled(prospect: Prospect) {
  return (
    prospect.status !== STATUS_TO_CONTACT ||
    prospect.temperature === TEMPERATURE_WARM ||
    prospect.temperature === TEMPERATURE_HOT ||
    Boolean(prospect.nextActionDate) ||
    (AVOID_TAG ? (prospect.tags ?? []).includes(AVOID_TAG) : false)
  );
}

function getLocationLabel(prospect: Prospect) {
  return [prospect.city, prospect.country].filter(Boolean).join(" / ");
}

function getActionButtonClass(variant: "primary" | "quiet" | "danger") {
  if (variant === "primary") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20";
  }

  if (variant === "danger") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20";
  }

  return "border-white/10 text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200";
}

export default function QualificationPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<QualificationFilter>("all");
  const [hideHandledProspects, setHideHandledProspects] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadStoredProspects = window.setTimeout(() => {
      setProspects(loadProspects());
    }, 0);

    return () => window.clearTimeout(loadStoredProspects);
  }, []);

  const prospectsToQualify = useMemo(
    () =>
      prospects
        .filter(isLightlyQualified)
        .sort((firstProspect, secondProspect) => {
          const firstScore = calculateProspectScore(firstProspect);
          const secondScore = calculateProspectScore(secondProspect);

          if (firstScore !== secondScore) {
            return firstScore - secondScore;
          }

          return firstProspect.updatedAt.localeCompare(secondProspect.updatedAt);
        }),
    [prospects],
  );

  const stats = useMemo(() => {
    const avoidCount = prospectsToQualify.filter((prospect) =>
      AVOID_TAG ? (prospect.tags ?? []).includes(AVOID_TAG) : false,
    ).length;

    return [
      { label: "Prospects à qualifier", value: prospectsToQualify.length },
      {
        label: "Prospects froids",
        value: prospectsToQualify.filter(
          (prospect) => prospect.temperature === TEMPERATURE_COLD,
        ).length,
      },
      {
        label: "Prospects tièdes",
        value: prospectsToQualify.filter(
          (prospect) => prospect.temperature === TEMPERATURE_WARM,
        ).length,
      },
      {
        label: "Prospects chauds",
        value: prospectsToQualify.filter(
          (prospect) => prospect.temperature === TEMPERATURE_HOT,
        ).length,
      },
      { label: "Prospects à éviter", value: avoidCount },
    ];
  }, [prospectsToQualify]);

  const filteredProspects = useMemo(() => {
    return prospectsToQualify.filter((prospect) => {
      if (hideHandledProspects && isAlreadyHandled(prospect)) {
        return false;
      }

      if (selectedFilter === "phone-import") {
        return isPhoneImported(prospect);
      }

      if (selectedFilter === "social-import") {
        return isSocialImported(prospect);
      }

      if (selectedFilter === "social-category") {
        return isSocialCategory(prospect);
      }

      if (selectedFilter === "low-score") {
        return isLowScore(prospect);
      }

      if (selectedFilter === "no-follow-up") {
        return !prospect.nextActionDate;
      }

      return true;
    });
  }, [hideHandledProspects, prospectsToQualify, selectedFilter]);

  function showUpdatedMessage() {
    setMessage("Prospect mis à jour.");
    window.setTimeout(() => setMessage(""), 2200);
  }

  function updateProspect(prospectId: string, action: QuickAction) {
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      const nextProspect: Prospect = {
        ...prospect,
        updatedAt: new Date().toISOString(),
      };

      if (action === "keep-contact") {
        nextProspect.status = STATUS_TO_CONTACT;
      }

      if (action === "make-warm") {
        nextProspect.temperature = TEMPERATURE_WARM;
      }

      if (action === "make-hot") {
        nextProspect.temperature = TEMPERATURE_HOT;
      }

      if (action === "follow-up-tomorrow") {
        nextProspect.nextActionDate = getFutureDateString(1);
      }

      if (action === "follow-up-plus-three") {
        nextProspect.nextActionDate = getFutureDateString(3);
      }

      if (action === "avoid") {
        nextProspect.status = STATUS_REFUSED;

        if (AVOID_TAG && !(nextProspect.tags ?? []).includes(AVOID_TAG)) {
          nextProspect.tags = [...(nextProspect.tags ?? []), AVOID_TAG];
        }
      }

      if (action === "not-now") {
        nextProspect.status = STATUS_NOT_NOW;
      }

      nextProspect.score = calculateProspectScore(nextProspect);

      return nextProspect;
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    showUpdatedMessage();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-32 pt-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto grid max-w-6xl gap-6">
        <header className="grid gap-3">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Tri express
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Qualification rapide
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            Passe rapidement tes contacts en revue pour décider qui mérite une vraie conversation.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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

        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((filterOption) => {
              const isSelected = selectedFilter === filterOption.id;

              return (
                <button
                  className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    isSelected
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200"
                  }`}
                  key={filterOption.id}
                  type="button"
                  onClick={() => setSelectedFilter(filterOption.id)}
                >
                  {filterOption.label}
                </button>
              );
            })}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm font-medium text-slate-200">
            <input
              className="mt-1 h-5 w-5 accent-emerald-400"
              checked={hideHandledProspects}
              type="checkbox"
              onChange={(event) => setHideHandledProspects(event.target.checked)}
            />
            <span>Masquer les prospects déjà traités</span>
          </label>
        </section>

        {message ? (
          <p className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
            {message}
          </p>
        ) : null}

        {filteredProspects.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <p className="text-sm leading-6 text-slate-300">
              Tout est trié pour le moment. Beau travail.
            </p>
          </section>
        ) : (
          <section className="grid gap-4">
            {filteredProspects.map((prospect) => {
              const locationLabel = getLocationLabel(prospect);
              const score = calculateProspectScore(prospect);
              const tags = prospect.tags ?? [];

              return (
                <article
                  className="grid gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl sm:p-5"
                  key={prospect.id}
                >
                  <div className="grid gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-bold text-white">
                        {getProspectDisplayName(prospect)}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                          {prospect.mainPlatform}
                        </span>
                        {prospect.profileUrl ? (
                          <a
                            className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sky-200 transition hover:bg-sky-400/20"
                            href={prospect.profileUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Profil
                          </a>
                        ) : null}
                        {locationLabel ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                            {locationLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <span className="block text-xs text-slate-500">Statut</span>
                        <span className="font-semibold text-white">{prospect.status}</span>
                      </p>
                      <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <span className="block text-xs text-slate-500">Température</span>
                        <span className="font-semibold text-white">
                          {prospect.temperature}
                        </span>
                      </p>
                      <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                        <span className="block text-xs text-emerald-300/80">Score</span>
                        <span className="font-semibold text-emerald-100">{score}</span>
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

                    {prospect.notes ? (
                      <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">
                        {prospect.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {actionButtons.map((actionButton) => (
                      <button
                        className={`min-h-12 rounded-full border px-4 py-2 text-sm font-semibold transition ${getActionButtonClass(
                          actionButton.variant,
                        )}`}
                        key={actionButton.id}
                        type="button"
                        onClick={() => updateProspect(prospect.id, actionButton.id)}
                      >
                        {actionButton.label}
                      </button>
                    ))}
                    <Link
                      className="flex min-h-12 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-center text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20"
                      href={`/prospects?focus=${encodeURIComponent(prospect.id)}`}
                    >
                      Voir la fiche
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}
