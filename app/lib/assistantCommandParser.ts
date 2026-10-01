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
  const colorTypeValue = normalizedValue === "verte"
    ? "vert"
    : normalizedValue === "bleue" ? "bleu" : normalizedValue;

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

function parseGetOverdueFollowUpsCommand(normalizedText: string) {
  const overdueFollowUpCommands = [
    "quelles relances sont en retard",
    "montre moi les relances en retard",
    "montre les relances en retard",
    "affiche les relances en retard",
    "mes relances en retard",
    "qui dois je relancer en retard",
    "qui aurais je deja du relancer",
    "qui aurais je du relancer",
    "quels prospects sont en retard de relance",
    "montre les prospects en retard de relance",
  ];
  const commandText = normalizeSpaces(
    normalizedText.replace(/-/g, " ").replace(/[?!.]+$/g, ""),
  );

  if (!overdueFollowUpCommands.includes(commandText)) {
    return null;
  }

  return successIfValid({
    action: "getOverdueFollowUps",
    payload: {},
  });
}

function parseGetTodayOverviewCommand(normalizedText: string) {
  const todayOverviewCommands = [
    "qu'est ce que je dois faire aujourd'hui",
    "qu'est ce que j'ai a faire aujourd'hui",
    "que dois je faire aujourd'hui",
    "qu'ai je a faire aujourd'hui",
    "fais moi le point pour aujourd'hui",
    "fais moi le point aujourd'hui",
    "donne moi mes priorites du jour",
    "quelles sont mes priorites aujourd'hui",
    "mon programme du jour",
    "resume de ma journee",
  ];
  const commandText = normalizeSpaces(
    normalizedText.replace(/-/g, " ").replace(/[?!.]+$/g, ""),
  );

  if (!todayOverviewCommands.includes(commandText)) {
    return null;
  }

  return successIfValid({
    action: "getTodayOverview",
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

function parseCreateCommand(
  originalText: string,
  normalizedText: string,
  referenceDate: Date,
) {
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

  // NFC keeps accented letters aligned with their detection form when slicing.
  let body = originalText.normalize("NFC").slice(matchedPrefix.length);
  let normalizedBody = normalizeForDetection(body);
  const originalNote = /\b(?:(?:avec|ajoute) la )?notes?\s*:/.exec(normalizedBody);
  const followUpClause = /(?:,\s*|\s+et\s+|\s+)(?:relance(?:-la|-le)?|a relancer|a rappeler)\s+([^,;]+?)[.!?]*$/.exec(normalizedBody);
  let nextActionDate: string | null = null;

  // Within a note, only a comma-separated final clause with a known date
  // is structural. Other mentions of reminders remain opaque note text.
  if (followUpClause && (
    !originalNote ||
    followUpClause.index < originalNote.index ||
    followUpClause[0].startsWith(",")
  )) {
    nextActionDate = parseFollowUpDateExpression(
      followUpClause[1].trim(),
      referenceDate,
    );
    if (nextActionDate) {
      body = body.slice(0, followUpClause.index).trim();
      normalizedBody = normalizeForDetection(body);
    } else if (!originalNote || followUpClause.index < originalNote.index) {
      return fail("Date de relance non reconnue");
    }
  }

  const noteMatch = /\b(?:(?:avec|ajoute) la )?notes?\s*:/i.exec(normalizedBody);
  let details = noteMatch ? body.slice(0, noteMatch.index) : body;
  let normalizedDetails = normalizeForDetection(details);
  const originalDetails = originalNote
    ? normalizeForDetection(originalText).slice(0, matchedPrefix.length + originalNote.index)
    : normalizeForDetection(originalText);
  if (
    originalDetails.includes(" puis relance") ||
    unsupportedMultiActionMarkers.some((marker) => normalizedDetails.includes(marker)) ||
    /\b(?:relance(?:-la|-le)?|a relancer|a rappeler)\b/.test(normalizedDetails)
  ) {
    return fail("Commande multiple ou relance non supportee");
  }
  const notes = noteMatch
    ? body.slice(noteMatch.index + noteMatch[0].length).trim()
    : "";
  const clausePattern = /\b(?:rencontree?\s+(?:a|chez)|vue?\s+a|(?:en|couleur|comme prospect)\s+(?:jaune|rouge|bleue?|verte?)|marche\s+(?:froid|tiede|chaud))\b/g;
  const cleanClauseValue = (value: string) =>
    normalizeSpaces(value.replace(/^[\s,;:.!?]+|[\s,;:.!?]+$/g, ""));
  const contactValues: Partial<Pick<Prospect, "phone" | "whatsapp" | "email">> = {};
  // Work only outside the opaque note. Explicit markers are required;
  // numbers and addresses elsewhere never imply contact information.
  const contactPattern = /(?:^|[\s,;])((?:numero de telephone|numero|telephone|tel|whatsapp|e-mail|email|mail))\s+/g;
  const contactClauses = Array.from(normalizedDetails.matchAll(contactPattern));
  const contactRanges: Array<{ start: number; end: number }> = [];
  for (const clause of contactClauses) {
    const valueStart = clause.index + clause[0].length;
    const remaining = details.slice(valueStart);
    const isEmail = /^(?:e-mail|email|mail)$/.test(clause[1]);
    const valueMatch = isEmail
      ? /^[^\s,;@]+@[^\s,;@]+/.exec(remaining)
      : /^[+\d(][\d\s+.()-]*/.exec(remaining);
    const value = valueMatch?.[0].replace(/[\s.!?]+$/g, "") ?? "";
    if (!value || (!isEmail && !/\d/.test(value))) {
      return fail("Coordonnee non reconnue");
    }
    const key = isEmail ? "email" : clause[1] === "whatsapp" ? "whatsapp" : "phone";
    contactValues[key] = value;
    let start = clause.index;
    // Remove the clause's leading separator too, keeping any next separator
    // available for the existing professional-segment extraction.
    while (start > 0 && /[\s,;]/.test(details[start - 1])) start -= 1;
    contactRanges.push({ start, end: valueStart + valueMatch![0].length });
  }
  for (const range of contactRanges.reverse()) {
    details = details.slice(0, range.start) + " " + details.slice(range.end);
  }
  details = normalizeSpaces(details);
  normalizedDetails = normalizeForDetection(details);
  let jobTitle = "";
  let businessArea = "";
  // Only a clearly separated segment before CRM details can describe a job.
  // Notes and the initial follow-up have already been isolated above.
  const professionalStart = normalizedDetails.indexOf(",");
  const crmBoundary = /\b(?:rencontree?|vue?|couleur|en\s+(?:jaune|rouge|bleue?|verte?)|comme prospect|marche|notes?|relance(?:-la|-le)?|a relancer|a rappeler)\b/;
  const firstCrmClause = crmBoundary.exec(normalizedDetails);
  if (
    professionalStart >= 0 &&
    (!firstCrmClause || professionalStart < firstCrmClause.index)
  ) {
    const segmentStart = professionalStart + 1;
    const remaining = normalizedDetails.slice(segmentStart);
    const segmentBoundary = /[,;]/.exec(remaining);
    const nextCrmClause = crmBoundary.exec(remaining);
    const segmentLength = Math.min(
      segmentBoundary?.index ?? remaining.length,
      nextCrmClause?.index ?? remaining.length,
    );
    const professionalText = cleanClauseValue(
      details.slice(segmentStart, segmentStart + segmentLength),
    );
    const normalizedProfessional = normalizeForDetection(professionalText);
    const sectorMarker = /\s+(?:dans\s+(?:(?:le|la|les)\s+|l')?|secteur\s+)/.exec(normalizedProfessional);
    const rawJobTitle = cleanClauseValue(
      professionalText.slice(0, sectorMarker?.index),
    );
    const rawBusinessArea = sectorMarker
      ? cleanClauseValue(professionalText.slice(sectorMarker.index + sectorMarker[0].length))
      : "";
    const capitalizeFirstLetter = (value: string) =>
      value.charAt(0).toUpperCase() + value.slice(1);
    if (rawJobTitle) {
      jobTitle = capitalizeFirstLetter(rawJobTitle);
      if (rawBusinessArea) businessArea = capitalizeFirstLetter(rawBusinessArea);
      details = normalizeSpaces(
        details.slice(0, professionalStart) + " " + details.slice(segmentStart + segmentLength),
      );
      normalizedDetails = normalizeForDetection(details);
    }
  }
  const detailClauses = Array.from(normalizedDetails.matchAll(clausePattern));
  const rawName = cleanClauseValue(details.slice(0, detailClauses[0]?.index));
  const name = splitFirstNameAndLastName(rawName.replace(/\s+comme prospect$/i, ""));

  if (!name) {
    return null;
  }

  const payload: Extract<AiCommand, { action: "createProspect" }>["payload"] = {
    firstName: name.firstName,
    ...contactValues,
    ...(name.lastName ? { lastName: name.lastName } : {}),
    ...(jobTitle ? { jobTitle } : {}),
    ...(businessArea ? { businessArea } : {}),
    ...(notes ? { notes } : {}),
    ...(nextActionDate ? { nextActionDate } : {}),
  };

  for (const [index, clause] of detailClauses.entries()) {
    const marker = clause[0];
    if (/^(?:rencontree?|vue?)\s/.test(marker)) {
      const meetingPlace = cleanClauseValue(details.slice(
        clause.index + marker.length,
        detailClauses[index + 1]?.index,
      ));
      if (meetingPlace) payload.meetingPlace = meetingPlace;
    } else if (marker.startsWith("marche ")) {
      const temperature = getTemperatureFromWord(marker.split(" ").at(-1) ?? "");
      if (temperature) payload.temperature = temperature;
    } else {
      const colorType = getColorTypeFromWord(marker.split(" ").at(-1) ?? "");
      if (colorType) payload.colorType = colorType;
    }
  }

  // Preserve the existing simple trailing-color formulation ("Ajoute Paul jaune").
  if (detailClauses.length === 0 && !jobTitle) {
    const colorWord = getColorMatch(normalizedDetails);
    const trailingColor = details.match(/\s+(jaune|rouge|bleu|vert|verte)[\s.!?]*$/i);
    if (colorWord && trailingColor) {
      const simpleName = splitFirstNameAndLastName(details.slice(0, trailingColor.index));
      const colorType = getColorTypeFromWord(colorWord);
      if (!simpleName || !colorType) return fail();
      payload.firstName = simpleName.firstName;
      delete payload.lastName;
      if (simpleName.lastName) payload.lastName = simpleName.lastName;
      payload.colorType = colorType;
    }
  }

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

  // Handle initial follow-ups only for a creation intent. Existing note
  // commands retain priority and all other actions keep the multi-action guard.
  const addNoteCommand = parseAddNoteCommand(originalText);
  const createCommand = addNoteCommand
    ? null
    : parseCreateCommand(originalText, normalizedText, referenceDate);
  if (createCommand) return createCommand;

  // A creation note is opaque text, including any words resembling actions.
  const creationPrefix = /^(?:cree le prospect|nouveau prospect|ajoute|cree) /;
  const creationNote = creationPrefix.test(normalizedText)
    ? /\b(?:(?:avec|ajoute) la )?notes?\s*:/.exec(normalizedText)
    : null;
  const actionText = creationNote
    ? normalizedText.slice(0, creationNote.index)
    : normalizedText;
  if (unsupportedMultiActionMarkers.some((marker) => actionText.includes(marker))) {
    return fail("Commande multiple non supportee");
  }

  return (
    addNoteCommand ??
    parseGetTodayFollowUpsCommand(normalizedText) ??
    parseGetOverdueFollowUpsCommand(normalizedText) ??
    parseGetTodayOverviewCommand(normalizedText) ??
    parseCountNewProspectsThisWeekCommand(normalizedText) ??
    parseGetProspectsNotContactedSinceDaysCommand(normalizedText) ??
    parseSearchCommand(originalText, normalizedText) ??
    parseColorUpdateCommand(originalText, normalizedText) ??
    parseTemperatureUpdateCommand(originalText, normalizedText) ??
    parseCreateFollowUpCommand(originalText, normalizedText, referenceDate) ??
    fail()
  );
}
