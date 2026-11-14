// What ADR 0183 changed in a generated kitchen, put back: generation hangs one wall cabinet over every placed
// freestanding fridge (`isAWallBodyOwedOver`, `generation/over-body-policy.ts`). A recording of an earlier generator,
// or a diff against HEAD's behaviour, asks the generator with the declaration read as absent: the one step is not
// attempted, so the log, the commands, the placements and the placement ids are what they were.
//
// **How it is wired**, as `before-adr-0167-free-end-fill.ts` wires the fill: a test file installs the mock
//
//     vi.mock("../../src/wall-body-over-it.js", async (importOriginal) => {
//       const { withTheDeclarationSwitchable } = await import("../support/before-adr-0183.js");
//       return withTheDeclarationSwitchable(await importOriginal());
//     });
//
// and wraps one synchronous generation in `beforeAdr0183(generate)`. The file's other tests run on the shipped
// generator, because the switch is on by default.
import type * as WallBodyOverIt from "../../src/wall-body-over-it.js";

let isTheMockInstalled = false;
let isTheDeclarationOff = false;

/** The declaration's module under the mock: the real reader while the switch is on, "none owed" while it is off. */
export function withTheDeclarationSwitchable(
  real: typeof WallBodyOverIt,
): typeof WallBodyOverIt {
  isTheMockInstalled = true;
  return {
    ...real,
    isAWallBodyOwedOver: (definition) =>
      !isTheDeclarationOff && real.isAWallBodyOwedOver(definition),
  };
}

/** `generate`'s answer from the generator as it stood before ADR 0183, and the switch left as it was found.
 *  **Synchronous `generate` only**: a promise would settle after the switch is back on, so it is refused. Throws
 *  where the mock is not installed, since the answer would silently be the live one. */
export function beforeAdr0183<T>(generate: () => T): T {
  refuseWhereTheMockIsNotInstalled();
  const wasOff = isTheDeclarationOff;
  isTheDeclarationOff = true;
  try {
    const answer = generate();
    refuseAnAnswerStillInFlight(answer);
    return answer;
  } finally {
    isTheDeclarationOff = wasOff;
  }
}

function refuseAnAnswerStillInFlight(answer: unknown): void {
  if (typeof (answer as { then?: unknown } | null)?.then !== "function") return;
  throw new Error(
    "beforeAdr0183 takes a synchronous generate: a promise would settle after the switch is back on",
  );
}

function refuseWhereTheMockIsNotInstalled(): void {
  if (isTheMockInstalled) return;
  throw new Error(
    "an earlier generator needs the declaration's mock: without it the answer would be the live one",
  );
}
