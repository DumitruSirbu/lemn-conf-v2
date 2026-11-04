import "server-only";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { isStoreSayingUnavailable } from "@/lib/server/price-dashboard/admitted-page-reads";
import {
  PRICE_READ_EVENT,
  readDashboardReadingForAdmittedPage,
  readDashboardStateForAdmittedPage,
  type StateWireReading,
} from "@/lib/server/price-dashboard/price-dashboard-service";

import type { DashboardStateWire } from "./price-dashboard-wire-contract";

export {
  readFirstVersionPage,
  readPredecessorOf,
  readVersion,
} from "@/lib/server/price-dashboard/admitted-page-reads";

/** What a read for an admitted page came to: the value, or a store that failed. */
export type AdmittedRead<Value> =
  | { readonly kind: "read"; readonly value: Value }
  | { readonly kind: "unavailable" };

/**
 * A store that fails is nothing to show, and the line written down names the event and the outcome alone. A store that
 * says it is unavailable is production's state while it has no price stores, not a failure: it is read as nothing and
 * written down nowhere: the price root already writes its own line for it, so a staff page load adds none.
 */
export async function readAdmitted<Value>(
  read: () => Promise<Value>,
): Promise<AdmittedRead<Value>> {
  try {
    return { kind: "read", value: await read() };
  } catch (failure) {
    if (!isStoreSayingUnavailable(failure)) {
      reportAccountEvent({ event: PRICE_READ_EVENT, outcome: "unavailable" });
    }
    return { kind: "unavailable" };
  }
}

export async function readStateOrNothing(): Promise<
  DashboardStateWire | undefined
> {
  const read = await readAdmitted(readDashboardStateForAdmittedPage);
  return read.kind === "read" ? read.value : undefined;
}

/** The state with the answer a draft that cannot be read gives, which `readStateOrNothing` does not tell apart. */
export function readStateReading(): Promise<AdmittedRead<StateWireReading>> {
  return readAdmitted(readDashboardReadingForAdmittedPage);
}
