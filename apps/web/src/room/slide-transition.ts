// The Preview pop-up's slide arithmetic, pure so that every input (a button, an arrow key, a swipe) goes through the
// same two functions. ADR 0003 decision 4b (amended): the ends do not wrap.

/** One slide back, none (a swipe that was too short or cancelled), or one slide on. */
export type SlideStep = -1 | 0 | 1;

/** How far a finger must travel sideways before a swipe counts, in CSS pixels: about a thumb's width. */
export const SWIPE_THRESHOLD_PX = 48;

/** Where the index goes after `step`: one slide, never past either end and never wrapping. */
export function slideTransition({
  index,
  count,
  step,
}: {
  readonly index: number;
  readonly count: number;
  readonly step: SlideStep;
}): number {
  const lastIndex = count - 1;
  return Math.min(Math.max(index + step, 0), Math.max(lastIndex, 0));
}

/**
 * What a finger's travel from touch-down to release asks for. Dragging the slide to the left brings the next one, as
 * a page turns. A drag that is mostly vertical is a scroll and asks for nothing.
 */
export function stepOfSwipe({
  deltaX,
  deltaY,
}: {
  readonly deltaX: number;
  readonly deltaY: number;
}): SlideStep {
  const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
  if (!isHorizontal || Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return 0;
  return deltaX < 0 ? 1 : -1;
}
