import { createBrowserSupabaseClient } from "./supabaseClient";
import {
  loadCustomMessageTemplates,
  saveCustomMessageTemplates,
  type CustomMessageTemplates,
} from "./messageTemplateStorage";
import { loadProspects, saveProspects } from "./prospectStorage";
import { loadResources, saveResources } from "./resourceStorage";
import {
  DEFAULT_APP_SETTINGS,
  loadSettings,
  saveSettings,
} from "./settingsStorage";
import {
  pauseLocalChangeTracking,
  resumeLocalChangeTracking,
} from "./localChangeTracker";
import type { AppSettings, Prospect, Resource } from "./types";

type CloudDataRow<T> = {
  data: T;
};

type CloudSyncStateRow = {
  last_sync_at: string | null;
};

export type UploadCloudSummary = {
  prospectsCount: number;
  resourcesCount: number;
  settingsSent: boolean;
  customMessageTemplatesSent: boolean;
};

export type RestoreCloudSummary = {
  prospectsCount: number;
  resourcesCount: number;
  settingsRestored: boolean;
  customMessageTemplatesRestored: boolean;
};

export type CloudSyncState = {
  lastSyncAt: string | null;
};

export type CloudSyncStatus = {
  lastCloudSyncAt: string | null;
  localLastUpdatedAt: string | null;
  needsSync: boolean;
  statusLabel:
    | "Jamais synchronisé"
    | "Synchronisation recommandée"
    | "Cloud à jour";
};

export type CloudDataSummary = {
  prospectsCount: number;
  resourcesCount: number;
  hasSettings: boolean;
  hasCustomMessageTemplates: boolean;
  lastCloudSyncAt: string | null;
  hasCloudData: boolean;
};

export type LocalDataSummary = {
  prospectsCount: number;
  resourcesCount: number;
  hasSettings: boolean;
  hasCustomMessageTemplates: boolean;
  hasLocalData: boolean;
};

export type UploadSafetyCheck = {
  canUpload: boolean;
  reason: string;
  localHasData: boolean;
  cloudHasData: boolean;
};

export type CloudFreshnessStatus = {
  cloudHasData: boolean;
  localHasData: boolean;
  cloudLooksNewer: boolean;
  localLooksNewer: boolean;
  lastCloudSyncAt: string | null;
  localLastUpdatedAt: string | null;
  statusLabel:
    | "Données cloud disponibles"
    | "Cloud plus récent"
    | "Local plus récent"
    | "Données alignées"
    | "Aucune donnée cloud"
    | "Aucune donnée locale";
};

async function getConnectedUserId() {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase n'est pas encore configuré.");
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  return { supabase, userId: data.user.id };
}

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function getValidDateTime(value: string) {
  const dateTime = new Date(value).getTime();

  return Number.isNaN(dateTime) ? null : dateTime;
}

function getMostRecentIsoDate(values: string[]) {
  const mostRecentTime = values.reduce<number | null>((mostRecent, value) => {
    if (!value) {
      return mostRecent;
    }

    const dateTime = getValidDateTime(value);

    if (dateTime === null) {
      return mostRecent;
    }

    return mostRecent === null || dateTime > mostRecent ? dateTime : mostRecent;
  }, null);

  return mostRecentTime === null ? null : new Date(mostRecentTime).toISOString();
}

function hasCustomSettings(settings: AppSettings) {
  return (
    settings.userDisplayName.trim() !== DEFAULT_APP_SETTINGS.userDisplayName ||
    settings.businessName.trim() !== DEFAULT_APP_SETTINGS.businessName ||
    settings.clubName.trim() !== DEFAULT_APP_SETTINGS.clubName ||
    settings.defaultCountry.trim() !== DEFAULT_APP_SETTINGS.defaultCountry ||
    settings.defaultRegion.trim() !== DEFAULT_APP_SETTINGS.defaultRegion ||
    settings.defaultCity.trim() !== DEFAULT_APP_SETTINGS.defaultCity ||
    settings.defaultMessageStyle !== DEFAULT_APP_SETTINGS.defaultMessageStyle ||
    settings.defaultFollowUpDays !== DEFAULT_APP_SETTINGS.defaultFollowUpDays ||
    settings.defaultPresentationLink.trim() !==
      DEFAULT_APP_SETTINGS.defaultPresentationLink ||
    settings.messageSignature.trim() !== DEFAULT_APP_SETTINGS.messageSignature ||
    settings.publicWording.trim() !== DEFAULT_APP_SETTINGS.publicWording
  );
}

function hasCustomMessageTemplates(customMessageTemplates: CustomMessageTemplates) {
  return Object.values(customMessageTemplates).some((stepTemplates) =>
    stepTemplates
      ? Object.values(stepTemplates).some((message) => typeof message === "string")
      : false,
  );
}

export function getLocalDataLastUpdatedAt(): string | null {
  const prospects = loadProspects();
  const resources = loadResources();
  const settings = loadSettings();

  loadCustomMessageTemplates();

  return getMostRecentIsoDate([
    ...prospects.map((prospect) => prospect.updatedAt),
    ...resources.map((resource) => resource.updatedAt),
    settings.updatedAt,
  ]);
}

