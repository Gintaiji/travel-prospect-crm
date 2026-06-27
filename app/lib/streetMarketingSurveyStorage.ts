import { markLocalDataChanged } from "./localChangeTracker";

export type StreetMarketingSurvey = {
  id: string;
  name: string;
  questions: string[];
  createdAt: string;
  updatedAt: string;
};

export type StreetMarketingSurveyStorage = {
  surveys: StreetMarketingSurvey[];
  activeSurveyId: string;
};

type LegacyStreetMarketingSurvey = {
  questions?: unknown;
  question1?: unknown;
  question2?: unknown;
};

type PartialStoredSurvey = Omit<Partial<StreetMarketingSurvey>, "questions"> & {
  questions?: unknown;
};

type PartialSurveyStorage = Partial<StreetMarketingSurveyStorage>;

export const STREET_MARKETING_SURVEY_STORAGE_KEY =
  "travel-prospect-crm-street-marketing-survey";

const DEFAULT_SURVEY_ID = "street-marketing-survey-default";
const DEFAULT_SURVEY_NAME = "Sondage voyage";
const DEFAULT_SURVEY_CREATED_AT = "2026-06-15T00:00:00.000Z";

const LEGACY_DEFAULT_QUESTIONS = [
  "Quand tu voyages, tu cherches plutôt le meilleur prix ou la meilleure expérience ?",
  "Si tu pouvais voyager plus souvent sans exploser ton budget, est-ce que ça t’intéresserait ?",
];

export const DEFAULT_STREET_MARKETING_SURVEY: StreetMarketingSurvey = {
  id: DEFAULT_SURVEY_ID,
  name: DEFAULT_SURVEY_NAME,
  questions: [
    "Aujourd'hui, pour réserver vos week-ends ou vacances, est-ce que vous passez plutôt par des plateformes publiques comme Booking, Airbnb, Expedia… ? Ou est-ce que vous cherchez des bons plans par vous-même ?",
    "Si une plateforme vous permettait d'avoir les mêmes prestations, mais avec des prix plus avantageux, est-ce que vous seriez curieux de voir à quoi ça ressemble ?",
  ],
  createdAt: DEFAULT_SURVEY_CREATED_AT,
  updatedAt: DEFAULT_SURVEY_CREATED_AT,
};

export const DEFAULT_STREET_MARKETING_SURVEY_STORAGE: StreetMarketingSurveyStorage = {
  surveys: [DEFAULT_STREET_MARKETING_SURVEY],
  activeSurveyId: DEFAULT_STREET_MARKETING_SURVEY.id,
};

function isBrowser() {
  return typeof window !== "undefined";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `street-marketing-survey-${Date.now()}`;
}

export function createStreetMarketingSurvey(
  name = "Nouveau sondage",
  questions = DEFAULT_STREET_MARKETING_SURVEY.questions,
): StreetMarketingSurvey {
  const now = new Date().toISOString();

  return {
    id: createId(),
    name,
    questions: normalizeQuestions(questions),
    createdAt: now,
    updatedAt: now,
  };
}

function getLegacyQuestionArray(value: LegacyStreetMarketingSurvey) {
  const legacyQuestions = [value.question1, value.question2].filter(
    (question): question is string =>
      typeof question === "string" && question.trim().length > 0,
  );

  return legacyQuestions.length > 0 ? legacyQuestions : null;
}

function normalizeQuestions(value: unknown) {
  const rawQuestions = Array.isArray(value) ? value : null;
  const questions = rawQuestions
    ?.filter((question): question is string => typeof question === "string")
    .map((question) => question.trim())
    .filter(Boolean);

  return questions?.length
    ? questions
    : DEFAULT_STREET_MARKETING_SURVEY.questions;
}

function shouldMigrateLegacyDefaultQuestions(questions: string[]) {
  return (
    questions.length === LEGACY_DEFAULT_QUESTIONS.length &&
    questions.every((question, index) => question === LEGACY_DEFAULT_QUESTIONS[index])
  );
}

function normalizeSurvey(
  value: PartialStoredSurvey,
  fallbackIndex: number,
): StreetMarketingSurvey {
  const now = new Date().toISOString();
  const questions = normalizeQuestions(value.questions);
  const normalizedQuestions = shouldMigrateLegacyDefaultQuestions(questions)
    ? DEFAULT_STREET_MARKETING_SURVEY.questions
    : questions;

  return {
    id: typeof value.id === "string" && value.id.trim()
      ? value.id
      : fallbackIndex === 0
        ? DEFAULT_SURVEY_ID
        : createId(),
    name: typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : fallbackIndex === 0
        ? DEFAULT_SURVEY_NAME
        : `Sondage ${fallbackIndex + 1}`,
    questions: normalizedQuestions,
    createdAt: typeof value.createdAt === "string" && value.createdAt.trim()
      ? value.createdAt
      : now,
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt
      : now,
  };
}

function migrateLegacySurvey(value: LegacyStreetMarketingSurvey) {
  const questions = Array.isArray(value.questions)
    ? value.questions
    : getLegacyQuestionArray(value);

  return normalizeSurvey(
    {
      id: DEFAULT_SURVEY_ID,
      name: DEFAULT_SURVEY_NAME,
      questions,
      createdAt: DEFAULT_SURVEY_CREATED_AT,
      updatedAt: new Date().toISOString(),
    },
    0,
  );
}

function normalizeStorage(
  value: PartialSurveyStorage | LegacyStreetMarketingSurvey,
): StreetMarketingSurveyStorage {
  if (Array.isArray((value as PartialSurveyStorage).surveys)) {
    const surveys = ((value as PartialSurveyStorage).surveys ?? [])
      .map((survey, index) => normalizeSurvey(survey as PartialStoredSurvey, index));
    const normalizedSurveys = surveys.length
      ? surveys
      : DEFAULT_STREET_MARKETING_SURVEY_STORAGE.surveys;
    const storedActiveSurveyId = (value as PartialSurveyStorage).activeSurveyId;
    const activeSurveyId =
      typeof storedActiveSurveyId === "string" &&
      normalizedSurveys.some(
        (survey) => survey.id === storedActiveSurveyId,
      )
        ? storedActiveSurveyId
        : normalizedSurveys[0]?.id ?? DEFAULT_STREET_MARKETING_SURVEY.id;

    return {
      surveys: normalizedSurveys,
      activeSurveyId,
    };
  }

  const migratedSurvey = migrateLegacySurvey(value as LegacyStreetMarketingSurvey);

  return {
    surveys: [migratedSurvey],
    activeSurveyId: migratedSurvey.id,
  };
}

export function loadStreetMarketingSurvey(): StreetMarketingSurveyStorage {
  if (!isBrowser()) {
    return DEFAULT_STREET_MARKETING_SURVEY_STORAGE;
  }

  const storedSurvey = localStorage.getItem(STREET_MARKETING_SURVEY_STORAGE_KEY);

  if (!storedSurvey) {
    return DEFAULT_STREET_MARKETING_SURVEY_STORAGE;
  }

  try {
    const normalizedStorage = normalizeStorage(JSON.parse(storedSurvey));

    localStorage.setItem(
      STREET_MARKETING_SURVEY_STORAGE_KEY,
      JSON.stringify(normalizedStorage),
    );

    return normalizedStorage;
  } catch {
    return DEFAULT_STREET_MARKETING_SURVEY_STORAGE;
  }
}

export function saveStreetMarketingSurvey(storage: StreetMarketingSurveyStorage) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(
    STREET_MARKETING_SURVEY_STORAGE_KEY,
    JSON.stringify(normalizeStorage(storage)),
  );
  markLocalDataChanged();
}
