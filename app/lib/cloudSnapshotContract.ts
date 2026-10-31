/** 98C: data contracts only. No transport, persistence, or authorization capability. */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const BUSINESS_CATEGORIES = [
  "prospects", "resources", "settings", "custom-message-templates", "street-marketing-survey",
] as const;
export type SnapshotCategory = typeof BUSINESS_CATEGORIES[number];
export type CloudRevision = string & { readonly __cloudRevision: unique symbol };
export type SnapshotErrorCode =
  | "owner-unverified" | "unsupported-schema" | "invalid-revision"
  | "invalid-payload" | "integrity-unverified" | "conflict"
  | "session-changed" | "storage-unavailable" | "suspended";
export class SnapshotContractError extends Error {
  constructor(public readonly code: SnapshotErrorCode) { super(code); this.name = "SnapshotContractError"; }
}

/** PostgreSQL bigint, canonical decimal text; never converted through Number. */
export function parseCloudRevision(value: unknown): CloudRevision {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value) ||
      value.length > 19 || BigInt(value) > BigInt("9223372036854775807")) {
    throw new SnapshotContractError("invalid-revision");
  }
  return value as CloudRevision;
}

/** Unknown business fields are preserved. This envelope is NOT a verified snapshot.
 * Full business validation and server fingerprint verification remain mandatory
 * before any future use; 98C exposes no function authorizing an operation.
 */
export type UnverifiedSnapshotEnvelope = Readonly<{
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  ownerUserId: string;
  revision: CloudRevision;
  fingerprint: string;
  serverTimestamp: string;
  data: Readonly<Record<SnapshotCategory, unknown>>;
}>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function inspectSnapshotEnvelope(value: unknown, expectedOwner: string): UnverifiedSnapshotEnvelope {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuid.test(expectedOwner) || !isRecord(value) || value.ownerUserId !== expectedOwner) {
    throw new SnapshotContractError("owner-unverified");
  }
  if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new SnapshotContractError("unsupported-schema");
  const revision = parseCloudRevision(value.revision);
  if (!isRecord(value.data) || Object.keys(value.data).length !== BUSINESS_CATEGORIES.length ||
      !BUSINESS_CATEGORIES.every(name => Object.hasOwn(value.data as object, name))) {
    throw new SnapshotContractError("invalid-payload");
  }
  if (typeof value.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
      typeof value.serverTimestamp !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.serverTimestamp) ||
      !Number.isFinite(Date.parse(value.serverTimestamp)) ||
      new Date(value.serverTimestamp).toISOString() !== value.serverTimestamp) {
    throw new SnapshotContractError("integrity-unverified");
  }
  return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, ownerUserId: expectedOwner, revision,
    fingerprint: value.fingerprint, serverTimestamp: value.serverTimestamp,
    data: value.data as Record<SnapshotCategory, unknown> };
}