export function getLocalDataSummary(): LocalDataSummary {
  const prospects = loadProspects();
  const resources = loadResources();
  const settings = loadSettings();
  const customMessageTemplates = loadCustomMessageTemplates();
  const settingsAreCustom = hasCustomSettings(settings);
  const templatesAreCustom = hasCustomMessageTemplates(customMessageTemplates);

  return {
    prospectsCount: prospects.length,
    resourcesCount: resources.length,
    hasSettings: settingsAreCustom,
    hasCustomMessageTemplates: templatesAreCustom,
    hasLocalData:
      prospects.length > 0 ||
      resources.length > 0 ||
      settingsAreCustom ||
      templatesAreCustom,
  };
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  const cloudSyncState = await getCloudSyncState();
  const localLastUpdatedAt = getLocalDataLastUpdatedAt();
  const lastCloudSyncAt = cloudSyncState.lastSyncAt;

  if (!lastCloudSyncAt) {
    return {
      lastCloudSyncAt,
      localLastUpdatedAt,
      needsSync: true,
      statusLabel: "Jamais synchronisé",
    };
  }

  const cloudSyncTime = getValidDateTime(lastCloudSyncAt);
  const localUpdatedTime = localLastUpdatedAt
    ? getValidDateTime(localLastUpdatedAt)
    : null;
  const needsSync =
    cloudSyncTime === null ||
    (localUpdatedTime !== null && localUpdatedTime > cloudSyncTime);

  return {
    lastCloudSyncAt,
    localLastUpdatedAt,
    needsSync,
    statusLabel: needsSync ? "Synchronisation recommandée" : "Cloud à jour",
  };
}

