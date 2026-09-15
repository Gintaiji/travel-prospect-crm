import type { Prospect } from "./types";

export type FollowUpMessageTemplateId =
  | "first-follow-up"
  | "follow-up-2-days"
  | "follow-up-4-days"
  | "follow-up-30-days";

export type FollowUpMessageTemplate = {
  id: FollowUpMessageTemplateId;
  title: string;
  followUpDays: number | null;
  message: string;
  nextAction: string;
  suggestedStatus: Prospect["status"] | null;
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
  const dedicatedMeetingPlace = cleanMessageVariableValue(prospect.meetingPlace);

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
    lieurencontre: getProspectMeetingPlace(prospect),
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
    message:
      "Bonjour {{prenom}}, c’est {{nom_affiche}}.\n\nJe reviens vers vous comme convenu, suite à notre échange à {{lieu de rencontre}}.\n\nVous aviez évoqué le fait que vous étiez ouvert à des possibilités de projet professionnel. Est-ce que c’est toujours d’actualité pour vous ?",
    nextAction: "Relance 2 jours",
    suggestedStatus: "À relancer",
  },
  {
    id: "follow-up-4-days",
    title: "Relance 4 jours",
    followUpDays: 4,
    message:
      "Bonjour {{prenom}}, c’est {{nom_affiche}}.\n\nJe suis désolé de ne pas avoir pu revenir vers vous plus tôt, j’ai été très occupé ces derniers jours.\n\nJe me permets de vous envoyer ce message car je suis malheureusement sans nouvelle de vous suite à notre échange à {{lieu de rencontre}}.\n\nVous aviez évoqué le fait que vous étiez ouvert à des possibilités de projet professionnel. Est-ce que c’est toujours d’actualité pour vous ?",
    nextAction: "Relance 4 jours",
    suggestedStatus: "À relancer",
  },
  {
    id: "follow-up-30-days",
    title: "Relance 30 jours",
    followUpDays: 30,
    message:
      "Bonjour {{prenom}}, c’est {{nom_affiche}}.\n\nJe me permets de vous envoyer ce petit message car je suis actuellement en plein développement de mon activité et je souhaitais vous poser une petite question.\n\nEst-ce que vous connaissez quelqu’un qui adore voyager, mais qui trouve que les voyages coûtent de plus en plus cher, et qui aimerait pouvoir partir plus souvent sans augmenter son budget ?\n\nSi quelqu’un vous vient en tête, sentez-vous libre de me le dire. Sinon, aucun problème.",
    nextAction: "Relance 30 jours",
    suggestedStatus: "À relancer",
  },
  {
    id: "first-follow-up",
    title: "Premier message voyage",
    followUpDays: null,
    message:
      "Bonjour {{prenom}},\n\nC’est {{nom_affiche}}, nous avons échangé aujourd’hui à {{lieu de rencontre}}, notamment autour du voyage.\n\nJ’ai beaucoup apprécié notre échange. Comme je vous l’expliquais, j’utilise personnellement un service qui me permet de faire des économies sur mes déplacements et mes vacances, et que je partage autour de moi lorsque je pense qu’il peut être utile.\n\nVous sembliez intéressé(e) par le sujet, alors je souhaitais simplement revenir vers vous comme convenu et savoir si vous seriez toujours ouvert(e) à découvrir plus concrètement son fonctionnement.\n\nSi c’est le cas, nous pourrons prendre quelques minutes pour en discuter tranquillement et voir si cela pourrait correspondre à votre façon de voyager.\n\nSentez-vous libre de me transmettre vos disponibilités afin que nous puissions convenir d’un créneau qui vous convient.\n\nBien cordialement,\n{{nom_affiche}}",
    nextAction: "",
    suggestedStatus: null,
  },
];
