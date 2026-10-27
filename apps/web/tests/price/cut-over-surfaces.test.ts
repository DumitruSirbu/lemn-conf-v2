// **Every price surface is priced through the cut-over book, with the measured deepening set** (M10 P3).
//
// The book the application reads is the percentage-form sample, seeded as published version 1, read through the one
// server root and projected onto its declared members (R1). Each surface below takes that root and prices a kitchen at
// the default depth and at the deep one, and each answer is held against a second, independent evaluation of the domain
// query handed the set measured here, so a surface that priced with an empty set, or with a book of its own, goes red.
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  measureDeepeningRows,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { seedFakePriceStores } from "@/lib/server/price-book-test-seed";
import { shippedDeepeningRows } from "@/price/deepening-rows";
import {
  offerTiersAgainstBook,
  priceAgainstBook,
  priceFloorOf,
  type ActivePriceBook,
} from "@/price/price-book-root";

import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { aHarness, bodyOf } from "../lib/server/contact/submit-contact-harness";

function kitchenAt(depthMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: depthMm },
  };
}

async function readRoot(): Promise<ActivePriceBook> {
  const root = await readActivePriceBook(await seedFakePriceStores());
  if (root.kind !== "active") throw new Error("the seeded book was not read");
  return root;
}

/** The domain query on the root's own book, handed the set measured in this file. */
function priceIndependently(
  root: ActivePriceBook,
  design: Design,
  selections = design.settings,
): PricedDesign {
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(
      design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
    ),
    book: root.book,
    pricingVersion: root.book.version,
    selections,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
  if (!result.ok) throw new Error(result.failure.code);
  return result.priced;
}

function depthLineOf(priced: PricedDesign) {
  return priced.lines.find((line) => line.kind === "depth");
}

describe("the set every surface prices with is the one measured from the catalogue at the two depths", () => {
  it("is the measured set, and not an empty one", () => {
    const measured = measureDeepeningRows(
      buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
      buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM),
    );

    expect([...shippedDeepeningRows()].sort()).toEqual([...measured].sort());
    expect(shippedDeepeningRows().size).toBeGreaterThan(0);
  });

  it("is measured once and kept: two reads are one set", () => {
    expect(shippedDeepeningRows()).toBe(shippedDeepeningRows());
  });
});

describe("the seeded book reaches the root whole", () => {
  it("projects the percentage-form sample onto its declared members and drops none of it", async () => {
    const root = await readActivePriceBook(await seedFakePriceStores());

    expect(root.kind).toBe("active");
    if (root.kind !== "active") return;
    expect(root.book).toEqual({
      ...SAMPLE_PRICE_BOOK,
      version: root.versionId,
    });
    expect(root.book.depthRule).toEqual(SAMPLE_PRICE_BOOK.depthRule);
    expect(root.book.amountsProvisional).toBe(true);
    expect(root.book.status).toBe("estimate");
  });
});

describe("the bar and the breakdown price the kitchen through the root", () => {
  it("answers the independent evaluation at the default depth, with no depth line", async () => {
    const root = await readRoot();
    const design = kitchenAt(DEFAULT_CABINET_DEPTH_MM);

    const result = priceAgainstBook(
      root,
      design,
      buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    );

    expect(result.ok && result.priced).toEqual(
      priceIndependently(root, design),
    );
    expect(result.ok && depthLineOf(result.priced)).toBeFalsy();
  });

  it("answers the independent evaluation at the deep depth, with a depth line that the measured rows earn", async () => {
    const root = await readRoot();
    const design = kitchenAt(DEEP_CABINET_DEPTH_MM);

    const result = priceAgainstBook(
      root,
      design,
      buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM),
    );

    expect(result.ok && result.priced).toEqual(
      priceIndependently(root, design),
    );
    const depth = result.ok ? depthLineOf(result.priced) : undefined;
    expect(depth?.amountMinor).toBeGreaterThan(0);
  });
});

describe("the whole-kitchen offer prices through the root", () => {
  it("measures every material delta at the deep depth as the independent evaluation does, depth line included", async () => {
    const root = await readRoot();
    const design = kitchenAt(DEEP_CABINET_DEPTH_MM);

    const offer = offerTiersAgainstBook(
      root,
      design,
      buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM),
    );

    for (const tier of offer.material.tiers) {
      expect(tier.deltaMinor, tier.tierId).toBe(
        priceIndependently(root, design, {
          ...design.settings,
          materialTierId: tier.tierId,
        }).totalMinor -
          priceIndependently(root, design, {
            ...design.settings,
            materialTierId: root.book.material.defaultTierId,
          }).totalMinor,
      );
    }
    expect(
      offer.material.tiers.some((tier) => (tier.deltaMinor ?? 0) > 0),
    ).toBe(true);
  });
});

describe("the account card and the staff view price the stored kitchen through the root", () => {
  it.each([DEFAULT_CABINET_DEPTH_MM, DEEP_CABINET_DEPTH_MM])(
    "gives the stored kitchen's starting price at %i mm as the independent evaluation",
    async (depthMm) => {
      const root = await readRoot();
      const design = kitchenAt(depthMm);

      expect(priceFloorOf(root, design)).toEqual(
        priceIndependently(root, design),
      );
    },
  );
});

describe("the submission snapshot prices through the one book the request was digested under", () => {
  it("stores a depth line for a kitchen built at the deep depth, and none for one at the default", async () => {
    const stored = async (depthMm: number) => {
      const harness = aHarness({ design: kitchenAt(depthMm) });
      const answer = await harness.submit(bodyOf());
      expect(answer.status).toBe(200);
      return harness.store.heldSubmissions()[0]?.submission.snapshot?.priced;
    };

    const deep = await stored(DEEP_CABINET_DEPTH_MM);
    const shallow = await stored(DEFAULT_CABINET_DEPTH_MM);

    expect(deep && depthLineOf(deep)?.amountMinor).toBeGreaterThan(0);
    expect(shallow && depthLineOf(shallow)).toBeUndefined();
  });
});
