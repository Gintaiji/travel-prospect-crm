import type { AiCommand } from "./aiCommandTypes";
import { isAiCommand } from "./aiCommandValidation";
import {
  PROSPECT_COLOR_TYPES,
  PROSPECT_TEMPERATURES,
  type Prospect,
} from "./types";

export type AssistantCommandParseResult =
  | {
      success: true;
      command: AiCommand;
    }
  | {
      success: false;
      reason: string;
    };

const unsupportedMultiActionMarkers = [
  " et relance",
  " puis relance",
  " et ajoute",
  " puis ajoute",
];

const colorWords = ["jaune", "rouge", "bleu", "vert", "verte"] as const;
const temperatureWords = ["froid", "tiede", "chaud"] as const;
const weekDays = [
  { name: "dimanche", day: 0 },
  { name: "lundi", day: 1 },
  { name: "mardi", day: 2 },
  { name: "mercredi", day: 3 },
  { name: "jeudi", day: 4 },
  { name: "vendredi", day: 5 },
  { name: "samedi", day: 6 },
] as const;

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForDetection(value: string) {
  return normalizeSpaces(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addLocalDays(referenceDate: Date, days: number) {
  const date = new Date(referenceDate);

  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  return date;
}

function getNextWeekDayDate(
  referenceDate: Date,
  targetDay: number,
  mustBeFuture: boolean,
) {
  const referenceDay = referenceDate.getDay();
  let daysUntilTarget = (targetDay - referenceDay + 7) % 7;

  if (mustBeFuture && daysUntilTarget === 0) {
    daysUntilTarget = 7;
  }

  return addLocalDays(referenceDate, daysUntilTarget);
}

function parseFollowUpDateExpression(
  normalizedDateExpression: string,
  referenceDate: Date,
) {
  if (
    normalizedDateExpression === "aujourd'hui" ||
    normalizedDateExpression === "aujourd hui"
  ) {
    return formatLocalDate(addLocalDays(referenceDate, 0));
  }

  if (normalizedDateExpression === "demain") {
    return formatLocalDate(addLocalDays(referenceDate, 1));
  }

  const weekDayMatch = normalizedDateExpression.match(
    /^(?:le )?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( prochain)?$/,
  );

  if (!weekDayMatch) {
    return null;
  }

  const weekDay = weekDays.find((day) => day.name === weekDayMatch[1]);

  if (!weekDay) {
    return null;
  }

  return formatLocalDate(
    getNextWeekDayDate(referenceDate, weekDay.day, Boolean(weekDayMatch[2])),
  );
}

function fail(reason = "Commande non reconnue"): AssistantCommandParseResult {
  return { success: false, reason };
}

function successIfValid(command: AiCommand): AssistantCommandParseResult {
  return isAiCommand(command) ? { success: true, command } : fail();
}

function cleanPersonName(value: string) {
  return normalizeSpaces(
    value
      .replace(/^(le|la|l'|prospect)\s+/i, "")
      .replace(/\s+(comme|en|couleur|marche)$/i, ""),
  );
}

function splitFirstNameAndLastName(value: string) {
  const nameParts = cleanPersonName(value).split(" ").filter(Boolean);

  if (nameParts.length === 0) {
    return null;
  }

  return {
    firstName: nameParts[0],
    lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined,
  };
}

function getColorTypeFromWord(value: string): Prospect["colorType"] | null {
  const normalizedValue = normalizeForDetection(value);
  const colorTypeValue = normalizedValue === "verte" ? "vert" : normalizedValue;

  return (
    PROSPECT_COLOR_TYPES.find(
      (colorType) => normalizeForDetection(colorType) === colorTypeValue,
    ) ?? null
  );
}

function getTemperatureFromWord(value: string): Prospect["temperature"] | null {
  const normalizedValue = normalizeForDetection(value);

  return (
    PROSPECT_TEMPERATURES.find(
      (temperature) => normalizeForDetection(temperature) === normalizedValue,
    ) ?? null
  );
}

function getColorMatch(normalizedText: string) {
  return colorWords.find((colorWord) =>
    new RegExp(`(?:^| )${colorWord}(?:$| )`).test(normalizedText),
  );
}

function getTemperatureMatch(normalizedText: string) {
  return temperatureWords.find((temperatureWord) =>
    new RegExp(`(?:^| )${temperatureWord}(?:$| )`).test(normalizedText),
  );
}

function removeTrailingColorExpression(value: string) {
  return normalizeSpaces(
    value.replace(/\s+(comme prospect|couleur|en)?\s*(jaune|rouge|bleu|vert|verte)$/i, ""),
  );
}

function parseGetTodayFollowUpsCommand(normalizedText: string) {
  const todayFollowUpCommands = [
    "montre moi les relances du jour",
    "montre les relances du jour",
    "affiche les relances du jour",
    "quelles sont mes relances aujourd'hui",
    "qui dois je relancer aujourd'hui",
    "mes relances du jour",
    "relances du jour",
  ];
  const commandText = normalizeSpaces(
    normalizedText.replace(/-/g, " ").replace(/[?!.]+$/g, ""),
  );

  if (!todayFollowUpCommands.includes(commandText)) {
    return null;
  }

  return successIfValid({
    action: "getTodayFollowUps",
    payload: {},
  });
}

function parseCountNewProspectsThisWeekCommand(normalizedText: string) {
  const countNewProspectsThisWeekCommands = [
    "combien de nouveaux prospects ai je ajoutes cette semaine",
    "combien de prospects ai je ajoutes cette semaine",
    "combien de nouveaux prospects cette semaine",
    "combien de prospects cette semaine",
    "combien de nouveaux contacts ai je ajoutes cette semaine",
    "combien de contacts ai je ajoutes cette semaine",
    "combien de nouveaux contacts cette semaine",
    "quel est mon nombre de nouveaux prospects cette semaine",
  ];
  const commandText = normalizeSpaces(
    normalizedText.replace(/-/g, " ").replace(/[?!.]+$/g, ""),
  );

  if (!countNewProspectsThisWeekCommands.includes(commandText)) {
    return null;
  }

  return successIfValid({
    action: "countNewProspectsThisWeek",
    payload: {},
  });
}

function parseGetProspectsNotContactedSinceDaysCommand(normalizedText: string) {
  const commandText = normalizeSpaces(
    normalizedText.replace(/-/g, " ").replace(/[?!.]+$/g, ""),
  );
  const match = [
    /^quels prospects je n['\u2018\u2019]ai pas contactes depuis ([0-9]+) jours?$/,
    /^qui n['\u2018\u2019]ai je pas contacte depuis ([0-9]+) jours?$/,
    /^montre moi les prospects sans contact depuis ([0-9]+) jours?$/,
    /^affiche les prospects sans contact depuis ([0-9]+) jours?$/,
    /^quels prospects sont sans contact depuis ([0-9]+) jours?$/,
    /^qui dois je contacter apres ([0-9]+) jours? sans echange$/,
  ]
    .map((pattern) => commandText.match(pattern))
    .find(Boolean);

  if (!match) {
    return null;
  }

  return successIfValid({
    action: "getProspectsNotContactedSinceDays",
    payload: {
      days: Number(match[1]),
    },
  });
}

function parseSearchCommand(originalText: string, normalizedText: string) {
  const searchPrefixes = [
    "recherche le prospect ",
    "recherche ",
    "cherche ",
    "trouve ",
  ];
  const matchedPrefix = searchPrefixes.find((prefix) =>
    normalizedText.startsWith(prefix),
  );

  if (!matchedPrefix) {
    return null;
  }

  const query = cleanPersonName(originalText.slice(matchedPrefix.length));

  if (!query) {
    return null;
  }

  return successIfValid({
    action: "searchProspect",
    payload: { query },
  });
}

function parseCreateCommand(originalText: string, normalizedText: string) {
  const createPrefixes = [
    "cree le prospect ",
    "nouveau prospect ",
    "ajoute ",
    "cree ",
  ];
  const matchedPrefix = createPrefixes.find((prefix) =>
    normalizedText.startsWith(prefix),
  );

  if (!matchedPrefix) {
    return null;
  }

  const colorWord = getColorMatch(normalizedText);
  const rawName = removeTrailingColorExpression(
    originalText.slice(matchedPrefix.length).replace(/\s+comme prospect$/i, ""),
  );
  const name = splitFirstNameAndLastName(rawName);

  if (!name) {
    return null;
  }

  const payload: AiCommand["payload"] = {
    firstName: name.firstName,
    ...(name.lastName ? { lastName: name.lastName } : {}),
    ...(colorWord ? { colorType: getColorTypeFromWord(colorWord) ?? undefined } : {}),
  };

  return successIfValid({
    action: "createProspect",
    payload,
  });
}

function parseColorUpdateCommand(originalText: string, normalizedText: string) {
  const colorWord = getColorMatch(normalizedText);

  if (!colorWord) {
    return null;
  }

  const colorType = getColorTypeFromWord(colorWord);

  if (!colorType) {
    return null;
  }

  const directMatch = normalizedText.match(
    /^(mets|passe|change) (.+) en (couleur )?(jaune|rouge|bleu|vert|verte)$/,
  );
  const colorChangeMatch = normalizedText.match(
    /^change la couleur de (.+) en (jaune|rouge|bleu|vert|verte)$/,
  );

  if (!directMatch && !colorChangeMatch) {
    return null;
  }

  const normalizedTarget = colorChangeMatch?.[1] ?? directMatch?.[2] ?? "";
  const targetStart = normalizedText.indexOf(normalizedTarget);
  const target = cleanPersonName(originalText.slice(targetStart, targetStart + normalizedTarget.length));

  if (!target) {
    return null;
  }

  return successIfValid({
    action: "updateProspect",
    payload: {
      target: { query: target },
      changes: { colorType },
    },
  });
}

function parseTemperatureUpdateCommand(
  originalText: string,
  normalizedText: string,
) {
  const temperatureWord = getTemperatureMatch(normalizedText);

  if (!temperatureWord) {
    return null;
  }

  const temperature = getTemperatureFromWord(temperatureWord);

  if (!temperature) {
    return null;
  }

  const directMatch = normalizedText.match(
    /^(mets|passe) (.+) en (marche )?(froid|tiede|chaud)$/,
  );
  const marketMatch = normalizedText.match(/^(.+) marche (froid|tiede|chaud)$/);

  if (!directMatch && !marketMatch) {
    return null;
  }

  const normalizedTarget = directMatch?.[2] ?? marketMatch?.[1] ?? "";
  const targetStart = normalizedText.indexOf(normalizedTarget);
  const target = cleanPersonName(originalText.slice(targetStart, targetStart + normalizedTarget.length));

  if (!target) {
    return null;
  }

  return successIfValid({
    action: "updateProspect",
    payload: {
      target: { query: target },
      changes: { temperature },
    },
  });
}

function parseAddNoteCommand(originalText: string) {
  const [rawPrefix = "", ...noteParts] = originalText.split(":");

  if (noteParts.length === 0) {
    return null;
  }

  const note = noteParts.join(":").trim();
  const prefixWords = normalizeSpaces(rawPrefix).split(" ").filter(Boolean);
  const normalizedPrefix = normalizeForDetection(rawPrefix);
  let targetWords: string[] = [];

  if (normalizedPrefix.startsWith("ajoute une note a ")) {
    targetWords = prefixWords.slice(4);
  } else if (normalizedPrefix.startsWith("ajoute dans les notes de ")) {
    targetWords = prefixWords.slice(5);
  } else if (normalizedPrefix.startsWith("note pour ")) {
    targetWords = prefixWords.slice(2);
  } else {
    return null;
  }

  const target = cleanPersonName(targetWords.join(" "));

  if (!target || !note) {
    return null;
  }

  return successIfValid({
    action: "addNote",
    payload: {
      target: { query: target },
      note,
    },
  });
}

function parseCreateFollowUpCommand(
  originalText: string,
  normalizedText: string,
  referenceDate: Date,
) {
  const followUpPrefixes = [
    "relance ",
    "programme une relance pour ",
    "prevois une relance pour ",
  ];
  const matchedPrefix = followUpPrefixes.find((prefix) =>
    normalizedText.startsWith(prefix),
  );

  if (!matchedPrefix) {
    return null;
  }

  const dateExpressionMatch = normalizedText.match(
    /(?:^| )((?:le )?(?:aujourd'hui|aujourd hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?: prochain)?)$/,
  );

  if (!dateExpressionMatch) {
    return null;
  }

  const date = parseFollowUpDateExpression(
    dateExpressionMatch[1],
    referenceDate,
  );

  if (!date) {
    return null;
  }

  const targetStart = matchedPrefix.length;
  const targetEnd = dateExpressionMatch.index ?? normalizedText.length;
  const target = cleanPersonName(originalText.slice(targetStart, targetEnd));

  if (!target || normalizeForDetection(target) === "tout le monde") {
    return null;
  }

  return successIfValid({
    action: "createFollowUp",
    payload: {
      target: { query: target },
      date,
    },
  });
}

export function parseAssistantCommand(
  text: string,
  referenceDate: Date = new Date(),
): AssistantCommandParseResult {
  const originalText = normalizeSpaces(text);
  const normalizedText = normalizeForDetection(originalText);

  if (!originalText) {
    return fail("Commande vide");
  }

  if (unsupportedMultiActionMarkers.some((marker) => normalizedText.includes(marker))) {
    return fail("Commande multiple non supportee");
  }

  return (
    parseAddNoteCommand(originalText) ??
    parseGetTodayFollowUpsCommand(normalizedText) ??
    parseCountNewProspectsThisWeekCommand(normalizedText) ??
    parseGetProspectsNotContactedSinceDaysCommand(normalizedText) ??
    parseSearchCommand(originalText, normalizedText) ??
    parseColorUpdateCommand(originalText, normalizedText) ??
    parseTemperatureUpdateCommand(originalText, normalizedText) ??
    parseCreateFollowUpCommand(originalText, normalizedText, referenceDate) ??
    parseCreateCommand(originalText, normalizedText) ??
    fail()
  );
}
