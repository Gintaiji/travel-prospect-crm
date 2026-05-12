"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  DEFAULT_APP_SETTINGS,
  loadSettings,
  saveSettings,
} from "../lib/settingsStorage";
import type { AppSettings } from "../lib/types";

const messageStyles: AppSettings["defaultMessageStyle"][] = [
  "Doux",
  "Naturel",
  "Direct",
];

function createDefaultSettings() {
  return {
    ...DEFAULT_APP_SETTINGS,
    updatedAt: new Date().toISOString(),
  };
}

function buildPreviewMessage(settings: AppSettings) {
  const displayName = settings.userDisplayName.trim();
  const clubName = settings.clubName.trim() || DEFAULT_APP_SETTINGS.clubName;
  const publicWording =
    settings.publicWording.trim() || DEFAULT_APP_SETTINGS.publicWording;
  const signature = settings.messageSignature.trim();
  const message = [
    "Salut,",
    `je voulais te partager une idée autour de ${clubName}.`,
    `L’idée, c’est une ${publicWording}, simple à découvrir si le sujet voyage te parle.`,
    displayName ? `Je peux t’envoyer les infos tranquillement. ${displayName}` : "Je peux t’envoyer les infos tranquillement.",
  ].join("\n");

  return signature ? `${message}\n\n${signature}` : message;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const loadStoredSettings = window.setTimeout(() => {
      setSettings(loadSettings());
    }, 0);

    return () => window.clearTimeout(loadStoredSettings);
  }, []);

  function updateSetting<Field extends keyof AppSettings>(
    field: Field,
    value: AppSettings[Field],
  ) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));
  }

  function showSavedMessage(message: string) {
    setSavedMessage(message);

    window.setTimeout(() => {
      setSavedMessage("");
    }, 2500);
  }

  function handleTextChange(
    field: keyof Omit<AppSettings, "defaultFollowUpDays" | "updatedAt">,
  ) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      updateSetting(field, event.target.value as AppSettings[typeof field]);
    };
  }

  function handleFollowUpDaysChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = Number(event.target.value);

    updateSetting("defaultFollowUpDays", Number.isFinite(nextValue) ? nextValue : 0);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const settingsToSave: AppSettings = {
      ...settings,
      defaultFollowUpDays: Math.max(0, Math.round(settings.defaultFollowUpDays)),
      updatedAt: new Date().toISOString(),
    };

    saveSettings(settingsToSave);
    setSettings(settingsToSave);
    showSavedMessage("Paramètres enregistrés.");
  }

  function resetSettings() {
    const shouldReset = window.confirm("Réinitialiser les paramètres ?");

    if (!shouldReset) {
      return;
    }

    const defaultSettings = createDefaultSettings();

    saveSettings(defaultSettings);
    setSettings(defaultSettings);
    showSavedMessage("Paramètres enregistrés.");
  }

  const previewMessage = buildPreviewMessage(settings);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Configuration
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Paramètres</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Personnalise ton CRM pour gagner du temps dans tes conversations.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <form
            className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Nom affiché dans les messages
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.userDisplayName}
                  onChange={handleTextChange("userDisplayName")}
                  placeholder="Ton prénom ou nom affiché"
                  type="text"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Nom de l’activité / outil
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.businessName}
                  onChange={handleTextChange("businessName")}
                  type="text"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Nom public du club
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.clubName}
                  onChange={handleTextChange("clubName")}
                  type="text"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Pays par défaut
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.defaultCountry}
                  onChange={handleTextChange("defaultCountry")}
                  type="text"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Région par défaut
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.defaultRegion}
                  onChange={handleTextChange("defaultRegion")}
                  type="text"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Ville par défaut
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.defaultCity}
                  onChange={handleTextChange("defaultCity")}
                  type="text"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Style de message par défaut
                <select
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                  value={settings.defaultMessageStyle}
                  onChange={(event) =>
                    updateSetting(
                      "defaultMessageStyle",
                      event.target.value as AppSettings["defaultMessageStyle"],
                    )
                  }
                >
                  {messageStyles.map((messageStyle) => (
                    <option key={messageStyle} value={messageStyle}>
                      {messageStyle}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Délai de relance par défaut en jours
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  min="0"
                  value={settings.defaultFollowUpDays}
                  onChange={handleFollowUpDaysChange}
                  type="number"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                Lien de présentation par défaut
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.defaultPresentationLink}
                  onChange={handleTextChange("defaultPresentationLink")}
                  placeholder="https://..."
                  type="url"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                Signature de message
                <textarea
                  className="min-h-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.messageSignature}
                  onChange={handleTextChange("messageSignature")}
                  placeholder="Signature ajoutée à tes messages"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                Formulation publique à utiliser
                <textarea
                  className="min-h-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={settings.publicWording}
                  onChange={handleTextChange("publicWording")}
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-400">
                Dernière mise à jour :{" "}
                <span className="font-medium text-slate-200">
                  {settings.updatedAt
                    ? new Date(settings.updatedAt).toLocaleString("fr-FR")
                    : "Jamais"}
                </span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className="min-h-11 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200"
                  type="button"
                  onClick={resetSettings}
                >
                  Réinitialiser les paramètres
                </button>
                <button
                  className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                  type="submit"
                >
                  Enregistrer les paramètres
                </button>
              </div>
            </div>

            {savedMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium text-emerald-200">
                {savedMessage}
              </p>
            ) : null}
          </form>

          <aside className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">
              À quoi servent ces paramètres ?
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Ils permettront ensuite de préremplir tes fiches prospects, personnaliser tes messages et harmoniser l’utilisation du CRM avec ton équipe.
            </p>

            <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Prévisualisation
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-100">
                {previewMessage}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
