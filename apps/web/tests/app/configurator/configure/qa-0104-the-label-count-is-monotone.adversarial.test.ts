// **Adversarial QA of ADR 0104's give C, at the tier names the price book actually offers.**
//
// The owner ruled the wordmark's return width twice on 2026-09-09. The second ruling — recorded in
// `top-bar-fit.ts`'s `SETTINGS_THE_WORDMARK_WAITS_FOR`, in the milestone's *"the label count is
// monotone in width across the whole desktop range"*, and in criterion 13's *"stepped 1 px at a time
// across each rung boundary, the count never oscillates"* — exists to remove one artefact and one
// only: **crossing the width where the wordmark comes back, while widening, must not take a setting
// name off the pill.**
//
// `top-bar-fit.test.ts` sweeps exactly that. It sweeps it at **one** label set — the seeded design's,
// whose hardware tier is `Standard` — and it sweeps it with **no previous count**, which is a state
// `use-top-bar-fit.ts` is never in after its first observation. This file varies both, because both
// are things a customer varies: the hardware tier is one of three the book offers
// (`sample-price-book.ts:326, 339, 354`), and where a window starts is not something a page chooses.
//
// **The arithmetic the ruling rests on, stated so a reader can check the finding rather than take
// it.** At the boundary the wordmark returns at, the pill's track drops by exactly what the wordmark
// and its gap cost — `WORDMARK_PX + FRAME_2A_SPACING.navGapPx`, 114.56 px. Above the boundary the
// pill shows two names by construction. Below it, it shows as many as `W₂ + 114.56` buys. So the
// count is monotone across that boundary **only while a third name costs the pill more than the
// wordmark does**, and a third name costs `hardwareWidth + separatorPx + 2 × gapPx`:
//
//   | hardware tier | label              | width  | a third name | the wordmark | monotone        |
//   | ------------- | ------------------ | ------ | ------------ | ------------ | --------------- |
//   | Standard      | Feronerie Standard | 107.70 | 128.70       | 114.56       | yes             |
//   | Hettich       | Feronerie Hettich  |  95.88 | 116.88       | 114.56       | yes, by 2.32 px |
//   | Blum          | Feronerie Blum     |  85.45 | 106.45       | 114.56       | **no**          |
//
// Nothing in the model enforces that comparison; it happens to hold at the tier the seeded design
// carries and to fail at one the customer can choose in the sheet.
//
// Every width below is measured in Chromium 1.62.1 on this machine at the pill's own declared
// typography (`400 12.5px/1 Helvetica, Arial, sans-serif`), by the method the wave used — the four
// seeded figures reproduce `top-bar-fit.test.ts`'s to the hundredth, which is what makes the two new
// ones comparable rather than a second model of the type.
import { fc, test as propertyTest } from "@fast-check/vitest";
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

/** Frame D2A's pill as this application draws it — the declarations `top-bar-fit.test.ts` reads. */
const DESKTOP_PILL: SettingsPillFixedWidths = {
  framePx: 30,
  swatchPx: 16,
  separatorPx: 1,
  counterPx: 14.27,
  caretPx: 7.03,
  gapPx: 10,
};

const WORDMARK_PX = 105.56;

/** The row's fixed contents in each configuration the two gives produce — `top-bar-fit.test.ts`'s
 *  own measurement, reused so the two files cannot disagree about the row they describe. */
const DEMAND_PX = {
  asDrawn: 918.55,
  gapsClosed: 813.55,
  gapsClosedWithoutWordmark: 813.55 - (WORDMARK_PX + FRAME_2A_SPACING.navGapPx),
};

/** `PAL melaminat`, `Alb` and `Adâncime 600` — the seeded design's other three labels. */
const MATERIAL_PX = 83.39;
const COLOUR_PX = 18.08;
const DEPTH_PX = 79.92;

/** `Feronerie {tier}` at each of the three tiers the book offers. */
const HARDWARE_PX = {
  Standard: 107.7,
  Hettich: 95.875,
  Blum: 85.453125,
} as const;

