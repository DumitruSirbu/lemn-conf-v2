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
