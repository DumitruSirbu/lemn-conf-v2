import "server-only";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  PRICE_READ_EVENT,
  readDashboardStateForAdmittedPage,
} from "@/lib/server/price-dashboard/price-dashboard-service";

import type { DashboardStateWire } from "./price-dashboard-wire-contract";

/** A store that fails is nothing to show, and the line written down names the event and the outcome alone. */
export async function readStateOrNothing(): Promise<
  DashboardStateWire | undefined
> {
  try {
    return await readDashboardStateForAdmittedPage();
  } catch {
    reportAccountEvent({ event: PRICE_READ_EVENT, outcome: "unavailable" });
    return undefined;
  }
}
