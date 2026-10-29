"use client";

import { useEffect, useRef, useState } from "react";
import { AccountSessionBoundary } from "./UserSessionProvider";
import { usePreparedResources, type PreparedResourceState } from "../hooks/usePreparedResources";
import type { AvailableResources } from "../lib/resourceAccess";
import ResourceAccountInitialization from "./ResourceAccountInitialization";

export function ResourceAccessNotice({ state, reload }: { state: PreparedResourceState; reload?: () => void }) {
  if (state.status === "available" || state.status === "disabled") return null;
  return <div role="status" className="my-3 rounded-xl border border-amber-300/30 p-3 text-sm text-amber-100">
    <p>{state.label}</p>
    {(state.status === "migration-required" || state.status === "fresh-account") && <a className="mt-2 block underline" href="/sauvegarde#local-migration-title">Ouvrir la migration manuelle</a>}
    {state.status === "fresh-account" && reload && <ResourceAccountInitialization reload={reload} />}
    {reload && <button className="mt-2 min-h-10 underline" type="button" onClick={reload}>Recharger les ressources</button>}
  </div>;
}

/** Resource-only UI in a legacy prospect page: never writes an unowned prospect. */
export function IsolatedProspectResources({ message }: { message?: string }) {
  const { state } = usePreparedResources(true);
  return <AccountSessionBoundary fallback={<ResourceAccessNotice state={state} />}>
    <IsolatedProspectResourceContent state={state} message={message} />
  </AccountSessionBoundary>;
}

function IsolatedProspectResourceContent({ state, message }: { state: PreparedResourceState; message?: string }) {
  if (state.status !== "available") return <ResourceAccessNotice state={state} />;
  return <AvailableProspectResources access={state} message={message} />;
}

function AvailableProspectResources({ access, message }: { access: AvailableResources; message?: string }) {
  const [selectedId, setSelectedId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, [mounted]);
  const resources = [...access.resources].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.title.localeCompare(b.title, "fr"));
  const selected = resources.find(resource => resource.id === selectedId);
  async function copy(withMessage: boolean) {
    try {
      access.assertCurrent();
      if (!selected || !navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(withMessage ? `${message?.trim() ?? ""}\n\n${selected.url}`.trim() : selected.url);
      access.assertCurrent();
      if (mounted.current) setFeedback("Copié.");
    } catch (failure) {
      if (mounted.current && access.isCurrent()) setError(failure instanceof Error ? failure.message : "Copie impossible.");
    }
  }
  return <div className="my-3 grid gap-3 rounded-xl border border-white/10 p-3 text-sm">
    <p>Ressources du compte connecté</p>
    {resources.length === 0 ? <p>Aucune ressource enregistrée pour ce compte.</p> : <>
      <label>Ressource à partager
        <select className="mt-1 w-full rounded-lg bg-slate-950 p-2" value={selectedId} onChange={event => { setSelectedId(event.target.value); setFeedback(""); }}>
          <option value="">Aucune ressource</option>
          {resources.map(resource => <option key={resource.id} value={resource.id}>{resource.title} · {resource.type}</option>)}
        </select>
      </label>
      {selected && <>
        <p>{selected.title}</p><p className="break-all">{selected.url}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="min-h-10 underline" onClick={() => void copy(false)}>Copier le lien</button>
          {message && <button type="button" className="min-h-10 underline" onClick={() => void copy(true)}>Copier message + ressource</button>}
          <a className="inline-flex min-h-10 items-center underline" href={selected.url} onClick={event => { if (!access.isCurrent()) event.preventDefault(); }} target="_blank" rel="noreferrer">Ouvrir</a>
        </div>
      </>}
    </>}
    <p className="text-xs text-amber-100">L’ajout à l’historique et la relance automatique depuis une ressource restent indisponibles tant que les fiches prospects ne sont pas isolées et leur propriétaire confirmé.</p>
    {feedback && <p role="status">{feedback}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
