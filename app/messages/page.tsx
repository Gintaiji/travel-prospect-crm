"use client";

import { useEffect, useState } from "react";
import {
  FOLLOW_UP_MESSAGE_TEMPLATES,
  type FollowUpMessageTemplateId,
} from "../lib/messageTemplates";
import {
  clearCustomMessageTemplates,
  loadCustomMessageTemplates,
  saveCustomMessageTemplates,
  type CustomMessageTemplates,
} from "../lib/messageTemplateStorage";

type EditingMessageState = {
  templateId: FollowUpMessageTemplateId;
  value: string;
} | null;

function getMessagePlaceholder(title: string) {
  return `Message ${title.toLowerCase()} à définir`;
}

export default function MessagesPage() {
  const [copiedMessageId, setCopiedMessageId] =
    useState<FollowUpMessageTemplateId | null>(null);
  const [customTemplates, setCustomTemplates] =
    useState<CustomMessageTemplates>({});
  const [editingMessage, setEditingMessage] =
    useState<EditingMessageState>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    const loadStoredData = window.setTimeout(() => {
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

  async function handleCopyMessage(
    message: string,
    templateId: FollowUpMessageTemplateId,
  ) {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(message);
    setCopiedMessageId(templateId);
    window.setTimeout(() => {
      setCopiedMessageId((currentTemplateId) =>
        currentTemplateId === templateId ? null : currentTemplateId,
      );
    }, 1800);
  }

  function startEditingMessage(
    templateId: FollowUpMessageTemplateId,
    message: string,
  ) {
    setEditingMessage({ templateId, value: message });
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
      [editingMessage.templateId]: editingMessage.value,
    };

    saveCustomMessageTemplates(nextTemplates);
    setCustomTemplates(nextTemplates);
    setEditingMessage(null);
    showFeedback("Message enregistré.");
  }

  function resetOneMessage(templateId: FollowUpMessageTemplateId) {
    const shouldReset = window.confirm(
      "Réinitialiser ce message avec le texte par défaut ?",
    );

    if (!shouldReset) {
      return;
    }

    const nextTemplates: CustomMessageTemplates = { ...customTemplates };

    delete nextTemplates[templateId];
    saveCustomMessageTemplates(nextTemplates);
    setCustomTemplates(nextTemplates);
    setEditingMessage(null);
    showFeedback("Message réinitialisé.");
  }

  function resetAllMessages() {
    const shouldReset = window.confirm(
      "Réinitialiser les trois messages avec les textes par défaut ?",
    );

    if (!shouldReset) {
      return;
    }

    clearCustomMessageTemplates();
    setCustomTemplates({});
    setEditingMessage(null);
    showFeedback("Messages réinitialisés.");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 pb-28 text-white sm:px-6 sm:py-10 md:pb-10">
      <section className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Messages
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Messages de relance
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Configure les trois textes utilisés pour les relances rapides du CRM.
          </p>
        </header>

        <section className="mb-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">
                Modèles actifs
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
                Un seul message est prévu par délai de relance. Les textes
                personnalisés sont utilisés dans l’assistant prospect.
              </p>
              <div className="mt-4 max-w-3xl rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-sm leading-6 text-slate-200">
                  Variables disponibles : {"{{prenom}}"}, {"{{nom}}"},{" "}
                  {"{{nom_complet}}"}, {"{{telephone}}"},{" "}
                  {"{{nom_affiche}}"}, {"{{lieu de rencontre}}"},{" "}
                  {"{{date_relance}}"}, {"{{statut}}"}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Utilise de préférence les variables en minuscules, sans accent.
                </p>
              </div>
            </div>
            <button
              className="min-h-11 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-100"
              type="button"
              onClick={resetAllMessages}
            >
              Réinitialiser les messages
            </button>
          </div>
          {feedbackMessage ? (
            <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium text-emerald-100">
              {feedbackMessage}
            </p>
          ) : null}
        </section>

        <section className="grid gap-5">
          {FOLLOW_UP_MESSAGE_TEMPLATES.map((template) => {
            const savedMessage = customTemplates[template.id];
            const displayedMessage = savedMessage ?? template.message;
            const isCustomized = savedMessage !== undefined;
            const isEditing = editingMessage?.templateId === template.id;

            return (
              <article
                className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
                key={template.id}
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                      {template.title}
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-white">
                      {template.title}
                    </h2>
                  </div>
                  {isCustomized ? (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                      Personnalisé
                    </span>
                  ) : null}
                </div>

                {isEditing ? (
                  <textarea
                    className="min-h-44 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={editingMessage.value}
                    onChange={(event) =>
                      setEditingMessage({
                        ...editingMessage,
                        value: event.target.value,
                      })
                    }
                    placeholder={getMessagePlaceholder(template.title)}
                  />
                ) : (
                  <div className="min-h-36 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    {displayedMessage.trim() ? (
                      <p className="whitespace-pre-line text-sm leading-6 text-slate-100">
                        {displayedMessage}
                      </p>
                    ) : (
                      <p className="text-sm leading-6 text-slate-500">
                        {getMessagePlaceholder(template.title)}
                      </p>
                    )}
                  </div>
                )}

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
                        className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        disabled={!displayedMessage.trim()}
                        onClick={() => handleCopyMessage(displayedMessage, template.id)}
                      >
                        Copier
                      </button>
                      <button
                        className="min-h-10 rounded-full border border-sky-400/30 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/10"
                        type="button"
                        onClick={() => startEditingMessage(template.id, displayedMessage)}
                      >
                        Modifier
                      </button>
                      <button
                        className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        disabled={!isCustomized}
                        onClick={() => resetOneMessage(template.id)}
                      >
                        Réinitialiser
                      </button>
                    </>
                  )}
                  {copiedMessageId === template.id ? (
                    <p className="text-xs font-medium text-emerald-300">
                      Message copié.
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
