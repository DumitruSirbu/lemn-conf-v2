// The desktop top bar as Chromium measured it in this application, for the two suites that turn a viewport width into
// the pill's track: `top-bar-fit.test.ts` and `qa-0104-the-label-count-is-monotone.adversarial.test.ts`. One module, so
// the two cannot describe different rows. The figures are `viewport - the settings track` at a width where each
// configuration is on screen (Romanian, a visitor's link, the seeded design), not the mockup's.
import {
  D2A_SPACING,
  describeTopBarFit,
  FRAME_2A_SPACING,
  type AccountControlWidths,
  type TopBarConfiguration,
} from "@/app/configurator/configure/top-bar-fit";
import type { SettingsPillFixedWidths } from "@/settings/settings-pill-fit";

/** Frame D2A's pill, measured in the application — the same declarations `settings-pill-fit.test.ts` reads. */
export const DESKTOP_PILL: SettingsPillFixedWidths = {
  framePx: 30,
  swatchPx: 16,
  separatorPx: 1,
  counterPx: 14.27,
  caretPx: 7.03,
  gapPx: 10,
};

/** `PAL melaminat │ Alb │ Feronerie Standard │ Adâncime 600`, measured; the colour carries no category word. */
export const SEEDED_LABELS = [83.39, 18.08, 107.7, 79.92];

/** `Lemnaria` at `700 15px/1` with `letter-spacing: .22em`, measured on the wordmark's hidden probe. */
export const WORDMARK_PX = 105.56;

/** `Configurare` at `700 15px/1`, measured on the title's hidden probe: it is also the width the nav gave it in the
 *  rows below. */
export const TITLE_PX = 105.59;

/** The visitor's link in its two forms, measured on the control's hidden probes: the words with their 16 px of padding
 *  and 1 px borders on each side, and the 44 px glyph box. */
export const VISITOR_LINK_WIDTHS_PX: AccountControlWidths = {
  textPx: 114.13,
  iconPx: 44,
};

/** The Russian visitor's link, measured the same way: *Войти* is shorter, so compacting returns less. */
export const RUSSIAN_VISITOR_LINK_WIDTHS_PX: AccountControlWidths = {
  textPx: 76.78,
  iconPx: 44,
};

/** A signed-in person's control is the glyph in both forms, so choosing between them returns nothing. */
export const SIGNED_IN_WIDTHS_PX: AccountControlWidths = {
  textPx: 44,
  iconPx: 44,
};

/**
 * What the row's fixed contents cost, leaving the rest of the viewport to the pill's track, measured at 1920 (as
 * drawn), 1440 (gaps closed) and 1300 (wordmark gone as well) with the visitor's link showing. The price column carries
 * frame D2A's inline "de la 101 000 MDL". The differences between configurations match the frames' own gaps and the
 * wordmark exactly.
 */
export const DEMAND_PX = {
  /** Frame D2A as drawn: gaps `28`/`14`, the wordmark in the row, the link with its words. */
  asDrawn: 1081.69,
  /** Give B spent: gaps closed to frame 2A's `9`/`6`. */
  gapsClosed: 960.69,
  /** Gives B and C spent: the wordmark gone as well, derived from the line above so the two agree to the last bit. */
  gapsClosedWithoutWordmark: 960.69 - (WORDMARK_PX + FRAME_2A_SPACING.navGapPx),
};

/** What the browser reported for the configurations derived above, held beside the derivations so they cannot drift
 *  away from the row they describe: gives B and C spent at 1300, and gives B, C and D spent at 1000. */
export const MEASURED_WITHOUT_WORDMARK_PX = 846.13;
export const MEASURED_WITHOUT_WORDMARK_COMPACT_PX = 776;

/** What dropping the title returned, measured at 900 (title dropped, otherwise as at 1000 with the glyph) against the
 *  row with the title in it at the same spacing. */
export const MEASURED_TITLE_RETURNED_PX = 114.59;

/** Every configuration the row can be drawn in. */
export const EVERY_CONFIGURATION: readonly TopBarConfiguration[] = [false, true]
  .flatMap((isWordmarkDrawn) =>
    [false, true].map((isSpacingClosed) => ({
      isWordmarkDrawn,
      isSpacingClosed,
    })),
  )
  .flatMap((configuration) =>
    [false, true].map((isAccountCompact) => ({
      ...configuration,
      isAccountCompact,
    })),
  )
  .flatMap((configuration) =>
    [false, true].map((isTitleDropped) => ({
      ...configuration,
      isTitleDropped,
    })),
  );

/** Frame D2A as drawn: the configuration the hook starts in. */
export const D2A_AS_DRAWN: TopBarConfiguration = {
  isWordmarkDrawn: true,
  isSpacingClosed: false,
  isAccountCompact: false,
  isTitleDropped: false,
};

/**
 * The row's fixed contents in a configuration, for a control whose forms measure `widths`. The figures above were taken
 * with the Romanian visitor's link, so another control moves them by the difference of its words from that link's, and
 * a compact row draws the glyph in place of the words. A signed-in control measures alike in both forms.
 */
export function demandOf(
  configuration: TopBarConfiguration,
  widths: AccountControlWidths = VISITOR_LINK_WIDTHS_PX,
): number {
  const withTheWordmark = configuration.isSpacingClosed
    ? DEMAND_PX.gapsClosed
    : DEMAND_PX.asDrawn;
  const withTheWordmarkGone = configuration.isSpacingClosed
    ? DEMAND_PX.gapsClosedWithoutWordmark
    : DEMAND_PX.asDrawn - (WORDMARK_PX + D2A_SPACING.navGapPx);
  const controlPx = configuration.isAccountCompact
    ? widths.iconPx
    : widths.textPx;
  const navGapPx = configuration.isSpacingClosed
    ? FRAME_2A_SPACING.navGapPx
    : D2A_SPACING.navGapPx;
  const titleGoneSavingPx = configuration.isTitleDropped
    ? TITLE_PX + navGapPx
    : 0;
  return (
    (configuration.isWordmarkDrawn ? withTheWordmark : withTheWordmarkGone) -
    VISITOR_LINK_WIDTHS_PX.textPx +
    controlPx -
    titleGoneSavingPx
  );
}

/** The model's answer for a row at a viewport, measured in the configuration it is currently drawn in. */
export function fitAtViewport(query: {
  readonly viewportPx: number;
  readonly measuredIn: TopBarConfiguration;
  readonly labelWidthsPx: readonly number[];
  readonly accountWidthsPx?: AccountControlWidths;
}): ReturnType<typeof describeTopBarFit> {
  const accountWidthsPx = query.accountWidthsPx ?? VISITOR_LINK_WIDTHS_PX;
  return describeTopBarFit({
    pillTrackPx: query.viewportPx - demandOf(query.measuredIn, accountWidthsPx),
    wordmarkWidthPx: WORDMARK_PX,
    measuredIn: query.measuredIn,
    labelWidthsPx: query.labelWidthsPx,
    fixedWidthsPx: DESKTOP_PILL,
    accountWidthsPx,
    titleWidthPx: TITLE_PX,
  });
}
