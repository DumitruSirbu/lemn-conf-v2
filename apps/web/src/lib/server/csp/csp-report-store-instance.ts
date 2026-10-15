import "server-only";

import type { CspReportStore } from "@lemnaria/persistence";
import { NeonCspReportStore } from "@lemnaria/persistence";

let cspReportStore: CspReportStore | undefined;

/**
 * The CSP report store's one instance, made on first use and never at import or build. The store opens its connection
 * when made, so a missing `DATABASE_URL` throws here, synchronously: the caller makes it inside its own guard. A module
 * of its own, so a test that mocks `repository.ts` whole does not take the store along.
 */
export function getCspReportStore(): CspReportStore {
  cspReportStore ??= new NeonCspReportStore();
  return cspReportStore;
}
