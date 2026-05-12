"use client";

import { useEffect, useRef, useState } from "react";
import {
  createProspectId,
  loadProspects,
  saveProspects,
} from "../lib/prospectStorage";
import { loadResources } from "../lib/resourceStorage";
import {
  calculateProspectScore,
  getFutureDateString,
  getProspectDisplayName,
  getTodayDateString,
} from "../lib/prospectUtils";
import {
  MESSAGE_TUNNEL_STEPS,
  type MessageStyle,
  type MessageTunnelStep,
} from "../lib/messageTemplates";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_COLOR_TYPES,
  PROSPECT_STATUSES,
  PROSPECT_TAGS,
  PROSPECT_TEMPERATURES,
  SOCIAL_PLATFORMS,
  type ConversationEntry,
  type Prospect,
  type Resource,
} from "../lib/types";

type ProspectFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  businessArea: string;
  mainPlatform: Prospect["mainPlatform"];
  profileUrl: string;
  category: Prospect["category"];
  temperature: Prospect["temperature"];
  colorType: Prospect["colorType"];
  city: string;
  region: string;
  country: string;
  phone: string;
  whatsapp: string;
  email: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  otherUrl: string;
  isFollower: boolean;
  hasSentMessage: boolean;
  followerSinceDate: string;
  commentsCount: string;
  interactionsCount: string;
  likesCount: string;
  messagesCount: string;
  tags: Prospect["tags"];
  notes: string;
};

type ConversationFormState = {
  date: string;
  channel: Prospect["mainPlatform"];
  content: string;
  nextAction: string;
};

type QualificationFormState = {
  status: Prospect["status"];
  category: Prospect["category"];
  temperature: Prospect["temperature"];
  colorType: Prospect["colorType"];
  nextActionDate: string;
  notes: string;
  isFollower: boolean;
  hasSentMessage: boolean;
  followerSinceDate: string;
  commentsCount: string;
  interactionsCount: string;
  likesCount: string;
  messagesCount: string;
  tags: Prospect["tags"];
};

type FullProspectFormState = ProspectFormState & {
  status: Prospect["status"];
  nextActionDate: string;
};

type FilterValue<T extends string> = "Tous" | T;

type ProspectFilters = {
  platform: FilterValue<Prospect["mainPlatform"]>;
  status: FilterValue<Prospect["status"]>;
  category: FilterValue<Prospect["category"]>;
  temperature: FilterValue<Prospect["temperature"]>;
  colorType: FilterValue<Prospect["colorType"]>;
  tag: FilterValue<Prospect["tags"][number]>;
};

type ProspectSortOption =
  | "createdAtDesc"
  | "scoreDesc"
  | "nextActionDate"
  | "nameAsc"
  | "temperatureHotFirst";

type ProspectViewMode = "compact" | "detailed";

type ProspectDisplayMode = "list" | "pipeline";

const MESSAGE_ASSISTANT_SITUATIONS = MESSAGE_TUNNEL_STEPS.map(
  (messageStep) => messageStep.step,
);

const MESSAGE_ASSISTANT_STYLES = ["Doux", "Naturel", "Direct"] satisfies MessageStyle[];

type MessageAssistantSituation = MessageTunnelStep;
type MessageAssistantStyle = MessageStyle;

const PROSPECT_CSV_COLUMNS = [
  "firstName",
  "lastName",
  "displayName",
  "jobTitle",
  "businessArea",
  "city",
  "region",
  "country",
  "phone",
  "whatsapp",
  "email",
  "mainPlatform",
  "profileUrl",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "otherLink",
  "category",
  "status",
  "temperature",
  "colorType",
  "score",
  "tags",
  "isFollower",
  "hasSentMessage",
  "followerSinceDate",
  "commentsCount",
  "interactionsCount",
  "likesCount",
  "messagesCount",
  "lastInteractionDate",
  "nextActionDate",
  "notes",
] as const;

type MessageAssistantState = {
  situation: MessageAssistantSituation;
  style: MessageAssistantStyle;
  generatedMessage: string;
  selectedResourceId: string;
  copiedProspectId: string | null;
  addedHistoryProspectId: string | null;
  copiedResourceProspectId: string | null;
  copiedMessageWithResourceProspectId: string | null;
  suggestedFollowUpAppliedProspectId: string | null;
  suggestedStatusAppliedProspectId: string | null;
};

type PotentialDuplicateReason =
  | "même email"
  | "même téléphone"
  | "même WhatsApp"
  | "même lien profil"
  | "même réseau social"
  | "même identité et ville";

type PotentialDuplicateGroup = {
  id: string;
  prospects: Prospect[];
  reasons: PotentialDuplicateReason[];
};

type DuplicateMergeState = {
  groupId: string;
  keepProspectId: string;
  mergeProspectId: string;
};

function compareDateStrings(firstDate: string, secondDate: string) {
  if (firstDate === secondDate) {
    return 0;
  }

  return firstDate < secondDate ? -1 : 1;
}

function toggleProspectTag(currentTags: Prospect["tags"], tag: Prospect["tags"][number]) {
  if (currentTags.includes(tag)) {
    return currentTags.filter((currentTag) => currentTag !== tag);
  }

  return [...currentTags, tag];
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeUrl(value: string) {
  const trimmedValue = value.trim().toLowerCase();

  if (!trimmedValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(
      trimmedValue.startsWith("http://") || trimmedValue.startsWith("https://")
        ? trimmedValue
        : `https://${trimmedValue}`,
    );
    const hostname = parsedUrl.hostname.replace(/^www\./, "");
    const pathname = parsedUrl.pathname.replace(/\/+$/, "");

    return `${hostname}${pathname}`;
  } catch {
    return trimmedValue
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  }
}

function getProspectDuplicateReasons(
  firstProspect: Prospect,
  secondProspect: Prospect,
) {
  const reasons: PotentialDuplicateReason[] = [];
  const firstEmail = normalizeEmail(firstProspect.email);
  const secondEmail = normalizeEmail(secondProspect.email);
  const firstPhone = normalizePhone(firstProspect.phone);
  const secondPhone = normalizePhone(secondProspect.phone);
  const firstWhatsapp = normalizePhone(firstProspect.whatsapp);
  const secondWhatsapp = normalizePhone(secondProspect.whatsapp);
  const firstProfileUrl = normalizeUrl(firstProspect.profileUrl);
  const secondProfileUrl = normalizeUrl(secondProspect.profileUrl);
  const firstInstagramUrl = normalizeUrl(firstProspect.socialLinks.instagram);
  const secondInstagramUrl = normalizeUrl(secondProspect.socialLinks.instagram);
  const firstFacebookUrl = normalizeUrl(firstProspect.socialLinks.facebook);
  const secondFacebookUrl = normalizeUrl(secondProspect.socialLinks.facebook);
  const firstLinkedinUrl = normalizeUrl(firstProspect.socialLinks.linkedin);
  const secondLinkedinUrl = normalizeUrl(secondProspect.socialLinks.linkedin);
  const sameIdentityAndCity =
    Boolean(
      normalizeText(firstProspect.firstName) &&
        normalizeText(firstProspect.lastName) &&
        normalizeText(firstProspect.city),
    ) &&
    normalizeText(firstProspect.firstName) === normalizeText(secondProspect.firstName) &&
    normalizeText(firstProspect.lastName) === normalizeText(secondProspect.lastName) &&
    normalizeText(firstProspect.city) === normalizeText(secondProspect.city);

  if (firstEmail && firstEmail === secondEmail) {
    reasons.push("même email");
  }

  if (firstPhone && firstPhone === secondPhone) {
    reasons.push("même téléphone");
  }

  if (firstWhatsapp && firstWhatsapp === secondWhatsapp) {
    reasons.push("même WhatsApp");
  }

  if (firstProfileUrl && firstProfileUrl === secondProfileUrl) {
    reasons.push("même lien profil");
  }

  if (
    (firstInstagramUrl && firstInstagramUrl === secondInstagramUrl) ||
    (firstFacebookUrl && firstFacebookUrl === secondFacebookUrl) ||
    (firstLinkedinUrl && firstLinkedinUrl === secondLinkedinUrl)
  ) {
    reasons.push("même réseau social");
  }

  if (sameIdentityAndCity) {
    reasons.push("même identité et ville");
  }

  return reasons;
}

function findPotentialDuplicates(prospectsToCheck: Prospect[]) {
  const duplicateGroups: PotentialDuplicateGroup[] = [];

  prospectsToCheck.forEach((prospect, prospectIndex) => {
    prospectsToCheck.slice(prospectIndex + 1).forEach((comparedProspect) => {
      const reasons = getProspectDuplicateReasons(prospect, comparedProspect);

      if (reasons.length === 0) {
        return;
      }

      const existingGroup = duplicateGroups.find((group) =>
        group.prospects.some(
          (groupProspect) =>
            groupProspect.id === prospect.id || groupProspect.id === comparedProspect.id,
        ),
      );

      if (existingGroup) {
        [prospect, comparedProspect].forEach((duplicateProspect) => {
          if (!existingGroup.prospects.some((groupProspect) => groupProspect.id === duplicateProspect.id)) {
            existingGroup.prospects.push(duplicateProspect);
          }
        });
        reasons.forEach((reason) => {
          if (!existingGroup.reasons.includes(reason)) {
            existingGroup.reasons.push(reason);
          }
        });
        return;
      }

      duplicateGroups.push({
        id: `${prospect.id}-${comparedProspect.id}`,
        prospects: [prospect, comparedProspect],
        reasons,
      });
    });
  });

  return duplicateGroups;
}

function pickFilledText(primaryValue: string, secondaryValue: string) {
  return primaryValue.trim() ? primaryValue : secondaryValue;
}

function pickOldestDate(firstDate: string, secondDate: string) {
  if (!firstDate) {
    return secondDate;
  }

  if (!secondDate) {
    return firstDate;
  }

  return compareDateStrings(firstDate, secondDate) <= 0 ? firstDate : secondDate;
}

function pickNewestDate(firstDate: string, secondDate: string) {
  if (!firstDate) {
    return secondDate;
  }

  if (!secondDate) {
    return firstDate;
  }

  return compareDateStrings(firstDate, secondDate) >= 0 ? firstDate : secondDate;
}

function pickMergedNextActionDate(firstDate: string, secondDate: string) {
  const today = getTodayDateString();
  const futureDates = [firstDate, secondDate]
    .filter((date) => date && compareDateStrings(date, today) >= 0)
    .sort(compareDateStrings);

  if (futureDates.length > 0) {
    return futureDates[0];
  }

  return pickNewestDate(firstDate, secondDate);
}

function mergeProspectData(keptProspect: Prospect, mergedProspect: Prospect) {
  const keptInteractionStats = keptProspect.interactionStats ?? {
    followerSinceDate: "",
    commentsCount: 0,
    interactionsCount: 0,
    likesCount: 0,
    messagesCount: 0,
  };
  const mergedInteractionStats = mergedProspect.interactionStats ?? {
    followerSinceDate: "",
    commentsCount: 0,
    interactionsCount: 0,
    likesCount: 0,
    messagesCount: 0,
  };
  const mergedConversationHistory = [
    ...(keptProspect.conversationHistory ?? []),
    ...(mergedProspect.conversationHistory ?? []),
  ].sort((firstEntry, secondEntry) =>
    compareDateStrings(firstEntry.date || "9999-12-31", secondEntry.date || "9999-12-31"),
  );
  const mergedTags = Array.from(new Set([...(keptProspect.tags ?? []), ...(mergedProspect.tags ?? [])]));
  const mergedBase: Prospect = {
    ...keptProspect,
    firstName: pickFilledText(keptProspect.firstName, mergedProspect.firstName),
    lastName: pickFilledText(keptProspect.lastName, mergedProspect.lastName),
    displayName: pickFilledText(keptProspect.displayName, mergedProspect.displayName),
    jobTitle: pickFilledText(keptProspect.jobTitle, mergedProspect.jobTitle),
    businessArea: pickFilledText(keptProspect.businessArea, mergedProspect.businessArea),
    city: pickFilledText(keptProspect.city, mergedProspect.city),
    region: pickFilledText(keptProspect.region, mergedProspect.region),
    country: pickFilledText(keptProspect.country, mergedProspect.country),
    phone: pickFilledText(keptProspect.phone, mergedProspect.phone),
    whatsapp: pickFilledText(keptProspect.whatsapp, mergedProspect.whatsapp),
    email: pickFilledText(keptProspect.email, mergedProspect.email),
    profileUrl: pickFilledText(keptProspect.profileUrl, mergedProspect.profileUrl),
    socialLinks: {
      facebook: pickFilledText(keptProspect.socialLinks.facebook, mergedProspect.socialLinks.facebook),
      instagram: pickFilledText(keptProspect.socialLinks.instagram, mergedProspect.socialLinks.instagram),
      linkedin: pickFilledText(keptProspect.socialLinks.linkedin, mergedProspect.socialLinks.linkedin),
      tiktok: pickFilledText(keptProspect.socialLinks.tiktok, mergedProspect.socialLinks.tiktok),
      youtube: pickFilledText(keptProspect.socialLinks.youtube, mergedProspect.socialLinks.youtube),
      other: pickFilledText(keptProspect.socialLinks.other, mergedProspect.socialLinks.other),
    },
    tags: mergedTags,
    isFollower: keptProspect.isFollower || mergedProspect.isFollower,
    hasSentMessage: keptProspect.hasSentMessage || mergedProspect.hasSentMessage,
    interactionStats: {
      followerSinceDate: pickOldestDate(
        keptInteractionStats.followerSinceDate,
        mergedInteractionStats.followerSinceDate,
      ),
      commentsCount: keptInteractionStats.commentsCount + mergedInteractionStats.commentsCount,
      interactionsCount: keptInteractionStats.interactionsCount + mergedInteractionStats.interactionsCount,
      likesCount: keptInteractionStats.likesCount + mergedInteractionStats.likesCount,
      messagesCount: keptInteractionStats.messagesCount + mergedInteractionStats.messagesCount,
    },
    lastInteractionDate: pickNewestDate(keptProspect.lastInteractionDate, mergedProspect.lastInteractionDate),
    nextActionDate: pickMergedNextActionDate(keptProspect.nextActionDate, mergedProspect.nextActionDate),
    conversationHistory: mergedConversationHistory,
    notes: pickFilledText(keptProspect.notes, mergedProspect.notes),
    createdAt: pickOldestDate(keptProspect.createdAt, mergedProspect.createdAt),
    updatedAt: new Date().toISOString(),
  };

  return {
    ...mergedBase,
    score: calculateProspectScore(mergedBase),
  };
}

function escapeCsvValue(value: string | number | boolean) {
  const stringValue = String(value);

  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let isInsideQuotedCell = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const currentCharacter = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (currentCharacter === '"') {
      if (isInsideQuotedCell && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        isInsideQuotedCell = !isInsideQuotedCell;
      }
      continue;
    }

    if (currentCharacter === "," && !isInsideQuotedCell) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((currentCharacter === "\n" || currentCharacter === "\r") && !isInsideQuotedCell) {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";

      if (currentCharacter === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      continue;
    }

    currentCell += currentCharacter;
  }

  if (isInsideQuotedCell) {
    return null;
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim()));
}

function normalizeCsvNumber(value: string) {
  const parsedValue = Number(value);

  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function normalizeCsvBoolean(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  return ["true", "1", "yes", "oui", "vrai"].includes(normalizedValue);
}

function normalizeCsvCell(value: string | undefined) {
  return (value ?? "").trim();
}

function pickAllowedCsvValue<T extends string>(
  value: string,
  allowedValues: readonly T[],
  fallbackValue: T,
) {
  return allowedValues.includes(value as T) ? (value as T) : fallbackValue;
}

function getSortedResources(resources: Resource[]) {
  return [...resources].sort((firstResource, secondResource) => {
    if (firstResource.isFavorite !== secondResource.isFavorite) {
      return firstResource.isFavorite ? -1 : 1;
    }

    return firstResource.title.localeCompare(secondResource.title, "fr", {
      sensitivity: "base",
    });
  });
}

function buildMessageWithResource(message: string, resource: Resource) {
  const cleanMessage = message.trim();

  return cleanMessage ? `${cleanMessage}\n\n${resource.url}` : resource.url;
}

function buildConversationContentWithResource(message: string, resource: Resource) {
  const cleanMessage = message.trim();

  return cleanMessage
    ? `${cleanMessage}\n\nRessource partagée : ${resource.url}`
    : `Ressource partagée : ${resource.url}`;
}

function getTemperatureSortRank(temperature: Prospect["temperature"]) {
  if (temperature === "Chaud") {
    return 0;
  }

  if (temperature === "Tiède") {
    return 1;
  }

  return 2;
}

function cleanPhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/[\s.\-()]/g, "");
}

