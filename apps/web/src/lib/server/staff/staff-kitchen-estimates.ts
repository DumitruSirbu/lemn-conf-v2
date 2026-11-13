import "server-only";

import type { Design } from "@lemnaria/configurator-domain";
import type { StaffKitchenDetail } from "@lemnaria/persistence";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { holdsNoCabinets } from "@/price/starting-price";
import {
  buildCatalogAtDepthOf,
  priceAgainstBook,
  type PriceBookRoot,
} from "@/price/price-book-root";
import type {
  StaffEstimateEmptyWire,
  StaffEstimateRefusedWire,
  StaffEstimateWire,
  StaffKitchenEstimatesWire,
} from "@/staff/staff-kitchens-wire-contract";

// The sent total is read from what was stored with the request and never priced again, so a later publish cannot move
// it (ADR 0154).

/** The pricing code a kitchen gets when it has no document this build reads, or one the catalogue cannot be built for:
 *  the pricing has no code for either, and in both no body of the kitchen can be resolved. */
const UNPRICEABLE_KITCHEN: StaffEstimateRefusedWire = Object.freeze({
  refused: "UNKNOWN_BODY",
});

/** A kitchen with no cabinet has no estimate: the whole-kitchen lines an empty design still carries would read as a price
 *  over nothing, as on every other price surface. It is not a pricing refusal, so no code is made up for it. */
const EMPTY_KITCHEN: StaffEstimateEmptyWire = Object.freeze({ empty: true });

type CurrentEstimate =
  | StaffEstimateWire
  | StaffEstimateRefusedWire
  | StaffEstimateEmptyWire;

export async function estimatesOfKitchen(
  kitchen: StaffKitchenDetail,
): Promise<StaffKitchenEstimatesWire> {
  return {
    sentEstimate: sentEstimateOf(kitchen),
    currentEstimate: await currentEstimateOf(kitchen.design),
  };
}

function sentEstimateOf(kitchen: StaffKitchenDetail): StaffEstimateWire | null {
  if (kitchen.sentTotal === null) return null;
  const { totalMinor, currency } = kitchen.sentTotal;
  return { totalMinor, currency };
}

async function currentEstimateOf(
  design: Design | null,
): Promise<CurrentEstimate> {
  if (design === null) return UNPRICEABLE_KITCHEN;
  return priceNow(await readActivePriceBook(), design);
}

function priceNow(root: PriceBookRoot, design: Design): CurrentEstimate {
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) return UNPRICEABLE_KITCHEN;
  const result = priceAgainstBook(root, design, catalog);
  if (!result.ok) return { refused: result.failure.code };
  if (holdsNoCabinets(result.priced)) return EMPTY_KITCHEN;
  const { totalMinor, currency } = result.priced;
  return { totalMinor, currency };
}
