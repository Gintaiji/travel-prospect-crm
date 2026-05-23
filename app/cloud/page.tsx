"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from "../lib/supabaseClient";
import {
  DEFAULT_CLOUD_SYNC_SETTINGS,
  loadCloudSyncSettings,
  saveCloudSyncSettings,
  type CloudSyncSettings,
} from "../lib/cloudSyncSettingsStorage";
import {
  getCloudDataSummary,
  getCloudFreshnessStatus,
  getCloudSyncStatus,
  getLocalDataSummary,
  restoreCloudDataToLocal,
  uploadLocalDataToCloud,
  type CloudDataSummary,
  type CloudFreshnessStatus,
  type CloudSyncStatus,
  type LocalDataSummary,
} from "../lib/cloudSync";

export default function CloudPage() {
  const [connectionMessage, setConnectionMessage] = useState("");
  const [sessionMessage, setSessionMessage] = useState("Lecture de la session...");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState(
    "Lecture de l'état cloud...",
  );
  const [cloudDataSummary, setCloudDataSummary] =
    useState<CloudDataSummary | null>(null);
  const [localDataSummary, setLocalDataSummary] =
    useState<LocalDataSummary | null>(null);
  const [cloudFreshnessStatus, setCloudFreshnessStatus] =
    useState<CloudFreshnessStatus | null>(null);
  const [cloudFreshnessMessage, setCloudFreshnessMessage] = useState(
    "Connecte-toi pour comparer les données locales et cloud.",
  );
  const [cloudDataMessage, setCloudDataMessage] = useState(
    "Connecte-toi pour connaître les données cloud.",
  );
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSyncSettings, setAutoSyncSettings] =
    useState<CloudSyncSettings>(DEFAULT_CLOUD_SYNC_SETTINGS);
  const [autoSyncSettingsMessage, setAutoSyncSettingsMessage] = useState("");
  const supabaseConfiguredLabel = isSupabaseConfigured() ? "Oui" : "Non";
  const shouldSuggestCloudRestore = Boolean(
    cloudDataSummary?.hasCloudData && localDataSummary && !localDataSummary.hasLocalData,
  );
  const antiOverwriteStatusLabel = shouldSuggestCloudRestore
    ? "Envoi bloqué pour protéger les données cloud"
    : "Aucun risque détecté";

  function formatDateTime(value: string | null) {
    if (!value) {
      return "Aucune synchronisation cloud enregistrée.";
    }

    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  async function refreshCloudSyncState() {
    try {
      const cloudSyncStatus = await getCloudSyncStatus();
      setLastSyncAt(cloudSyncStatus.lastCloudSyncAt);
      setSyncStatus(cloudSyncStatus);
      setSyncStatusMessage("");
    } catch {
      setLastSyncAt(null);
      setSyncStatus(null);
      setCloudDataSummary(null);
      setCloudFreshnessStatus(null);
      setLocalDataSummary(getLocalDataSummary());
      setCloudDataMessage("Connecte-toi pour connaître les données cloud.");
      setSyncStatusMessage("Connecte-toi pour connaître l'état cloud.");
    }
  }

  async function refreshCloudDataOverview() {
    setLocalDataSummary(getLocalDataSummary());

    try {
      const [summary, freshnessStatus] = await Promise.all([
        getCloudDataSummary(),
        getCloudFreshnessStatus(),
      ]);

      setCloudDataSummary(summary);
      setCloudFreshnessStatus(freshnessStatus);
      setCloudDataMessage("");
      setCloudFreshnessMessage("");
    } catch {
      setCloudDataSummary(null);
      setCloudFreshnessStatus(null);
      setCloudDataMessage("Connecte-toi pour connaître les données cloud.");
      setCloudFreshnessMessage(
        "Connecte-toi pour comparer les données locales et cloud.",
      );
    }
  }

  async function refreshSession() {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setSessionMessage("Aucun utilisateur connecté.");
      setLastSyncAt(null);
      setSyncStatus(null);
      setSyncStatusMessage("Connecte-toi pour connaître l'état cloud.");
      setCloudFreshnessStatus(null);
      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.user) {
      setSessionMessage("Aucun utilisateur connecté.");
      setLastSyncAt(null);
      setSyncStatus(null);
      setSyncStatusMessage("Connecte-toi pour connaître l'état cloud.");
      setCloudFreshnessStatus(null);
      return;
    }

    setSessionMessage(
      data.session.user.email
        ? `Utilisateur connecté : ${data.session.user.email}`
        : "Utilisateur connecté.",
    );

    await refreshCloudSyncState();
    await refreshCloudDataOverview();
  }

  useEffect(() => {
    setAutoSyncSettings(loadCloudSyncSettings());
    refreshSession();
  }, []);

  function saveAutoSyncSettings(nextSettings: CloudSyncSettings) {
    const settingsToSave = {
      ...nextSettings,
      autoSyncDelaySeconds: Math.max(10, nextSettings.autoSyncDelaySeconds),
      updatedAt: new Date().toISOString(),
    };

    saveCloudSyncSettings(settingsToSave);
    setAutoSyncSettings(settingsToSave);
    setAutoSyncSettingsMessage(
      "Paramètres de synchronisation automatique enregistrés.",
    );
  }

  async function testSupabaseConnection() {
    setConnectionMessage("");

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setConnectionMessage("Supabase n'est pas encore configuré.");
      return;
    }

    const { error } = await supabase.auth.getSession();

    setConnectionMessage(
      error
        ? "Connexion Supabase impossible pour le moment."
        : "Client Supabase configuré.",
    );

    await refreshSession();
  }

  async function uploadToCloud() {
    if (shouldSuggestCloudRestore) {
      setSyncMessage(
        "Protection activée : restaure d’abord les données cloud sur cet appareil pour éviter d’écraser ta sauvegarde.",
      );
      return;
    }

    const shouldUpload = window.confirm(
      "Envoyer les données locales vers le cloud ? Les anciennes données cloud de ce compte seront remplacées.",
    );

    if (!shouldUpload) {
      return;
    }

    setIsSyncing(true);
    setSyncMessage("");

    try {
      const summary = await uploadLocalDataToCloud();
      setSyncMessage(
        `Données envoyées vers le cloud avec succès. ${summary.prospectsCount} prospect(s), ${summary.resourcesCount} ressource(s), paramètres ${
          summary.settingsSent ? "envoyés" : "non envoyés"
        }, modèles personnalisés ${
          summary.customMessageTemplatesSent ? "envoyés" : "non envoyés"
        }.`,
      );
      await refreshSession();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Erreur de synchronisation.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function restoreFromCloud() {
    const shouldRestore = window.confirm(
      "Restaurer les données cloud sur cet appareil ? Les données locales actuelles seront remplacées.",
    );

    if (!shouldRestore) {
      return;
    }

    setIsSyncing(true);
    setSyncMessage("");

    try {
      const summary = await restoreCloudDataToLocal();
      setSyncMessage(
        `Données restaurées depuis le cloud avec succès. ${summary.prospectsCount} prospect(s), ${summary.resourcesCount} ressource(s), paramètres ${
          summary.settingsRestored ? "restaurés" : "non restaurés"
        }, modèles personnalisés ${
          summary.customMessageTemplatesRestored ? "restaurés" : "non restaurés"
        }.`,
      );
      await refreshSession();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Erreur de restauration.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 pb-28 text-white sm:px-6 sm:py-10 md:pb-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Cloud
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Cloud
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Préparation de la future synchronisation en ligne.
          </p>
        </header>

        <div className="grid gap-5">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">Configuration</h2>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm leading-6 text-slate-300">
                Supabase configuré :{" "}
                <span className="font-semibold text-white">
                  {supabaseConfiguredLabel}
                </span>
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">État actuel</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-200">
              <li>Les données sont encore stockées localement.</li>
              <li>Aucune migration cloud n'est encore active.</li>
              <li>
                Cette page sert uniquement à vérifier la connexion Supabase.
              </li>
            </ul>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm leading-6 text-slate-200">
                {sessionMessage}
              </p>
              <Link
                href="/connexion"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                Connexion
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-emerald-100">
              Fra&icirc;cheur des donn&eacute;es
            </h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Statut
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  {cloudFreshnessStatus?.statusLabel ?? cloudFreshnessMessage}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Derni&egrave;re synchronisation cloud
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {cloudFreshnessStatus
                    ? formatDateTime(cloudFreshnessStatus.lastCloudSyncAt)
                    : "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Derni&egrave;re modification locale d&eacute;tect&eacute;e
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {cloudFreshnessStatus
                    ? formatDateTime(cloudFreshnessStatus.localLastUpdatedAt)
                    : "-"}
                </p>
              </article>
            </div>

            {cloudFreshnessStatus?.cloudLooksNewer ? (
              <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium leading-6 text-amber-100">
                    Le cloud semble plus r&eacute;cent que ce navigateur. Il est
                    conseill&eacute; de restaurer depuis le cloud avant d&apos;envoyer des
                    donn&eacute;es locales.
                  </p>
                  <button
                    className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={restoreFromCloud}
                    disabled={isSyncing}
                  >
                    Restaurer depuis le cloud
                  </button>
                </div>
              </div>
            ) : null}

            {cloudFreshnessStatus?.localLooksNewer ? (
              <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium leading-6 text-emerald-100">
                    Les donn&eacute;es locales semblent plus r&eacute;centes. Tu peux les
                    envoyer vers le cloud.
                  </p>
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
                    href="#synchronisation-manuelle"
                  >
                    Aller &agrave; la synchronisation
                  </a>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-emerald-100">
                  Test de connexion
                </h2>
                <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                  Aucun prospect, ressource ou paramètre n'est envoyé pendant ce
                  test.
                </p>
              </div>
              <button
                className="min-h-11 w-fit rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
                type="button"
                onClick={testSupabaseConnection}
              >
                Tester la connexion Supabase
              </button>
            </div>

            {connectionMessage ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium text-white">
                {connectionMessage}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-emerald-100">
              État de synchronisation
            </h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Statut
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  {syncStatus?.statusLabel ?? syncStatusMessage}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Dernière synchro cloud
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {syncStatus ? formatDateTime(syncStatus.lastCloudSyncAt) : "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Dernière modification locale détectée
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {syncStatus ? formatDateTime(syncStatus.localLastUpdatedAt) : "-"}
                </p>
              </article>
            </div>
            {syncStatus?.needsSync ? (
              <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-medium leading-6 text-amber-100">
                Certaines données locales semblent plus récentes que la dernière
                synchronisation cloud.
              </p>
            ) : null}
            {!syncStatus && syncStatusMessage ? (
              <Link
                href="/connexion"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                Connexion
              </Link>
            ) : null}
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-emerald-100">
              Données cloud disponibles
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Prospects cloud
                </p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {cloudDataSummary?.prospectsCount ?? "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Ressources cloud
                </p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {cloudDataSummary?.resourcesCount ?? "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Paramètres cloud
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  {cloudDataSummary
                    ? cloudDataSummary.hasSettings
                      ? "Oui"
                      : "Non"
                    : "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Modèles personnalisés cloud
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  {cloudDataSummary
                    ? cloudDataSummary.hasCustomMessageTemplates
                      ? "Oui"
                      : "Non"
                    : "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Dernière synchro cloud
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {cloudDataSummary
                    ? formatDateTime(cloudDataSummary.lastCloudSyncAt)
                    : "-"}
                </p>
              </article>
            </div>

            {shouldSuggestCloudRestore ? (
              <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium leading-6 text-amber-100">
                    Des données cloud sont disponibles, mais ce navigateur ne
                    contient pas encore de données locales.
                  </p>
                  <button
                    className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={restoreFromCloud}
                    disabled={isSyncing}
                  >
                    Restaurer les données cloud sur cet appareil
                  </button>
                </div>
              </div>
            ) : null}

            {!cloudDataSummary && cloudDataMessage ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium leading-6 text-white">
                {cloudDataMessage}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">
              Synchronisation automatique
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Quand cette option est activée, le CRM envoie automatiquement les
              données locales vers le cloud après une modification. La
              protection anti-écrasement reste active.
            </p>
            {!syncStatus && syncStatusMessage ? (
              <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-medium leading-6 text-amber-100">
                Connecte-toi pour utiliser la synchronisation automatique. Tu
                peux préparer ce réglage maintenant, mais la synchro ne pourra
                pas se faire sans connexion.
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-medium text-slate-200">
                <input
                  className="mt-1 h-5 w-5 accent-emerald-400"
                  type="checkbox"
                  checked={autoSyncSettings.autoSyncEnabled}
                  onChange={(event) =>
                    saveAutoSyncSettings({
                      ...autoSyncSettings,
                      autoSyncEnabled: event.target.checked,
                    })
                  }
                />
                <span>
                  <span className="block font-semibold text-white">
                    Activer la synchronisation automatique
                  </span>
                  <span className="mt-1 block leading-6 text-slate-400">
                    Désactivée par défaut. Aucun envoi automatique ne part tant
                    que cette option reste inactive.
                  </span>
                </span>
              </label>

              <label className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-medium text-slate-200">
                Délai avant synchronisation automatique
                <div className="mt-3 flex items-center gap-3">
                  <input
                    className="min-h-11 w-28 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                    min={10}
                    type="number"
                    value={autoSyncSettings.autoSyncDelaySeconds}
                    onChange={(event) =>
                      setAutoSyncSettings({
                        ...autoSyncSettings,
                        autoSyncDelaySeconds: Number(event.target.value),
                      })
                    }
                    onBlur={() => saveAutoSyncSettings(autoSyncSettings)}
                  />
                  <span className="text-slate-400">secondes</span>
                </div>
                <span className="mt-2 block text-xs leading-5 text-slate-500">
                  Minimum conseillé : 10 secondes.
                </span>
              </label>
            </div>

            {autoSyncSettingsMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium leading-6 text-emerald-200">
                {autoSyncSettingsMessage}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">
              Sécurité anti-écrasement
            </h2>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Statut
              </p>
              <p className="mt-2 text-lg font-bold text-white">
                {antiOverwriteStatusLabel}
              </p>
            </div>
            {shouldSuggestCloudRestore ? (
              <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium leading-6 text-amber-100">
                    Protection activée : ce navigateur semble vide alors que le
                    cloud contient des données. Restaure d’abord depuis le cloud
                    pour éviter d’écraser ta sauvegarde.
                  </p>
                  <button
                    className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={restoreFromCloud}
                    disabled={isSyncing}
                  >
                    Restaurer les données cloud sur cet appareil
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section
            className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5"
            id="synchronisation-manuelle"
          >
            <h2 className="text-xl font-bold text-emerald-100">
              Synchronisation manuelle
            </h2>
            <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-medium leading-6 text-amber-100">
              Pour l'instant, la synchronisation est manuelle. Pense à envoyer
              tes données vers le cloud après une grosse session de prospection.
            </p>
            <p className="mt-4 text-sm leading-6 text-emerald-50/90">
              Dernière synchronisation cloud :{" "}
              <span className="font-semibold text-white">
                {formatDateTime(lastSyncAt)}
              </span>
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={uploadToCloud}
                disabled={isSyncing || shouldSuggestCloudRestore}
              >
                Envoyer mes données locales vers le cloud
              </button>
              <button
                className="min-h-11 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={restoreFromCloud}
                disabled={isSyncing}
              >
                Restaurer depuis le cloud vers ce navigateur
              </button>
            </div>

            {syncMessage ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium leading-6 text-white">
                {syncMessage}
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