function buildWhatsAppNumber(phoneNumber: string) {
  const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

  if (cleanedPhoneNumber.startsWith("0")) {
    return `33${cleanedPhoneNumber.slice(1)}`;
  }

  return cleanedPhoneNumber;
}

const initialFormState: ProspectFormState = {
  firstName: "",
  lastName: "",
  displayName: "",
  jobTitle: "",
  businessArea: "",
  mainPlatform: SOCIAL_PLATFORMS[0],
  profileUrl: "",
  category: PROSPECT_CATEGORIES[0],
  temperature: PROSPECT_TEMPERATURES[0],
  colorType: PROSPECT_COLOR_TYPES[0],
  city: "",
  region: "",
  country: "",
  phone: "",
  whatsapp: "",
  email: "",
  facebookUrl: "",
  instagramUrl: "",
  linkedinUrl: "",
  tiktokUrl: "",
  youtubeUrl: "",
  otherUrl: "",
  isFollower: false,
  hasSentMessage: false,
  followerSinceDate: "",
  commentsCount: "0",
  interactionsCount: "0",
  likesCount: "0",
  messagesCount: "0",
  tags: [],
  notes: "",
};

const initialConversationFormState: ConversationFormState = {
  date: "",
  channel: SOCIAL_PLATFORMS[0],
  content: "",
  nextAction: "",
};

const initialQualificationFormState: QualificationFormState = {
  status: PROSPECT_STATUSES[0],
  category: PROSPECT_CATEGORIES[0],
  temperature: PROSPECT_TEMPERATURES[0],
  colorType: PROSPECT_COLOR_TYPES[0],
  nextActionDate: "",
  notes: "",
  isFollower: false,
  hasSentMessage: false,
  followerSinceDate: "",
  commentsCount: "0",
  interactionsCount: "0",
  likesCount: "0",
  messagesCount: "0",
  tags: [],
};

const initialFullProspectFormState: FullProspectFormState = {
  ...initialFormState,
  status: PROSPECT_STATUSES[0],
  nextActionDate: "",
};

const initialProspectFilters: ProspectFilters = {
  platform: "Tous",
  status: "Tous",
  category: "Tous",
  temperature: "Tous",
  colorType: "Tous",
  tag: "Tous",
};

const initialMessageAssistantState: MessageAssistantState = {
  situation: MESSAGE_ASSISTANT_SITUATIONS[0],
  style: MESSAGE_ASSISTANT_STYLES[1],
  generatedMessage: "",
  selectedResourceId: "",
  copiedProspectId: null,
  addedHistoryProspectId: null,
  copiedResourceProspectId: null,
  copiedMessageWithResourceProspectId: null,
  suggestedFollowUpAppliedProspectId: null,
  suggestedStatusAppliedProspectId: null,
};

const socialLinkLabels: Array<{
  key: keyof Prospect["socialLinks"];
  label: string;
}> = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "other", label: "Autre" },
];

function getNaturalNoteHint(notes: string) {
  const cleanNotes = notes.trim();
  const normalizedNotes = cleanNotes.toLowerCase();
  const vagueNotes = [
    "test",
    "à relancer",
    "a relancer",
    "chaud",
    "tiède",
    "tiede",
    "froid",
    "famille",
    "ok",
    "vu",
  ];

  if (
    cleanNotes.length < 18 ||
    cleanNotes.split(/\s+/).length < 4 ||
    vagueNotes.includes(normalizedNotes)
  ) {
    return "";
  }

  if (normalizedNotes.includes("famille")) {
    return " J’ai repensé à ce que tu disais sur les voyages en famille.";
  }

  if (normalizedNotes.includes("portugal")) {
    return " J’ai repensé à ce que tu disais sur le Portugal.";
  }

  if (normalizedNotes.includes("hôtel") || normalizedNotes.includes("hotel")) {
    return " J’ai repensé à ce que tu disais sur les séjours et les hôtels.";
  }

  if (normalizedNotes.includes("bon plan") || normalizedNotes.includes("bons plans")) {
    return " J’ai repensé à ce que tu disais sur les bons plans voyage.";
  }

  return "";
}

function buildMessageAssistantContext(prospect: Prospect) {
  const firstName = prospect.firstName.trim();
  const displayName = prospect.displayName.trim();
  const city = prospect.city.trim();
  const country = prospect.country.trim();
  const notes = prospect.notes.trim();
  const location = [city, country].filter(Boolean).join(", ");
  const tags = prospect.tags ?? [];
  const hasTag = (searchedTag: string) =>
    tags.some((tag) => tag.toLowerCase() === searchedTag.toLowerCase());
  const tagInsights = [
    hasTag("Famille") ? "les voyages en famille" : "",
    hasTag("Bons plans") ? "les bons plans" : "",
    hasTag("Hôtel") || hasTag("Hotel") ? "le confort hôtel" : "",
    hasTag("Entrepreneur") || hasTag("Business") ? "la liberté et les projets autour du voyage" : "",
  ].filter(Boolean);

  return {
    greetingName: firstName || displayName || "",
    displayName,
    location,
    platform: prospect.mainPlatform,
    isWarmContact: prospect.temperature === "Chaud" || prospect.temperature === "Tiède",
    hasAvoidTag: hasTag("À éviter"),
    qualificationHint: tagInsights.length > 0 ? tagInsights.join(", ") : "",
    naturalNoteHint: getNaturalNoteHint(notes),
  };
}

function getMessageTunnelStepTemplate(situation: MessageAssistantSituation) {
  return (
    MESSAGE_TUNNEL_STEPS.find((messageStep) => messageStep.step === situation) ??
    MESSAGE_TUNNEL_STEPS[0]
  );
}

function getMessageAssistantObjective(situation: MessageAssistantSituation) {
  return `Objectif : ${getMessageTunnelStepTemplate(situation).objective}`;
}

function getMessageAssistantNextAction(situation: MessageAssistantSituation) {
  return getMessageTunnelStepTemplate(situation).nextAction;
}

function getMessageAssistantSuggestedFollowUpDays(situation: MessageAssistantSituation) {
  return getMessageTunnelStepTemplate(situation).suggestedFollowUpDays;
}

function formatSuggestedFollowUpLabel(daysToAdd: number | null) {
  if (daysToAdd === null) {
    return "Aucune relance automatique suggérée";
  }

  return `Relance suggérée : dans ${daysToAdd} jour${daysToAdd > 1 ? "s" : ""}`;
}

function getMessageAssistantSuggestedStatus(situation: MessageAssistantSituation) {
  return getMessageTunnelStepTemplate(situation).suggestedStatus;
}

function applyMessageAssistantContext(
  message: string,
  context: ReturnType<typeof buildMessageAssistantContext>,
) {
  const greeting = context.greetingName ? `Salut ${context.greetingName}, ` : "Salut, ";
  const platformMention = context.platform ? ` sur ${context.platform}` : "";
  const warmTemperatureMention = context.isWarmContact
    ? "Comme le sujet voyage semble déjà te parler, "
    : "";
  const qualificationQuestion = context.qualificationHint
    ? `Quand tu voyages, tu es plutôt sensible à ${context.qualificationHint}, ou tu cherches autre chose en priorité ?`
    : "Quand tu voyages, tu cherches plutôt les bons plans, le confort, ou les expériences qui sortent un peu du classique ?";

  return message
    .replaceAll("{greeting}", greeting)
    .replaceAll("{platformMention}", platformMention)
    .replaceAll("{naturalNoteHint}", context.naturalNoteHint)
    .replaceAll("{qualificationQuestion}", qualificationQuestion)
    .replaceAll("{warmTemperatureMention}", warmTemperatureMention);
}

function generateProspectMessage(
  prospect: Prospect,
  situation: MessageAssistantSituation,
  style: MessageAssistantStyle,
) {
  const context = buildMessageAssistantContext(prospect);
  const messageStep = getMessageTunnelStepTemplate(situation);
  const messageVariant =
    messageStep.variants.find((variant) => variant.tone === style) ??
    messageStep.variants[0];

  return applyMessageAssistantContext(
    messageVariant.assistantTemplate ?? messageVariant.message,
    context,
  );
}

