// The owner's ruling of 2026-09-09, asserted as a value: **how many settings the pill names, and how
// many it counts.**
//
// > *"keep labels full width, need just ot calculate the remaining space and decide, how many global
// > setting fit tyo be show and display with separation like in dektop header, and if one or multiple
// > not fit, count those that not fit and add that count after `+`"*
//
// **Properties over a swept range rather than examples**, which is what the plan asks for and what
// the subject deserves: the function is a decision over a continuum of widths, so a handful of
// widths would be a handful of points on a line nobody has drawn. The four invariants below are the
// whole of the ruling that can be stated without a browser — the rung the pill lands on at a given
// viewport is a browser measurement and is swept in
// `tests/e2e/top-bar-pill-containment.desktop.e2e.spec.ts`.
//
// The widths are the ones this application measures in Chromium at its own typography, recorded by
// the wave's work item 1 so the examples below are the app's numbers and not the mockup's.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  chooseVisibleSettingLabels,
  EmptySettingsPillError,
  hysteresisMarginOf,
  widthNeededForVisibleLabels,
  type SettingsPillFixedWidths,
} from "@/settings/settings-pill-fit";

/** Frame D2A's own pill, measured in the application at 1920 px on 2026-09-09: `padding: 0 14px`
 *  and a 1 px border, a 16 px swatch, the 1 px `│`, the counter and the caret, with `gap: 10px`
 *  between every child. */
const DESKTOP_PILL: SettingsPillFixedWidths = {
  framePx: 30,
  swatchPx: 16,
  separatorPx: 1,
  counterPx: 14.27,
  caretPx: 7.03,
  gapPx: 10,
};

/** The seeded design's four labels, in ADR 0099 decision 9's order —
 *  `PAL melaminat │ Alb │ Feronerie Standard │ Adâncime 600` — measured in the app at
 *  `400 12.5px/1 Helvetica, Arial, sans-serif`. **The colour carries no category word** (owner,
 *  2026-09-09), which is why the second is 18.08 rather than the 64.64 `Culoare Alb` measured. */
const SEEDED_LABELS = [83.39, 18.08, 107.7, 79.92];

/** What the pill needs at each rung, on the seeded design. Derived from the declarations above
 *  rather than pinned, so a stylesheet edit moves the sweep with it. */
function widthAt(visibleCount: number): number {
  return widthNeededForVisibleLabels(visibleCount, SEEDED_LABELS, DESKTOP_PILL);
}

/**
 * A label set of any size the product can reach, and any widths within the range real type takes.
 *
 * **Randomised in order as well as in size**, because the ladder collapses from the end and an
 * order-dependent bug would hide behind a fixed list.
 *
 * **Zero is in the range for every label but the first**, and it is a state the product reaches: a
 * free MDF colour has no name, so the owner ruled (2026-09-09) that the swatch wears it and nothing
 * is written. A setting that draws no text is still shown and still not counted, so a zero-width
 * label is exactly the input that would make the floor or the monotonicity misbehave. The first
 * label is never zero — the material always has a name, and it is the one the floor keeps.
 */
const anyLabels = fc
  .tuple(
    fc.double({ min: 1, max: 400, noNaN: true }),
    fc.array(fc.double({ min: 0, max: 400, noNaN: true }), { maxLength: 7 }),
  )
  .map(([first, rest]) => [first, ...rest]);

const anyWidth = fc.double({ min: 0, max: 2000, noNaN: true });

describe("the ladder, as the owner ruled it", () => {
  it("names every setting when the pill has room for all of them", () => {
    expect(
      chooseVisibleSettingLabels({
        availableWidthPx: widthAt(4),
        labelWidthsPx: SEEDED_LABELS,
        fixedWidthsPx: DESKTOP_PILL,
      }),
    ).toEqual({ visibleCount: 4, hiddenCount: 0 });
  });

  it("counts what it cannot name, at every rung between the top and the floor", () => {
    // Rungs 2 and 3 — the owner's `MDF, Blum + 1` and frame 2A's `PAL melaminat +2`, at four
    // settings. A pixel under each rung's own width is what puts the pill on the rung below.
    for (const visibleCount of [3, 2, 1]) {
      expect(
        chooseVisibleSettingLabels({
          availableWidthPx: widthAt(visibleCount + 1) - 1,
          labelWidthsPx: SEEDED_LABELS,
          fixedWidthsPx: DESKTOP_PILL,
        }),
        `at ${String(visibleCount)} labels`,
      ).toEqual({ visibleCount, hiddenCount: 4 - visibleCount });
    }
  });

  it("keeps one whole label as its floor, however little room is left", () => {
    // Rung 4 — *"`Pal melaminat + 2` => `Pal mela.. + 2`"*. The count stops falling at one and the
    // label ellipsises instead, which is CSS's half of the ruling and not this function's.
    for (const availableWidthPx of [widthAt(1) - 1, 100, 10, 0]) {
      expect(
        chooseVisibleSettingLabels({
          availableWidthPx,
          labelWidthsPx: SEEDED_LABELS,
          fixedWidthsPx: DESKTOP_PILL,
        }),
        `at ${String(availableWidthPx)} px`,
      ).toEqual({ visibleCount: 1, hiddenCount: 3 });
    }
  });

  it("refuses a pill with nothing to name rather than answering for one", () => {
    // There is no honest answer: the floor of the ladder is a label and a counter, so a pill naming
    // nothing is a caller that should not have drawn one — never a bare `+3`.
    expect(() =>
      chooseVisibleSettingLabels({
        availableWidthPx: 500,
        labelWidthsPx: [],
        fixedWidthsPx: DESKTOP_PILL,
      }),
    ).toThrow(EmptySettingsPillError);
  });
});

