import type { SessionCapture, UserSessionStore } from "./userSessionStore";
import { coordinateResourceWrite, type ResourceLockManager } from "./resourceWriteCoordinator";

/** Explicit empty resource space only. Never reads legacy data or creates a migration marker. */
export function createResourceAccountInitialization(dependencies: { enabled: boolean; store: UserSessionStore; locks?: ResourceLockManager }) {
  return {
    async initialize(capture: SessionCapture, confirmation: { ownerUserId: string; emptySpaceConfirmed: boolean }) {
      if (!dependencies.enabled) throw new Error("Initialisation Ressources isolées désactivée.");
      if (!confirmation.emptySpaceConfirmed || confirmation.ownerUserId !== capture.userId) throw new Error("Confirmation explicite du propriétaire obligatoire.");
      const operation = await dependencies.store.beginOperation(capture);
      operation.assertCurrent();
      await coordinateResourceWrite({ scoped: dependencies.store.scopedStorage, owner: operation.owner,
        expectedRaw: null, candidateRaw: "[]", kind: "initialization", locks: dependencies.locks,
        initialization: { enabled: dependencies.enabled, confirmed: confirmation.emptySpaceConfirmed, ownerUserId: confirmation.ownerUserId },
        preflight: () => operation.assertCurrent(),
      });
      operation.assertCurrent();
      return { userId: operation.userId, resourcesCount: 0 };
    },
  };
}
