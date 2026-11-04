import "server-only";

import {
  DashboardStoreError,
  type PriceBookStore,
} from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { DashboardStateUnreadableError } from "@/lib/server/price-dashboard/dashboard-state";
import { PRICE_READ_EVENT } from "@/lib/server/price-dashboard/price-dashboard-service";
import { reportNoPriceBook } from "@/lib/server/price-book-log";
import { getPriceStores } from "@/lib/server/price-stores";
import { UNAVAILABLE_PRICE_BOOK_STORE } from "@/lib/server/unavailable-price-stores";

// What a page read does with a failure of the stores. A store's own failure, and a stored value that is not what the store
// declares, are nothing to show and one line to write down; anything else is a defect of ours and is thrown on, as the
// price root throws it. A store that says it is unavailable while production holds the stub stores is production with no
// database connection to make, which the price root writes down on every request; a page read adds no second line for it.
// A database store that says it is unavailable is a real outage and is written down.

export async function absorbStoreFailure(failure: unknown): Promise<void> {
  if (failure instanceof DashboardStoreError) {
    if (await isStubUnavailable(failure)) return;
    reportNoPriceBook(
      failure.failure === "unavailable" ? "store-unavailable" : "store-failed",
      { operation: failure.operation, kind: failure.failure },
    );
    return;
  }
  if (failure instanceof DashboardStateUnreadableError) {
    reportAccountEvent({ event: PRICE_READ_EVENT, outcome: "unavailable" });
    return;
  }
  throw failure;
}

async function isStubUnavailable(
  failure: DashboardStoreError,
): Promise<boolean> {
  if (failure.failure !== "unavailable") return false;
  const held: PriceBookStore | undefined = await getPriceStores().then(
    ({ priceBook }) => priceBook,
    () => undefined,
  );
  return held === UNAVAILABLE_PRICE_BOOK_STORE;
}
