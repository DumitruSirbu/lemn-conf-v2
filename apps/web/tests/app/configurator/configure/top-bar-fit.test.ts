// ADR 0104 decision 8: the wordmark leaves the row rather than the setting name becoming a stub. The model takes a
// track and this file works in viewports; the `DEMAND_PX` figures are Chromium measurements of this application, not
// of the mockup. Every boundary is derived from the pill's measured rung widths, so no width threshold is asserted
// (ADR 0094 criterion 4i).
import { describe, expect, it } from "vitest";

import {
  D2A_SPACING,
  describeTopBarFit,
  FRAME_2A_SPACING,
  type TopBarConfiguration,
} from "@/app/configurator/configure/top-bar-fit";
import {
  chooseVisibleSettingLabels,
  widthNeededForVisibleLabels,
  type SettingsPillFixedWidths,
} from "@/settings/settings-pill-fit";

/** Frame D2A's pill, measured in the application — the same declarations
 *  `settings-pill-fit.test.ts` reads, and for the same reason. */
const DESKTOP_PILL: SettingsPillFixedWidths = {
  framePx: 30,
  swatchPx: 16,
  separatorPx: 1,
  counterPx: 14.27,
  caretPx: 7.03,
  gapPx: 10,
};

/** `PAL melaminat │ Alb │ Feronerie Standard │ Adâncime 600`, measured; the colour carries no category word. */
const SEEDED_LABELS = [83.39, 18.08, 107.7, 79.92];

/** `Lemnaria` at `700 15px/1` with `letter-spacing: .22em`, measured: 105.56. */
const WORDMARK_PX = 105.56;

/**
 * What the row's fixed contents cost, leaving the rest of the viewport to the pill's track: `viewport − the settings
 * track`, measured at a width where each configuration is on screen (1440 as drawn, 1000 gaps closed, 900 wordmark
 * gone). The price column carries frame D2A's inline "de la 101 000 MDL". The differences between configurations
 * match the frames' own gaps exactly.
 *
 * **STALE since the header's account control joined the row (M8B Lot 2 U3), and owed a re-measurement.** These figures were
 * taken before the control stood in the row: they omit its width, its divider and its two row gaps, so
 * `asDrawn - gapsClosed` is still 105 where the model, and the stylesheet that `top-bar-box.test.ts` reads, now return 121
 * (four dividers, eight row gaps). The six assertions that compare the model with these figures are red by exactly 16 px
 * (2 x (14 - 6)) for that reason alone. They are left red rather than re-derived: a figure computed from the old
 * measurement is one no browser has produced. Re-measure `viewport - the settings track` at the three configurations
 * (1440, 1000, 900) with the control showing, then replace the three numbers and `MEASURED_WITHOUT_WORDMARK_PX`.
 */
const DEMAND_PX = {
  /** Frame D2A as drawn: gaps `28`/`14`, the wordmark in the row. */
  asDrawn: 918.55,
  /** Give B spent: gaps closed to frame 2A's `9`/`6`. */
  gapsClosed: 813.55,
  /** Gives B and C spent: the wordmark gone as well, derived from the line above so the two agree to the last bit;
   *  the browser measured 698.98. */
  gapsClosedWithoutWordmark: 813.55 - (WORDMARK_PX + FRAME_2A_SPACING.navGapPx),
};

/** What the browser reported for the third configuration, held beside the derivation above so the
 *  derivation cannot drift away from the row it describes. */
const MEASURED_WITHOUT_WORDMARK_PX = 698.98;

function demandOf(configuration: TopBarConfiguration): number {
  if (!configuration.isSpacingClosed) {
    return configuration.isWordmarkDrawn
      ? DEMAND_PX.asDrawn
      : DEMAND_PX.asDrawn - (WORDMARK_PX + D2A_SPACING.navGapPx);
  }
  return configuration.isWordmarkDrawn
    ? DEMAND_PX.gapsClosed
    : DEMAND_PX.gapsClosedWithoutWordmark;
}

/** The row as it stands at a viewport, in the configuration it is currently drawn in. */
function fitAt(
  viewportPx: number,
  measuredIn: TopBarConfiguration,
): ReturnType<typeof describeTopBarFit> {
  return describeTopBarFit({
    pillTrackPx: viewportPx - demandOf(measuredIn),
    wordmarkWidthPx: WORDMARK_PX,
    measuredIn,
    labelWidthsPx: SEEDED_LABELS,
    fixedWidthsPx: DESKTOP_PILL,
  });
}

/** What closing the gaps returns to the pill, written out from the two frames: three nav gaps going 28 → 9 and eight
 *  row gaps going 14 → 6 (four dividers, a gap on each side), `3 × 19 + 8 × 8`. The eight is read off the stylesheet by
 *  `top-bar-box.test.ts`. A literal, so the model's own composition is not what it is checked against. */
