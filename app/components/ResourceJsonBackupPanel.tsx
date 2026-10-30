"use client";

import { useMemo, useRef, useState } from "react";
import { AccountSessionBoundary, useUserSession } from "./UserSessionProvider";
import { ACCOUNT_SCOPED_RESOURCES_ENABLED } from "../lib/resourceIsolationSettings";
import { createResourceBackupJson, type ResourceImportPreview } from "../lib/resourceBackupJson";
import type { assessResourceRecovery } from "../lib/resourceRecoveryAssessment";
import ResourceManualRecoveryPanel from "./ResourceManualRecoveryPanel";

function download(json: string, filename: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  link.click(); URL.revokeObjectURL(url);
}

export default function ResourceJsonBackupPanel() {
  const session = useUserSession();
  if (!ACCOUNT_SCOPED_RESOURCES_ENABLED) return null;
  return <section className="resource-backup-panel rounded-2xl border border-amber-300/30 p-4">
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
  const [diagnostic, setDiagnostic] = useState<{ status: string; reason: string | null; assessment: ReturnType<typeof assessResourceRecovery> } | null>(null);
  const [backupCheck, setBackupCheck] = useState("Sauvegarde externe absente ou non inspectée.");
  const attempt = useRef(0);
  const capture = { userId: session.userId ?? "", generation: session.generation };
  const api = useMemo(() => createResourceBackupJson({
    enabled: ACCOUNT_SCOPED_RESOURCES_ENABLED, store: session.store,
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
        setMessage(`${preview.destinationCount !== null ? "Récupération nécessaire — aucun remplacement réussi annoncé. " : ""}${error instanceof Error ? error.message : "Chargement impossible."} Conservez les fichiers et le journal ; refaites un diagnostic avant une nouvelle intervention.`);
      }
    } finally { if (current()) setBusy(false); }
  }
  const buttonClass = "min-h-11 rounded-xl border border-white/20 px-4 py-2 disabled:opacity-40";
  return <div className="mt-3 grid gap-3 text-sm">
    <p className="break-all">Compte confirmé : {session.userId}</p>
    <button type="button" className={buttonClass} disabled={busy} onClick={() => void exportResources()}>Exporter uniquement mes ressources isolées</button>
    <button type="button" className={buttonClass} disabled={busy} onClick={() => {
      setBusy(true); setDiagnostic(null); setMessage("");
      void api.exportRecoveryDiagnostic(capture).then(json => {
        if (current()) {
          setDiagnostic(JSON.parse(json));
          download(json, `travel-prospect-crm-diagnostic-ressources-${capture.userId}.json`);
        }
      }).catch(() => { if (current()) setMessage("Diagnostic indisponible : accès, lecture ou verrou impossible. L’intégrité n’a pas pu être déterminée ; aucune corruption ne peut être conclue. Réessayez avec une session confirmée."); })
        .finally(() => { if (current()) setBusy(false); });
    }}>Exporter un diagnostic local sans modifier les données</button>
    {diagnostic && <div role="status" className="grid gap-2 rounded-xl border border-amber-300/30 p-3">
      <p>{diagnostic.status === "ready" ? "Contrôle terminé : aucune récupération requise." : "Récupération nécessaire — examen manuel uniquement."}</p>
      <p>{diagnostic.reason}</p>
      <p>{diagnostic.assessment.corruptionDetected ? "Structure invalide détectée après lecture réussie. Conservez les preuves pour examen." : "Aucune corruption structurelle détectée. Une opération non vérifiée peut rester bloquante."}</p>
      <p>Intégrité (valid = valide, absent = absent, corrupt = invalide) : données {diagnostic.assessment.resourcesIntegrity}, journal {diagnostic.assessment.journalIntegrity}, état {diagnostic.assessment.stateIntegrity}.</p>
      <ul className="list-disc pl-5">{diagnostic.assessment.copies.map((copy, index) => <li key={index}>Copie {index + 1} ({copy.operationId ?? "opération non fiable"}) : avant {copy.before}, candidat {copy.candidate}. « untrusted » : propriétaire non confirmé, copie exclue des options.</li>)}</ul>
      <p>Opération : {diagnostic.assessment.operation ? `${String(diagnostic.assessment.operation.id)} — ${String(diagnostic.assessment.operation.kind)} — ${String(diagnostic.assessment.operation.status)} — propriétaire ${diagnostic.assessment.operation.ownerUserId}` : "non identifiable avec certitude"}.</p>
      <p>Journal : {diagnostic.assessment.journalStorage.journalBytes.toLocaleString("fr-FR")} octets ; état : {diagnostic.assessment.journalStorage.stateBytes.toLocaleString("fr-FR")} octets. Estimation UTF-16 hors clés et surcoût navigateur.</p>
      {diagnostic.assessment.journalStorage.oversized && <p className="text-amber-100">Journal anormalement volumineux (seuil indicatif : 1 Mio). Archiver et examiner avant tout futur nettoyage.</p>}
      <ul className="list-disc pl-5">{diagnostic.assessment.options.map(option => <li key={option}>{option}</li>)}</ul>
      <p>{diagnostic.assessment.retention}</p>
      <p>Analyse ponctuelle : relancer le diagnostic avant une décision. Aucune option de récupération n’est exécutée ici.</p>
    </div>}
    <label>Vérifier une sauvegarde externe pour préparer la récupération (lecture seule)
      <input className="mt-2 block w-full" type="file" accept=".json,application/json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        setBackupCheck("Sauvegarde externe absente ou non inspectée.");
        if (!file) return;
        setBusy(true);
        void file.text().then(json => { session.store.assertCurrent(capture); return api.inspectRecoveryBackup(json, capture); })
          .then(result => { if (current()) setBackupCheck(`Structure valide pour ${result.ownerUserId} : ${result.resourcesCount} ressource(s). Vérifier manuellement le contenu et la date avant toute décision.`); })
          .catch(() => { if (current()) setBackupCheck("Sauvegarde non utilisable : fichier illisible, format invalide ou propriétaire non confirmé. Aucun contenu chargé dans les ressources."); })
          .finally(() => { if (current()) setBusy(false); });
      }} />
    </label>
    <p role="status">{backupCheck}</p>
    <ResourceManualRecoveryPanel />
    <label>Prévisualiser un fichier JSON
      <input className="mt-2 block w-full" type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void previewFile(file); }} />
    </label>
    {preview && <>
      <p>Propriétaire du fichier : {preview.sourceOwnerUserId ?? "inconnu — sauvegarde historique partagée"}. Source : {preview.sourceCount} ressource(s). Destination : {preview.destinationCount === null ? "clé absente" : `${preview.destinationCount} ressource(s)`}.</p>
      <p>Catégories présentes : {preview.categories.join(", ")}. Seules les ressources seront copiées.</p>
      <h3 className="font-bold">Ressources actuelles</h3>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{preview.currentResources === null ? "Destination absente" : JSON.stringify(preview.currentResources, null, 2)}</pre>
      <h3 className="font-bold">Ressources à charger</h3>
      {preview.resources.length === 0 && <p>Liste volontairement vide : le remplacement retirera les ressources de la destination. Les anciennes copies resteront dans le journal.</p>}
      <ul className="max-h-48 list-disc overflow-auto pl-5">{preview.resources.map((resource, index) => <li key={`${index}:${resource.id}`}>{resource.title} — {resource.url}</li>)}</ul>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(preview.resources, null, 2)}</pre>
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
      {preview.destinationCount !== null && <label>Relire la sauvegarde préalable complète enregistrée
        <input className="mt-2 block w-full" type="file" accept=".json,application/json" disabled={busy || !downloaded} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; setSaved(false);
          if (!file) return;
          setBusy(true); setMessage("");
          void file.text().then(json => {
            session.store.assertCurrent(capture); api.verifyImportSafetyBackup(preview, json);
            if (current()) setSaved(true);
          }).catch(() => { if (current()) setMessage("Sauvegarde préalable non vérifiée : sélectionner le fichier complet exact de cet aperçu. Aucun remplacement effectué."); })
            .finally(() => { if (current()) setBusy(false); });
        }} />
      </label>}
      {preview.destinationCount !== null && <p role="status">{saved ? "Sauvegarde préalable complète relue et vérifiée." : "Sauvegarde préalable complète non vérifiée."}</p>}
      {preview.destinationCount === null && <label><input type="checkbox" disabled={!downloaded} checked={saved} onChange={event => setSaved(event.target.checked)} /> J’ai enregistré et vérifié cette sauvegarde préalable.</label>}
      {preview.destinationCount !== null && <label><input type="checkbox" disabled={!preview.replacementAllowed} checked={replace} onChange={event => setReplace(event.target.checked)} /> J’autorise explicitement le remplacement de la destination sauvegardée.</label>}
      {preview.destinationCount !== null && !preview.replacementAllowed && <p className="text-amber-100">Destination déjà présente : remplacement maintenu bloqué. Sa disponibilité nécessite une décision d’activation distincte et la validation de la procédure de récupération.</p>}
      <button type="button" className={buttonClass} disabled={busy || !reviewed || !certain || ownerId !== preview.userId || !downloaded || !saved ||
        (preview.sourceOwnerUserId === null && !legacyVerified) || (preview.destinationCount !== null && (!replace || !preview.replacementAllowed))} onClick={() => void apply()}>Charger uniquement les ressources après vérification</button>
    </>}
    {message && <p role="status" className="text-amber-100">{message}</p>}
  </div>;
}
