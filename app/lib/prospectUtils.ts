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
  const fullName = `${safeTrim(prospect.firstName)} ${safeTrim(prospect.lastName)}`.trim();

  return safeTrim(prospect.displayName) || fullName || "Sans nom";
}

function safeTrim(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function escapeVCardText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldVCardLine(line: string) {
  const maxLineLength = 75;
  const foldedLines: string[] = [];
  let remainingLine = line;

  while (remainingLine.length > maxLineLength) {
    foldedLines.push(remainingLine.slice(0, maxLineLength));
    remainingLine = ` ${remainingLine.slice(maxLineLength)}`;
  }

  foldedLines.push(remainingLine);

  return foldedLines.join("\r\n");
}

function getVCardFileName(prospect: Prospect) {
  const prospectName = getProspectDisplayName(prospect)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `prospect-${prospectName || "contact"}.vcf`;
}

function getVCardNameParts(prospect: Prospect) {
  const firstName = safeTrim(prospect.firstName);
  const lastName = safeTrim(prospect.lastName);

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const displayName = safeTrim(prospect.displayName);

  if (!displayName) {
    return { firstName: "", lastName: "" };
  }

  const [displayFirstName = "", ...displayLastNameParts] = displayName.split(/\s+/);

  return {
    firstName: displayFirstName,
    lastName: displayLastNameParts.join(" "),
  };
}

export function createVCardFromProspect(prospect: Prospect) {
  const { firstName, lastName } = getVCardNameParts(prospect);
  const fullName = getProspectDisplayName(prospect);
  const phone = safeTrim(prospect.phone);
  const whatsapp = safeTrim(prospect.whatsapp);
  const email = safeTrim(prospect.email);
  const city = safeTrim(prospect.city);
  const country = safeTrim(prospect.country);
  const profileUrl = safeTrim(prospect.profileUrl);
  const notes = ["Contact exporté depuis Travel Prospect CRM"];

  if (whatsapp) {
    notes.push(`WhatsApp : ${whatsapp}`);
  }

  const vCardLines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCardText(lastName)};${escapeVCardText(firstName)};;;`,
    `FN:${escapeVCardText(fullName)}`,
    phone ? `TEL;TYPE=CELL:${escapeVCardText(phone)}` : "",
    whatsapp ? `TEL;TYPE=CELL;TYPE=WHATSAPP:${escapeVCardText(whatsapp)}` : "",
    email ? `EMAIL;TYPE=INTERNET:${escapeVCardText(email)}` : "",
    city || country
      ? `ADR;TYPE=HOME:;;;${escapeVCardText(city)};;;${escapeVCardText(country)}`
      : "",
    profileUrl ? `URL:${escapeVCardText(profileUrl)}` : "",
    `NOTE:${escapeVCardText(notes.join("\n"))}`,
    "END:VCARD",
  ].filter(Boolean);

  return `${vCardLines.map(foldVCardLine).join("\r\n")}\r\n`;
}

export type ProspectVCardExportResult = "downloaded" | "shared" | "dismissed";

function isShareDismissError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NotAllowedError")
  );
}

export async function downloadProspectVCard(
  prospect: Prospect,
): Promise<ProspectVCardExportResult> {
  const vCardContent = createVCardFromProspect(prospect);
  const fileName = getVCardFileName(prospect);
  const vCardBlob = new Blob([vCardContent], {
    type: "text/vcard;charset=utf-8",
  });

  console.info("[VCARD] generated", { fileName });

  try {
    const downloadUrl = URL.createObjectURL(vCardBlob);
    const downloadLink = document.createElement("a");

    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    downloadLink.rel = "noopener";
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    console.info("[VCARD] download triggered", { fileName });

    return "downloaded";
  } catch (downloadError) {
    console.error("[VCARD] download failed", downloadError);
  }

  if (
    typeof navigator !== "undefined" &&
    typeof File !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  ) {
    const vCardFile = new File([vCardBlob], fileName, {
      type: "text/vcard",
    });
    let canShareFile = false;

    try {
      canShareFile = navigator.canShare({ files: [vCardFile] });
    } catch {
      canShareFile = false;
    }

    if (canShareFile) {
      try {
        await navigator.share({
          files: [vCardFile],
          title: getProspectDisplayName(prospect),
        });
        return "shared";
      } catch (error) {
        if (isShareDismissError(error)) {
          return "dismissed";
        }

        throw error;
      }
    }
  }
  throw new Error("VCard export failed");
}

function formatGoogleCalendarDateTime(date: string, time: string) {
  return `${date.replace(/-/g, "")}T${time}`;
}

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function getFollowUpTitleFromAction(nextAction: string) {
  const followUpMatch = nextAction.trim().match(/^Relance\s+(2|4|30)\s+jours?$/i);

  if (!followUpMatch) {
    return "";
  }

  return `Relance ${followUpMatch[1]} jours`;
}

function getLastExplicitFollowUpTitle(prospect: Prospect) {
  const conversationHistory = prospect.conversationHistory ?? [];

  for (let index = conversationHistory.length - 1; index >= 0; index -= 1) {
    const followUpTitle = getFollowUpTitleFromAction(
      conversationHistory[index]?.nextAction ?? "",
    );

    if (followUpTitle) {
      return followUpTitle;
    }
  }

  return "";
}

function getFollowUpTitleFromDate(nextActionDate: string) {
  const todayDate = parseLocalDate(getTodayDateString());
  const followUpDate = parseLocalDate(nextActionDate);

  if (!todayDate || !followUpDate) {
    return "";
  }

  const oneDayMs = 24 * 60 * 60 * 1000;
  const daysUntilFollowUp = Math.round(
    (followUpDate.getTime() - todayDate.getTime()) / oneDayMs,
  );

  if (daysUntilFollowUp === 2 || daysUntilFollowUp === 4 || daysUntilFollowUp === 30) {
    return `Relance ${daysUntilFollowUp} jours`;
  }

  return "";
}

function getGoogleCalendarFollowUpTitle(prospect: Prospect) {
  return (
    getLastExplicitFollowUpTitle(prospect) ||
    getFollowUpTitleFromDate(prospect.nextActionDate) ||
    "Relance"
  );
}

export function buildGoogleCalendarFollowUpUrl(prospect: Prospect) {
  if (!prospect.nextActionDate) {
    return "";
  }

  const prospectName = getProspectDisplayName(prospect);
  const followUpTitle = getGoogleCalendarFollowUpTitle(prospect);
  const startDateTime = formatGoogleCalendarDateTime(
    prospect.nextActionDate,
    "180000",
  );
  const endDateTime = formatGoogleCalendarDateTime(
    prospect.nextActionDate,
    "183000",
  );
  const description = [
    prospect.phone ? `Téléphone : ${prospect.phone}` : "Téléphone : non renseigné",
    `Statut : ${prospect.status}`,
    prospect.notes ? `Notes : ${prospect.notes}` : "",
    "Relance créée depuis Travel Prospect CRM",
  ]
    .filter(Boolean)
    .join("\n");
  const calendarParams = new URLSearchParams({
    action: "TEMPLATE",
    text: `${followUpTitle} — ${prospectName}`,
    dates: `${startDateTime}/${endDateTime}`,
    details: description,
  });

  return `https://calendar.google.com/calendar/render?${calendarParams.toString()}`;
}
