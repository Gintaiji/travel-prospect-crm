export type StreetMarketingSurvey = {
  questions: string[];
};

type LegacyStreetMarketingSurvey = Partial<StreetMarketingSurvey> & {
  question1?: unknown;
  question2?: unknown;
};

export const STREET_MARKETING_SURVEY_STORAGE_KEY =
  "travel-prospect-crm-street-marketing-survey";

const LEGACY_DEFAULT_STREET_MARKETING_SURVEY: StreetMarketingSurvey = {
  questions: [
    "Quand tu voyages, tu cherches plutôt le meilleur prix ou la meilleure expérience ?",
    "Si tu pouvais voyager plus souvent sans exploser ton budget, est-ce que ça t’intéresserait ?",
  ],
};

export const DEFAULT_STREET_MARKETING_SURVEY: StreetMarketingSurvey = {
  questions: [
    "Aujourd'hui, pour réserver vos week-ends ou vacances, est-ce que vous passez plutôt par des plateformes publiques comme Booking, Airbnb, Expedia… ? Ou est-ce que vous cherchez des bons plans par vous-même ?",
    "Si une plateforme vous permettait d'avoir les mêmes prestations, mais avec des prix plus avantageux, est-ce que vous seriez curieux de voir à quoi ça ressemble ?",
  ],
};

function isBrowser() {
  return typeof window !== "undefined";
}

function getLegacyQuestionArray(value: LegacyStreetMarketingSurvey) {
  const legacyQuestions = [value.question1, value.question2].filter(
    (question): question is string =>
      typeof question === "string" && question.trim().length > 0,
  );

  return legacyQuestions.length > 0 ? legacyQuestions : null;
}

function normalizeSurvey(value: LegacyStreetMarketingSurvey): StreetMarketingSurvey {
  const rawQuestions = Array.isArray(value.questions)
    ? value.questions
    : getLegacyQuestionArray(value);
  const questions = rawQuestions
    ?.filter((question): question is string => typeof question === "string")
    .map((question) => question.trim())
    .filter(Boolean);

  return {
    questions: questions?.length
      ? questions
      : DEFAULT_STREET_MARKETING_SURVEY.questions,
  };
}

function shouldMigrateLegacyDefaultSurvey(survey: StreetMarketingSurvey) {
  return (
    survey.questions.length === LEGACY_DEFAULT_STREET_MARKETING_SURVEY.questions.length &&
    survey.questions.every(
      (question, index) =>
        question === LEGACY_DEFAULT_STREET_MARKETING_SURVEY.questions[index],
    )
  );
}

export function loadStreetMarketingSurvey(): StreetMarketingSurvey {
  if (!isBrowser()) {
    return DEFAULT_STREET_MARKETING_SURVEY;
  }

  const storedSurvey = localStorage.getItem(STREET_MARKETING_SURVEY_STORAGE_KEY);

  if (!storedSurvey) {
    return DEFAULT_STREET_MARKETING_SURVEY;
  }

  try {
    const normalizedSurvey = normalizeSurvey(
      JSON.parse(storedSurvey) as LegacyStreetMarketingSurvey,
    );

    if (shouldMigrateLegacyDefaultSurvey(normalizedSurvey)) {
      localStorage.setItem(
        STREET_MARKETING_SURVEY_STORAGE_KEY,
        JSON.stringify(DEFAULT_STREET_MARKETING_SURVEY),
      );

      return DEFAULT_STREET_MARKETING_SURVEY;
    }

    return normalizedSurvey;
  } catch {
    return DEFAULT_STREET_MARKETING_SURVEY;
  }
}

export function saveStreetMarketingSurvey(survey: StreetMarketingSurvey) {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(
    STREET_MARKETING_SURVEY_STORAGE_KEY,
    JSON.stringify(normalizeSurvey(survey)),
  );
}
