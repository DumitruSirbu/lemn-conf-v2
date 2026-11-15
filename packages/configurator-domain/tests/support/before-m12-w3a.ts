// What M12 wave W3a changed, put back: a wall body over a freestanding fridge is built to the deepest declared cabinet
// depth (ADR 0183 decision 4) instead of the cabinet-depth line. A recording of the earlier rule, or a diff against W2's
// kitchens, asks the depth rule with the declaration read as absent: no column answers `hasDeepWallBodyUnder`, so the
// lifted arm governs, as it did when W2 closed.
//
// **How it is wired**, as `before-adr-0183.ts` wires the generator: a test file installs the mock
//
//     vi.mock("../../src/wall-body-over-it.js", async (importOriginal) => {
//       const { withTheDeepWallBodySwitchable } = await import("../support/before-m12-w3a.js");
//       return withTheDeepWallBodySwitchable(await importOriginal());
//     });
//
// and wraps one synchronous computation in `beforeM12W3a(compute)`. The file's other tests run on the shipped rule,
// because the switch is on by default. The generator's own reader, `isAWallBodyOwedOver`, is left alone: W2's behaviour
// is what the baseline keeps.
import type * as WallBodyOverIt from "../../src/wall-body-over-it.js";

let isTheMockInstalled = false;
let isTheDeclarationOff = false;

/** The declaration's module under the mock: the real reader while the switch is on, "none declared" while it is off. */
export function withTheDeepWallBodySwitchable(
  real: typeof WallBodyOverIt,
): typeof WallBodyOverIt {
  isTheMockInstalled = true;
  return {
    ...real,
    declaresADeepWallBodyOver: (declarer) =>
      !isTheDeclarationOff && real.declaresADeepWallBodyOver(declarer),
  };
}

/** `compute`'s answer under the depth rule as W2 left it, and the switch left as it was found. **Synchronous
 *  `compute` only**: a promise would settle after the switch is back on, so it is refused. Throws where the mock is not
 *  installed, since the answer would silently be the live one. */
export function beforeM12W3a<T>(compute: () => T): T {
  refuseWhereTheMockIsNotInstalled();
  const wasOff = isTheDeclarationOff;
  isTheDeclarationOff = true;
  try {
    const answer = compute();
    refuseAnAnswerStillInFlight(answer);
    return answer;
  } finally {
    isTheDeclarationOff = wasOff;
  }
}

function refuseAnAnswerStillInFlight(answer: unknown): void {
  if (typeof (answer as { then?: unknown } | null)?.then !== "function") return;
  throw new Error(
    "beforeM12W3a takes a synchronous compute: a promise would settle after the switch is back on",
  );
}

function refuseWhereTheMockIsNotInstalled(): void {
  if (isTheMockInstalled) return;
  throw new Error(
    "the depth rule as W2 left it needs the declaration's mock: without it the answer would be the live one",
  );
}
