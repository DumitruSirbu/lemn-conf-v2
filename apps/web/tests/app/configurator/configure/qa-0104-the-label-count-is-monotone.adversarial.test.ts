// Sweeps ADR 0104's give C, and the visitor's link beside it, at all three hardware tiers the book offers and from a previous count, which
// `top-bar-fit.test.ts` (one label set, no previous count) does not.
// Widths are measured in Chromium at the pill's declared typography (`400 12.5px/1 Helvetica, Arial, sans-serif`); the
// four seeded figures reproduce `top-bar-fit.test.ts`'s, so the two added tiers are comparable.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
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
  DESKTOP_PILL,
  fitAtViewport,
  RUSSIAN_VISITOR_LINK_WIDTHS_PX,
  SIGNED_IN_WIDTHS_PX,
  VISITOR_LINK_WIDTHS_PX,
  WORDMARK_PX,
} from "../../../support/top-bar-measured-row";

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

/** How many observations the row may take to settle; `describeTopBarFit` is a fixed point, so it converges in one. */
const OBSERVATIONS_ALLOWED = 8;

interface SettledRow {
  readonly visibleCount: number;
  readonly isWordmarkDrawn: boolean;
  readonly isAccountCompact: boolean;
  readonly isTitleDropped: boolean;
}

/**
 * `use-top-bar-fit.ts`'s own loop run to its fixed point: a model that took one step would measure a row that is not
 * on screen. `startingVisibleCount` is the hook's `useState(pill.settings.length)` on a fresh page, and the count
 * already showing on a resize.
 */
function settleAt(
  labelWidthsPx: readonly number[],
  viewportPx: number,
  startingVisibleCount: number,
  accountWidthsPx: AccountControlWidths = VISITOR_LINK_WIDTHS_PX,
): SettledRow {
  let configuration = D2A_AS_DRAWN;
  let visibleCount = startingVisibleCount;
  for (
    let observation = 0;
    observation < OBSERVATIONS_ALLOWED;
    observation += 1
  ) {
    const fit = fitAtViewport({
      viewportPx,
      measuredIn: configuration,
      labelWidthsPx,
      accountWidthsPx,
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
      fit.isAccountCompact === configuration.isAccountCompact &&
      fit.isTitleDropped === configuration.isTitleDropped &&
      chosen.visibleCount === visibleCount;
    configuration = {
      isWordmarkDrawn: fit.isWordmarkDrawn,
      isSpacingClosed: fit.isSpacingClosed,
      isAccountCompact: fit.isAccountCompact,
      isTitleDropped: fit.isTitleDropped,
    };
    visibleCount = chosen.visibleCount;
    if (isSettled) break;
  }
  return {
    visibleCount,
    isWordmarkDrawn: configuration.isWordmarkDrawn,
    isAccountCompact: configuration.isAccountCompact,
    isTitleDropped: configuration.isTitleDropped,
  };
}

/** A page opened at a width, with nothing behind it — the hook starts at every setting named and
 *  settles on the first observation. */
function onFirstPaintAt(
  labelWidthsPx: readonly number[],
  viewportPx: number,
  accountWidthsPx: AccountControlWidths = VISITOR_LINK_WIDTHS_PX,
): SettledRow {
  return settleAt(
    labelWidthsPx,
    viewportPx,
    labelWidthsPx.length,
    accountWidthsPx,
  );
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
    isSpacingClosed: fitAtViewport({
      viewportPx,
      measuredIn: D2A_AS_DRAWN,
      labelWidthsPx,
    }).isSpacingClosed,
    isAccountCompact: settled.isAccountCompact,
    isTitleDropped: settled.isTitleDropped,
  };
  const fit = fitAtViewport({
    viewportPx,
    measuredIn: configuration,
    labelWidthsPx,
  });
  return { ...settled, pillTrackPx: fit.pillTrackPx };
}

const NARROWEST_DESKTOP_PX = 900;
const WIDEST_SWEPT_PX = 1500;

/** Every width at which a page opened one pixel wider names fewer settings than the page beside it, with the
 *  wordmark's arrival named so a failure says its own cause. */
function widthsWhereAWiderPageNamesFewer(
  labelWidthsPx: readonly number[],
  accountWidthsPx: AccountControlWidths = VISITOR_LINK_WIDTHS_PX,
): readonly string[] {
  const lost: string[] = [];
  for (
    let viewportPx = NARROWEST_DESKTOP_PX;
    viewportPx < WIDEST_SWEPT_PX;
    viewportPx += 1
  ) {
    const narrower = onFirstPaintAt(labelWidthsPx, viewportPx, accountWidthsPx);
    const wider = onFirstPaintAt(
      labelWidthsPx,
      viewportPx + 1,
      accountWidthsPx,
    );
    if (wider.visibleCount >= narrower.visibleCount) continue;
    lost.push(
      `${String(viewportPx)} -> ${String(viewportPx + 1)} px: ` +
        `${String(narrower.visibleCount)} names -> ${String(wider.visibleCount)}, ` +
        `wordmark ${narrower.isWordmarkDrawn ? "kept" : "absent"} -> ` +
        `${wider.isWordmarkDrawn ? "drawn" : "absent"}, ` +
        `link ${narrower.isAccountCompact ? "glyph" : "words"} -> ` +
        (wider.isAccountCompact ? "glyph" : "words"),
    );
  }
  return lost;
}

/** The window dragged one pixel wider from a row settled at the narrower width: this carries the count forward, so
 *  the hysteresis is in play. */
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
        `${widened.isWordmarkDrawn ? "drawn" : "absent"}, ` +
        `link ${settled.isAccountCompact ? "glyph" : "words"} -> ` +
        (widened.isAccountCompact ? "glyph" : "words"),
    );
  }
  return lost;
}

