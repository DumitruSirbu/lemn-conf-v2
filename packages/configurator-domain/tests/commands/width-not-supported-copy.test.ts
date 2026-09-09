// The WIDTH_NOT_SUPPORTED descriptor must carry the manufactured bound rather than only the modular
// chip list. The web resolver owns how that typed fact is worded for each locale.
import { describe, expect, it } from "vitest";

import { offersFor } from "../../src/queries/offers.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";

describe("WIDTH_NOT_SUPPORTED descriptor data", () => {
  // **The case that actually protects the customer**, and the one the hand-built cases above cannot.
  // Every other test here constructs a `RejectionDetail` itself, so deleting `widthRangesMm` from the
  // command that produces it would leave this whole file green while the false list sentence came
  // back — which is precisely the failure class the file exists to close (clean-code review R3, the
  // gap it named in this file). This one drives a real refusal through `offersFor` and reads what a
  // customer would read.
  it("states the bound on a refusal the engine actually produced", () => {
    const world = clearBodies(
      columnWorld(1000, [
        { id: "s0", y0Mm: 0, heightMm: 820, widthMm: 950 },
        {
          id: "s1",
          y0Mm: 1500,
          heightMm: 700,
          buildId: "wall-2door-600",
          widthMm: 950,
        },
      ]),
      ["s0"],
    );
    const opening = voidAt(world, "A|1.00", 0);

    const offered = offersFor({
      ...world,
      target: { kind: "void", id: opening.id },
    });
    const row = offered.find((offer) => offer.buildId === "base-cabinet");
    if (row?.verdict.status !== "refused") {
      throw new Error("expected base-cabinet refused at a 950 mm opening");
    }

    expect(row.verdict.reason).toMatchObject({
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        widthRangesMm: [{ minMm: 200, maxMm: 800 }],
        availableMm: 950,
      },
    });
  });

  // **The resize path, which is the one §9's width control drives.** The insert path was fixed by
  // 5D2a's QA round; product-logic review R1.1 found this half still listing eleven chips — the same
  // materially-false shape, on the path a customer taps. Under 5D2c this becomes the text on a
  // disabled `+50` button, so it is the most-read refusal in the stepper.
  //
  // The bound is the **intersection of the column's members' ranges**, not any one entry's: `p14`'s
  // column reads 300 because the three-drawer base below it floors there, while the hinged rows in
  // it reach 200 on their own. That is the assertion doing the work here.
  describe("a resize refusal, which is what §9's control drives", () => {
    const clearedFunding = () =>
      clearBodies(createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG), [
        "p0",
        "p11",
        "p17",
      ]);

    it("states the column's intersected bound, raised by its narrowest member's floor", () => {
      const result = resizeTo(clearedFunding(), "p14", 250);

      if (result.ok) throw new Error("expected 250 to be refused");
      expect(result.reason).toMatchObject({
        code: "WIDTH_NOT_SUPPORTED",
        params: {
          boundScope: "column",
          widthRangesMm: [{ minMm: 300, maxMm: 800 }],
          availableMm: 600,
        },
      });
    });

    it("still lists an appliance column's widths, because those are a set", () => {
      const result = resizeTo(clearedFunding(), "p1", 800);

      if (result.ok) throw new Error("expected 800 to be refused");
      expect(result.reason).toMatchObject({
        code: "WIDTH_NOT_SUPPORTED",
        params: {
          boundScope: "column",
          sizesMm: [450, 600],
          availableMm: 600,
        },
      });
    });

    // The anti-invariant: no refusal may deny a width the column is genuinely built at. Eleven
    // chips listed for a column buildable across a continuum was exactly that denial.
    it("never denies a width inside the column's bound", () => {
      const result = resizeTo(clearedFunding(), "p10", 999);

      if (result.ok) throw new Error("expected 999 to be refused");
      expect(result.reason).toMatchObject({
        code: "WIDTH_NOT_SUPPORTED",
        params: {
          boundScope: "column",
          widthRangesMm: [{ minMm: 200, maxMm: 800 }],
        },
      });
    });
  });
});
