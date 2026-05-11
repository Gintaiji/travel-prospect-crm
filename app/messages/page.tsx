"use client";

import { useState } from "react";
import { MESSAGE_TUNNEL_STEPS } from "../lib/messageTemplates";

export default function MessagesPage() {
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);

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
                  const messageKey = `${templateSection.step}-${variant.tone}`;

                  return (
                    <div
                      className="flex min-h-48 flex-col justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                      key={messageKey}
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {variant.tone}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-slate-100">
                          {variant.message}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                          type="button"
                          onClick={() => handleCopyMessage(variant.message, messageKey)}
                        >
                          Copier
                        </button>
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
