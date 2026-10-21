import "server-only";

import type { StaffAuditStore } from "@lemnaria/persistence";
import { NeonStaffAuditStore } from "@lemnaria/persistence";

let staffAuditStore: StaffAuditStore | undefined;

/**
 * The staff audit store's one instance, made on first use and never at import or build, so no connection is opened
 * where no staff action is recorded.
 */
export function getStaffAuditStore(): StaffAuditStore {
  staffAuditStore ??= new NeonStaffAuditStore();
  return staffAuditStore;
}
