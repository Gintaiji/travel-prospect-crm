import type { Prospect } from "./types";

export type FollowUpMessageTemplateId =
  | "follow-up-2-days"
  | "follow-up-4-days"
  | "follow-up-30-days";

export type FollowUpMessageTemplate = {
  id: FollowUpMessageTemplateId;
  title: string;
  followUpDays: number;
  message: string;
  nextAction: string;
  suggestedStatus: Prospect["status"] | null;
};

type ProspectWithOptionalMeetingPlace = Prospect & {
  meetingPlace?: unknown;
};

function cleanMessageVariableValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessageVariableName(variableName: string) {
  return variableName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getProspectFullName(prospect: Prospect) {
  return [prospect.firstName, prospect.lastName]
    .map((namePart) => namePart.trim())
    .filter(Boolean)
    .join(" ");
}

function getMeetingPlaceFromNotes(notes: string) {
  const meetingPlaceLine = notes
    .split(/\r?\n/)
    .find((line) => /^Lieu de rencontre\s*:/i.test(line.trim()));

  if (!meetingPlaceLine) {
    return "";
  }

  const meetingPlace = meetingPlaceLine
    .replace(/^Lieu de rencontre\s*:/i, "")
    .trim();

  return meetingPlace && !/^Non renseign/i.test(meetingPlace) ? meetingPlace : "";
}

function getProspectMeetingPlace(prospect: Prospect) {
  const prospectWithMeetingPlace = prospect as ProspectWithOptionalMeetingPlace;
  const dedicatedMeetingPlace = cleanMessageVariableValue(
    prospectWithMeetingPlace.meetingPlace,
  );

  return dedicatedMeetingPlace || getMeetingPlaceFromNotes(prospect.notes);
}

export function replaceMessageVariables(template: string, prospect: Prospect) {
  const variableValues: Record<string, string> = {
    prenom: cleanMessageVariableValue(prospect.firstName),
    nom: cleanMessageVariableValue(prospect.lastName),
    nom_complet: getProspectFullName(prospect),
    telephone: cleanMessageVariableValue(prospect.phone),
    statut: cleanMessageVariableValue(prospect.status),
    date_relance: cleanMessageVariableValue(prospect.nextActionDate),
    date_de_relance: cleanMessageVariableValue(prospect.nextActionDate),
    lieu_rencontre: getProspectMeetingPlace(prospect),
    lieu_de_rencontre: getProspectMeetingPlace(prospect),
  };

  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, variableName) => {
    const normalizedVariableName = normalizeMessageVariableName(variableName);

    return variableValues[normalizedVariableName] ?? match;
  });
}

export const FOLLOW_UP_MESSAGE_TEMPLATES: FollowUpMessageTemplate[] = [
  {
    id: "follow-up-2-days",
    title: "Relance 2 jours",
    followUpDays: 2,
    message: "",
    nextAction: "Relance 2 jours",
    suggestedStatus: "À relancer",
  },
  {
    id: "follow-up-4-days",
    title: "Relance 4 jours",
    followUpDays: 4,
    message: "",
    nextAction: "Relance 4 jours",
    suggestedStatus: "À relancer",
  },
  {
    id: "follow-up-30-days",
    title: "Relance 30 jours",
    followUpDays: 30,
    message: "",
    nextAction: "Relance 30 jours",
    suggestedStatus: "À relancer",
  },
];
