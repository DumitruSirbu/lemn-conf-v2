import "server-only";

import type { StaffKitchenActionsStore } from "@lemnaria/persistence";
import { NeonStaffKitchenActionsStore } from "@lemnaria/persistence";

let staffKitchenActionsStore: StaffKitchenActionsStore | undefined;

/**
 * The staff kitchen actions store's one instance, made on first use and never at import or build, so no connection is
 * opened where no note, status or unhide is written. A module of its own, beside the reader's and the audit store's, so
 * a test that fakes one does not take the others along.
 */
export function getStaffKitchenActionsStore(): StaffKitchenActionsStore {
  staffKitchenActionsStore ??= new NeonStaffKitchenActionsStore();
  return staffKitchenActionsStore;
}