describe("the invariants, over a swept range and a randomised label order", () => {
  propertyTest.prop([anyLabels, anyWidth])(
    "names and counts exactly the settings it was given",
    (labelWidthsPx, availableWidthPx) => {
      const fit = chooseVisibleSettingLabels({
        availableWidthPx,
        labelWidthsPx,
        fixedWidthsPx: DESKTOP_PILL,
      });

      expect(fit.visibleCount + fit.hiddenCount).toBe(labelWidthsPx.length);
      expect(fit.hiddenCount).toBeGreaterThanOrEqual(0);
    },
  );

  propertyTest.prop([anyLabels, anyWidth])(
    "never names none, which is the floor and the reason there is no bare counter",
    (labelWidthsPx, availableWidthPx) => {
      expect(
        chooseVisibleSettingLabels({
          availableWidthPx,
          labelWidthsPx,
          fixedWidthsPx: DESKTOP_PILL,
        }).visibleCount,
      ).toBeGreaterThanOrEqual(1);
    },
  );

  propertyTest.prop([
    anyLabels,
    anyWidth,
    fc.double({ min: 0, max: 900, noNaN: true }),
  ])(
    "is monotone in the room it is given: wider never names fewer",
    (labelWidthsPx, availableWidthPx, extra) => {
      const at = (width: number): number =>
        chooseVisibleSettingLabels({
          availableWidthPx: width,
          labelWidthsPx,
          fixedWidthsPx: DESKTOP_PILL,
        }).visibleCount;

      expect(at(availableWidthPx + extra)).toBeGreaterThanOrEqual(
        at(availableWidthPx),
      );
    },
  );

  propertyTest.prop([anyLabels])(
    "names every rung its own width buys, at exactly that width",
    (labelWidthsPx) => {
      // **The width the pill needs is not monotone in the count**, and this is the property that
      // says so: naming the last label also removes the counter, so a rung can be *narrower* than
      // the one below it. Swept at each rung's own width rather than at random ones, because that
      // is the only place the difference shows — a scan that stopped at the first rung that did not
      // fit would hide a label the pill has room for, and would pass every random width.
      for (let count = 1; count <= labelWidthsPx.length; count += 1) {
        const availableWidthPx = widthNeededForVisibleLabels(
          count,
          labelWidthsPx,
          DESKTOP_PILL,
        );

        expect(
          chooseVisibleSettingLabels({
            availableWidthPx,
            labelWidthsPx,
            fixedWidthsPx: DESKTOP_PILL,
          }).visibleCount,
          `${String(count)} labels fit in ${String(availableWidthPx)} px and were not named`,
        ).toBeGreaterThanOrEqual(count);
      }
    },
  );

  propertyTest.prop([anyLabels, anyWidth])(
    "hides no label while there is room for it",
    (labelWidthsPx, availableWidthPx) => {
      // The other direction of the same rule, and the one a first-failure scan gets wrong: naming
      // the **last** label also removes the counter, so the widths are not monotone in the count and
      // a scan that stopped at the first rung that did not fit would hide a label that does.
      const { visibleCount } = chooseVisibleSettingLabels({
        availableWidthPx,
        labelWidthsPx,
        fixedWidthsPx: DESKTOP_PILL,
      });

      for (
        let candidate = visibleCount + 1;
        candidate <= labelWidthsPx.length;
        candidate += 1
      ) {
        expect(
          widthNeededForVisibleLabels(candidate, labelWidthsPx, DESKTOP_PILL),
          `${String(candidate)} labels were hidden with room to spare`,
        ).toBeGreaterThan(availableWidthPx);
      }
    },
  );
});

