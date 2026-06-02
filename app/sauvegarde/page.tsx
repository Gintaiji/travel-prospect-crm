"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadLastBackupDate,
  saveLastBackupDate,
  shouldShowBackupReminder,
} from "../lib/backupReminderStorage";
import {
  DEFAULT_CLOUD_SYNC_SETTINGS,
  loadCloudSyncSettings,
  saveCloudSyncSettings,
  type CloudSyncSettings,
} from "../lib/cloudSyncSettingsStorage";
import {
  isStartupCloudCheckRunning,
  loadStartupRestoreStatus,
  type StartupRestoreStatus,
} from "../lib/cloudStartupRestoreStorage";
import {
  canUploadLocalDataSafely,
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
import {
  loadCustomMessageTemplates,
  saveCustomMessageTemplates,
  type CustomMessageTemplates,
} from "../lib/messageTemplateStorage";
import { loadProspects, saveProspects } from "../lib/prospectStorage";
import { getTodayDateString } from "../lib/prospectUtils";
import { loadResources, saveResources } from "../lib/resourceStorage";
import {
  DEFAULT_APP_SETTINGS,
  loadSettings,
  saveSettings,
} from "../lib/settingsStorage";
import type { AppSettings, Prospect, Resource } from "../lib/types";
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from "../lib/supabaseClient";

type BackupFile = {
  appName: "Travel Prospect CRM";
  version: 1 | 2 | 3;
  exportedAt: string;
  prospects: Prospect[];
  resources: Resource[];
  settings?: AppSettings;
  customMessageTemplates?: CustomMessageTemplates;
};

type ProtectionStatus = "unknown" | "granted" | "denied";

const backupAppName = "Travel Prospect CRM";

function getTotalConversationCount(prospects: Prospect[]) {
  return prospects.reduce(
    (totalConversations, prospect) =>
      totalConversations + (prospect.conversationHistory ?? []).length,
    0,
  );
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const backup = value as Partial<BackupFile>;

  return (
    backup.appName === backupAppName &&
    Array.isArray(backup.prospects) &&
    Array.isArray(backup.resources)
  );
}

function hasBackupSettings(value: BackupFile): value is BackupFile & { settings: Partial<AppSettings> } {
  return Boolean(value.settings && typeof value.settings === "object");
}

function hasBackupCustomMessageTemplates(
  value: BackupFile,
): value is BackupFile & { customMessageTemplates: CustomMessageTemplates } {
  return Boolean(
    value.customMessageTemplates &&
      typeof value.customMessageTemplates === "object",
  );
}

function normalizeImportedSettings(importedSettings: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...importedSettings,
    defaultFollowUpDays:
      typeof importedSettings.defaultFollowUpDays === "number"
        ? importedSettings.defaultFollowUpDays
        : DEFAULT_APP_SETTINGS.defaultFollowUpDays,
    updatedAt:
      typeof importedSettings.updatedAt === "string"
        ? importedSettings.updatedAt
        : new Date().toISOString(),
  };
}

function hasCustomSettings(settings: AppSettings) {
  return (
    settings.userDisplayName.trim() !== DEFAULT_APP_SETTINGS.userDisplayName ||
    settings.businessName.trim() !== DEFAULT_APP_SETTINGS.businessName ||
    settings.clubName.trim() !== DEFAULT_APP_SETTINGS.clubName ||
    settings.defaultCountry.trim() !== DEFAULT_APP_SETTINGS.defaultCountry ||
    settings.defaultRegion.trim() !== DEFAULT_APP_SETTINGS.defaultRegion ||
    settings.defaultCity.trim() !== DEFAULT_APP_SETTINGS.defaultCity ||
    settings.defaultMessageStyle !== DEFAULT_APP_SETTINGS.defaultMessageStyle ||
    settings.defaultFollowUpDays !== DEFAULT_APP_SETTINGS.defaultFollowUpDays ||
    settings.defaultPresentationLink.trim() !== DEFAULT_APP_SETTINGS.defaultPresentationLink ||
    settings.messageSignature.trim() !== DEFAULT_APP_SETTINGS.messageSignature ||
    settings.publicWording.trim() !== DEFAULT_APP_SETTINGS.publicWording
  );
}

