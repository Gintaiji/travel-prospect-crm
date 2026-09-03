import { calculateProspectScore } from "./prospectUtils";
import { createProspectId } from "./prospectStorage";
import type { Prospect } from "./types";

export type UpdateProspectColorAndTemperatureChanges = Partial<
  Pick<Prospect, "colorType" | "temperature">
>;

export type CreateProspectInput = Pick<
  Prospect,
  | "firstName"
  | "lastName"
  | "displayName"
  | "jobTitle"
  | "businessArea"
  | "city"
  | "region"
  | "country"
  | "phone"
  | "whatsapp"
  | "email"
  | "mainPlatform"
  | "profileUrl"
  | "category"
  | "temperature"
  | "colorType"
  | "tags"
  | "isFollower"
  | "hasSentMessage"
  | "notes"
> & {
  meetingPlace: string;
  socialLinks: Prospect["socialLinks"];
  followerSinceDate: string;
  commentsCount: number;
  interactionsCount: number;
  likesCount: number;
  messagesCount: number;
};

export function appendProspectNote(
  prospect: Prospect,
  note: string,
  updatedAt = new Date().toISOString(),
): Prospect {
  const trimmedNote = note.trim();

  if (!trimmedNote) {
    return prospect;
  }

  const existingNotes = prospect.notes.trim();

  return {
    ...prospect,
    notes: existingNotes ? `${existingNotes}\n${trimmedNote}` : trimmedNote,
    updatedAt,
  };
}

export function updateProspectColorAndTemperature(
  prospect: Prospect,
  changes: UpdateProspectColorAndTemperatureChanges,
  updatedAt = new Date().toISOString(),
): Prospect {
  const hasColorTypeChange =
    changes.colorType !== undefined && changes.colorType !== prospect.colorType;
  const hasTemperatureChange =
    changes.temperature !== undefined &&
    changes.temperature !== prospect.temperature;

  if (!hasColorTypeChange && !hasTemperatureChange) {
    return prospect;
  }

  const updatedProspect: Prospect = {
    ...prospect,
    ...(hasColorTypeChange ? { colorType: changes.colorType } : {}),
    ...(hasTemperatureChange ? { temperature: changes.temperature } : {}),
    updatedAt,
  };

  return {
    ...updatedProspect,
    score: calculateProspectScore(updatedProspect),
  };
}

export function createProspectFromInput(
  input: CreateProspectInput,
  now = new Date().toISOString(),
): Prospect {
  const prospectBase: Prospect = {
    id: createProspectId(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    displayName: input.displayName.trim(),
    meetingPlace: input.meetingPlace.trim(),
    jobTitle: input.jobTitle.trim(),
    businessArea: input.businessArea.trim(),
    city: input.city.trim(),
    region: input.region.trim(),
    country: input.country.trim(),
    phone: input.phone.trim(),
    whatsapp: input.whatsapp.trim(),
    email: input.email.trim(),
    mainPlatform: input.mainPlatform,
    profileUrl: input.profileUrl.trim(),
    socialLinks: {
      facebook: input.socialLinks.facebook.trim(),
      instagram: input.socialLinks.instagram.trim(),
      linkedin: input.socialLinks.linkedin.trim(),
      tiktok: input.socialLinks.tiktok.trim(),
      youtube: input.socialLinks.youtube.trim(),
      other: input.socialLinks.other.trim(),
    },
    category: input.category,
    status: "À contacter",
    temperature: input.temperature,
    colorType: input.colorType,
    score: 0,
    tags: input.tags,
    isFollower: input.isFollower,
    hasSentMessage: input.hasSentMessage,
    interactionStats: {
      followerSinceDate: input.followerSinceDate,
      commentsCount: Number.isNaN(input.commentsCount) ? 0 : input.commentsCount,
      interactionsCount: Number.isNaN(input.interactionsCount)
        ? 0
        : input.interactionsCount,
      likesCount: Number.isNaN(input.likesCount) ? 0 : input.likesCount,
      messagesCount: Number.isNaN(input.messagesCount) ? 0 : input.messagesCount,
    },
    lastInteractionDate: "",
    nextActionDate: "",
    conversationHistory: [],
    notes: input.notes.trim(),
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...prospectBase,
    score: calculateProspectScore(prospectBase),
  };
}
