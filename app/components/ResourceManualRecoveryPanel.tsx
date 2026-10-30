"use client";

import { useMemo, useState } from "react";
import { useUserSession } from "./UserSessionProvider";
import { ACCOUNT_SCOPED_RESOURCES_ENABLED } from "../lib/resourceIsolationSettings";
import { createResourceBackupJson, MANUAL_RESOURCE_RECOVERY_ENABLED, type ResourceRecoveryPreview } from "../lib/resourceBackupJson";
import type { ResourceRecoverySpace } from "../lib/resourceRecoverySpace";

export default function ResourceManualRecoveryPanel() {
  const session = useUserSession();
  const api = useMemo(() => createResourceBackupJson({ enabled: ACCOUNT_SCOPED_RESOURCES_ENABLED, store: session.store }), [session.store]);
  const [preview, setPreview] = useState<ResourceRecoveryPreview | null>(null);
  const [selected, setSelected] = useState(0);
  const [verified, setVerified] = useState(false);
  const [owner, setOwner] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [space, setSpace] = useState<ResourceRecoverySpace | null>(null);
  const [verifiedCopies, setVerifiedCopies] = useState(0);
  const capture = { userId: session.userId ?? "", generation: session.generation };
  const current = () => { try { session.store.assertCurrent(capture); return true; } catch { return false; } };
  if (!MANUAL_RESOURCE_RECOVERY_ENABLED) return <p>Récupération manuelle désactivée par défaut. Diagnostic et anciennes copies conservés.</p>;
  async function prepare() {
    setBusy(true); setPreview(null); setSpace(null); setVerifiedCopies(0); setVerified(false); setOwner(""); setReviewed(false); setConfirmed(false); setSelected(0); setMessage("");
    try {
      const result = await api.previewRecovery(capture);
      if (current()) setPreview(result);
      const estimate = await api.inspectRecoverySpace(result, result.copies[0]);
      if (current()) setSpace(estimate);
    }
    catch (error) { if (current()) setMessage(error instanceof Error ? error.message : "Diagnostic indisponible."); }
    finally { if (current()) setBusy(false); }
  }
  function download(json: string, name: string) {
    if (!current()) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = name;
    link.click(); URL.revokeObjectURL(url);
  }
  async function inspectSpace(index = selected) {
    if (!preview) return;
    setBusy(true); setSpace(null); setMessage("");
    try { const result = await api.inspectRecoverySpace(preview, preview.copies[index]); if (current()) setSpace(result); }
    catch (error) { if (current()) setMessage(error instanceof Error ? error.message : "Estimation indisponible."); }
    finally { if (current()) setBusy(false); }
  }
  async function exportCopy() {
    if (!preview) return;
    setBusy(true); setVerifiedCopies(0); setMessage("");
    try {
      const json = await api.exportRecoveryCopy(preview, preview.copies[selected]);
      if (current()) { download(json, `travel-prospect-crm-copie-${preview.userId}-${selected}.json`); setMessage("Copie exportée sans écriture localStorage. Fichier non vérifié : le relire avant de le considérer comme une sauvegarde valide."); }
    } catch (error) { if (current()) setMessage(error instanceof Error ? error.message : "Export refusé."); }
    finally { if (current()) setBusy(false); }
  }
  async function recover() {
    if (!preview || !window.confirm("Récupérer uniquement les ressources affichées pour ce compte ? Les anciennes copies seront conservées.")) return;
    setBusy(true); setMessage("");
    try {
      const result = await api.applyRecovery(preview, preview.copies[selected], { ownerUserId: owner, previewReviewed: reviewed, recoverExplicitly: confirmed });
      if (current()) setMessage(`${result.resourcesCount} ressource(s) récupérée(s), relue(s) et vérifiée(s).`);
    } catch (error) {
      if (current()) setMessage(`Échec : ${error instanceof Error ? error.message : "récupération non vérifiée"}. Conserver les fichiers et refaire un diagnostic avant toute nouvelle intervention.`);
    } finally { if (current()) { setBusy(false); setPreview(null); setVerified(false); } }
  }
  return <section className="grid gap-3 rounded-xl border border-amber-300/30 p-3">
    <h3 className="font-bold">Récupération manuelle des ressources</h3>
    <p>localStorage ne fournit pas de transaction entre les clés. Une interruption peut nécessiter une nouvelle intervention manuelle ; aucune reprise automatique.</p>
    <button type="button" disabled={busy} onClick={() => void prepare()}>Préparer un aperçu de récupération</button>
    {preview && <>
      <label>Copie vérifiée du compte {preview.userId}
        <select value={selected} disabled={busy} onChange={event => { const index = Number(event.target.value); setSelected(index); setReviewed(false); setConfirmed(false); void inspectSpace(index); }}>
          {preview.copies.map((copy, index) => <option key={`${copy.operationId}:${copy.side}`} value={index}>{copy.operationId} — {copy.side === "beforeRaw" ? "avant opération" : "candidat"} — {copy.resources.length} ressource(s)</option>)}
        </select>
      </label>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(preview.copies[selected].resources, null, 2)}</pre>
      <p>Journal : {JSON.parse(preview.diagnosticJson).assessment?.journalStorage?.journalBytes ?? "inconnu"} octets estimés UTF-16. Copies incluses dans le journal : {JSON.parse(preview.diagnosticJson).assessment?.copyStorage?.rawBytes ?? "inconnu"} octets bruts, dont {JSON.parse(preview.diagnosticJson).assessment?.copyStorage?.uniqueRawBytes ?? "inconnu"} octets uniques. Ne pas additionner ces copies au journal.</p>
      <p>Contrôle d’espace : {space ? `${space.availableBytes ?? "inconnu"} octets disponibles estimés ; croissance maximale prévue ${space.requiredAdditionalBytes} octets, réserve ${space.reserveBytes} octets.` : "à effectuer"} Cette estimation ne garantit pas le quota réel du navigateur.</p>
      {space?.status !== "sufficient-estimate" && <p role="status">Récupération par écriture bloquée : espace insuffisant ou inconnu. L’export sans écriture reste disponible.</p>}
      <button type="button" disabled={busy} onClick={() => void inspectSpace()}>Réévaluer l’espace sans écrire</button>
      <button type="button" disabled={busy} onClick={() => void exportCopy()}>Exporter la copie sélectionnée sans écriture localStorage</button>
      <label>Relire la copie JSON exportée pour vérifier propriétaire et SHA-256
        <input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; setVerifiedCopies(0);
          if (!file) return;
          setBusy(true);
          void file.text().then(json => api.verifyRecoveryCopyExport(preview, preview.copies[selected], json))
            .then(result => { if (current()) { setVerifiedCopies(result.verifiedCopies); setMessage(`Copie relue : propriétaire et SHA-256 vérifiés. ${result.verifiedCopies}/${result.totalCopies} copies sauvegardées et vérifiées.`); } })
            .catch(error => { if (current()) setMessage(error instanceof Error ? error.message : "Export non vérifié."); })
            .finally(() => { if (current()) setBusy(false); });
        }} />
      </label>
      <p>{verifiedCopies}/{preview.copies.length} copies exportées puis relues et vérifiées. Un téléchargement seul ne valide aucune sauvegarde.</p>
      <button type="button" disabled={busy} onClick={() => {
        download(preview.diagnosticJson, `travel-prospect-crm-avant-recuperation-${preview.userId}.json`);
      }}>Enregistrer la sauvegarde préalable complète et le diagnostic</button>
      <label>Relire le fichier enregistré pour vérifier la sauvegarde préalable
        <input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; setVerified(false);
          if (!file) return;
          setBusy(true);
          void file.text().then(json => { session.store.assertCurrent(capture); api.verifyRecoverySafetyBackup(preview, json); if (current()) setVerified(true); })
            .catch(() => { if (current()) setMessage("Sauvegarde préalable non vérifiée : sélectionner le fichier exact de cet aperçu."); })
            .finally(() => { if (current()) setBusy(false); });
        }} />
      </label>
      <p>{verified ? "Sauvegarde préalable relue et identique au diagnostic." : "Sauvegarde préalable non vérifiée."}</p>
      {verified && verifiedCopies === preview.copies.length && <aside aria-label="Procédure manuelle après sauvegardes vérifiées">
        <p>Copies et diagnostic relus. Conserver ces fichiers hors du profil du navigateur, puis vérifier leur contenu et leur propriétaire avant toute intervention.</p>
        <p>Pour libérer de l’espace, faire identifier manuellement des données non indispensables de cette origine, avec leur propriétaire et leur sauvegarde vérifiée. Ne pas vider les données du site, ne pas supprimer les ressources, journaux ou marqueurs de récupération. Aucune suppression n’est effectuée ici.</p>
        <p>Après cette intervention, refaire un diagnostic et un contrôle d’espace avant toute récupération. En cas de doute ou sans données supprimables identifiées, conserver les exports et demander une expertise ; ne pas forcer l’écriture.</p>
      </aside>}
      <label>Recopier le propriétaire <input value={owner} disabled={busy} onChange={event => setOwner(event.target.value)} /></label>
      <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} /> J’ai vérifié le contenu de cette copie.</label>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> Je demande explicitement la récupération de cette copie pour ce compte.</label>
      <button type="button" disabled={busy || space?.status !== "sufficient-estimate" || !verified || !reviewed || !confirmed || owner !== preview.userId} onClick={() => void recover()}>Récupérer les ressources de ce compte</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
