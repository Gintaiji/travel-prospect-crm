import type { Prospect } from "./types";

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function calculateProspectScore(prospect: Prospect) {
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

export function getTodayDateString() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  return formatLocalDate(today);
}

export function getFutureDateString(days: number) {
  const futureDate = new Date();
  futureDate.setHours(12, 0, 0, 0);
  futureDate.setDate(futureDate.getDate() + days);

  return formatLocalDate(futureDate);
}

export function isDateBeforeToday(date: string) {
  return date < getTodayDateString();
}

export function isDateToday(date: string) {
  return date === getTodayDateString();
}

export function getProspectDisplayName(prospect: Prospect) {
  const fullName = `${prospect.firstName} ${prospect.lastName}`.trim();

  return prospect.displayName.trim() || fullName || "Sans nom";
}
