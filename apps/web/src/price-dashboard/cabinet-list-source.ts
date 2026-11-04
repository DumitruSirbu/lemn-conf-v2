import "server-only";

import { readStateOrNothing } from "./admitted-state-read";
import {
  deriveCabinetList,
  type CabinetListPageInput,
} from "./cabinet-list-facts";
import { readDashboardStateWire } from "./price-dashboard-wire-reading";
import { romanianCabinetNamesOf } from "./romanian-cabinet-names";

// The one place the cabinet list's facts come from: the dashboard's state, read for a page whose staff gate
// (`price.edit`) has already admitted the reader. A render reads and never writes, so this touches no session, spends
// no limiter bucket and leaves no audit row; the route that serves the same state to the browser still does all three.
// Whatever cannot make a list, an unreadable store included, is `unavailable`, and no price is claimed. The cabinets'
// names are the catalogue's Romanian ones, as the list shows them in both languages until the official translation.

export type CabinetListRead =
  | { readonly kind: "ready"; readonly page: CabinetListPageInput }
  | { readonly kind: "unavailable" };

/** One cabinet's page: the same state, and the cabinet asked for, which the book may not hold. */
export type CabinetDetailRead =
  | { readonly kind: "ready"; readonly page: CabinetListPageInput }
  | { readonly kind: "not-found" }
  | { readonly kind: "unavailable" };

export async function readCabinetList(): Promise<CabinetListRead> {
  const page = await readPage();
  return page === undefined ? { kind: "unavailable" } : { kind: "ready", page };
}

/** The page for a cabinet's own address. The id is judged here, after the staff gate has admitted the reader. */
export async function readCabinetDetail(
  ruleId: string,
): Promise<CabinetDetailRead> {
  const page = await readPage();
  if (page === undefined) return { kind: "unavailable" };
  const holdsRule = page.state.active.book.cabinetRules.some(
    (rule) => rule.ruleId === ruleId,
  );
  return holdsRule ? { kind: "ready", page } : { kind: "not-found" };
}

async function readPage(): Promise<CabinetListPageInput | undefined> {
  const state = readDashboardStateWire(await readStateOrNothing());
  if (state === undefined) return undefined;
  const page = {
    state,
    cabinetNames: romanianCabinetNamesOf(state.active.book),
  };
  // The seam's own check: a list that cannot be worked out here would not be worked out in the browser either.
  return deriveCabinetList(page).kind === "ready" ? page : undefined;
}
