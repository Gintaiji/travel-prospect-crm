"use client";

import { useState } from "react";
import {
  APP_BUILD_NAME,
  APP_VERSION,
  APP_VERSION_LABEL,
} from "../lib/appVersion";

type RemoteAppVersion = {
  version?: string;
  label?: string;
  buildName?: string;
  updatedAt?: string;
};

type VersionCheckStatus = "idle" | "checking" | "current" | "available" | "error";

export default function AppVersionChecker() {
  const [status, setStatus] = useState<VersionCheckStatus>("idle");
  const [remoteVersion, setRemoteVersion] = useState<RemoteAppVersion | null>(
    null,
  );

  async function checkVersion() {
    setStatus("checking");
    setRemoteVersion(null);

    try {
      const response = await fetch(`/app-version.json?t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Version unavailable");
      }

      const versionInfo = (await response.json()) as RemoteAppVersion;

      setRemoteVersion(versionInfo);
      setStatus(versionInfo.version === APP_VERSION ? "current" : "available");
    } catch {
      setStatus("error");
    }
  }

  async function updateApplication() {
    if ("caches" in window) {
      const cacheNames = await caches.keys();

      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();

      await Promise.all(
        registrations.map((registration) => registration.update()),
      );
    }

    window.location.reload();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-white">
          Version actuelle : {APP_VERSION_LABEL}
        </p>
        <p className="text-sm leading-6 text-slate-300">{APP_BUILD_NAME}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === "checking"}
          onClick={checkVersion}
          type="button"
        >
          {status === "checking" ? "Vérification..." : "Vérifier la version"}
        </button>

        {status === "available" ? (
          <button
            className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            onClick={updateApplication}
            type="button"
          >
            Mettre à jour l’application
          </button>
        ) : null}
      </div>

      {status === "current" ? (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-medium text-emerald-200">
          Application à jour.
        </p>
      ) : null}

      {status === "available" ? (
        <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-medium leading-6 text-amber-100">
          <p>Nouvelle version disponible.</p>
          <p>
            Version distante :{" "}
            {remoteVersion?.label ?? remoteVersion?.version ?? "inconnue"}
          </p>
        </div>
      ) : null}

      {status === "error" ? (
        <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-medium text-amber-100">
          Impossible de vérifier la version pour le moment.
        </p>
      ) : null}
    </div>
  );
}
