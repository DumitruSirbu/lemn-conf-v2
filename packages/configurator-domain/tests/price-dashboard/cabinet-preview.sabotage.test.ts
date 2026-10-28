// M10 M2-c sabotage: the preview owns no arithmetic. When the pricing module's own functions are made to answer
// differently, every preview cell moves with them; a preview that rounded or multiplied for itself would not.
import { describe, expect, it, vi } from "vitest";

import { previewCabinet } from "../../src/price-dashboard/cabinet-preview.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

import {
  CATALOG,
  DEEP_DEPTH_MM,
  DEEPENING_ROWS,
  REFERENCE_MATERIAL_ID,
  ruleOf,
} from "./m2-support.js";

const SHIFT_OF_THE_STAGE_MINOR = 1_000;
const SHIFT_OF_THE_AMOUNT_MINOR = 100_000;

const sabotage = vi.hoisted(() => ({
  isStageShifted: false,
  isAmountShifted: false,
}));

vi.mock("../../src/pricing/percentage-lines.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../src/pricing/percentage-lines.js")
    >();
  return {
    ...original,
    percentageStagesOf: (
      ...args: Parameters<typeof original.percentageStagesOf>
    ) => {
      const stages = original.percentageStagesOf(...args);
      return sabotage.isStageShifted
        ? {
            ...stages,
            withDepthMinor: stages.withDepthMinor + SHIFT_OF_THE_STAGE_MINOR,
          }
        : stages;
    },
  };
});

vi.mock("../../src/pricing/price-book.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/pricing/price-book.js")>();
  return {
    ...original,
    amountForBody: (...args: Parameters<typeof original.amountForBody>) => {
      const amount = original.amountForBody(...args);
      return sabotage.isAmountShifted && amount !== undefined
        ? amount + SHIFT_OF_THE_AMOUNT_MINOR
        : amount;
    },
  };
});

const options = {
  material: REFERENCE_MATERIAL_ID,
  depth: DEEP_DEPTH_MM,
  deepeningRows: DEEPENING_ROWS,
};

function cellsOf(): readonly number[] {
  const preview = previewCabinet(
    ruleOf("base-cabinet"),
    CATALOG,
    SAMPLE_PRICE_BOOK,
    options,
  );
  if (!preview.ok) throw new Error(preview.code);
  return preview.rows.map(({ priceMinor }) => priceMinor);
}

describe("the preview moves with the pricing module", () => {
  it("shifts every cell by what the percentage seam's third stage is shifted by", () => {
    const before = cellsOf();

    sabotage.isStageShifted = true;
    const after = cellsOf();
    sabotage.isStageShifted = false;

    expect(after).toEqual(
      before.map((cell) => cell + SHIFT_OF_THE_STAGE_MINOR),
    );
  });

  it("changes every cell when the exact amount of a body is changed", () => {
    const before = cellsOf();

    sabotage.isAmountShifted = true;
    const after = cellsOf();
    sabotage.isAmountShifted = false;

    expect(after).toHaveLength(before.length);
    after.forEach((cell, index) => {
      expect(cell).toBeGreaterThan(before[index] ?? Infinity);
    });
  });
});
