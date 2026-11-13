// The example on a material's page: every figure is a cell of `previewCabinet`, the surcharge is the one typed, and
// where the book cannot price the cabinet there is no example.
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import {
  EXAMPLE_BUILD_ID,
  EXAMPLE_WIDTH_MM,
  materialExampleOf,
} from "@/price-dashboard/material-example";
import { surchargeAddressOf } from "@/price-dashboard/material-model";

import { MDF, PAL, previewedPrice } from "./material-harness";

const ACTIVE_MDF_PERCENT =
  SAMPLE_PRICE_BOOK.material.tiers.find((tier) => tier.tierId === MDF)
    ?.percentOfCabinets ?? Number.NaN;

function bookWith(percent: number): PriceBook {
  const applied = applyChanges(SAMPLE_PRICE_BOOK, [
    { address: surchargeAddressOf(MDF), value: percent },
  ]);
  if (!applied.ok) throw new Error("the surcharge did not apply");
  return applied.book;
}

const input = (percent: number) => ({
  active: SAMPLE_PRICE_BOOK,
  draft: SAMPLE_PRICE_BOOK,
  tierId: MDF,
  percent,
});

describe("the figures", () => {
  it("are the cabinet in PAL and in the material at each depth, as the preview prices them with the surcharge typed", () => {
    const typed = bookWith(35);

    const example = materialExampleOf(input(35));

    expect(example?.next).toEqual({
      standard: {
        referenceMinor: previewedPrice(typed, PAL, DEFAULT_CABINET_DEPTH_MM),
        materialMinor: previewedPrice(typed, MDF, DEFAULT_CABINET_DEPTH_MM),
      },
      deep: {
        referenceMinor: previewedPrice(typed, PAL, DEEP_CABINET_DEPTH_MM),
        materialMinor: previewedPrice(typed, MDF, DEEP_CABINET_DEPTH_MM),
      },
    });
    expect(example?.widthMm).toBe(EXAMPLE_WIDTH_MM);
    expect(example?.deepMm).toBe(DEEP_CABINET_DEPTH_MM);
  });

  it("move with the surcharge and leave PAL's price where it is", () => {
    const low = materialExampleOf(input(10));
    const high = materialExampleOf(input(60));

    expect(high?.next.standard.materialMinor).toBeGreaterThan(
      low?.next.standard.materialMinor ?? Number.POSITIVE_INFINITY,
    );
    expect(high?.next.standard.referenceMinor).toBe(
      low?.next.standard.referenceMinor,
    );
  });

  it("price a surcharge of nothing as PAL's own price", () => {
    const example = materialExampleOf(input(0));

    expect(example?.next.standard.materialMinor).toBe(
      example?.next.standard.referenceMinor,
    );
  });
});

describe("the active version's line", () => {
  it("is drawn where the surcharge typed prices the cabinet differently from the active version", () => {
    const example = materialExampleOf(input(ACTIVE_MDF_PERCENT + 20));

    expect(example?.active).toEqual({
      referenceMinor: previewedPrice(
        SAMPLE_PRICE_BOOK,
        PAL,
        DEFAULT_CABINET_DEPTH_MM,
      ),
      materialMinor: previewedPrice(
        SAMPLE_PRICE_BOOK,
        MDF,
        DEFAULT_CABINET_DEPTH_MM,
      ),
    });
  });

  it("is left out where nothing differs, so the same figures are not said twice", () => {
    expect(
      materialExampleOf(input(ACTIVE_MDF_PERCENT))?.active,
    ).toBeUndefined();
  });
});

describe("where the book cannot price the example", () => {
  it("draws none for a book without the example cabinet", () => {
    const withoutIt: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.filter(
        ({ buildId }) => buildId !== EXAMPLE_BUILD_ID,
      ),
    };

    expect(
      materialExampleOf({ ...input(20), active: withoutIt, draft: withoutIt }),
    ).toBeUndefined();
  });

  it("draws none for the reference material, whose surcharge no draft may set", () => {
    expect(materialExampleOf({ ...input(20), tierId: PAL })).toBeUndefined();
  });

  it("draws none for a surcharge the book refuses", () => {
    expect(materialExampleOf(input(10_000))).toBeUndefined();
  });
});