function hasCustomMessageTemplates(customMessageTemplates: CustomMessageTemplates) {
  return Object.values(customMessageTemplates).some((stepTemplates) =>
    stepTemplates
      ? Object.values(stepTemplates).some((message) => typeof message === "string")
      : false,
  );
}

function formatLastBackupDate(lastBackupDate: string) {
  if (!lastBackupDate) {
    return "";
  }

  const parsedDate = new Date(lastBackupDate);

  return Number.isNaN(parsedDate.getTime())
    ? ""
    : parsedDate.toLocaleString("fr-FR");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Aucune synchronisation cloud enregistrée.";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatOptionalDateTime(value: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BackupPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [customMessageTemplates, setCustomMessageTemplates] =
    useState<CustomMessageTemplates>({});
  const [lastReadAt, setLastReadAt] = useState("");
  const [lastBackupDate, setLastBackupDate] = useState("");
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [storageApiAvailable, setStorageApiAvailable] = useState(false);
  const [persistApiAvailable, setPersistApiAvailable] = useState(false);
  const [protectionStatus, setProtectionStatus] =
    useState<ProtectionStatus>("unknown");
  const [requestMessage, setRequestMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [sessionMessage, setSessionMessage] = useState(
    "Lecture de la session...",
  );
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus | null>(null);
  const [cloudSyncStatusMessage, setCloudSyncStatusMessage] = useState(
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
  const [cloudSyncSettings, setCloudSyncSettings] =
    useState<CloudSyncSettings>(DEFAULT_CLOUD_SYNC_SETTINGS);
  const [autoSyncSettingsMessage, setAutoSyncSettingsMessage] = useState("");
  const [startupRestoreStatus, setStartupRestoreStatusState] =
    useState<StartupRestoreStatus | null>(null);
  const [startupCloudCheckRunning, setStartupCloudCheckRunningState] =
    useState(false);

  function refreshLocalSnapshot() {
    setProspects(loadProspects());
    setResources(loadResources());
    setSettings(loadSettings());
    setCustomMessageTemplates(loadCustomMessageTemplates());
    setLocalDataSummary(getLocalDataSummary());
    setLastReadAt(new Date().toLocaleString("fr-FR"));
  }

  async function refreshCloudSyncState() {
    try {
      const nextCloudSyncStatus = await getCloudSyncStatus();

      setLastSyncAt(nextCloudSyncStatus.lastCloudSyncAt);
      setCloudSyncStatus(nextCloudSyncStatus);
      setCloudSyncStatusMessage("");
    } catch {
      setLastSyncAt(null);
      setCloudSyncStatus(null);
      setCloudDataSummary(null);
      setCloudFreshnessStatus(null);
      setLocalDataSummary(getLocalDataSummary());
      setCloudDataMessage("Connecte-toi pour connaître les données cloud.");
      setCloudSyncStatusMessage("Connecte-toi pour connaître l'état cloud.");
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
      setCloudSyncStatus(null);
      setCloudSyncStatusMessage("Connecte-toi pour connaître l'état cloud.");
      setCloudFreshnessStatus(null);
      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.user) {
      setSessionMessage("Aucun utilisateur connecté.");
      setLastSyncAt(null);
      setCloudSyncStatus(null);
      setCloudSyncStatusMessage("Connecte-toi pour connaître l'état cloud.");
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
    const loadStoredData = window.setTimeout(() => {
      refreshLocalSnapshot();
      setCloudSyncSettings(loadCloudSyncSettings());
      setStartupRestoreStatusState(loadStartupRestoreStatus());
      setStartupCloudCheckRunningState(isStartupCloudCheckRunning());
      const storedLastBackupDate = loadLastBackupDate();

      setLastBackupDate(storedLastBackupDate);
      setShowBackupReminder(shouldShowBackupReminder(storedLastBackupDate));

      const browserStorage = navigator.storage;
      const hasStorageApi = Boolean(browserStorage);
      const hasPersistApi = typeof browserStorage?.persist === "function";

      setStorageApiAvailable(hasStorageApi);
      setPersistApiAvailable(hasPersistApi);

      if (typeof browserStorage?.persisted === "function") {
        browserStorage
          .persisted()
          .then((isPersisted) =>
            setProtectionStatus(isPersisted ? "granted" : "denied"),
          )
          .catch(() => setProtectionStatus("unknown"));
      }
    }, 0);

    return () => window.clearTimeout(loadStoredData);
  }, []);

  useEffect(() => {
    refreshSession();
  }, []);

  const totalConversationCount = getTotalConversationCount(prospects);
  const customSettingsLabel = hasCustomSettings(settings) ? "Oui" : "Non";
  const customMessageTemplatesLabel = hasCustomMessageTemplates(customMessageTemplates)
    ? "Oui"
    : "Non";
  const formattedLastBackupDate = formatLastBackupDate(lastBackupDate);
  const supabaseConfiguredLabel = isSupabaseConfigured() ? "Oui" : "Non";
  const shouldSuggestCloudRestore = Boolean(
    cloudDataSummary?.hasCloudData &&
      localDataSummary &&
      !localDataSummary.hasLocalData,
  );
  const antiOverwriteStatusLabel = shouldSuggestCloudRestore
    ? "Envoi bloqué pour protéger les données cloud"
    : "Aucun risque détecté";
  const hasStartupRestoreStatus = Boolean(startupRestoreStatus?.lastCheckedAt);

  function exportCompleteBackup() {
    const backup: BackupFile = {
      appName: backupAppName,
      version: 3,
      exportedAt: new Date().toISOString(),
      prospects,
      resources,
      settings,
      customMessageTemplates,
    };
    const backupBlob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const backupUrl = URL.createObjectURL(backupBlob);
    const downloadLink = document.createElement("a");

    downloadLink.href = backupUrl;
    downloadLink.download = `travel-prospect-crm-sauvegarde-complete-${getTodayDateString()}.json`;
    downloadLink.click();
    URL.revokeObjectURL(backupUrl);

    const exportedAt = new Date().toISOString();

    saveLastBackupDate(exportedAt);
    setLastBackupDate(exportedAt);
    setShowBackupReminder(false);
  }

  async function requestStorageProtection() {
    if (typeof navigator.storage?.persist !== "function") {
      return;
    }

    setRequestMessage("");

    const isPersisted = await navigator.storage.persist();

    setProtectionStatus(isPersisted ? "granted" : "denied");
    setRequestMessage(
      isPersisted
        ? "Protection du stockage activée."
        : "Le navigateur n'a pas accordé la protection du stockage.",
    );
  }

  function saveAutoSyncSettings(nextSettings: CloudSyncSettings) {
    const settingsToSave = {
      ...nextSettings,
      autoSyncDelaySeconds: Math.max(10, nextSettings.autoSyncDelaySeconds),
      updatedAt: new Date().toISOString(),
    };

    saveCloudSyncSettings(settingsToSave);
    setCloudSyncSettings(settingsToSave);
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
    setSyncMessage("");

    try {
      const uploadSafetyCheck = await canUploadLocalDataSafely();

      if (!uploadSafetyCheck.canUpload) {
        setSyncMessage(uploadSafetyCheck.reason);
        return;
      }
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Erreur de synchronisation.",
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
      setSyncMessage(
        error instanceof Error ? error.message : "Erreur de synchronisation.",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function restoreFromCloud() {
    const shouldRestore = window.confirm(
      "Charger les données cloud sur cet appareil ? Les données présentes sur cet appareil seront remplacées.",
    );

    if (!shouldRestore) {
      return;
    }

    setIsSyncing(true);
    setSyncMessage("");

    try {
      const summary = await restoreCloudDataToLocal();

      refreshLocalSnapshot();
      setSyncMessage(
        `Données chargées depuis le cloud avec succès. ${summary.prospectsCount} prospect(s), ${summary.resourcesCount} ressource(s), paramètres ${
          summary.settingsRestored ? "chargés" : "non chargés"
        }, modèles personnalisés ${
          summary.customMessageTemplatesRestored ? "chargés" : "non chargés"
        }.`,
      );
      await refreshSession();
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Erreur de chargement.",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  function handleImportBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    setImportMessage("");
    setImportError("");

    if (!selectedFile) {
      event.target.value = "";
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".json")) {
      setImportError("Fichier invalide. Chargement impossible.");
      event.target.value = "";
      return;
    }

    const fileReader = new FileReader();

    fileReader.onload = () => {
      try {
        const parsedBackup = JSON.parse(String(fileReader.result));

        if (!isBackupFile(parsedBackup)) {
          setImportError("Fichier invalide. Chargement impossible.");
          return;
        }

        const shouldImport = window.confirm(
          "Charger cette sauvegarde complète ? Les prospects, ressources, paramètres et modèles personnalisés seront remplacés si la sauvegarde les contient.",
        );

        if (!shouldImport) {
          return;
        }

        saveProspects(parsedBackup.prospects);
        saveResources(parsedBackup.resources);
        if (hasBackupSettings(parsedBackup)) {
          const importedSettings = normalizeImportedSettings(parsedBackup.settings);

          saveSettings(importedSettings);
          setSettings(importedSettings);
        }
        if (hasBackupCustomMessageTemplates(parsedBackup)) {
          saveCustomMessageTemplates(parsedBackup.customMessageTemplates);
          setCustomMessageTemplates(parsedBackup.customMessageTemplates);
        }
        setProspects(parsedBackup.prospects);
        setResources(parsedBackup.resources);
        setLastReadAt(new Date().toLocaleString("fr-FR"));
        setImportMessage("Sauvegarde complète chargée avec succès.");
      } catch {
        setImportError("Fichier invalide. Chargement impossible.");
      } finally {
        event.target.value = "";
      }
    };

    fileReader.onerror = () => {
      setImportError("Fichier invalide. Chargement impossible.");
      event.target.value = "";
    };

    fileReader.readAsText(selectedFile);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 pb-28 text-white sm:px-6 sm:py-10 md:pb-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Données locales
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Sauvegarde
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Sauvegarde, protège et prépare la synchronisation de tes données locales.
          </p>
        </header>

        <div className="grid gap-5">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">Résumé des données</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Prospects
                </p>
                <p className="mt-2 text-3xl font-bold text-white">{prospects.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Échanges
                </p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {totalConversationCount}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Ressources
                </p>
                <p className="mt-2 text-3xl font-bold text-white">{resources.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Paramètres personnalisés
                </p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {customSettingsLabel}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Modèles personnalisés
                </p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {customMessageTemplatesLabel}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Dernière sauvegarde complète
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {formattedLastBackupDate ||
                    "Aucune sauvegarde complète enregistrée sur cet appareil."}
                </p>
              </article>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Sauvegarde complète</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Sauvegarde les prospects, ressources, paramètres et modèles
                  personnalisés dans un fichier JSON complet.
                </p>
              </div>
              <button
                className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                type="button"
                onClick={exportCompleteBackup}
              >
                Sauvegarder mes données
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">
              Charger une sauvegarde
            </h2>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <label className="flex flex-col gap-3 text-sm font-medium text-slate-200">
                Fichier de sauvegarde JSON
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-400/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-200 hover:file:bg-emerald-400/20"
                  accept=".json,application/json"
                  type="file"
                  onChange={handleImportBackup}
                />
              </label>
              {importMessage ? (
                <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium text-emerald-200">
                  {importMessage}
                </p>
              ) : null}
              {importError ? (
                <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm font-medium text-rose-200">
                  {importError}
                </p>
              ) : null}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <h2 className="text-xl font-bold text-white">
                État du stockage local
              </h2>
              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Mode actuel
                  </p>
                  <p className="mt-2 text-lg font-bold text-white">
                    Stockage local du navigateur
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Dernière lecture
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-white">
                    {lastReadAt || "Chargement..."}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Protection du stockage local
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Stockage protégé :{" "}
                    <span className="font-semibold text-white">
                      {protectionStatus === "granted" ? "Oui" : "Non"}
                    </span>
                  </p>
                </div>

                {storageApiAvailable && persistApiAvailable ? (
                  <button
                    className="min-h-11 w-fit rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                    type="button"
                    onClick={requestStorageProtection}
                  >
                    Demander la protection du stockage
                  </button>
                ) : null}
              </div>

              {storageApiAvailable && persistApiAvailable ? (
                requestMessage ? (
                  <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium text-emerald-200">
                    {requestMessage}
                  </p>
                ) : null
              ) : (
                <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm font-medium text-amber-100">
                  Ce navigateur ne permet pas de demander la protection du stockage.
                </p>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">Rappel de sauvegarde</h2>
            {showBackupReminder ? (
              <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm font-medium leading-6 text-amber-100">
                Sauvegarde recommandée : tes données sont encore locales. Pense à
                sauvegarder tes données.
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium leading-6 text-emerald-200">
                Sauvegarde complète enregistrée récemment sur cet appareil.
              </p>
            )}
          </section>

          <section
            className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5"
            id="cloud-synchronisation"
          >
            <h2 className="text-xl font-bold text-emerald-100">
              Cloud &amp; synchronisation
            </h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Supabase configuré
                </p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {supabaseConfiguredLabel}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Session
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {sessionMessage}
                </p>
                {!cloudSyncStatus ? (
                  <Link
                    href="/connexion"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
                  >
                    Connexion
                  </Link>
                ) : null}
              </article>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Statut
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  {cloudSyncStatus?.statusLabel ?? cloudSyncStatusMessage}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Dernière synchro cloud
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {formatDateTime(lastSyncAt)}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Synchro automatique
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  {cloudSyncSettings.autoSyncEnabled ? "Activée" : "Désactivée"}
                </p>
              </article>
            </div>

            <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <h3 className="text-lg font-bold text-white">
                Chargement automatique du cloud
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Au démarrage ou après connexion, l&apos;app vérifie le cloud avant
                de laisser la synchronisation automatique envoyer des données.
              </p>

              {hasStartupRestoreStatus ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                      Dernière vérification
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white">
                      {formatOptionalDateTime(
                        startupRestoreStatus?.lastCheckedAt ?? "",
                      )}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                      Dernier chargement automatique
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white">
                      {formatOptionalDateTime(
                        startupRestoreStatus?.lastRestoredAt ?? "",
                      )}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                      Dernier message
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white">
                      {startupRestoreStatus?.lastMessage || "-"}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                      Vérification en cours
                    </p>
                    <p className="mt-2 text-lg font-bold text-white">
                      {startupCloudCheckRunning ? "Oui" : "Non"}
                    </p>
                  </article>
                </div>
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-medium leading-6 text-white">
                    Aucune vérification cloud automatique enregistrée pour le
                    moment.
                  </p>
                  <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                      Vérification en cours
                    </p>
                    <p className="mt-2 text-lg font-bold text-white">
                      {startupCloudCheckRunning ? "Oui" : "Non"}
                    </p>
                  </article>
                </div>
              )}
            </section>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                className="min-h-11 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
                type="button"
                onClick={testSupabaseConnection}
              >
                Tester la connexion Supabase
              </button>
              <button
                className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={uploadToCloud}
                disabled={isSyncing || shouldSuggestCloudRestore}
              >
                Sauvegarder dans le cloud
              </button>
              <button
                className="min-h-11 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={restoreFromCloud}
                disabled={isSyncing}
              >
                Charger depuis le cloud
              </button>
            </div>

            {connectionMessage ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium text-white">
                {connectionMessage}
              </p>
            ) : null}
            {syncMessage ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium leading-6 text-white">
                {syncMessage}
              </p>
            ) : null}
          </section>

          <section
            className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5"
            id="fraicheur-donnees"
          >
            <h2 className="text-xl font-bold text-emerald-100">
              Fraîcheur des données
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
                  Dernière synchronisation cloud
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {cloudFreshnessStatus
                    ? formatDateTime(cloudFreshnessStatus.lastCloudSyncAt)
                    : "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  Dernière modification locale détectée
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
                    Le cloud semble plus récent que ce navigateur. Il est
                    conseillé de charger depuis le cloud avant d&apos;envoyer des
                    données locales.
                  </p>
                  <button
                    className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={restoreFromCloud}
                    disabled={isSyncing}
                  >
                    Charger depuis le cloud
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section
            className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"
            id="protection-anti-ecrasement"
          >
            <h2 className="text-xl font-bold text-white">
              Sécurité anti-écrasement
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Prospects cloud
                </p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {cloudDataSummary?.prospectsCount ?? "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Ressources cloud
                </p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {cloudDataSummary?.resourcesCount ?? "-"}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
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
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Modèles cloud
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
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Statut
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {antiOverwriteStatusLabel}
                </p>
              </article>
            </div>

            {shouldSuggestCloudRestore ? (
              <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium leading-6 text-amber-100">
                    Protection activée : ce navigateur semble vide alors que le
                    cloud contient des données. Charge d&apos;abord depuis le
                    cloud pour éviter d&apos;écraser ta sauvegarde.
                  </p>
                  <button
                    className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={restoreFromCloud}
                    disabled={isSyncing}
                  >
                    Charger les données cloud sur cet appareil
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

          <section
            className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"
            id="parametres-synchro-automatique"
          >
            <h2 className="text-xl font-bold text-white">
              Synchronisation automatique
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Quand cette option est activée, le CRM envoie automatiquement les
              données locales vers le cloud après une modification. La
              protection anti-écrasement reste active.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Activée par défaut, elle envoie tes modifications vers le cloud
              après un court délai, sauf si la sécurité anti-écrasement bloque
              l’envoi.
            </p>
            {!cloudSyncStatus && cloudSyncStatusMessage ? (
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
                  checked={cloudSyncSettings.autoSyncEnabled}
                  onChange={(event) =>
                    saveAutoSyncSettings({
                      ...cloudSyncSettings,
                      autoSyncEnabled: event.target.checked,
                    })
                  }
                />
                <span>
                  <span className="block font-semibold text-white">
                    Activer la synchronisation automatique
                  </span>
                  <span className="mt-1 block leading-6 text-slate-400">
                    Tu peux la désactiver à tout moment. Aucun envoi
                    automatique ne part si cette option est inactive.
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
                    value={cloudSyncSettings.autoSyncDelaySeconds}
                    onChange={(event) =>
                      setCloudSyncSettings({
                        ...cloudSyncSettings,
                        autoSyncDelaySeconds: Number(event.target.value),
                      })
                    }
                    onBlur={() => saveAutoSyncSettings(cloudSyncSettings)}
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

          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-amber-100">
              Risque à connaître
            </h2>
            <p className="mt-4 text-sm leading-6 text-amber-100/90">
              Cette V1 utilise encore le stockage local du navigateur. Si tu
              supprimes les données du site, l&apos;historique ou les données de
              navigation, tes prospects peuvent disparaître. La sauvegarde
              complète reste indispensable tant que le cloud n&apos;est pas activé
              comme source principale.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
