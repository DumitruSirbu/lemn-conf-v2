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

import { renderRejection } from "../../src/commands/rejection.js";

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
});
