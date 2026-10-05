// What M7C wave C5 slice S1 changed in a generated plan, put back: where the fridge ends a run with 50-299 mm
// beyond it and a door cabinet stands inboard, that cabinet is planned wider and the fridge moves out by the
// same amount (`fridge-end-leftover.ts`). The recordings and oracles that model an EARLIER planner (7D3's
// composition, the pre-width and pre-tower plans, S0b, the pre-U3a digest) describe a state in which that rule
// did not exist, so each of them asks the planner as it stood before it: the leaf returning its plan untouched.
//
// **How it is wired**, the way `composition-context-capture.ts` switches the dishwasher leaf: a test file
// installs the mock
//
//     vi.mock("../../src/generation/fridge-end-leftover.js", async (importOriginal) => {
//       const { withTheFridgeEndLeafSwitchable } = await import("../support/before-c5-fridge-end-leftover.js");
//       return withTheFridgeEndLeafSwitchable(await importOriginal());
//     });
//
// and then either wraps one synchronous composition in `beforeC5(compose)`, or starts a test that compares with
// a recording with `thePlannerBeforeC5()`, or switches the leaf off around a census with
// `switchTheFridgeEndLeafOff()` and `switchTheFridgeEndLeafOn()`. A file's live tests then run on the shipped
// planner. With the mock installed and the switch on, every
// plan the composer returns is the plan it returned before C5, whole: the leaf is applied last, so taking
// it out leaves exactly what it was handed.
import { onTestFinished } from "vitest";

import type * as FridgeEndLeaf from "../../src/generation/fridge-end-leftover.js";

let isTheMockInstalled = false;
let isTheLeafOff = false;

/** The leaf's module under the mock: the real leaf while the switch is on, the identity while it is off. */
export function withTheFridgeEndLeafSwitchable(
  real: typeof FridgeEndLeaf,
): typeof FridgeEndLeaf {
  isTheMockInstalled = true;
  return {
    ...real,
    withTheLeftoverBesideTheFridgeAbsorbed: (plan) =>
      isTheLeafOff ? plan : real.withTheLeftoverBesideTheFridgeAbsorbed(plan),
  };
}

/** `compose`'s answer from the planner as it stood before C5, and the switch left as it was found.
 *  **Synchronous `compose` only**: the switch is restored when `compose` returns, so a promise would be
 *  awaited with the leaf back on and the answer would silently be the live one; it is refused. Throws
 *  where the mock is not installed, for the same reason. */
export function beforeC5<T>(compose: () => T): T {
  const wasOff = isTheLeafOff;
  switchTheFridgeEndLeafOff();
  try {
    const answer = compose();
    refuseAnAnswerStillInFlight(answer);
    return answer;
  } finally {
    isTheLeafOff = wasOff;
  }
}

function refuseAnAnswerStillInFlight(answer: unknown): void {
  if (typeof (answer as { then?: unknown } | null)?.then !== "function") return;
  throw new Error(
    "beforeC5 takes a synchronous compose: a promise would settle after the leaf is switched back on",
  );
}

/** For one test that compares with a recording of an earlier planner: the leaf is off for that test and
 *  back to what it was when the test ends, so the file's other tests run on the shipped planner. */
export function thePlannerBeforeC5(): void {
  const wasOff = isTheLeafOff;
  switchTheFridgeEndLeafOff();
  onTestFinished(() => {
    isTheLeafOff = wasOff;
  });
}

/** For the recorded figures of a file. Pair it with `switchTheFridgeEndLeafOn`. */
export function switchTheFridgeEndLeafOff(): void {
  refuseWhereTheMockIsNotInstalled();
  isTheLeafOff = true;
}

export function switchTheFridgeEndLeafOn(): void {
  isTheLeafOff = false;
}

function refuseWhereTheMockIsNotInstalled(): void {
  if (isTheMockInstalled) return;
  throw new Error(
    "an earlier planner needs the fridge-end leaf's mock: without it the plan would be the live one",
  );
}
