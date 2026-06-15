export type StreetMarketingSurvey = {
  questions: [string, string];
};

export const STREET_MARKETING_SURVEY_STORAGE_KEY =
  "travel-prospect-crm-street-marketing-survey";

export const DEFAULT_STREET_MARKETING_SURVEY: StreetMarketingSurvey = {
  questions: [
    "Quand tu voyages, tu cherches plutôt le meilleur prix ou la meilleure expérience ?",
    "Si tu pouvais voyager plus souvent sans exploser ton budget, est-ce que ça t’intéresserait ?",
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

export function loadStreetMarketingSurvey(): StreetMarketingSurvey {
  if (!isBrowser()) {
    return DEFAULT_STREET_MARKETING_SURVEY;
  }

  const storedSurvey = localStorage.getItem(STREET_MARKETING_SURVEY_STORAGE_KEY);

  if (!storedSurvey) {
    return DEFAULT_STREET_MARKETING_SURVEY;
  }

  try {
    return normalizeSurvey(JSON.parse(storedSurvey) as Partial<StreetMarketingSurvey>);
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