const D2A_AS_DRAWN: TopBarConfiguration = {
  isWordmarkDrawn: true,
  isSpacingClosed: false,
};

/** How many observations the row is allowed to take to settle. `describeTopBarFit` is a fixed point,
 *  so it converges in one; a bound that is never reached is what says so. */
const OBSERVATIONS_ALLOWED = 8;

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

interface SettledRow {
  readonly visibleCount: number;
  readonly isWordmarkDrawn: boolean;
}

/**
 * **`use-top-bar-fit.ts`'s own loop, run to its fixed point.** One observation feeds
 * `describeTopBarFit`, its answer feeds `chooseVisibleSettingLabels`, the row re-renders in the
 * chosen configuration and the observer fires again — so a model that took one step would be
 * measuring a row that is not on screen, which is the very mistake that hook's `measuringIn`
 * comment records.
 *
 * `startingVisibleCount` is the hook's `useState(pill.settings.length)` on a fresh page, and the
 * count the row was already showing on a resize.
 */
function settleAt(
  labelWidthsPx: readonly number[],
  viewportPx: number,
  startingVisibleCount: number,
): SettledRow {
  let configuration = D2A_AS_DRAWN;
  let visibleCount = startingVisibleCount;
  for (
    let observation = 0;
    observation < OBSERVATIONS_ALLOWED;
    observation += 1
  ) {
    const fit = describeTopBarFit({
      pillTrackPx: viewportPx - demandOf(configuration),
      wordmarkWidthPx: WORDMARK_PX,
      measuredIn: configuration,
      labelWidthsPx,
      fixedWidthsPx: DESKTOP_PILL,
    });
    const chosen = chooseVisibleSettingLabels({
      availableWidthPx: fit.pillTrackPx,
      labelWidthsPx,
      fixedWidthsPx: DESKTOP_PILL,
      previousVisibleCount: visibleCount,
    });
    const isSettled =
      fit.isWordmarkDrawn === configuration.isWordmarkDrawn &&
      fit.isSpacingClosed === configuration.isSpacingClosed &&
      chosen.visibleCount === visibleCount;
    configuration = {
      isWordmarkDrawn: fit.isWordmarkDrawn,
      isSpacingClosed: fit.isSpacingClosed,
    };
    visibleCount = chosen.visibleCount;
    if (isSettled) break;
  }
  return { visibleCount, isWordmarkDrawn: configuration.isWordmarkDrawn };
}

/** A page opened at a width, with nothing behind it — the hook starts at every setting named and
 *  settles on the first observation. */
function onFirstPaintAt(
  labelWidthsPx: readonly number[],
  viewportPx: number,
): SettledRow {
  return settleAt(labelWidthsPx, viewportPx, labelWidthsPx.length);
}

/** The settled row **and the track it settled on**, which `SettledRow` does not carry. Only the
 *  give-C mechanism assertion needs it: every other claim in this file is about the count alone. */
function settledFitAt(
  labelWidthsPx: readonly number[],
  viewportPx: number,
): SettledRow & { readonly pillTrackPx: number } {
  const settled = onFirstPaintAt(labelWidthsPx, viewportPx);
  const configuration: TopBarConfiguration = {
    isWordmarkDrawn: settled.isWordmarkDrawn,
    isSpacingClosed: describeTopBarFit({
      pillTrackPx: viewportPx - demandOf(D2A_AS_DRAWN),
      wordmarkWidthPx: WORDMARK_PX,
      measuredIn: D2A_AS_DRAWN,
      labelWidthsPx,
      fixedWidthsPx: DESKTOP_PILL,
    }).isSpacingClosed,
  };
  const fit = describeTopBarFit({
    pillTrackPx: viewportPx - demandOf(configuration),
    wordmarkWidthPx: WORDMARK_PX,
    measuredIn: configuration,
    labelWidthsPx,
    fixedWidthsPx: DESKTOP_PILL,
  });
  return { ...settled, pillTrackPx: fit.pillTrackPx };
}

