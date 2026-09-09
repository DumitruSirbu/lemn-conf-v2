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
  visibleCountThatFitsWithin,
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
  const spacing = isSpacingClosed ? FRAME_2A_SPACING : D2A_SPACING;
  const isWordmarkDrawn = theWordmarkCostsNoName({
    input,
    trackWithWordmark,
    spacing,
  });
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
 * **Give C's width, and it is the property the owner ruled rather than a count of names.** The
 * wordmark comes back at the first width where drawing it **costs the pill no setting name**.
 *
 * The owner ruled this twice. First the wordmark returned where **one** whole name fitted beside it;
 * shown that crossing that width while widening takes a name back off the pill — the label count
 * *falling* as the window grows — they chose to have the artefact away. The wave expressed that
 * second ruling as `SETTINGS_THE_WORDMARK_WAITS_FOR = 2`, a count.
 *
 * **A count cannot carry it, and adversarial QA measured where it fails** (2026-09-09,
 * `qa-0104-the-label-count-is-monotone.adversarial.test.ts`). Waiting for two names removes the
 * artefact only while a *third* name costs the pill more than the wordmark does, and nothing
 * enforced that comparison — it held at the seeded design's hardware tier and at one other, and
 * broke at the third the price book ships:
 *
 * | tier     | a third name | the wordmark | monotone        |
 * | -------- | ------------ | ------------ | --------------- |
 * | Standard | 128.70       | 114.56       | yes             |
 * | Hettich  | 116.88       | 114.56       | yes, by 2.32 px |
 * | Blum     | 106.45       | 114.56       | **no**          |
 *
 * On Blum, 1033 px named three settings and 1034 named two. It also broke at **every** tier on the
 * three-setting pill an undeclared material leaves, because drawing that third name also retires the
 * counter and so costs only 86.65. A number that clears two of three tiers by 2.32 px is a
 * coincidence, and the next tier the book gains would have re-opened it silently.
 *
 * **So the condition is the property itself**, asked of the widths in hand: count what the track
 * buys with the wordmark and what it buys without, and draw the wordmark only when the two are the
 * same. It cannot be tuned, it has no threshold in it, and it is monotone **by construction** rather
 * than by arithmetic that happens to work out — the count the pill settles on is always the count
 * the wider of the two tracks buys, which is non-decreasing in width whatever the labels measure.
 *
 * What it costs is the stretch the wordmark stays away for, which is the trade the owner already
 * accepted in moving from one name to two; this extends it exactly as far as each design's own type
 * requires and no further. The wordmark always returns: at the width where every name fits beside
 * it, the two counts are both the whole ladder.
 */
function theWordmarkCostsNoName(query: {
  readonly input: TopBarFitInput;
  readonly trackWithWordmark: number;
  readonly spacing: TopBarSpacing;
}): boolean {
  const namesAt = (availableWidthPx: number): number =>
    visibleCountThatFitsWithin({
      availableWidthPx,
      labelWidthsPx: query.input.labelWidthsPx,
      fixedWidthsPx: query.input.fixedWidthsPx,
    });
  const withoutIt =
    query.trackWithWordmark +
    wordmarkCostPx(query.input.wordmarkWidthPx, query.spacing);
  return (
    oneWholeNameFitsBesideIt(query.input, query.trackWithWordmark) &&
    namesAt(query.trackWithWordmark) >= namesAt(withoutIt)
  );
}

/**
 * **The owner's *first* ruling, kept as give C's floor.** The wordmark comes back only where at
 * least one setting name fits beside it whole.
 *
 * It is not redundant beside the cost comparison above, and 900 px is where that shows. The pill's
 * ladder floors at one label and ellipsises below it (`settings-pill-fit.ts`: *"the floor is one
 * label, never zero"*), so at 900 the row names one setting with the wordmark and one without —
 * the wordmark costs no *name* and the comparison alone would draw it. What it costs there is the
 * name's **readability**, which is give C's whole purpose: with the wordmark kept the row fits at
 * 900 at rung 4 with about 17 px left for the label, and 17 px is `P…`.
 *
 * So the two rulings are two conditions and both hold. The first was never wrong — it was
 * insufficient, which is why the owner was shown the second. Neither breaks monotonicity: below this
 * floor the wordmark is absent, and above it the count is the one the wider track buys either way.
 */
function oneWholeNameFitsBesideIt(
  input: TopBarFitInput,
  trackWithWordmark: number,
): boolean {
  return (
    trackWithWordmark >=
    widthNeededForVisibleLabels(1, input.labelWidthsPx, input.fixedWidthsPx)
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
