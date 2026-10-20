// What the top bar gives up as the window narrows, decided from the same measurement the pill's ladder uses
// (ADR 0104 decisions 8 and 9), with no width threshold anywhere. The order is ruled:
// A the pill's ladder (`settings/settings-pill-fit.ts`); B the row's gaps close, frame D2A's 28/14 to frame 2A's 9/6
// (both numbers the reference's); C the wordmark leaves the row; D the visitor's "Intră în cont" becomes its glyph alone
// (the owner's ruling of 2026-10-20, appended after C so the ruled order above is untouched).
// Every decision compares against measured widths, never constants; the one composed number, what closing the gaps
// returns to the pill, is derived from the two frames' gap declarations and the number of gaps drawn.
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
 * How many of each gap stand between the row's fixed items and the pill's track, read off `configure.module.css`'s
 * desktop grid and asserted against it by `top-bar-box.test.ts`. `NAV_GAP_COUNT`: the nav's two internal gaps plus
 * the one between nav and pill (the settings item's margin makes it up to the nav's gap). `ROW_GAP_COUNT`: the
 * four 28 px dividers (price, actions, the account control, locale), each taking the row's `column-gap` on either side.
 *
 * **The account control is one more fixed item of the row.** The pill's track is measured with the control in place,
 * whatever it is showing, so what it costs the ladder is already in `pillTrackPx`. What the measurement cannot carry is
 * how much of the row the gives return: the control's two gaps (its own divider and the padding before it) here, and
 * what compacting the visitor's link returns in `accountWidthsPx`, measured from the two forms of the link.
 *
 * **The count assumes the control is drawn, and errs on the safe side where it is not.** Every session draws it now
 * (staff's menu holds the ways out), so the count is exact; a screen that mounted no control would leave the row with
 * six gaps while this models eight, and give B would be credited 16 px it does not return. The pill is then handed too
 * much track by 16 px and under-fills in that band of widths; it never clips. Do not "fix" it by crediting less than the
 * row returns: that over-fills the pill and clips.
 */
const NAV_GAP_COUNT = 3;
const ROW_GAP_COUNT = 8;

export interface TopBarFitInput {
  /** The settings item's own track, measured — the row's residue on desktop. */
  readonly pillTrackPx: number;
  /** The wordmark's whole width, measured in its own typography and keyed on its string. */
  readonly wordmarkWidthPx: number;
  /** The configuration the measurement was taken in. The track reacts to both gives, so undoing them recovers the
   *  one quantity that does not: the row's residue as frame D2A draws it. */
  readonly measuredIn: TopBarConfiguration;
  readonly labelWidthsPx: readonly number[];
  readonly fixedWidthsPx: SettingsPillFixedWidths;
  /** The account control's two forms as the row would draw them, measured. A signed-in session is the glyph in both,
   *  so the two are equal and the give returns nothing. */
  readonly accountWidthsPx: AccountControlWidths;
}

export interface AccountControlWidths {
  /** The visitor's link with its words: "Intră în cont". */
  readonly textPx: number;
  /** The glyph alone. */
  readonly iconPx: number;
}

export interface TopBarConfiguration {
  readonly isWordmarkDrawn: boolean;
  readonly isSpacingClosed: boolean;
  /** Give D: the visitor's link is its glyph alone. */
  readonly isAccountCompact: boolean;
}

export interface TopBarFit extends TopBarConfiguration {
  readonly spacing: TopBarSpacing;
  /** The track the pill will have once this configuration is drawn, so the ladder and the row settle
   *  on **one** observation rather than chasing each other across frames. */
  readonly pillTrackPx: number;
}

/**
 * The row's configuration, as a fixed point rather than a step: the gives are undone to recover the reference
 * residue, every decision is taken against it, and the track handed to the ladder is the one the chosen
 * configuration will produce. Measured again in that configuration, this function answers the same, so it cannot
 * oscillate.
 */
export function describeTopBarFit(input: TopBarFitInput): TopBarFit {
  const referenceTrackPx = withoutTheGives(input);

  // Give B: D2A's own spacing for as long as the pill can still name every setting inside it.
  const isSpacingClosed = referenceTrackPx < widthNeededForEveryLabel(input);
  const spacing = isSpacingClosed ? FRAME_2A_SPACING : D2A_SPACING;
  const trackWithWordmark =
    referenceTrackPx + (isSpacingClosed ? gapSavingsPx() : 0);

  // The gives come back in the reverse of the order they were spent, each only where it costs the pill no name: the
  // link's words first, on the row with no wordmark in it, then the wordmark, and only once the words are back.
  const wordmarkCostPx = wordmarkCostOf(input.wordmarkWidthPx, spacing);
  const accountReturnedPx = accountCompactingReturnsPx(input.accountWidthsPx);
  const isAccountCompact =
    accountReturnedPx > 0 &&
    !costsNoSettingName({
      input,
      trackWithItPx: trackWithWordmark + wordmarkCostPx,
      returnedIfDroppedPx: accountReturnedPx,
    });
  const isWordmarkDrawn =
    !isAccountCompact &&
    costsNoSettingName({
      input,
      trackWithItPx: trackWithWordmark,
      returnedIfDroppedPx: wordmarkCostPx,
    });
  return {
    isWordmarkDrawn,
    isSpacingClosed,
    isAccountCompact,
    spacing,
    pillTrackPx:
      trackWithWordmark +
      (isWordmarkDrawn ? 0 : wordmarkCostPx) +
      (isAccountCompact ? accountReturnedPx : 0),
  };
}

function widthNeededForEveryLabel(input: TopBarFitInput): number {
  return widthNeededForVisibleLabels(
    input.labelWidthsPx.length,
    input.labelWidthsPx,
    input.fixedWidthsPx,
  );
}

/**
 * Whether keeping a give's item costs the pill no setting name: the wordmark (give C, the owner's ruling, ADR 0104
 * decision 8) and the visitor's link with its words (give D) are both drawn at the first width where they do. A fixed
 * name count cannot carry this: it removes the label count falling as the window widens only while a third name costs
 * more than the item, which fails at the Blum hardware tier and on the three-setting pill an undeclared material
 * leaves. So the condition is the property itself: count what the track buys with and without the item and keep it
 * only when they are equal. The count the pill settles on is then always the one the wider track buys,
 * non-decreasing in width whatever the labels measure.
 *
 * Give C depends on give B: without the wordmark the track drops by 86 px where the gaps close (`reference + 105 +
 * wordmark + 9` below, `reference + wordmark + 28` above). That is harmless only because `isSpacingClosed` means
 * every label fits, so the count is pinned at the whole ladder across the boundary; loosening that threshold below
 * "every name fits" would make the count fall with width without changing this function.
 *
 * **The gives return as a chain, and the order of the tests is what keeps the count monotone.** Each test compares
 * two tracks that differ by that give alone, and a give is tested only on the row where the gives spent after it are
 * still spent. Then every give that is back cost no name, so the count the pill settles on is the one the row with
 * everything spent buys: a function of the width alone. Testing the wordmark with the link's words assumed, then the
 * words afterwards, keeps the wordmark where dropping both would have named a setting more (measured: one name fewer
 * at the width where the wordmark came back).
 */
function costsNoSettingName(query: {
  readonly input: TopBarFitInput;
  readonly trackWithItPx: number;
  readonly returnedIfDroppedPx: number;
}): boolean {
  const namesAt = (availableWidthPx: number): number =>
    visibleCountThatFitsWithin({
      availableWidthPx,
      labelWidthsPx: query.input.labelWidthsPx,
      fixedWidthsPx: query.input.fixedWidthsPx,
    });
  return (
    oneWholeNameFitsBesideIt(query.input, query.trackWithItPx) &&
    namesAt(query.trackWithItPx) >=
      namesAt(query.trackWithItPx + query.returnedIfDroppedPx)
  );
}

/**
 * The owner's first ruling, kept as give C's floor (and give D's): the wordmark comes back only where at least one
 * setting name fits beside it whole. Not redundant beside the cost comparison: the ladder floors at one label and ellipsises
 * below it (`settings-pill-fit.ts`), so at 900 px the comparison alone would draw the wordmark although the name
 * beside it is `P…`. Neither condition breaks monotonicity: below this floor the wordmark is absent, above it the
 * count is the one the wider track buys.
 */
function oneWholeNameFitsBesideIt(
  input: TopBarFitInput,
  trackWithItPx: number,
): boolean {
  return (
    trackWithItPx >=
    widthNeededForVisibleLabels(1, input.labelWidthsPx, input.fixedWidthsPx)
  );
}

/** The residue frame D2A itself leaves the pill: the measurement with every give undone, in the order they were
 *  spent in reverse — the link's words, the wordmark at the spacing it was dropped under, then the gaps. */
function withoutTheGives(input: TopBarFitInput): number {
  const spacing = input.measuredIn.isSpacingClosed
    ? FRAME_2A_SPACING
    : D2A_SPACING;
  const withAccountText =
    input.pillTrackPx -
    (input.measuredIn.isAccountCompact
      ? accountCompactingReturnsPx(input.accountWidthsPx)
      : 0);
  const withWordmark =
    withAccountText -
    (input.measuredIn.isWordmarkDrawn
      ? 0
      : wordmarkCostOf(input.wordmarkWidthPx, spacing));
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
function wordmarkCostOf(
  wordmarkWidthPx: number,
  spacing: TopBarSpacing,
): number {
  return wordmarkWidthPx + spacing.navGapPx;
}

/** What give D returns: the link's words, measured. Never negative: a form no wider than the glyph has nothing to give. */
function accountCompactingReturnsPx(widths: AccountControlWidths): number {
  return Math.max(0, widths.textPx - widths.iconPx);
}
