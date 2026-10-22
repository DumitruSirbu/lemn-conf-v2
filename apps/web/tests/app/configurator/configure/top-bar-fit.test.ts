// ADR 0104 decision 8: the wordmark leaves the row rather than the setting name becoming a stub. The model takes a
// track and this file works in viewports; the `DEMAND_PX` figures are Chromium measurements of this application, not
// of the mockup. Every boundary is derived from the pill's measured rung widths, so no width threshold is asserted
// (ADR 0094 criterion 4i).
import { describe, expect, it } from "vitest";

import {
  D2A_SPACING,
  describeTopBarFit,
  FRAME_2A_SPACING,
  type AccountControlWidths,
  type TopBarConfiguration,
} from "@/app/configurator/configure/top-bar-fit";
import {
  chooseVisibleSettingLabels,
  widthNeededForVisibleLabels,
} from "@/settings/settings-pill-fit";

import {
  D2A_AS_DRAWN,
  DEMAND_PX,
  demandOf,
  DESKTOP_PILL,
  EVERY_CONFIGURATION,
  fitAtViewport,
  MEASURED_TITLE_RETURNED_PX,
  MEASURED_WITHOUT_WORDMARK_COMPACT_PX,
  MEASURED_WITHOUT_WORDMARK_PX,
  RUSSIAN_VISITOR_LINK_WIDTHS_PX,
  SEEDED_LABELS,
  SIGNED_IN_WIDTHS_PX,
  TITLE_PX,
  VISITOR_LINK_WIDTHS_PX,
  WORDMARK_PX,
} from "../../../support/top-bar-measured-row";

/** The row as it stands at a viewport, in the configuration it is currently drawn in. */
function fitAt(
  viewportPx: number,
  measuredIn: TopBarConfiguration,
  accountWidthsPx: AccountControlWidths = VISITOR_LINK_WIDTHS_PX,
): ReturnType<typeof describeTopBarFit> {
  return fitAtViewport({
    viewportPx,
    measuredIn,
    labelWidthsPx: SEEDED_LABELS,
    accountWidthsPx,
  });
}

/** What closing the gaps returns to the pill, written out from the two frames: three nav gaps going 28 → 9 and eight
 *  row gaps going 14 → 6 (four dividers, a gap on each side), `3 × 19 + 8 × 8`. The eight is read off the stylesheet by
 *  `top-bar-box.test.ts`. A literal, so the model's own composition is not what it is checked against. */
const GAPS_RETURNED_TO_THE_PILL_PX = 121;

/** The pill's own rungs, derived rather than pinned. */
const atEveryLabel = widthNeededForVisibleLabels(
  4,
  SEEDED_LABELS,
  DESKTOP_PILL,
);
const atOneName = widthNeededForVisibleLabels(1, SEEDED_LABELS, DESKTOP_PILL);
const atTwoWholeLabels = widthNeededForVisibleLabels(
  2,
  SEEDED_LABELS,
  DESKTOP_PILL,
);

/**
 * The two boundaries the gives produce, in viewport pixels, derived from the lines above and the measured demand.
 * Give C is the property itself: the wordmark returns at the first width where drawing it costs no name, so this
 * boundary is where every name fits beside it. A count-based rule was not monotone at two of the three hardware tiers.
 */
const WORDMARK_LEAVES_BELOW_PX = DEMAND_PX.gapsClosed + atEveryLabel;
const GAPS_CLOSE_BELOW_PX = DEMAND_PX.asDrawn + atEveryLabel;

const EVERY_DESKTOP_WIDTH = [
  900, 950, 1000, 1033, 1034, 1100, 1272, 1386, 1440, 1920,
];

/** How many names the pill draws in a track for a stated label set: the ladder's own function, not a second model. */
function visibleLabelsIn(
  labelWidthsPx: readonly number[],
  pillTrackPx: number,
): number {
  return chooseVisibleSettingLabels({
    availableWidthPx: pillTrackPx,
    labelWidthsPx,
    fixedWidthsPx: DESKTOP_PILL,
  }).visibleCount;
}

/** `Feronerie {tier}` at each of the three tiers `sample-price-book.ts` offers, measured in the pill's typography;
 *  `Standard` is `SEEDED_LABELS`' own third entry. */
const HARDWARE_TIER_PX = {
  Standard: 107.7,
  Hettich: 95.875,
  Blum: 85.453125,
} as const;

