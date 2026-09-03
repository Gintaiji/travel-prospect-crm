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

export function createVCardFromProspect(prospect: Prospect) {
  const firstName = prospect.firstName.trim();
  const lastName = prospect.lastName.trim();
  const fullName = getProspectDisplayName(prospect);
  const phone = prospect.phone.trim();
  const whatsapp = prospect.whatsapp.trim();
  const email = prospect.email.trim();
  const city = prospect.city.trim();
  const country = prospect.country.trim();
  const profileUrl = prospect.profileUrl.trim();
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

export async function downloadProspectVCard(prospect: Prospect) {
  const vCardContent = createVCardFromProspect(prospect);
  const fileName = getVCardFileName(prospect);
  const vCardBlob = new Blob([vCardContent], {
    type: "text/vcard;charset=utf-8",
  });

  if (
    typeof File !== "undefined" &&
    navigator.share &&
    navigator.canShare
  ) {
    const vCardFile = new File([vCardBlob], fileName, {
      type: "text/vcard",
    });

    if (navigator.canShare({ files: [vCardFile] })) {
      await navigator.share({
        files: [vCardFile],
        title: getProspectDisplayName(prospect),
      });
      return;
    }
  }

  const downloadUrl = URL.createObjectURL(vCardBlob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);
}

function formatGoogleCalendarDateTime(date: string, time: string) {
  return `${date.replace(/-/g, "")}T${time}`;
}

export function buildGoogleCalendarFollowUpUrl(prospect: Prospect) {
  if (!prospect.nextActionDate) {
    return "";
  }

  const prospectName = getProspectDisplayName(prospect);
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
    text: `Relancer ${prospectName}`,
    dates: `${startDateTime}/${endDateTime}`,
    details: description,
  });

  return `https://calendar.google.com/calendar/render?${calendarParams.toString()}`;
}
