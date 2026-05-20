"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadLastBackupDate,
  shouldShowBackupReminder,
} from "../lib/backupReminderStorage";
import {
  loadCustomMessageTemplates,
  type CustomMessageTemplates,
} from "../lib/messageTemplateStorage";
import { loadProspects } from "../lib/prospectStorage";
import { loadResources } from "../lib/resourceStorage";
import { DEFAULT_APP_SETTINGS, loadSettings } from "../lib/settingsStorage";
import type { AppSettings, Prospect, Resource } from "../lib/types";

type ProtectionStatus = "unknown" | "granted" | "denied";

function getTotalConversationCount(prospects: Prospect[]) {
  return prospects.reduce(
    (totalConversations, prospect) =>
      totalConversations + (prospect.conversationHistory ?? []).length,
    0,
  );
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

export default function StoragePage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [customMessageTemplates, setCustomMessageTemplates] =
    useState<CustomMessageTemplates>({});
  const [storageApiAvailable, setStorageApiAvailable] = useState(false);
  const [persistApiAvailable, setPersistApiAvailable] = useState(false);
  const [protectionStatus, setProtectionStatus] =
    useState<ProtectionStatus>("unknown");
  const [requestMessage, setRequestMessage] = useState("");
  const [lastBackupDate, setLastBackupDate] = useState("");
  const [showBackupReminder, setShowBackupReminder] = useState(false);

  useEffect(() => {
    const loadStoredData = window.setTimeout(() => {
      setProspects(loadProspects());
      setResources(loadResources());
      setSettings(loadSettings());
      setCustomMessageTemplates(loadCustomMessageTemplates());

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

  const storageStats = useMemo(
    () => [
      { label: "Mode actuel", value: "Stockage local du navigateur" },
      { label: "Nombre de prospects", value: String(prospects.length) },
      {
        label: "Nombre total d'échanges",
        value: String(getTotalConversationCount(prospects)),
      },
      { label: "Nombre de ressources", value: String(resources.length) },
      {
        label: "Paramètres personnalisés",
        value: hasCustomSettings(settings) ? "Oui" : "Non",
      },
      {
        label: "Modèles de messages personnalisés",
        value: hasCustomMessageTemplates(customMessageTemplates) ? "Oui" : "Non",
      },
    ],
    [customMessageTemplates, prospects, resources.length, settings],
  );
  const formattedLastBackupDate = formatLastBackupDate(lastBackupDate);

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

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 pb-28 text-white sm:px-6 sm:py-10 md:pb-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Données locales
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Stockage & sécurité
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Protège tes données locales et prépare la future synchronisation cloud.
          </p>
        </header>

        <div className="grid gap-5">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">
              État actuel du stockage
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Dernière sauvegarde complète :{" "}
              <span className="font-semibold text-white">
                {formattedLastBackupDate || "Aucune sauvegarde complète enregistrée sur cet appareil."}
              </span>
            </p>
            {showBackupReminder ? (
              <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm font-medium leading-6 text-amber-100">
                Sauvegarde recommandée : tes données sont encore locales. Pense à
                exporter une sauvegarde complète.
              </p>
            ) : null}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {storageStats.map((storageStat) => (
                <article
                  className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                  key={storageStat.label}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {storageStat.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {storageStat.value}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                  className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
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

            <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <h2 className="text-xl font-bold text-white">
                Sauvegarde recommandée
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Fais une sauvegarde après chaque grosse session de prospection ou
                avant de nettoyer ton téléphone.
              </p>
              <Link
                href="/sauvegarde"
                className="mt-5 inline-flex min-h-11 items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
              >
                Faire une sauvegarde complète
              </Link>
            </section>
          </div>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-emerald-100">
              Préparation cloud
            </h2>
            <p className="mt-4 text-sm leading-6 text-emerald-50/90">
              Prochaine étape : connecter une base de données en ligne pour
              retrouver tes données même après nettoyage du téléphone ou
              changement d&apos;appareil.
            </p>

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
      </section>
    </main>
  );
}
