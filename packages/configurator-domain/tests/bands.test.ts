import { describe, expect, it } from "vitest";

import {
  COLUMN_SLOT_MIN_HEIGHT_M,
  deriveSlotBand,
  FLOOR_SLOT_MAX_Y0_M,
  isBandAccepted,
  isPushOpenByDefault,
  normaliseBand,
  TOP_ROW_Y0_M,
} from "../src/bands.js";

describe("normaliseBand", () => {
  // ADR 0011 Gap C: the seeded `top` entries are refused from every opening in the product,
  // including their own slot on a swap, unless `top` normalises to `wall` here.
  it("normalises the seeded top row to wall", () => {
    expect(normaliseBand("top")).toBe("wall");
  });

  it("leaves the three catalogue bands alone", () => {
    expect(normaliseBand("base")).toBe("base");
    expect(normaliseBand("wall")).toBe("wall");
    expect(normaliseBand("column")).toBe("column");
  });
});

describe("deriveSlotBand", () => {
  it("targets column at the column threshold and wall just below it", () => {
    expect(deriveSlotBand({ y0: 0, h: COLUMN_SLOT_MIN_HEIGHT_M })).toBe(
      "column",
    );
    expect(
      deriveSlotBand({ y0: 0.5, h: COLUMN_SLOT_MIN_HEIGHT_M - 0.001 }),
    ).toBe("wall");
  });

  it("targets base below the floor threshold and wall at it", () => {
    expect(deriveSlotBand({ y0: FLOOR_SLOT_MAX_Y0_M - 0.001, h: 0.86 })).toBe(
      "base",
    );
    expect(deriveSlotBand({ y0: FLOOR_SLOT_MAX_Y0_M, h: 0.86 })).toBe("wall");
  });

  it("never yields top", () => {
    expect(deriveSlotBand({ y0: TOP_ROW_Y0_M, h: 0.4 })).toBe("wall");
  });
});

describe("isBandAccepted", () => {
  it("refuses a wall body from a floor slot", () => {
    expect(isBandAccepted("wall", "base")).toBe(false);
  });

  it("refuses a base body from a wall slot", () => {
    expect(isBandAccepted("base", "wall")).toBe(false);
  });

  it("lets a column body into any slot, and any body into a column slot", () => {
    expect(isBandAccepted("column", "base")).toBe(true);
    expect(isBandAccepted("column", "wall")).toBe(true);
    expect(isBandAccepted("wall", "column")).toBe(true);
    expect(isBandAccepted("base", "column")).toBe(true);
  });
});

describe("isPushOpenByDefault", () => {
  it("switches at the top-row module line, not below it", () => {
    expect(isPushOpenByDefault(TOP_ROW_Y0_M)).toBe(true);
    expect(isPushOpenByDefault(TOP_ROW_Y0_M - 0.001)).toBe(false);
  });
});