const NARROWEST_DESKTOP_PX = 900;
const WIDEST_SWEPT_PX = 1500;

/** Every width at which a page opened one pixel wider names **fewer** settings than the page beside
 *  it — the artefact stated as the comparison a reader can check, with the wordmark's arrival named
 *  beside it so the failure says its own cause. */
function widthsWhereAWiderPageNamesFewer(
  labelWidthsPx: readonly number[],
): readonly string[] {
  const lost: string[] = [];
  for (
    let viewportPx = NARROWEST_DESKTOP_PX;
    viewportPx < WIDEST_SWEPT_PX;
    viewportPx += 1
  ) {
    const narrower = onFirstPaintAt(labelWidthsPx, viewportPx);
    const wider = onFirstPaintAt(labelWidthsPx, viewportPx + 1);
    if (wider.visibleCount >= narrower.visibleCount) continue;
    lost.push(
      `${String(viewportPx)} -> ${String(viewportPx + 1)} px: ` +
        `${String(narrower.visibleCount)} names -> ${String(wider.visibleCount)}, ` +
        `wordmark ${narrower.isWordmarkDrawn ? "kept" : "absent"} -> ` +
        (wider.isWordmarkDrawn ? "drawn" : "absent"),
    );
  }
  return lost;
}

/** Criterion 13's own sweep: the window **dragged** one pixel wider from a row that had settled at
 *  the narrower width. Distinct from the comparison above — this one carries the count forward, so
 *  the hysteresis is in play and a failure here is one a customer performs rather than observes. */
function widthsWhereWideningTakesAName(
  labelWidthsPx: readonly number[],
): readonly string[] {
  const lost: string[] = [];
  for (
    let viewportPx = NARROWEST_DESKTOP_PX;
    viewportPx < WIDEST_SWEPT_PX;
    viewportPx += 1
  ) {
    const settled = onFirstPaintAt(labelWidthsPx, viewportPx);
    const widened = settleAt(
      labelWidthsPx,
      viewportPx + 1,
      settled.visibleCount,
    );
    if (widened.visibleCount >= settled.visibleCount) continue;
    lost.push(
      `${String(viewportPx)} -> ${String(viewportPx + 1)} px: ` +
        `${String(settled.visibleCount)} names -> ${String(widened.visibleCount)}, ` +
        `wordmark ${settled.isWordmarkDrawn ? "kept" : "absent"} -> ` +
        (widened.isWordmarkDrawn ? "drawn" : "absent"),
    );
  }
  return lost;
}

/** **Non-vacuity for every emptiness assertion below, taken from the rows the sweep actually
 *  produced** (ADR 0093): a sweep pinned at one rung would satisfy *"never falls"* without
 *  exercising the ladder at all. */
function countsReachedAcrossTheSweep(
  labelWidthsPx: readonly number[],
): readonly number[] {
  const reached = new Set<number>();
  for (
    let viewportPx = NARROWEST_DESKTOP_PX;
    viewportPx <= WIDEST_SWEPT_PX;
    viewportPx += 1
  ) {
    reached.add(onFirstPaintAt(labelWidthsPx, viewportPx).visibleCount);
  }
  return [...reached].sort((left, right) => left - right);
}

function labelsWithHardware(hardwarePx: number): readonly number[] {
  return [MATERIAL_PX, COLOUR_PX, hardwarePx, DEPTH_PX];
}

