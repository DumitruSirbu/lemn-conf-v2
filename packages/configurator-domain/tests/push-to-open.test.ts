// The one predicate wave 6T-a exists to make one (ADR 0092 decision 3, Amendment C).
//
// **The two units are held in agreement here and nowhere else.** `bands.ts` keeps the metre
// threshold the display path already reads (`isPushOpenByDefault`) and `push-to-open.ts` keeps the
// millimetre one the document and the price read. Neither is computed from the other, so this file
// is the only thing stopping them drifting — and it is a sweep over every floor a body can stand on
// rather than three examples, because a threshold that moved by a millimetre would still agree at
// 0, at 1500 and at 2200.
import { describe, expect, it } from "vitest";

import { isPushOpenByDefault, TOP_ROW_Y0_M } from "../src/bands.js";
import { toMetres } from "../src/millimetres.js";
import { isPushToOpen, TOP_ROW_Y0_MM } from "../src/push-to-open.js";
import type { Handle } from "../src/design.js";

/** Every floor a body can stand on in a room this product builds — from the floor itself to above
 *  the tallest ceiling §5.2 reasons about, so the sweep covers both sides of the threshold with
 *  room to spare. */
const LEGAL_FLOORS_MM: { readonly lowest: number; readonly highest: number } = {
  lowest: 0,
  highest: 3_000,
};

function pushToOpenAt(
  y0Mm: number,
  recorded?: { readonly handle: Handle; readonly canHandle: boolean },
): boolean {
  return isPushToOpen({
    kitchenSettings: {},
    y0Mm,
    recordedHandle: recorded?.handle,
    canHandle: recorded?.canHandle ?? true,
  });
}

describe("the millimetre threshold is the metre one, restated rather than computed", () => {
  it("sits on the whole millimetre TOP_ROW_Y0_M rounds to", () => {
    expect(TOP_ROW_Y0_MM).toBe(Math.round(TOP_ROW_Y0_M * 1000));
  });

  it("answers exactly as isPushOpenByDefault does at every millimetre a body can stand on", () => {
    const disagreeing: number[] = [];
    for (
      let y0Mm = LEGAL_FLOORS_MM.lowest;
      y0Mm <= LEGAL_FLOORS_MM.highest;
      y0Mm += 1
    ) {
      if (pushToOpenAt(y0Mm) !== isPushOpenByDefault(toMetres(y0Mm))) {
        disagreeing.push(y0Mm);
      }
    }

    expect(disagreeing).toEqual([]);
  });

  it("puts the boundary between 2199 and 2200", () => {
    expect(pushToOpenAt(TOP_ROW_Y0_MM - 1)).toBe(false);
    expect(pushToOpenAt(TOP_ROW_Y0_MM)).toBe(true);
  });
});

describe("a recorded mode decides, where the definition permits one", () => {
  it("takes a recorded push anywhere, including on the floor", () => {
    expect(pushToOpenAt(0, { handle: "push", canHandle: true })).toBe(true);
  });

  it("takes a recorded bar in the top row, where the slot would have hidden it", () => {
    expect(
      pushToOpenAt(TOP_ROW_Y0_MM, { handle: "steel", canHandle: true }),
    ).toBe(false);
  });
});

/** ADR 0092 decision 3, Amendment C: `canHandle` **disqualifies the recorded mode and nothing
 *  more**. Both halves are asserted, because each of the two tempting readings — "no handle, so a
 *  latch on every front" and "structural, so no mechanism at all" — is refused by one of them. */
describe("canHandle disqualifies the recorded mode and nothing more", () => {
  const DENIED = { canHandle: false } as const;

  it("ignores a recorded push below the top row, where the bar is visible", () => {
    expect(pushToOpenAt(1_500, { handle: "push", ...DENIED })).toBe(false);
  });

  it("still calls the top row push-to-open, where the slot hides the bar", () => {
    expect(pushToOpenAt(TOP_ROW_Y0_MM, { handle: "push", ...DENIED })).toBe(
      true,
    );
  });

  it("calls the top row push-to-open even where a bar is recorded", () => {
    expect(pushToOpenAt(TOP_ROW_Y0_MM, { handle: "steel", ...DENIED })).toBe(
      true,
    );
  });
});
