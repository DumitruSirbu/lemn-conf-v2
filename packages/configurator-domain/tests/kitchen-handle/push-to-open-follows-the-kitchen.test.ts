// H1 item 4: `isPushToOpen` reads the resolved handle, so a latch follows the kitchen's choice where the
// cabinet has none. Swept over every floor a body can stand on, because the top row's boundary is a
// millimetre and three examples would not notice it move.
import { describe, expect, it } from "vitest";

import type { Handle } from "../../src/design.js";
import { isPushToOpen, TOP_ROW_Y0_MM } from "../../src/push-to-open.js";

const FLOOR_COUNT = 3_001;
const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

/** Every whole millimetre from the floor itself to above the tallest ceiling §5.2 reasons about. */
function eachFloorMm(): readonly number[] {
  return Array.from({ length: FLOOR_COUNT }, (_, y0Mm) => y0Mm);
}

function disagreementsWith(
  expected: (y0Mm: number) => boolean,
  query: (y0Mm: number) => boolean,
): readonly number[] {
  return eachFloorMm().filter((y0Mm) => query(y0Mm) !== expected(y0Mm));
}

const isTopRow = (y0Mm: number) => y0Mm >= TOP_ROW_Y0_MM;

describe("a body with no handle of its own follows the kitchen's below the top row", () => {
  it("is latched exactly when the kitchen is push, at every floor below the top row", () => {
    for (const kitchenHandle of EVERY_HANDLE) {
      const wrong = disagreementsWith(
        (y0Mm) => isTopRow(y0Mm) || kitchenHandle === "push",
        (y0Mm) =>
          isPushToOpen({
            y0Mm,
            recordedHandle: undefined,
            kitchenHandle,
            canHandle: true,
          }),
      );

      expect(wrong).toEqual([]);
    }
  });

  it("is unchanged by a kitchen handle of steel or black, which is what the base answered", () => {
    for (const kitchenHandle of ["steel", "black"] as const) {
      const wrong = disagreementsWith(
        (y0Mm) =>
          isPushToOpen({
            y0Mm,
            recordedHandle: undefined,
            canHandle: true,
          }),
        (y0Mm) =>
          isPushToOpen({
            y0Mm,
            recordedHandle: undefined,
            kitchenHandle,
            canHandle: true,
          }),
      );

      expect(wrong).toEqual([]);
    }
  });
});

describe("a cabinet's own handle keeps deciding under any kitchen handle", () => {
  it("answers by its own mode at every floor and every kitchen handle", () => {
    for (const recordedHandle of EVERY_HANDLE) {
      for (const kitchenHandle of [undefined, ...EVERY_HANDLE]) {
        const wrong = disagreementsWith(
          () => recordedHandle === "push",
          (y0Mm) =>
            isPushToOpen({
              y0Mm,
              recordedHandle,
              kitchenHandle,
              canHandle: true,
            }),
        );

        expect(wrong).toEqual([]);
      }
    }
  });
});

describe("a body that takes no handle is decided by its slot alone, whatever the kitchen says", () => {
  it("is latched exactly on the top row, so a top-row corner return keeps its latch", () => {
    for (const kitchenHandle of [undefined, ...EVERY_HANDLE]) {
      for (const recordedHandle of [undefined, ...EVERY_HANDLE]) {
        const wrong = disagreementsWith(isTopRow, (y0Mm) =>
          isPushToOpen({
            y0Mm,
            recordedHandle,
            kitchenHandle,
            canHandle: false,
          }),
        );

        expect(wrong).toEqual([]);
      }
    }
  });
});

describe("the top row is push-to-open under any kitchen handle", () => {
  it("is latched at the top module line and above under steel and black", () => {
    for (const kitchenHandle of ["steel", "black"] as const) {
      expect(
        isPushToOpen({
          y0Mm: TOP_ROW_Y0_MM,
          recordedHandle: undefined,
          kitchenHandle,
          canHandle: true,
        }),
      ).toBe(true);
    }
  });
});
