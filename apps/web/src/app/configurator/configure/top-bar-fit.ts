// What the top bar gives up as the window narrows, decided from the same measurement the pill's own
// ladder is decided from — ADR 0104 decision 8, and **no width threshold anywhere** (decision 9).
//
// The order is ruled and it is not this module's to choose:
//
// - **A** the pill's ladder (`settings/settings-pill-fit.ts`), which does all the work it can;
// - **B** the row's gaps close, frame D2A's `28`/`14` to frame 2A's `9`/`6` — space only, and both
//   numbers are the reference's;
// - **C** the wordmark leaves the row, **ruled by the owner on 2026-09-09**, and it buys the setting
//   names their readability rather than preventing an overflow: with the wordmark kept the row still
//   fits at 900 px, at rung 4, with about 17 px left for the label — which is `P…` and not a name.
//   The owner ruled the width it comes back at twice: first where **one** whole name fits beside it,
//   then — shown that this makes the label count fall as the window widens — where **two** do. See
//   `SETTINGS_THE_WORDMARK_WAITS_FOR`.
//
// **Both decisions are comparisons against measured widths, never constants.** The one number this
// module composes — what closing the gaps returns to the pill — is derived from the two frames' own
// gap declarations and the number of gaps the row draws, so it moves when they do.
import {
  widthNeededForVisibleLabels,
  type SettingsPillFixedWidths,
} from "@/settings/settings-pill-fit";

/** Frame D2A's own spacing: `gap: 28px` on the band, `gap: 14px` inside the right-hand group. */
export const D2A_SPACING = { navGapPx: 28, rowGapPx: 14 } as const;

/** Frame 2A's, taken on desktop as give B. Both numbers are the reference's; neither is chosen. */
export const FRAME_2A_SPACING = { navGapPx: 9, rowGapPx: 6 } as const;

export interface TopBarSpacing {
  readonly navGapPx: number;
  readonly rowGapPx: number;
}

/**
 * How many of each gap stand between the row's fixed items and the pill's track.
 *
 * **These are read off `configure.module.css`'s desktop grid and are asserted against it** by
 * `top-bar-box.test.ts`, so the arithmetic here cannot drift from the row it is about:
 *
 * - `navGaps` — the nav's two internal gaps (wordmark|step, step|title) plus the one between the nav
 *   and the pill, which the settings item's own margin makes up to the nav's gap.
 * - `rowGaps` — the three 28 px dividers, each taking the row's `column-gap` on either side.
 */
const NAV_GAP_COUNT = 3;
const ROW_GAP_COUNT = 6;

export interface TopBarFitInput {
  /** The settings item's own track, measured — the row's residue on desktop. */
  readonly pillTrackPx: number;
  /** The wordmark's whole width, measured in its own typography and keyed on its string. */
  readonly wordmarkWidthPx: number;
  /** **The configuration the measurement was taken in.** The track reacts to both gives, so undoing
   *  them is what recovers the one quantity that does not: the row's residue as frame D2A draws it. */
  readonly measuredIn: TopBarConfiguration;
  readonly labelWidthsPx: readonly number[];
  readonly fixedWidthsPx: SettingsPillFixedWidths;
}

export interface TopBarConfiguration {
  readonly isWordmarkDrawn: boolean;
  readonly isSpacingClosed: boolean;
}

export interface TopBarFit extends TopBarConfiguration {
  readonly spacing: TopBarSpacing;
  /** The track the pill will have once this configuration is drawn, so the ladder and the row settle
   *  on **one** observation rather than chasing each other across frames. */
  readonly pillTrackPx: number;
}

/**
 * The row's configuration, as a value.
 *
 * **It is a fixed point rather than a step**, and that is what keeps it from oscillating: the two
 * gives are undone to recover the reference residue, both decisions are taken against that, and the
 * track the caller hands the ladder is the one the chosen configuration will produce. Measured again
 * in the new configuration, this function answers exactly the same thing.
 */
export function describeTopBarFit(input: TopBarFitInput): TopBarFit {
  const referenceTrackPx = withoutTheGives(input);
  const atEveryLabel = widthNeededForVisibleLabels(
    input.labelWidthsPx.length,
    input.labelWidthsPx,
    input.fixedWidthsPx,
  );

  // Give B: D2A's own spacing for as long as the pill can still name every setting inside it.
  const isSpacingClosed = referenceTrackPx < atEveryLabel;
  const trackWithWordmark =
    referenceTrackPx + (isSpacingClosed ? gapSavingsPx() : 0);
  const isWordmarkDrawn = trackWithWordmark >= trackTheWordmarkWaitsFor(input);
  const spacing = isSpacingClosed ? FRAME_2A_SPACING : D2A_SPACING;
  return {
    isWordmarkDrawn,
    isSpacingClosed,
    spacing,
    pillTrackPx:
      trackWithWordmark +
      (isWordmarkDrawn ? 0 : wordmarkCostPx(input.wordmarkWidthPx, spacing)),
  };
}

/**
 * **Give C's width, and it is a derived quantity rather than a number** — the owner ruled the shape,
 * not the pixel: the wordmark comes back at the width where it fits **beside two setting names**.
 *
 * They were first given the one-whole-label width (940.38 px measured here) and then shown what it
 * costs: crossing it while widening, the wordmark returns and takes a name back off the pill, so the
 * visible label count *falls* as the window grows. They chose to have the artefact away — the
 * wordmark stays absent over a further stretch, and the label count is monotone in width across the
 * whole desktop range.
 *
 * `SETTINGS_THE_WORDMARK_WAITS_FOR` is the ruling in one place: change it and the width moves with
 * the type, the tier names and the frames' own gaps, because everything it is composed from is
 * measured. It is bounded by what the pill has, so a design with fewer settings than that still
 * gets its wordmark back.
 */
const SETTINGS_THE_WORDMARK_WAITS_FOR = 2;

function trackTheWordmarkWaitsFor(input: TopBarFitInput): number {
  return widthNeededForVisibleLabels(
    Math.min(SETTINGS_THE_WORDMARK_WAITS_FOR, input.labelWidthsPx.length),
    input.labelWidthsPx,
    input.fixedWidthsPx,
  );
}

/** The residue frame D2A itself leaves the pill: the measurement with both gives undone, in the
 *  order they were spent — the wordmark at the spacing it was dropped under, then the gaps. */
function withoutTheGives(input: TopBarFitInput): number {
  const spacing = input.measuredIn.isSpacingClosed
    ? FRAME_2A_SPACING
    : D2A_SPACING;
  const withWordmark =
    input.pillTrackPx -
    (input.measuredIn.isWordmarkDrawn
      ? 0
      : wordmarkCostPx(input.wordmarkWidthPx, spacing));
  return withWordmark - (input.measuredIn.isSpacingClosed ? gapSavingsPx() : 0);
}

/** What give B returns to the pill, composed from the two frames' own gap declarations and the
 *  number of gaps the row draws. Never a literal: a re-spaced row moves it. */
function gapSavingsPx(): number {
  return (
    NAV_GAP_COUNT * (D2A_SPACING.navGapPx - FRAME_2A_SPACING.navGapPx) +
    ROW_GAP_COUNT * (D2A_SPACING.rowGapPx - FRAME_2A_SPACING.rowGapPx)
  );
}

/** What give C returns: the wordmark's own width and the gap that stood beside it. */
function wordmarkCostPx(
  wordmarkWidthPx: number,
  spacing: TopBarSpacing,
): number {
  return wordmarkWidthPx + spacing.navGapPx;
}
