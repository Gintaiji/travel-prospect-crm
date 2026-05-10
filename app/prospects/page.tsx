"use client";

import { useEffect, useRef, useState } from "react";
import {
  createProspectId,
  loadProspects,
  saveProspects,
} from "../lib/prospectStorage";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_COLOR_TYPES,
  PROSPECT_STATUSES,
  PROSPECT_TAGS,
  PROSPECT_TEMPERATURES,
  SOCIAL_PLATFORMS,
  type ConversationEntry,
  type Prospect,
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

const MESSAGE_ASSISTANT_SITUATIONS = [
  "Réagir à un post voyage",
  "Premier message privé",
  "Relance douce",
  "Transition vers Travel Advantage",
  "Proposition de présentation",
  "Après un refus / pas maintenant",
] as const;

const MESSAGE_ASSISTANT_STYLES = ["Doux", "Naturel", "Direct"] as const;

type MessageAssistantSituation = (typeof MESSAGE_ASSISTANT_SITUATIONS)[number];
type MessageAssistantStyle = (typeof MESSAGE_ASSISTANT_STYLES)[number];

type MessageAssistantState = {
  situation: MessageAssistantSituation;
  style: MessageAssistantStyle;
  generatedMessage: string;
  copiedProspectId: string | null;
};

function calculateProspectScore(prospect: Prospect) {
  const interactionStats = prospect.interactionStats ?? {
    followerSinceDate: "",
    commentsCount: 0,
    interactionsCount: 0,
    likesCount: 0,
    messagesCount: 0,
  };
  let score = 0;

  if (prospect.isFollower) {
    score += 10;
  }

  if (prospect.hasSentMessage) {
    score += 15;
  }

  score += Math.min(interactionStats.commentsCount * 3, 15);
  score += Math.min(interactionStats.interactionsCount * 2, 20);
  score += Math.min(interactionStats.likesCount, 10);
  score += Math.min(interactionStats.messagesCount * 5, 20);

  if (prospect.temperature === "Tiède") {
    score += 10;
  }

  if (prospect.temperature === "Chaud") {
    score += 20;
  }

  if (prospect.status === "Conversation ouverte") {
    score += 10;
  }

  if (prospect.status === "Intérêt voyage détecté") {
    score += 15;
  }

  if (prospect.status === "Présentation proposée") {
    score += 20;
  }

  if (prospect.status === "Présentation faite") {
    score += 25;
  }

  if (prospect.status === "Intéressé") {
    score += 30;
  }

  if (prospect.status === "Client" || prospect.status === "Partenaire") {
    score += 35;
  }

  if ((prospect.tags ?? []).includes("À éviter")) {
    score -= 30;
  }

  return Math.min(Math.max(score, 0), 100);
}

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

