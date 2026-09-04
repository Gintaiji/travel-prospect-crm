"use client";

import { useEffect, useState } from "react";
import {
  parseAssistantCommand,
  type AssistantCommandParseResult,
} from "../lib/assistantCommandParser";
import type { AiCommand } from "../lib/aiCommandTypes";
import {
  appendProspectNote,
  createProspectFromInput,
  updateProspectColorAndTemperature,
  updateProspectNextActionDate,
  type UpdateProspectColorAndTemperatureChanges,
} from "../lib/prospectActions";
import { loadProspects, saveProspects } from "../lib/prospectStorage";
import { getProspectDisplayName, isDateToday } from "../lib/prospectUtils";
import { DEFAULT_APP_SETTINGS, loadSettings } from "../lib/settingsStorage";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_COLOR_TYPES,
  PROSPECT_TEMPERATURES,
  SOCIAL_PLATFORMS,
  type AppSettings,
  type Prospect,
} from "../lib/types";

const exampleCommands = [
  "Ajoute Paul comme prospect jaune",
  "Recherche Marc Dupont",
  "Mets Julie en marché tiède",
  "Ajoute une note à Nicolas : intéressé par les voyages",
];

function getTargetLabel(target: { prospectId?: string; query?: string }) {
  return target.query || target.prospectId || "Non précisé";
}

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split("-");

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getProspectSearchText(prospect: Prospect) {
  return normalizeSearchText(
    [prospect.firstName, prospect.lastName, prospect.displayName].join(" "),
  );
}

function getProspectSearchRank(prospect: Prospect, normalizedQuery: string) {
  const displayName = normalizeSearchText(getProspectDisplayName(prospect));
  const fullName = normalizeSearchText(
    `${prospect.firstName} ${prospect.lastName}`.trim(),
  );
  const searchText = getProspectSearchText(prospect);

  if (displayName === normalizedQuery || fullName === normalizedQuery) {
    return 0;
  }

  if (
    displayName.startsWith(normalizedQuery) ||
    fullName.startsWith(normalizedQuery)
  ) {
    return 1;
  }

  if (searchText.includes(normalizedQuery)) {
    return 2;
  }

  return 3;
}

