// **A deliberately failing guard. Wave 6K-e owes the flip** — do not delete it, and do not weaken
// the assertion to make it pass.
//
// [ADR 0074](../../../docs/decisions/0074-the-scene-rebuilds-whole-at-a-depth-change.md)'s finding:
// `setCabinetDepth` takes a `BodyProbe` and writes every rebuilt body's `seatDepthMm` from it. The
// store passes `createBodyProbe(stage.kit, stage.room)` — the **scene's** kit — and the command runs
// in the event handler, before any effect, so no keying of the stage memo can help. The probe
// measuring a 600 -> 700 change is built by the 600 kit and stays that way.
//
// It matters because the adapter's base, full-height, appliance and hood builders **ignore the depth
// they are handed and build the kit's own** (ADR 0018; `baseCabinet` builds at the closure constant
// `CARC_D`, and `measureSeatedGroup`'s front line comes from `kit.depths.cabinetDepthM`). So the
// seat that is persisted is the old kit's, `deriveFrame` resolves
// `placement.body.seatDepthMm ?? definition.frameDepthMm` forever after, and the stale seat is never
// re-checked against the catalogue.
//
// **Why the store's own suites cannot see this**: they run against `createFakeBodyProbe`, whose
// `seatOffsetM: request.depthM / 2` obeys the depth it is asked for — precisely the behaviour the
// real probe does not have for these builders.
//
// The remedy is a domain signature change — `probe: BodyProbe` becomes
// `probeAt: (cabinetDepthMm) => BodyProbe`, the same shape as `catalogAt` and for the same stated
// reason — which crosses three packages and is wave 6K-e's, not 6K-b's.
//
// **`it.fails` passes on *any* throw, so a guard whose body crashes asserts nothing** — and nothing
// in the suite says so: it reports green either way. This one was briefly in that state, passing
// because `createBodyProbe` threw `No catalog builder registered for buildId "base-corner-x-900"`
// rather than because the two seats differ; it was caught only by printing both values. **Before
// trusting any `it.fails`, print what it produces and confirm the assertion is what fails.**
//
// **This test is also ADR 0074's own withdrawal clause.** If the two probes agree, the finding is
// wrong and must be withdrawn by a dated amendment there rather than by deleting this file.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  wallCarcassDepthMm,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-04T10:00:00.000Z";
const DEFAULT_MM = 600;
const DEEPER_MM = 700;
/** A base placement — the band whose builder ignores the depth it is handed and reads the kit's. */
const BASE_PLACEMENT_ID = "p0";

/** The bodies `reseat` handles rather than `rebuild`. `createBodyProbe` has no builder for them —
 *  it throws `No catalog builder registered` — and an expected failure that passes because the body
 *  threw asserts nothing about depth. */
const STRUCTURAL_BUILD_IDS = new Set([
  "base-corner-x-900",
  "base-corner-return-320",
  "wall-corner-return-570",
  "wall-corner-return-570-top",
]);

/** The seeded kitchen without those, so every remaining placement travels the `rebuild` path the
 *  finding is about. */
const WITHOUT_STRUCTURAL_BODIES: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.filter(
    (placement) => !STRUCTURAL_BUILD_IDS.has(placement.body.buildId),
  ),
};

beforeAll(() => {
  installHeadlessDocument();
});

/** The seat `setCabinetDepth` writes for a base body when the probe is built over a kit at
 *  `probeDepthMm`, moving the design to `DEEPER_MM`. */
function seatWrittenByAProbeAt(probeDepthMm: number): number | undefined {
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm: probeDepthMm,
    wallDepthMm: wallCarcassDepthMm(probeDepthMm),
  });
  const room: THREE.Object3D = kit.builders["kitchen-l"]();
  const result = setCabinetDepth({
    design: WITHOUT_STRUCTURAL_BODIES,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm: DEEPER_MM,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return seatOf(result.design, BASE_PLACEMENT_ID);
}

function seatOf(design: Design, placementId: string): number | undefined {
  return design.placements.find((placement) => placement.id === placementId)
    ?.body.seatDepthMm;
}

describe("the probe that measures a depth change", () => {
  // The premise, and it must pass: the two kits really are built to different depths, so the
  // expected failure below is not a comparison of a value with itself.
  it("builds two kits whose base carcasses differ", () => {
    const atDefault = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm: DEFAULT_MM,
    });
    const atDeeper = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm: DEEPER_MM,
    });

    expect(atDefault.depths.baseCarcassDepthM).not.toBe(
      atDeeper.depths.baseCarcassDepthM,
    );
  });

  // **Expected failure, owed by wave 6K-e.** The seat a depth change persists must be a fact about
  // the depth being moved to, never about which kit happened to be mounted when the customer tapped.
  it.fails(
    "writes the same base seat whichever kit's probe measures it (6K-e owes this)",
    () => {
      expect(seatWrittenByAProbeAt(DEFAULT_MM)).toBe(
        seatWrittenByAProbeAt(DEEPER_MM),
      );
    },
  );
});
