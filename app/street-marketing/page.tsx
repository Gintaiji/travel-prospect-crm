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
  PROSPECT_TAGS,
  SOCIAL_PLATFORMS,
  type Prospect,
} from "../lib/types";
import {
  DEFAULT_STREET_MARKETING_SURVEY_STORAGE,
  createStreetMarketingSurvey,
  DEFAULT_STREET_MARKETING_SURVEY,
  loadStreetMarketingSurvey,
  saveStreetMarketingSurvey,
  type StreetMarketingSurvey,
  type StreetMarketingSurveyStorage,
} from "../lib/streetMarketingSurveyStorage";

type QuickContactFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  meetingPlace: string;
  colorType: Prospect["colorType"];
  answers: string[];
  fieldNote: string;
};

type ProspectWithOptionalSource = Prospect & {
  source?: unknown;
};

const initialQuickContactFormState: QuickContactFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  meetingPlace: "",
  colorType: "Aucun",
  answers: [],
  fieldNote: "",
};

const STREET_MARKETING_COLOR_TYPES: Prospect["colorType"][] = [
  "Aucun",
  "Jaune",
  "Bleu",
  "Vert",
  "Rouge",
];

function isStreetMarketingProspect(prospect: Prospect) {
  const prospectWithSource = prospect as ProspectWithOptionalSource;
  const source =
    typeof prospectWithSource.source === "string"
      ? prospectWithSource.source
      : "";

  return (
    source === "Street Marketing" ||
    prospect.notes.includes("Ajouté depuis Street Marketing") ||
    prospect.notes.includes("Street Marketing")
  );
}

function getProspectName(prospect: Prospect) {
  return (
    `${prospect.firstName} ${prospect.lastName}`.trim() ||
    prospect.displayName.trim() ||
    "Contact terrain"
  );
}