function searchProspectsByName(prospects: Prospect[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  if (!normalizedQuery) {
    return [];
  }

  return prospects
    .filter((prospect) => {
      const searchText = getProspectSearchText(prospect);

      return (
        searchText.includes(normalizedQuery) ||
        queryTokens.every((queryToken) => searchText.includes(queryToken))
      );
    })
    .sort((firstProspect, secondProspect) => {
      const rankDifference =
        getProspectSearchRank(firstProspect, normalizedQuery) -
        getProspectSearchRank(secondProspect, normalizedQuery);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return getProspectDisplayName(firstProspect).localeCompare(
        getProspectDisplayName(secondProspect),
        "fr",
      );
    });
}

function getTodayFollowUpProspects(prospects: Prospect[]) {
  return prospects.filter(
    (prospect) => prospect.nextActionDate && isDateToday(prospect.nextActionDate),
  );
}

function resolveProspectTarget(
  prospects: Prospect[],
  target: { prospectId?: string; query?: string },
) {
  if (target.prospectId) {
    return {
      label: target.prospectId,
      matches: prospects.filter((prospect) => prospect.id === target.prospectId),
    };
  }

  const query = target.query ?? "";

  return {
    label: query,
    matches: searchProspectsByName(prospects, query),
  };
}

function getSupportedUpdateChanges(
  changes: Extract<AiCommand, { action: "updateProspect" }>["payload"]["changes"],
) {
  const changeKeys = Object.keys(changes);
  const hasUnsupportedChange = changeKeys.some(
    (changeKey) => changeKey !== "colorType" && changeKey !== "temperature",
  );

  if (hasUnsupportedChange) {
    return null;
  }

  const supportedChanges: UpdateProspectColorAndTemperatureChanges = {};

  if (changes.colorType !== undefined) {
    supportedChanges.colorType = changes.colorType;
  }

  if (changes.temperature !== undefined) {
    supportedChanges.temperature = changes.temperature;
  }

  return Object.keys(supportedChanges).length > 0 ? supportedChanges : null;
}

function getUpdateResultItems(changes: UpdateProspectColorAndTemperatureChanges) {
  const updates: Array<{ label: string; value: string }> = [];

  if (changes.colorType !== undefined) {
    updates.push({ label: "Couleur", value: changes.colorType });
  }

  if (changes.temperature !== undefined) {
    updates.push({ label: "March\u00e9", value: changes.temperature });
  }

  return updates;
}

function getUpdateSuccessMessage(
  prospectName: string,
  updates: Array<{ label: string; value: string }>,
) {
  if (updates.length === 1 && updates[0].label === "Couleur") {
    return `Couleur de ${prospectName} modifi\u00e9e : ${updates[0].value}.`;
  }

  if (updates.length === 1 && updates[0].label === "March\u00e9") {
    return `March\u00e9 de ${prospectName} modifi\u00e9 : ${updates[0].value}.`;
  }

  const updateText = updates
    .map((update) => `${update.label} : ${update.value}`)
    .join(" \u00b7 ");

  return `${prospectName} modifi\u00e9 : ${updateText}.`;
}

function getUpdateUnchangedMessage(
  prospectName: string,
  updates: Array<{ label: string; value: string }>,
) {
  if (updates.length === 1 && updates[0].label === "Couleur") {
    return `${prospectName} est d\u00e9j\u00e0 en ${updates[0].value}.`;
  }

  if (updates.length === 1 && updates[0].label === "March\u00e9") {
    return `${prospectName} est d\u00e9j\u00e0 en march\u00e9 ${updates[0].value}.`;
  }

  const updateText = updates
    .map((update) => `${update.label} : ${update.value}`)
    .join(" \u00b7 ");

  return `${prospectName} a d\u00e9j\u00e0 ces valeurs : ${updateText}.`;
}

function buildCreateProspectInput(
  payload: Extract<AiCommand, { action: "createProspect" }>["payload"],
  appSettings: AppSettings,
) {
  return {
    firstName: payload.firstName,
    lastName: payload.lastName ?? "",
    displayName: "",
    meetingPlace: payload.meetingPlace ?? "",
    jobTitle: "",
    businessArea: "",
    city: appSettings.defaultCity,
    region: appSettings.defaultRegion,
    country: appSettings.defaultCountry,
    phone: payload.phone ?? "",
    whatsapp: payload.whatsapp ?? "",
    email: payload.email ?? "",
    mainPlatform: SOCIAL_PLATFORMS[0],
    profileUrl: "",
    socialLinks: {
      facebook: "",
      instagram: "",
      linkedin: "",
      tiktok: "",
      youtube: "",
      other: "",
    },
    category: payload.category ?? PROSPECT_CATEGORIES[0],
    temperature: payload.temperature ?? PROSPECT_TEMPERATURES[0],
    colorType: payload.colorType ?? PROSPECT_COLOR_TYPES[0],
    tags: payload.tags ?? [],
    isFollower: false,
    hasSentMessage: false,
    followerSinceDate: "",
    commentsCount: 0,
    interactionsCount: 0,
    likesCount: 0,
    messagesCount: 0,
    notes: payload.notes ?? "",
  };
}

function ResultLine({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <p className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium text-slate-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </p>
  );
}

function renderCommandSummary(command: AiCommand) {
  if (command.action === "searchProspect") {
    return (
      <>
        <ResultLine label="Action" value="Rechercher un prospect" />
        <ResultLine label="Recherche" value={command.payload.query} />
      </>
    );
  }

  if (command.action === "getTodayFollowUps") {
    return (
      <>
        <ResultLine label="Action" value="Afficher les relances du jour" />
      </>
    );
  }

  if (command.action === "createProspect") {
    return (
      <>
        <ResultLine label="Action" value="Créer un prospect" />
        <ResultLine label="Prénom" value={command.payload.firstName} />
        <ResultLine label="Nom" value={command.payload.lastName} />
        <ResultLine label="Couleur" value={command.payload.colorType} />
        <ResultLine label="Marché" value={command.payload.temperature} />
        <ResultLine label="Statut" value={command.payload.status} />
        <ResultLine label="Catégorie" value={command.payload.category} />
        <ResultLine label="Relance" value={command.payload.nextActionDate} />
        <ResultLine label="Téléphone" value={command.payload.phone} />
        <ResultLine label="WhatsApp" value={command.payload.whatsapp} />
        <ResultLine label="Email" value={command.payload.email} />
        <ResultLine label="Lieu" value={command.payload.meetingPlace} />
        <ResultLine label="Tags" value={command.payload.tags?.join(", ")} />
        <ResultLine label="Note" value={command.payload.notes} />
      </>
    );
  }

  if (command.action === "addNote") {
    return (
      <>
        <ResultLine label="Action" value="Ajouter une note" />
        <ResultLine label="Prospect" value={getTargetLabel(command.payload.target)} />
        <ResultLine label="Note" value={command.payload.note} />
      </>
    );
  }

  if (command.action === "createFollowUp") {
    return (
      <>
        <ResultLine label="Action" value="Programmer une relance" />
        <ResultLine label="Prospect" value={getTargetLabel(command.payload.target)} />
        <ResultLine label="Date" value={formatDisplayDate(command.payload.date)} />
      </>
    );
  }

  return (
    <>
      <ResultLine label="Action" value="Modifier un prospect" />
      <ResultLine label="Prospect" value={getTargetLabel(command.payload.target)} />
      <ResultLine label="Couleur" value={command.payload.changes.colorType} />
      <ResultLine label="Marché" value={command.payload.changes.temperature} />
      <ResultLine label="Statut" value={command.payload.changes.status} />
      <ResultLine label="Catégorie" value={command.payload.changes.category} />
      <ResultLine label="Relance" value={command.payload.changes.nextActionDate} />
      <ResultLine label="Tags" value={command.payload.changes.tags?.join(", ")} />
    </>
  );
}

function ResultPanel({ result }: { result: AssistantCommandParseResult | null }) {
  if (!result) {
    return null;
  }

  if (!result.success) {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">
          Commande non reconnue
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          Essaie une formulation plus simple.
        </h2>
        <p className="mt-3 text-sm leading-6 text-amber-100">
          {result.reason}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-4 shadow-xl sm:p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">
        Commande reconnue
      </p>
      <div className="mt-4 grid gap-3">{renderCommandSummary(result.command)}</div>
    </section>
  );
}

type AssistantSearchResult = {
  query: string;
  matches: Prospect[];
};

type AssistantTodayFollowUpsResult = {
  matches: Prospect[];
};

type AssistantCreateProspectResult =
  | {
      status: "success";
      prospectName: string;
    }
  | {
      status: "emptyFirstName";
    }
  | {
      status: "notReady";
    }
  | {
      status: "error";
    };

type AssistantAddNoteResult =
  | {
      status: "success";
      prospectName: string;
      note: string;
    }
  | {
      status: "notFound";
      targetLabel: string;
    }
  | {
      status: "ambiguous";
      targetLabel: string;
      matches: Prospect[];
    }
  | {
      status: "emptyNote";
    }
  | {
      status: "notReady";
    };

type AssistantCreateFollowUpResult =
  | {
      status: "success";
      prospectName: string;
      date: string;
    }
  | {
      status: "unchanged";
      prospectName: string;
      date: string;
    }
  | {
      status: "notFound";
      targetLabel: string;
    }
  | {
      status: "ambiguous";
      targetLabel: string;
      matches: Prospect[];
    }
  | {
      status: "notReady";
    }
  | {
      status: "error";
    };

type AssistantUpdateProspectResult =
  | {
      status: "success";
      prospectName: string;
      updates: Array<{ label: string; value: string }>;
    }
  | {
      status: "unchanged";
      prospectName: string;
      updates: Array<{ label: string; value: string }>;
    }
  | {
      status: "unsupported";
    }
  | {
      status: "notFound";
      targetLabel: string;
    }
  | {
      status: "ambiguous";
      targetLabel: string;
      matches: Prospect[];
    }
  | {
      status: "notReady";
    };

function ProspectSummary({ prospect }: { prospect: Prospect }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-lg font-bold text-white">
        {getProspectDisplayName(prospect)}
      </h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ResultLine label={"Pr\u00e9nom"} value={prospect.firstName} />
        <ResultLine label="Nom" value={prospect.lastName} />
        <ResultLine label="Couleur" value={prospect.colorType} />
        <ResultLine label={"March\u00e9"} value={prospect.temperature} />
        <ResultLine label="Statut" value={prospect.status} />
        <ResultLine label="Relance" value={prospect.nextActionDate} />
      </div>
    </article>
  );
}

