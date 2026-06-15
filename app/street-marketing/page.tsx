"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  createProspectId,
  loadProspects,
  saveProspects,
} from "../lib/prospectStorage";
import {
  calculateProspectScore,
  getFutureDateString,
  getTodayDateString,
} from "../lib/prospectUtils";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_TAGS,
  SOCIAL_PLATFORMS,
  type Prospect,
} from "../lib/types";
import {
  DEFAULT_STREET_MARKETING_SURVEY,
  loadStreetMarketingSurvey,
  saveStreetMarketingSurvey,
  type StreetMarketingSurvey,
} from "../lib/streetMarketingSurveyStorage";

type QuickContactFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  meetingPlace: string;
  firstAnswer: string;
  secondAnswer: string;
  fieldNote: string;
};

const initialQuickContactFormState: QuickContactFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  meetingPlace: "",
  firstAnswer: "",
  secondAnswer: "",
  fieldNote: "",
};

export default function StreetMarketingPage() {
  const [survey, setSurvey] = useState<StreetMarketingSurvey>(
    DEFAULT_STREET_MARKETING_SURVEY,
  );
  const [draftQuestions, setDraftQuestions] = useState<[string, string]>(
    DEFAULT_STREET_MARKETING_SURVEY.questions,
  );
  const [isEditingSurvey, setIsEditingSurvey] = useState(false);
  const [quickContactForm, setQuickContactForm] =
    useState<QuickContactFormState>(initialQuickContactFormState);
  const [preparedContact, setPreparedContact] =
    useState<QuickContactFormState | null>(null);
  const [quickContactMessage, setQuickContactMessage] = useState("");

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

  function updateQuickContactField<Field extends keyof QuickContactFormState>(
    field: Field,
    value: QuickContactFormState[Field],
  ) {
    setQuickContactForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function buildStreetMarketingNotes(contact: QuickContactFormState) {
    return [
      `Lieu de rencontre : ${contact.meetingPlace || "Non renseigné"}`,
      `Question 1 : ${survey.questions[0]}`,
      `Réponse 1 : ${contact.firstAnswer || "Non renseignée"}`,
      `Question 2 : ${survey.questions[1]}`,
      `Réponse 2 : ${contact.secondAnswer || "Non renseignée"}`,
      `Note terrain : ${contact.fieldNote || "Non renseignée"}`,
      "Relance automatique prévue sous 24h.",
      "Ajouté depuis Street Marketing",
    ].join("\n");
  }

  function createQuickContactProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const contact: QuickContactFormState = {
      firstName: quickContactForm.firstName.trim(),
      lastName: quickContactForm.lastName.trim(),
      phone: quickContactForm.phone.trim(),
      meetingPlace: quickContactForm.meetingPlace.trim(),
      firstAnswer: quickContactForm.firstAnswer.trim(),
      secondAnswer: quickContactForm.secondAnswer.trim(),
      fieldNote: quickContactForm.fieldNote.trim(),
    };

    if (!contact.phone) {
      setQuickContactMessage("Le téléphone est obligatoire.");
      return;
    }

    const firstName = contact.firstName || "Contact terrain";
    const displayName = `${firstName} ${contact.lastName}`.trim();
    const now = new Date().toISOString();
    const today = getTodayDateString();
    const followUpDate = getFutureDateString(1);
    const phonePlatform = (SOCIAL_PLATFORMS as readonly string[]).includes("Téléphone")
      ? ("Téléphone" as Prospect["mainPlatform"])
      : "Autre";
    const prospectCategory = (PROSPECT_CATEGORIES as readonly string[]).includes("Prospects")
      ? ("Prospects" as Prospect["category"])
      : "Prospect";
    const streetMarketingTags: Prospect["tags"] = (
      PROSPECT_TAGS as readonly string[]
    ).includes("Street Marketing")
      ? ["Street Marketing" as Prospect["tags"][number]]
      : [];
    const newProspectBase: Prospect = {
      id: createProspectId(),
      firstName,
      lastName: contact.lastName,
      displayName,
      jobTitle: "",
      businessArea: "",
      city: "",
      region: "",
      country: "",
      phone: contact.phone,
      whatsapp: contact.phone,
      email: "",
      mainPlatform: phonePlatform,
      profileUrl: "",
      socialLinks: {
        facebook: "",
        instagram: "",
        linkedin: "",
        tiktok: "",
        youtube: "",
        other: "",
      },
      category: prospectCategory,
      status: "À contacter",
      temperature: "Tiède",
      colorType: "Aucun",
      score: 0,
      tags: streetMarketingTags,
      isFollower: false,
      hasSentMessage: false,
      interactionStats: {
        followerSinceDate: "",
        commentsCount: 0,
        interactionsCount: 0,
        likesCount: 0,
        messagesCount: 0,
      },
      lastInteractionDate: "",
      nextActionDate: followUpDate,
      conversationHistory: [
        {
          id: createProspectId(),
          date: today,
          channel: phonePlatform,
          content: "Contact ajouté depuis Street Marketing.",
          nextAction: "Relancer le contact Street Marketing",
        },
      ],
      notes: buildStreetMarketingNotes(contact),
      createdAt: now,
      updatedAt: now,
    };
    const newProspect: Prospect = {
      ...newProspectBase,
      score: calculateProspectScore(newProspectBase),
    };
    const currentProspects = loadProspects();

    saveProspects([newProspect, ...currentProspects]);
    setPreparedContact(contact);
    setQuickContactForm(initialQuickContactFormState);
    setQuickContactMessage("Contact ajouté aux prospects.");
  }

  function clearQuickContact() {
    setQuickContactForm(initialQuickContactFormState);
    setPreparedContact(null);
    setQuickContactMessage("");
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

            <form className="mt-5 grid gap-4" onSubmit={createQuickContactProspect}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-slate-200">
                  Prénom
                  <input
                    className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={quickContactForm.firstName}
                    onChange={(event) =>
                      updateQuickContactField("firstName", event.target.value)
                    }
                    placeholder="Recommandé"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-200">
                  Nom optionnel
                  <input
                    className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={quickContactForm.lastName}
                    onChange={(event) =>
                      updateQuickContactField("lastName", event.target.value)
                    }
                    placeholder="Optionnel"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Téléphone
                <input
                  className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={quickContactForm.phone}
                  onChange={(event) =>
                    updateQuickContactField("phone", event.target.value)
                  }
                  placeholder="06..."
                  required
                  type="tel"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Lieu de rencontre
                <input
                  className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={quickContactForm.meetingPlace}
                  onChange={(event) =>
                    updateQuickContactField("meetingPlace", event.target.value)
                  }
                  placeholder="Salon, rue, événement..."
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-200">
                <span>
                  Réponse question 1
                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">
                    {survey.questions[0]}
                  </span>
                </span>
                <textarea
                  className="min-h-24 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={quickContactForm.firstAnswer}
                  onChange={(event) =>
                    updateQuickContactField("firstAnswer", event.target.value)
                  }
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-200">
                <span>
                  Réponse question 2
                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">
                    {survey.questions[1]}
                  </span>
                </span>
                <textarea
                  className="min-h-24 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={quickContactForm.secondAnswer}
                  onChange={(event) =>
                    updateQuickContactField("secondAnswer", event.target.value)
                  }
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Note terrain
                <textarea
                  className="min-h-24 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={quickContactForm.fieldNote}
                  onChange={(event) =>
                    updateQuickContactField("fieldNote", event.target.value)
                  }
                  placeholder="Contexte, ressenti, prochaine accroche..."
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  type="submit"
                >
                  Ajouter aux prospects
                </button>
                <button
                  className="min-h-11 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                  type="button"
                  onClick={clearQuickContact}
                >
                  Effacer
                </button>
              </div>
            </form>

            {quickContactMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                <p className="text-sm font-semibold text-emerald-200">
                  {quickContactMessage}
                </p>
                {quickContactMessage === "Contact ajouté aux prospects." ? (
                  <Link
                    className="mt-3 inline-flex min-h-10 items-center rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                    href="/prospects"
                  >
                    Voir les prospects
                  </Link>
                ) : null}
              </div>
            ) : null}

            {preparedContact ? (
              <section className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Résumé du contact
                </p>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Nom
                    </dt>
                    <dd className="mt-1 text-slate-200">
                      {[preparedContact.firstName, preparedContact.lastName]
                        .filter(Boolean)
                        .join(" ") || "Non renseigné"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Téléphone
                    </dt>
                    <dd className="mt-1 text-slate-200">{preparedContact.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Lieu de rencontre
                    </dt>
                    <dd className="mt-1 text-slate-200">
                      {preparedContact.meetingPlace || "Non renseigné"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Réponse question 1
                    </dt>
                    <dd className="mt-1 text-slate-200">
                      {preparedContact.firstAnswer || "Non renseignée"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Réponse question 2
                    </dt>
                    <dd className="mt-1 text-slate-200">
                      {preparedContact.secondAnswer || "Non renseignée"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Note terrain
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap text-slate-200">
                      {preparedContact.fieldNote || "Non renseignée"}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </article>
        </section>
      </section>
    </main>
  );
}
