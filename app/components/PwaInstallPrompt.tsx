"use client";

import { useEffect, useState } from "react";

const INSTALL_DISMISSED_STORAGE_KEY =
  "travel-prospect-crm-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isMobileUserAgent(userAgent: string) {
  return /android|iphone|ipad|ipod/i.test(userAgent);
}

export default function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setIsMobile(isMobileUserAgent(navigator.userAgent));
    setIsDismissed(localStorage.getItem(INSTALL_DISMISSED_STORAGE_KEY) === "true");

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (!isMounted || isDismissed || !isMobile) {
    return null;
  }

  function dismissPrompt() {
    localStorage.setItem(INSTALL_DISMISSED_STORAGE_KEY, "true");
    setIsDismissed(true);
  }

  async function installApp() {
    if (!installPromptEvent) {
      return;
    }

    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
    } catch (error) {
      console.warn("PWA install prompt failed.", error);
    } finally {
      dismissPrompt();
      setInstallPromptEvent(null);
    }
  }

  return (
    <aside className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md rounded-3xl border border-emerald-400/20 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur md:hidden">
      {installPromptEvent ? (
        <div className="grid gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Installer l’application
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Ajoute Travel Prospect CRM à ton écran d’accueil pour y accéder plus vite.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
              type="button"
              onClick={installApp}
            >
              Installer
            </button>
            <button
              className="min-h-11 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              type="button"
              onClick={dismissPrompt}
            >
              Plus tard
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs leading-5 text-slate-300">
            Sur iPhone : ouvre le menu Partager, puis choisis Sur l’écran d’accueil.
          </p>
          <button
            className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
            type="button"
            onClick={dismissPrompt}
          >
            Plus tard
          </button>
        </div>
      )}
    </aside>
  );
}
