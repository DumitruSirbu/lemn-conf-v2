import { HandleSchema, type ItemRef } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  NO_PRICE_BOOK,
  offerHandlesAgainstBook,
  UnreadablePriceBookError,
} from "@/price/price-book-root";

import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

function rootSwitchingOff(disabled: readonly ItemRef[]) {
  return { ...SAMPLE_PRICE_ROOT, availability: { revision: "1", disabled } };
}

describe("the handles on offer", () => {
  it("are every declared handle, in the declared order, while nothing is switched off", () => {
    expect(offerHandlesAgainstBook(SAMPLE_PRICE_ROOT)).toEqual(
      HandleSchema.options,
    );
  });

  it("leave out exactly the handles availability switched off", () => {
    const root = rootSwitchingOff([
      { kind: "handle", handle: "steel" },
      { kind: "handle", handle: "push" },
    ]);

    expect(offerHandlesAgainstBook(root)).toEqual(["black"]);
  });

  it("are not touched by a switched-off item of another kind", () => {
    const root = rootSwitchingOff([
      { kind: "material", tierId: "steel" },
      { kind: "accessory", accessoryId: "black" },
    ]);

    expect(offerHandlesAgainstBook(root)).toEqual(HandleSchema.options);
  });

  it("raise when there is no book, as the tier offer does, rather than answer every handle", () => {
    expect(() => offerHandlesAgainstBook(NO_PRICE_BOOK)).toThrow(
      UnreadablePriceBookError,
    );
  });
});
