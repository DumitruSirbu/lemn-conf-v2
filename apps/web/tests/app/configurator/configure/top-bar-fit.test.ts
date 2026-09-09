// **Gives B and C, as a value** — ADR 0104 decision 8, and the owner's ruling of 2026-09-09 that the
// wordmark leaves the row rather than the setting name becoming a stub.
//
// The model takes a **track** and this file works in **viewports**, because that is what the ruling
// was given in ("the wordmark drops between 900 and 966 px") and what the owner will see in a
// browser. The bridge is three numbers, and all three are measurements of this application taken in
// Chromium on 2026-09-09 rather than of the mockup: what the row's fixed contents cost in each of
// the configurations the gives produce. They are stated here so the boundaries below are arithmetic
// a reader can check rather than constants somebody chose.
//
// **No width threshold is asserted or implied.** Every boundary in this file is *derived* from the
// pill's own measured rung widths and the row's measured demand; change a tier name and every number
// here moves with it, which is exactly what ADR 0094 criterion 4i asks for.
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

/** `PAL melaminat │ Alb │ Feronerie Standard │ Adâncime 600`, measured — the colour carries no
 *  category word since the owner's ruling of 2026-09-09. */
const SEEDED_LABELS = [83.39, 18.08, 107.7, 79.92];

/** `Lemnaria` at `700 15px/1` with `letter-spacing: .22em`, measured: 105.56. */
const WORDMARK_PX = 105.56;

/**
 * What the row's **fixed** contents cost, leaving the rest of the viewport to the pill's track.
 *
 * **Measured in this application on 2026-09-09**, as `viewport − the settings track`, at a width
 * where each configuration is the one on screen: 1440 for frame D2A as drawn, 1000 for the closed
 * gaps, 900 for the row with the wordmark gone. It is the header's `40 + 28` padding, the nav's own
 * contents and gaps, the three 28 px dividers with the row's gap on either side of each, and the
 * price column, the CTA and the locale chip.
 *
 * **Re-measured 2026-09-09 after the owner's price ruling**, which put frame D2A's inline
 * *"de la 101 000 MDL"* on both shells: the price column carries the prefix on its own line now, so
 * every figure here is about 54 px larger than the same measurement taken over the stacked label.
 * The two *differences* are unmoved and match the frames' own gaps exactly: closing the gaps returns
 * 105.00 px and dropping the wordmark returns 114.57.
 */
