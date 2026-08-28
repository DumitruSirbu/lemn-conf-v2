// The sentence a customer reads when a width is refused, pinned — because the last time §9's copy
// went stale nothing failed.
//
// Wave 5D made §9's width note say resizing was "not available in this version" on the day it became
// available, and 2 116 green tests said nothing, because no test pinned the string. This file is
// that lesson applied to `WIDTH_NOT_SUPPORTED`, whose sentence ADR 0035 made false in the same way:
// it said `„{label}" se face doar în {list} mm` while ADR 0035 decision 2 turned `sizesMm` into the
// **modular chips derived from a continuum**. A base cabinet really is built at 570 — relative
// stepping reaches it — so a sentence listing thirteen chips both lied and was unreadable.
import { describe, expect, it } from "vitest";

import { offersFor } from "../../src/queries/offers.js";
import { renderRejection } from "../../src/commands/rejection.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";

describe("what a refused width tells the customer", () => {
  // BUILD/OPERATE/CHECK per case: the params a command would produce, rendered, and read.
  it("states a bound as a bound, not as its chips", () => {
    const sentence = renderRejection({
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label: "Corp bază",
        sizesMm: [200, 250, 300, 350, 400, 450, 500],
        widthRangesMm: [{ minMm: 200, maxMm: 800 }],
        availableMm: 950,
      },
    });

    expect(sentence).toBe(
      "„Corp bază” se face între 200 și 800 mm, iar deschiderea are 950 mm.",
    );
  });

  // The other half of ADR 0035 decision 3, and the reason the renderer asks the range shape rather
  // than a flag: a dishwasher niche genuinely is 450 or 600 and nothing between.
  it("still lists a discrete row's widths, because those are a set", () => {
    const sentence = renderRejection({
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label: "Mașină de spălat vase",
        sizesMm: [450, 600],
        widthRangesMm: [
          { minMm: 450, maxMm: 450 },
          { minMm: 600, maxMm: 600 },
        ],
        availableMm: 520,
      },
    });

    expect(sentence).toBe(
      "„Mașină de spălat vase” se face doar în 450 sau 600 mm, iar deschiderea are 520 mm.",
    );
  });

  // A column's refusal names the intersection of its members' chips, which has no single entry's
  // bound behind it. `widthRangesMm` is absent there, and the sentence falls back to the list —
  // which is the truth for that refusal.
  it("falls back to the list when no bound is carried", () => {
    const sentence = renderRejection({
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label: "Corp bază",
        sizesMm: [300, 350],
        availableMm: 250,
      },
    });

    expect(sentence).toBe(
      "„Corp bază” se face doar în 300 sau 350 mm, iar deschiderea are 250 mm.",
    );
  });

  // The sentence must never claim a width the entry is actually built at is unavailable. 570 is not
  // a chip and is inside the bound, which is precisely the case the old wording got wrong.
  it("does not deny a width inside the bound", () => {
    const sentence = renderRejection({
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label: "Corp suspendat",
        sizesMm: [200, 250, 300],
        widthRangesMm: [{ minMm: 200, maxMm: 800 }],
        availableMm: 900,
      },
    });

    expect(sentence).not.toContain("doar");
    expect(sentence).toContain("între 200 și 800 mm");
  });

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

    const sentence = renderRejection(row.verdict.reason);
    expect(sentence).toContain("între 200 și 800 mm");
    // The old wording listed thirteen chips and thereby denied 570, a width this cabinet is built at.
    expect(sentence).not.toContain("doar");
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
      expect(renderRejection(result.reason)).toBe(
        "„Corp suspendat” se face între 300 și 800 mm, iar deschiderea are 600 mm.",
      );
    });

    it("still lists an appliance column's widths, because those are a set", () => {
      const result = resizeTo(clearedFunding(), "p1", 800);

      if (result.ok) throw new Error("expected 800 to be refused");
      expect(renderRejection(result.reason)).toBe(
        "„Nișă mașină de spălat vase” se face doar în 450 sau 600 mm, iar deschiderea are 600 mm.",
      );
    });

    // The anti-invariant: no refusal may deny a width the column is genuinely built at. Eleven
    // chips listed for a column buildable across a continuum was exactly that denial.
    it("never denies a width inside the column's bound", () => {
      const result = resizeTo(clearedFunding(), "p10", 999);

      if (result.ok) throw new Error("expected 999 to be refused");
      const sentence = renderRejection(result.reason);
      expect(sentence).toContain("între 200 și 800 mm");
      expect(sentence).not.toContain("doar");
    });
  });
});