export default function StreetMarketingPage() {
  const [surveyStorage, setSurveyStorage] = useState<StreetMarketingSurveyStorage>(
    DEFAULT_STREET_MARKETING_SURVEY_STORAGE,
  );
  const [draftQuestions, setDraftQuestions] = useState<string[]>(
    DEFAULT_STREET_MARKETING_SURVEY.questions,
  );
  const [draftSurveyName, setDraftSurveyName] = useState(
    DEFAULT_STREET_MARKETING_SURVEY.name,
  );
  const [isEditingSurvey, setIsEditingSurvey] = useState(false);
  const [quickContactForm, setQuickContactForm] =
    useState<QuickContactFormState>(initialQuickContactFormState);
  const [preparedContact, setPreparedContact] =
    useState<QuickContactFormState | null>(null);
  const [quickContactMessage, setQuickContactMessage] = useState("");
  const [streetMarketingProspects, setStreetMarketingProspects] = useState<
    Prospect[]
  >([]);
  const activeSurvey =
    surveyStorage.surveys.find(
      (survey) => survey.id === surveyStorage.activeSurveyId,
    ) ??
    surveyStorage.surveys[0] ??
    DEFAULT_STREET_MARKETING_SURVEY;

  useEffect(() => {
    const storedSurveyStorage = loadStreetMarketingSurvey();

    setSurveyStorage(storedSurveyStorage);
    const storedActiveSurvey =
      storedSurveyStorage.surveys.find(
        (survey) => survey.id === storedSurveyStorage.activeSurveyId,
      ) ?? storedSurveyStorage.surveys[0];
    setDraftSurveyName(storedActiveSurvey.name);
    setDraftQuestions(storedActiveSurvey.questions);
  }, []);

  useEffect(() => {
    const loadedProspects = loadProspects()
      .filter(isStreetMarketingProspect)
      .sort((firstProspect, secondProspect) =>
        secondProspect.createdAt.localeCompare(firstProspect.createdAt),
      );

    setStreetMarketingProspects(loadedProspects);
  }, [quickContactMessage]);

  useEffect(() => {
    setQuickContactForm((currentForm) => ({
      ...currentForm,
      answers: activeSurvey.questions.map(
        (_, index) => currentForm.answers[index] ?? "",
      ),
    }));
  }, [activeSurvey.questions]);

  function startSurveyEdit() {
    setDraftSurveyName(activeSurvey.name);
    setDraftQuestions(activeSurvey.questions);
    setIsEditingSurvey(true);
  }

  function persistSurveyStorage(nextSurveyStorage: StreetMarketingSurveyStorage) {
    saveStreetMarketingSurvey(nextSurveyStorage);
    setSurveyStorage(nextSurveyStorage);
  }

  function updateActiveSurveyId(activeSurveyId: string) {
    const nextSurveyStorage = {
      ...surveyStorage,
      activeSurveyId,
    };

    persistSurveyStorage(nextSurveyStorage);
    const nextActiveSurvey =
      nextSurveyStorage.surveys.find((survey) => survey.id === activeSurveyId) ??
      nextSurveyStorage.surveys[0];
    setDraftSurveyName(nextActiveSurvey.name);
    setDraftQuestions(nextActiveSurvey.questions);
    setIsEditingSurvey(false);
  }

  function addSurvey() {
    const newSurvey = createStreetMarketingSurvey();
    const nextSurveyStorage = {
      surveys: [...surveyStorage.surveys, newSurvey],
      activeSurveyId: newSurvey.id,
    };

    persistSurveyStorage(nextSurveyStorage);
    setDraftSurveyName(newSurvey.name);
    setDraftQuestions(newSurvey.questions);
    setIsEditingSurvey(true);
  }

  function deleteActiveSurvey() {
    if (surveyStorage.surveys.length <= 1) {
      return;
    }

    const remainingSurveys = surveyStorage.surveys.filter(
      (survey) => survey.id !== activeSurvey.id,
    );
    const nextActiveSurvey = remainingSurveys[0];
    const nextSurveyStorage = {
      surveys: remainingSurveys,
      activeSurveyId: nextActiveSurvey.id,
    };

    persistSurveyStorage(nextSurveyStorage);
    setDraftSurveyName(nextActiveSurvey.name);
    setDraftQuestions(nextActiveSurvey.questions);
    setIsEditingSurvey(false);
  }

  function updateDraftQuestion(index: number, value: string) {
    setDraftQuestions((currentQuestions) => {
      const updatedQuestions = [...currentQuestions];
      updatedQuestions[index] = value;

      return updatedQuestions;
    });
  }

  function addDraftQuestion() {
    setDraftQuestions((currentQuestions) => [...currentQuestions, ""]);
  }

  function removeDraftQuestion(index: number) {
    setDraftQuestions((currentQuestions) => {
      if (currentQuestions.length <= 1) {
        return currentQuestions;
      }

      return currentQuestions.filter((_, questionIndex) => questionIndex !== index);
    });
  }

  function saveSurvey() {
    const cleanedQuestions = draftQuestions
      .map((question) => question.trim())
      .filter(Boolean);
    const updatedSurvey: StreetMarketingSurvey = {
      ...activeSurvey,
      name: draftSurveyName.trim() || activeSurvey.name,
      questions: cleanedQuestions.length
        ? cleanedQuestions
        : DEFAULT_STREET_MARKETING_SURVEY.questions,
      updatedAt: new Date().toISOString(),
    };
    const nextSurveyStorage = {
      ...surveyStorage,
      surveys: surveyStorage.surveys.map((survey) =>
        survey.id === activeSurvey.id ? updatedSurvey : survey,
      ),
      activeSurveyId: updatedSurvey.id,
    };

    persistSurveyStorage(nextSurveyStorage);
    setDraftSurveyName(updatedSurvey.name);
    setDraftQuestions(updatedSurvey.questions);
    setIsEditingSurvey(false);
  }

  function cancelSurveyEdit() {
    setDraftSurveyName(activeSurvey.name);
    setDraftQuestions(activeSurvey.questions);
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

  function updateQuickContactAnswer(index: number, value: string) {
    setQuickContactForm((currentForm) => {
      const updatedAnswers = activeSurvey.questions.map(
        (_, answerIndex) => currentForm.answers[answerIndex] ?? "",
      );
      updatedAnswers[index] = value;

      return {
        ...currentForm,
        answers: updatedAnswers,
      };
    });
  }

  function buildStreetMarketingNotes(contact: QuickContactFormState) {
    const surveyAnswerLines = activeSurvey.questions.flatMap((question, index) => [
      `Question ${index + 1} : ${question}`,
      `Réponse ${index + 1} : ${contact.answers[index] || "Non renseignée"}`,
    ]);

    return [
      `Sondage : ${activeSurvey.name}`,
      `Lieu de rencontre : ${contact.meetingPlace || "Non renseigné"}`,
      ...surveyAnswerLines,
      `Note terrain : ${contact.fieldNote || "Non renseignée"}`,
      "Relance automatique prévue dans 3 jours.",
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
      colorType: quickContactForm.colorType,
      answers: activeSurvey.questions.map((_, index) =>
        (quickContactForm.answers[index] ?? "").trim(),
      ),
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
    const followUpDate = getFutureDateString(3);
    const phonePlatform = (SOCIAL_PLATFORMS as readonly string[]).includes("Téléphone")
      ? ("Téléphone" as Prospect["mainPlatform"])
      : "Autre";
    const prospectCategory: Prospect["category"] = "Street Marketing";
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
      colorType: contact.colorType,
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
              <div className="flex flex-wrap gap-2">
                {!isEditingSurvey ? (
                  <button
                    className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                    type="button"
                    onClick={startSurveyEdit}
                  >
                    Modifier le sondage
                  </button>
                ) : null}
                <button
                  className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                  type="button"
                  onClick={addSurvey}
                >
                  Ajouter un sondage
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Sondage actif
                <select
                  className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                  value={activeSurvey.id}
                  onChange={(event) => updateActiveSurveyId(event.target.value)}
                >
                  {surveyStorage.surveys.map((surveyOption) => (
                    <option key={surveyOption.id} value={surveyOption.id}>
                      {surveyOption.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  className="min-h-10 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={deleteActiveSurvey}
                  disabled={surveyStorage.surveys.length <= 1}
                >
                  Supprimer le sondage
                </button>
              </div>
            </div>

            {!isEditingSurvey ? (
              <ol className="mt-5 grid gap-3">
                {activeSurvey.questions.map((question, index) => (
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
                  Nom du sondage
                  <input
                    className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={draftSurveyName}
                    onChange={(event) => setDraftSurveyName(event.target.value)}
                  />
                </label>

                {draftQuestions.map((question, index) => (
                  <div className="grid gap-2" key={index}>
                    <div className="flex items-center justify-between gap-3">
                      <label
                        className="text-sm font-medium text-slate-200"
                        htmlFor={`street-marketing-question-${index}`}
                      >
                        Question {index + 1}
                      </label>
                      <button
                        className="min-h-9 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        onClick={() => removeDraftQuestion(index)}
                        disabled={draftQuestions.length <= 1}
                      >
                        Supprimer
                      </button>
                    </div>
                    <textarea
                      className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      id={`street-marketing-question-${index}`}
                      value={question}
                      onChange={(event) => updateDraftQuestion(index, event.target.value)}
                    />
                  </div>
                ))}

                <div className="flex flex-wrap gap-2">
                  <button
                    className="min-h-11 rounded-full border border-emerald-400/30 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                    type="button"
                    onClick={addDraftQuestion}
                  >
                    Ajouter une question
                  </button>
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
                Couleur du prospect
                <select
                  className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                  value={quickContactForm.colorType}
                  onChange={(event) =>
                    updateQuickContactField(
                      "colorType",
                      event.target.value as Prospect["colorType"],
                    )
                  }
                >
                  {STREET_MARKETING_COLOR_TYPES.map((colorType) => (
                    <option key={colorType} value={colorType}>
                      {colorType}
                    </option>
                  ))}
                </select>
              </label>

              {activeSurvey.questions.map((question, index) => (
                <label
                  className="grid gap-2 text-sm font-medium text-slate-200"
                  key={index}
                >
                  <span>
                    Réponse question {index + 1}
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">
                      {question}
                    </span>
                  </span>
                  <textarea
                    className="min-h-24 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={quickContactForm.answers[index] ?? ""}
                    onChange={(event) =>
                      updateQuickContactAnswer(index, event.target.value)
                    }
                  />
                </label>
              ))}

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
                      Couleur du prospect
                    </dt>
                    <dd className="mt-1 text-slate-200">
                      {preparedContact.colorType}
                    </dd>
                  </div>
                  {activeSurvey.questions.map((question, index) => (
                    <div key={index}>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Réponse question {index + 1}
                      </dt>
                      <dd className="mt-1 text-slate-200">
                        <span className="mb-1 block text-xs text-slate-500">
                          {question}
                        </span>
                        {preparedContact.answers[index] || "Non renseignée"}
                      </dd>
                    </div>
                  ))}
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

        <section className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Historique terrain
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {streetMarketingProspects.length} contacts ajoutés depuis le terrain
              </p>
            </div>
          </div>

          {streetMarketingProspects.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
              Aucun contact terrain pour le moment.
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              {streetMarketingProspects.slice(0, 10).map((prospect) => (
                <article
                  className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                  key={prospect.id}
                >
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {getProspectName(prospect)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Ajouté le {prospect.createdAt.slice(0, 10)}
                      </p>
                    </div>
                    <p className="text-sm text-slate-300">
                      {prospect.phone || "Téléphone non renseigné"}
                    </p>
                    <p className="text-sm text-slate-300">{prospect.status}</p>
                    <p className="text-sm text-slate-300">
                      {prospect.nextActionDate
                        ? `Relance : ${prospect.nextActionDate}`
                        : "Relance non planifiée"}
                    </p>
                    <Link
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                      href={`/prospects?focus=${encodeURIComponent(prospect.id)}`}
                    >
                      Voir la fiche
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