describe("a wider window never names fewer settings — at every tier the book offers", () => {
  /**
   * **The tier `top-bar-fit.test.ts` already sweeps**, held here so the two below are compared
   * against a case this file agrees is well. If this one ever fails, the sweep is wrong rather than
   * the model.
   */
  it("holds on the seeded Standard tier", () => {
    const labels = labelsWithHardware(HARDWARE_PX.Standard);

    expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
    expect(widthsWhereAWiderPageNamesFewer(labels)).toEqual([]);
  });

  it("holds on the Hettich tier", () => {
    const labels = labelsWithHardware(HARDWARE_PX.Hettich);

    expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
    expect(widthsWhereAWiderPageNamesFewer(labels)).toEqual([]);
  });

  /**
   * **The finding.** `Feronerie Blum` is 85.45 px, so a third name costs the pill 106.45 while the
   * wordmark's return costs it 114.56 — and at the pixel the wordmark comes back in, a page opened
   * one pixel wider names one setting fewer. That is the artefact the owner was shown and chose
   * away; `SETTINGS_THE_WORDMARK_WAITS_FOR = 2` removes it only while the wordmark is cheaper than
   * the name it displaces, which nothing enforces and which the book's own shortest tier name
   * breaks.
   */
  it("holds on the Blum tier", () => {
    const labels = labelsWithHardware(HARDWARE_PX.Blum);

    expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
    expect(widthsWhereAWiderPageNamesFewer(labels)).toEqual([]);
  });

  /**
   * **The pill with three settings**, the state an undeclared applied material leaves it in —
   * `describeSettingsPill` drops the colour entry and *"the count then counts from three"*. The
   * third name is the depth here and drawing it also **retires the counter**, so it costs the pill
   * `79.92 + 1 + 20 − 14.27 = 86.65` against the wordmark's 114.56. It fails at every hardware tier,
   * including the seeded one.
   */
  it("holds when the material is undeclared and the pill carries three settings", () => {
    const labels = [MATERIAL_PX, HARDWARE_PX.Standard, DEPTH_PX];

    expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
    expect(widthsWhereAWiderPageNamesFewer(labels)).toEqual([]);
  });
});

describe("criterion 13's drag — one pixel at a time, in the widening direction", () => {
  it("never takes a name off a row that had settled a pixel narrower, on Standard", () => {
    const labels = labelsWithHardware(HARDWARE_PX.Standard);

    expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
    expect(widthsWhereWideningTakesAName(labels)).toEqual([]);
  });

  it("never takes a name off a row that had settled a pixel narrower, on Blum", () => {
    const labels = labelsWithHardware(HARDWARE_PX.Blum);

    expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
    expect(widthsWhereWideningTakesAName(labels)).toEqual([]);
  });
});

describe("the property, over the widths a hardware tier name can take", () => {
  /**
   * The general statement, so a tier name authored outside TypeScript (ADR 0062 seam 1) cannot
   * re-open this silently. The other three labels are the seeded design's measured widths and only
   * the hardware name varies, across the range `Feronerie {tier}` spans for a plausible tier —
   * `Feronerie Blum` is 85.45 and `Feronerie Standard` is 107.70, so the range is centred on what
   * the book already ships.
   */
  propertyTest.prop([fc.double({ min: 60, max: 200, noNaN: true })])(
    "names no fewer settings at a wider window, whatever the hardware tier is called",
    (hardwarePx) => {
      expect(
        widthsWhereAWiderPageNamesFewer(labelsWithHardware(hardwarePx)),
      ).toEqual([]);
    },
  );
});

