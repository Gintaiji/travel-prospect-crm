"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadLastBackupDate,
  saveLastBackupDate,
  shouldShowBackupReminder,
} from "../lib/backupReminderStorage";
import { getCloudSyncStatus, type CloudSyncStatus } from "../lib/cloudSync";
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
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus | null>(null);
  const [cloudSyncStatusMessage, setCloudSyncStatusMessage] = useState(
    "Lecture de l'état cloud...",
  );

  useEffect(() => {
    const loadStoredData = window.setTimeout(() => {
      setProspects(loadProspects());
      setResources(loadResources());
      setSettings(loadSettings());
      setCustomMessageTemplates(loadCustomMessageTemplates());
      const storedLastBackupDate = loadLastBackupDate();

      setLastBackupDate(storedLastBackupDate);
      setShowBackupReminder(shouldShowBackupReminder(storedLastBackupDate));
      setLastReadAt(new Date().toLocaleString("fr-FR"));

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
    void getCloudSyncStatus()
      .then((status) => {
        setCloudSyncStatus(status);
        setCloudSyncStatusMessage("");
      })
      .catch(() => {
        setCloudSyncStatus(null);
        setCloudSyncStatusMessage("Connecte-toi pour connaître l'état cloud.");
      });
  }, []);

  const totalConversationCount = getTotalConversationCount(prospects);
  const customSettingsLabel = hasCustomSettings(settings) ? "Oui" : "Non";
  const customMessageTemplatesLabel = hasCustomMessageTemplates(customMessageTemplates)
    ? "Oui"
    : "Non";
  const formattedLastBackupDate = formatLastBackupDate(lastBackupDate);

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

  function handleImportBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    setImportMessage("");
    setImportError("");

    if (!selectedFile) {
      event.target.value = "";
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".json")) {
      setImportError("Fichier invalide. Import impossible.");
      event.target.value = "";
      return;
    }

    const fileReader = new FileReader();

    fileReader.onload = () => {
      try {
        const parsedBackup = JSON.parse(String(fileReader.result));

        if (!isBackupFile(parsedBackup)) {
          setImportError("Fichier invalide. Import impossible.");
          return;
        }

        const shouldImport = window.confirm(
          "Importer cette sauvegarde complète ? Les prospects, ressources, paramètres et modèles personnalisés seront remplacés si la sauvegarde les contient.",
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
        setImportMessage("Sauvegarde complète importée avec succès.");
      } catch {
        setImportError("Fichier invalide. Import impossible.");
      } finally {
        event.target.value = "";
      }
    };

    fileReader.onerror = () => {
      setImportError("Fichier invalide. Import impossible.");
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
            Exporte, protège et prépare la synchronisation de tes données locales.
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
                  Exporte les prospects, ressources, paramètres et modèles
                  personnalisés dans un fichier JSON complet.
                </p>
              </div>
              <button
                className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                type="button"
                onClick={exportCompleteBackup}
              >
                Exporter la sauvegarde complète
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">
              Importer une sauvegarde complète
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
                exporter une sauvegarde complète.
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium leading-6 text-emerald-200">
                Sauvegarde complète enregistrée récemment sur cet appareil.
              </p>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 sm:p-5">
              <h2 className="text-xl font-bold text-amber-100">
                Risque à connaître
              </h2>
              <p className="mt-4 text-sm leading-6 text-amber-100/90">
                Cette V1 utilise encore le stockage local du navigateur. Si tu
                supprimes les données du site, l&apos;historique ou les données de
                navigation, tes prospects peuvent disparaître. La sauvegarde
                complète reste indispensable tant que le cloud n&apos;est pas activé.
              </p>
            </section>

            <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
              <h2 className="text-xl font-bold text-emerald-100">
                Préparation cloud
              </h2>
              <p className="mt-4 text-sm leading-6 text-emerald-50/90">
                Prochaine étape : connecter une base de données en ligne pour
                retrouver tes données même après nettoyage du téléphone ou
                changement d&apos;appareil.
              </p>
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-semibold leading-6 text-white">
                Statut cloud :{" "}
                {cloudSyncStatus
                  ? cloudSyncStatus.needsSync
                    ? "Synchronisation recommandée"
                    : "Cloud à jour"
                  : cloudSyncStatusMessage}
              </p>
              {!cloudSyncStatus && cloudSyncStatusMessage ? (
                <Link
                  href="/connexion"
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-300/10"
                >
                  Se connecter
                </Link>
              ) : null}
              <Link
                href="/cloud"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                Vérifier la préparation cloud
              </Link>
              <Link
                href="/cloud"
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                Synchroniser avec le cloud
              </Link>

              <Link
                href="/connexion"
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-300/10"
              >
                Se connecter au cloud
              </Link>

              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <h3 className="text-base font-bold text-white">
                  Ce que le cloud permettra
                </h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                  <li>Retrouver les données après connexion</li>
                  <li>Utiliser plusieurs appareils</li>
                  <li>Préparer une version équipe</li>
                  <li>Garder localStorage comme cache de secours</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
