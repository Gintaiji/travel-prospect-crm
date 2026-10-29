"use client";

import { useMemo, useRef, useState } from "react";
import { AccountSessionBoundary, useUserSession } from "./UserSessionProvider";
import { ACCOUNT_SCOPED_RESOURCES_ENABLED } from "../lib/resourceIsolationSettings";
import { createResourceBackupJson, RESOURCE_BACKUP_LOCK, type ResourceImportPreview } from "../lib/resourceBackupJson";

function download(json: string, filename: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  link.click(); URL.revokeObjectURL(url);
}

export default function ResourceJsonBackupPanel() {
  const session = useUserSession();
  if (!ACCOUNT_SCOPED_RESOURCES_ENABLED) return null;
  return <section className="rounded-2xl border border-amber-300/30 p-4">
    <h2 className="text-xl font-bold">Sauvegarde JSON des ressources isolées</h2>
    <p className="mt-2 text-sm">Ce parcours concerne uniquement les ressources du compte confirmé. Les quatre autres catégories restent historiques et ne seront pas chargées ici.</p>
    <AccountSessionBoundary fallback={<p role="status" className="mt-3 text-amber-100">{session.error ?? "Une session confirmée est nécessaire."}</p>}>
      <ResourceJsonBackupContent />
    </AccountSessionBoundary>
  </section>;
}

function ResourceJsonBackupContent() {
  const session = useUserSession();
  const [preview, setPreview] = useState<ResourceImportPreview | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [certain, setCertain] = useState(false);
  const [legacyVerified, setLegacyVerified] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef(0);
  const capture = { userId: session.userId ?? "", generation: session.generation };
  const api = useMemo(() => createResourceBackupJson({
    enabled: ACCOUNT_SCOPED_RESOURCES_ENABLED, store: session.store,
    withExclusiveLock: async operation => {
      if (!navigator.locks) throw new Error("Verrouillage entre onglets indisponible : chargement refusé.");
      return await navigator.locks.request(RESOURCE_BACKUP_LOCK, { mode: "exclusive" }, operation);
    },
  }), [session.store]);
  const current = () => { try { session.store.assertCurrent(capture); return true; } catch { return false; } };

  async function exportResources() {
    setBusy(true); setMessage("");
    try {
      const json = await api.exportResources(capture);
      if (current()) download(json, `travel-prospect-crm-ressources-${capture.userId}.json`);
    } catch (error) { if (current()) setMessage(error instanceof Error ? error.message : "Export impossible."); }
    finally { if (current()) setBusy(false); }
  }
  async function previewFile(file: File | undefined) {
    const request = ++attempt.current;
    setPreview(null); setCertain(false); setLegacyVerified(false); setReviewed(false);
    setDownloaded(false); setSaved(false); setOwnerId(""); setReplace(false); setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      const json = await file.text();
      session.store.assertCurrent(capture);
      const result = await api.preview(json, capture);
      if (current() && request === attempt.current) setPreview(result);
    } catch (error) {
      if (current() && request === attempt.current) setMessage(error instanceof Error ? error.message : "Aperçu impossible.");
    } finally { if (current() && request === attempt.current) setBusy(false); }
  }
  async function apply() {
    if (!preview || !downloaded) return;
    if (!window.confirm("Remplacer uniquement les ressources de ce compte après sauvegarde de sécurité ?")) return;
    setBusy(true); setMessage("");
    try {
      const result = await api.apply(preview, { ownerUserId: ownerId, ownershipCertain: certain,
        legacyOwnershipVerified: legacyVerified, previewReviewed: reviewed,
        safetyBackupSaved: downloaded && saved, replaceExisting: replace });
      if (current()) { setPreview(null); setMessage(`${result.resourcesCount} ressource(s) copiée(s) et vérifiée(s) pour ce compte. Aucun autre module modifié.`); }
    } catch (error) {
      if (current()) {
        setPreview(null);
        setMessage(`${error instanceof Error ? error.message : "Chargement impossible."} En cas de copie incomplète, conservez les fichiers et le journal pour une récupération manuelle.`);
      }
    } finally { if (current()) setBusy(false); }
  }
  const buttonClass = "min-h-11 rounded-xl border border-white/20 px-4 py-2 disabled:opacity-40";
  return <div className="mt-3 grid gap-3 text-sm">
    <p className="break-all">Compte confirmé : {session.userId}</p>
    <button type="button" className={buttonClass} disabled={busy} onClick={() => void exportResources()}>Exporter uniquement mes ressources isolées</button>
    <label>Prévisualiser un fichier JSON
      <input className="mt-2 block w-full" type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void previewFile(file); }} />
    </label>
    {preview && <>
      <p>Propriétaire du fichier : {preview.sourceOwnerUserId ?? "inconnu — sauvegarde historique partagée"}. Source : {preview.sourceCount} ressource(s). Destination : {preview.destinationCount === null ? "clé absente" : `${preview.destinationCount} ressource(s)`}.</p>
      <p>Catégories présentes : {preview.categories.join(", ")}. Seules les ressources seront copiées.</p>
      <ul className="max-h-48 list-disc overflow-auto pl-5">{preview.resources.map((resource, index) => <li key={`${index}:${resource.id}`}>{resource.title} — {resource.url}</li>)}</ul>
      <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> J’ai vérifié l’aperçu.</label>
      {preview.sourceOwnerUserId === null && <label><input type="checkbox" checked={legacyVerified} onChange={event => setLegacyVerified(event.target.checked)} /> J’ai vérifié manuellement le propriétaire de ce fichier historique. En cas de doute ou de données mélangées, je n’effectue pas ce chargement.</label>}
      <label><input type="checkbox" checked={certain} onChange={event => setCertain(event.target.checked)} /> Ces ressources appartiennent exclusivement au compte affiché.</label>
      <label>Recopiez le user.id du propriétaire
        <input className="mt-1 w-full rounded-lg bg-slate-950 p-2" value={ownerId} autoComplete="off" onChange={event => setOwnerId(event.target.value)} />
      </label>
      <button className={buttonClass} type="button" disabled={busy} onClick={() => {
        if (!current()) return;
        download(preview.safetyJson, `travel-prospect-crm-avant-chargement-${preview.userId}.json`); setDownloaded(true);
      }}>Télécharger la sauvegarde préalable de la destination</button>
      <label><input type="checkbox" disabled={!downloaded} checked={saved} onChange={event => setSaved(event.target.checked)} /> J’ai enregistré et vérifié cette sauvegarde préalable.</label>
      {preview.destinationCount !== null && <label><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} /> J’autorise explicitement le remplacement de la destination sauvegardée.</label>}
      <button type="button" className={buttonClass} disabled={busy || !reviewed || !certain || ownerId !== preview.userId || !downloaded || !saved ||
        (preview.sourceOwnerUserId === null && !legacyVerified) || (preview.destinationCount !== null && !replace)} onClick={() => void apply()}>Charger uniquement les ressources après vérification</button>
    </>}
    {message && <p role="status" className="text-amber-100">{message}</p>}
  </div>;
}
