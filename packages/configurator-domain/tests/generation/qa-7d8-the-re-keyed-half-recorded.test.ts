// M7 wave 7D8 slice S4 — what the re-key composed, recorded whole, for the wave that changes it next.
//
// **This file adjudicates nothing about 7D8 and must never be cited as evidence for it.** It reads
// `7d8-re-keyed-baseline.json`, which was captured from this wave's own output, so the comparison
// below agrees with the composer whatever the composer did. What 7D8's own claim rests on is
// `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` — an independent derivation of the
// owner's rule — and the five whole witnesses in
// `qa-7d4-nothing-but-the-body-moved.adversarial.test.ts`. Neither is this.
//
// **What it is for.** 7D3's recording was captured the same way and became the instrument 7D4 and
// then 7D8 were judged against: a pre-state a later wave cannot re-take from its own output without
// destroying the comparison. The re-key moves 82 of the 240 rooms in that draw, and for those rooms
// 7D3's recording can now only say *this changed*. This file records what they changed **to**, field
// by field rather than as a digest, so the next wave to touch the composer reads its diff as
// millimetres and build ids instead of as 82 unequal hashes.
//
// **The prohibition in `composed-run-baseline.ts`'s header is not what this does.** That one forbids
// refreshing the claim under test from the code under test — re-taking `7d3-composition-baseline.json`
// at HEAD, which would make criterion 2 a tautology. `7d3-composition-baseline.json` is untouched and
// adjudicates 7D8 exactly as captured. A **new** file recording a **later** state adjudicates nothing
// that has already been claimed.
//
// **Rules for the next wave.**
//
// - If your wave changes the composed plan for some of these rooms, the failures here are your
//   wave's evidence: read them, confirm each is the change you intended, and cite the rooms.
// - Re-record only **after** your claim has been proved against this file as captured, in a new file
//   named for your wave. Do not edit this one, and do not edit 7D3's.
// - The recording covers the **plan** and not the wall row, and only the rooms whose wall B is wider
//   and whose kitchen the composer accepts. It says nothing about the other 158 rooms of the draw;
//   7D3's recording still holds those and is still the stricter instrument there.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import {
  approvedLRoom,
  BASELINE_RUNS,
  BASELINE_SEED,
  canonicalPlan,
  roomKey,
} from "../support/composed-run-baseline.js";
import { widerEnteredWall } from "../support/entered-walls.js";
import { readReKeyedRunRecording } from "../support/re-keyed-run-recording.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const RECORDING = readReKeyedRunRecording();

/** The size of the re-keyed half at the recorded draw: 82 of its 240 rooms, 34.2 %. Asserted rather
 *  than floored, because the draw is the recording's own and a count that moved means the generator
 *  drifted rather than that the population did. */
const RE_KEYED_ROOMS = 82;

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function isReKeyed(room: DesignRoom, plan: KitchenCompositionPlan): boolean {
  return widerEnteredWall(room) === "B" && plan.minimumMet;
}

describe("the re-keyed half of the recorded draw, recorded whole", () => {
  it("composes every recorded room exactly as the recording holds it", () => {
    // Collected and asserted after the sweep rather than inside it, for the reason its sibling gives:
    // a failing property shrinks toward rooms the capture never saw, and the throw from a missing
    // room would stand over the top of the real counterexample.
    const differences: string[] = [];
    const swept = new Set<string>();
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const plan = planFor(room);
        if (!isReKeyed(room, plan)) return;
        const key = roomKey(room);
        swept.add(key);
        const composed = canonicalPlan(plan);
        if (composed !== RECORDING.get(key)) {
          differences.push(
            `${key}\n  composed ${composed}\n  recorded ${String(RECORDING.get(key))}`,
          );
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(differences).toEqual([]);
    expect(swept.size).toBe(RE_KEYED_ROOMS);
    // And the recording holds no room the sweep no longer reaches, so a plan that stopped composing
    // shows up as a shrinking population rather than as a row nobody reads.
    expect([...RECORDING.keys()].filter((key) => !swept.has(key))).toEqual([]);
  });

  it("records only rooms the re-key moved, and every one of them", () => {
    // The recording's scope, asserted from the rooms rather than trusted from its header: wall B is
    // the wider entered wall in every recorded room, and no room outside the recording meets that
    // description while composing a kitchen.
    const outsideTheReKey: string[] = [];
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const key = roomKey(room);
        const recorded = RECORDING.has(key);
        if (recorded !== isReKeyed(room, planFor(room))) {
          outsideTheReKey.push(key);
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(outsideTheReKey).toEqual([]);
    expect(RECORDING.size).toBe(RE_KEYED_ROOMS);
  });
});
