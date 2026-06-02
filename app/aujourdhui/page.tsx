"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadLastBackupDate,
  shouldShowBackupReminder,
} from "../lib/backupReminderStorage";
import {
  getCloudDataSummary,
  getCloudFreshnessStatus,
  getCloudSyncStatus,
  getLocalDataSummary,
  type CloudDataSummary,
  type CloudFreshnessStatus,
  type CloudSyncStatus,
  type LocalDataSummary,
} from "../lib/cloudSync";
import { loadProspects, saveProspects } from "../lib/prospectStorage";
import {
  calculateProspectScore,
  getFutureDateString,
  getProspectDisplayName,
  getTodayDateString,
  isDateBeforeToday,
  isDateToday,
} from "../lib/prospectUtils";
import { createBrowserSupabaseClient } from "../lib/supabaseClient";
import type { ConversationEntry, Prospect } from "../lib/types";
import QuickCloudSyncButton from "../components/QuickCloudSyncButton";

type StatCard = {
  label: string;
  value: number;
};

type FollowUpResult =
  | "Aucune réponse"
  | "Réponse reçue"
  | "Intérêt voyage détecté"
  | "Présentation proposée"
  | "Pas maintenant"
  | "Refus"
  | "Autre";

type FollowUpTreatmentFormState = {
  result: FollowUpResult;
  summary: string;
  nextAction: string;
  nextActionDate: string;
};

type FollowUpSection = {
  title: "Relances en retard" | "Relances aujourd’hui" | "Relances à venir";
  prospects: Prospect[];
};

const quickLinks = [
  { href: "/prospects?action=quick-add", label: "Ajout express" },
  { href: "/prospects?action=add", label: "Ajouter un prospect" },
  { href: "/prospects?mode=qualification", label: "Qualification rapide" },
  { href: "/messages", label: "Ouvrir les messages" },
  { href: "/ressources", label: "Ouvrir les ressources" },
  { href: "/sauvegarde", label: "Ouvrir la sauvegarde" },
];

const followUpResults: FollowUpResult[] = [
  "Aucune réponse",
  "Réponse reçue",
  "Intérêt voyage détecté",
  "Présentation proposée",
  "Pas maintenant",
  "Refus",
  "Autre",
];

const initialFollowUpTreatmentForm: FollowUpTreatmentFormState = {
  result: "Aucune réponse",
  summary: "",
  nextAction: "",
  nextActionDate: "",
};

const followUpResultStatusMap: Partial<Record<FollowUpResult, Prospect["status"]>> = {
  "Aucune réponse": "À relancer",
  "Réponse reçue": "Conversation ouverte",
  "Intérêt voyage détecté": "Intérêt voyage détecté",
  "Présentation proposée": "Présentation proposée",
  "Pas maintenant": "Pas maintenant",
  Refus: "Refus",
};