function labelsWithHardware(hardwarePx: number): readonly number[] {
  return [
    SEEDED_LABELS[0] ?? 0,
    SEEDED_LABELS[1] ?? 0,
    hardwarePx,
    SEEDED_LABELS[3] ?? 0,
  ];
}

/**
 * Every pill this application can draw, not only every hardware tier: a sweep over tiers alone misses the inversion
 * on the seeded Standard tier with three settings, where the arriving name is the depth and drawing it retires the
 * counter.
 *
 * - four settings, one row per hardware tier: the ordinary pill;
 * - four settings with a colour that has no text (a free MDF colour): `drawnLabelsIn` gives it no label, separator or
 *   gap, so every rung boundary moves down;
 * - three settings: an applied material the book has withdrawn, where `describeSettingsPill` drops the colour entry.
 */
const EVERY_PILL_SHAPE: readonly {
  readonly name: string;
  readonly labels: readonly number[];
}[] = [
  ...Object.entries(HARDWARE_TIER_PX).map(([tier, px]) => ({
    name: `on the ${tier} tier`,
    labels: labelsWithHardware(px),
  })),
  ...Object.entries(HARDWARE_TIER_PX).map(([tier, px]) => ({
    name: `on the ${tier} tier with a free colour that has no name`,
    labels: [SEEDED_LABELS[0] ?? 0, 0, px, SEEDED_LABELS[3] ?? 0],
  })),
  ...Object.entries(HARDWARE_TIER_PX).map(([tier, px]) => ({
    name: `on the ${tier} tier with three settings, the material undeclared`,
    labels: [SEEDED_LABELS[0] ?? 0, px, SEEDED_LABELS[3] ?? 0],
  })),
];

function fitFor(
  labelWidthsPx: readonly number[],
  viewportPx: number,
  measuredIn: TopBarConfiguration,
): ReturnType<typeof describeTopBarFit> {
  return fitAtViewport({ viewportPx, measuredIn, labelWidthsPx });
}

describe("the boundaries the owner was given the ruling in terms of", () => {
  it("keeps the wordmark's departure above 900, which is what the ruling rested on", () => {
    expect(WORDMARK_LEAVES_BELOW_PX).toBeCloseTo(1385.81, 2);
    // The superseded count-based boundary, kept as the size of the move: the property-based rule waits until the
    // wordmark
    // costs no name, which on these labels is all four, so the difference is the third and fourth names' own cost.
    expect(DEMAND_PX.gapsClosed + atTwoWholeLabels).toBeCloseTo(1180.46, 2);
    expect(WORDMARK_LEAVES_BELOW_PX - (DEMAND_PX.gapsClosed + atTwoWholeLabels)) //
      .toBeCloseTo(atEveryLabel - atTwoWholeLabels, 6);
    expect(WORDMARK_LEAVES_BELOW_PX).toBeGreaterThan(900);
  });

  it("puts frame D2A's own spacing above the width every label needs inside it", () => {
    expect(GAPS_CLOSE_BELOW_PX).toBeCloseTo(1506.81, 1);
  });
});

describe("give C — the wordmark leaves the row, and only where it buys a name", () => {
  it("is drawn at every width where it costs the pill no setting name", () => {
    // A hundredth of a pixel either side of the derived boundary: the two sides are reached by different sums, so the
    // boundary is a floating-point knife-edge that no browser width lands on.
    for (const viewportPx of [
      WORDMARK_LEAVES_BELOW_PX + 0.01,
      1400,
      1440,
      1920,
    ]) {
      expect(
        fitAt(viewportPx, D2A_AS_DRAWN).isWordmarkDrawn,
        `at ${String(viewportPx)}`,
      ).toBe(true);
    }
  });

  it("leaves the row below that, which is the trade the owner took", () => {
    // The owner chose this over a stubbed `P…` where a setting name should be, and over the phone's shell on a narrow
    // laptop (ADR 0104 decision 8).
    for (const viewportPx of [
      900,
      1000,
      1100,
      WORDMARK_LEAVES_BELOW_PX - 0.01,
    ]) {
      expect(
        fitAt(viewportPx, D2A_AS_DRAWN).isWordmarkDrawn,
        `at ${String(viewportPx)}`,
      ).toBe(false);
    }
  });

  it("gives the pill exactly the wordmark's own width and its gap when it goes", () => {
    const kept = fitAt(1400, D2A_AS_DRAWN);
    // 1300 is a width where the wordmark has gone and the link has its words back, so the account give adds nothing.
    const dropped = fitAt(1300, D2A_AS_DRAWN);

    expect(dropped.isWordmarkDrawn).toBe(false);
    expect(dropped.isAccountCompact).toBe(false);
    expect(kept.pillTrackPx).toBeCloseTo(1400 - DEMAND_PX.gapsClosed, 6);
    expect(dropped.pillTrackPx).toBeCloseTo(
      1300 - DEMAND_PX.gapsClosedWithoutWordmark,
      6,
    );
    expect(
      DEMAND_PX.gapsClosed - DEMAND_PX.gapsClosedWithoutWordmark,
    ).toBeCloseTo(WORDMARK_PX + FRAME_2A_SPACING.navGapPx, 6);
  });
});

