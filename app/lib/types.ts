export type SocialPlatform =
  | "Instagram"
  | "Facebook"
  | "TikTok"
  | "LinkedIn"
  | "Autre";

export type ProspectStatus =
  | "À contacter"
  | "Contact lancé"
  | "Conversation ouverte"
  | "Intérêt voyage détecté"
  | "Présentation proposée"
  | "Présentation faite"
  | "Intéressé"
  | "À relancer"
  | "Pas maintenant"
  | "Refus";

export type ProspectTemperature = "Froid" | "Tiède" | "Chaud";

export type ProspectTag =
  | "Voyage"
  | "Bons plans"
  | "Famille"
  | "Entrepreneur"
  | "Créateur de contenu"
  | "Liberté"
  | "Potentiel partenaire";

export type Prospect = {
  id: string;
  name: string;
  platform: SocialPlatform;
  profileUrl: string;
  status: ProspectStatus;
  temperature: ProspectTemperature;
  score: number;
  tags: ProspectTag[];
  notes: string;
  lastInteractionDate: string;
  nextActionDate: string;
  createdAt: string;
  updatedAt: string;
};