const GAPS_RETURNED_TO_THE_PILL_PX = 121;

const D2A_AS_DRAWN: TopBarConfiguration = {
  isWordmarkDrawn: true,
  isSpacingClosed: false,
};

/** The pill's own rungs, derived rather than pinned. */
const atEveryLabel = widthNeededForVisibleLabels(
  4,
  SEEDED_LABELS,
  DESKTOP_PILL,
);
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

const EVERY_DESKTOP_WIDTH = [900, 950, 1000, 1033, 1034, 1100, 1440, 1920];

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
  return describeTopBarFit({
    pillTrackPx: viewportPx - demandOf(measuredIn),
    wordmarkWidthPx: WORDMARK_PX,
    measuredIn,
    labelWidthsPx,
    fixedWidthsPx: DESKTOP_PILL,
  });
}

describe("the boundaries the owner was given the ruling in terms of", () => {
  it("keeps the wordmark's departure above 900, which is what the ruling rested on", () => {
    expect(WORDMARK_LEAVES_BELOW_PX).toBeCloseTo(1238.67, 2);
    // The superseded count-based boundary, kept as the size of the move: the property-based rule waits until the
    // wordmark
    // costs no name, which on these labels is all four, so the difference is the third and fourth names' own cost.
    expect(DEMAND_PX.gapsClosed + atTwoWholeLabels).toBeCloseTo(1033.32, 2);
    expect(WORDMARK_LEAVES_BELOW_PX - (DEMAND_PX.gapsClosed + atTwoWholeLabels)) //
      .toBeCloseTo(atEveryLabel - atTwoWholeLabels, 6);
    expect(WORDMARK_LEAVES_BELOW_PX).toBeGreaterThan(900);
  });

  it("puts frame D2A's own spacing above the width every label needs inside it", () => {
    expect(GAPS_CLOSE_BELOW_PX).toBeCloseTo(1343.68, 1);
  });
});

describe("give C — the wordmark leaves the row, and only where it buys a name", () => {
  it("is drawn at every width where it costs the pill no setting name", () => {
    // A hundredth of a pixel either side of the derived boundary: the two sides are reached by different sums, so the
    // boundary is a floating-point knife-edge that no browser width lands on.
    for (const viewportPx of [
      WORDMARK_LEAVES_BELOW_PX + 0.01,
      1300,
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
    const kept = fitAt(1300, D2A_AS_DRAWN);
    const dropped = fitAt(1000, D2A_AS_DRAWN);

    expect(kept.pillTrackPx).toBeCloseTo(1300 - DEMAND_PX.gapsClosed, 6);
    expect(dropped.pillTrackPx).toBeCloseTo(
      1000 - DEMAND_PX.gapsClosedWithoutWordmark,
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
    expect(fitAt(1350, D2A_AS_DRAWN).spacing).toEqual(D2A_SPACING);
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
    // One observation is enough because the answer is a fixed point: the track the model reads reacts to both gives, so
    // an
    // answer that changed when re-measured in its own configuration would oscillate.
    for (const viewportPx of EVERY_DESKTOP_WIDTH) {
      const first = fitAt(viewportPx, D2A_AS_DRAWN);
      const second = fitAt(viewportPx, first);

      expect(second.isWordmarkDrawn, `at ${String(viewportPx)}`).toBe(
        first.isWordmarkDrawn,
      );
      expect(second.isSpacingClosed, `at ${String(viewportPx)}`).toBe(
        first.isSpacingClosed,
      );
      expect(second.pillTrackPx, `at ${String(viewportPx)}`).toBeCloseTo(
        first.pillTrackPx,
        6,
      );
    }
  });

  it("reaches the same answer from every configuration it could have been drawn in", () => {
    // Whatever configuration the row was showing when the window was resized, the answer is a property of the width,
    // not
    // of the history.
    const everyConfiguration: readonly TopBarConfiguration[] = [
      { isWordmarkDrawn: true, isSpacingClosed: false },
      { isWordmarkDrawn: true, isSpacingClosed: true },
      { isWordmarkDrawn: false, isSpacingClosed: true },
      { isWordmarkDrawn: false, isSpacingClosed: false },
    ];

    for (const viewportPx of EVERY_DESKTOP_WIDTH) {
      const answers = everyConfiguration.map((measuredIn) => {
        const fit = fitAt(viewportPx, measuredIn);
        return `${String(fit.isWordmarkDrawn)}/${String(fit.isSpacingClosed)}`;
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

      expect(fit.pillTrackPx, `at ${String(viewportPx)}`).toBeCloseTo(
        viewportPx - demandOf(fit),
        6,
      );
    }
  });
});
