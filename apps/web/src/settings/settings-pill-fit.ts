// How many of the pill's settings are named and how many are counted — the owner's ruling of
// 2026-09-09, as a value.
//
// > *"keep labels full width, need just ot calculate the remaining space and decide, how many global
// > setting fit tyo be show and display with separation like in dektop header, and if one or multiple
// > not fit, count those that not fit and add that count after `+`"*
//
// **A pure function over measured widths, in the shape `describeChipAvailability` uses**
// (`panel/panel-model.ts`), so the rung the pill is on can be pinned as a value without a browser.
// No component decides it and no markup encodes it (ADR 0104 decision 3).
//
// **Rungs 1 to 3 are a count and rung 4 is a width, and the two must not be confused.** `flex`
// shrinks a box; it does not choose how many children to render. So this module decides *how many
// labels are drawn* and nothing else — the last label's ellipsis is the mockups' own
// `min-width: 0; overflow: hidden; text-overflow: ellipsis` and is performed by CSS.
//
// **No pixel constant is declared here.** Every width arrives measured, and the hysteresis margin is
// composed from the pill's own separator and gap (ADR 0104 decision 9).

/** The widths the pill spends whatever it names, all measured in the pill's own typography. */
export interface SettingsPillFixedWidths {
  /** The pill's horizontal padding and border, drawn at every rung. */
  readonly framePx: number;
  /** Frame D2A's swatch, which never gives way — it is drawn at rung 4 as well. */
  readonly swatchPx: number;
  /** D2A's `│`, drawn **between labels only**: a two-label pill draws one. */
  readonly separatorPx: number;
  /** `+N`, at the widest `N` the settings can produce — see `chooseVisibleSettingLabels`. */
  readonly counterPx: number;
  /** The disclosure caret. **Zero where the shell's frame draws none**: frame 2A draws no caret on
   *  the mobile chip, and the chip is still the trigger. */
  readonly caretPx: number;
  /** The gap between two of the pill's children, D2A's `gap: 10px`. */
  readonly gapPx: number;
}

export interface SettingsPillFitInput {
  /** The pill's own track, measured. */
  readonly availableWidthPx: number;
  /** Each setting's **whole** label width, in the order the settings are named. */
  readonly labelWidthsPx: readonly number[];
  readonly fixedWidthsPx: SettingsPillFixedWidths;
  /** What the pill last showed, or `undefined` before the first measurement. Present, it engages the
   *  hysteresis below, so a width sitting on a boundary cannot flicker. */
  readonly previousVisibleCount?: number | undefined;
}

/** How many settings the pill names and how many it counts. The two always sum to the settings the
 *  design has. */
export interface SettingsPillFit {
  readonly visibleCount: number;
  readonly hiddenCount: number;
}

/** Thrown rather than answered, because there is no honest answer: the floor of the ladder is *one
 *  label and a counter*, so a pill with nothing to name is a caller that should not have drawn one
 *  (ADR 0104 decision 3 — "never a bare `+3`"). */
export class EmptySettingsPillError extends Error {
  constructor() {
    super("a settings pill names at least one setting; none was given");
    this.name = "EmptySettingsPillError";
  }
}

/**
 * The ladder, in one comparison per rung.
 *
 * **The floor is one label, never zero** — the owner's *"`Pal melaminat + 2` => `Pal mela.. + 2`"*.
 * Below the width one whole label needs, the count stops falling and the label ellipsises instead.
 *
 * **A label is hidden only when there is no room for it**, which is why the largest fitting count is
 * taken rather than the first that fails: adding the last label also *removes* the counter, so the
 * widths are not monotone in the count and a first-failure scan would hide a label that fits.
 *
 * **Hysteresis, and its margin is the pill's own separator and gap.** Showing one more label needs
 * the room for that label plus what separates it; hiding one needs the room to fall below the label
 * alone. The two thresholds differ by exactly that margin, so a width on the boundary cannot
 * oscillate, and no pixel constant is introduced to achieve it.
 */