describe("give B — the row's gaps close, and both numbers are the reference's", () => {
  it("keeps frame D2A's own spacing while every label fits inside it", () => {
    expect(fitAt(1920, D2A_AS_DRAWN).spacing).toEqual(D2A_SPACING);
    expect(fitAt(1550, D2A_AS_DRAWN).spacing).toEqual(D2A_SPACING);
  });

  it("closes them to frame 2A's when it cannot", () => {
    expect(fitAt(1300, D2A_AS_DRAWN).spacing).toEqual(FRAME_2A_SPACING);
    expect(fitAt(900, D2A_AS_DRAWN).spacing).toEqual(FRAME_2A_SPACING);
  });

  /** The artefact the owner chose away, asserted as its absence at every pill shape and not only the seeded design's:
   *  `SEEDED_LABELS` carries `Feronerie Standard`, the longest name, where the old count-based rule held by chance. */
  it.each(EVERY_PILL_SHAPE)(
    "never lets the label count fall as the window widens, $name",
    ({ labels }) => {
      let previous = 0;
      let reachedMoreThanOneRung = false;
      for (let viewportPx = 900; viewportPx <= 1500; viewportPx += 1) {
        const fit = fitFor(labels, viewportPx, D2A_AS_DRAWN);
        const drawn = visibleLabelsIn(labels, fit.pillTrackPx);

        expect(drawn, `at ${String(viewportPx)} px`).toBeGreaterThanOrEqual(
          previous,
        );
        if (previous !== 0 && drawn !== previous) reachedMoreThanOneRung = true;
        previous = drawn;
      }
      // Non-vacuity: a sweep pinned at one rung satisfies "never falls" without exercising the ladder.
      expect(reachedMoreThanOneRung).toBe(true);
    },
  );

  it("returns 121 px to the pill when it does, composed from the two frames' own gaps", () => {
    // One pixel short of every name fitting, measured as frame D2A draws the row: the gaps close, and with them
    // closed every name fits, so the wordmark stays and the gaps are the only thing the track gains.
    const trackAsDrawnPx = atEveryLabel - 1;

    const fit = describeTopBarFit({
      pillTrackPx: trackAsDrawnPx,
      wordmarkWidthPx: WORDMARK_PX,
      measuredIn: D2A_AS_DRAWN,
      labelWidthsPx: SEEDED_LABELS,
      fixedWidthsPx: DESKTOP_PILL,
      accountWidthsPx: VISITOR_LINK_WIDTHS_PX,
      titleWidthPx: TITLE_PX,
    });

    expect(fit.isSpacingClosed).toBe(true);
    expect(fit.isWordmarkDrawn).toBe(true);
    expect(fit.pillTrackPx - trackAsDrawnPx).toBeCloseTo(
      GAPS_RETURNED_TO_THE_PILL_PX,
      6,
    );
    // The measured demands differ by the same figure, which is what ties the model's number to the browser's row.
    expect(DEMAND_PX.asDrawn - DEMAND_PX.gapsClosed).toBeCloseTo(
      GAPS_RETURNED_TO_THE_PILL_PX,
      2,
    );
  });

  it("agrees with what the browser measured for the row with no wordmark in it", () => {
    // Non-vacuity for the derived demand above: it is derived so the arithmetic is exact, and
    // checked against the measurement so the derivation stays a description of the real row.
    expect(DEMAND_PX.gapsClosedWithoutWordmark).toBeCloseTo(
      MEASURED_WITHOUT_WORDMARK_PX,
      1,
    );
  });
});