describe("stability, so a width on a boundary cannot flicker", () => {
  it("composes its margin from the pill's own separator and gap, and from no constant", () => {
    // ADR 0104 decision 9: the one derived quantity the record permits, and it moves when the
    // stylesheet does.
    expect(hysteresisMarginOf(DESKTOP_PILL)).toBe(
      DESKTOP_PILL.separatorPx + DESKTOP_PILL.gapPx,
    );
  });

  it("keeps what it is showing at the width that would otherwise oscillate", () => {
    // Exactly at the boundary the extra label needs, having come from below it: the label is not
    // taken up until there is room for it *and* what separates it.
    const boundary = widthAt(2);

    expect(
      chooseVisibleSettingLabels({
        availableWidthPx: boundary,
        labelWidthsPx: SEEDED_LABELS,
        fixedWidthsPx: DESKTOP_PILL,
        previousVisibleCount: 1,
      }).visibleCount,
    ).toBe(1);
    expect(
      chooseVisibleSettingLabels({
        availableWidthPx: boundary + hysteresisMarginOf(DESKTOP_PILL),
        labelWidthsPx: SEEDED_LABELS,
        fixedWidthsPx: DESKTOP_PILL,
        previousVisibleCount: 1,
      }).visibleCount,
    ).toBe(2);
  });

  it("gives a label up as soon as there is no longer room for it", () => {
    // The hysteresis is one-directional on purpose: it delays *taking* a label, never keeping one
    // that no longer fits — which would be a clipped pill rather than a stable one.
    expect(
      chooseVisibleSettingLabels({
        availableWidthPx: widthAt(2) - 1,
        labelWidthsPx: SEEDED_LABELS,
        fixedWidthsPx: DESKTOP_PILL,
        previousVisibleCount: 2,
      }).visibleCount,
    ).toBe(1);
  });

  propertyTest.prop([anyLabels, anyWidth, fc.integer({ min: 1, max: 8 })])(
    "never oscillates: what it answers, it answers again from its own answer",
    (labelWidthsPx, availableWidthPx, previous) => {
      // Idempotence, which is what makes the state write skippable and the observer quiet. Feeding
      // an answer back in at the same width must produce the same answer, or a resize would leave
      // the pill flipping between two rungs at a fixed width.
      const first = chooseVisibleSettingLabels({
        availableWidthPx,
        labelWidthsPx,
        fixedWidthsPx: DESKTOP_PILL,
        previousVisibleCount: Math.min(previous, labelWidthsPx.length),
      });
      const second = chooseVisibleSettingLabels({
        availableWidthPx,
        labelWidthsPx,
        fixedWidthsPx: DESKTOP_PILL,
        previousVisibleCount: first.visibleCount,
      });

      expect(second).toEqual(first);
    },
  );
});

describe("a setting that draws no text still counts as shown", () => {
  /** The seeded labels with the colour reduced to nothing, which is what a free MDF colour renders
   *  as: the swatch wears it and no word is written. */
  const withANamelessColour = [83.39, 0, 107.7, 79.92];

  it("costs the pill no label, no separator and no gap", () => {
    // A model that spent a separator on it would draw a `│` around nothing. The difference between
    // showing two settings and showing one is then exactly zero.
    expect(
      widthNeededForVisibleLabels(2, withANamelessColour, DESKTOP_PILL),
    ).toBeCloseTo(
      widthNeededForVisibleLabels(1, withANamelessColour, DESKTOP_PILL),
      6,
    );
  });

  it("is shown rather than counted, so the ladder reaches past it for free", () => {
    // At the width one whole name needs, the pill shows **two** settings — the name and the colour —
    // and counts two. That is the owner's ruling: what is "shown" for a free colour is a filled
    // swatch, not an absent label.
    expect(
      chooseVisibleSettingLabels({
        availableWidthPx: widthNeededForVisibleLabels(
          1,
          withANamelessColour,
          DESKTOP_PILL,
        ),
        labelWidthsPx: withANamelessColour,
        fixedWidthsPx: DESKTOP_PILL,
      }),
    ).toEqual({ visibleCount: 2, hiddenCount: 2 });
  });
});

describe("what the pill spends, before it names anything", () => {
  it("draws the swatch, the counter and the caret at every rung, and separators only between labels", () => {
    // The composition ADR 0104 decision 3 rules: `│` between labels, the counter separated from the
    // last label by the pill's own gap and never by a divider, and the swatch never giving way.
    const twoLabels = widthNeededForVisibleLabels(
      2,
      SEEDED_LABELS,
      DESKTOP_PILL,
    );
    const oneLabel = widthNeededForVisibleLabels(
      1,
      SEEDED_LABELS,
      DESKTOP_PILL,
    );

    // Two labels add the second label, one separator and two more gaps over one label.
    expect(twoLabels - oneLabel).toBeCloseTo(
      (SEEDED_LABELS[1] ?? 0) +
        DESKTOP_PILL.separatorPx +
        2 * DESKTOP_PILL.gapPx,
      6,
    );
    // The floor is the pill with its last label reduced to nothing.
    expect(oneLabel - (SEEDED_LABELS[0] ?? 0)).toBeCloseTo(97.3, 6);
  });

  it("draws no caret where the shell's frame draws none", () => {
    // Frame 2A's chip has no disclosure caret, and the fit model learns that from a measured zero
    // rather than from a branch — so the caret's own gap goes with it.
    const mobile = { ...DESKTOP_PILL, caretPx: 0 };

    expect(
      widthNeededForVisibleLabels(1, SEEDED_LABELS, DESKTOP_PILL) -
        widthNeededForVisibleLabels(1, SEEDED_LABELS, mobile),
    ).toBeCloseTo(DESKTOP_PILL.caretPx + DESKTOP_PILL.gapPx, 6);
  });
});
