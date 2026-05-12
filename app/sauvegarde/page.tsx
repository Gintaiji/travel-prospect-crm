"use client";

import { useEffect, useState } from "react";
import { loadProspects, saveProspects } from "../lib/prospectStorage";
import { getTodayDateString } from "../lib/prospectUtils";
import { loadResources, saveResources } from "../lib/resourceStorage";
import type { Prospect, Resource } from "../lib/types";

type BackupFile = {
  appName: "Travel Prospect CRM";
  version: 1;
  exportedAt: string;
  prospects: Prospect[];
  resources: Resource[];
};

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

export default function BackupPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [lastReadAt, setLastReadAt] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  useEffect(() => {
    const loadStoredData = window.setTimeout(() => {
      setProspects(loadProspects());
      setResources(loadResources());
      setLastReadAt(new Date().toLocaleString("fr-FR"));
    }, 0);

    return () => window.clearTimeout(loadStoredData);
  }, []);

  const totalConversationCount = getTotalConversationCount(prospects);

  function exportCompleteBackup() {
    const backup: BackupFile = {
      appName: backupAppName,
      version: 1,
      exportedAt: new Date().toISOString(),
      prospects,
      resources,
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
          "Importer cette sauvegarde complète ? Les prospects et ressources actuels seront remplacés.",
        );

        if (!shouldImport) {
          return;
        }

        saveProspects(parsedBackup.prospects);
        saveResources(parsedBackup.resources);
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
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Données locales
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Sauvegarde</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Exporte et restaure toutes les données locales de ton CRM.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                Sauvegarde complète
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">
                Exporter ou restaurer tout le CRM
              </h2>
            </div>
            <button
              className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
              type="button"
              onClick={exportCompleteBackup}
            >
              Exporter la sauvegarde complète
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Prospects</p>
              <p className="mt-2 text-3xl font-bold text-white">{prospects.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Échanges</p>
              <p className="mt-2 text-3xl font-bold text-white">{totalConversationCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Ressources</p>
              <p className="mt-2 text-3xl font-bold text-white">{resources.length}</p>
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

          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <label className="flex flex-col gap-3 text-sm font-medium text-slate-200">
              Importer une sauvegarde complète
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

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">Quand exporter ?</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <li>Avant une grosse modification</li>
              <li>Après une session de prospection importante</li>
              <li>Avant de changer de navigateur ou d’ordinateur</li>
              <li>Régulièrement tant que l’app fonctionne en stockage local</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-amber-100">Attention</h2>
            <p className="mt-4 text-sm leading-6 text-amber-100/90">
              Cette V1 utilise le stockage local du navigateur. La sauvegarde complète est ta ceinture de sécurité.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