describe("the configuration is a fixed point, so the row cannot chase itself", () => {
  it("answers the same thing measured in the configuration it just chose", () => {
    // One observation is enough because the answer is a fixed point: the track the model reads reacts to every give, so
    // an answer that changed when re-measured in its own configuration would oscillate.
    for (const viewportPx of EVERY_DESKTOP_WIDTH) {
      const first = fitAt(viewportPx, D2A_AS_DRAWN);
      const second = fitAt(viewportPx, first);

      expect(second.isWordmarkDrawn, `at ${String(viewportPx)}`).toBe(
        first.isWordmarkDrawn,
      );
      expect(second.isSpacingClosed, `at ${String(viewportPx)}`).toBe(
        first.isSpacingClosed,
      );
      expect(second.isAccountCompact, `at ${String(viewportPx)}`).toBe(
        first.isAccountCompact,
      );
      expect(second.pillTrackPx, `at ${String(viewportPx)}`).toBeCloseTo(
        first.pillTrackPx,
        6,
      );
    }
  });

  it("reaches the same answer from every configuration it could have been drawn in", () => {
    // Whatever configuration the row was showing when the window was resized, the answer is a property of the width,
    // not of the history. Sixteen configurations: the wordmark, the gaps, the link's words and the title each drawn or not.
    expect(EVERY_CONFIGURATION).toHaveLength(16);
    for (const viewportPx of EVERY_DESKTOP_WIDTH) {
      const answers = EVERY_CONFIGURATION.map((measuredIn) => {
        const fit = fitAt(viewportPx, measuredIn);
        return [
          fit.isWordmarkDrawn,
          fit.isSpacingClosed,
          fit.isAccountCompact,
          fit.isTitleDropped,
        ]
          .map(String)
          .join("/");
      });

      expect(
        new Set(answers).size,
        `at ${String(viewportPx)}: ${answers.join(", ")}`,
      ).toBe(1);
    }
  });

  it("hands the ladder the track the chosen configuration will actually produce", () => {
    // The count is decided against the row the row is about to be, not the row it was measured in.
    for (const viewportPx of EVERY_DESKTOP_WIDTH) {
      const fit = fitAt(viewportPx, D2A_AS_DRAWN);

      const rowPx = viewportPx - demandOf(fit);
      // Where the title has left, only the room one whole name needs is offered (see `TopBarFit.pillTrackPx`).
      const offeredPx = fit.isTitleDropped ? Math.min(rowPx, atOneName) : rowPx;

      expect(fit.pillTrackPx, `at ${String(viewportPx)}`).toBeCloseTo(
        offeredPx,
        6,
      );
    }
  });
});

/** Where the pill's track stands with the link's words drawn, whatever the row currently draws. */
function trackWithTheWordsAt(
  fit: ReturnType<typeof describeTopBarFit>,
  accountWidthsPx: AccountControlWidths,
): number {
  return (
    fit.pillTrackPx -
    (fit.isAccountCompact ? accountWidthsPx.textPx - accountWidthsPx.iconPx : 0)
  );
}

