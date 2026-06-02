"use client";

import { useEffect, useRef } from "react";
import {
  getCloudDataSummary,
  getCloudFreshnessStatus,
  getLocalDataSummary,
  restoreCloudDataToLocal,
} from "../lib/cloudSync";
import {
  loadStartupRestoreStatus,
  saveStartupRestoreStatus,
  setStartupCloudCheckRunning,
} from "../lib/cloudStartupRestoreStorage";
import { createBrowserSupabaseClient } from "../lib/supabaseClient";

export default function CloudStartupRestore() {
  const isCheckingRef = useRef(false);
  const checkedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      return;
    }

    const browserSupabase = supabase;

    function saveCheckStatus(lastMessage: string, lastRestoredAt = "") {
      const now = new Date().toISOString();
      const currentStatus = loadStartupRestoreStatus();

      saveStartupRestoreStatus({
        lastCheckedAt: now,
        lastRestoredAt: lastRestoredAt || currentStatus.lastRestoredAt,
        lastMessage,
      });
    }

    async function checkCloudDataForStartupRestore(userId: string) {
      if (isCheckingRef.current || checkedUserIdRef.current === userId) {
        return;
      }

      checkedUserIdRef.current = userId;
      isCheckingRef.current = true;
      setStartupCloudCheckRunning(true);

      try {
        const freshnessStatus = await getCloudFreshnessStatus();
        const cloudDataSummary = await getCloudDataSummary();
        const localDataSummary = getLocalDataSummary();

        if (cloudDataSummary.hasCloudData && !localDataSummary.hasLocalData) {
          const restoredAt = new Date().toISOString();

          await restoreCloudDataToLocal();
          saveStartupRestoreStatus({
            lastCheckedAt: restoredAt,
            lastRestoredAt: restoredAt,
            lastMessage: "Données chargées depuis le cloud sur cet appareil.",
          });
          return;
        }

        if (
          freshnessStatus.cloudLooksNewer &&
          freshnessStatus.localLooksNewer !== true
        ) {
          const restoredAt = new Date().toISOString();

          await restoreCloudDataToLocal();
          saveStartupRestoreStatus({
            lastCheckedAt: restoredAt,
            lastRestoredAt: restoredAt,
            lastMessage: "Version cloud chargée automatiquement.",
          });
          return;
        }

        if (freshnessStatus.localLooksNewer) {
          saveCheckStatus(
            "Données locales plus récentes, aucun chargement automatique.",
          );
          return;
        }

        saveCheckStatus("Vérification cloud terminée.");
      } catch (error) {
        console.warn("Vérification cloud impossible pour le moment.", error);
        saveCheckStatus("Vérification cloud impossible pour le moment.");
      } finally {
        setStartupCloudCheckRunning(false);
        isCheckingRef.current = false;
      }
    }

    async function checkInitialSession() {
      const { data, error } = await browserSupabase.auth.getSession();

      if (error || !data.session?.user) {
        return;
      }

      await checkCloudDataForStartupRestore(data.session.user.id);
    }

    void checkInitialSession();

    const { data: authStateChangeData } = browserSupabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          checkedUserIdRef.current = null;
          return;
        }

        void checkCloudDataForStartupRestore(session.user.id);
      },
    );

    return () => {
      authStateChangeData.subscription.unsubscribe();
    };
  }, []);

  return null;
}
