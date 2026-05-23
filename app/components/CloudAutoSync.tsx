"use client";

import { useEffect, useRef } from "react";
import {
  loadCloudSyncSettings,
  subscribeToCloudSyncSettingsChanges,
  type CloudSyncSettings,
} from "../lib/cloudSyncSettingsStorage";
import { clearLastLocalChangeDate, subscribeToLocalDataChanges } from "../lib/localChangeTracker";
import {
  canUploadLocalDataSafely,
  uploadLocalDataToCloud,
} from "../lib/cloudSync";

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

    function refreshSettings() {
      settingsRef.current = loadCloudSyncSettings();

      if (!settingsRef.current.autoSyncEnabled) {
        clearAutoSyncTimer();
      }
    }

    async function runAutoSync() {
      if (isSyncingRef.current || !settingsRef.current.autoSyncEnabled) {
        return;
      }

      isSyncingRef.current = true;

      try {
        const safetyCheck = await canUploadLocalDataSafely();

        if (!safetyCheck.canUpload) {
          return;
        }

        await uploadLocalDataToCloud();
        clearLastLocalChangeDate();
      } catch (error) {
        console.warn("Synchronisation automatique impossible.", error);
      } finally {
        isSyncingRef.current = false;
      }
    }

    function scheduleAutoSync() {
      refreshSettings();

      if (!settingsRef.current.autoSyncEnabled) {
        return;
      }

      clearAutoSyncTimer();

      timerRef.current = window.setTimeout(
        () => {
          timerRef.current = null;
          void runAutoSync();
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
      clearAutoSyncTimer();
      unsubscribeFromLocalChanges();
      unsubscribeFromSettingsChanges();
    };
  }, []);

  return null;
}