/** Non-vacuity for every emptiness assertion, from the rows the sweep produced: a sweep pinned at one rung would
 *  satisfy *"never falls"* without exercising the ladder (ADR 0093). */
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
  /** The tier `top-bar-fit.test.ts` already sweeps, held as the known-good case: if it fails, the sweep is wrong and
   *  not the model. */
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

  /** `Feronerie Blum` is 85.45 px, so its third name costs the pill 106.45 against the wordmark's return at 114.56: the
   *  tier that would break a monotonicity that held only by coincidence. */
  it("holds on the Blum tier", () => {
    const labels = labelsWithHardware(HARDWARE_PX.Blum);

    expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
    expect(widthsWhereAWiderPageNamesFewer(labels)).toEqual([]);
  });

  /** The pill with three settings, the state an undeclared applied material leaves (`describeSettingsPill` drops the
   *  colour entry). The third name is the depth; drawing it also retires the counter, so it costs
   *  `79.92 + 1 + 20 − 14.27 = 86.65` against the wordmark's 114.56. */
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
  /** The general statement, so a tier name authored outside TypeScript (ADR 0062 seam 1) cannot re-open this silently:
   *  only the hardware name varies, across the range `Feronerie {tier}` spans (Blum 85.45, Standard 107.70). */
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
   * The old precondition (the wordmark costs less than the name its return displaces) is arithmetic over three declared
   * widths that no production code can make true; give C is conditioned on the property directly and is monotone
   * whatever the labels measure. This keeps the tier that broke it breaking it: were Blum ever expensive enough to
   * satisfy it, every sweep would pass under a mechanism that had quietly returned to coincidence.
   *
   * It cannot notice a rename: `HARDWARE_PX` holds three measured widths as file-local literals, so a tier renamed in
   * `sample-price-book.ts` leaves them describing labels that no longer exist. Re-measure when a tier's name changes.
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

    // The old precondition, tier by tier: two hold and one does not.
    expect(thirdNameCostOf(HARDWARE_PX.Standard)).toBeGreaterThan(
      wordmarkCostPx,
    );
    expect(thirdNameCostOf(HARDWARE_PX.Hettich)).toBeGreaterThan(
      wordmarkCostPx,
    );
    expect(thirdNameCostOf(HARDWARE_PX.Blum)).toBeLessThan(wordmarkCostPx);
  });

  /**
   * The invariant that replaced it, over every tier and both pill sizes: give C draws the wordmark only where the pill
   * names as many settings with it as without it, so the count is non-decreasing in width by construction. Stated over
   * the whole desktop range, since "the wordmark is free" is a claim about every width.
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

        // The claim in the width model, not in the decision: with the wordmark showing, the track it gave up (its width
        // plus the gap) must not have been enough for one more name. Asked of `widthNeededForVisibleLabels`, the pill's
        // measurement, so it cannot agree with give C's rule by construction.
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
    // Non-vacuity: the wordmark is drawn somewhere in the sweep; a give C that never drew it would pass vacuously.
    expect(widthsWithTheWordmark).toBeGreaterThan(0);
  });
});

describe("the visitor's link beside the wordmark — the order the gives come back in", () => {
  const everyPill = [
    ...Object.values(HARDWARE_PX).map((px) => labelsWithHardware(px)),
    [MATERIAL_PX, HARDWARE_PX.Standard, DEPTH_PX],
  ];
  const NARROWEST_SWEPT_PX = 700;
  const WIDEST_SWEPT_LINK_PX = 1700;

  /** The wordmark stays out wherever the row without it, and without the link's words, would name another setting. */
  it("does not keep the wordmark where the row without it and without the link's words names more", () => {
    const labels = labelsWithHardware(HARDWARE_PX.Standard);
    const dearer: string[] = [];
    for (
      let viewportPx = NARROWEST_SWEPT_PX;
      viewportPx <= WIDEST_SWEPT_LINK_PX;
      viewportPx += 1
    ) {
      const settled = settledFitAt(labels, viewportPx);
      const everythingSpentPx =
        settled.pillTrackPx +
        (settled.isWordmarkDrawn
          ? WORDMARK_PX + FRAME_2A_SPACING.navGapPx
          : 0) +
        (settled.isAccountCompact
          ? 0
          : VISITOR_LINK_WIDTHS_PX.textPx - VISITOR_LINK_WIDTHS_PX.iconPx);
      const bestCount = [1, 2, 3, 4].filter(
        (names) =>
          widthNeededForVisibleLabels(names, labels, DESKTOP_PILL) <=
          everythingSpentPx,
      ).length;
      if (settled.visibleCount < Math.max(1, bestCount))
        dearer.push(
          `${String(viewportPx)} px: ${String(settled.visibleCount)} names where ${String(bestCount)} fit`,
        );
    }

    expect(dearer).toEqual([]);
  });

  it("changes the link's form once as the window widens, on every pill the application can draw", () => {
    const flipsByPill = everyPill.map((labels) => {
      const flips: number[] = [];
      let previous: boolean | undefined;
      for (
        let viewportPx = NARROWEST_SWEPT_PX;
        viewportPx <= WIDEST_SWEPT_LINK_PX;
        viewportPx += 1
      ) {
        const { isAccountCompact } = onFirstPaintAt(labels, viewportPx);
        if (previous !== undefined && isAccountCompact !== previous)
          flips.push(viewportPx);
        previous = isAccountCompact;
      }
      return flips.length;
    });

    expect(flipsByPill).toEqual(everyPill.map(() => 1));
  });

  it.each([
    ["the Romanian visitor's link", VISITOR_LINK_WIDTHS_PX],
    ["the Russian visitor's link", RUSSIAN_VISITOR_LINK_WIDTHS_PX],
    ["a signed-in control, which has no words to give", SIGNED_IN_WIDTHS_PX],
  ] as const)(
    "never names fewer settings at a wider window, with %s",
    (_name, accountWidthsPx) => {
      for (const labels of everyPill) {
        expect(countsReachedAcrossTheSweep(labels).length).toBeGreaterThan(1);
        expect(
          widthsWhereAWiderPageNamesFewer(labels, accountWidthsPx),
        ).toEqual([]);
      }
    },
  );

  propertyTest.prop([fc.double({ min: 45, max: 220, noNaN: true })])(
    "names no fewer settings at a wider window, whatever the link's words measure",
    (textPx) => {
      expect(
        widthsWhereAWiderPageNamesFewer(
          labelsWithHardware(HARDWARE_PX.Standard),
          { textPx, iconPx: VISITOR_LINK_WIDTHS_PX.iconPx },
        ),
      ).toEqual([]);
    },
  );

  /** Symmetric to the wordmark's: the words stay only where the glyph's room would not have named one more setting. */
  it("never draws the link's words at a width where the glyph would have named another setting", () => {
    const costly: string[] = [];
    let widthsWithTheWords = 0;
    let widthsWithTheGlyph = 0;
    for (const labels of everyPill) {
      for (
        let viewportPx = NARROWEST_SWEPT_PX;
        viewportPx <= WIDEST_SWEPT_LINK_PX;
        viewportPx += 1
      ) {
        const settled = settledFitAt(labels, viewportPx);
        if (settled.isAccountCompact) {
          widthsWithTheGlyph += 1;
          continue;
        }
        widthsWithTheWords += 1;

        const oneMore = settled.visibleCount + 1;
        const trackWithTheGlyphPx =
          settled.pillTrackPx +
          VISITOR_LINK_WIDTHS_PX.textPx -
          VISITOR_LINK_WIDTHS_PX.iconPx;
        if (
          oneMore <= labels.length &&
          widthNeededForVisibleLabels(oneMore, labels, DESKTOP_PILL) <=
            trackWithTheGlyphPx
        )
          costly.push(
            `${String(viewportPx)} px: names ${String(settled.visibleCount)} with the words where ${String(oneMore)} would fit with the glyph`,
          );
      }
    }

    expect(costly).toEqual([]);
    // A floor per arm: a sweep that only reached one of the two forms certifies nothing about the other.
    expect(widthsWithTheWords).toBeGreaterThan(500);
    expect(widthsWithTheGlyph).toBeGreaterThan(100);
  });
});
