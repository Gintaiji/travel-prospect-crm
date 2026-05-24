"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  canUploadLocalDataSafely,
  getCloudSyncStatus,
  uploadLocalDataToCloud,
  type CloudSyncStatus,
  type UploadSafetyCheck,
} from "../lib/cloudSync";
import { createBrowserSupabaseClient } from "../lib/supabaseClient";

type QuickCloudSyncButtonProps = {
  compact?: boolean;
};

export default function QuickCloudSyncButton({
  compact = false,
}: QuickCloudSyncButtonProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [safetyCheck, setSafetyCheck] = useState<UploadSafetyCheck | null>(null);
  const [message, setMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const buttonClassName = compact
    ? "inline-flex min-h-10 items-center justify-center rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
    : "inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60";
  const secondaryLinkClassName = compact
    ? "inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
    : "inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20";
  const messageClassName = compact
    ? "text-xs font-medium leading-5 text-emerald-100"
    : "text-sm font-medium leading-6 text-emerald-100";

  async function refreshCloudState() {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setIsConnected(false);
      setSyncStatus(null);
      setSafetyCheck(null);
      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.user) {
      setIsConnected(false);
      setSyncStatus(null);
      setSafetyCheck(null);
      return;
    }

    setIsConnected(true);

    try {
      const [status, safety] = await Promise.all([
        getCloudSyncStatus(),
        canUploadLocalDataSafely(),
      ]);

      setSyncStatus(status);
      setSafetyCheck(safety);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible de vérifier l'état cloud.",
      );
    }
  }

  useEffect(() => {
    refreshCloudState();
  }, []);

  async function syncNow() {
    if (safetyCheck && !safetyCheck.canUpload) {
      setMessage(
        "Synchronisation bloquée : restaure d’abord les données cloud sur cet appareil.",
      );
      return;
    }

    const shouldUpload = window.confirm(
      "Envoyer les données locales vers le cloud maintenant ?",
    );

    if (!shouldUpload) {
      return;
    }

    setIsSyncing(true);
    setMessage("");

    try {
      await uploadLocalDataToCloud();
      setMessage(
        compact ? "Données synchronisées." : "Données synchronisées avec le cloud.",
      );
      await refreshCloudState();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Erreur de synchronisation.",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  if (isConnected === false) {
    return (
      <Link href="/connexion" className={secondaryLinkClassName}>
        Se connecter au cloud
      </Link>
    );
  }

  if (safetyCheck && !safetyCheck.canUpload) {
    return (
      <div className="grid gap-2">
        <p className={messageClassName}>
          Synchronisation bloquée : restaure d’abord les données cloud sur cet
          appareil.
        </p>
        <Link
          href="/sauvegarde#protection-anti-ecrasement"
          className={secondaryLinkClassName}
        >
          Ouvrir la sauvegarde
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <button
        className={buttonClassName}
        type="button"
        onClick={syncNow}
        disabled={isConnected === null || isSyncing}
      >
        {isSyncing ? "Synchronisation..." : "Synchroniser maintenant"}
      </button>
      {message ? <p className={messageClassName}>{message}</p> : null}
      {syncStatus && !syncStatus.needsSync && !message ? (
        <p className={messageClassName}>
          {compact ? "Cloud à jour." : "Cloud à jour pour le moment."}
        </p>
      ) : null}
    </div>
  );
}
