// The whole-kitchen tier offer over the sample book, for suites that switch tiers off and read what is offered.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  tierRef,
  type CatalogueAvailability,
  type Design,
  type PriceBook,
  type TierGroup,
  type TierIdentity,
} from "@lemnaria/configurator-domain";

import { offerTiersAgainstBook } from "@/price/price-book-root";
import {
  isTierOffered,
  offerWholeKitchenTiers,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";

import { MEASURED_DEEPENING_ROWS } from "./deepening-rows";
import { SAMPLE_PRICE_ROOT } from "./sample-price-root";

export const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
export const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);
export const MATERIAL_DEFAULT_TIER_ID =
  SAMPLE_PRICE_BOOK.material.defaultTierId;
export const HARDWARE_DEFAULT_TIER_ID =
  SAMPLE_PRICE_BOOK.hardware.defaultTierId;

/** The tier ids of each group, by the one shape every helper here takes. */
export interface TiersByGroup {
  readonly material?: readonly string[];
  readonly hardware?: readonly string[];
}

/** An availability that has exactly these tiers switched off. */
export function switchedOffTiers(
  off: TiersByGroup = {},
): CatalogueAvailability {
  return {
    revision: "1",
    disabled: [
      ...(off.material ?? []).map((tierId) => tierRef("material", tierId)),
      ...(off.hardware ?? []).map((tierId) => tierRef("hardware", tierId)),
    ],
  };
}

/** The kitchen with exactly these tiers chosen in its settings, and its depth as the sample kitchen has it. */
export function kitchenCarrying(carried: {
  readonly materialTierId?: string | undefined;
  readonly hardwareTierId?: string | undefined;
}): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      ...(carried.materialTierId === undefined
        ? {}
        : { materialTierId: carried.materialTierId }),
      ...(carried.hardwareTierId === undefined
        ? {}
        : { hardwareTierId: carried.hardwareTierId }),
    },
  };
}

/** The tier offer as the pure query answers it, under any book. */
export function offerUnder(
  availability: CatalogueAvailability,
  design: Design = KITCHEN_L_DESIGN,
  book: PriceBook = SAMPLE_PRICE_BOOK,
): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: book.version,
    selections: design.settings,
  });
}

/** The tier offer as a page's root hands it over, which is the path the editor takes. */
export function offerThroughRoot(
  availability: CatalogueAvailability,
  design: Design = KITCHEN_L_DESIGN,
  book: PriceBook = SAMPLE_PRICE_BOOK,
): WholeKitchenTierOffer {
  const answer = offerTiersAgainstBook(
    { ...SAMPLE_PRICE_ROOT, book, availability },
    design,
    KITCHEN_L_BODY_CATALOG,
  );
  if (!isTierOffered(answer)) throw new Error("an active root made no offer");
  return answer;
}

/** The same book as if it had never held these tiers: the oracle for what a switched-off tier must not change. */
export function bookWithout(book: PriceBook, removed: TiersByGroup): PriceBook {
  return {
    ...book,
    material: groupWithout(book.material, removed.material ?? []),
    hardware: groupWithout(book.hardware, removed.hardware ?? []),
  };
}

function groupWithout<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
  removed: readonly string[],
): TierGroup<TTier> {
  return {
    ...group,
    tiers: group.tiers.filter((tier) => !removed.includes(tier.tierId)),
  };
}

/** What each measured tier of a group states as its delta, in the order the group lists them. */
export function deltasOf(
  group: OfferedTierGroup,
): readonly (number | undefined)[] {
  return group.tiers.map((tier) => tier.deltaMinor);
}
