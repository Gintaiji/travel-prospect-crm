"use client";

import { createContext, Fragment, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { getUserSessionStore, type UserSessionStore } from "../lib/userSessionStore";

const SessionContext = createContext<UserSessionStore | null>(null);

export function UserSessionProvider({ children }: { children: ReactNode }) {
  const parent = useContext(SessionContext);
  const [store] = useState(() => parent ?? getUserSessionStore());
  useEffect(() => store.start(), [store]);
  return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>;
}

export function useUserSession() {
  const store = useContext(SessionContext);
  if (!store) throw new Error("UserSessionProvider manquant.");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return useMemo(() => ({
    ...state,
    refresh: store.refresh,
    beginOperation: () => {
      if (state.status !== "connected" || !state.userId) throw new Error("Identité non confirmée.");
      return store.beginOperation({ userId: state.userId, generation: state.generation });
    },
    store,
  }), [state, store]);
}

/** Future isolated subtrees only: remount on every generation; never clears storage. */
export function AccountSessionBoundary({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const session = useUserSession();
  if (session.status !== "connected") return fallback;
  return <Fragment key={`${session.userId}:${session.generation}`}>{children}</Fragment>;
}