export function chooseVisibleSettingLabels(
  input: SettingsPillFitInput,
): SettingsPillFit {
  const settingsCount = input.labelWidthsPx.length;
  if (settingsCount === 0) throw new EmptySettingsPillError();

  const fitsWithRoomToSpare = (count: number): boolean =>
    widthNeededForVisibleLabels(
      count,
      input.labelWidthsPx,
      input.fixedWidthsPx,
    ) +
      hysteresisMarginOf(input.fixedWidthsPx) <=
    input.availableWidthPx;

  const fitting = visibleCountThatFitsWithin(input);
  const previous = input.previousVisibleCount;
  if (previous === undefined || previous >= fitting) {
    return toFit(
      previous === undefined ? fitting : Math.min(previous, fitting),
      settingsCount,
    );
  }
  // Growing costs the extra label its separator and gap on top of its own width, so a window widened
  // to exactly the boundary keeps what it is showing until there is room to spare.
  const growing = largestCountSatisfying(settingsCount, fitsWithRoomToSpare);
  return toFit(Math.max(previous, growing), settingsCount);
}

/**
 * **How many settings a track of this width can name**, with no hysteresis and no memory — the rung
 * a pill would settle on if it were being drawn for the first time at this width.
 *
 * Exported and named because it has **two** readers and one definition is what keeps them agreeing:
 * `chooseVisibleSettingLabels` above takes it as the shrink branch's answer, and `top-bar-fit.ts`
 * asks it twice — once for the track with the wordmark and once for the track without — to decide
 * whether the wordmark's return would cost a name. Two copies of *"the largest count that fits"* is
 * how the row and the pill come to disagree about the same width.
 */
export function visibleCountThatFitsWithin(
  input: SettingsPillFitInput,
): number {
  return largestCountSatisfying(
    input.labelWidthsPx.length,
    (count) =>
      widthNeededForVisibleLabels(
        count,
        input.labelWidthsPx,
        input.fixedWidthsPx,
      ) <= input.availableWidthPx,
  );
}

/**
 * What the pill measures when it names `visibleCount` of `labelWidthsPx.length` settings.
 *
 * Exported because the row above the pill needs it too: which rung the pill can reach is what
 * decides whether the wordmark is drawn (`configure/top-bar-fit.ts`).
 */
export function widthNeededForVisibleLabels(
  visibleCount: number,
  labelWidthsPx: readonly number[],
  fixed: SettingsPillFixedWidths,
): number {
  const drawn = drawnLabelsIn(visibleCount, labelWidthsPx);
  const hiddenCount = labelWidthsPx.length - visibleCount;
  const labels = drawn.reduce((total, width) => total + width, 0);
  const separators = Math.max(drawn.length - 1, 0) * fixed.separatorPx;
  const counter = hiddenCount > 0 ? fixed.counterPx : 0;
  const gaps =
    (childCountOf(drawn.length, hiddenCount, fixed) - 1) * fixed.gapPx;
  return (
    fixed.framePx +
    fixed.swatchPx +
    labels +
    separators +
    counter +
    fixed.caretPx +
    gaps
  );
}

/**
 * The labels a rung actually draws — **a setting with no text of its own draws none**.
 *
 * The kitchen's colour is one when a free MDF colour is chosen: it has no name, so the owner ruled
 * (2026-09-09) that the swatch wears it and nothing is written. It is still a *shown* setting, so it
 * is not counted after the `+`; it simply costs the pill no label, no separator and no gap. A model
 * that spent a separator on it would put a `│` around nothing.
 */
function drawnLabelsIn(
  visibleCount: number,
  labelWidthsPx: readonly number[],
): readonly number[] {
  return labelWidthsPx.slice(0, visibleCount).filter((width) => width > 0);
}

/** The margin that keeps a boundary width from oscillating: **the separator and the gap the extra
 *  label would need**, and nothing chosen. */
export function hysteresisMarginOf(fixed: SettingsPillFixedWidths): number {
  return fixed.separatorPx + fixed.gapPx;
}

/** Every child the pill lays out, because D2A's `gap` falls between all of them — the separators
 *  are flex children of the pill, not borders on the labels. Takes the number of labels **drawn**,
 *  which is not the number shown: see `drawnLabelsIn`. */
function childCountOf(
  drawnCount: number,
  hiddenCount: number,
  fixed: SettingsPillFixedWidths,
): number {
  const separators = Math.max(drawnCount - 1, 0);
  const counter = hiddenCount > 0 ? 1 : 0;
  const caret = fixed.caretPx > 0 ? 1 : 0;
  return 1 + drawnCount + separators + counter + caret;
}

function largestCountSatisfying(
  settingsCount: number,
  holds: (count: number) => boolean,
): number {
  let largest = 1;
  for (let count = 2; count <= settingsCount; count += 1) {
    if (holds(count)) largest = count;
  }
  return largest;
}

function toFit(visibleCount: number, settingsCount: number): SettingsPillFit {
  return { visibleCount, hiddenCount: settingsCount - visibleCount };
}
