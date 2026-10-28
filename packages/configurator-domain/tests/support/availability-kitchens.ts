// Kitchens that name switchable items, and the helpers the availability suites share. The shipped kitchen names no
// colour and no handle, so a suite about availability builds one that names each, at the kitchen level and on a cabinet.
import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { paletteFinish } from "../../src/materials.js";
import type {
  CatalogueAvailability,
  ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricingResult } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "./deepening-rows.js";

export const BOOK = SAMPLE_PRICE_BOOK;
export const CATALOG = KITCHEN_L_BODY_CATALOG;

export function material(tierId: string): ItemRef {
  return { kind: "material", tierId };
}

export function hardware(tierId: string): ItemRef {
  return { kind: "hardware", tierId };
}

export function colour(finishId: string): ItemRef {
  return { kind: "finish", finishId };
}

export function handle(name: "steel" | "black" | "push"): ItemRef {
  return { kind: "handle", handle: name };
}

export function accessory(accessoryId: string): ItemRef {
  return { kind: "accessory", accessoryId };
}

export function availabilityOf(
  disabled: readonly ItemRef[],
  revision = "revision-1",
): CatalogueAvailability {
  return { revision, disabled };
}

/** The first placement whose catalogue row can wear a colour and a handle of its own. */
const CUSTOMISABLE_PLACEMENT = (() => {
  const found = KITCHEN_L_DESIGN.placements.find((placement) => {
    const definition = CATALOG.get(placement.body.buildId);
    return (
      definition !== undefined && definition.canFinish && definition.canHandle
    );
  });
  if (!found) throw new Error("the seeded kitchen has no customisable body");
  return found;
})();

/** The first placement whose catalogue row can wear neither. */
const PLAIN_PLACEMENT = (() => {
  const found = KITCHEN_L_DESIGN.placements.find((placement) => {
    const definition = CATALOG.get(placement.body.buildId);
    return (
      definition !== undefined && !definition.canFinish && !definition.canHandle
    );
  });
  if (!found) throw new Error("the seeded kitchen has no body that is plain");
  return found;
})();

export const CUSTOMISABLE_PLACEMENT_ID = CUSTOMISABLE_PLACEMENT.id;
export const PLAIN_PLACEMENT_ID = PLAIN_PLACEMENT.id;

/** The seeded kitchen with its whole-kitchen settings replaced, everything else as shipped. */
export function withSettings(
  settings: NonNullable<Design["settings"]>,
): Design {
  return { ...KITCHEN_L_DESIGN, settings };
}

/** The seeded kitchen with one placement's body amended. */
export function withBodyOf(
  placementId: string,
  amendment: Partial<Design["placements"][number]["body"]>,
  base: Design = KITCHEN_L_DESIGN,
): Design {
  return {
    ...base,
    placements: base.placements.map((placement) =>
      placement.id === placementId
        ? { ...placement, body: { ...placement.body, ...amendment } }
        : placement,
    ),
  };
}

/** Veneer, premium hardware, a colour and two handles on the kitchen, and a colour and a handle of one cabinet's own:
 *  seven distinct items, two of them each named at two levels. */
export function kitchenNamingEverything(): Design {
  return withBodyOf(
    CUSTOMISABLE_PLACEMENT_ID,
    { finish: paletteFinish("veneer.stejar"), handle: "push" },
    withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
      finish: paletteFinish("veneer.nuc"),
      handle: "black",
      topRowHandle: "steel",
    }),
  );
}

/** What `kitchenNamingEverything` names, in `distinctItemsInOrder`'s order. */
export const ITEMS_NAMED_BY_THAT_KITCHEN: readonly ItemRef[] = [
  material("material.veneer"),
  hardware("hardware.premium"),
  colour("veneer.nuc"),
  colour("veneer.stejar"),
  handle("black"),
  handle("push"),
  handle("steel"),
];

/** A design priced as every price surface prices it: its own settings are the selections. */
export function priceUnder(
  availability: CatalogueAvailability,
  design: Design = KITCHEN_L_DESIGN,
  book: PriceBook = BOOK,
): PricingResult {
  return priceDesign({
    design,
    catalog: CATALOG,
    book,
    pricingVersion: book.version,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability,
  });
}
