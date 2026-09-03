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

  const normalizedTarget = directMatch?.[2] ?? colorChangeMatch?.[1] ?? "";
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

  const match =
    normalizedText.match(/^(mets|passe) (.+) en (marche )?(froid|tiede|chaud)$/) ??
    normalizedText.match(/^(.+) marche (froid|tiede|chaud)$/);

  if (!match) {
    return null;
  }

  const normalizedTarget = match[2] ?? match[1] ?? "";
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

export function parseAssistantCommand(text: string): AssistantCommandParseResult {
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
    parseSearchCommand(originalText, normalizedText) ??
    parseColorUpdateCommand(originalText, normalizedText) ??
    parseTemperatureUpdateCommand(originalText, normalizedText) ??
    parseCreateCommand(originalText, normalizedText) ??
    fail()
  );
}
