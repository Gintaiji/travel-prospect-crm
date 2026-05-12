"use client";

import { useEffect, useState } from "react";
import {
  MESSAGE_TUNNEL_STEPS,
  type MessageStyle,
  type MessageTunnelStep,
} from "../lib/messageTemplates";
import {
  clearCustomMessageTemplates,
  loadCustomMessageTemplates,
  saveCustomMessageTemplates,
  type CustomMessageTemplates,
} from "../lib/messageTemplateStorage";
import { DEFAULT_APP_SETTINGS, loadSettings } from "../lib/settingsStorage";
import type { AppSettings } from "../lib/types";

type EditingMessageState = {
  step: MessageTunnelStep;
  tone: MessageStyle;
  value: string;
} | null;

function getMessageKey(step: MessageTunnelStep, tone: MessageStyle) {
  return `${step}-${tone}`;
}

function getCustomTemplateMessage(
  customTemplates: CustomMessageTemplates,
  step: MessageTunnelStep,
  tone: MessageStyle,
) {
  return customTemplates[step]?.[tone];
}

function getConfiguredMessage(message: string, settings: AppSettings) {
  const clubName = settings.clubName.trim() || DEFAULT_APP_SETTINGS.clubName;
  const publicWording =
    settings.publicWording.trim() || DEFAULT_APP_SETTINGS.publicWording;

  return message
    .replaceAll("club privé lié au voyage", clubName)
    .replaceAll("club privé avec des avantages membres", clubName)
    .replaceAll("plateforme voyage avec avantages membres", publicWording)
    .replaceAll("plateforme voyage", publicWording)
    .replace(/\bCRM\b/gi, "outil")
    .replace(/\bprospect\b/gi, "contact")
    .replace(/\btunnel\b/gi, "parcours")
    .replace(/\bstatut\b/gi, "situation")
    .replace(/\btempérature\b/gi, "ressenti")
    .replace(/dans mon suivi/gi, "de mon côté")
    .replace(/j[’']ai noté/gi, "je me souviens")
    .replace(/\bétape\b/gi, "moment");
}

export default function MessagesPage() {
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [customTemplates, setCustomTemplates] = useState<CustomMessageTemplates>({});
  const [editingMessage, setEditingMessage] = useState<EditingMessageState>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    const loadStoredData = window.setTimeout(() => {
      setAppSettings(loadSettings());
      setCustomTemplates(loadCustomMessageTemplates());
    }, 0);

    return () => window.clearTimeout(loadStoredData);
  }, []);

  function showFeedback(message: string) {
    setFeedbackMessage(message);
    window.setTimeout(() => {
      setFeedbackMessage("");
    }, 2200);
  }

  async function handleCopyMessage(message: string, messageKey: string) {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(message);
    setCopiedMessageKey(messageKey);
    window.setTimeout(() => {
      setCopiedMessageKey((currentMessageKey) =>
        currentMessageKey === messageKey ? null : currentMessageKey,
      );
    }, 1800);
  }

  function startEditingMessage(
    step: MessageTunnelStep,
    tone: MessageStyle,
    message: string,
  ) {
    setEditingMessage({ step, tone, value: message });
  }

  function cancelEditingMessage() {
    setEditingMessage(null);
  }

  function saveEditingMessage() {
    if (!editingMessage) {
      return;
    }

    const nextTemplates: CustomMessageTemplates = {
      ...customTemplates,
      [editingMessage.step]: {
        ...(customTemplates[editingMessage.step] ?? {}),
        [editingMessage.tone]: editingMessage.value,
      },
    };

    saveCustomMessageTemplates(nextTemplates);
    setCustomTemplates(nextTemplates);
    setEditingMessage(null);
    showFeedback("Modèle enregistré.");
  }

  function resetOneMessage(step: MessageTunnelStep, tone: MessageStyle) {
    const shouldReset = window.confirm(
      "Réinitialiser ce modèle avec le texte par défaut ?",
    );

    if (!shouldReset) {
      return;
    }

    const nextTemplates: CustomMessageTemplates = { ...customTemplates };
    const nextStepTemplates = { ...(nextTemplates[step] ?? {}) };

    delete nextStepTemplates[tone];

    if (Object.keys(nextStepTemplates).length > 0) {
      nextTemplates[step] = nextStepTemplates;
    } else {
      delete nextTemplates[step];
    }

    saveCustomMessageTemplates(nextTemplates);
    setCustomTemplates(nextTemplates);
    setEditingMessage(null);
    showFeedback("Modèle réinitialisé.");
  }

  function resetAllMessages() {
    const shouldReset = window.confirm(
      "Réinitialiser tous les modèles personnalisés ?",
    );

    if (!shouldReset) {
      return;
    }

    clearCustomMessageTemplates();
    setCustomTemplates({});
    setEditingMessage(null);
    showFeedback("Tous les modèles ont été réinitialisés.");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Messages
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Bibliothèque de messages
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Des modèles courts, naturels et copiables pour avancer dans tes conversations sans forcer.
          </p>
        </header>

        <section className="mb-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">
                Personnalisation
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
                Tu peux adapter les modèles à ta façon de parler. Les textes modifiés seront utilisés dans l’assistant des fiches prospects.
              </p>
              {appSettings.messageSignature.trim() ? (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-100">
                  Ta signature personnalisée pourra être ajoutée depuis l’assistant prospect.
                </p>
              ) : null}
            </div>
            <button
              className="min-h-11 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-100"
              type="button"
              onClick={resetAllMessages}
            >
              Réinitialiser tous les modèles
            </button>
          </div>
          {feedbackMessage ? (
            <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium text-emerald-100">
              {feedbackMessage}
            </p>
          ) : null}
        </section>

        <section className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">
            Règle d’or
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            Le message doit ouvrir une conversation, pas donner l’impression de vendre dès la première phrase.
          </p>
        </section>

        <section className="grid gap-5">
          {MESSAGE_TUNNEL_STEPS.map((templateSection) => (
            <article
              className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
              key={templateSection.step}
            >
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  {templateSection.step}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {templateSection.objective}
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {templateSection.variants.map((variant) => {
                  const messageKey = getMessageKey(templateSection.step, variant.tone);
                  const customMessage = getCustomTemplateMessage(
                    customTemplates,
                    templateSection.step,
                    variant.tone,
                  );
                  const displayedRawMessage = customMessage ?? variant.message;
                  const configuredMessage = getConfiguredMessage(
                    displayedRawMessage,
                    appSettings,
                  );
                  const isCustomized = customMessage !== undefined;
                  const isEditing =
                    editingMessage?.step === templateSection.step &&
                    editingMessage.tone === variant.tone;

                  return (
                    <div
                      className="flex min-h-48 flex-col justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                      key={messageKey}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {variant.tone}
                          </p>
                          {isCustomized ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                              Personnalisé
                            </span>
                          ) : null}
                        </div>

                        {isEditing ? (
                          <textarea
                            className="mt-3 min-h-44 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                            value={editingMessage.value}
                            onChange={(event) =>
                              setEditingMessage({
                                ...editingMessage,
                                value: event.target.value,
                              })
                            }
                          />
                        ) : (
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-100">
                            {configuredMessage}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              className="min-h-10 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                              type="button"
                              onClick={saveEditingMessage}
                            >
                              Enregistrer
                            </button>
                            <button
                              className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              type="button"
                              onClick={cancelEditingMessage}
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                              type="button"
                              onClick={() => handleCopyMessage(configuredMessage, messageKey)}
                            >
                              Copier
                            </button>
                            <button
                              className="min-h-10 rounded-full border border-sky-400/30 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/10"
                              type="button"
                              onClick={() =>
                                startEditingMessage(
                                  templateSection.step,
                                  variant.tone,
                                  displayedRawMessage,
                                )
                              }
                            >
                              Modifier
                            </button>
                            <button
                              className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                              type="button"
                              disabled={!isCustomized}
                              onClick={() =>
                                resetOneMessage(templateSection.step, variant.tone)
                              }
                            >
                              Réinitialiser ce message
                            </button>
                          </>
                        )}
                        {copiedMessageKey === messageKey ? (
                          <p className="text-xs font-medium text-emerald-300">
                            Message copié.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
