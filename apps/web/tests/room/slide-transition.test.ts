// M8D wave W2, criterion C-10 and C-1: the Preview pop-up's slide arithmetic. Every input of the pop-up (Previous, Next,
// the arrow keys, a swipe) goes through `slideTransition`, so this is where "never wraps, stays in range" is proved
// over a swept sequence rather than a handful of examples; `qa-m8d-preview-popup.adversarial.dom.test.ts` proves the
// wiring of each input to it.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  SWIPE_THRESHOLD_PX,
  slideTransition,
  stepOfSwipe,
  type SlideStep,
} from "@/room/slide-transition";

/** Fixed, so the floors below are the same on every machine and every run. */
const SEED = 20_261_018;
const RUNS = 600;

const MOST_SLIDES = 8;
const LONGEST_SEQUENCE = 20;

const stepArbitrary = fc.constantFrom<SlideStep>(-1, 0, 1);

/** A start inside a count, so the property never begins on a slide that does not exist. */
const walkArbitrary = fc.integer({ min: 1, max: MOST_SLIDES }).chain((count) =>
  fc.record({
    count: fc.constant(count),
    start: fc.integer({ min: 0, max: count - 1 }),
    steps: fc.array(stepArbitrary, { maxLength: LONGEST_SEQUENCE }),
  }),
);

interface Arms {
  lowerClamp: number;
  upperClamp: number;
  interiorMove: number;
  stay: number;
  onlyOneSlide: number;
}

function emptyArms(): Arms {
  return {
    lowerClamp: 0,
    upperClamp: 0,
    interiorMove: 0,
    stay: 0,
    onlyOneSlide: 0,
  };
}

/** The pop-up's rule written the other way round (a walk with `if`s, no `min`/`max`), so the property compares two
 *  independent statements of it and not the implementation with itself. */
function modelOfOneStep(index: number, count: number, step: SlideStep): number {
  if (step === 1 && index < count - 1) return index + 1;
  if (step === -1 && index > 0) return index - 1;
  return index;
}

