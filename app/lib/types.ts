export type SocialPlatform =
  | "Instagram"
  | "Facebook"
  | "TikTok"
  | "LinkedIn"
  | "YouTube"
  | "WhatsApp"
  | "Email"
  | "Téléphone"
  | "Autre";

export type ProspectStatus =
  | "À contacter"
  | "Contact lancé"
  | "Conversation ouverte"
  | "Intérêt voyage détecté"
  | "Présentation proposée"
  | "Présentation faite"
  | "Intéressé"
  | "Client"
  | "Partenaire"
  | "À relancer"
  | "Pas maintenant"
  | "Refus";

export type ProspectTemperature = "Froid" | "Tiède" | "Chaud";

export type ProspectColorType = "Jaune" | "Rouge" | "Bleu" | "Vert";

export type ProspectCategory =
  | "Prospect"
  | "Client"
  | "Connaissance"
  | "Famille"
  | "Réseaux sociaux"
  | "Entreprise"
  | "Partenariat";

export type ProspectTag =
  | "Voyage"
  | "Bons plans"
  | "Famille"
  | "Entrepreneur"
  | "Créateur de contenu"
  | "Liberté"
  | "Potentiel partenaire"
  | "Hôtel"
  | "Vacances"
  | "Business"
  | "Revenus complémentaires"
  | "Bien-être"
  | "À éviter";

export type SocialLinks = {
  facebook: string;
  instagram: string;
  linkedin: string;
  tiktok: string;
  youtube: string;
  other: string;
};

export type ProspectInteractionStats = {
  followerSinceDate: string;
  commentsCount: number;
  interactionsCount: number;
  likesCount: number;
  messagesCount: number;
};

export type ConversationEntry = {
  id: string;
  date: string;
  channel: SocialPlatform;
  content: string;
  nextAction: string;
};

export type Prospect = {
  id: string;

  firstName: string;
  lastName: string;
  displayName: string;

  jobTitle: string;
  businessArea: string;

  city: string;
  region: string;
  country: string;

  phone: string;
  whatsapp: string;
  email: string;

  mainPlatform: SocialPlatform;
  profileUrl: string;
  socialLinks: SocialLinks;

  category: ProspectCategory;
  status: ProspectStatus;
  temperature: ProspectTemperature;
  colorType: ProspectColorType;
  score: number;
  tags: ProspectTag[];

  isFollower: boolean;
  hasSentMessage: boolean;
  interactionStats: ProspectInteractionStats;

  lastInteractionDate: string;
  nextActionDate: string;

  conversationHistory: ConversationEntry[];
  notes: string;

  createdAt: string;
  updatedAt: string;
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  "Instagram",
  "Facebook",
  "TikTok",
  "LinkedIn",
  "YouTube",
  "WhatsApp",
  "Email",
  "Téléphone",
  "Autre",
];

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "À contacter",
  "Contact lancé",
  "Conversation ouverte",
  "Intérêt voyage détecté",
  "Présentation proposée",
  "Présentation faite",
  "Intéressé",
  "Client",
  "Partenaire",
  "À relancer",
  "Pas maintenant",
  "Refus",
];

export const PROSPECT_TEMPERATURES: ProspectTemperature[] = [
  "Froid",
  "Tiède",
  "Chaud",
];

export const PROSPECT_COLOR_TYPES: ProspectColorType[] = [
  "Jaune",
  "Rouge",
  "Bleu",
  "Vert",
];

export const PROSPECT_CATEGORIES: ProspectCategory[] = [
  "Prospect",
  "Client",
  "Connaissance",
  "Famille",
  "Réseaux sociaux",
  "Entreprise",
  "Partenariat",
];

export const PROSPECT_TAGS: ProspectTag[] = [
  "Voyage",
  "Bons plans",
  "Famille",
  "Entrepreneur",
  "Créateur de contenu",
  "Liberté",
  "Potentiel partenaire",
  "Hôtel",
  "Vacances",
  "Business",
  "Revenus complémentaires",
  "Bien-être",
  "À éviter",
];