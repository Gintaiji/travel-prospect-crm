"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from "../lib/supabaseClient";

export default function CloudPage() {
  const [connectionMessage, setConnectionMessage] = useState("");
  const [sessionMessage, setSessionMessage] = useState("Lecture de la session...");
  const supabaseConfiguredLabel = isSupabaseConfigured() ? "Oui" : "Non";

  async function refreshSession() {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setSessionMessage("Aucun utilisateur connecté.");
      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.user) {
      setSessionMessage("Aucun utilisateur connecté.");
      return;
    }

    setSessionMessage(
      data.session.user.email
        ? `Utilisateur connecté : ${data.session.user.email}`
        : "Utilisateur connecté.",
    );
  }

  useEffect(() => {
    refreshSession();
  }, []);

  async function testSupabaseConnection() {
    setConnectionMessage("");

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setConnectionMessage("Supabase n'est pas encore configuré.");
      return;
    }

    const { error } = await supabase.auth.getSession();

    setConnectionMessage(
      error
        ? "Connexion Supabase impossible pour le moment."
        : "Client Supabase configuré.",
    );

    await refreshSession();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 pb-28 text-white sm:px-6 sm:py-10 md:pb-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Cloud
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Cloud
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Préparation de la future synchronisation en ligne.
          </p>
        </header>

        <div className="grid gap-5">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">Configuration</h2>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm leading-6 text-slate-300">
                Supabase configuré :{" "}
                <span className="font-semibold text-white">
                  {supabaseConfiguredLabel}
                </span>
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">État actuel</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-200">
              <li>Les données sont encore stockées localement.</li>
              <li>Aucune migration cloud n'est encore active.</li>
              <li>
                Cette page sert uniquement à vérifier la connexion Supabase.
              </li>
            </ul>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm leading-6 text-slate-200">
                {sessionMessage}
              </p>
              <Link
                href="/connexion"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                Connexion
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-emerald-100">
                  Test de connexion
                </h2>
                <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                  Aucun prospect, ressource ou paramètre n'est envoyé pendant ce
                  test.
                </p>
              </div>
              <button
                className="min-h-11 w-fit rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
                type="button"
                onClick={testSupabaseConnection}
              >
                Tester la connexion Supabase
              </button>
            </div>

            {connectionMessage ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium text-white">
                {connectionMessage}
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
