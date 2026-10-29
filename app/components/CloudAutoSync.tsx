"use client";

import { CLOUD_SYNC_SUSPENDED } from "../lib/cloudSyncSuspension";
import { createBrowserSupabaseClient } from "../lib/supabaseClient";
import { useEffect, useRef } from "react";
import {
  loadCloudSyncSettings,
  subscribeToCloudSyncSettingsChanges,
  type CloudSyncSettings,
} from "../lib/cloudSyncSettingsStorage";
import {
  clearLastLocalChangeDate,
  isLocalChangeTrackingPaused,
  subscribeToLocalDataChanges,
} from "../lib/localChangeTracker";
import {
  canUploadLocalDataSafely,
  uploadLocalDataToCloud,
} from "../lib/cloudSync";
import { isStartupCloudCheckRunning } from "../lib/cloudStartupRestoreStorage";

export default function CloudAutoSync() {
  const settingsRef = useRef<CloudSyncSettings>(loadCloudSyncSettings());
  const timerRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    function clearAutoSyncTimer() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    let generation = 0;
    let disposed = false;
    function invalidateScheduledSync() {
      generation += 1;
      clearAutoSyncTimer();
    }
    const supabase = createBrowserSupabaseClient();
    const authSubscription = supabase?.auth.onAuthStateChange(invalidateScheduledSync);

    function refreshSettings() {
      settingsRef.current = loadCloudSyncSettings();

      if (CLOUD_SYNC_SUSPENDED || !settingsRef.current.autoSyncEnabled) {
        clearAutoSyncTimer();
      }
    }

    async function runAutoSync(scheduledGeneration: number) {
      if (disposed || CLOUD_SYNC_SUSPENDED || scheduledGeneration !== generation) return;
      if (isSyncingRef.current || !settingsRef.current.autoSyncEnabled) {
        return;
      }

      isSyncingRef.current = true;

      try {
        if (isStartupCloudCheckRunning() || isLocalChangeTrackingPaused()) {
          console.warn(
            "Synchronisation automatique ignoree pendant une verification ou restauration cloud.",
          );
          return;
        }

        const safetyCheck = await canUploadLocalDataSafely();

        if (!safetyCheck.canUpload) {
          console.warn(safetyCheck.reason);
          return;
        }

        if (isStartupCloudCheckRunning() || isLocalChangeTrackingPaused()) {
          console.warn(
            "Synchronisation automatique ignoree pendant une verification ou restauration cloud.",
          );
          return;
        }

        if (disposed || CLOUD_SYNC_SUSPENDED || scheduledGeneration !== generation) return;
        await uploadLocalDataToCloud({ backupType: "auto" });
        clearLastLocalChangeDate();
      } catch (error) {
        console.warn("Synchronisation automatique impossible.", error);
      } finally {
        isSyncingRef.current = false;
      }
    }

    function scheduleAutoSync() {
      refreshSettings();

      if (CLOUD_SYNC_SUSPENDED || !settingsRef.current.autoSyncEnabled) {
        return;
      }

      clearAutoSyncTimer();

      const scheduledGeneration = generation;
      timerRef.current = window.setTimeout(
        () => {
          timerRef.current = null;
          void runAutoSync(scheduledGeneration);
        },
        Math.max(10, settingsRef.current.autoSyncDelaySeconds) * 1000,
      );
    }

    const unsubscribeFromLocalChanges =
      subscribeToLocalDataChanges(scheduleAutoSync);
    const unsubscribeFromSettingsChanges =
      subscribeToCloudSyncSettingsChanges(refreshSettings);

    refreshSettings();

    return () => {
      disposed = true;
      invalidateScheduledSync();
      authSubscription?.data.subscription.unsubscribe();
      unsubscribeFromLocalChanges();
      unsubscribeFromSettingsChanges();
    };
  }, []);

  return null;
}