function CreateProspectResultPanel({
  result,
}: {
  result: AssistantCreateProspectResult | null;
}) {
  if (!result) {
    return null;
  }

  if (result.status === "success") {
    return (
      <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
          R{"\u00e9"}sultat
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {"\u2713"} Prospect cr{"\u00e9"}{"\u00e9"} : {result.prospectName}
        </h2>
      </section>
    );
  }

  if (result.status === "notReady") {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-slate-300">
          Chargement des prospects...
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
      <p className="text-sm font-semibold text-amber-100">
        Impossible de cr{"\u00e9"}er ce prospect. Aucune donn{"\u00e9"}e n&apos;a {"\u00e9"}t{"\u00e9"} modifi{"\u00e9"}e.
      </p>
    </section>
  );
}

function AddNoteResultPanel({ result }: { result: AssistantAddNoteResult | null }) {
  if (!result) {
    return null;
  }

  if (result.status === "success") {
    return (
      <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
          R{"\u00e9"}sultat
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          Note ajout{"\u00e9"}e {"\u00e0"} {result.prospectName}.
        </h2>
        <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm leading-6 text-slate-100">
          {result.note}
        </p>
      </section>
    );
  }

  if (result.status === "notFound") {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Je n&apos;ai trouv{"\u00e9"} aucun prospect correspondant {"\u00e0"}{" "}
          {"\u00ab"} {result.targetLabel} {"\u00bb"}.
        </p>
      </section>
    );
  }

  if (result.status === "emptyNote") {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          La note est vide. Aucune donn{"\u00e9"}e n&apos;a {"\u00e9"}t{"\u00e9"} modifi{"\u00e9"}e.
        </p>
      </section>
    );
  }

  if (result.status === "notReady") {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-slate-300">
          Chargement des prospects...
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
      <p className="text-sm font-semibold text-amber-100">
        Plusieurs prospects correspondent {"\u00e0"} {"\u00ab"} {result.targetLabel}{" "}
        {"\u00bb"}. Pr{"\u00e9"}cise lequel.
      </p>
      <div className="mt-4 grid gap-3">
        {result.matches.map((prospect) => (
          <article
            className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
            key={prospect.id}
          >
            <h3 className="text-base font-bold text-white">
              {getProspectDisplayName(prospect)}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {[prospect.colorType, prospect.temperature, prospect.status]
                .filter(Boolean)
                .join(" \u00b7 ")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CreateFollowUpResultPanel({
  result,
}: {
  result: AssistantCreateFollowUpResult | null;
}) {
  if (!result) {
    return null;
  }

  if (result.status === "success") {
    return (
      <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
          R{"\u00e9"}sultat
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {"\u2713"} Relance de {result.prospectName} programm{"\u00e9"}e pour le{" "}
          {formatDisplayDate(result.date)}.
        </h2>
      </section>
    );
  }

  if (result.status === "unchanged") {
    return (
      <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
          R{"\u00e9"}sultat
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {result.prospectName} est d{"\u00e9"}j{"\u00e0"} pr{"\u00e9"}vue en relance le{" "}
          {formatDisplayDate(result.date)}.
        </h2>
      </section>
    );
  }

  if (result.status === "notReady") {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-slate-300">
          Chargement des prospects...
        </p>
      </section>
    );
  }

  if (result.status === "notFound") {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Aucun prospect trouv{"\u00e9"} pour {"\u00ab"} {result.targetLabel}{" "}
          {"\u00bb"}.
        </p>
      </section>
    );
  }

  if (result.status === "ambiguous") {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Plusieurs prospects correspondent {"\u00e0"} {"\u00ab"}{" "}
          {result.targetLabel} {"\u00bb"}. Pr{"\u00e9"}cise lequel.
        </p>
        <div className="mt-4 grid gap-3">
          {result.matches.map((prospect) => (
            <article
              className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
              key={prospect.id}
            >
              <h3 className="text-base font-bold text-white">
                {getProspectDisplayName(prospect)}
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                {[prospect.colorType, prospect.temperature, prospect.status]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
              </p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
      <p className="text-sm font-semibold text-amber-100">
        Impossible de programmer cette relance. Aucune donn{"\u00e9"}e n&apos;a{" "}
        {"\u00e9"}t{"\u00e9"} modifi{"\u00e9"}e.
      </p>
    </section>
  );
}

function UpdateProspectResultPanel({
  result,
}: {
  result: AssistantUpdateProspectResult | null;
}) {
  if (!result) {
    return null;
  }

  if (result.status === "notReady") {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-slate-300">
          Chargement des prospects...
        </p>
      </section>
    );
  }

  if (result.status === "unsupported") {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Cette modification n&apos;est pas encore activ{"\u00e9"}e.
        </p>
      </section>
    );
  }

  if (result.status === "notFound") {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Aucun prospect trouv{"\u00e9"} pour {"\u00ab"} {result.targetLabel}{" "}
          {"\u00bb"}.
        </p>
      </section>
    );
  }

  if (result.status === "ambiguous") {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Plusieurs prospects correspondent {"\u00e0"} {"\u00ab"}{" "}
          {result.targetLabel} {"\u00bb"}. Pr{"\u00e9"}cise lequel.
        </p>
        <div className="mt-4 grid gap-3">
          {result.matches.map((prospect) => (
            <article
              className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
              key={prospect.id}
            >
              <h3 className="text-base font-bold text-white">
                {getProspectDisplayName(prospect)}
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                {[prospect.colorType, prospect.temperature, prospect.status]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
              </p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (result.status === "unchanged") {
    return (
      <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
          R{"\u00e9"}sultat
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {getUpdateUnchangedMessage(result.prospectName, result.updates)}
        </h2>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
        R{"\u00e9"}sultat
      </p>
      <h2 className="mt-3 text-xl font-bold text-white">
        {getUpdateSuccessMessage(result.prospectName, result.updates)}
      </h2>
    </section>
  );
}

function TodayFollowUpsResultPanel({
  result,
  hasLoadedProspects,
}: {
  result: AssistantTodayFollowUpsResult | null;
  hasLoadedProspects: boolean;
}) {
  if (!result) {
    return null;
  }

  if (!hasLoadedProspects) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-slate-300">
          Chargement des prospects...
        </p>
      </section>
    );
  }

  if (result.matches.length === 0) {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Aucune relance pr{"\u00e9"}vue aujourd&apos;hui.
        </p>
      </section>
    );
  }

  if (result.matches.length === 1) {
    return (
      <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
          R{"\u00e9"}sultat
        </p>
        <p className="mt-3 text-sm font-semibold text-cyan-50">
          1 relance pr{"\u00e9"}vue aujourd&apos;hui
        </p>
        <div className="mt-4">
          <ProspectSummary prospect={result.matches[0]} />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
        R{"\u00e9"}sultat
      </p>
      <p className="mt-3 text-sm font-semibold text-cyan-50">
        {result.matches.length} relances pr{"\u00e9"}vues aujourd&apos;hui
      </p>
      <div className="mt-4 grid gap-3">
        {result.matches.map((prospect) => (
          <ProspectSummary prospect={prospect} key={prospect.id} />
        ))}
      </div>
    </section>
  );
}

function SearchResultPanel({
  result,
  hasLoadedProspects,
}: {
  result: AssistantSearchResult | null;
  hasLoadedProspects: boolean;
}) {
  if (!result) {
    return null;
  }

  if (!hasLoadedProspects) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-slate-300">
          Chargement des prospects...
        </p>
      </section>
    );
  }

  if (result.matches.length === 0) {
    return (
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold text-amber-100">
          Aucun prospect trouv{"\u00e9"} pour {"\u00ab"} {result.query} {"\u00bb"}.
        </p>
      </section>
    );
  }

  if (result.matches.length === 1) {
    return (
      <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
          Prospect trouv{"\u00e9"}
        </p>
        <div className="mt-4">
          <ProspectSummary prospect={result.matches[0]} />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl sm:p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
        Prospects trouv{"\u00e9"}s
      </p>
      <p className="mt-3 text-sm text-cyan-50">
        {result.matches.length} r{"\u00e9"}sultats pour {"\u00ab"} {result.query}{" "}
        {"\u00bb"}.
      </p>
      <div className="mt-4 grid gap-3">
        {result.matches.map((prospect) => (
          <article
            className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
            key={prospect.id}
          >
            <h3 className="text-base font-bold text-white">
              {getProspectDisplayName(prospect)}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {[
                prospect.colorType,
                prospect.temperature,
                prospect.status,
                prospect.nextActionDate ? `Relance ${prospect.nextActionDate}` : "",
              ]
                .filter(Boolean)
                .join(" \u00b7 ")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function AssistantPage() {
  const [commandText, setCommandText] = useState("");
  const [parseResult, setParseResult] =
    useState<AssistantCommandParseResult | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [hasLoadedProspects, setHasLoadedProspects] = useState(false);
  const [searchResult, setSearchResult] = useState<AssistantSearchResult | null>(
    null,
  );
  const [todayFollowUpsResult, setTodayFollowUpsResult] =
    useState<AssistantTodayFollowUpsResult | null>(null);
  const [createProspectResult, setCreateProspectResult] =
    useState<AssistantCreateProspectResult | null>(null);
  const [addNoteResult, setAddNoteResult] =
    useState<AssistantAddNoteResult | null>(null);
  const [createFollowUpResult, setCreateFollowUpResult] =
    useState<AssistantCreateFollowUpResult | null>(null);
  const [updateProspectResult, setUpdateProspectResult] =
    useState<AssistantUpdateProspectResult | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    const loadStoredProspects = window.setTimeout(() => {
      setAppSettings(loadSettings());
      setProspects(loadProspects());
      setHasLoadedProspects(true);
    }, 0);

    return () => window.clearTimeout(loadStoredProspects);
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextParseResult = parseAssistantCommand(commandText);

    setParseResult(nextParseResult);
    setSearchResult(null);
    setTodayFollowUpsResult(null);
    setCreateProspectResult(null);
    setAddNoteResult(null);
    setCreateFollowUpResult(null);
    setUpdateProspectResult(null);

    if (
      nextParseResult.success &&
      nextParseResult.command.action === "searchProspect"
    ) {
      setSearchResult({
        query: nextParseResult.command.payload.query,
        matches: searchProspectsByName(
          prospects,
          nextParseResult.command.payload.query,
        ),
      });
      setTodayFollowUpsResult(null);
      setCreateProspectResult(null);
      setAddNoteResult(null);
      setUpdateProspectResult(null);
      return;
    }

    if (
      nextParseResult.success &&
      nextParseResult.command.action === "getTodayFollowUps"
    ) {
      setTodayFollowUpsResult({
        matches: getTodayFollowUpProspects(prospects),
      });
      setSearchResult(null);
      setCreateProspectResult(null);
      setAddNoteResult(null);
      setUpdateProspectResult(null);
      return;
    }

    if (
      nextParseResult.success &&
      nextParseResult.command.action === "createProspect"
    ) {
      if (!hasLoadedProspects) {
        setCreateProspectResult({ status: "notReady" });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setAddNoteResult(null);
        setUpdateProspectResult(null);
        return;
      }

      if (!nextParseResult.command.payload.firstName.trim()) {
        setCreateProspectResult({ status: "emptyFirstName" });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setAddNoteResult(null);
        setUpdateProspectResult(null);
        return;
      }

      try {
        const newProspect = createProspectFromInput(
          buildCreateProspectInput(nextParseResult.command.payload, appSettings),
        );
        const updatedProspects = [newProspect, ...prospects];

        saveProspects(updatedProspects);
        setProspects(updatedProspects);
        setCreateProspectResult({
          status: "success",
          prospectName: getProspectDisplayName(newProspect),
        });
      } catch {
        setCreateProspectResult({ status: "error" });
      }

      setSearchResult(null);
      setTodayFollowUpsResult(null);
      setAddNoteResult(null);
      setUpdateProspectResult(null);
      return;
    }

    if (
      nextParseResult.success &&
      nextParseResult.command.action === "createFollowUp"
    ) {
      if (!hasLoadedProspects) {
        setCreateFollowUpResult({ status: "notReady" });
        return;
      }

      const { label, matches } = resolveProspectTarget(
        prospects,
        nextParseResult.command.payload.target,
      );

      if (matches.length === 0) {
        setCreateFollowUpResult({ status: "notFound", targetLabel: label });
        return;
      }

      if (matches.length > 1) {
        setCreateFollowUpResult({
          status: "ambiguous",
          targetLabel: label,
          matches,
        });
        return;
      }

      const targetProspect = matches[0];
      const nextActionDate = nextParseResult.command.payload.date;

      if (targetProspect.nextActionDate === nextActionDate) {
        setCreateFollowUpResult({
          status: "unchanged",
          prospectName: getProspectDisplayName(targetProspect),
          date: nextActionDate,
        });
        return;
      }

      try {
        const updatedProspect = updateProspectNextActionDate(
          targetProspect,
          nextActionDate,
        );
        const updatedProspects = prospects.map((prospect) =>
          prospect.id === targetProspect.id ? updatedProspect : prospect,
        );

        saveProspects(updatedProspects);
        setProspects(updatedProspects);
        setCreateFollowUpResult({
          status: "success",
          prospectName: getProspectDisplayName(updatedProspect),
          date: nextActionDate,
        });
      } catch {
        setCreateFollowUpResult({ status: "error" });
      }

      return;
    }

    if (nextParseResult.success && nextParseResult.command.action === "addNote") {
      const trimmedNote = nextParseResult.command.payload.note.trim();

      if (!hasLoadedProspects) {
        setAddNoteResult({ status: "notReady" });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setUpdateProspectResult(null);
        return;
      }

      if (!trimmedNote) {
        setAddNoteResult({ status: "emptyNote" });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setUpdateProspectResult(null);
        return;
      }

      const { label, matches } = resolveProspectTarget(
        prospects,
        nextParseResult.command.payload.target,
      );

      if (matches.length === 0) {
        setAddNoteResult({ status: "notFound", targetLabel: label });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setUpdateProspectResult(null);
        return;
      }

      if (matches.length > 1) {
        setAddNoteResult({
          status: "ambiguous",
          targetLabel: label,
          matches,
        });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setUpdateProspectResult(null);
        return;
      }

      const targetProspect = matches[0];
      const updatedProspect = appendProspectNote(targetProspect, trimmedNote);

      if (updatedProspect === targetProspect) {
        setAddNoteResult({ status: "emptyNote" });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setUpdateProspectResult(null);
        return;
      }

      const updatedProspects = prospects.map((prospect) =>
        prospect.id === targetProspect.id ? updatedProspect : prospect,
      );

      saveProspects(updatedProspects);
      setProspects(updatedProspects);
      setAddNoteResult({
        status: "success",
        prospectName: getProspectDisplayName(updatedProspect),
        note: trimmedNote,
      });
      setSearchResult(null);
      setTodayFollowUpsResult(null);
      setCreateProspectResult(null);
      setUpdateProspectResult(null);
      return;
    }

    if (
      nextParseResult.success &&
      nextParseResult.command.action === "updateProspect"
    ) {
      const supportedChanges = getSupportedUpdateChanges(
        nextParseResult.command.payload.changes,
      );

      if (!supportedChanges) {
        setUpdateProspectResult({ status: "unsupported" });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setAddNoteResult(null);
        return;
      }

      if (!hasLoadedProspects) {
        setUpdateProspectResult({ status: "notReady" });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setAddNoteResult(null);
        return;
      }

      const { label, matches } = resolveProspectTarget(
        prospects,
        nextParseResult.command.payload.target,
      );

      if (matches.length === 0) {
        setUpdateProspectResult({ status: "notFound", targetLabel: label });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setAddNoteResult(null);
        return;
      }

      if (matches.length > 1) {
        setUpdateProspectResult({
          status: "ambiguous",
          targetLabel: label,
          matches,
        });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setAddNoteResult(null);
        return;
      }

      const targetProspect = matches[0];
      const updatedProspect = updateProspectColorAndTemperature(
        targetProspect,
        supportedChanges,
      );
      const updates = getUpdateResultItems(supportedChanges);

      if (updatedProspect === targetProspect) {
        setUpdateProspectResult({
          status: "unchanged",
          prospectName: getProspectDisplayName(targetProspect),
          updates,
        });
        setSearchResult(null);
        setTodayFollowUpsResult(null);
        setCreateProspectResult(null);
        setAddNoteResult(null);
        return;
      }

      const updatedProspects = prospects.map((prospect) =>
        prospect.id === targetProspect.id ? updatedProspect : prospect,
      );

      saveProspects(updatedProspects);
      setProspects(updatedProspects);
      setUpdateProspectResult({
        status: "success",
        prospectName: getProspectDisplayName(updatedProspect),
        updates,
      });
      setSearchResult(null);
      setTodayFollowUpsResult(null);
      setCreateProspectResult(null);
      setAddNoteResult(null);
      return;
    }

    setSearchResult(null);
    setTodayFollowUpsResult(null);
    setCreateProspectResult(null);
    setAddNoteResult(null);
    setUpdateProspectResult(null);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 pb-28 text-white sm:px-6 sm:py-10 md:pb-10">
      <section className="mx-auto grid max-w-4xl gap-6">
        <header>
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Assistant
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Assistant CRM
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Écris une commande pour voir comment le CRM l&apos;interprète.
          </p>
        </header>

        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
          <p className="text-sm font-semibold text-emerald-100">
            Mode local : les créations validées sont enregistrées dans le CRM.
          </p>
        </section>

        <form
          className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
          onSubmit={handleSubmit}
        >
          <label className="grid gap-2 text-sm font-medium text-slate-300">
            Commande texte
            <textarea
              className="min-h-32 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base leading-7 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
              value={commandText}
              onChange={(event) => setCommandText(event.target.value)}
              placeholder="Ajoute Paul comme prospect jaune"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {exampleCommands.map((exampleCommand) => (
                <span
                  className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-slate-300"
                  key={exampleCommand}
                >
                  {exampleCommand}
                </span>
              ))}
            </div>

            <button
              className="min-h-12 rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              type="submit"
            >
              Analyser
            </button>
          </div>
        </form>

        <ResultPanel result={parseResult} />
        <SearchResultPanel
          result={searchResult}
          hasLoadedProspects={hasLoadedProspects}
        />
        <TodayFollowUpsResultPanel
          result={todayFollowUpsResult}
          hasLoadedProspects={hasLoadedProspects}
        />
        <CreateProspectResultPanel result={createProspectResult} />
        <CreateFollowUpResultPanel result={createFollowUpResult} />
        <AddNoteResultPanel result={addNoteResult} />
        <UpdateProspectResultPanel result={updateProspectResult} />
      </section>
    </main>
  );
}