describe("the account give — the visitor's link becomes its glyph, and its words return once the pill names every setting without the wordmark", () => {
  const NARROWEST_SWEPT_PX = 700;
  const WIDEST_SWEPT_PX = 1700;

  /** The width at which the row without the wordmark names every setting beside the words, derived from the measured
   *  row and the pill's own rung, so no width is declared. */
  function wordsReturnAt(accountWidthsPx: AccountControlWidths): number {
    return (
      widthNeededForVisibleLabels(4, SEEDED_LABELS, DESKTOP_PILL) +
      demandOf(
        {
          isWordmarkDrawn: false,
          isSpacingClosed: true,
          isAccountCompact: false,
          isTitleDropped: false,
        },
        accountWidthsPx,
      )
    );
  }

  /** The viewport widths at which the link changes form as the window widens, with the form it takes. */
  function flipsOf(accountWidthsPx: AccountControlWidths): readonly string[] {
    const flips: string[] = [];
    let previous: boolean | undefined;
    for (
      let viewportPx = NARROWEST_SWEPT_PX;
      viewportPx <= WIDEST_SWEPT_PX;
      viewportPx += 1
    ) {
      const { isAccountCompact } = fitAt(
        viewportPx,
        D2A_AS_DRAWN,
        accountWidthsPx,
      );
      if (previous !== undefined && isAccountCompact !== previous)
        flips.push(
          `${String(viewportPx)}: ${isAccountCompact ? "glyph" : "words"}`,
        );
      previous = isAccountCompact;
    }
    return flips;
  }

  it("agrees with the row the browser measured with the glyph in it", () => {
    // Gives B, C and the account give spent, measured at 1000: the words' width less the two forms' difference.
    expect(
      demandOf({
        isWordmarkDrawn: false,
        isSpacingClosed: true,
        isAccountCompact: true,
        isTitleDropped: false,
      }),
    ).toBeCloseTo(MEASURED_WITHOUT_WORDMARK_COMPACT_PX, 1);
    expect(
      MEASURED_WITHOUT_WORDMARK_PX - MEASURED_WITHOUT_WORDMARK_COMPACT_PX,
    ).toBeCloseTo(
      VISITOR_LINK_WIDTHS_PX.textPx - VISITOR_LINK_WIDTHS_PX.iconPx,
      1,
    );
  });

  it.each([
    ["Romanian", VISITOR_LINK_WIDTHS_PX],
    ["Russian", RUSSIAN_VISITOR_LINK_WIDTHS_PX],
  ] as const)(
    "changes form exactly once as the window widens, from the glyph to the words, in %s",
    (_name, accountWidthsPx) => {
      const flips = flipsOf(accountWidthsPx);

      expect(flips).toHaveLength(1);
      expect(flips[0]).toMatch(/: words$/);
      // The one flip is where the row without the wordmark names every setting beside the words, and not a pixel earlier.
      const returnAt = wordsReturnAt(accountWidthsPx);
      expect(
        fitAt(Math.ceil(returnAt) - 1, D2A_AS_DRAWN, accountWidthsPx)
          .isAccountCompact,
      ).toBe(true);
      expect(
        fitAt(Math.ceil(returnAt), D2A_AS_DRAWN, accountWidthsPx)
          .isAccountCompact,
      ).toBe(false);
    },
  );

  it("keeps the words wherever the pill names every setting, and draws the glyph where it is down to fewer", () => {
    expect(fitAt(1920, D2A_AS_DRAWN).isAccountCompact).toBe(false);
    expect(fitAt(1440, D2A_AS_DRAWN).isAccountCompact).toBe(false);
    expect(fitAt(1100, D2A_AS_DRAWN).isAccountCompact).toBe(true);
    expect(fitAt(900, D2A_AS_DRAWN).isAccountCompact).toBe(true);
  });

  it("returns the words' width to the pill and nothing else when it compacts", () => {
    const compact = fitAt(1000, D2A_AS_DRAWN);
    const wordmarkGoneAndGapsClosed = {
      isWordmarkDrawn: false,
      isSpacingClosed: true,
      isAccountCompact: false,
      isTitleDropped: false,
    };

    expect(compact.isAccountCompact).toBe(true);
    expect(compact.pillTrackPx).toBeCloseTo(
      1000 -
        demandOf(wordmarkGoneAndGapsClosed) +
        VISITOR_LINK_WIDTHS_PX.textPx -
        VISITOR_LINK_WIDTHS_PX.iconPx,
      6,
    );
  });

  it("never compacts a signed-in control, whose two forms measure alike, and leaves the other gives as they were", () => {
    expect(flipsOf(SIGNED_IN_WIDTHS_PX)).toEqual([]);
    for (
      let viewportPx = NARROWEST_SWEPT_PX;
      viewportPx <= WIDEST_SWEPT_PX;
      viewportPx += 1
    ) {
      const fit = fitAt(viewportPx, D2A_AS_DRAWN, SIGNED_IN_WIDTHS_PX);

      expect(fit.isAccountCompact, `at ${String(viewportPx)}`).toBe(false);
      const rowPx = viewportPx - demandOf(fit, SIGNED_IN_WIDTHS_PX);
      expect(fit.pillTrackPx, `at ${String(viewportPx)}`).toBeCloseTo(
        fit.isTitleDropped ? Math.min(rowPx, atOneName) : rowPx,
        6,
      );
    }
  });

  it("returns less for the shorter Russian words", () => {
    const romanian = fitAt(1000, D2A_AS_DRAWN);
    const russian = fitAt(1000, D2A_AS_DRAWN, RUSSIAN_VISITOR_LINK_WIDTHS_PX);

    expect(romanian.isAccountCompact).toBe(true);
    expect(russian.isAccountCompact).toBe(true);
    expect(
      romanian.pillTrackPx -
        trackWithTheWordsAt(romanian, VISITOR_LINK_WIDTHS_PX),
    ).toBeCloseTo(
      VISITOR_LINK_WIDTHS_PX.textPx - VISITOR_LINK_WIDTHS_PX.iconPx,
      2,
    );
    expect(
      russian.pillTrackPx -
        trackWithTheWordsAt(russian, RUSSIAN_VISITOR_LINK_WIDTHS_PX),
    ).toBeCloseTo(
      RUSSIAN_VISITOR_LINK_WIDTHS_PX.textPx -
        RUSSIAN_VISITOR_LINK_WIDTHS_PX.iconPx,
      2,
    );
  });
});

