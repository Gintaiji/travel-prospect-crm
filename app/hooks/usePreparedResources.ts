"use client";

import { useEffect, useMemo, useState } from "react";
import { useUserSession } from "../components/UserSessionProvider";
import { createResourceAccess, type ResourceAccessResult } from "../lib/resourceAccess";
import { ACCOUNT_SCOPED_RESOURCES_ENABLED } from "../lib/resourceIsolationSettings";
import { loadResources, saveResources } from "../lib/resourceStorage";

export type PreparedResourceState = ResourceAccessResult | {
  status: "disabled" | "loading" | "session-required" | "error";
  label: string;
};

export function usePreparedResources(enabled = ACCOUNT_SCOPED_RESOURCES_ENABLED) {
  const session = useUserSession();
  const { store, status, userId, generation } = session;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; attempt: number; result: PreparedResourceState } | null>(null);
  const access = useMemo(() => createResourceAccess({
    isolated: true, sessionStore: store, legacy: { load: loadResources, save: saveResources },
  }), [store]);

  useEffect(() => {
    if (!enabled || status !== "connected" || !userId) return;
    let active = true;
    const capture = { userId, generation };
    const key = `${userId}:${generation}`;
    void access.load(capture).then(result => {
      if (!active) return;
      store.assertCurrent(capture);
      setLoaded({ key, attempt, result });
    }).catch(error => {
      if (!active) return;
      try { store.assertCurrent(capture); } catch { return; }
      setLoaded({ key, attempt, result: { status: "error", label: error instanceof Error ? error.message : "Lecture des ressources impossible." } });
    });
    return () => { active = false; };
  }, [access, enabled, status, userId, generation, store, attempt]);

  let state: PreparedResourceState;
  if (!enabled) state = { status: "disabled", label: "Stockage historique actif." };
  else if (status === "error") state = { status: "error", label: session.error ?? "Session indisponible." };
  else if (status === "loading") state = { status: "loading", label: "Vérification de la session…" };
  else if (status !== "connected" || !userId) state = { status: "session-required", label: "Connectez-vous pour accéder à vos ressources." };
  // Hide previous-account data during render, BEFORE the next effect/async response.
  else if (loaded?.key !== `${userId}:${generation}` || loaded.attempt !== attempt) {
    state = { status: "loading", label: "Chargement des ressources du compte…" };
  } else state = loaded.result;
  return { state, reload: () => {
    if (status === "error") void store.refresh();
    else setAttempt(value => value + 1);
  } };
}
