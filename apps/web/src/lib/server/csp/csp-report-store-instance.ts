import "server-only";

import type { CspReportStore } from "@lemnaria/persistence";
import { NeonCspReportStore } from "@lemnaria/persistence";

let cspReportStore: CspReportStore | undefined;

/**
 * The CSP report store's one instance, made on first use and never at import or build, so no connection is opened
 * where no report is stored. The store opens its connection when it is made, so a missing `DATABASE_URL` throws here,
 * synchronously: the caller makes the store inside its own guard. It is a module of its own, as the limiter's counter
 * store is: what a test fakes is the database, and the files that mock `repository.ts` whole must not take it along.
 */
export function getCspReportStore(): CspReportStore {
  cspReportStore ??= new NeonCspReportStore();
  return cspReportStore;
}
