"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabaseClient";

type SessionStatus = {
  isLoading: boolean;
  isConnected: boolean;
  email: string | null;
};

export default function ConnexionPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    isLoading: true,
    isConnected: false,
    email: null,
  });

  async function refreshSession() {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setSessionStatus({
        isLoading: false,
        isConnected: false,
        email: null,
      });
      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      setSessionStatus({
        isLoading: false,
        isConnected: false,
        email: null,
      });
      setMessage(error.message);
      return;
    }

    setSessionStatus({
      isLoading: false,
      isConnected: Boolean(data.session?.user),
      email: data.session?.user.email ?? null,
    });
  }

  useEffect(() => {
    refreshSession();
  }, []);

  function getTrimmedCredentials() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setMessage("Email et mot de passe obligatoires.");
      return null;
    }

    return { email: trimmedEmail, password };
  }

  async function createAccount() {
    setMessage("");

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setMessage("Supabase n'est pas encore configuré.");
      return;
    }

    const credentials = getTrimmedCredentials();

    if (!credentials) {
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      data.user
        ? "Compte créé. Vérifie tes emails si Supabase demande une confirmation."
        : "Demande de création de compte envoyée.",
    );
    await refreshSession();
  }

  async function signIn() {
    setMessage("");

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setMessage("Supabase n'est pas encore configuré.");
      return;
    }

    const credentials = getTrimmedCredentials();

    if (!credentials) {
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Connexion réussie.");
    await refreshSession();
  }

  async function signOut() {
    setMessage("");

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setMessage("Supabase n'est pas encore configuré.");
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Déconnexion réussie.");
    await refreshSession();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 pb-28 text-white sm:px-6 sm:py-10 md:pb-10">
      <section className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Cloud
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Connexion
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Connecte-toi pour préparer la future synchronisation cloud.
          </p>
        </header>

        <div className="grid gap-5">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-xl font-bold text-white">Session</h2>
            <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium leading-6 text-slate-200">
              {sessionStatus.isLoading
                ? "Lecture de la session..."
                : sessionStatus.isConnected
                  ? `Utilisateur connecté${sessionStatus.email ? ` : ${sessionStatus.email}` : "."}`
                  : "Aucun utilisateur connecté."}
            </p>
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
            <form className="grid gap-4" onSubmit={(event) => event.preventDefault()}>
              <label className="grid gap-2 text-sm font-semibold text-emerald-50">
                Email
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/60"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-emerald-50">
                Mot de passe
                <input
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/60"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  className="min-h-11 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
                  type="button"
                  onClick={createAccount}
                >
                  Créer un compte
                </button>
                <button
                  className="min-h-11 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  type="button"
                  onClick={signIn}
                >
                  Se connecter
                </button>
                <button
                  className="min-h-11 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-100"
                  type="button"
                  onClick={signOut}
                >
                  Se déconnecter
                </button>
              </div>
            </form>

            {message ? (
              <p className="mt-5 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm font-medium leading-6 text-white">
                {message}
              </p>
            ) : null}
          </section>

          <Link
            href="/cloud"
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
          >
            Voir l'état cloud
          </Link>
        </div>
      </section>
    </main>
  );
}
