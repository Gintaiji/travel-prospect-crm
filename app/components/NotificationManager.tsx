"use client";

import { useEffect, useRef } from "react";
import {
  loadNotificationSettings,
  saveNotificationSettings,
  subscribeToNotificationSettingsChanges,
} from "../lib/notificationSettingsStorage";
import { loadProspects } from "../lib/prospectStorage";

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function isDateBeforeToday(dateString: string) {
  return Boolean(dateString) && dateString < getTodayDateString();
}

function buildNotificationMessage(
  prospectsToContactCount: number,
  lateFollowUpsCount: number,
) {
  const parts: string[] = [];

  if (prospectsToContactCount > 0) {
    parts.push(
      `${prospectsToContactCount} prospect${
        prospectsToContactCount > 1 ? "s" : ""
      } à contacter`,
    );
  }

  if (lateFollowUpsCount > 0) {
    parts.push(
      `${lateFollowUpsCount} relance${
        lateFollowUpsCount > 1 ? "s" : ""
      } en retard`,
    );
  }

  return `Tu as ${parts.join(" et ")}.`;
}

export default function NotificationManager() {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    function checkNotifications() {
      if (typeof window === "undefined" || !("Notification" in window)) {
        return;
      }

      const settings = loadNotificationSettings();
      const today = getTodayDateString();

      if (
        !settings.notificationsEnabled ||
        settings.lastNotificationDate === today ||
        Notification.permission !== "granted"
      ) {
        return;
      }

      const prospects = loadProspects();
      const prospectsToContactCount = settings.notifyProspectsToContact
        ? prospects.filter((prospect) => prospect.status === "À contacter").length
        : 0;
      const lateFollowUpsCount = settings.notifyLateFollowUps
        ? prospects.filter((prospect) =>
            isDateBeforeToday(prospect.nextActionDate),
          ).length
        : 0;

      if (prospectsToContactCount === 0 && lateFollowUpsCount === 0) {
        return;
      }

      new Notification("Travel Prospect CRM", {
        body: buildNotificationMessage(
          prospectsToContactCount,
          lateFollowUpsCount,
        ),
      });

      saveNotificationSettings({
        ...settings,
        lastNotificationDate: today,
        updatedAt: new Date().toISOString(),
      });
    }

    const initialCheck = window.setTimeout(() => {
      hasCheckedRef.current = true;
      checkNotifications();
    }, 0);
    const unsubscribe = subscribeToNotificationSettingsChanges(() => {
      if (hasCheckedRef.current) {
        checkNotifications();
      }
    });

    return () => {
      window.clearTimeout(initialCheck);
      unsubscribe();
    };
  }, []);

  return null;
}
