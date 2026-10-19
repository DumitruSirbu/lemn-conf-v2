// What ADR 0167 changed in a generated plan, put back: every free wall-run end that the narrowest cabinet of its
// column fits is filled with one base cabinet of exactly that width, and the full-height bodies that ended the
// run move out by it (`free-end-fill.ts`). The recordings that model an EARLIER generator (the 933-room digest
// chain of U3a AC4, the 7D recordings, the C5 oracles) describe a state in which that pass did not exist, so each
// of them asks the generator with the pass returning its plan untouched, which is the plan the composer made.
// The pass runs last in `generateKitchen`'s planning, so taking it out leaves exactly what it was handed.
//
// **That is the generator before the pass for the L and the straight kitchen, and not for the U.** The U's own
// back-wall fill (ADR 0110 N11.9) left the composer when the pass took it over (D7), so a U generated with the pass
// off has no wall-A fill at all, and no recording of a HEAD U kitchen is reproduced by it.

// **How it is wired**, as `before-c5-fridge-end-leftover.ts` wires the C5 leaf: a test file installs the mock
//
//     vi.mock("../../src/generation/free-end-fill.js", async (importOriginal) => {
//       const { withTheFreeEndFillSwitchable } = await import("../support/before-adr-0167-free-end-fill.js");
//       return withTheFreeEndFillSwitchable(await importOriginal());
//     });
//
// and either wraps one synchronous generation in `beforeAdr0167(generate)`, or starts a test that compares with a
// recording of an earlier generator with `theGeneratorBeforeAdr0167()`. The file's other tests run on the shipped
// generator, because the switch is on by default.
import { onTestFinished } from "vitest";

import type * as FreeEndFill from "../../src/generation/free-end-fill.js";

let isTheMockInstalled = false;
let isThePassOff = false;

/** The pass's module under the mock: the real pass while the switch is on, the identity while it is off. */
export function withTheFreeEndFillSwitchable(
  real: typeof FreeEndFill,
): typeof FreeEndFill {
  isTheMockInstalled = true;
  return {
    ...real,
    withTheFreeEndsFilled: (plan, rule) =>
      isThePassOff ? plan : real.withTheFreeEndsFilled(plan, rule),
  };
}

/** `generate`'s answer from the generator as it stood before ADR 0167, and the switch left as it was found.
 *  **Synchronous `generate` only**: the switch is restored when `generate` returns, so a promise would be
 *  awaited with the pass back on and the answer would silently be the live one; it is refused. Throws where
 *  the mock is not installed, for the same reason. */
export function beforeAdr0167<T>(generate: () => T): T {
  refuseWhereTheMockIsNotInstalled();
  const wasOff = isThePassOff;
  isThePassOff = true;
  try {
    const answer = generate();
    refuseAnAnswerStillInFlight(answer);
    return answer;
  } finally {
    isThePassOff = wasOff;
  }
}

/** For one test that compares with a recording of an earlier generator: the pass is off for that test and back
 *  to what it was when the test ends, so the file's other tests run on the shipped generator. */
export function theGeneratorBeforeAdr0167(): void {
  refuseWhereTheMockIsNotInstalled();
  const wasOff = isThePassOff;
  isThePassOff = true;
  onTestFinished(() => {
    isThePassOff = wasOff;
  });
}

function refuseAnAnswerStillInFlight(answer: unknown): void {
  if (typeof (answer as { then?: unknown } | null)?.then !== "function") return;
  throw new Error(
    "beforeAdr0167 takes a synchronous generate: a promise would settle after the pass is switched back on",
  );
}

function refuseWhereTheMockIsNotInstalled(): void {
  if (isTheMockInstalled) return;
  throw new Error(
    "an earlier generator needs the free-end fill's mock: without it the plan would be the live one",
  );
}