export default function ProspectsPage () {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const csvImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const [formState, setFormState] = useState<ProspectFormState>(initialFormState);
  const [activeConversationProspectId, setActiveConversationProspectId] = useState<string | null>(null);
  const [conversationFormState, setConversationFormState] = useState<ConversationFormState>(
    initialConversationFormState,
  );
  const [activeQualificationProspectId, setActiveQualificationProspectId] = useState<string | null>(null);
  const [qualificationFormState, setQualificationFormState] = useState<QualificationFormState>(
    initialQualificationFormState,
  );
  const [activeFullProspectId, setActiveFullProspectId] = useState<string | null>(null);
  const [fullProspectFormState, setFullProspectFormState] = useState<FullProspectFormState>(
    initialFullProspectFormState,
  );
  const [activeMessageAssistantProspectId, setActiveMessageAssistantProspectId] = useState<string | null>(null);
  const [messageAssistantState, setMessageAssistantState] = useState<MessageAssistantState>(
    initialMessageAssistantState,
  );
  const [copiedQuickActionProspectId, setCopiedQuickActionProspectId] = useState<string | null>(null);
  const [copiedEmailProspectId, setCopiedEmailProspectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [prospectFilters, setProspectFilters] = useState<ProspectFilters>(initialProspectFilters);
  const [prospectSortOption, setProspectSortOption] = useState<ProspectSortOption>("createdAtDesc");
  const [prospectViewMode, setProspectViewMode] = useState<ProspectViewMode>("compact");
  const [prospectDisplayMode, setProspectDisplayMode] = useState<ProspectDisplayMode>("list");
  const [backupMessage, setBackupMessage] = useState("");
  const [isBackupError, setIsBackupError] = useState(false);
  const [duplicateMergeState, setDuplicateMergeState] = useState<DuplicateMergeState | null>(null);
  const [duplicateMergeMessage, setDuplicateMergeMessage] = useState("");
  const [resourceShareSelections, setResourceShareSelections] = useState<Record<string, string>>({});
  const [copiedSharedResourceProspectId, setCopiedSharedResourceProspectId] = useState<string | null>(null);
  const [addedSharedResourceProspectId, setAddedSharedResourceProspectId] = useState<string | null>(null);
  const [hasLoadedProspects, setHasLoadedProspects] = useState(false);
  const [focusedProspectId, setFocusedProspectId] = useState<string | null>(null);
  const [highlightedProspectId, setHighlightedProspectId] = useState<string | null>(null);

  useEffect(() => {
    const loadStoredProspects = window.setTimeout(() => {
      setProspects(loadProspects());
      setResources(loadResources());
      setHasLoadedProspects(true);
    }, 0);

    return () => window.clearTimeout(loadStoredProspects);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const prospectIdToFocus = searchParams.get("focus")?.trim();

    if (prospectIdToFocus) {
      const applyUrlFocus = window.setTimeout(() => {
        setFocusedProspectId(prospectIdToFocus);
      }, 0);

      return () => window.clearTimeout(applyUrlFocus);
    }
  }, []);

  function updateFormField<Field extends keyof ProspectFormState>(
    field: Field,
    value: ProspectFormState[Field],
  ) {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateConversationFormField<Field extends keyof ConversationFormState>(
    field: Field,
    value: ConversationFormState[Field],
  ) {
    setConversationFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateQualificationFormField<Field extends keyof QualificationFormState>(
    field: Field,
    value: QualificationFormState[Field],
  ) {
    setQualificationFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateFullProspectFormField<Field extends keyof FullProspectFormState>(
    field: Field,
    value: FullProspectFormState[Field],
  ) {
    setFullProspectFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateProspectFilter<Field extends keyof ProspectFilters>(
    field: Field,
    value: ProspectFilters[Field],
  ) {
    setProspectFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }));
  }

  function updateMessageAssistantField<Field extends "situation" | "style">(
    field: Field,
    value: MessageAssistantState[Field],
  ) {
    setMessageAssistantState((currentState) => ({
      ...currentState,
      [field]: value,
      copiedProspectId: null,
      addedHistoryProspectId: null,
      copiedResourceProspectId: null,
      copiedMessageWithResourceProspectId: null,
      suggestedFollowUpAppliedProspectId: null,
      suggestedStatusAppliedProspectId: null,
    }));
  }

  function updateMessageAssistantResource(resourceId: string) {
    setMessageAssistantState((currentState) => ({
      ...currentState,
      selectedResourceId: resourceId,
      copiedResourceProspectId: null,
      copiedMessageWithResourceProspectId: null,
    }));
  }

  function updateResourceShareSelection(prospectId: string, resourceId: string) {
    setResourceShareSelections((currentSelections) => ({
      ...currentSelections,
      [prospectId]: resourceId,
    }));
    setCopiedSharedResourceProspectId(null);
    setAddedSharedResourceProspectId(null);
  }

  function resetFilters() {
    setSearchQuery("");
    setProspectFilters(initialProspectFilters);
  }

  function toggleMessageAssistant(prospectId: string) {
    setActiveMessageAssistantProspectId((currentProspectId) =>
      currentProspectId === prospectId ? null : prospectId,
    );
    setMessageAssistantState(initialMessageAssistantState);
  }

  function toggleConversationForm(prospectId: string) {
    setActiveConversationProspectId((currentProspectId) =>
      currentProspectId === prospectId ? null : prospectId,
    );
    setConversationFormState(initialConversationFormState);
  }

  function toggleQualificationForm(prospect: Prospect) {
    if (activeQualificationProspectId === prospect.id) {
      setActiveQualificationProspectId(null);
      setQualificationFormState(initialQualificationFormState);
      return;
    }

    const interactionStats = prospect.interactionStats ?? {
      followerSinceDate: "",
      commentsCount: 0,
      interactionsCount: 0,
      likesCount: 0,
      messagesCount: 0,
    };

    setActiveQualificationProspectId(prospect.id);
    setQualificationFormState({
      status: prospect.status,
      category: prospect.category,
      temperature: prospect.temperature,
      colorType: prospect.colorType,
      nextActionDate: prospect.nextActionDate,
      notes: prospect.notes,
      isFollower: prospect.isFollower,
      hasSentMessage: prospect.hasSentMessage,
      followerSinceDate: interactionStats.followerSinceDate,
      commentsCount: String(interactionStats.commentsCount),
      interactionsCount: String(interactionStats.interactionsCount),
      likesCount: String(interactionStats.likesCount),
      messagesCount: String(interactionStats.messagesCount),
      tags: prospect.tags ?? [],
    });
  }

  function toggleFullProspectForm(prospect: Prospect) {
    if (activeFullProspectId === prospect.id) {
      setActiveFullProspectId(null);
      setFullProspectFormState(initialFullProspectFormState);
      return;
    }

    const interactionStats = prospect.interactionStats ?? {
      followerSinceDate: "",
      commentsCount: 0,
      interactionsCount: 0,
      likesCount: 0,
      messagesCount: 0,
    };

    setActiveFullProspectId(prospect.id);
    setFullProspectFormState({
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      displayName: prospect.displayName,
      jobTitle: prospect.jobTitle,
      businessArea: prospect.businessArea,
      mainPlatform: prospect.mainPlatform,
      profileUrl: prospect.profileUrl,
      category: prospect.category,
      status: prospect.status,
      temperature: prospect.temperature,
      colorType: prospect.colorType,
      city: prospect.city,
      region: prospect.region,
      country: prospect.country,
      phone: prospect.phone,
      whatsapp: prospect.whatsapp,
      email: prospect.email,
      facebookUrl: prospect.socialLinks.facebook,
      instagramUrl: prospect.socialLinks.instagram,
      linkedinUrl: prospect.socialLinks.linkedin,
      tiktokUrl: prospect.socialLinks.tiktok,
      youtubeUrl: prospect.socialLinks.youtube,
      otherUrl: prospect.socialLinks.other,
      isFollower: prospect.isFollower,
      hasSentMessage: prospect.hasSentMessage,
      followerSinceDate: interactionStats.followerSinceDate,
      commentsCount: String(interactionStats.commentsCount),
      interactionsCount: String(interactionStats.interactionsCount),
      likesCount: String(interactionStats.likesCount),
      messagesCount: String(interactionStats.messagesCount),
      nextActionDate: prospect.nextActionDate,
      tags: prospect.tags ?? [],
      notes: prospect.notes,
    });
  }

  function openFullProspectFromPipeline(prospect: Prospect) {
    setProspectDisplayMode("list");
    setProspectViewMode("detailed");

    if (activeFullProspectId !== prospect.id) {
      toggleFullProspectForm(prospect);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const now = new Date().toISOString();
    const commentsCount = Number(formState.commentsCount);
    const interactionsCount = Number(formState.interactionsCount);
    const likesCount = Number(formState.likesCount);
    const messagesCount = Number(formState.messagesCount);
    const newProspectBase: Prospect = {
      id: createProspectId(),
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      displayName: formState.displayName.trim(),
      jobTitle: formState.jobTitle.trim(),
      businessArea: formState.businessArea.trim(),
      city: formState.city.trim(),
      region: formState.region.trim(),
      country: formState.country.trim(),
      phone: formState.phone.trim(),
      whatsapp: formState.whatsapp.trim(),
      email: formState.email.trim(),
      mainPlatform: formState.mainPlatform,
      profileUrl: formState.profileUrl.trim(),
      socialLinks: {
        facebook: formState.facebookUrl.trim(),
        instagram: formState.instagramUrl.trim(),
        linkedin: formState.linkedinUrl.trim(),
        tiktok: formState.tiktokUrl.trim(),
        youtube: formState.youtubeUrl.trim(),
        other: formState.otherUrl.trim(),
      },
      category: formState.category,
      status: "À contacter",
      temperature: formState.temperature,
      colorType: formState.colorType,
      score: 0,
      tags: formState.tags,
      isFollower: formState.isFollower,
      hasSentMessage: formState.hasSentMessage,
      interactionStats: {
        followerSinceDate: formState.followerSinceDate,
        commentsCount: Number.isNaN(commentsCount) ? 0 : commentsCount,
        interactionsCount: Number.isNaN(interactionsCount) ? 0 : interactionsCount,
        likesCount: Number.isNaN(likesCount) ? 0 : likesCount,
        messagesCount: Number.isNaN(messagesCount) ? 0 : messagesCount,
      },
      lastInteractionDate: "",
      nextActionDate: "",
      conversationHistory: [],
      notes: formState.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    const newProspect: Prospect = {
      ...newProspectBase,
      score: calculateProspectScore(newProspectBase),
    };
    const hasPotentialDuplicate = findPotentialDuplicates([newProspect, ...prospects]).some(
      (duplicateGroup) =>
        duplicateGroup.prospects.some((prospect) => prospect.id === newProspect.id),
    );

    if (hasPotentialDuplicate) {
      const confirmed = window.confirm(
        "Un doublon potentiel existe déjà. Ajouter quand même ce prospect ?",
      );

      if (!confirmed) {
        return;
      }
    }

    const updatedProspects = [newProspect, ...prospects];
    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setFormState(initialFormState);
    setIsFormVisible(false);
  }

  function handleConversationSubmit(
    prospectId: string,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const newConversationEntry: ConversationEntry = {
      id: createProspectId(),
      date: conversationFormState.date,
      channel: conversationFormState.channel,
      content: conversationFormState.content.trim(),
      nextAction: conversationFormState.nextAction.trim(),
    };

    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      return {
        ...prospect,
        conversationHistory: [
          ...prospect.conversationHistory,
          newConversationEntry,
        ],
        lastInteractionDate: conversationFormState.date,
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setConversationFormState(initialConversationFormState);
    setActiveConversationProspectId(null);
  }

  function handleQualificationSubmit(
    prospectId: string,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const commentsCount = Number(qualificationFormState.commentsCount);
    const interactionsCount = Number(qualificationFormState.interactionsCount);
    const likesCount = Number(qualificationFormState.likesCount);
    const messagesCount = Number(qualificationFormState.messagesCount);
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      const updatedProspect: Prospect = {
        ...prospect,
        status: qualificationFormState.status,
        category: qualificationFormState.category,
        temperature: qualificationFormState.temperature,
        colorType: qualificationFormState.colorType,
        nextActionDate: qualificationFormState.nextActionDate,
        notes: qualificationFormState.notes.trim(),
        isFollower: qualificationFormState.isFollower,
        hasSentMessage: qualificationFormState.hasSentMessage,
        interactionStats: {
          followerSinceDate: qualificationFormState.followerSinceDate,
          commentsCount: Number.isNaN(commentsCount) ? 0 : commentsCount,
          interactionsCount: Number.isNaN(interactionsCount) ? 0 : interactionsCount,
          likesCount: Number.isNaN(likesCount) ? 0 : likesCount,
        messagesCount: Number.isNaN(messagesCount) ? 0 : messagesCount,
      },
        tags: qualificationFormState.tags,
        updatedAt: new Date().toISOString(),
      };

      return {
        ...updatedProspect,
        score: calculateProspectScore(updatedProspect),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setActiveQualificationProspectId(null);
    setQualificationFormState(initialQualificationFormState);
  }

  function handleFullProspectSubmit(
    prospectId: string,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const commentsCount = Number(fullProspectFormState.commentsCount);
    const interactionsCount = Number(fullProspectFormState.interactionsCount);
    const likesCount = Number(fullProspectFormState.likesCount);
    const messagesCount = Number(fullProspectFormState.messagesCount);
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      const updatedProspect: Prospect = {
        ...prospect,
        firstName: fullProspectFormState.firstName.trim(),
        lastName: fullProspectFormState.lastName.trim(),
        displayName: fullProspectFormState.displayName.trim(),
        jobTitle: fullProspectFormState.jobTitle.trim(),
        businessArea: fullProspectFormState.businessArea.trim(),
        city: fullProspectFormState.city.trim(),
        region: fullProspectFormState.region.trim(),
        country: fullProspectFormState.country.trim(),
        phone: fullProspectFormState.phone.trim(),
        whatsapp: fullProspectFormState.whatsapp.trim(),
        email: fullProspectFormState.email.trim(),
        mainPlatform: fullProspectFormState.mainPlatform,
        profileUrl: fullProspectFormState.profileUrl.trim(),
        socialLinks: {
          facebook: fullProspectFormState.facebookUrl.trim(),
          instagram: fullProspectFormState.instagramUrl.trim(),
          linkedin: fullProspectFormState.linkedinUrl.trim(),
          tiktok: fullProspectFormState.tiktokUrl.trim(),
          youtube: fullProspectFormState.youtubeUrl.trim(),
          other: fullProspectFormState.otherUrl.trim(),
        },
        category: fullProspectFormState.category,
        status: fullProspectFormState.status,
        temperature: fullProspectFormState.temperature,
        colorType: fullProspectFormState.colorType,
        isFollower: fullProspectFormState.isFollower,
        hasSentMessage: fullProspectFormState.hasSentMessage,
        interactionStats: {
          followerSinceDate: fullProspectFormState.followerSinceDate,
          commentsCount: Number.isNaN(commentsCount) ? 0 : commentsCount,
          interactionsCount: Number.isNaN(interactionsCount) ? 0 : interactionsCount,
          likesCount: Number.isNaN(likesCount) ? 0 : likesCount,
          messagesCount: Number.isNaN(messagesCount) ? 0 : messagesCount,
        },
        nextActionDate: fullProspectFormState.nextActionDate,
        tags: fullProspectFormState.tags,
        notes: fullProspectFormState.notes.trim(),
        updatedAt: new Date().toISOString(),
      };

      return {
        ...updatedProspect,
        score: calculateProspectScore(updatedProspect),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setActiveFullProspectId(null);
    setFullProspectFormState(initialFullProspectFormState);
  }

  function deleteProspectAfterConfirmation(prospectId: string, confirmationMessage: string) {
    const confirmed = window.confirm(confirmationMessage);

    if (!confirmed) {
      return;
    }

    const updatedProspects = prospects.filter((prospect) => prospect.id !== prospectId);
    saveProspects(updatedProspects);
    setProspects(updatedProspects);

    if (activeConversationProspectId === prospectId) {
      setActiveConversationProspectId(null);
      setConversationFormState(initialConversationFormState);
    }

    if (activeQualificationProspectId === prospectId) {
      setActiveQualificationProspectId(null);
      setQualificationFormState(initialQualificationFormState);
    }

    if (activeFullProspectId === prospectId) {
      setActiveFullProspectId(null);
      setFullProspectFormState(initialFullProspectFormState);
    }

    if (activeMessageAssistantProspectId === prospectId) {
      setActiveMessageAssistantProspectId(null);
      setMessageAssistantState(initialMessageAssistantState);
    }
  }

  function handleDeleteProspect(prospectId: string) {
    deleteProspectAfterConfirmation(
      prospectId,
      "Supprimer ce prospect ? Cette action est définitive.",
    );
  }

  function handleDeletePotentialDuplicate(prospectId: string) {
    deleteProspectAfterConfirmation(
      prospectId,
      "Supprimer ce doublon potentiel ? Cette action est définitive.",
    );
  }

  function handleViewPotentialDuplicate(prospect: Prospect) {
    setProspectDisplayMode("list");
    setProspectViewMode("detailed");

    if (activeFullProspectId !== prospect.id) {
      toggleFullProspectForm(prospect);
    }
  }

  function handleOpenDuplicateMerge(duplicateGroup: PotentialDuplicateGroup) {
    const keepProspect = duplicateGroup.prospects[0];
    const mergeProspect = duplicateGroup.prospects[1] ?? duplicateGroup.prospects[0];

    setDuplicateMergeState({
      groupId: duplicateGroup.id,
      keepProspectId: keepProspect.id,
      mergeProspectId: mergeProspect.id,
    });
    setDuplicateMergeMessage("");
  }

  function updateDuplicateMergeField<Field extends keyof Omit<DuplicateMergeState, "groupId">>(
    field: Field,
    value: DuplicateMergeState[Field],
  ) {
    setDuplicateMergeState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const nextState = {
        ...currentState,
        [field]: value,
      };

      return nextState;
    });
    setDuplicateMergeMessage("");
  }

  function handleCancelDuplicateMerge() {
    setDuplicateMergeState(null);
  }

  function handleConfirmDuplicateMerge() {
    if (!duplicateMergeState || duplicateMergeState.keepProspectId === duplicateMergeState.mergeProspectId) {
      return;
    }

    const keptProspect = prospects.find((prospect) => prospect.id === duplicateMergeState.keepProspectId);
    const mergedProspect = prospects.find((prospect) => prospect.id === duplicateMergeState.mergeProspectId);

    if (!keptProspect || !mergedProspect) {
      return;
    }

    const confirmed = window.confirm(
      "Fusionner ces deux fiches ? La fiche fusionnée sera supprimée après récupération des informations utiles.",
    );

    if (!confirmed) {
      return;
    }

    const enrichedProspect = mergeProspectData(keptProspect, mergedProspect);
    const updatedProspects = prospects
      .filter((prospect) => prospect.id !== mergedProspect.id)
      .map((prospect) => (prospect.id === keptProspect.id ? enrichedProspect : prospect));

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setDuplicateMergeState(null);
    setDuplicateMergeMessage("Fusion effectuée avec succès.");

    if (activeConversationProspectId === mergedProspect.id) {
      setActiveConversationProspectId(null);
      setConversationFormState(initialConversationFormState);
    }

    if (activeQualificationProspectId === mergedProspect.id) {
      setActiveQualificationProspectId(null);
      setQualificationFormState(initialQualificationFormState);
    }

    if (activeFullProspectId === mergedProspect.id) {
      setActiveFullProspectId(null);
      setFullProspectFormState(initialFullProspectFormState);
    }

    if (activeMessageAssistantProspectId === mergedProspect.id) {
      setActiveMessageAssistantProspectId(null);
      setMessageAssistantState(initialMessageAssistantState);
    }
  }

  function handleMarkAsFollowedUp(prospectId: string) {
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      return {
        ...prospect,
        nextActionDate: "",
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
  }

  function updateQuickFollowUpDate(prospectId: string, nextActionDate: string) {
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      return {
        ...prospect,
        nextActionDate,
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);

    if (activeQualificationProspectId === prospectId) {
      setQualificationFormState((currentFormState) => ({
        ...currentFormState,
        nextActionDate,
      }));
    }

    if (activeFullProspectId === prospectId) {
      setFullProspectFormState((currentFormState) => ({
        ...currentFormState,
        nextActionDate,
      }));
    }
  }

  function updateProspectStatus(prospectId: string, nextStatus: Prospect["status"]) {
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      const updatedProspect: Prospect = {
        ...prospect,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };

      return {
        ...updatedProspect,
        score: calculateProspectScore(updatedProspect),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
  }

  function handleMoveProspectToNextStatus(prospect: Prospect) {
    const currentStatusIndex = PROSPECT_STATUSES.indexOf(prospect.status);

    if (currentStatusIndex < 0 || currentStatusIndex >= PROSPECT_STATUSES.length - 1) {
      return;
    }

    updateProspectStatus(prospect.id, PROSPECT_STATUSES[currentStatusIndex + 1]);
  }

  function handleGenerateProspectMessage(prospect: Prospect) {
    setMessageAssistantState((currentState) => ({
      ...currentState,
      generatedMessage: generateProspectMessage(
        prospect,
        currentState.situation,
        currentState.style,
      ),
      copiedProspectId: null,
      addedHistoryProspectId: null,
      copiedResourceProspectId: null,
      copiedMessageWithResourceProspectId: null,
      suggestedFollowUpAppliedProspectId: null,
      suggestedStatusAppliedProspectId: null,
    }));
  }

  async function handleCopyAssistantResourceLink(prospectId: string, resource: Resource) {
    if (!resource.url || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(resource.url);
    setMessageAssistantState((currentState) => ({
      ...currentState,
      copiedResourceProspectId: prospectId,
    }));
    window.setTimeout(() => {
      setMessageAssistantState((currentState) => ({
        ...currentState,
        copiedResourceProspectId:
          currentState.copiedResourceProspectId === prospectId
            ? null
            : currentState.copiedResourceProspectId,
      }));
    }, 1800);
  }

  async function handleCopyMessageWithResource(prospectId: string, resource: Resource) {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(
      buildMessageWithResource(messageAssistantState.generatedMessage, resource),
    );
    setMessageAssistantState((currentState) => ({
      ...currentState,
      copiedMessageWithResourceProspectId: prospectId,
    }));
    window.setTimeout(() => {
      setMessageAssistantState((currentState) => ({
        ...currentState,
        copiedMessageWithResourceProspectId:
          currentState.copiedMessageWithResourceProspectId === prospectId
            ? null
            : currentState.copiedMessageWithResourceProspectId,
      }));
    }, 1800);
  }

  function handleApplySuggestedFollowUp(prospect: Prospect) {
    const suggestedFollowUpDays = getMessageAssistantSuggestedFollowUpDays(messageAssistantState.situation);

    if (suggestedFollowUpDays === null) {
      return;
    }

    const nextActionDate = getFutureDateString(suggestedFollowUpDays);
    const updatedProspects = prospects.map((currentProspect) => {
      if (currentProspect.id !== prospect.id) {
        return currentProspect;
      }

      return {
        ...currentProspect,
        nextActionDate,
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);

    if (activeQualificationProspectId === prospect.id) {
      setQualificationFormState((currentFormState) => ({
        ...currentFormState,
        nextActionDate,
      }));
    }

    if (activeFullProspectId === prospect.id) {
      setFullProspectFormState((currentFormState) => ({
        ...currentFormState,
        nextActionDate,
      }));
    }

    setMessageAssistantState((currentState) => ({
      ...currentState,
      suggestedFollowUpAppliedProspectId: prospect.id,
    }));
    window.setTimeout(() => {
      setMessageAssistantState((currentState) => ({
        ...currentState,
        suggestedFollowUpAppliedProspectId:
          currentState.suggestedFollowUpAppliedProspectId === prospect.id
            ? null
            : currentState.suggestedFollowUpAppliedProspectId,
      }));
    }, 1800);
  }

  function handleApplySuggestedStatus(prospect: Prospect) {
    const suggestedStatus = getMessageAssistantSuggestedStatus(messageAssistantState.situation);

    if (suggestedStatus === null) {
      return;
    }

    const updatedProspects = prospects.map((currentProspect) => {
      if (currentProspect.id !== prospect.id) {
        return currentProspect;
      }

      const updatedProspect: Prospect = {
        ...currentProspect,
        status: suggestedStatus,
        updatedAt: new Date().toISOString(),
      };

      return {
        ...updatedProspect,
        score: calculateProspectScore(updatedProspect),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);

    if (activeQualificationProspectId === prospect.id) {
      setQualificationFormState((currentFormState) => ({
        ...currentFormState,
        status: suggestedStatus,
      }));
    }

    if (activeFullProspectId === prospect.id) {
      setFullProspectFormState((currentFormState) => ({
        ...currentFormState,
        status: suggestedStatus,
      }));
    }

    setMessageAssistantState((currentState) => ({
      ...currentState,
      suggestedStatusAppliedProspectId: prospect.id,
    }));
    window.setTimeout(() => {
      setMessageAssistantState((currentState) => ({
        ...currentState,
        suggestedStatusAppliedProspectId:
          currentState.suggestedStatusAppliedProspectId === prospect.id
            ? null
            : currentState.suggestedStatusAppliedProspectId,
      }));
    }, 1800);
  }

  async function handleCopyProspectMessage(prospectId: string) {
    if (!messageAssistantState.generatedMessage || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(messageAssistantState.generatedMessage);
    setMessageAssistantState((currentState) => ({
      ...currentState,
      copiedProspectId: prospectId,
    }));
  }

  function handleAddGeneratedMessageToHistory(prospect: Prospect) {
    if (!messageAssistantState.generatedMessage.trim()) {
      return;
    }

    const selectedResource = resources.find(
      (resource) => resource.id === messageAssistantState.selectedResourceId,
    );
    const today = getTodayDateString();
    const newConversationEntry: ConversationEntry = {
      id: createProspectId(),
      date: today,
      channel: prospect.mainPlatform,
      content: selectedResource
        ? buildConversationContentWithResource(
            messageAssistantState.generatedMessage,
            selectedResource,
          )
        : messageAssistantState.generatedMessage.trim(),
      nextAction: getMessageAssistantNextAction(messageAssistantState.situation),
    };
    const updatedProspects = prospects.map((currentProspect) => {
      if (currentProspect.id !== prospect.id) {
        return currentProspect;
      }

      return {
        ...currentProspect,
        conversationHistory: [
          ...(currentProspect.conversationHistory ?? []),
          newConversationEntry,
        ],
        lastInteractionDate: today,
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setMessageAssistantState((currentState) => ({
      ...currentState,
      addedHistoryProspectId: prospect.id,
    }));
    window.setTimeout(() => {
      setMessageAssistantState((currentState) => ({
        ...currentState,
        addedHistoryProspectId:
          currentState.addedHistoryProspectId === prospect.id
            ? null
            : currentState.addedHistoryProspectId,
      }));
    }, 1800);
  }

  async function handleCopyProfileLink(prospectId: string, profileUrl: string) {
    if (!profileUrl || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(profileUrl);
    setCopiedQuickActionProspectId(prospectId);
    window.setTimeout(() => {
      setCopiedQuickActionProspectId((currentProspectId) =>
        currentProspectId === prospectId ? null : currentProspectId,
      );
    }, 1800);
  }

  async function handleCopyEmail(prospectId: string, emailAddress: string) {
    if (!emailAddress || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(emailAddress);
    setCopiedEmailProspectId(prospectId);
    window.setTimeout(() => {
      setCopiedEmailProspectId((currentProspectId) =>
        currentProspectId === prospectId ? null : currentProspectId,
      );
    }, 1800);
  }

  async function handleCopySharedResourceLink(prospectId: string, resource: Resource) {
    if (!resource.url || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(resource.url);
    setCopiedSharedResourceProspectId(prospectId);
    window.setTimeout(() => {
      setCopiedSharedResourceProspectId((currentProspectId) =>
        currentProspectId === prospectId ? null : currentProspectId,
      );
    }, 1800);
  }

  function handleAddSharedResourceToHistory(prospect: Prospect, resource: Resource) {
    const today = getTodayDateString();
    const newConversationEntry: ConversationEntry = {
      id: createProspectId(),
      date: today,
      channel: prospect.mainPlatform,
      content: `Ressource partagée : ${resource.title} - ${resource.url}`,
      nextAction: "",
    };
    const updatedProspects = prospects.map((currentProspect) => {
      if (currentProspect.id !== prospect.id) {
        return currentProspect;
      }

      return {
        ...currentProspect,
        conversationHistory: [
          ...(currentProspect.conversationHistory ?? []),
          newConversationEntry,
        ],
        lastInteractionDate: today,
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setAddedSharedResourceProspectId(prospect.id);
    window.setTimeout(() => {
      setAddedSharedResourceProspectId((currentProspectId) =>
        currentProspectId === prospect.id ? null : currentProspectId,
      );
    }, 1800);
  }

  function handleExportProspects() {
    const today = getTodayDateString();
    const backupJson = JSON.stringify(prospects, null, 2);
    const backupBlob = new Blob([backupJson], { type: "application/json" });
    const backupUrl = URL.createObjectURL(backupBlob);
    const downloadLink = document.createElement("a");

    downloadLink.href = backupUrl;
    downloadLink.download = `travel-prospect-crm-backup-${today}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(backupUrl);
    setBackupMessage("");
    setIsBackupError(false);
  }

  function handleExportProspectsCsv() {
    const today = getTodayDateString();
    const csvRows = prospects.map((prospect) => {
      const interactionStats = prospect.interactionStats ?? {
        followerSinceDate: "",
        commentsCount: 0,
        interactionsCount: 0,
        likesCount: 0,
        messagesCount: 0,
      };
      const csvValues: Record<(typeof PROSPECT_CSV_COLUMNS)[number], string | number | boolean> = {
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        displayName: prospect.displayName,
        jobTitle: prospect.jobTitle,
        businessArea: prospect.businessArea,
        city: prospect.city,
        region: prospect.region,
        country: prospect.country,
        phone: prospect.phone,
        whatsapp: prospect.whatsapp,
        email: prospect.email,
        mainPlatform: prospect.mainPlatform,
        profileUrl: prospect.profileUrl,
        facebook: prospect.socialLinks.facebook,
        instagram: prospect.socialLinks.instagram,
        linkedin: prospect.socialLinks.linkedin,
        tiktok: prospect.socialLinks.tiktok,
        youtube: prospect.socialLinks.youtube,
        otherLink: prospect.socialLinks.other,
        category: prospect.category,
        status: prospect.status,
        temperature: prospect.temperature,
        colorType: prospect.colorType,
        score: prospect.score,
        tags: (prospect.tags ?? []).join("|"),
        isFollower: prospect.isFollower,
        hasSentMessage: prospect.hasSentMessage,
        followerSinceDate: interactionStats.followerSinceDate,
        commentsCount: interactionStats.commentsCount,
        interactionsCount: interactionStats.interactionsCount,
        likesCount: interactionStats.likesCount,
        messagesCount: interactionStats.messagesCount,
        lastInteractionDate: prospect.lastInteractionDate,
        nextActionDate: prospect.nextActionDate,
        notes: prospect.notes,
      };

      return PROSPECT_CSV_COLUMNS.map((column) => escapeCsvValue(csvValues[column])).join(",");
    });
    const csvContent = [
      PROSPECT_CSV_COLUMNS.join(","),
      ...csvRows,
    ].join("\r\n");
    const csvBlob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const downloadLink = document.createElement("a");

    downloadLink.href = csvUrl;
    downloadLink.download = `travel-prospect-crm-prospects-${today}.csv`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(csvUrl);
    setBackupMessage("");
    setIsBackupError(false);
  }

  function resetImportFileInput() {
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  }

  function resetCsvImportFileInput() {
    if (csvImportFileInputRef.current) {
      csvImportFileInputRef.current.value = "";
    }
  }

  function showInvalidImportMessage() {
    setBackupMessage("Fichier invalide. Import impossible.");
    setIsBackupError(true);
  }

  function showInvalidCsvImportMessage() {
    setBackupMessage("CSV invalide. Import impossible.");
    setIsBackupError(true);
  }

  function buildProspectFromCsvRow(
    headerIndexes: Record<string, number>,
    row: string[],
    now: string,
  ) {
    const getCell = (column: (typeof PROSPECT_CSV_COLUMNS)[number]) =>
      normalizeCsvCell(row[headerIndexes[column]]);
    const importedTags = getCell("tags")
      .split("|")
      .map((tag) => tag.trim())
      .filter((tag): tag is Prospect["tags"][number] =>
        PROSPECT_TAGS.includes(tag as Prospect["tags"][number]),
      );
    const prospectBase: Prospect = {
      id: createProspectId(),
      firstName: getCell("firstName"),
      lastName: getCell("lastName"),
      displayName: getCell("displayName"),
      jobTitle: getCell("jobTitle"),
      businessArea: getCell("businessArea"),
      city: getCell("city"),
      region: getCell("region"),
      country: getCell("country"),
      phone: getCell("phone"),
      whatsapp: getCell("whatsapp"),
      email: getCell("email"),
      mainPlatform: pickAllowedCsvValue(
        getCell("mainPlatform"),
        SOCIAL_PLATFORMS,
        SOCIAL_PLATFORMS[0],
      ),
      profileUrl: getCell("profileUrl"),
      socialLinks: {
        facebook: getCell("facebook"),
        instagram: getCell("instagram"),
        linkedin: getCell("linkedin"),
        tiktok: getCell("tiktok"),
        youtube: getCell("youtube"),
        other: getCell("otherLink"),
      },
      category: pickAllowedCsvValue(
        getCell("category"),
        PROSPECT_CATEGORIES,
        PROSPECT_CATEGORIES[0],
      ),
      status: pickAllowedCsvValue(
        getCell("status"),
        PROSPECT_STATUSES,
        PROSPECT_STATUSES[0],
      ),
      temperature: pickAllowedCsvValue(
        getCell("temperature"),
        PROSPECT_TEMPERATURES,
        PROSPECT_TEMPERATURES[0],
      ),
      colorType: pickAllowedCsvValue(
        getCell("colorType"),
        PROSPECT_COLOR_TYPES,
        PROSPECT_COLOR_TYPES[0],
      ),
      score: normalizeCsvNumber(getCell("score")),
      tags: importedTags,
      isFollower: normalizeCsvBoolean(getCell("isFollower")),
      hasSentMessage: normalizeCsvBoolean(getCell("hasSentMessage")),
      interactionStats: {
        followerSinceDate: getCell("followerSinceDate"),
        commentsCount: normalizeCsvNumber(getCell("commentsCount")),
        interactionsCount: normalizeCsvNumber(getCell("interactionsCount")),
        likesCount: normalizeCsvNumber(getCell("likesCount")),
        messagesCount: normalizeCsvNumber(getCell("messagesCount")),
      },
      lastInteractionDate: getCell("lastInteractionDate"),
      nextActionDate: getCell("nextActionDate"),
      conversationHistory: [],
      notes: getCell("notes"),
      createdAt: now,
      updatedAt: now,
    };

    return {
      ...prospectBase,
      score: calculateProspectScore(prospectBase),
    };
  }

  function handleImportProspectsCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      showInvalidCsvImportMessage();
      resetCsvImportFileInput();
      return;
    }

    const fileReader = new FileReader();

    fileReader.onload = () => {
      try {
        const csvRows = parseCsvRows(String(fileReader.result).replace(/^\uFEFF/, ""));

        if (!csvRows || csvRows.length < 2) {
          showInvalidCsvImportMessage();
          resetCsvImportFileInput();
          return;
        }

        const header = csvRows[0].map((columnName) => columnName.trim());
        const headerIndexes = PROSPECT_CSV_COLUMNS.reduce(
          (indexes, columnName) => ({
            ...indexes,
            [columnName]: header.indexOf(columnName),
          }),
          {} as Record<(typeof PROSPECT_CSV_COLUMNS)[number], number>,
        );
        const hasKnownColumn = PROSPECT_CSV_COLUMNS.some(
          (columnName) => headerIndexes[columnName] >= 0,
        );

        if (!hasKnownColumn) {
          showInvalidCsvImportMessage();
          resetCsvImportFileInput();
          return;
        }

        const confirmed = window.confirm(
          "Importer ce CSV ? Les prospects seront ajoutés à la liste actuelle.",
        );

        if (!confirmed) {
          resetCsvImportFileInput();
          return;
        }

        const now = new Date().toISOString();
        const importedProspects = csvRows
          .slice(1)
          .filter((row) => row.some((cell) => cell.trim()))
          .map((row) => buildProspectFromCsvRow(headerIndexes, row, now));

        if (importedProspects.length === 0) {
          showInvalidCsvImportMessage();
          resetCsvImportFileInput();
          return;
        }

        const updatedProspects = [...importedProspects, ...prospects];

        saveProspects(updatedProspects);
        setProspects(updatedProspects);
        setActiveConversationProspectId(null);
        setConversationFormState(initialConversationFormState);
        setActiveQualificationProspectId(null);
        setQualificationFormState(initialQualificationFormState);
        setActiveFullProspectId(null);
        setFullProspectFormState(initialFullProspectFormState);
        setActiveMessageAssistantProspectId(null);
        setMessageAssistantState(initialMessageAssistantState);
        setBackupMessage("CSV importé avec succès.");
        setIsBackupError(false);
        resetCsvImportFileInput();
      } catch {
        showInvalidCsvImportMessage();
        resetCsvImportFileInput();
      }
    };

    fileReader.onerror = () => {
      showInvalidCsvImportMessage();
      resetCsvImportFileInput();
    };

    fileReader.readAsText(selectedFile);
  }

  function handleImportProspects(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".json")) {
      showInvalidImportMessage();
      resetImportFileInput();
      return;
    }

    const fileReader = new FileReader();

    fileReader.onload = () => {
      try {
        const parsedBackup = JSON.parse(String(fileReader.result));

        if (!Array.isArray(parsedBackup)) {
          showInvalidImportMessage();
          resetImportFileInput();
          return;
        }

        const confirmed = window.confirm(
          "Importer cette sauvegarde ? Les prospects actuels seront remplacés.",
        );

        if (!confirmed) {
          resetImportFileInput();
          return;
        }

        const importedProspects = parsedBackup as Prospect[];

        saveProspects(importedProspects);
        setProspects(importedProspects);
        setActiveConversationProspectId(null);
        setConversationFormState(initialConversationFormState);
        setActiveQualificationProspectId(null);
        setQualificationFormState(initialQualificationFormState);
        setActiveFullProspectId(null);
        setFullProspectFormState(initialFullProspectFormState);
        setActiveMessageAssistantProspectId(null);
        setMessageAssistantState(initialMessageAssistantState);
        setBackupMessage("Sauvegarde importée avec succès.");
        setIsBackupError(false);
        resetImportFileInput();
      } catch {
        showInvalidImportMessage();
        resetImportFileInput();
      }
    };

    fileReader.onerror = () => {
      showInvalidImportMessage();
      resetImportFileInput();
    };

    fileReader.readAsText(selectedFile);
  }

  function renderQuickFollowUpControls(prospect: Prospect, isCompact = false) {
    return (
      <div
        className={
          isCompact
            ? "mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3"
            : "mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Relance rapide
          </p>
          {prospect.nextActionDate ? (
            <p className="text-xs font-semibold text-sky-200">
              Relance prévue : {prospect.nextActionDate}
            </p>
          ) : null}
        </div>

        <div className={isCompact ? "mt-2 grid grid-cols-2 gap-2" : "mt-3 flex flex-wrap gap-2"}>
          <button
            className="min-h-10 rounded-full border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
            type="button"
            onClick={() => updateQuickFollowUpDate(prospect.id, getFutureDateString(1))}
          >
            Demain
          </button>
          <button
            className="min-h-10 rounded-full border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
            type="button"
            onClick={() => updateQuickFollowUpDate(prospect.id, getFutureDateString(3))}
          >
            +3 jours
          </button>
          <button
            className="min-h-10 rounded-full border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
            type="button"
            onClick={() => updateQuickFollowUpDate(prospect.id, getFutureDateString(7))}
          >
            +7 jours
          </button>
          <button
            className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
            type="button"
            onClick={() => updateQuickFollowUpDate(prospect.id, "")}
          >
            Effacer
          </button>
        </div>
      </div>
    );
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const todayDate = getTodayDateString();
  const followUpProspects = prospects
    .filter((prospect) => prospect.nextActionDate.trim())
    .sort((firstProspect, secondProspect) =>
      compareDateStrings(firstProspect.nextActionDate, secondProspect.nextActionDate),
    );
  const filteredProspects = prospects.filter((prospect) => {
    const searchableText = [
      prospect.firstName,
      prospect.lastName,
      prospect.displayName,
      prospect.jobTitle,
      prospect.businessArea,
      prospect.city,
      prospect.region,
      prospect.country,
      prospect.email,
      prospect.phone,
      prospect.whatsapp,
      prospect.notes,
      ...(prospect.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !normalizedSearchQuery || searchableText.includes(normalizedSearchQuery);
    const matchesPlatform =
      prospectFilters.platform === "Tous" || prospect.mainPlatform === prospectFilters.platform;
    const matchesStatus =
      prospectFilters.status === "Tous" || prospect.status === prospectFilters.status;
    const matchesCategory =
      prospectFilters.category === "Tous" || prospect.category === prospectFilters.category;
    const matchesTemperature =
      prospectFilters.temperature === "Tous" || prospect.temperature === prospectFilters.temperature;
    const matchesColorType =
      prospectFilters.colorType === "Tous" || prospect.colorType === prospectFilters.colorType;
    const matchesTag =
      prospectFilters.tag === "Tous" || (prospect.tags ?? []).includes(prospectFilters.tag);

    return (
      matchesSearch &&
      matchesPlatform &&
      matchesStatus &&
      matchesCategory &&
      matchesTemperature &&
      matchesColorType &&
      matchesTag
    );
  });
  const sortedProspects = [...filteredProspects].sort((firstProspect, secondProspect) => {
    if (prospectSortOption === "scoreDesc") {
      return secondProspect.score - firstProspect.score;
    }

    if (prospectSortOption === "nextActionDate") {
      return compareDateStrings(
        firstProspect.nextActionDate || "9999-12-31",
        secondProspect.nextActionDate || "9999-12-31",
      );
    }

    if (prospectSortOption === "nameAsc") {
      return getProspectDisplayName(firstProspect).localeCompare(
        getProspectDisplayName(secondProspect),
        "fr",
        { sensitivity: "base" },
      );
    }

    if (prospectSortOption === "temperatureHotFirst") {
      return (
        getTemperatureSortRank(firstProspect.temperature) -
        getTemperatureSortRank(secondProspect.temperature)
      );
    }

    return compareDateStrings(
      secondProspect.createdAt || "",
      firstProspect.createdAt || "",
    );
  });
  const pipelineProspectsByStatus = PROSPECT_STATUSES.reduce(
    (groupedProspects, status) => {
      groupedProspects[status] = filteredProspects
        .filter((prospect) => prospect.status === status)
        .sort((firstProspect, secondProspect) => {
          if (firstProspect.score !== secondProspect.score) {
            return secondProspect.score - firstProspect.score;
          }

          return compareDateStrings(
            firstProspect.nextActionDate || "9999-12-31",
            secondProspect.nextActionDate || "9999-12-31",
          );
        });

      return groupedProspects;
    },
    {} as Record<Prospect["status"], Prospect[]>,
  );
  const isDetailedView = prospectViewMode === "detailed";
  const isPipelineView = prospectDisplayMode === "pipeline";
  const potentialDuplicateGroups = findPotentialDuplicates(prospects);
  const sortedResources = getSortedResources(resources);
  const filteredProspectIds = filteredProspects
    .map((prospect) => prospect.id)
    .join("\u0000");
  const focusedProspect = focusedProspectId
    ? prospects.find((prospect) => prospect.id === focusedProspectId)
    : undefined;
  const isFocusedProspectVisible = Boolean(
    focusedProspectId &&
      filteredProspectIds.split("\u0000").includes(focusedProspectId),
  );
  const focusMessage =
    focusedProspectId && hasLoadedProspects && !focusedProspect
      ? "Prospect introuvable."
      : focusedProspectId && hasLoadedProspects && !isFocusedProspectVisible
        ? "Le prospect sélectionné est peut-être masqué par les filtres."
        : "";

  useEffect(() => {
    if (!focusedProspectId || !hasLoadedProspects) {
      return;
    }

    if (!focusedProspect || !isFocusedProspectVisible) {
      return;
    }

    const applyHighlight = window.setTimeout(() => {
      setHighlightedProspectId(focusedProspectId);
    }, 0);
    const scrollToFocusedProspect = window.setTimeout(() => {
      document
        .getElementById(`prospect-${focusedProspectId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const clearHighlight = window.setTimeout(() => {
      setHighlightedProspectId((currentProspectId) =>
        currentProspectId === focusedProspectId ? null : currentProspectId,
      );
    }, 4200);

    return () => {
      window.clearTimeout(applyHighlight);
      window.clearTimeout(scrollToFocusedProspect);
      window.clearTimeout(clearHighlight);
    };
  }, [focusedProspect, focusedProspectId, hasLoadedProspects, isFocusedProspectVisible]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">CRM</p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Prospects</h1>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                {prospects.length} prospect{prospects.length > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-slate-300">
              Ici, tu retrouveras les personnes repérées sur les réseaux sociaux,
              leur niveau d’intérêt, le statut de la conversation et les prochaines
              actions à faire.
            </p>
          </div>

          <button
            className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 sm:w-auto"
            type="button"
            onClick={() => setIsFormVisible((currentValue) => !currentValue)}
          >
            {isFormVisible ? "Masquer le formulaire" : "Ajouter un prospect"}
          </button>
        </header>

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:mb-8">
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Sauvegarde des données
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Pense à exporter régulièrement tes données tant que l’application fonctionne en stockage local.
              </p>
              {backupMessage ? (
                <p
                  className={`mt-2 text-sm font-medium ${
                    isBackupError ? "text-red-300" : "text-emerald-300"
                  }`}
                >
                  {backupMessage}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Import / export JSON
                </p>
                <div className="mt-3 flex w-full flex-wrap gap-2">
                  <button
                    className="min-h-10 flex-1 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 sm:flex-none"
                    type="button"
                    onClick={handleExportProspects}
                  >
                    Exporter les prospects
                  </button>
                  <label className="min-h-10 flex-1 cursor-pointer rounded-full border border-white/10 px-4 py-2 text-center text-xs font-semibold text-slate-200 transition hover:bg-white/5 sm:flex-none">
                    Importer une sauvegarde
                    <input
                      ref={importFileInputRef}
                      accept=".json,application/json"
                      className="hidden"
                      type="file"
                      onChange={handleImportProspects}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Import / export CSV
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-300">
                  Le CSV permet d’importer une liste préparée depuis Excel ou Google Sheets.
                </p>
                <div className="mt-3 flex w-full flex-wrap gap-2">
                  <button
                    className="min-h-10 flex-1 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 sm:flex-none"
                    type="button"
                    onClick={handleExportProspectsCsv}
                  >
                    Exporter en CSV
                  </button>
                  <label className="min-h-10 flex-1 cursor-pointer rounded-full border border-white/10 px-4 py-2 text-center text-xs font-semibold text-slate-200 transition hover:bg-white/5 sm:flex-none">
                    Importer un CSV
                    <input
                      ref={csvImportFileInputRef}
                      accept=".csv,text/csv"
                      className="hidden"
                      type="file"
                      onChange={handleImportProspectsCsv}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        {isFormVisible ? (
          <form
            className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-6"
            onSubmit={handleSubmit}
          >
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
                Nouveau prospect
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Pour la V1, on ajoute les prospects manuellement afin de garder un suivi propre et naturel.
              </p>
            </div>

            <div className="grid gap-6">
              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Identité
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                Prénom
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.firstName}
                  onChange={(event) => updateFormField("firstName", event.target.value)}
                  placeholder="Prénom"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Nom
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.lastName}
                  onChange={(event) => updateFormField("lastName", event.target.value)}
                  placeholder="Nom"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Nom affiché / pseudo
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.displayName}
                  onChange={(event) => updateFormField("displayName", event.target.value)}
                  placeholder="@pseudo"
                />
              </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Métier / poste
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.jobTitle}
                      onChange={(event) => updateFormField("jobTitle", event.target.value)}
                      placeholder="Métier ou poste"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Domaine / activité
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.businessArea}
                      onChange={(event) => updateFormField("businessArea", event.target.value)}
                      placeholder="Domaine ou activité"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Ville
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.city}
                      onChange={(event) => updateFormField("city", event.target.value)}
                      placeholder="Ville"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Région
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.region}
                      onChange={(event) => updateFormField("region", event.target.value)}
                      placeholder="Région"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Pays
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.country}
                      onChange={(event) => updateFormField("country", event.target.value)}
                      placeholder="Pays"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Coordonnées
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Téléphone
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.phone}
                      onChange={(event) => updateFormField("phone", event.target.value)}
                      placeholder="+33..."
                      type="tel"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    WhatsApp
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.whatsapp}
                      onChange={(event) => updateFormField("whatsapp", event.target.value)}
                      placeholder="+33..."
                      type="tel"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Email
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.email}
                      onChange={(event) => updateFormField("email", event.target.value)}
                      placeholder="email@exemple.com"
                      type="email"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Réseaux sociaux
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">

                  <label className="grid gap-2 text-sm text-slate-300">
                    Plateforme principale
                    <select
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                      value={formState.mainPlatform}
                      onChange={(event) =>
                        updateFormField("mainPlatform", event.target.value as Prospect["mainPlatform"])
                      }
                    >
                      {SOCIAL_PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </label>

              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                Lien du profil
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.profileUrl}
                  onChange={(event) => updateFormField("profileUrl", event.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien Facebook
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.facebookUrl}
                      onChange={(event) => updateFormField("facebookUrl", event.target.value)}
                      placeholder="https://facebook.com/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien Instagram
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.instagramUrl}
                      onChange={(event) => updateFormField("instagramUrl", event.target.value)}
                      placeholder="https://instagram.com/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien LinkedIn
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.linkedinUrl}
                      onChange={(event) => updateFormField("linkedinUrl", event.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien TikTok
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.tiktokUrl}
                      onChange={(event) => updateFormField("tiktokUrl", event.target.value)}
                      placeholder="https://tiktok.com/@..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien YouTube
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.youtubeUrl}
                      onChange={(event) => updateFormField("youtubeUrl", event.target.value)}
                      placeholder="https://youtube.com/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Autre lien
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.otherUrl}
                      onChange={(event) => updateFormField("otherUrl", event.target.value)}
                      placeholder="https://..."
                      type="url"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Qualification
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-3">

              <label className="grid gap-2 text-sm text-slate-300">
                Catégorie
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.category}
                  onChange={(event) =>
                    updateFormField("category", event.target.value as Prospect["category"])
                  }
                >
                  {PROSPECT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Température / marché
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.temperature}
                  onChange={(event) =>
                    updateFormField("temperature", event.target.value as Prospect["temperature"])
                  }
                >
                  {PROSPECT_TEMPERATURES.map((temperature) => (
                    <option key={temperature} value={temperature}>
                      {temperature}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Type couleur
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.colorType}
                  onChange={(event) =>
                    updateFormField("colorType", event.target.value as Prospect["colorType"])
                  }
                >
                  {PROSPECT_COLOR_TYPES.map((colorType) => (
                    <option key={colorType} value={colorType}>
                      {colorType}
                    </option>
                  ))}
                </select>
              </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Centres d’intérêt / tags
                </legend>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PROSPECT_TAGS.map((tag) => (
                    <label
                      className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-400/40"
                      key={tag}
                    >
                      <input
                        checked={formState.tags.includes(tag)}
                        className="h-4 w-4 accent-emerald-400"
                        onChange={() => updateFormField("tags", toggleProspectTag(formState.tags, tag))}
                        type="checkbox"
                      />
                      {tag}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Activité et interactions
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                    <input
                      checked={formState.isFollower}
                      className="h-4 w-4 accent-emerald-400"
                      onChange={(event) => updateFormField("isFollower", event.target.checked)}
                      type="checkbox"
                    />
                    Est follower ?
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                    <input
                      checked={formState.hasSentMessage}
                      className="h-4 w-4 accent-emerald-400"
                      onChange={(event) => updateFormField("hasSentMessage", event.target.checked)}
                      type="checkbox"
                    />
                    A déjà envoyé un message ?
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Date d&apos;inscription / follow
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                      value={formState.followerSinceDate}
                      onChange={(event) => updateFormField("followerSinceDate", event.target.value)}
                      type="date"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Nombre de commentaires
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                      min="0"
                      value={formState.commentsCount}
                      onChange={(event) => updateFormField("commentsCount", event.target.value)}
                      type="number"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Nombre d&apos;interactions
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                      min="0"
                      value={formState.interactionsCount}
                      onChange={(event) => updateFormField("interactionsCount", event.target.value)}
                      type="number"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Nombre de likes / cœurs
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                      min="0"
                      value={formState.likesCount}
                      onChange={(event) => updateFormField("likesCount", event.target.value)}
                      type="number"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Nombre de messages
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                      min="0"
                      value={formState.messagesCount}
                      onChange={(event) => updateFormField("messagesCount", event.target.value)}
                      type="number"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Notes
                </legend>
                <label className="mt-4 grid gap-2 text-sm text-slate-300">
                  Notes
                  <textarea
                    className="min-h-32 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={formState.notes}
                    onChange={(event) => updateFormField("notes", event.target.value)}
                    placeholder="Contexte, intérêts, prochaine idée de message..."
                  />
                </label>
              </fieldset>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                type="submit"
              >
                Enregistrer le prospect
              </button>
              <button
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                type="button"
                onClick={() => {
                  setFormState(initialFormState);
                  setIsFormVisible(false);
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : null}

        {prospects.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-8">
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <div className="mb-5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-emerald-300">
                Aucun prospect pour le moment
              </div>

              <h2 className="text-2xl font-bold">
                Commence par ajouter les profils les plus intéressants.
              </h2>

              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                Pour la V1, tu ajouteras les profils manuellement. L’objectif est
                de rester propre, naturel et organisé : pas de spam, pas de robot,
                juste un vrai suivi des conversations.
              </p>
            </div>
          </section>
        ) : (
          <section className="grid gap-5 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:gap-6 sm:p-8">
            <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                    Doublons potentiels
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Aucun prospect n’est fusionné automatiquement. À toi de décider quelle fiche garder.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-semibold text-slate-200">
                  {potentialDuplicateGroups.length} groupe{potentialDuplicateGroups.length > 1 ? "s" : ""}
                </span>
              </div>

              {potentialDuplicateGroups.length === 0 ? (
                <p className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
                  Aucun doublon détecté.
                </p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {duplicateMergeMessage ? (
                    <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-medium text-emerald-300">
                      {duplicateMergeMessage}
                    </p>
                  ) : null}
                  {potentialDuplicateGroups.map((duplicateGroup) => {
                    const isMergePanelVisible = duplicateMergeState?.groupId === duplicateGroup.id;
                    const keepProspect =
                      duplicateGroup.prospects.find(
                        (prospect) => prospect.id === duplicateMergeState?.keepProspectId,
                      ) ?? duplicateGroup.prospects[0];
                    const mergeProspect =
                      duplicateGroup.prospects.find(
                        (prospect) => prospect.id === duplicateMergeState?.mergeProspectId,
                      ) ?? duplicateGroup.prospects[1] ?? duplicateGroup.prospects[0];
                    const previewSocialLinks = [
                      keepProspect.socialLinks.facebook || mergeProspect.socialLinks.facebook,
                      keepProspect.socialLinks.instagram || mergeProspect.socialLinks.instagram,
                      keepProspect.socialLinks.linkedin || mergeProspect.socialLinks.linkedin,
                      keepProspect.socialLinks.tiktok || mergeProspect.socialLinks.tiktok,
                      keepProspect.socialLinks.youtube || mergeProspect.socialLinks.youtube,
                      keepProspect.socialLinks.other || mergeProspect.socialLinks.other,
                    ].filter(Boolean);
                    const previewTags = Array.from(
                      new Set([...(keepProspect.tags ?? []), ...(mergeProspect.tags ?? [])]),
                    );
                    const previewConversationCount =
                      (keepProspect.conversationHistory ?? []).length +
                      (mergeProspect.conversationHistory ?? []).length;

                    return (
                      <article
                        className="rounded-2xl border border-white/10 bg-slate-950/50 p-3"
                        key={duplicateGroup.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {duplicateGroup.prospects.length} fiche{duplicateGroup.prospects.length > 1 ? "s" : ""} concernée{duplicateGroup.prospects.length > 1 ? "s" : ""}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              Raison : {duplicateGroup.reasons.join(", ")}
                            </p>
                          </div>
                          <button
                            className="min-h-9 rounded-full border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                            type="button"
                            onClick={() => handleOpenDuplicateMerge(duplicateGroup)}
                          >
                            Fusionner deux fiches
                          </button>
                        </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {duplicateGroup.prospects.map((duplicateProspect) => (
                          <div
                            className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                            key={duplicateProspect.id}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {getProspectDisplayName(duplicateProspect)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {duplicateProspect.mainPlatform} · {duplicateProspect.status}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="min-h-9 rounded-full border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                                type="button"
                                onClick={() => handleViewPotentialDuplicate(duplicateProspect)}
                              >
                                Voir la fiche
                              </button>
                              <button
                                className="min-h-9 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                                type="button"
                                onClick={() => handleDeletePotentialDuplicate(duplicateProspect.id)}
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                        {isMergePanelVisible ? (
                          <div className="mt-3 grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="grid gap-1 text-xs text-slate-300">
                                Fiche à conserver
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={duplicateMergeState.keepProspectId}
                                  onChange={(event) =>
                                    updateDuplicateMergeField("keepProspectId", event.target.value)
                                  }
                                >
                                  {duplicateGroup.prospects.map((prospect) => (
                                    <option
                                      disabled={prospect.id === duplicateMergeState.mergeProspectId}
                                      key={prospect.id}
                                      value={prospect.id}
                                    >
                                      {getProspectDisplayName(prospect)}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Fiche à fusionner
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={duplicateMergeState.mergeProspectId}
                                  onChange={(event) =>
                                    updateDuplicateMergeField("mergeProspectId", event.target.value)
                                  }
                                >
                                  {duplicateGroup.prospects.map((prospect) => (
                                    <option
                                      disabled={prospect.id === duplicateMergeState.keepProspectId}
                                      key={prospect.id}
                                      value={prospect.id}
                                    >
                                      {getProspectDisplayName(prospect)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <div className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
                              <p><span className="text-slate-500">Conservée :</span> <span className="font-medium text-white">{getProspectDisplayName(keepProspect)}</span></p>
                              <p><span className="text-slate-500">Fusionnée :</span> <span className="font-medium text-white">{getProspectDisplayName(mergeProspect)}</span></p>
                              <p><span className="text-slate-500">Email :</span> <span className="font-medium text-white">{keepProspect.email || mergeProspect.email || "—"}</span></p>
                              <p><span className="text-slate-500">Téléphone :</span> <span className="font-medium text-white">{keepProspect.phone || mergeProspect.phone || "—"}</span></p>
                              <p><span className="text-slate-500">WhatsApp :</span> <span className="font-medium text-white">{keepProspect.whatsapp || mergeProspect.whatsapp || "—"}</span></p>
                              <p><span className="text-slate-500">Réseaux sociaux :</span> <span className="font-medium text-white">{previewSocialLinks.length}</span></p>
                              <p><span className="text-slate-500">Tags :</span> <span className="font-medium text-white">{previewTags.length ? previewTags.join(", ") : "—"}</span></p>
                              <p><span className="text-slate-500">Échanges :</span> <span className="font-medium text-white">{previewConversationCount}</span></p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                className="min-h-10 rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                type="button"
                                disabled={keepProspect.id === mergeProspect.id}
                                onClick={handleConfirmDuplicateMerge}
                              >
                                Confirmer la fusion
                              </button>
                              <button
                                className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                type="button"
                                onClick={handleCancelDuplicateMerge}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Liste</p>
                <h2 className="text-2xl font-bold text-white">Prospects enregistrés</h2>
              </div>
              <p className="text-sm text-slate-300">
                {filteredProspects.length} prospect{filteredProspects.length > 1 ? "s" : ""} affiché{filteredProspects.length > 1 ? "s" : ""} sur {prospects.length}
              </p>
            </div>

            <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">Prospects à relancer</p>
                  <h3 className="mt-1 text-xl font-bold text-white">Relances prévues</h3>
                </div>
                <p className="text-sm text-slate-300">
                  {followUpProspects.length} relance{followUpProspects.length > 1 ? "s" : ""}
                </p>
              </div>

              {followUpProspects.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Aucune relance prévue pour le moment.
                </p>
              ) : (
                <div className="grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                  {followUpProspects.map((prospect) => {
                    const name = getProspectDisplayName(prospect);
                    const lastConversationEntry =
                      prospect.conversationHistory.length > 0
                        ? prospect.conversationHistory[prospect.conversationHistory.length - 1]
                        : null;
                    const dateComparison = compareDateStrings(prospect.nextActionDate, todayDate);
                    const followUpStatus =
                      dateComparison < 0
                        ? "En retard"
                        : dateComparison === 0
                          ? "Aujourd’hui"
                          : "À venir";
                    const followUpBadgeClass =
                      dateComparison < 0
                        ? "border-red-400/40 bg-red-500/10 text-red-200"
                        : dateComparison === 0
                          ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
                          : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";

                    return (
                      <article
                        className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-4"
                        key={prospect.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-semibold text-white">{name}</h4>
                            <p className="mt-1 text-xs text-slate-400">
                              {prospect.status} · {prospect.temperature}
                            </p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${followUpBadgeClass}`}>
                            {followUpStatus}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <p><span className="text-slate-500">Score :</span> <span className="font-medium text-white">{prospect.score}</span></p>
                          <p><span className="text-slate-500">Relance :</span> <span className="font-medium text-white">{prospect.nextActionDate}</span></p>
                        </div>

                        {lastConversationEntry ? (
                          <div className="mt-3 rounded-xl bg-white/5 p-3 text-sm">
                            <p className="leading-5 text-white">{lastConversationEntry.content}</p>
                            {lastConversationEntry.nextAction ? (
                              <p className="mt-2 text-xs text-emerald-300">
                                Prochaine action : {lastConversationEntry.nextAction}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <button
                          className="mt-3 min-h-10 w-full rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 sm:w-auto"
                          type="button"
                          onClick={() => handleMarkAsFollowedUp(prospect.id)}
                        >
                          Marquer comme relancé
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(8,minmax(0,1fr))]">
                <label className="grid gap-2 text-sm text-slate-300">
                  Recherche
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Nom, ville, email, notes..."
                  />
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Plateforme
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.platform}
                    onChange={(event) =>
                      updateProspectFilter("platform", event.target.value as ProspectFilters["platform"])
                    }
                  >
                    <option value="Tous">Tous</option>
                    {SOCIAL_PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Statut
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.status}
                    onChange={(event) =>
                      updateProspectFilter("status", event.target.value as ProspectFilters["status"])
                    }
                  >
                    <option value="Tous">Tous</option>
                    {PROSPECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Catégorie
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.category}
                    onChange={(event) =>
                      updateProspectFilter("category", event.target.value as ProspectFilters["category"])
                    }
                  >
                    <option value="Tous">Toutes</option>
                    {PROSPECT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Température
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.temperature}
                    onChange={(event) =>
                      updateProspectFilter("temperature", event.target.value as ProspectFilters["temperature"])
                    }
                  >
                    <option value="Tous">Toutes</option>
                    {PROSPECT_TEMPERATURES.map((temperature) => (
                      <option key={temperature} value={temperature}>
                        {temperature}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Type couleur
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.colorType}
                    onChange={(event) =>
                      updateProspectFilter("colorType", event.target.value as ProspectFilters["colorType"])
                    }
                  >
                    <option value="Tous">Tous</option>
                    {PROSPECT_COLOR_TYPES.map((colorType) => (
                      <option key={colorType} value={colorType}>
                        {colorType}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Tag
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.tag}
                    onChange={(event) =>
                      updateProspectFilter("tag", event.target.value as ProspectFilters["tag"])
                    }
                  >
                    <option value="Tous">Tous</option>
                    {PROSPECT_TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Tri
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectSortOption}
                    onChange={(event) => setProspectSortOption(event.target.value as ProspectSortOption)}
                  >
                    <option value="createdAtDesc">Date de création récente</option>
                    <option value="scoreDesc">Score décroissant</option>
                    <option value="nextActionDate">Prochaine relance</option>
                    <option value="nameAsc">Nom A-Z</option>
                    <option value="temperatureHotFirst">Température : chaud d’abord</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Vue
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectViewMode}
                    onChange={(event) => setProspectViewMode(event.target.value as ProspectViewMode)}
                  >
                    <option value="compact">Vue compacte</option>
                    <option value="detailed">Vue détaillée</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Affichage
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectDisplayMode}
                    onChange={(event) => setProspectDisplayMode(event.target.value as ProspectDisplayMode)}
                  >
                    <option value="list">Liste</option>
                    <option value="pipeline">Pipeline</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">
                    {filteredProspects.length} prospect{filteredProspects.length > 1 ? "s" : ""} affiché{filteredProspects.length > 1 ? "s" : ""} sur {prospects.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Utilise la vue compacte pour le suivi quotidien, la vue détaillée pour analyser une fiche.
                  </p>
                </div>
                <button
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                  type="button"
                  onClick={resetFilters}
                >
                  Réinitialiser les filtres
                </button>
              </div>

              {focusMessage ? (
                <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                  {focusMessage}
                </p>
              ) : null}
            </section>

            {isPipelineView ? (
              <section className="grid gap-4 lg:flex lg:overflow-x-auto lg:pb-2">
                {PROSPECT_STATUSES.map((status) => {
                  const statusProspects = pipelineProspectsByStatus[status];

                  return (
                    <div
                      className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/40 p-4 lg:min-w-72 lg:max-w-80"
                      key={status}
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
                          {status}
                        </h3>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                          {statusProspects.length}
                        </span>
                      </div>

                      {statusProspects.length === 0 ? (
                        <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                          Aucun prospect
                        </p>
                      ) : (
                        <div className="grid gap-3">
                          {statusProspects.map((prospect) => {
                            const prospectTags = prospect.tags ?? [];
                            const isHighlightedProspect = highlightedProspectId === prospect.id;

                            return (
                              <article
                                id={`prospect-${prospect.id}`}
                                className={`min-w-0 scroll-mt-8 rounded-2xl border p-4 transition ${
                                  isHighlightedProspect
                                    ? "border-emerald-300 bg-emerald-400/15 shadow-xl shadow-emerald-950/40"
                                    : "border-white/10 bg-slate-900/80"
                                }`}
                                key={prospect.id}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    {isHighlightedProspect ? (
                                      <span className="mb-2 inline-flex rounded-full border border-emerald-300/40 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                                        Prospect sélectionné
                                      </span>
                                    ) : null}
                                    <h4 className="truncate font-semibold text-white">
                                      {getProspectDisplayName(prospect)}
                                    </h4>
                                    <p className="mt-1 text-xs text-slate-400">
                                      {prospect.mainPlatform} · {prospect.category}
                                    </p>
                                  </div>
                                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                                    {prospect.score}
                                  </span>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                                    {prospect.temperature}
                                  </span>
                                  {prospect.nextActionDate ? (
                                    <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sky-200">
                                      Relance prévue : {prospect.nextActionDate}
                                    </span>
                                  ) : null}
                                </div>

                                {renderQuickFollowUpControls(prospect, true)}

                                {prospectTags.length > 0 ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {prospectTags.map((tag) => (
                                      <span
                                        className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-slate-300"
                                        key={tag}
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                <div className="mt-4 grid gap-2">
                                  <label className="grid gap-1 text-xs text-slate-300">
                                    Changer le statut
                                    <select
                                      className="min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                      value={prospect.status}
                                      onChange={(event) =>
                                        updateProspectStatus(
                                          prospect.id,
                                          event.target.value as Prospect["status"],
                                        )
                                      }
                                    >
                                      {PROSPECT_STATUSES.map((statusOption) => (
                                        <option key={statusOption} value={statusOption}>
                                          {statusOption}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <button
                                    className="min-h-10 w-full rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    type="button"
                                    disabled={
                                      PROSPECT_STATUSES.indexOf(prospect.status) ===
                                      PROSPECT_STATUSES.length - 1
                                    }
                                    onClick={() => handleMoveProspectToNextStatus(prospect)}
                                  >
                                    Statut suivant
                                  </button>
                                </div>

                                <button
                                  className="mt-4 min-h-10 w-full rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                                  type="button"
                                  onClick={() => openFullProspectFromPipeline(prospect)}
                                >
                                  Voir la fiche
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ) : sortedProspects.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-center text-slate-300">
                Aucun prospect ne correspond à ta recherche.
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedProspects.map((prospect) => {
                const name = getProspectDisplayName(prospect);
                const availableSocialLinks = socialLinkLabels
                  .map((socialLink) => ({
                    ...socialLink,
                    url: prospect.socialLinks[socialLink.key]?.trim(),
                  }))
                  .filter(
                    (
                      socialLink,
                    ): socialLink is {
                      key: keyof Prospect["socialLinks"];
                      label: string;
                      url: string;
                    } => Boolean(socialLink.url),
                  );
                const hasContactDetails = Boolean(
                  prospect.phone.trim() || prospect.whatsapp.trim() || prospect.email.trim(),
                );
                const interactionStats = prospect.interactionStats ?? {
                  followerSinceDate: "",
                  commentsCount: 0,
                  interactionsCount: 0,
                  likesCount: 0,
                  messagesCount: 0,
                };
                const conversationHistory = prospect.conversationHistory ?? [];
                const prospectTags = prospect.tags ?? [];
                const hasAvoidTag = prospectTags.some((tag) =>
                  normalizeText(String(tag)).includes("eviter"),
                );
                const messageAssistantObjective = getMessageAssistantObjective(messageAssistantState.situation);
                const lastConversationEntry =
                  conversationHistory.length > 0
                    ? conversationHistory[conversationHistory.length - 1]
                    : null;
                const isConversationFormVisible = activeConversationProspectId === prospect.id;
                const isQualificationFormVisible = activeQualificationProspectId === prospect.id;
                const isFullProspectFormVisible = activeFullProspectId === prospect.id;
                const isMessageAssistantVisible = activeMessageAssistantProspectId === prospect.id;
                const selectedAssistantResource = sortedResources.find(
                  (resource) => resource.id === messageAssistantState.selectedResourceId,
                );
                const selectedSharedResourceId = resourceShareSelections[prospect.id] ?? "";
                const selectedSharedResource = sortedResources.find(
                  (resource) => resource.id === selectedSharedResourceId,
                );
                const messageAssistantNextAction = getMessageAssistantNextAction(messageAssistantState.situation);
                const messageAssistantSuggestedFollowUpDays = getMessageAssistantSuggestedFollowUpDays(
                  messageAssistantState.situation,
                );
                const messageAssistantSuggestedFollowUpLabel = formatSuggestedFollowUpLabel(
                  messageAssistantSuggestedFollowUpDays,
                );
                const messageAssistantSuggestedStatus = getMessageAssistantSuggestedStatus(
                  messageAssistantState.situation,
                );
                const messageAssistantSuggestedStatusLabel =
                  messageAssistantSuggestedStatus ?? "garder le statut actuel";
                const priorityLabel =
                  prospect.score >= 75
                    ? "Priorité haute"
                    : prospect.score >= 40
                      ? "Priorité moyenne"
                      : "Priorité basse";
                const profileUrl = prospect.profileUrl.trim();
                const instagramUrl = prospect.socialLinks.instagram.trim();
                const facebookUrl = prospect.socialLinks.facebook.trim();
                const linkedinUrl = prospect.socialLinks.linkedin.trim();
                const tiktokUrl = prospect.socialLinks.tiktok.trim();
                const youtubeUrl = prospect.socialLinks.youtube.trim();
                const whatsappNumber = buildWhatsAppNumber(prospect.whatsapp.trim());
                const phoneNumber = cleanPhoneNumber(prospect.phone.trim());
                const emailAddress = prospect.email.trim();
                const emailHref = emailAddress ? `mailto:${encodeURIComponent(emailAddress)}` : "";
                const hasQuickActions = Boolean(
                  profileUrl ||
                    instagramUrl ||
                    facebookUrl ||
                    linkedinUrl ||
                    tiktokUrl ||
                    youtubeUrl ||
                    whatsappNumber ||
                    phoneNumber ||
                    emailAddress,
                );
                const isHighlightedProspect = highlightedProspectId === prospect.id;

                return (
                  <article
                    id={`prospect-${prospect.id}`}
                    key={prospect.id}
                    className={`min-w-0 scroll-mt-8 rounded-3xl border p-4 shadow-xl transition hover:border-emerald-400/30 sm:p-5 ${
                      isHighlightedProspect
                        ? "border-emerald-300 bg-emerald-400/15 shadow-emerald-950/40"
                        : "border-white/10 bg-slate-900/70"
                    }`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        {isHighlightedProspect ? (
                          <span className="mb-2 inline-flex rounded-full border border-emerald-300/40 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                            Prospect sélectionné
                          </span>
                        ) : null}
                        <h3 className="text-xl font-semibold text-white">{name}</h3>
                        {isDetailedView && prospect.jobTitle ? (
                          <p className="mt-1 text-sm text-slate-400">{prospect.jobTitle}</p>
                        ) : null}
                        {isDetailedView && prospect.businessArea ? (
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {prospect.businessArea}
                          </p>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                        {prospect.mainPlatform}
                      </span>
                    </div>

                    {prospectTags.length > 0 ? (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {prospectTags.map((tag) => (
                          <span
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200"
                            key={tag}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mb-4 flex flex-wrap gap-2">
                      <button
                        className="min-h-10 w-full rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 sm:w-auto"
                        type="button"
                        onClick={() => toggleFullProspectForm(prospect)}
                      >
                        {isFullProspectFormVisible ? "Masquer la fiche complète" : "Voir / modifier la fiche complète"}
                      </button>
                      <button
                        className="min-h-10 w-full rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20 sm:w-auto"
                        type="button"
                        onClick={() => toggleMessageAssistant(prospect.id)}
                      >
                        Préparer un message
                      </button>
                      <button
                        className="min-h-10 w-full rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 sm:w-auto"
                        type="button"
                        onClick={() => toggleConversationForm(prospect.id)}
                      >
                        {isConversationFormVisible ? "Masquer l’échange" : "Ajouter un échange"}
                      </button>
                      <button
                        className="min-h-10 w-full rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 sm:w-auto"
                        type="button"
                        onClick={() => handleDeleteProspect(prospect.id)}
                      >
                        Supprimer le prospect
                      </button>
                    </div>

                    <div className="mb-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Actions rapides
                      </p>
                      {hasQuickActions ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {profileUrl ? (
                            <a
                              className="min-h-10 rounded-full border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                              href={profileUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ouvrir profil
                            </a>
                          ) : null}
                          {instagramUrl ? (
                            <a
                              className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              href={instagramUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Instagram
                            </a>
                          ) : null}
                          {facebookUrl ? (
                            <a
                              className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              href={facebookUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Facebook
                            </a>
                          ) : null}
                          {linkedinUrl ? (
                            <a
                              className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              href={linkedinUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              LinkedIn
                            </a>
                          ) : null}
                          {tiktokUrl ? (
                            <a
                              className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              href={tiktokUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              TikTok
                            </a>
                          ) : null}
                          {youtubeUrl ? (
                            <a
                              className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              href={youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              YouTube
                            </a>
                          ) : null}
                          {whatsappNumber ? (
                            <a
                              className="min-h-10 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                              href={`https://wa.me/${whatsappNumber}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                          ) : null}
                          {phoneNumber ? (
                            <a
                              className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              href={`tel:${phoneNumber}`}
                            >
                              Appeler
                            </a>
                          ) : null}
                          {emailAddress ? (
                            <a
                              className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                              href={emailHref}
                            >
                              Email
                            </a>
                          ) : null}
                          {emailAddress ? (
                            <button
                              className="min-h-10 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20"
                              type="button"
                              onClick={() => handleCopyEmail(prospect.id, emailAddress)}
                            >
                              Copier email
                            </button>
                          ) : null}
                          {profileUrl ? (
                            <button
                              className="min-h-10 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20"
                              type="button"
                              onClick={() => handleCopyProfileLink(prospect.id, profileUrl)}
                            >
                              Copier lien profil
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-400">
                          Aucune action rapide disponible.
                        </p>
                      )}
                      {copiedQuickActionProspectId === prospect.id ? (
                        <p className="mt-2 text-xs font-medium text-emerald-300">
                          Lien copié.
                        </p>
                      ) : null}
                      {copiedEmailProspectId === prospect.id ? (
                        <p className="mt-2 text-xs font-medium text-emerald-300">
                          Email copié.
                        </p>
                      ) : null}
                    </div>

                    <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                        Partager une ressource
                      </p>
                      {sortedResources.length === 0 ? (
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          Aucune ressource disponible. Ajoute d’abord tes liens dans la page Ressources.
                        </p>
                      ) : (
                        <div className="mt-3 grid gap-3">
                          <select
                            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                            value={selectedSharedResourceId}
                            onChange={(event) =>
                              updateResourceShareSelection(prospect.id, event.target.value)
                            }
                          >
                            <option value="">Aucune ressource</option>
                            {sortedResources.map((resource) => (
                              <option key={resource.id} value={resource.id}>
                                {resource.title} · {resource.type}
                              </option>
                            ))}
                          </select>

                          {selectedSharedResource ? (
                            <div className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {selectedSharedResource.title}
                                </p>
                                <p className="mt-1 text-xs text-emerald-300">
                                  {selectedSharedResource.type}
                                </p>
                                <p className="mt-2 break-all text-xs text-sky-200">
                                  {selectedSharedResource.url}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                                  type="button"
                                  onClick={() =>
                                    handleCopySharedResourceLink(prospect.id, selectedSharedResource)
                                  }
                                >
                                  Copier le lien
                                </button>
                                <a
                                  className="min-h-10 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20"
                                  href={selectedSharedResource.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ouvrir
                                </a>
                                <button
                                  className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                  type="button"
                                  onClick={() =>
                                    handleAddSharedResourceToHistory(prospect, selectedSharedResource)
                                  }
                                >
                                  Ajouter à l’historique
                                </button>
                              </div>
                              {copiedSharedResourceProspectId === prospect.id ? (
                                <p className="text-xs font-medium text-emerald-300">
                                  Lien copié.
                                </p>
                              ) : null}
                              {addedSharedResourceProspectId === prospect.id ? (
                                <p className="text-xs font-medium text-emerald-300">
                                  Ressource ajoutée à l’historique.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {renderQuickFollowUpControls(prospect)}

                    {isMessageAssistantVisible ? (
                      <div className="mb-4 grid gap-3 rounded-2xl border border-sky-400/20 bg-slate-950/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
                              Assistant message
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              Message court, humain, sans pression.
                            </p>
                          </div>
                          <button
                            className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                            type="button"
                            onClick={() => {
                              setActiveMessageAssistantProspectId(null);
                              setMessageAssistantState(initialMessageAssistantState);
                            }}
                          >
                            Fermer
                          </button>
                        </div>

                        {hasAvoidTag ? (
                          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
                            Attention : ce prospect est marqué À éviter.
                          </p>
                        ) : null}

                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                            Étape du tunnel
                          </p>
                          <p className="mt-1 text-sm text-slate-200">
                            {messageAssistantState.situation}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            {messageAssistantObjective}
                          </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-xs text-slate-300">
                            Situation
                            <select
                              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-400"
                              value={messageAssistantState.situation}
                              onChange={(event) =>
                                updateMessageAssistantField(
                                  "situation",
                                  event.target.value as MessageAssistantSituation,
                                )
                              }
                            >
                              {MESSAGE_ASSISTANT_SITUATIONS.map((situation) => (
                                <option key={situation} value={situation}>
                                  {situation}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1 text-xs text-slate-300">
                            Style
                            <select
                              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-400"
                              value={messageAssistantState.style}
                              onChange={(event) =>
                                updateMessageAssistantField(
                                  "style",
                                  event.target.value as MessageAssistantStyle,
                                )
                              }
                            >
                              {MESSAGE_ASSISTANT_STYLES.map((style) => (
                                <option key={style} value={style}>
                                  {style}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <button
                          className="min-h-10 rounded-full bg-sky-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-200"
                          type="button"
                          onClick={() => handleGenerateProspectMessage(prospect)}
                        >
                          Générer le message
                        </button>

                        <div className="min-h-24 rounded-2xl border border-white/10 bg-slate-950 p-3 text-sm leading-6 text-slate-100">
                          {messageAssistantState.generatedMessage || (
                            <span className="text-slate-500">
                              Le message généré apparaîtra ici.
                            </span>
                          )}
                        </div>

                        {sortedResources.length > 0 ? (
                          <div className="grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                            <label className="grid gap-1 text-xs text-slate-300">
                              Ressource à joindre
                              <select
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={messageAssistantState.selectedResourceId}
                                onChange={(event) => updateMessageAssistantResource(event.target.value)}
                              >
                                <option value="">Aucune ressource</option>
                                {sortedResources.map((resource) => (
                                  <option key={resource.id} value={resource.id}>
                                    {resource.title} · {resource.type}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {selectedAssistantResource ? (
                              <div className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {selectedAssistantResource.title}
                                  </p>
                                  <p className="mt-1 text-xs text-emerald-300">
                                    {selectedAssistantResource.type}
                                  </p>
                                  <p className="mt-2 break-all text-xs text-sky-200">
                                    {selectedAssistantResource.url}
                                  </p>
                                  {selectedAssistantResource.notes ? (
                                    <p className="mt-2 text-xs leading-5 text-slate-300">
                                      {selectedAssistantResource.notes}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                                    type="button"
                                    onClick={() =>
                                      handleCopyAssistantResourceLink(
                                        prospect.id,
                                        selectedAssistantResource,
                                      )
                                    }
                                  >
                                    Copier le lien ressource
                                  </button>
                                  <button
                                    className="min-h-10 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20"
                                    type="button"
                                    onClick={() =>
                                      handleCopyMessageWithResource(
                                        prospect.id,
                                        selectedAssistantResource,
                                      )
                                    }
                                  >
                                    Copier message + ressource
                                  </button>
                                </div>

                                {messageAssistantState.copiedResourceProspectId === prospect.id ? (
                                  <p className="text-xs font-medium text-emerald-300">
                                    Lien ressource copié.
                                  </p>
                                ) : null}
                                {messageAssistantState.copiedMessageWithResourceProspectId === prospect.id ? (
                                  <p className="text-xs font-medium text-emerald-300">
                                    Message copié.
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {messageAssistantState.generatedMessage ? (
                          <div className="grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                                Prochaine action conseillée
                              </p>
                              <p className="mt-2 text-sm leading-6 text-slate-100">
                                {messageAssistantNextAction}
                              </p>
                            </div>

                            <div className="grid gap-2 border-t border-white/10 pt-3 md:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Relance
                                </p>
                                <p className="mt-1 text-sm text-slate-100">
                                  {messageAssistantSuggestedFollowUpLabel}
                                </p>
                                {messageAssistantSuggestedFollowUpDays !== null ? (
                                  <button
                                    className="mt-3 min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                                    type="button"
                                    onClick={() => handleApplySuggestedFollowUp(prospect)}
                                  >
                                    Appliquer la relance suggérée
                                  </button>
                                ) : null}
                                {messageAssistantState.suggestedFollowUpAppliedProspectId === prospect.id ? (
                                  <p className="mt-2 text-xs font-medium text-emerald-300">
                                    Relance suggérée appliquée.
                                  </p>
                                ) : null}
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Statut
                                </p>
                                <p className="mt-1 text-sm text-slate-100">
                                  Statut suggéré : {messageAssistantSuggestedStatusLabel}
                                </p>
                                {messageAssistantSuggestedStatus ? (
                                  <button
                                    className="mt-3 min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
                                    type="button"
                                    onClick={() => handleApplySuggestedStatus(prospect)}
                                  >
                                    Appliquer le statut suggéré
                                  </button>
                                ) : null}
                                {messageAssistantState.suggestedStatusAppliedProspectId === prospect.id ? (
                                  <p className="mt-2 text-xs font-medium text-emerald-300">
                                    Statut suggéré appliqué.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            className="min-h-10 rounded-full border border-sky-400/30 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                            type="button"
                            disabled={!messageAssistantState.generatedMessage}
                            onClick={() => handleCopyProspectMessage(prospect.id)}
                          >
                            Copier le message
                          </button>
                          <button
                            className="min-h-10 rounded-full border border-emerald-400/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                            type="button"
                            disabled={!messageAssistantState.generatedMessage}
                            onClick={() => handleAddGeneratedMessageToHistory(prospect)}
                          >
                            Ajouter comme échange
                          </button>
                          {messageAssistantState.copiedProspectId === prospect.id ? (
                            <p className="text-xs font-medium text-emerald-300">
                              Message copié.
                            </p>
                          ) : null}
                          {messageAssistantState.addedHistoryProspectId === prospect.id ? (
                            <p className="text-xs font-medium text-emerald-300">
                              Message ajouté à l’historique.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {isFullProspectFormVisible ? (
                      <form
                        className="mb-4 grid min-w-0 gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-3 sm:p-4"
                        onSubmit={(event) => handleFullProspectSubmit(prospect.id, event)}
                      >
                        <fieldset className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                            Identité
                          </legend>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1 text-xs text-slate-300">
                              Prénom
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.firstName} onChange={(event) => updateFullProspectFormField("firstName", event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nom
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.lastName} onChange={(event) => updateFullProspectFormField("lastName", event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nom affiché / pseudo
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.displayName} onChange={(event) => updateFullProspectFormField("displayName", event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Métier / poste
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.jobTitle} onChange={(event) => updateFullProspectFormField("jobTitle", event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Domaine / activité
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.businessArea} onChange={(event) => updateFullProspectFormField("businessArea", event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Ville
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.city} onChange={(event) => updateFullProspectFormField("city", event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Région
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.region} onChange={(event) => updateFullProspectFormField("region", event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Pays
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.country} onChange={(event) => updateFullProspectFormField("country", event.target.value)} />
                            </label>
                          </div>
                        </fieldset>

                        <fieldset className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                            Coordonnées
                          </legend>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <label className="grid gap-1 text-xs text-slate-300">
                              Téléphone
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.phone} onChange={(event) => updateFullProspectFormField("phone", event.target.value)} type="tel" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              WhatsApp
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.whatsapp} onChange={(event) => updateFullProspectFormField("whatsapp", event.target.value)} type="tel" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Email
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.email} onChange={(event) => updateFullProspectFormField("email", event.target.value)} type="email" />
                            </label>
                          </div>
                        </fieldset>

                        <fieldset className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                            Réseaux sociaux
                          </legend>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1 text-xs text-slate-300">
                              Plateforme principale
                              <select className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.mainPlatform} onChange={(event) => updateFullProspectFormField("mainPlatform", event.target.value as Prospect["mainPlatform"])}>
                                {SOCIAL_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Lien principal du profil
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.profileUrl} onChange={(event) => updateFullProspectFormField("profileUrl", event.target.value)} type="url" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Lien Facebook
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.facebookUrl} onChange={(event) => updateFullProspectFormField("facebookUrl", event.target.value)} type="url" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Lien Instagram
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.instagramUrl} onChange={(event) => updateFullProspectFormField("instagramUrl", event.target.value)} type="url" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Lien LinkedIn
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.linkedinUrl} onChange={(event) => updateFullProspectFormField("linkedinUrl", event.target.value)} type="url" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Lien TikTok
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.tiktokUrl} onChange={(event) => updateFullProspectFormField("tiktokUrl", event.target.value)} type="url" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Lien YouTube
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.youtubeUrl} onChange={(event) => updateFullProspectFormField("youtubeUrl", event.target.value)} type="url" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Autre lien
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.otherUrl} onChange={(event) => updateFullProspectFormField("otherUrl", event.target.value)} type="url" />
                            </label>
                          </div>
                        </fieldset>

                        <fieldset className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                            Qualification
                          </legend>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1 text-xs text-slate-300">
                              Statut
                              <select className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.status} onChange={(event) => updateFullProspectFormField("status", event.target.value as Prospect["status"])}>
                                {PROSPECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Catégorie
                              <select className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.category} onChange={(event) => updateFullProspectFormField("category", event.target.value as Prospect["category"])}>
                                {PROSPECT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Température / marché
                              <select className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.temperature} onChange={(event) => updateFullProspectFormField("temperature", event.target.value as Prospect["temperature"])}>
                                {PROSPECT_TEMPERATURES.map((temperature) => <option key={temperature} value={temperature}>{temperature}</option>)}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Type couleur
                              <select className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.colorType} onChange={(event) => updateFullProspectFormField("colorType", event.target.value as Prospect["colorType"])}>
                                {PROSPECT_COLOR_TYPES.map((colorType) => <option key={colorType} value={colorType}>{colorType}</option>)}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300 md:col-span-2">
                              Prochaine relance
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.nextActionDate} onChange={(event) => updateFullProspectFormField("nextActionDate", event.target.value)} type="date" />
                            </label>
                          </div>
                        </fieldset>

                        <fieldset className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                            Centres d’intérêt / tags
                          </legend>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {PROSPECT_TAGS.map((tag) => (
                              <label
                                className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-400/40"
                                key={tag}
                              >
                                <input
                                  checked={fullProspectFormState.tags.includes(tag)}
                                  className="h-4 w-4 accent-emerald-400"
                                  onChange={() =>
                                    updateFullProspectFormField(
                                      "tags",
                                      toggleProspectTag(fullProspectFormState.tags, tag),
                                    )
                                  }
                                  type="checkbox"
                                />
                                {tag}
                              </label>
                            ))}
                          </div>
                        </fieldset>

                        <fieldset className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                            Activité et interactions
                          </legend>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="flex items-center gap-3 text-xs text-slate-300">
                              <input checked={fullProspectFormState.isFollower} className="h-4 w-4 accent-emerald-400" onChange={(event) => updateFullProspectFormField("isFollower", event.target.checked)} type="checkbox" />
                              Follower oui/non
                            </label>
                            <label className="flex items-center gap-3 text-xs text-slate-300">
                              <input checked={fullProspectFormState.hasSentMessage} className="h-4 w-4 accent-emerald-400" onChange={(event) => updateFullProspectFormField("hasSentMessage", event.target.checked)} type="checkbox" />
                              Message reçu oui/non
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300 md:col-span-2">
                              Date d&apos;inscription / follow
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.followerSinceDate} onChange={(event) => updateFullProspectFormField("followerSinceDate", event.target.value)} type="date" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nombre de commentaires
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" min="0" value={fullProspectFormState.commentsCount} onChange={(event) => updateFullProspectFormField("commentsCount", event.target.value)} type="number" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nombre d&apos;interactions
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" min="0" value={fullProspectFormState.interactionsCount} onChange={(event) => updateFullProspectFormField("interactionsCount", event.target.value)} type="number" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nombre de likes / cœurs
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" min="0" value={fullProspectFormState.likesCount} onChange={(event) => updateFullProspectFormField("likesCount", event.target.value)} type="number" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nombre de messages
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" min="0" value={fullProspectFormState.messagesCount} onChange={(event) => updateFullProspectFormField("messagesCount", event.target.value)} type="number" />
                            </label>
                          </div>
                        </fieldset>

                        <fieldset className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                            Notes
                          </legend>
                          <label className="mt-3 grid gap-1 text-xs text-slate-300">
                            Notes
                            <textarea className="min-h-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400" value={fullProspectFormState.notes} onChange={(event) => updateFullProspectFormField("notes", event.target.value)} />
                          </label>
                        </fieldset>

                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300" type="submit">
                            Enregistrer la fiche
                          </button>
                          <button
                            className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                            type="button"
                            onClick={() => {
                              setActiveFullProspectId(null);
                              setFullProspectFormState(initialFullProspectFormState);
                            }}
                          >
                            Annuler
                          </button>
                        </div>
                      </form>
                    ) : null}

                    <div className="grid gap-3 text-sm text-slate-300">
                      <div className="rounded-2xl bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Qualification</p>
                            <p className="mt-1 font-medium text-white">{prospect.status}</p>
                          </div>
                          <button
                            className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                            type="button"
                            onClick={() => toggleQualificationForm(prospect)}
                          >
                            {isQualificationFormVisible ? "Masquer" : "Modifier la qualification"}
                          </button>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm">
                          <p><span className="text-slate-500">Catégorie :</span> <span className="font-medium text-white">{prospect.category}</span></p>
                          <p><span className="text-slate-500">Température :</span> <span className="font-medium text-white">{prospect.temperature}</span></p>
                          <p><span className="text-slate-500">Type couleur :</span> <span className="font-medium text-white">{prospect.colorType}</span></p>
                          {prospect.nextActionDate ? (
                            <p><span className="text-slate-500">Prochaine relance :</span> <span className="font-medium text-white">{prospect.nextActionDate}</span></p>
                          ) : null}
                          {isDetailedView && prospect.notes ? (
                            <p className="leading-5"><span className="text-slate-500">Notes :</span> <span className="font-medium text-white">{prospect.notes}</span></p>
                          ) : null}
                        </div>

                        {isQualificationFormVisible ? (
                          <form
                            className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                            onSubmit={(event) => handleQualificationSubmit(prospect.id, event)}
                          >
                            <label className="grid gap-1 text-xs text-slate-300">
                              Statut
                              <select
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={qualificationFormState.status}
                                onChange={(event) =>
                                  updateQualificationFormField("status", event.target.value as Prospect["status"])
                                }
                              >
                                {PROSPECT_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="grid gap-1 text-xs text-slate-300">
                                Catégorie
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.category}
                                  onChange={(event) =>
                                    updateQualificationFormField("category", event.target.value as Prospect["category"])
                                  }
                                >
                                  {PROSPECT_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Température / marché
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.temperature}
                                  onChange={(event) =>
                                    updateQualificationFormField("temperature", event.target.value as Prospect["temperature"])
                                  }
                                >
                                  {PROSPECT_TEMPERATURES.map((temperature) => (
                                    <option key={temperature} value={temperature}>
                                      {temperature}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Type couleur
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.colorType}
                                  onChange={(event) =>
                                    updateQualificationFormField("colorType", event.target.value as Prospect["colorType"])
                                  }
                                >
                                  {PROSPECT_COLOR_TYPES.map((colorType) => (
                                    <option key={colorType} value={colorType}>
                                      {colorType}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Prochaine relance
                              <input
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={qualificationFormState.nextActionDate}
                                onChange={(event) => updateQualificationFormField("nextActionDate", event.target.value)}
                                type="date"
                              />
                            </label>

                            <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                                Tags
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {PROSPECT_TAGS.map((tag) => (
                                  <label
                                    className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-400/40"
                                    key={tag}
                                  >
                                    <input
                                      checked={qualificationFormState.tags.includes(tag)}
                                      className="h-4 w-4 accent-emerald-400"
                                      onChange={() =>
                                        updateQualificationFormField(
                                          "tags",
                                          toggleProspectTag(qualificationFormState.tags, tag),
                                        )
                                      }
                                      type="checkbox"
                                    />
                                    {tag}
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 md:grid-cols-2">
                              <label className="flex items-center gap-3 text-xs text-slate-300">
                                <input
                                  checked={qualificationFormState.isFollower}
                                  className="h-4 w-4 accent-emerald-400"
                                  onChange={(event) =>
                                    updateQualificationFormField("isFollower", event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                Est follower ?
                              </label>

                              <label className="flex items-center gap-3 text-xs text-slate-300">
                                <input
                                  checked={qualificationFormState.hasSentMessage}
                                  className="h-4 w-4 accent-emerald-400"
                                  onChange={(event) =>
                                    updateQualificationFormField("hasSentMessage", event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                A déjà envoyé un message ?
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300 md:col-span-2">
                                Date d&apos;inscription / follow
                                <input
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.followerSinceDate}
                                  onChange={(event) =>
                                    updateQualificationFormField("followerSinceDate", event.target.value)
                                  }
                                  type="date"
                                />
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Commentaires
                                <input
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  min="0"
                                  value={qualificationFormState.commentsCount}
                                  onChange={(event) =>
                                    updateQualificationFormField("commentsCount", event.target.value)
                                  }
                                  type="number"
                                />
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Interactions
                                <input
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  min="0"
                                  value={qualificationFormState.interactionsCount}
                                  onChange={(event) =>
                                    updateQualificationFormField("interactionsCount", event.target.value)
                                  }
                                  type="number"
                                />
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Likes / cœurs
                                <input
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  min="0"
                                  value={qualificationFormState.likesCount}
                                  onChange={(event) =>
                                    updateQualificationFormField("likesCount", event.target.value)
                                  }
                                  type="number"
                                />
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Messages
                                <input
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  min="0"
                                  value={qualificationFormState.messagesCount}
                                  onChange={(event) =>
                                    updateQualificationFormField("messagesCount", event.target.value)
                                  }
                                  type="number"
                                />
                              </label>
                            </div>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Notes
                              <textarea
                                className="min-h-20 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                                value={qualificationFormState.notes}
                                onChange={(event) => updateQualificationFormField("notes", event.target.value)}
                                placeholder="Notes de qualification..."
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                                type="submit"
                              >
                                Enregistrer
                              </button>
                              <button
                                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                type="button"
                                onClick={() => {
                                  setActiveQualificationProspectId(null);
                                  setQualificationFormState(initialQualificationFormState);
                                }}
                              >
                                Annuler
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Score automatique</p>
                            <p className="mt-1 text-3xl font-bold text-white">{prospect.score}</p>
                          </div>
                          <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-200">
                            {priorityLabel}
                          </span>
                        </div>
                      </div>
                      {isDetailedView ? (
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Activité</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <p><span className="text-slate-500">Follower :</span> <span className="font-medium text-white">{prospect.isFollower ? "Oui" : "Non"}</span></p>
                          <p><span className="text-slate-500">Message reçu :</span> <span className="font-medium text-white">{prospect.hasSentMessage ? "Oui" : "Non"}</span></p>
                          {interactionStats.followerSinceDate ? (
                            <p className="col-span-2"><span className="text-slate-500">Follow :</span> <span className="font-medium text-white">{interactionStats.followerSinceDate}</span></p>
                          ) : null}
                          <p><span className="text-slate-500">Commentaires :</span> <span className="font-medium text-white">{interactionStats.commentsCount}</span></p>
                          <p><span className="text-slate-500">Interactions :</span> <span className="font-medium text-white">{interactionStats.interactionsCount}</span></p>
                          <p><span className="text-slate-500">Likes / cœurs :</span> <span className="font-medium text-white">{interactionStats.likesCount}</span></p>
                          <p><span className="text-slate-500">Messages :</span> <span className="font-medium text-white">{interactionStats.messagesCount}</span></p>
                        </div>
                      </div>
                      ) : null}
                      {isDetailedView ? (
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Localisation</p>
                        <p className="mt-1 font-medium text-white">
                          {[prospect.city, prospect.region, prospect.country].filter(Boolean).join(" / ") || "—"}
                        </p>
                      </div>
                      ) : null}
                      {isDetailedView && hasContactDetails ? (
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Coordonnées</p>
                          <div className="mt-2 grid gap-1 font-medium text-white">
                            {prospect.phone ? <p>Téléphone : {prospect.phone}</p> : null}
                            {prospect.whatsapp ? <p>WhatsApp : {prospect.whatsapp}</p> : null}
                            {prospect.email ? <p>Email : {prospect.email}</p> : null}
                          </div>
                        </div>
                      ) : null}
                      {isDetailedView && (prospect.profileUrl || availableSocialLinks.length > 0) ? (
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Réseaux sociaux</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {prospect.profileUrl ? (
                              <a
                                className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:border-emerald-300/50"
                                href={prospect.profileUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Profil
                              </a>
                            ) : null}
                            {availableSocialLinks.map((socialLink) => (
                              <a
                                className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:border-emerald-300/50"
                                href={socialLink.url}
                                key={socialLink.key}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {socialLink.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {isDetailedView ? (
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dernière interaction</p>
                        <p className="mt-1 font-medium text-white">{prospect.lastInteractionDate || "—"}</p>
                      </div>
                      ) : null}
                      {isDetailedView || isConversationFormVisible ? (
                      <div className="rounded-2xl bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Conversation</p>
                            <p className="mt-1 font-medium text-white">
                              {conversationHistory.length} échange{conversationHistory.length > 1 ? "s" : ""}
                            </p>
                          </div>
                          <button
                            className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                            type="button"
                            onClick={() => toggleConversationForm(prospect.id)}
                          >
                            {isConversationFormVisible ? "Masquer" : "Ajouter un échange"}
                          </button>
                        </div>

                        {lastConversationEntry ? (
                          <div className="mt-3 rounded-2xl bg-slate-950/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Dernier échange
                            </p>
                            <p className="mt-2 text-xs text-slate-400">
                              {lastConversationEntry.date} · {lastConversationEntry.channel}
                            </p>
                            <p className="mt-1 text-sm leading-5 text-white">{lastConversationEntry.content}</p>
                            {lastConversationEntry.nextAction ? (
                              <p className="mt-2 text-sm text-emerald-300">
                                Prochaine action : {lastConversationEntry.nextAction}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-400">Aucun échange enregistré.</p>
                        )}

                        {isConversationFormVisible ? (
                          <form
                            className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                            onSubmit={(event) => handleConversationSubmit(prospect.id, event)}
                          >
                            <label className="grid gap-1 text-xs text-slate-300">
                              Date de l&apos;échange
                              <input
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={conversationFormState.date}
                                onChange={(event) => updateConversationFormField("date", event.target.value)}
                                required
                                type="date"
                              />
                            </label>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Canal
                              <select
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={conversationFormState.channel}
                                onChange={(event) =>
                                  updateConversationFormField(
                                    "channel",
                                    event.target.value as Prospect["mainPlatform"],
                                  )
                                }
                              >
                                {SOCIAL_PLATFORMS.map((platform) => (
                                  <option key={platform} value={platform}>
                                    {platform}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Résumé de l&apos;échange
                              <textarea
                                className="min-h-20 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                                value={conversationFormState.content}
                                onChange={(event) => updateConversationFormField("content", event.target.value)}
                                placeholder="Résumé court..."
                                required
                              />
                            </label>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Prochaine action
                              <input
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                                value={conversationFormState.nextAction}
                                onChange={(event) => updateConversationFormField("nextAction", event.target.value)}
                                placeholder="Relancer, envoyer une info..."
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                                type="submit"
                              >
                                Enregistrer
                              </button>
                              <button
                                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                type="button"
                                onClick={() => {
                                  setConversationFormState(initialConversationFormState);
                                  setActiveConversationProspectId(null);
                                }}
                              >
                                Annuler
                              </button>
                            </div>
                          </form>
                        ) : null}

                        {conversationHistory.length > 0 ? (
                          <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto pr-1">
                            {conversationHistory.map((conversationEntry) => (
                              <div
                                className="rounded-xl border border-white/10 bg-slate-950/40 p-3"
                                key={conversationEntry.id}
                              >
                                <p className="text-xs font-semibold text-slate-300">
                                  {conversationEntry.date} · {conversationEntry.channel}
                                </p>
                                <p className="mt-1 text-sm leading-5 text-white">{conversationEntry.content}</p>
                                {conversationEntry.nextAction ? (
                                  <p className="mt-1 text-xs text-emerald-300">
                                    Prochaine action : {conversationEntry.nextAction}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
