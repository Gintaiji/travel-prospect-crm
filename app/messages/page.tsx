"use client";

import { useState } from "react";

type MessageVariant = {
  tone: "Doux" | "Naturel" | "Direct";
  message: string;
};

type MessageTemplateSection = {
  step: string;
  objective: string;
  variants: MessageVariant[];
};

const messageTemplateSections: MessageTemplateSection[] = [
  {
    step: "Commentaire public",
    objective: "Ouvrir une interaction légère sans vendre.",
    variants: [
      {
        tone: "Doux",
        message: "Super partage, ça donne envie de préparer une prochaine escapade tranquillement.",
      },
      {
        tone: "Naturel",
        message: "Très sympa comme spot, tu y es allé récemment ou c’est sur ta liste ?",
      },
      {
        tone: "Direct",
        message: "Bel endroit, clairement une bonne idée pour un prochain voyage.",
      },
    ],
  },
  {
    step: "Demande d’ajout / connexion",
    objective: "Créer un premier lien simple et naturel.",
    variants: [
      {
        tone: "Doux",
        message: "J’ai vu que tu partageais aussi des choses autour du voyage. Je t’ajoute ici, au plaisir d’échanger.",
      },
      {
        tone: "Naturel",
        message: "Ton univers voyage m’a parlé, je t’ajoute pour suivre ça de plus près.",
      },
      {
        tone: "Direct",
        message: "Je t’ajoute parce que le sujet voyage semble nous intéresser tous les deux.",
      },
    ],
  },
  {
    step: "Premier message privé",
    objective: "Démarrer la conversation sans pression.",
    variants: [
      {
        tone: "Doux",
        message: "Salut, j’ai vu que tu aimais bien le voyage. Tu as une destination en tête en ce moment ?",
      },
      {
        tone: "Naturel",
        message: "Salut, tu es plutôt du genre à partir dès que possible ou à bien préparer tes voyages ?",
      },
      {
        tone: "Direct",
        message: "Salut, je t’écris parce que le voyage semble t’intéresser. Tu voyages souvent ?",
      },
    ],
  },
  {
    step: "Relance après silence",
    objective: "Relancer proprement sans insister.",
    variants: [
      {
        tone: "Doux",
        message: "Je me permets de te relancer tranquillement, aucune pression. Le sujet voyage t’intéresse toujours ?",
      },
      {
        tone: "Naturel",
        message: "Je reviens vers toi rapidement : tu voulais encore échanger sur le sujet voyage ?",
      },
      {
        tone: "Direct",
        message: "Je te relance une fois ici. Si ce n’est pas le moment, aucun souci.",
      },
    ],
  },
  {
    step: "Question de qualification voyage",
    objective: "Comprendre ce qui motive la personne.",
    variants: [
      {
        tone: "Doux",
        message: "Quand tu voyages, tu recherches plutôt le confort, les bons plans ou les expériences originales ?",
      },
      {
        tone: "Naturel",
        message: "Tu choisis tes voyages plutôt au prix, à la destination ou au type d’expérience ?",
      },
      {
        tone: "Direct",
        message: "Qu’est-ce qui compte le plus pour toi quand tu réserves un voyage ?",
      },
    ],
  },
  {
    step: "Transition vers le club privé",
    objective: "Faire le lien vers la plateforme voyage avec tact.",
    variants: [
      {
        tone: "Doux",
        message: "Je te demande parce que je découvre aussi un club privé lié au voyage, avec des avantages membres. Si tu es curieux, je peux t’expliquer simplement.",
      },
      {
        tone: "Naturel",
        message: "Ça rejoint justement une plateforme voyage que j’utilise pour voyager plus intelligemment avec des avantages membres. Je peux te présenter l’idée simplement.",
      },
      {
        tone: "Direct",
        message: "Si le sujet voyage t’intéresse, je peux te montrer une présentation simple d’un club privé avec des avantages membres.",
      },
    ],
  },
  {
    step: "Invitation présentation",
    objective: "Proposer une présentation claire, sans engagement.",
    variants: [
      {
        tone: "Doux",
        message: "Si tu veux, je peux te montrer rapidement comment ça fonctionne. Juste une présentation simple, sans engagement.",
      },
      {
        tone: "Naturel",
        message: "Je peux t’envoyer une présentation courte pour que tu voies si ça peut te parler.",
      },
      {
        tone: "Direct",
        message: "Tu veux que je te montre la présentation pour voir si c’est pertinent pour toi ?",
      },
    ],
  },
  {
    step: "Suivi après présentation",
    objective: "Recueillir un retour clair après la présentation.",
    variants: [
      {
        tone: "Doux",
        message: "Merci d’avoir pris le temps de regarder. À chaud, qu’est-ce que tu en as pensé ?",
      },
      {
        tone: "Naturel",
        message: "Tu as pu regarder la présentation ? Je suis curieux d’avoir ton ressenti simple.",
      },
      {
        tone: "Direct",
        message: "Après avoir vu la présentation, tu te sens plutôt intéressé, pas maintenant ou pas concerné ?",
      },
    ],
  },
  {
    step: "Relance pas maintenant",
    objective: "Respecter le timing tout en gardant le lien.",
    variants: [
      {
        tone: "Doux",
        message: "Je comprends totalement. Je garde le contact, et on en reparlera simplement si le moment devient plus adapté.",
      },
      {
        tone: "Naturel",
        message: "Aucun souci, ce n’est peut-être pas le bon timing. Je te relancerai plus tard sans pression.",
      },
      {
        tone: "Direct",
        message: "Pas de problème. Je note que ce n’est pas le moment et je reviendrai vers toi plus tard.",
      },
    ],
  },
  {
    step: "Message de clôture propre",
    objective: "Clore sans tension et laisser une bonne impression.",
    variants: [
      {
        tone: "Doux",
        message: "Merci pour ton retour. Je ne vais pas insister, le plus important c’est que ça reste fluide.",
      },
      {
        tone: "Naturel",
        message: "Merci de m’avoir répondu. Je respecte totalement, au plaisir d’échanger une prochaine fois.",
      },
      {
        tone: "Direct",
        message: "Merci pour ta réponse. Je clôture de mon côté et je te souhaite une très bonne continuation.",
      },
    ],
  },
];

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
          {messageTemplateSections.map((templateSection) => (
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
