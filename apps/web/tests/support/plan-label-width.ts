// How wide a wall's length label is set, as a browser measured it — the one figure the plan's label
// tests take from outside `plan-preview-model.ts`, so they cannot agree with the bound that file
// places labels by.
//
// *"C · 1200 mm"*, at `700 11px Helvetica` with tabular digits in Chromium, measured 2026-09-22 per
// digit count in ro and ru and the wider kept: 45.9 px at one digit, then 6.12 px per digit — 64.2 at
// four, 82.6 at seven (`qa-7f2-s2-red-wall.adversarial.test.ts`, round 2). Width scales linearly with
// the font size, and the desktop set's 14 px line is scaled from these figures rather than measured.
const MEASURED_AT_PX = 11;
const BASE_PX = 39.75;
const PX_PER_DIGIT = 6.12;

export function measuredLabelWidthPx(
  millimetres: number,
  fontPx: number,
): number {
  const atMeasuredSize = BASE_PX + PX_PER_DIGIT * String(millimetres).length;
  return Math.ceil((atMeasuredSize * fontPx) / MEASURED_AT_PX);
}

/**
 * **Frame 1C's marked label**, *"B prea scurt"* in ro and *"B слишком короткая"* in ru, in place of the
 * length (`markPlanWalls`). Measured by QA on 2026-09-30 in Chromium with `measureText` at the label's
 * computed font, `700 11px Helvetica, Arial, sans-serif` with tabular digits (`room-plan-label-B` at
 * 390 x 844); the length label measured 64.20 px in the same run, the figure above, which ties the two.
 * The ru reason is 52 px wider than the length label at the phone.
 */
const MARKED_AT_MEASURED_PX = {
  ro: { tooShort: 64.19, tooLong: 60.51 },
  ru: { tooShort: 116.59, tooLong: 111.84 },
} as const;

export type MarkedLabelLocale = keyof typeof MARKED_AT_MEASURED_PX;
export type MarkedLabelReason = keyof (typeof MARKED_AT_MEASURED_PX)["ro"];

export function measuredMarkedLabelWidthPx(
  locale: MarkedLabelLocale,
  reason: MarkedLabelReason,
  fontPx: number,
): number {
  return Math.ceil(
    (MARKED_AT_MEASURED_PX[locale][reason] * fontPx) / MEASURED_AT_PX,
  );
}