function compareDateStrings(firstDate: string, secondDate: string) {
  if (firstDate === secondDate) {
    return 0;
  }

  return firstDate < secondDate ? -1 : 1;
}

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
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus | null>(null);
  const [cloudDataSummary, setCloudDataSummary] =
    useState<CloudDataSummary | null>(null);
  const [localDataSummary, setLocalDataSummary] =
    useState<LocalDataSummary | null>(null);
  const [cloudFreshnessStatus, setCloudFreshnessStatus] =
    useState<CloudFreshnessStatus | null>(null);
  const [activeTreatmentProspectId, setActiveTreatmentProspectId] =
    useState<string | null>(null);
  const [followUpTreatmentForm, setFollowUpTreatmentForm] =
    useState<FollowUpTreatmentFormState>(initialFollowUpTreatmentForm);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const loadStoredProspects = window.setTimeout(() => {
      setProspects(loadProspects());
      setShowBackupReminder(shouldShowBackupReminder(loadLastBackupDate()));
    }, 0);

    return () => window.clearTimeout(loadStoredProspects);
  }, []);

  useEffect(() => {
    async function refreshCloudAwareness() {
      setLocalDataSummary(getLocalDataSummary());

      const supabase = createBrowserSupabaseClient();

      if (!supabase) {
        setCloudSyncStatus(null);
        setCloudDataSummary(null);
        setCloudFreshnessStatus(null);
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session?.user) {
        setCloudSyncStatus(null);
        setCloudDataSummary(null);
        setCloudFreshnessStatus(null);
        return;
      }

      try {
        const [syncStatus, dataSummary, freshnessStatus] = await Promise.all([
          getCloudSyncStatus(),
          getCloudDataSummary(),
          getCloudFreshnessStatus(),
        ]);

        setCloudSyncStatus(syncStatus);
        setCloudDataSummary(dataSummary);
        setCloudFreshnessStatus(freshnessStatus);
      } catch {
        setCloudSyncStatus(null);
        setCloudDataSummary(null);
        setCloudFreshnessStatus(null);
      }
    }

    refreshCloudAwareness();
  }, []);

  const stats = useMemo<StatCard[]>(() => {
    const lateFollowUps = prospects.filter(
      (prospect) => prospect.nextActionDate && isDateBeforeToday(prospect.nextActionDate),
    );
    const todayFollowUps = prospects.filter(
      (prospect) => prospect.nextActionDate && isDateToday(prospect.nextActionDate),
    );
    const todayDate = getTodayDateString();
    const upcomingFollowUps = prospects.filter(
      (prospect) =>
        prospect.nextActionDate &&
        compareDateStrings(prospect.nextActionDate, todayDate) > 0,
    );
    const highPriorities = prospects.filter(
      (prospect) => calculateProspectScore(prospect) >= 75,
    );
    const hotProspects = prospects.filter(
      (prospect) => prospect.temperature === "Chaud",
    );

    return [
      { label: "Relances en retard", value: lateFollowUps.length },
      { label: "Relances à venir", value: upcomingFollowUps.length },
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
  const followUpGroups = useMemo(() => {
    const todayDate = getTodayDateString();
    const followUpProspects = prospects
      .filter((prospect) => prospect.nextActionDate.trim())
      .sort((firstProspect, secondProspect) =>
        compareDateStrings(firstProspect.nextActionDate, secondProspect.nextActionDate),
      );

    return {
      lateProspects: followUpProspects.filter((prospect) =>
        isDateBeforeToday(prospect.nextActionDate),
      ),
      todayProspects: followUpProspects.filter((prospect) =>
        isDateToday(prospect.nextActionDate),
      ),
      upcomingProspects: followUpProspects.filter(
        (prospect) => compareDateStrings(prospect.nextActionDate, todayDate) > 0,
      ),
    };
  }, [prospects]);
  const followUpSections: FollowUpSection[] = [
    { title: "Relances en retard", prospects: followUpGroups.lateProspects },
    { title: "Relances aujourd’hui", prospects: followUpGroups.todayProspects },
    { title: "Relances à venir", prospects: followUpGroups.upcomingProspects },
  ];
  const shouldSuggestCloudRestore = Boolean(
    cloudDataSummary?.hasCloudData && localDataSummary && !localDataSummary.hasLocalData,
  );

  function updateProspectNextActionDate(prospectId: string, nextActionDate: string) {
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      const updatedProspect: Prospect = {
        ...prospect,
        nextActionDate,
        updatedAt: new Date().toISOString(),
      };

      return {
        ...updatedProspect,
        score: calculateProspectScore(updatedProspect),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setLocalDataSummary(getLocalDataSummary());
  }

  function createConversationEntryId(prospectId: string) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `conversation-${prospectId}-${getTodayDateString()}`;
  }

  function resetFollowUpTreatmentForm() {
    setActiveTreatmentProspectId(null);
    setFollowUpTreatmentForm(initialFollowUpTreatmentForm);
  }

  function showSuccessMessage() {
    setSuccessMessage("Relance traitée et ajoutée à l’historique.");
    window.setTimeout(() => {
      setSuccessMessage("");
    }, 3500);
  }

  function updateFollowUpTreatmentFormField<Field extends keyof FollowUpTreatmentFormState>(
    field: Field,
    value: FollowUpTreatmentFormState[Field],
  ) {
    setFollowUpTreatmentForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function openFollowUpTreatmentForm(prospect: Prospect) {
    setActiveTreatmentProspectId(prospect.id);
    setFollowUpTreatmentForm({
      ...initialFollowUpTreatmentForm,
      nextActionDate: prospect.nextActionDate,
    });
  }

  function saveFollowUpTreatment(prospectId: string) {
    const today = getTodayDateString();
    const now = new Date().toISOString();
    const result = followUpTreatmentForm.result;
    const summary = followUpTreatmentForm.summary.trim();
    const nextAction = followUpTreatmentForm.nextAction.trim();
    const nextActionDate = followUpTreatmentForm.nextActionDate.trim();
    const contentLines = [`Résultat : ${result}`];

    if (summary) {
      contentLines.push(`Résumé : ${summary}`);
    }

    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      const nextStatus = followUpResultStatusMap[result] ?? prospect.status;
      const conversationEntry: ConversationEntry = {
        id: createConversationEntryId(prospect.id),
        date: today,
        channel: prospect.mainPlatform,
        content: contentLines.join("\n"),
        nextAction,
      };
      const updatedProspect: Prospect = {
        ...prospect,
        status: nextStatus,
        conversationHistory: [
          ...(prospect.conversationHistory ?? []),
          conversationEntry,
        ],
        lastInteractionDate: today,
        nextActionDate,
        updatedAt: now,
      };

      return {
        ...updatedProspect,
        score: calculateProspectScore(updatedProspect),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setLocalDataSummary(getLocalDataSummary());
    resetFollowUpTreatmentForm();
    showSuccessMessage();
  }

  function renderFollowUpCard(prospect: Prospect) {
    const score = calculateProspectScore(prospect);
    const tags = prospect.tags ?? [];
    const lastConversationEntry = getLastConversationEntry(prospect);
    const isTreatmentFormOpen = activeTreatmentProspectId === prospect.id;

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
              <span className="block text-xs text-slate-500">Date de relance</span>
              <span className="font-semibold text-white">
                {prospect.nextActionDate || "Non planifiée"}
              </span>
            </p>
          </div>

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
        </div>

        {isTreatmentFormOpen ? (
          <form
            className="mt-4 grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveFollowUpTreatment(prospect.id);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-slate-300">
                Résultat de la relance
                <select
                  className="min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                  value={followUpTreatmentForm.result}
                  onChange={(event) =>
                    updateFollowUpTreatmentFormField(
                      "result",
                      event.target.value as FollowUpResult,
                    )
                  }
                >
                  {followUpResults.map((result) => (
                    <option key={result} value={result}>
                      {result}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-slate-300">
                Prochaine relance
                <input
                  className="min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                  type="date"
                  value={followUpTreatmentForm.nextActionDate}
                  onChange={(event) =>
                    updateFollowUpTreatmentFormField(
                      "nextActionDate",
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>

            <label className="grid gap-1.5 text-xs font-medium text-slate-300">
              Résumé de l’échange
              <textarea
                className="min-h-24 resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={followUpTreatmentForm.summary}
                onChange={(event) =>
                  updateFollowUpTreatmentFormField("summary", event.target.value)
                }
                placeholder="Notes rapides sur la relance..."
              />
            </label>

            <label className="grid gap-1.5 text-xs font-medium text-slate-300">
              Prochaine action
              <input
                className="min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                value={followUpTreatmentForm.nextAction}
                onChange={(event) =>
                  updateFollowUpTreatmentFormField("nextAction", event.target.value)
                }
                placeholder="Ex : envoyer la présentation voyage"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                type="submit"
              >
                Enregistrer le suivi
              </button>
              <button
                className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                type="button"
                onClick={resetFollowUpTreatmentForm}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            className="min-h-12 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
            type="button"
            onClick={() => updateProspectNextActionDate(prospect.id, "")}
          >
            Marquer comme traité
          </button>
          <button
            className="min-h-12 rounded-full border border-emerald-400/30 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
            type="button"
            onClick={() => openFollowUpTreatmentForm(prospect)}
          >
            Traiter la relance
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
          <Link
            className="flex min-h-12 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-center text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20"
            href={`/prospects?focus=${encodeURIComponent(prospect.id)}`}
          >
            Voir la fiche
          </Link>
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto grid max-w-6xl gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Focus quotidien
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Aujourd’hui
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Les actions importantes à traiter maintenant.
          </p>
          </div>
          <Link
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 sm:w-auto"
            href="/prospects?action=quick-add"
          >
            Ajout express
          </Link>
        </header>

        {showBackupReminder ? (
          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium leading-6 text-amber-100">
                Sauvegarde recommandée : tes données sont encore locales.
              </p>
              <Link
                className="flex min-h-11 items-center justify-center rounded-full border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-200/20"
                href="/sauvegarde"
              >
                Faire une sauvegarde
              </Link>
            </div>
          </section>
        ) : null}

        {cloudFreshnessStatus?.cloudLooksNewer ? (
          <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium leading-6 text-amber-100">
                Le cloud semble plus r&eacute;cent que ce navigateur.
              </p>
              <Link
                className="flex min-h-11 items-center justify-center rounded-full border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-200/20"
                href="/sauvegarde#fraicheur-donnees"
              >
                V&eacute;rifier le cloud
              </Link>
            </div>
          </section>
        ) : null}

        {shouldSuggestCloudRestore && !cloudFreshnessStatus?.cloudLooksNewer ? (
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium leading-6 text-emerald-100">
                Données cloud disponibles : tu peux charger tes données sur
                cet appareil.
              </p>
              <Link
                className="flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
                href="/sauvegarde#protection-anti-ecrasement"
              >
                Charger depuis le cloud
              </Link>
            </div>
          </section>
        ) : null}

        {cloudSyncStatus?.needsSync && !shouldSuggestCloudRestore ? (
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium leading-6 text-emerald-100">
                Synchronisation cloud recommandée.
              </p>
              <QuickCloudSyncButton compact />
            </div>
          </section>
        ) : null}

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

        {successMessage ? (
          <p className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-200">
            {successMessage}
          </p>
        ) : null}

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

        <section className="grid gap-5">
          {followUpSections.map((section) => (
            <section
              className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
              key={section.title}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-white">{section.title}</h2>
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
                  {section.prospects.map((prospect) => renderFollowUpCard(prospect))}
                </div>
              )}
            </section>
          ))}
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
