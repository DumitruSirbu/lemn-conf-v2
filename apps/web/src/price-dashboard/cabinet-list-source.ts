import "server-only";

import { createTranslator } from "next-intl";

import { entryLabel, type PriceBook } from "@lemnaria/configurator-domain";

import { resolveBodyLabel, type ContentTranslator } from "@/i18n/content";
import { answerUnavailableOnFailure } from "@/lib/server/account/account-request";
import {
  PRICE_READ_EVENT,
  readDashboardForStaff,
  type DashboardReadRequest,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import roMessages from "@/messages/ro.json";

import {
  deriveCabinetList,
  type CabinetListPageInput,
} from "./cabinet-list-facts";
import { readDashboardStateWire } from "./price-draft-client";

// The one place the cabinet list's facts come from: the dashboard's own read, the answer `GET /api/staff/prices` gives, taken
// without the network hop and so with everything the route does first (the session and `price.edit`, the account's read
// limit, and the `price-catalogue-viewed` row that has to commit before a price is shown). Anything but a `200` that makes a
// list, an unreadable store included, is `unavailable`, and no price is claimed. The cabinets' names are the catalogue's
// Romanian ones, as the list shows them in both languages until the official translation.

export type CabinetListRead =
  | { readonly kind: "ready"; readonly page: CabinetListPageInput }
  | { readonly kind: "unavailable" };

const OK_STATUS = 200;

const romanian = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;

export async function readCabinetList(
  request: DashboardReadRequest,
): Promise<CabinetListRead> {
  const response = await answerUnavailableOnFailure(PRICE_READ_EVENT, () =>
    readDashboardForStaff(request),
  );
  if (response.status !== OK_STATUS) return { kind: "unavailable" };
  const state = readDashboardStateWire(
    await response.json().catch(() => undefined),
  );
  if (state === undefined) return { kind: "unavailable" };
  const page = {
    state,
    cabinetNames: cabinetNamesOf(state.active.book),
  };
  // The seam's own check: a list that cannot be worked out here would not be worked out in the browser either.
  return deriveCabinetList(page).kind === "ready"
    ? { kind: "ready", page }
    : { kind: "unavailable" };
}

function cabinetNamesOf(book: PriceBook): Readonly<Record<string, string>> {
  return Object.fromEntries(
    book.cabinetRules.map(({ buildId }) => [
      buildId,
      resolveBodyLabel(romanian, entryLabel(buildId)),
    ]),
  );
}
