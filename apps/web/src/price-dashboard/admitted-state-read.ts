import "server-only";

import { absorbStoreFailure } from "@/lib/server/price-dashboard/admitted-failure";
import {
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
 * A store that fails is nothing to show; `absorbStoreFailure` writes down what is worth it and throws on what is a
 * defect.
 */
export async function readAdmitted<Value>(
  read: () => Promise<Value>,
): Promise<AdmittedRead<Value>> {
  try {
    return { kind: "read", value: await read() };
  } catch (failure) {
    await absorbStoreFailure(failure);
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