function getProspectDisplayName(prospect: Prospect) {
  const fullName = `${prospect.firstName} ${prospect.lastName}`.trim();

  return prospect.displayName.trim() || fullName || "Prospect sans nom";
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
  copiedProspectId: null,
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

function buildMessageAssistantContext(prospect: Prospect) {
  const firstName = prospect.firstName.trim();
  const displayName = prospect.displayName.trim();
  const city = prospect.city.trim();
  const country = prospect.country.trim();
  const notes = prospect.notes.trim();
  const location = [city, country].filter(Boolean).join(", ");
  const tags = prospect.tags ?? [];
  const tagInsights = [
    tags.includes("Famille") ? "voyages en famille" : "",
    tags.includes("Bons plans") ? "bons plans voyage" : "",
    tags.includes("Entrepreneur") || tags.includes("Business") ? "opportunité ou projet autour du voyage" : "",
  ].filter(Boolean);

  return {
    greetingName: firstName || displayName || "",
    displayName,
    location,
    platform: prospect.mainPlatform,
    temperature: prospect.temperature,
    hasAvoidTag: tags.includes("À éviter"),
    tagHint: tagInsights.length > 0 ? ` J'ai pensé à ${tagInsights.join(", ")}.` : "",
    notesHint: notes ? `J'ai noté aussi : ${notes.slice(0, 120)}${notes.length > 120 ? "..." : ""}` : "",
  };
}

function adaptMessageTone(message: string, style: MessageAssistantStyle) {
  if (style === "Doux") {
    return `${message} Bien sûr, aucun souci si ce n'est pas le moment.`;
  }

  if (style === "Direct") {
    return message.replace("je me demandais", "je voulais te demander");
  }

  return message;
}

function generateProspectMessage(
  prospect: Prospect,
  situation: MessageAssistantSituation,
  style: MessageAssistantStyle,
) {
  const context = buildMessageAssistantContext(prospect);
  const greeting = context.greetingName ? `Hello ${context.greetingName}, ` : "Hello, ";
  const platformMention = context.platform ? `sur ${context.platform}` : "ici";
  const locationMention = context.location ? ` depuis ${context.location}` : "";
  const tagMention = context.tagHint;
  const notesMention = context.notesHint ? ` ${context.notesHint}` : "";
  const warmTemperatureMention =
    context.temperature === "Chaud" || context.temperature === "Tiède"
      ? "Comme tu sembles déjà sensible au sujet du voyage, "
      : "";

  const messageBySituation: Record<MessageAssistantSituation, string> = {
    "Réagir à un post voyage": `${greeting}j'ai vu ton post voyage ${platformMention}${locationMention}, ça m'a donné envie de te demander : c'est une destination que tu recommanderais ?${tagMention}${notesMention}`,
    "Premier message privé": `${greeting}je me permets de t'écrire simplement parce que ton profil m'a interpellé autour du voyage. Tu voyages plutôt pour te déconnecter, découvrir, ou les deux ?${tagMention}${notesMention}`,
    "Relance douce": `${greeting}je reviens vers toi tranquillement, sans pression. Je voulais juste savoir si le sujet voyage t'intéresse toujours, ou si je garde ça pour plus tard.${tagMention}${notesMention}`,
    "Transition vers Travel Advantage": `${greeting}je te demande parce que je travaille aussi autour d'une plateforme liée au voyage. L'idée, c'est d'aider les gens à voyager plus intelligemment avec des avantages membres.${tagMention} Si ça t'intrigue, je peux t'expliquer simplement.`,
    "Proposition de présentation": `${greeting}${warmTemperatureMention}je peux te montrer le concept en quelques minutes, simplement, pour que tu voies si ça te parle.${tagMention} Si ce n'est pas le bon moment, aucun problème.`,
    "Après un refus / pas maintenant": `${greeting}merci pour ton retour, je comprends totalement. Je ne veux pas forcer les choses. Je garde la porte ouverte, et on pourra en reparler plus tard si le sujet voyage revient au bon moment pour toi.`,
  };

  return adaptMessageTone(messageBySituation[situation], style);
}

export default function ProspectsPage () {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [backupMessage, setBackupMessage] = useState("");
  const [isBackupError, setIsBackupError] = useState(false);

  useEffect(() => {
    const storedProspects = loadProspects();
    setProspects(storedProspects);
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

  function updateMessageAssistantField<Field extends keyof Omit<MessageAssistantState, "copiedProspectId">>(
    field: Field,
    value: MessageAssistantState[Field],
  ) {
    setMessageAssistantState((currentState) => ({
      ...currentState,
      [field]: value,
      copiedProspectId: null,
    }));
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

  function handleDeleteProspect(prospectId: string) {
    const confirmed = window.confirm("Supprimer ce prospect ? Cette action est définitive.");

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

  function handleGenerateProspectMessage(prospect: Prospect) {
    setMessageAssistantState((currentState) => ({
      ...currentState,
      generatedMessage: generateProspectMessage(
        prospect,
        currentState.situation,
        currentState.style,
      ),
      copiedProspectId: null,
    }));
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

  function handleExportProspects() {
    const today = new Date().toISOString().slice(0, 10);
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

  function resetImportFileInput() {
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  }

  function showInvalidImportMessage() {
    setBackupMessage("Fichier invalide. Import impossible.");
    setIsBackupError(true);
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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const todayDate = new Date().toISOString().slice(0, 10);
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
  const isDetailedView = prospectViewMode === "detailed";

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
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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

            <div className="flex w-full flex-wrap gap-2 md:w-auto">
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
                    Date d'inscription / follow
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
                    Nombre d'interactions
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
                    const name = prospect.displayName?.trim()
                      ? prospect.displayName
                      : `${prospect.firstName} ${prospect.lastName}`;
                    const lastConversationEntry =
                      prospect.conversationHistory.length > 0
                        ? prospect.conversationHistory[prospect.conversationHistory.length - 1]
                        : null;
                    const dateComparison = compareDateStrings(prospect.nextActionDate, todayDate);
                    const followUpStatus =
                      dateComparison < 0
                        ? "En retard"
                        : dateComparison === 0
                          ? "Aujourd'hui"
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(7,minmax(0,1fr))]">
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
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">
                    {sortedProspects.length} prospect{sortedProspects.length > 1 ? "s" : ""} affiché{sortedProspects.length > 1 ? "s" : ""} sur {prospects.length}
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
            </section>

            {sortedProspects.length === 0 ? (
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
                const hasAvoidTag = prospectTags.includes("À éviter");
                const lastConversationEntry =
                  conversationHistory.length > 0
                    ? conversationHistory[conversationHistory.length - 1]
                    : null;
                const isConversationFormVisible = activeConversationProspectId === prospect.id;
                const isQualificationFormVisible = activeQualificationProspectId === prospect.id;
                const isFullProspectFormVisible = activeFullProspectId === prospect.id;
                const isMessageAssistantVisible = activeMessageAssistantProspectId === prospect.id;
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

                return (
                  <article
                    key={prospect.id}
                    className="min-w-0 rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl transition hover:border-emerald-400/30 sm:p-5"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
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

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            className="min-h-10 rounded-full border border-sky-400/30 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                            type="button"
                            disabled={!messageAssistantState.generatedMessage}
                            onClick={() => handleCopyProspectMessage(prospect.id)}
                          >
                            Copier le message
                          </button>
                          {messageAssistantState.copiedProspectId === prospect.id ? (
                            <p className="text-xs font-medium text-emerald-300">
                              Message copié.
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
                              Date d'inscription / follow
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" value={fullProspectFormState.followerSinceDate} onChange={(event) => updateFullProspectFormField("followerSinceDate", event.target.value)} type="date" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nombre de commentaires
                              <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" min="0" value={fullProspectFormState.commentsCount} onChange={(event) => updateFullProspectFormField("commentsCount", event.target.value)} type="number" />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-300">
                              Nombre d'interactions
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
                                Date d'inscription / follow
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
                              Date de l'échange
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
                              Résumé de l'échange
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
