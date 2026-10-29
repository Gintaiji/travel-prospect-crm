import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createAccountScopedStorage } from "./accountScopedStorage";
import type { ValidatedStorageOwner } from "./accountScopedStorage";
import { createAccountBusinessStorage } from "./accountBusinessStorage";
import { createBrowserSupabaseClient } from "./supabaseClient";

type AuthClient = { auth: Pick<SupabaseClient["auth"], "getSession" | "getUser" | "onAuthStateChange"> };
type SessionUser = Readonly<{ id: string; email?: string }>;
export type SessionCapture = Readonly<{ userId: string; generation: number }>;
export type UserSessionState = Readonly<{
  status: "loading" | "connected" | "disconnected" | "error";
  userId: string | null;
  user: SessionUser | null;
  generation: number;
  expiresAt: number | null;
  error: string | null;
}>;
const INITIAL: UserSessionState = Object.freeze({
  status: "loading", userId: null, user: null, generation: 0, expiresAt: null, error: null,
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Testable auth observer. Never signs in/out, migrates, or deletes stored data. */
export function createUserSessionStore(dependencies: {
  getClient: () => AuthClient | null;
  now?: () => number;
  getStorage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
}) {
  const now = dependencies.now ?? Date.now;
  const listeners = new Set<() => void>();
  let state = INITIAL;
  let clients = 0;
  let lifecycle = 0;
  let client: AuthClient | null = null;
  let unsubscribeAuth: (() => void) | null = null;
  let validationTimer: ReturnType<typeof setTimeout> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let ownerPromise: Promise<ValidatedStorageOwner> | null = null;

  function clearTimers() {
    if (validationTimer !== null) clearTimeout(validationTimer);
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    validationTimer = null; expiryTimer = null;
  }
  function transition(next: Omit<UserSessionState, "generation">) {
    clearTimers(); ownerPromise = null;
    scopedStorage.invalidateSession();
    state = Object.freeze({ ...next, generation: state.generation + 1 });
    listeners.forEach(listener => listener());
  }
  function unavailable(status: "loading" | "disconnected" | "error", error: string | null = null) {
    transition({ status, userId: null, user: null, expiresAt: null, error });
  }
  function ensureLive() {
    if (state.status === "connected" && (state.expiresAt === null || state.expiresAt <= now())) {
      unavailable("error", "Session expirée. Reconnectez-vous ou vérifiez la session.");
    }
  }
  function assertCurrent(capture: SessionCapture) {
    ensureLive();
    if (clients === 0 || state.status !== "connected" || state.userId !== capture.userId || state.generation !== capture.generation) {
      throw new Error("Session inconnue ou opération périmée après changement de session.");
    }
  }
  async function validatedUser() {
    ensureLive();
    if (!client || state.status !== "connected" || !state.userId) throw new Error("Identité non confirmée.");
    const capture = { userId: state.userId, generation: state.generation };
    try {
      const { data, error } = await client.auth.getUser();
      assertCurrent(capture);
      if (error || data.user?.id !== capture.userId) throw new Error("Impossible de confirmer le propriétaire.");
      return data.user;
    } catch (error) {
      // A failure under A must never invalidate a newer session B.
      if (state.generation === capture.generation) unavailable("error", "Validation de session indisponible. Réessayez.");
      throw error;
    }
  }
  const scopedStorage = createAccountScopedStorage({
    getSessionSnapshot: () => {
      ensureLive();
      return { userId: state.status === "connected" ? state.userId : null, revision: state.generation };
    },
    validateUser: validatedUser,
    getStorage: dependencies.getStorage,
  });
  const businessStorage = createAccountBusinessStorage(scopedStorage);

  function scheduleExpiry() {
    if (state.expiresAt === null) return;
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      ensureLive();
      if (state.status === "connected") scheduleExpiry();
    }, Math.min(2_147_483_647, Math.max(0, state.expiresAt - now())));
  }

  function observe(session: Session | null) {
    if (!session) { unavailable("disconnected"); return; }
    // Revoke the previous owner synchronously in the auth callback, before any await.
    unavailable("loading");
    const generation = state.generation;
    const run = lifecycle;
    const id = session.user?.id;
    const expiresAt = typeof session.expires_at === "number" ? session.expires_at * 1000 : NaN;
    if (!id || !UUID.test(id) || !Number.isFinite(expiresAt) || expiresAt <= now()) {
      unavailable("error", "Session expirée ou identité indisponible."); return;
    }
    // Do NOT await or call Supabase auth methods inside onAuthStateChange:
    // the SDK may still hold its auth lock. Validate in the next macrotask.
    validationTimer = setTimeout(() => {
      validationTimer = null;
      if (clients === 0 || lifecycle !== run || state.generation !== generation || !client) return;
      void client.auth.getUser().then(({ data, error }) => {
        if (clients === 0 || lifecycle !== run || state.generation !== generation) return;
        if (error || !data.user || data.user.id !== id || expiresAt <= now()) {
          unavailable("error", "Session non confirmée ou expirée. Réessayez."); return;
        }
        transition({
          status: "connected", userId: id,
          user: Object.freeze({ id, email: data.user.email }), expiresAt, error: null,
        });
        scheduleExpiry();
      }).catch(() => {
        if (clients > 0 && lifecycle === run && state.generation === generation) {
          unavailable("error", "Vérification réseau de la session impossible. Réessayez.");
        }
      });
    }, 0);
  }

  async function refresh() {
    if (clients === 0) return;
    unavailable("loading");
    const generation = state.generation;
    const run = lifecycle;
    try {
      if (!client) throw new Error("Auth unavailable");
      const { data, error } = await client.auth.getSession();
      if (clients === 0 || lifecycle !== run || state.generation !== generation) return;
      if (error) throw error;
      observe(data.session);
    } catch {
      if (clients > 0 && lifecycle === run && state.generation === generation) {
        unavailable("error", "Session indisponible. Vérifiez la connexion puis réessayez.");
      }
    }
  }

  function start() {
    clients += 1;
    let stopped = false;
    if (clients === 1) {
      const run = ++lifecycle;
      try {
        client = dependencies.getClient();
        if (!client) throw new Error("Auth unavailable");
        unavailable("loading");
        const beforeSubscribe = state.generation;
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          if (clients > 0 && lifecycle === run) observe(session);
        });
        unsubscribeAuth = () => data.subscription.unsubscribe();
        // Subscribe first. A synchronous initial event already supplies a candidate;
        // otherwise perform a lookup whose result cannot override a later event.
        if (state.generation === beforeSubscribe) void refresh();
      } catch {
        unsubscribeAuth?.(); unsubscribeAuth = null; client = null;
        unavailable("error", "Authentification indisponible ou non configurée.");
      }
    }
    return () => {
      if (stopped) return;
      stopped = true; clients -= 1;
      if (clients === 0) {
        lifecycle += 1;
        unsubscribeAuth?.(); unsubscribeAuth = null; client = null;
        unavailable("loading");
      }
    };
  }

  async function beginOperation(input: SessionCapture) {
    const capture = Object.freeze({ userId: input.userId, generation: input.generation });
    assertCurrent(capture);
    // Share one validated owner per generation so parallel components don't revoke
    // each other's capabilities by repeatedly calling scoped.validateOwner().
    ownerPromise ??= scopedStorage.validateOwner(capture.userId);
    const owner = await ownerPromise;
    assertCurrent(capture);
    return Object.freeze({
      userId: capture.userId, generation: capture.generation, owner,
      business: businessStorage.forOwner(owner),
      assertCurrent: () => assertCurrent(capture),
      // Callback must be synchronous; validate before applying an async result to UI.
      commit: (apply: () => void) => { assertCurrent(capture); apply(); },
    });
  }

  return Object.freeze({
    start, refresh, beginOperation, assertCurrent, scopedStorage,
    getSnapshot: () => state,
    getServerSnapshot: () => INITIAL,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
}

export type UserSessionStore = ReturnType<typeof createUserSessionStore>;
let browserStore: UserSessionStore | undefined;
export function getUserSessionStore(): UserSessionStore {
  if (typeof window === "undefined") return createUserSessionStore({ getClient: () => null });
  browserStore ??= createUserSessionStore({ getClient: createBrowserSupabaseClient });
  return browserStore;
}