export async function getCloudDataSummary(): Promise<CloudDataSummary> {
  const { supabase, userId } = await getConnectedUserId();

  const { count: prospectsCount, error: prospectsError } = await supabase
    .from("crm_prospects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  throwIfSupabaseError(prospectsError);

  const { count: resourcesCount, error: resourcesError } = await supabase
    .from("crm_resources")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  throwIfSupabaseError(resourcesError);

  const { data: settingsRow, error: settingsError } = await supabase
    .from("crm_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(settingsError);

  const { data: templateRow, error: templatesError } = await supabase
    .from("crm_message_templates")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(templatesError);

  const cloudSyncState = await getCloudSyncState();
  const safeProspectsCount = prospectsCount ?? 0;
  const safeResourcesCount = resourcesCount ?? 0;
  const hasSettings = Boolean(settingsRow);
  const hasCustomMessageTemplates = Boolean(templateRow);

  return {
    prospectsCount: safeProspectsCount,
    resourcesCount: safeResourcesCount,
    hasSettings,
    hasCustomMessageTemplates,
    lastCloudSyncAt: cloudSyncState.lastSyncAt,
    hasCloudData:
      safeProspectsCount > 0 ||
      safeResourcesCount > 0 ||
      hasSettings ||
      hasCustomMessageTemplates,
  };
}

export async function getCloudFreshnessStatus(): Promise<CloudFreshnessStatus> {
  const cloudDataSummary = await getCloudDataSummary();
  const localDataSummary = getLocalDataSummary();
  const localLastUpdatedAt = getLocalDataLastUpdatedAt();
  const lastCloudSyncAt = cloudDataSummary.lastCloudSyncAt;
  const cloudHasData = cloudDataSummary.hasCloudData;
  const localHasData = localDataSummary.hasLocalData;
  let cloudLooksNewer = false;
  let localLooksNewer = false;
  let statusLabel: CloudFreshnessStatus["statusLabel"] = "Données alignées";

  if (!cloudHasData) {
    statusLabel = "Aucune donnée cloud";
  } else if (!localHasData) {
    cloudLooksNewer = true;
    statusLabel = "Données cloud disponibles";
  } else if (lastCloudSyncAt && localLastUpdatedAt) {
    const cloudSyncTime = getValidDateTime(lastCloudSyncAt);
    const localUpdatedTime = getValidDateTime(localLastUpdatedAt);

    if (
      cloudSyncTime !== null &&
      localUpdatedTime !== null &&
      cloudSyncTime > localUpdatedTime
    ) {
      cloudLooksNewer = true;
      statusLabel = "Cloud plus récent";
    } else if (
      cloudSyncTime !== null &&
      localUpdatedTime !== null &&
      localUpdatedTime > cloudSyncTime
    ) {
      localLooksNewer = true;
      statusLabel = "Local plus récent";
    } else {
      statusLabel = "Données alignées";
    }
  } else if (!localHasData) {
    statusLabel = "Aucune donnée locale";
  } else {
    statusLabel = "Données alignées";
  }

  return {
    cloudHasData,
    localHasData,
    cloudLooksNewer,
    localLooksNewer,
    lastCloudSyncAt,
    localLastUpdatedAt,
    statusLabel,
  };
}

export async function canUploadLocalDataSafely(): Promise<UploadSafetyCheck> {
  const localDataSummary = getLocalDataSummary();
  const cloudDataSummary = await getCloudDataSummary();
  const localHasData = localDataSummary.hasLocalData;
  const cloudHasData = cloudDataSummary.hasCloudData;

  if (!localHasData && cloudHasData) {
    return {
      canUpload: false,
      reason:
        "Le navigateur local est vide alors que le cloud contient des données. Charge d’abord les données cloud sur cet appareil.",
      localHasData,
      cloudHasData,
    };
  }

  return {
    canUpload: true,
    reason: "",
    localHasData,
    cloudHasData,
  };
}

export async function uploadLocalDataToCloud(): Promise<UploadCloudSummary> {
  const { supabase, userId } = await getConnectedUserId();
  const uploadSafetyCheck = await canUploadLocalDataSafely();

  if (!uploadSafetyCheck.canUpload) {
    throw new Error(uploadSafetyCheck.reason);
  }

  const prospects = loadProspects();
  const resources = loadResources();
  const settings = loadSettings();
  const customMessageTemplates = loadCustomMessageTemplates();

  const { error: deleteProspectsError } = await supabase
    .from("crm_prospects")
    .delete()
    .eq("user_id", userId);
  throwIfSupabaseError(deleteProspectsError);

  const { error: deleteResourcesError } = await supabase
    .from("crm_resources")
    .delete()
    .eq("user_id", userId);
  throwIfSupabaseError(deleteResourcesError);

  if (prospects.length > 0) {
    const { error } = await supabase.from("crm_prospects").insert(
      prospects.map((prospect) => ({
        user_id: userId,
        local_id: prospect.id,
        data: prospect,
      })),
    );
    throwIfSupabaseError(error);
  }

  if (resources.length > 0) {
    const { error } = await supabase.from("crm_resources").insert(
      resources.map((resource) => ({
        user_id: userId,
        local_id: resource.id,
        data: resource,
      })),
    );
    throwIfSupabaseError(error);
  }

  const { error: settingsError } = await supabase
    .from("crm_settings")
    .upsert({ user_id: userId, data: settings }, { onConflict: "user_id" });
  throwIfSupabaseError(settingsError);

  const { error: templatesError } = await supabase
    .from("crm_message_templates")
    .upsert(
      { user_id: userId, data: customMessageTemplates },
      { onConflict: "user_id" },
    );
  throwIfSupabaseError(templatesError);

  const { error: syncStateError } = await supabase
    .from("crm_sync_state")
    .upsert(
      {
        user_id: userId,
        last_sync_at: new Date().toISOString(),
        sync_note: "Synchronisation manuelle depuis le navigateur",
      },
      { onConflict: "user_id" },
    );
  throwIfSupabaseError(syncStateError);

  return {
    prospectsCount: prospects.length,
    resourcesCount: resources.length,
    settingsSent: true,
    customMessageTemplatesSent: true,
  };
}

export async function restoreCloudDataToLocal(): Promise<RestoreCloudSummary> {
  const { supabase, userId } = await getConnectedUserId();

  const { data: prospectRows, error: prospectsError } = await supabase
    .from("crm_prospects")
    .select("data")
    .eq("user_id", userId);
  throwIfSupabaseError(prospectsError);

  const { data: resourceRows, error: resourcesError } = await supabase
    .from("crm_resources")
    .select("data")
    .eq("user_id", userId);
  throwIfSupabaseError(resourcesError);

  const { data: settingsRow, error: settingsError } = await supabase
    .from("crm_settings")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(settingsError);

  const { data: templateRow, error: templatesError } = await supabase
    .from("crm_message_templates")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(templatesError);

  const prospects = ((prospectRows ?? []) as CloudDataRow<Prospect>[]).map(
    (row) => row.data,
  );
  const resources = ((resourceRows ?? []) as CloudDataRow<Resource>[]).map(
    (row) => row.data,
  );
  const settings = (settingsRow as CloudDataRow<AppSettings> | null)?.data;
  const customMessageTemplates = (
    templateRow as CloudDataRow<CustomMessageTemplates> | null
  )?.data;

  pauseLocalChangeTracking();

  try {
    saveProspects(prospects);
    saveResources(resources);

    if (settings) {
      saveSettings(settings);
    }

    if (customMessageTemplates) {
      saveCustomMessageTemplates(customMessageTemplates);
    }
  } finally {
    resumeLocalChangeTracking();
  }

  return {
    prospectsCount: prospects.length,
    resourcesCount: resources.length,
    settingsRestored: Boolean(settings),
    customMessageTemplatesRestored: Boolean(customMessageTemplates),
  };
}

export async function getCloudSyncState(): Promise<CloudSyncState> {
  const { supabase, userId } = await getConnectedUserId();

  const { data, error } = await supabase
    .from("crm_sync_state")
    .select("last_sync_at")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(error);

  return {
    lastSyncAt: (data as CloudSyncStateRow | null)?.last_sync_at ?? null,
  };
}
