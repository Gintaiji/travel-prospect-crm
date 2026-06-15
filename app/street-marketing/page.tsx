"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_STREET_MARKETING_SURVEY,
  loadStreetMarketingSurvey,
  saveStreetMarketingSurvey,
  type StreetMarketingSurvey,
} from "../lib/streetMarketingSurveyStorage";

export default function StreetMarketingPage() {
  const [survey, setSurvey] = useState<StreetMarketingSurvey>(
    DEFAULT_STREET_MARKETING_SURVEY,
  );
  const [draftQuestions, setDraftQuestions] = useState<[string, string]>(
    DEFAULT_STREET_MARKETING_SURVEY.questions,
  );
  const [isEditingSurvey, setIsEditingSurvey] = useState(false);

  useEffect(() => {
    const storedSurvey = loadStreetMarketingSurvey();

    setSurvey(storedSurvey);
    setDraftQuestions(storedSurvey.questions);
  }, []);

  function startSurveyEdit() {
    setDraftQuestions(survey.questions);
    setIsEditingSurvey(true);
  }

  function updateDraftQuestion(index: 0 | 1, value: string) {
    setDraftQuestions((currentQuestions) => {
      const updatedQuestions: [string, string] = [...currentQuestions];
      updatedQuestions[index] = value;

      return updatedQuestions;
    });
  }

  function saveSurvey() {
    const updatedSurvey: StreetMarketingSurvey = {
      questions: [
        draftQuestions[0].trim() || DEFAULT_STREET_MARKETING_SURVEY.questions[0],
        draftQuestions[1].trim() || DEFAULT_STREET_MARKETING_SURVEY.questions[1],
      ],
    };

    saveStreetMarketingSurvey(updatedSurvey);
    setSurvey(updatedSurvey);
    setDraftQuestions(updatedSurvey.questions);
    setIsEditingSurvey(false);
  }

  function cancelSurveyEdit() {
    setDraftQuestions(survey.questions);
    setIsEditingSurvey(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Terrain
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Street Marketing
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Ajoute rapidement les contacts rencontrés sur le terrain.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Sondage rapide
              </p>
              {!isEditingSurvey ? (
                <button
                  className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                  type="button"
                  onClick={startSurveyEdit}
                >
                  Modifier le sondage
                </button>
              ) : null}
            </div>

            {!isEditingSurvey ? (
              <ol className="mt-5 grid gap-3">
                {survey.questions.map((question, index) => (
                  <li
                    className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-200"
                    key={index}
                  >
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Question {index + 1}
                    </span>
                    {question}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm font-medium text-slate-200">
                  Question 1
                  <textarea
                    className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={draftQuestions[0]}
                    onChange={(event) => updateDraftQuestion(0, event.target.value)}
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-200">
                  Question 2
                  <textarea
                    className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={draftQuestions[1]}
                    onChange={(event) => updateDraftQuestion(1, event.target.value)}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                    type="button"
                    onClick={saveSurvey}
                  >
                    Enregistrer
                  </button>
                  <button
                    className="min-h-11 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                    type="button"
                    onClick={cancelSurveyEdit}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Contact rapide
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Bientôt : ajout d’un prospect avec téléphone et relance
              automatique.
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
