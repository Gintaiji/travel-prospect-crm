"use client";

import { useState } from "react";
import {
  parseAssistantCommand,
  type AssistantCommandParseResult,
} from "../lib/assistantCommandParser";
import type { AiCommand } from "../lib/aiCommandTypes";

const exampleCommands = [
  "Ajoute Paul comme prospect jaune",
  "Recherche Marc Dupont",
  "Mets Julie en marché tiède",
  "Ajoute une note à Nicolas : intéressé par les voyages",
];

function getTargetLabel(target: { prospectId?: string; query?: string }) {
  return target.query || target.prospectId || "Non précisé";
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

export default function AssistantPage() {
  const [commandText, setCommandText] = useState("");
  const [parseResult, setParseResult] =
    useState<AssistantCommandParseResult | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParseResult(parseAssistantCommand(commandText));
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
            Mode test : aucune donnée du CRM n&apos;est modifiée.
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
      </section>
    </main>
  );
}
