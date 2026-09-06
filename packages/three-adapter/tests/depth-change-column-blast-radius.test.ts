// Wave 6K-h, at the **real** probe: which columns a depth change is allowed to move, and which it
// must leave exactly where the broken command already left them (ADR 0077 decision 8).
//
// The domain suite asserts the same shape against a fake probe and can pin four of these five
// numbers. It cannot pin `B|0.61`: that column's members travel `reseat`, and the fake seats a
// `wall-plane` body at its declared `frameDepthMm` where a built return measures 400. `B|0.61` is
// also the fingerprint that identified the mechanism — it was **already correct in the broken runs**
// because its members read no opening — so it is exactly the column a fix that reached past the
// declared entries would move. That is why this file exists and why it is here rather than there.
//
// The numbers are the ruling's own simulation, measured with this probe on 2026-09-05:
//
// ```
// BROKEN  settled → 700     A|0.30=330 A|0.75=330 | B|0.61=400 B|2.45=742 B|1.20=738 B|1.80=699 A|1.30=720
// FIXED   settled → 700     A|0.30=400 A|0.75=400 | B|0.61=400 B|2.45=742 B|1.20=738 B|1.80=699 A|1.30=720
// ```
//
// **Wave 6J-c moved wall B's keys and none of these depths** (ADR 0089): the deeper corner consumes
// wall B, so at 700 that row reads `B|0.685`, `B|2.55`, `B|1.30`, `B|1.90` — the same columns
// carrying the same bodies at the same depths, 70 or 100 mm further along. The table above is left
// as the simulation recorded it, and the assertions below resolve each key off the design.
import { createBodyProbeLease } from "@lemnaria/configurator-domain";
import {
  buildKitchenLBodyCatalog,
  deriveColumns,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  wallCarcassDepthMm,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-05T13:00:00.000Z";
const DEFAULT_MM = 600;
const DEEPER_MM = 700;

/** The two columns decision 8 moves, and the only two: every member of each is a fronted wall
 *  cabinet, so §3.2's MAX over them is a pure function of what those bodies were last rebuilt to. */
const MAY_MOVE_KEYS = ["A|0.30", "A|0.75"] as const;

/** Every other column the seeded kitchen publishes at 700 mm, with the **depth** each one publishes
 *  there — the number that is byte-identical between the broken command and the fixed one.
 *
 *  **Named by a member rather than by a column key since wave 6J-c**, which slides wall B's run along
 *  its wall by what the deeper corner consumed (ADR 0089): `p9`'s column is `B|0.61` at 600 and
 *  `B|0.685` at 700, and `p5`'s is `B|1.20` and `B|1.30`. Same columns, same members, same depths,
 *  standing further along. A literal key would have read that intended move as a regression and
 *  would also have pinned the very coordinate that wave changes. */
const UNMOVED_DEPTHS_AT_700_MM: ReadonlyMap<string, number> = new Map([
  ["p9", 400],
  ["p11", 720],
  ["p5", 738],
  ["p6", 699],
  ["p7", 742],
]);

beforeAll(() => {
  installHeadlessDocument();
});

const kits = new Map<number, { kit: Kit; room: THREE.Object3D }>();

/** One kit per depth for the whole file: a depth change builds a real kit and a full reference room,
 *  and this file applies several. `release` frees nothing because the kits are shared — the kit
 *  lifetime is `disposeKit`'s subject and `kit-disposal` owns its own tests. */
function kitAt(cabinetDepthMm: number): { kit: Kit; room: THREE.Object3D } {
  const held = kits.get(cabinetDepthMm);
  if (held) return held;
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
  const built = { kit, room: kit.builders["kitchen-l"]() };
  kits.set(cabinetDepthMm, built);
  return built;
}

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: (askedForMm: number) => {
      const { kit, room } = kitAt(askedForMm);
      return createBodyProbeLease(createBodyProbe(kit, room), () => undefined);
    },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

/** The column key a placement publishes now, read off its record rather than written down: wave
 *  6J-c moves wall B's columns along the wall, and the key is the column's own origin. */
function columnKeyOf(
  design: Design,
  cabinetDepthMm: number,
  placementId: string,
): string {
  const record = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  ).find((candidate) => candidate.id === placementId);
  if (!record) throw new Error(`no record for ${placementId}`);
  return record.col;
}

function columnDepthsMm(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, number> {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  return new Map(
    [...deriveColumns(records, {}, design.room)].map(([key, column]) => [
      key,
      Math.round(column.d * 1000),
    ]),
  );
}

describe("the columns a depth change may move", () => {
  // The triggering state, by the route a customer takes: the design settles at 600, every
  // depth-following body is seated there, and the deepening then has to ignore those seats.
  it("publishes the map's row on the two wall columns, from a settled design", () => {
    const settled = changeTo(KITCHEN_L_DESIGN, DEFAULT_MM);

    const depths = columnDepthsMm(changeTo(settled, DEEPER_MM), DEEPER_MM);

    for (const key of MAY_MOVE_KEYS) {
      expect(depths.get(key), key).toBe(wallCarcassDepthMm(DEEPER_MM));
    }
  });

  // **The blast radius, stated as what must not happen.** Clearing more than the entries that
  // declare `depthFollowsSetting` — the manufactured fridge, ADR 0058's pinned tops — moves one of
  // these, and every same-versus-same comparison would stay green while it did.
  it("leaves every other column exactly where the broken command left it", () => {
    const settled = changeTo(KITCHEN_L_DESIGN, DEFAULT_MM);

    const deepened = changeTo(settled, DEEPER_MM);
    const depths = columnDepthsMm(deepened, DEEPER_MM);

    for (const [memberId, depthMm] of UNMOVED_DEPTHS_AT_700_MM) {
      const key = columnKeyOf(deepened, DEEPER_MM, memberId);
      expect(depths.get(key), `${memberId} in ${key}`).toBe(depthMm);
    }
  });

  // Same claim over a path that visits both settings, so the table above is a fact about the kitchen
  // and not about one sequence.
  it("holds the same table after a round trip through the shallow setting", () => {
    const walked = [DEEPER_MM, DEFAULT_MM, DEEPER_MM].reduce(
      changeTo,
      KITCHEN_L_DESIGN,
    );

    const depths = columnDepthsMm(walked, DEEPER_MM);

    for (const [memberId, depthMm] of UNMOVED_DEPTHS_AT_700_MM) {
      const key = columnKeyOf(walked, DEEPER_MM, memberId);
      expect(depths.get(key), `${memberId} in ${key}`).toBe(depthMm);
    }
    for (const key of MAY_MOVE_KEYS) {
      expect(depths.get(key), key).toBe(wallCarcassDepthMm(DEEPER_MM));
    }
  });
});
