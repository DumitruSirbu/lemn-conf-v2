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
//
// **7D5 followed those rules.** The comparison below still reaches current output: rooms without a
// bottle remain whole-plan exact, while bottle rooms compare every core module field to this
// recording and independently validate the complete physical row published around the new cargo.
// Restated for 7D5 S2 (owner ruling 2026-09-21, Q-H6a = A): bottle rooms now go through the same
// classifier as the 7D5 pre-width recording, which also allows the 600 mm pan drawer immediately
// before the hob, the hob shifted by exactly its width where it stands, and the hob's wall losing
// outermost modules — and pins everything else, including the wall without the hob, to this file.
// 904x4523x2478 is the room that first reddened here: its hob moved from 2800 to 3400 on wall B.
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
  BASELINE_RUNS,
  BASELINE_SEED,
  canonicalPlan,
  recordedLRoom,
  roomKey,
} from "../support/composed-run-baseline.js";
import { assertOnlyTheBottleAndPanDrawerChanged } from "../support/pre-width-run-recording.js";
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
  it("regresses current output against every recorded re-keyed plan", () => {
    let exact = 0;
    let bottleNormalized = 0;
    let panDrawerNormalized = 0;
    let panDrawerWithoutBottle = 0;
    for (const [key, recorded] of RECORDING) {
      const [widthMm, depthMm, heightMm] = key.split("x").map(Number);
      if (
        widthMm === undefined ||
        depthMm === undefined ||
        heightMm === undefined
      ) {
        throw new Error(`the 7D8 recording holds an invalid key ${key}`);
      }
      const room: DesignRoom = { shape: "L", widthMm, depthMm, heightMm };
      const plan = planFor(room);
      expect(isReKeyed(room, plan), key).toBe(true);
      const hasBottle = plan.bases.some((base) => base.id === "bottle");
      const hasPanDrawer = plan.bases.some((base) => base.id === "pan-drawer");
      if (!hasBottle && !hasPanDrawer) {
        exact += 1;
        expect(canonicalPlan(plan), key).toBe(recorded);
      } else {
        if (hasBottle) bottleNormalized += 1;
        if (hasPanDrawer) panDrawerNormalized += 1;
        if (hasPanDrawer && !hasBottle) panDrawerWithoutBottle += 1;
        // 7D5 S2 / Q-H6a = A: the pan drawer before the hob shifts the hob and the bottle by 600 mm
        // and costs the hob's wall its outermost module; the shared classifier allows exactly that.
        // Q-H6b / Q-H6c: it may stand without the bottle, which then gave way to it and to the block.
        assertOnlyTheBottleAndPanDrawerChanged(key, room, plan, recorded);
      }
    }

    // 7D5 S2, Q-H6b / Q-H6c: 7 rooms that stood a bottle alone now stand the pan drawer alone
    // (903x4299x2419 first among them: its hob moved from 2800 to 3400 on wall B and the drawer slot
    // after it is gone). Bottle rooms 64 → 57, pan-drawer rooms 4 → 11; the exact arm keeps its 18.
    expect(RECORDING.size).toBe(RE_KEYED_ROOMS);
    expect(exact).toBe(18);
    expect(bottleNormalized).toBe(57);
    expect(panDrawerNormalized).toBe(11);
    expect(panDrawerWithoutBottle).toBe(7);
    expect(exact + bottleNormalized + panDrawerWithoutBottle).toBe(
      RE_KEYED_ROOMS,
    );
  });

  it("records only rooms the re-key moved, and every one of them", () => {
    // The recording's scope, asserted from the rooms rather than trusted from its header: wall B is
    // the wider entered wall in every recorded room, and no room outside the recording meets that
    // description while composing a kitchen.
    const outsideTheReKey: string[] = [];
    fc.assert(
      fc.property(recordedLRoom(), (room) => {
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
