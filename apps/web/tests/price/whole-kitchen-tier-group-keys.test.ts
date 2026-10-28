// Wave 6-B of the M6 audit remediation: a tier's delta is addressed by **group and id**, never by
// id alone (M6-AUD-003).
//
// `measureEveryDelta` used to compute the two groups' deltas separately and then flatten them —
// `new Map([...material, ...hardware])` — while `offeredGroup` looked up the bare `tierId`. A
// hardware id equal to a material one therefore overwrote the material amount, and the audit's
// measured witness was an 18 000 MDL veneer upgrade displayed as the 6 197,60 a hardware tier costs:
//
//     normal:   { hardwareSoftClose: 619760, materialVeneer: 1800000 }
//     collided: { hardware: 619760,          material: 619760 }
//
// **Two layers protect this. Only the first is reachable from here, and this file claims only it.**
// `parsePriceBook` refuses a book that repeats a tier id across the groups, and `priceDesign` parses
// the book it is handed on every call — so a collided book makes all six evaluations fail, the whole
// delta set degrades to absent, and the surface's group-scoped lookup is never reached. The second
// layer is therefore *invisible* for every book the parser accepts: within such a book the two
// groups' key sets are disjoint, so a flattened map would answer identically. It is defence in depth
// against a future relaxation of the parser's rule, not behaviour a public call can distinguish.
//
// An earlier version of this file asserted an anti-invariant over the collided book — *no material
// tier shows an amount from the hardware set* — and was satisfied by its own "the delta is absent"
// disjunct without ever reaching the lookup. What is asserted here instead is what actually fires:
// the shipped book's real amount, the parser's refusal naming the repeated id, and the choice
// surviving it. The positive per-group property — every published delta is the amount measured for
// that tier in that group — is proved in `qa-m6-wave-b-tier-deltas.adversarial.test.ts`, which is
// where the second layer's own behaviour is pinned as far as a public call can pin it.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  type HardwareTier,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

const BOOK = SAMPLE_PRICE_BOOK;

function measure(book: PriceBook = BOOK): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: BOOK.version,
    selections: KITCHEN_L_DESIGN.settings,
  });
}

/** The audit's collided book: the second hardware tier renamed onto the third material tier's id,
 *  with its rule id left alone so the collision is the tier id and nothing else. */
function bookCollidingTierIds(): {
  readonly book: PriceBook;
  readonly tierId: string;
} {
  // Thrown for rather than defaulted to "": an empty id would make the parser refuse for a second
  // reason, and every assertion below would pass without the collision ever being built.
  const collided = BOOK.material.tiers[2];
  if (!collided)
    throw new Error("the sample offers fewer than three material tiers");
  const tierId = collided.tierId;
  const tiers: readonly HardwareTier[] = BOOK.hardware.tiers.map(
    (tier, index) => (index === 1 ? { ...tier, tierId } : tier),
  );
  return { book: { ...BOOK, hardware: { ...BOOK.hardware, tiers } }, tierId };
}

describe("the delta a whole-kitchen tier states, and what a collided book does to it", () => {
  it("prices the shipped book's veneer upgrade at the material line the query itself publishes for it", () => {
    // The `normal` half of the witness. Read off a second evaluation of the query rather than written as a literal, so a
    // repriced sample moves the expectation with it: the delta is the material line, which is the default's zero less
    // the upgrade's percentage of the cabinets, each rounded to ten lei (ADR 0177 A-1).
    const veneer = BOOK.material.tiers[2];
    if (!veneer)
      throw new Error("the sample offers fewer than three material tiers");
    const offered = measure().material.tiers.find(
      (tier) => tier.tierId === veneer.tierId,
    );

    const materialLineAt = (materialTierId: string): number => {
      const result = priceDesign({
        deepeningRows: MEASURED_DEEPENING_ROWS,
        availability: NOTHING_DISABLED,
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: BOOK,
        pricingVersion: BOOK.version,
        selections: { materialTierId },
      });
      if (!result.ok)
        throw new Error("the seeded design was expected to price");
      const line = result.priced.lines.find(
        (candidate) => candidate.kind === "material",
      );
      if (line === undefined) throw new Error("no material line");
      return line.amountMinor;
    };

    expect(offered?.deltaMinor).toBeGreaterThan(0);
    expect(offered?.deltaMinor).toBe(
      materialLineAt(veneer.tierId) -
        materialLineAt(BOOK.material.defaultTierId),
    );
  });

  it("refuses the collided book at the parser, naming the id declared in both groups", () => {
    // The layer that actually fires, asserted where it fires rather than inferred from an absence
    // downstream. `priceDesign` parses the book it is handed, so this is the same refusal every one
    // of `measureEveryDelta`'s six evaluations meets.
    const { book, tierId } = bookCollidingTierIds();

    const result = priceDesign({
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book,
      pricingVersion: BOOK.version,
      selections: KITCHEN_L_DESIGN.settings,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.failure.code).toBe(
      "INVALID_PRICE_BOOK",
    );
    expect(result.ok ? undefined : result.failure.id).toBe(tierId);
  });

  it("answers the collided book without raising, so the settings sheet still offers the choice", () => {
    // The module's own standing rule: a pricing failure costs the customer the numbers, never the
    // control that could put the document right.
    const { book } = bookCollidingTierIds();

    expect(() => measure(book)).not.toThrow();
    expect(measure(book).material.tierIds).toEqual(
      BOOK.material.tiers.map((tier) => tier.tierId),
    );
  });
});
