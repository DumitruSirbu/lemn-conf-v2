import "server-only";

import type { StaffKitchenReader } from "@lemnaria/persistence";
import { NeonStaffKitchenReader } from "@lemnaria/persistence";

let staffKitchenReader: StaffKitchenReader | undefined;

/**
 * The staff kitchen reader's one instance, made on first use and never at import or build, so no connection is opened
 * where no kitchen is read. A module of its own, beside the account kitchen store's, so a test that fakes one does not
 * take the other along.
 */
export function getStaffKitchenReader(): StaffKitchenReader {
  staffKitchenReader ??= new NeonStaffKitchenReader();
  return staffKitchenReader;
}
