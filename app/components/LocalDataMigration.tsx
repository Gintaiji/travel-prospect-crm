"use client";

import { useEffect, useRef, useState } from "react";
import type { createAccountScopedStorage, ValidatedStorageOwner } from "../lib/accountScopedStorage";
import {
  BUSINESS_STORAGE_NAMES, createLegacyDataMigration, LEGACY_MIGRATION_LOCK,
  type MigrationPreview,
} from "../lib/legacyDataMigration";
import { useUserSession } from "./UserSessionProvider";

type Runtime = {
  scoped: ReturnType<typeof createAccountScopedStorage>;
  migration: ReturnType<typeof createLegacyDataMigration>;
  userId: string | null;
  revision: number;
  validateOwner: () => Promise<ValidatedStorageOwner>;
};
const labels = ["Prospects", "Ressources", "Paramètres", "Sondages Street Marketing", "Messages personnalisés"];

export default function LocalDataMigration() {
  const { store } = useUserSession();
  const runtime = useRef<Runtime | null>(null);
  const [account, setAccount] = useState<{ userId: string; email?: string } | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [certain, setCertain] = useState(false);
  const [typedOwner, setTypedOwner] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Lecture du compte connecté…");

  useEffect(() => {
    let disposed = false;
    const scoped = store.scopedStorage;
    const migration = createLegacyDataMigration({
      scoped, getLegacyStorage: () => window.localStorage,
      withExclusiveLock: async operation => {
        if (!navigator.locks) throw new Error("Migration indisponible : ce navigateur ne permet pas le verrouillage entre onglets.");
        return await navigator.locks.request(LEGACY_MIGRATION_LOCK, { mode: "exclusive" }, operation);
      },
    });
    function update() {
      if (disposed) return;
      const state = store.getSnapshot();
      const user = state.status === "connected" ? state.user : null;
      const userId = user?.id ?? null;
      runtime.current = {
        scoped, migration, userId, revision: state.generation,
        validateOwner: async () => {
          if (!userId) throw new Error("Identité non confirmée.");
          const operation = await store.beginOperation({ userId, generation: state.generation });
          return operation.owner;
        },
      };
      setAccount(user ? { userId: user.id, email: user.email } : null);
      setPreview(null); setCertain(false); setTypedOwner("");
      setDownloaded(false); setSaved(false); setBusy(false);
      setMessage(state.error ?? (user ? "Aucune copie effectuée. Vérifiez à qui appartiennent les données historiques." : "Connectez-vous pour préparer une migration."));
      try {
        setSummary(BUSINESS_STORAGE_NAMES.map((name, index) => {
          const raw = window.localStorage.getItem(`travel-prospect-crm-${name}`);
          if (raw === null) return `${labels[index]} : absent`;
          const value: unknown = JSON.parse(raw);
          return `${labels[index]} : ${Array.isArray(value) ? value.length : "présent"}`;
        }));
      } catch { setSummary(["Données illisibles : migration à vérifier manuellement."]); }
    }
    const unsubscribe = store.subscribe(update);
    const initialUpdate = window.setTimeout(update, 0);
    return () => {
      disposed = true; runtime.current = null;
      window.clearTimeout(initialUpdate);
      unsubscribe();
    };
  }, [store]);

  async function showPreview() {
    const captured = runtime.current;
    if (!captured?.userId) return;
    setBusy(true); setPreview(null); setDownloaded(false); setSaved(false);
    setCertain(false); setTypedOwner("");
    try {
      const owner = await captured.validateOwner();
      const next = await captured.migration.preview(owner);
      if (runtime.current !== captured) return;
      setPreview(next);
      setMessage(`Aperçu sans modification : ${next.prospectsCount} prospect(s), ${next.available.length} catégorie(s) disponible(s).`);
    } catch (error) {
      if (runtime.current === captured) setMessage(error instanceof Error ? error.message : "Aperçu impossible.");
    } finally { if (runtime.current === captured) setBusy(false); }
  }

  function downloadBackup() {
    if (!preview || runtime.current?.userId !== preview.userId) return;
    const url = URL.createObjectURL(new Blob([preview.backupJson], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "travel-prospect-crm-avant-migration.json";
    link.click(); URL.revokeObjectURL(url); setDownloaded(true);
  }

  async function copy() {
    const captured = runtime.current;
    if (!captured || !preview || !downloaded || !saved || !certain || typedOwner !== preview.userId) return;
    if (!window.confirm(`Je confirme que toutes ces données appartiennent au compte ${preview.userId}. Copier sans supprimer les anciennes données ?`)) return;
    setBusy(true);
    try {
      await captured.migration.copy(preview, { ownershipCertain: certain, ownerUserId: typedOwner, jsonBackupSaved: downloaded && saved });
      if (runtime.current === captured) {
        setPreview(null);
        setMessage("Copie vérifiée, non activée. Les pages continuent d’utiliser les données historiques. Ne recopiez pas ces données vers un autre compte.");
      }
    } catch (error) {
      if (runtime.current === captured) {
        setPreview(null);
        setMessage(`${error instanceof Error ? error.message : "Échec de copie."} Aucune activation. En cas de copie partielle, conservez les données et la sauvegarde pour une vérification manuelle.`);
      }
    } finally { if (runtime.current === captured) setBusy(false); }
  }

  const buttonClass = "min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40";
  return (
    <section className="rounded-2xl border border-amber-300/30 bg-white/5 p-4 sm:p-5" aria-labelledby="local-migration-title">
      <h2 id="local-migration-title" className="text-xl font-bold">Migration des données locales</h2>
      <p className="mt-2 break-all text-sm">Compte connecté : {account ? `${account.email ?? ""} — ${account.userId}` : "aucun compte validé"}</p>
      <p className="mt-2 text-sm text-slate-300">{summary.join(" · ")}</p>
      <p className="mt-2 text-sm text-amber-100">La connexion ne prouve pas la propriété des données. Si elles appartiennent à Sandra, ne les copiez pas vers Kévin, ou inversement. En cas de doute ou de données mélangées, arrêtez ici.</p>
      <p className="mt-2 text-xs text-slate-400">Dates de sauvegarde et réglages de synchronisation exclus. États temporaires, notifications et préférences de l’appareil non copiés. Aucun changement de lecture des pages.</p>
      <button type="button" className={`${buttonClass} mt-3`} disabled={!account || busy} onClick={() => void showPreview()}>Afficher l’aperçu sans modification</button>
      {preview && (
        <div className="mt-3 grid gap-3 text-sm">
          <p>Catégories à copier : {preview.available.map(name => labels[BUSINESS_STORAGE_NAMES.indexOf(name)]).join(", ")}. Les anciennes clés seront conservées.</p>
          <button type="button" className={buttonClass} disabled={busy} onClick={downloadBackup}>1. Télécharger la sauvegarde JSON préalable</button>
          <label><input type="checkbox" disabled={!downloaded || busy} checked={saved} onChange={event => setSaved(event.target.checked)} /> J’ai enregistré et vérifié le fichier JSON sur mon appareil.</label>
          <label><input type="checkbox" disabled={busy} checked={certain} onChange={event => setCertain(event.target.checked)} /> Je suis certain que toutes ces données appartiennent exclusivement au compte affiché.</label>
          <label>Recopiez l’identifiant du compte propriétaire pour confirmer :
            <input className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950 p-2" value={typedOwner} disabled={busy} autoComplete="off" onChange={event => setTypedOwner(event.target.value)} />
          </label>
          <button type="button" className={buttonClass} disabled={busy || !certain || !saved || !downloaded || typedOwner !== preview.userId} onClick={() => void copy()}>2. Copier vers ce compte sans activer</button>
        </div>
      )}
      <p role="status" className="mt-3 text-sm text-amber-100">{message}</p>
    </section>
  );
}