const DEMAND_PX = {
  /** Frame D2A as drawn: gaps `28`/`14`, the wordmark in the row. */
  asDrawn: 918.55,
  /** Give B spent: gaps closed to frame 2A's `9`/`6`. */
  gapsClosed: 813.55,
  /** Gives B and C spent: the wordmark gone as well — **derived from the line above rather than
   *  pinned**, so the two agree to the last bit rather than to the hundredth the browser reports.
   *  The measurement it is checked against is 698.98. */
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
 * The two boundaries the gives produce, in viewport pixels — **derived from the lines above and the
 * measured demand**, never chosen.
 *
 * **The wordmark waits for two names, not one** (owner, 2026-09-09, on the second reading). At the
 * one-name width it returned and took a name back off the pill, so the visible label count fell as
 * the window widened; the owner chose that artefact away and accepted a wordmark absent over a
 * further stretch instead.
 */
const WORDMARK_LEAVES_BELOW_PX = DEMAND_PX.gapsClosed + atTwoWholeLabels;
const GAPS_CLOSE_BELOW_PX = DEMAND_PX.asDrawn + atEveryLabel;

const EVERY_DESKTOP_WIDTH = [900, 950, 1000, 1033, 1034, 1100, 1440, 1920];

/** How many names the pill draws in a track — the ladder's own answer, so the sweep below reads the
 *  same function the row does rather than a second model of it. */
function visibleLabelsAt(pillTrackPx: number): number {
  return chooseVisibleSettingLabels({
    availableWidthPx: pillTrackPx,
    labelWidthsPx: SEEDED_LABELS,
    fixedWidthsPx: DESKTOP_PILL,
  }).visibleCount;
}

describe("the boundaries the owner was given the ruling in terms of", () => {
  it("keeps the wordmark's departure above 900, which is what the ruling rested on", () => {
    // **The width the owner settled on**: where the wordmark fits beside **two** setting names, so
    // widening the window never takes a name away. Measured in this application, 1033.32 — and the
    // condition the first ruling was given under still holds far more comfortably than it did: the
    // pill cannot show a whole name beside the wordmark at 900 px, so the wordmark is absent there.
    expect(WORDMARK_LEAVES_BELOW_PX).toBeCloseTo(1033.32, 2);
    expect(WORDMARK_LEAVES_BELOW_PX).toBeGreaterThan(900);
  });

  it("puts frame D2A's own spacing above the width every label needs inside it", () => {
    expect(GAPS_CLOSE_BELOW_PX).toBeCloseTo(1343.68, 1);
  });
});

describe("give C — the wordmark leaves the row, and only where it buys a name", () => {
  it("is drawn at every width where two whole setting names fit beside it", () => {
    // A hundredth of a pixel either side of the derived boundary rather than exactly on it: the two
    // sides of that comparison are reached by different sums, so the boundary itself is a
    // floating-point knife-edge and no browser hands out a width that lands on it.
    for (const viewportPx of [
      WORDMARK_LEAVES_BELOW_PX + 0.01,
      1100,
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
    // Their alternative was `P…` where a setting name should be — the option they were given and
    // rejected, along with putting the phone's shell on a narrow laptop.
    for (const viewportPx of [900, 1000, WORDMARK_LEAVES_BELOW_PX - 0.01]) {
      expect(
        fitAt(viewportPx, D2A_AS_DRAWN).isWordmarkDrawn,
        `at ${String(viewportPx)}`,
      ).toBe(false);
    }
  });

  it("gives the pill exactly the wordmark's own width and its gap when it goes", () => {
    // Non-vacuity for the two cases above: the departure has to be worth something, and what it is
    // worth is measured rather than asserted in prose.
    const kept = fitAt(1100, D2A_AS_DRAWN);
    const dropped = fitAt(1000, D2A_AS_DRAWN);

    expect(kept.pillTrackPx).toBeCloseTo(1100 - DEMAND_PX.gapsClosed, 6);
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

  it("never lets the label count fall as the window widens, which is what the second ruling bought", () => {
    // **The artefact the owner chose away, asserted as its absence.** Swept a pixel at a time across
    // the whole desktop range, the number of names the pill draws is monotone: widening the window
    // never takes one back. At the earlier one-name width it did, at exactly one boundary.
    let previous = 0;
    for (let viewportPx = 900; viewportPx <= 1500; viewportPx += 1) {
      const fit = fitAt(viewportPx, D2A_AS_DRAWN);
      const drawn = visibleLabelsAt(fit.pillTrackPx);

      expect(drawn, `at ${String(viewportPx)} px`).toBeGreaterThanOrEqual(
        previous,
      );
      previous = drawn;
    }
  });

  it("returns 105 px to the pill when it does, composed from the two frames' own gaps", () => {
    expect(DEMAND_PX.asDrawn - DEMAND_PX.gapsClosed).toBeCloseTo(105, 2);
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
    // **The property that makes one observation enough.** The track the model reads reacts to both
    // gives, so an answer that changed when re-measured in its own configuration would oscillate —
    // the classic measure-and-decide loop, at every width rather than at a boundary.
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
    // Whatever the row happened to be showing when the window was resized — the four states the two
    // gives can produce — the answer is a property of the width and not of the history.
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
    // The half that keeps the settle invisible: the count is decided against the row the row is
    // about to be, not the row it was measured in.
    for (const viewportPx of EVERY_DESKTOP_WIDTH) {
      const fit = fitAt(viewportPx, D2A_AS_DRAWN);

      expect(fit.pillTrackPx, `at ${String(viewportPx)}`).toBeCloseTo(
        viewportPx - demandOf(fit),
        6,
      );
    }
  });
});
