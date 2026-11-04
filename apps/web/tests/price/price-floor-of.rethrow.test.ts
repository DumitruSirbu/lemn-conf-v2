// The catalogue builder's two documented refusals of a depth it cannot build make `priceFloorOf` answer nothing; any
// other throw is a defect and must propagate, so that on the card the render fails loudly rather than the price silently
// going missing (the comment on `buildCatalogAtDepthOf`).
import {
  CabinetDepthBelowMinimumError,
  KITCHEN_L_DESIGN,
  UnknownWorktopDepthError,
} from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const buildCatalog = vi.hoisted(() => vi.fn());

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return { ...original, buildKitchenLBodyCatalog: buildCatalog };
});

const { priceFloorOf } = await import("@/price/price-book-root");
const { SAMPLE_PRICE_ROOT } = await import("../support/sample-price-root");

beforeEach(() => {
  buildCatalog.mockReset();
});

describe("priceFloorOf when the catalogue cannot be built", () => {
  it("answers nothing for a worktop depth the map does not declare", () => {
    buildCatalog.mockImplementation(() => {
      throw new UnknownWorktopDepthError(655);
    });
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toBeUndefined();
  });

  it("answers nothing for a cabinet depth below the dishwasher floor", () => {
    buildCatalog.mockImplementation(() => {
      throw new CabinetDepthBelowMinimumError(400);
    });
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toBeUndefined();
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a TypeError", new TypeError("x is not a function")],
    ["a RangeError", new RangeError("too deep")],
  ])("rethrows %s unchanged", (_, error) => {
    buildCatalog.mockImplementation(() => {
      throw error;
    });
    expect(() => priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toThrow(
      error,
    );
  });

  it("rethrows a thrown non-error value", () => {
    buildCatalog.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test is a thrown string.
      throw "a string";
    });
    expect(() => priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toThrow(
      "a string",
    );
  });

  it("builds the catalogue at the document's own cabinet depth", () => {
    buildCatalog.mockImplementation(() => {
      throw new UnknownWorktopDepthError(1);
    });
    priceFloorOf(SAMPLE_PRICE_ROOT, {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: 700 },
    });
    expect(buildCatalog).toHaveBeenCalledWith(700);
  });
});