describe("slideTransition", () => {
  it("moves one slide on and one slide back inside the range", () => {
    expect(slideTransition({ index: 2, count: 5, step: 1 })).toBe(3);
    expect(slideTransition({ index: 2, count: 5, step: -1 })).toBe(1);
    expect(slideTransition({ index: 2, count: 5, step: 0 })).toBe(2);
  });

  it("stops at the last slide and at the first, and never wraps to the other end", () => {
    expect(slideTransition({ index: 4, count: 5, step: 1 })).toBe(4);
    expect(slideTransition({ index: 0, count: 5, step: -1 })).toBe(0);
  });

  it("stays on the only slide for every step", () => {
    for (const step of [-1, 0, 1] as const) {
      expect(slideTransition({ index: 0, count: 1, step })).toBe(0);
    }
  });

  it("answers the first slide, never a negative index, for a list with no slides", () => {
    for (const step of [-1, 0, 1] as const) {
      expect(slideTransition({ index: 0, count: 0, step })).toBe(0);
    }
  });

  it("keeps the index in [0, count - 1], moves by at most one and never wraps, over any sequence of steps from any start", () => {
    const arms = emptyArms();

    fc.assert(
      fc.property(walkArbitrary, ({ count, start, steps }) => {
        let index = start;
        let modelIndex = start;
        for (const step of steps) {
          const next = slideTransition({ index, count, step });
          modelIndex = modelOfOneStep(modelIndex, count, step);
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThanOrEqual(count - 1);
          expect(Math.abs(next - index)).toBeLessThanOrEqual(1);
          expect(next).toBe(modelIndex);
          countArm(arms, { index, count, step, next });
          index = next;
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );

    // A property over a population that never reaches a rule's arm proves nothing about that arm (ADR 0152 1.5).
    expect(arms.lowerClamp).toBeGreaterThan(0);
    expect(arms.upperClamp).toBeGreaterThan(0);
    expect(arms.interiorMove).toBeGreaterThan(0);
    expect(arms.stay).toBeGreaterThan(0);
    expect(arms.onlyOneSlide).toBeGreaterThan(0);
  });

  it("leaves the index where it is for a step of 0, at every index and count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MOST_SLIDES }).chain((count) =>
          fc.record({
            count: fc.constant(count),
            index: fc.integer({ min: 0, max: count - 1 }),
          }),
        ),
        ({ count, index }) => {
          expect(slideTransition({ index, count, step: 0 })).toBe(index);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("stepOfSwipe", () => {
  it("asks for nothing at 47 px and for one slide at 48 px, either way", () => {
    expect(SWIPE_THRESHOLD_PX).toBe(48);
    expect(stepOfSwipe({ deltaX: -47, deltaY: 0 })).toBe(0);
    expect(stepOfSwipe({ deltaX: 47, deltaY: 0 })).toBe(0);
    expect(stepOfSwipe({ deltaX: -48, deltaY: 0 })).toBe(1);
    expect(stepOfSwipe({ deltaX: 48, deltaY: 0 })).toBe(-1);
  });

  it("brings the next slide when the finger drags to the left and the previous one when it drags to the right", () => {
    expect(stepOfSwipe({ deltaX: -200, deltaY: 3 })).toBe(1);
    expect(stepOfSwipe({ deltaX: 200, deltaY: -3 })).toBe(-1);
  });

  it("asks for nothing when the drag is as vertical as it is horizontal", () => {
    expect(stepOfSwipe({ deltaX: -60, deltaY: 60 })).toBe(0);
    expect(stepOfSwipe({ deltaX: 60, deltaY: -60 })).toBe(0);
    expect(stepOfSwipe({ deltaX: -60, deltaY: 59 })).toBe(1);
    expect(stepOfSwipe({ deltaX: 60, deltaY: 59 })).toBe(-1);
  });

  it("asks for nothing for a mostly vertical drag however far it goes sideways under the threshold", () => {
    expect(stepOfSwipe({ deltaX: -40, deltaY: 400 })).toBe(0);
    expect(stepOfSwipe({ deltaX: 40, deltaY: -400 })).toBe(0);
  });

  it("asks for nothing at a tap, which travels nowhere", () => {
    expect(stepOfSwipe({ deltaX: 0, deltaY: 0 })).toBe(0);
  });

  it("agrees with its written rule for every travel, and reaches every arm", () => {
    const arms = { forward: 0, backward: 0, tooShort: 0, tooVertical: 0 };

    fc.assert(
      fc.property(
        fc.integer({ min: -300, max: 300 }),
        fc.integer({ min: -300, max: 300 }),
        (deltaX, deltaY) => {
          const step = stepOfSwipe({ deltaX, deltaY });
          const isFarEnough = Math.abs(deltaX) >= SWIPE_THRESHOLD_PX;
          const isMostlySideways = Math.abs(deltaX) > Math.abs(deltaY);

          if (!isFarEnough) arms.tooShort += 1;
          else if (!isMostlySideways) arms.tooVertical += 1;
          else if (deltaX < 0) arms.forward += 1;
          else arms.backward += 1;

          if (isFarEnough && isMostlySideways) {
            expect(step).toBe(deltaX < 0 ? 1 : -1);
          } else {
            expect(step).toBe(0);
          }
        },
      ),
      { seed: SEED, numRuns: RUNS * 4 },
    );

    expect(arms.forward).toBeGreaterThan(0);
    expect(arms.backward).toBeGreaterThan(0);
    expect(arms.tooShort).toBeGreaterThan(0);
    expect(arms.tooVertical).toBeGreaterThan(0);
  });
});

// Helpers

function countArm(
  arms: Arms,
  move: {
    readonly index: number;
    readonly count: number;
    readonly step: SlideStep;
    readonly next: number;
  },
): void {
  const { index, count, step, next } = move;
  if (count === 1) arms.onlyOneSlide += 1;
  if (step === 0) arms.stay += 1;
  else if (step === -1 && index === 0 && count > 1) arms.lowerClamp += 1;
  else if (step === 1 && index === count - 1 && count > 1) arms.upperClamp += 1;
  else if (next !== index) arms.interiorMove += 1;
}