describe("what the boundary depends on, stated as the quantity rather than as a width", () => {
  /**
   * **This assertion was written the other way round, and the fix inverted it rather than satisfying
   * it.** As authored it read *"needs the wordmark to cost the pill less than the name its return
   * displaces"* — the precondition `SETTINGS_THE_WORDMARK_WAITS_FOR = 2` silently depended on. It is
   * arithmetic over three declared label widths and **no production code can make it true**:
   * `Feronerie Blum` is 85.45, so a third name costs 106.45 against the wordmark's 114.56, and the
   * only ways to satisfy it are to rename a shipped tier or to re-type the wordmark.
   *
   * So the remedy was not to meet the precondition but to remove the dependency on it: give C is now
   * conditioned on the property directly — the wordmark is drawn only where drawing it costs no name
   * — and is monotone whatever the labels measure.
   *
   * The comparison is kept, pointing at the finding instead of at the requirement: **the tier that
   * broke it must go on breaking it.** If `Feronerie Blum` ever became expensive enough to satisfy
   * the old precondition, every sweep above would pass under a mechanism that had quietly returned
   * to being a coincidence.
   *
   * **What this cannot do is notice a rename.** `HARDWARE_PX` holds three measured label widths as
   * file-local literals; no price book is imported here, and none can be — a tier's *name* is in the
   * book but the width that name renders to is a measurement. So a tier renamed in
   * `sample-price-book.ts` leaves these three numbers describing labels that no longer exist, and
   * every case in this file goes on passing. Re-measure them when a tier's name changes.
   */
  it("keeps the shipped tier whose third name is cheaper than the wordmark", () => {
    const wordmarkCostPx = WORDMARK_PX + FRAME_2A_SPACING.navGapPx;
    const thirdNameCostOf = (hardwarePx: number): number => {
      const labels = labelsWithHardware(hardwarePx);
      return (
        widthNeededForVisibleLabels(3, labels, DESKTOP_PILL) -
        widthNeededForVisibleLabels(2, labels, DESKTOP_PILL)
      );
    };

    // The old precondition, tier by tier: two hold and one does not, which is the defect in one line.
    expect(thirdNameCostOf(HARDWARE_PX.Standard)).toBeGreaterThan(
      wordmarkCostPx,
    );
    expect(thirdNameCostOf(HARDWARE_PX.Hettich)).toBeGreaterThan(
      wordmarkCostPx,
    );
    expect(thirdNameCostOf(HARDWARE_PX.Blum)).toBeLessThan(wordmarkCostPx);
  });

  /**
   * **And the invariant that replaced it, asserted over every tier and both pill sizes.** Give C now
   * draws the wordmark only where the pill names as many settings with it as without it, so the
   * count the row settles on is always the count the wider track buys — non-decreasing in width by
   * construction rather than by an arithmetic coincidence.
   *
   * Stated over the whole desktop range rather than at the boundary, because "the wordmark is free"
   * is a claim about every width and not only about the one where it changes.
   */
  it("never draws the wordmark at a width where it would cost a name", () => {
    const everyPill = [
      ...Object.values(HARDWARE_PX).map((px) => labelsWithHardware(px)),
      [MATERIAL_PX, HARDWARE_PX.Standard, DEPTH_PX],
    ];

    let widthsWithTheWordmark = 0;
    const costly: string[] = [];
    for (const labels of everyPill) {
      for (
        let viewportPx = NARROWEST_DESKTOP_PX;
        viewportPx <= WIDEST_SWEPT_PX;
        viewportPx += 1
      ) {
        const settled = settledFitAt(labels, viewportPx);
        if (!settled.isWordmarkDrawn) continue;
        widthsWithTheWordmark += 1;

        // **The claim, in the width model rather than in the decision.** The row is showing the
        // wordmark, so the track it gave up — its own width plus the gap beside it — must not have
        // been enough for one more name. Asked of `widthNeededForVisibleLabels`, which is the pill's
        // measurement and not give C's rule, so this cannot agree with the code by construction.
        const trackWithoutIt =
          settled.pillTrackPx + WORDMARK_PX + FRAME_2A_SPACING.navGapPx;
        const oneMore = settled.visibleCount + 1;
        if (oneMore > labels.length) continue;
        if (
          widthNeededForVisibleLabels(oneMore, labels, DESKTOP_PILL) <=
          trackWithoutIt
        ) {
          costly.push(
            `${String(viewportPx)} px: names ${String(settled.visibleCount)} ` +
              `with the wordmark where ${String(oneMore)} would fit without it`,
          );
        }
      }
    }

    expect(costly).toEqual([]);
    // Non-vacuity: the wordmark is drawn somewhere in the sweep, so the loop above inspected
    // something. A give C that never returned the wordmark would satisfy the claim by drawing none.
    expect(widthsWithTheWordmark).toBeGreaterThan(0);
  });
});
