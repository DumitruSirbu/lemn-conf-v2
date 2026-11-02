import "server-only";

import { createTranslator } from "next-intl";

import { entryLabel, type PriceBook } from "@lemnaria/configurator-domain";

import { resolveBodyLabel, type ContentTranslator } from "@/i18n/content";
import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  PRICE_READ_EVENT,
  readDashboardStateForAdmittedPage,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import roMessages from "@/messages/ro.json";

import {
  deriveCabinetList,
  type CabinetListPageInput,
} from "./cabinet-list-facts";
import type { DashboardStateWire } from "./price-dashboard-wire-contract";
import { readDashboardStateWire } from "./price-dashboard-wire-reading";

// The one place the cabinet list's facts come from: the dashboard's state, read for a page whose staff gate
// (`price.edit`) has already admitted the reader. A render reads and never writes, so this touches no session, spends
// no limiter bucket and leaves no audit row; the route that serves the same state to the browser still does all three.
// Whatever cannot make a list, an unreadable store included, is `unavailable`, and no price is claimed. The cabinets'
// names are the catalogue's Romanian ones, as the list shows them in both languages until the official translation.

export type CabinetListRead =
  | { readonly kind: "ready"; readonly page: CabinetListPageInput }
  | { readonly kind: "unavailable" };

const romanian = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;

export async function readCabinetList(): Promise<CabinetListRead> {
  const state = readDashboardStateWire(await readStateOrNothing());
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

/** A store that fails is nothing to show, and the line written down names the event and the outcome alone. */
async function readStateOrNothing(): Promise<DashboardStateWire | undefined> {
  try {
    return await readDashboardStateForAdmittedPage();
  } catch {
    reportAccountEvent({ event: PRICE_READ_EVENT, outcome: "unavailable" });
    return undefined;
  }
}

function cabinetNamesOf(book: PriceBook): Readonly<Record<string, string>> {
  return Object.fromEntries(
    book.cabinetRules.map(({ buildId }) => [
      buildId,
      resolveBodyLabel(romanian, entryLabel(buildId)),
    ]),
  );
}
