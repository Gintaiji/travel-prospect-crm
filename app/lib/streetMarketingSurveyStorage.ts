export type StreetMarketingSurvey = {
  questions: [string, string];
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

function normalizeSurvey(value: Partial<StreetMarketingSurvey>): StreetMarketingSurvey {
  const firstQuestion =
    typeof value.questions?.[0] === "string" && value.questions[0].trim()
      ? value.questions[0]
      : DEFAULT_STREET_MARKETING_SURVEY.questions[0];
  const secondQuestion =
    typeof value.questions?.[1] === "string" && value.questions[1].trim()
      ? value.questions[1]
      : DEFAULT_STREET_MARKETING_SURVEY.questions[1];

  return {
    questions: [firstQuestion, secondQuestion],
  };
}

function shouldMigrateLegacyDefaultSurvey(survey: StreetMarketingSurvey) {
  return (
    survey.questions[0] === LEGACY_DEFAULT_STREET_MARKETING_SURVEY.questions[0] &&
    survey.questions[1] === LEGACY_DEFAULT_STREET_MARKETING_SURVEY.questions[1]
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
      JSON.parse(storedSurvey) as Partial<StreetMarketingSurvey>,
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
