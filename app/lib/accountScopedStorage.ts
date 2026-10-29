/**
 * 97C-1 infrastructure only: intentionally not connected to existing pages/stores.
 * No legacy fallback, migration, storage enumeration, or logout cleanup.
 * This is application-level isolation, not protection against same-origin scripts.
 */
export const ACCOUNT_STORAGE_NAMES = [
  "prospects",
  "resources",
  "settings",
  "street-marketing-survey",
  "custom-message-templates",
  "last-backup-date",
  "last-local-change-date",
  "cloud-sync-settings",
  "startup-restore-status",
  "startup-cloud-check-running",
  "notification-settings",
  "migration-state",
] as const;

export type AccountStorageName = (typeof ACCOUNT_STORAGE_NAMES)[number];

export type AccountSessionSnapshot = Readonly<{
  userId: string | null;
  /** Increment on every session transition, including logout/login to the same ID. */
  revision: number;
}>;

declare const ownerBrand: unique symbol;
export type ValidatedStorageOwner = Readonly<{
  userId: string;
  [ownerBrand]: true;
}>;

type Dependencies = {
  /** Future auth adapter must supply Supabase user.id, never email or a stored owner. */
  getSessionSnapshot: () => AccountSessionSnapshot;
  /** Future adapter: auth.getUser(); must validate the current authenticated user. */
  validateUser: () => Promise<{ id: string } | null>;
  /** Lazy access keeps importing this module safe on the server. Injectable for tests. */
  getStorage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
};

const PREFIX = "travel-prospect-crm:account:v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const storageNames = new Set<string>(ACCOUNT_STORAGE_NAMES);

function assertUserId(userId: string): void {
  if (typeof userId !== "string" || !UUID.test(userId)) {
    throw new Error("A canonical Supabase user.id is required.");
  }
}

export function createAccountScopedStorage(dependencies: Dependencies) {
  // Tokens from another instance, forged objects, and expired tokens are rejected.
  const owners = new WeakMap<ValidatedStorageOwner, { revision: number; epoch: number }>();
  let epoch = 0;

  function snapshot() {
    const value = dependencies.getSessionSnapshot();
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) {
      throw new Error("A known session revision is required.");
    }
    // Copy so a mutable auth store cannot alter an in-flight operation's snapshot.
    return { userId: value.userId, revision: value.revision };
  }

  async function validateOwner(expectedUserId: string): Promise<ValidatedStorageOwner> {
    // A failed/new validation also revokes tokens from earlier validations.
    const validationEpoch = ++epoch;
    assertUserId(expectedUserId);
    const before = snapshot();
    if (before.userId !== expectedUserId) throw new Error("Storage owner is not authenticated.");
    const user = await dependencies.validateUser();
    const after = snapshot();
    if (
      !user || user.id !== expectedUserId || validationEpoch !== epoch ||
      before.revision !== after.revision || after.userId !== expectedUserId
    ) {
      throw new Error("Storage owner validation failed or session changed.");
    }
    const owner = Object.freeze({ userId: expectedUserId }) as ValidatedStorageOwner;
    owners.set(owner, { revision: after.revision, epoch: validationEpoch });
    return owner;
  }

  function keyFor(owner: ValidatedStorageOwner, name: AccountStorageName) {
    const record = owners.get(owner);
    const current = snapshot();
    if (
      !record || record.epoch !== epoch || record.revision !== current.revision ||
      current.userId !== owner.userId
    ) {
      throw new Error("Unknown storage owner or expired account operation.");
    }
    if (!storageNames.has(name)) throw new Error("Unknown account storage name.");
    return `${PREFIX}${owner.userId}:${name}`;
  }

  function storage() {
    if (dependencies.getStorage) return dependencies.getStorage();
    if (typeof window === "undefined") throw new Error("Browser storage is unavailable.");
    return window.localStorage;
  }

  return Object.freeze({
    validateOwner,
    /** Explicit invalidation affects capabilities only; never removes stored data. */
    invalidateSession() { epoch += 1; },
    read(owner: ValidatedStorageOwner, name: AccountStorageName): string | null {
      const key = keyFor(owner, name);
      return storage().getItem(key);
    },
    write(owner: ValidatedStorageOwner, name: AccountStorageName, value: string): void {
      const key = keyFor(owner, name);
      if (typeof value !== "string") throw new Error("Storage values must be strings.");
      storage().setItem(key, value);
    },
    remove(owner: ValidatedStorageOwner, name: AccountStorageName): void {
      const key = keyFor(owner, name);
      storage().removeItem(key);
    },
  });
}
