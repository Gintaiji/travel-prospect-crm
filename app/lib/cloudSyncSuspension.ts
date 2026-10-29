// TEMPORARY SAFETY SWITCH: keep enabled until account isolation and atomic writes exist.
// Independent of localStorage and user settings; existing mechanisms remain in place.
export const CLOUD_SYNC_SUSPENDED: boolean = true;
export const CLOUD_SYNC_SUSPENSION_MESSAGE =
  "Synchronisation cloud temporairement suspendue pour sécuriser vos données.";
export function assertCloudWritesAllowed() {
  if (CLOUD_SYNC_SUSPENDED) throw new Error(CLOUD_SYNC_SUSPENSION_MESSAGE);
}