describe("the last give — the title leaves the row where the pill cannot otherwise name one whole setting", () => {
  const NARROWEST_SWEPT_PX = 700;
  const WIDEST_SWEPT_PX = 1700;

  /** The width at which the row with every other give spent leaves the pill one whole name beside the title, derived
   *  from the measured row (gaps closed, wordmark gone, the glyph) and the pill's own first rung. */
  function titleReturnsAt(accountWidthsPx: AccountControlWidths): number {
    return (
      atOneName +
      demandOf(
        {
          isWordmarkDrawn: false,
          isSpacingClosed: true,
          isAccountCompact: true,
          isTitleDropped: false,
        },
        accountWidthsPx,
      )
    );
  }

  function droppedWidths(accountWidthsPx: AccountControlWidths): number {
    let dropped = 0;
    for (
      let viewportPx = NARROWEST_SWEPT_PX;
      viewportPx <= WIDEST_SWEPT_PX;
      viewportPx += 1
    )
      if (fitAt(viewportPx, D2A_AS_DRAWN, accountWidthsPx).isTitleDropped)
        dropped += 1;
    return dropped;
  }

  it.each([
    ["a visitor", VISITOR_LINK_WIDTHS_PX],
    ["a signed-in client, whose control is the glyph", SIGNED_IN_WIDTHS_PX],
  ] as const)(
    "is dropped exactly below the width where one whole name fits beside it, for %s",
    (_who, accountWidthsPx) => {
      const returnAt = titleReturnsAt(accountWidthsPx);

      expect(
        fitAt(Math.ceil(returnAt) - 1, D2A_AS_DRAWN, accountWidthsPx)
          .isTitleDropped,
      ).toBe(true);
      expect(
        fitAt(Math.ceil(returnAt), D2A_AS_DRAWN, accountWidthsPx)
          .isTitleDropped,
      ).toBe(false);
      // A floor per arm: the title is drawn at most of the swept widths and absent at some.
      const dropped = droppedWidths(accountWidthsPx);
      expect(dropped).toBeGreaterThan(50);
      expect(
        WIDEST_SWEPT_PX - NARROWEST_SWEPT_PX + 1 - dropped,
      ).toBeGreaterThan(500);
    },
  );

  it("leaves a visitor and a signed-in client alike at the same width, because the glyph is what both draw there", () => {
    expect(titleReturnsAt(SIGNED_IN_WIDTHS_PX)).toBeCloseTo(
      titleReturnsAt(VISITOR_LINK_WIDTHS_PX),
      6,
    );
  });

  it("offers the ladder the room one whole name needs and no more, so the count cannot fall when the title returns", () => {
    const dropped = fitAt(900, D2A_AS_DRAWN);

    expect(dropped.isTitleDropped).toBe(true);
    expect(dropped.pillTrackPx).toBeCloseTo(atOneName, 6);
    expect(visibleLabelsIn(SEEDED_LABELS, dropped.pillTrackPx)).toBe(1);
    // The room the title returns would have named a second setting: that is why it is not offered.
    expect(900 - demandOf(dropped) >= atTwoWholeLabels).toBe(true);
  });

  it("returns the title's width and its gap, as the browser measured", () => {
    const withTitle = demandOf({
      isWordmarkDrawn: false,
      isSpacingClosed: true,
      isAccountCompact: true,
      isTitleDropped: false,
    });
    const without = demandOf({
      isWordmarkDrawn: false,
      isSpacingClosed: true,
      isAccountCompact: true,
      isTitleDropped: true,
    });

    expect(withTitle - without).toBeCloseTo(MEASURED_TITLE_RETURNED_PX, 1);
  });

  it("keeps the title wherever the pill names a whole setting beside it", () => {
    expect(fitAt(1000, D2A_AS_DRAWN).isTitleDropped).toBe(false);
    expect(fitAt(1440, D2A_AS_DRAWN).isTitleDropped).toBe(false);
    expect(fitAt(900, D2A_AS_DRAWN).isTitleDropped).toBe(true);
  });
});
