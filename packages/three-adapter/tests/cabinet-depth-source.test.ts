// M5 wave 5F work item 7: the geometry derives from **one** declared cabinet depth, and the two
// packages that hold a copy of that story cannot drift apart.
//
// ADR 0028's whole subject was two constants that happened to agree — §7's `nominalDepthMm` and
// §5.2's head-clearance cap, both 400, with nothing comparing them — so a second pair introduced by
// this wave gets the same treatment rather than a comment saying they match. §12 keeps the product
// rules in the domain and the builders here, so the numbers are declared twice on purpose; what must
// not happen is that they stop being the same number.
import {
  WALL_FRONT_ASSEMBLY_MM,
  WORKTOP_DEPTH_MM,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_CABINET_DEPTH_MM, makeKit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** Millimetres, rounded from a Float32 mesh extent. */
function depthMmOf(group: THREE.Object3D, meshName: string): number {
  const mesh = group.getObjectByName(meshName);
  if (!mesh) throw new Error(`no ${meshName}`);
  mesh.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(mesh);
  return Math.round((box.max.z - box.min.z) * 1000);
}

beforeAll(() => {
  installHeadlessDocument();
});

function kitAt(cabinetDepthMm: number) {
  return makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
}

describe("the adapter's cabinet depth is the domain's", () => {
  it("defaults to the depth the domain declares", () => {
    expect(DEFAULT_CABINET_DEPTH_MM).toBe(WORKTOP_DEPTH_MM);
  });

  // The adapter derives its front assembly from the door and handle it actually builds
  // (`TH / 2 + 0.024 + 0.006`); the domain declares it as a product rule, because it is what makes
  // "330" mean the same thing to the catalogue, to a swap's opening and to the geometry. Measured
  // against declared, in that direction: the geometry is the authority and the declaration follows.
  it("derives the same front assembly the domain declares", () => {
    expect(Math.round(kitAt(600).depths.frontAssemblyDepthM * 1000)).toBe(
      WALL_FRONT_ASSEMBLY_MM,
    );
  });
});

describe("the base carcass is a formula, exercised beyond its one reachable input", () => {
  // 600 is the only depth M5 can produce, so without this the formula is untested arithmetic that
  // M6's *Setări globale* control would be the first thing to discover. `docs/WORKFLOW.md`: a few
  // hand-picked examples are not evidence that the transitions work.
  it.each([
    { cabinetDepthMm: 600, carcassMm: 560, counterMm: 620 },
    { cabinetDepthMm: 700, carcassMm: 660, counterMm: 720 },
    { cabinetDepthMm: 800, carcassMm: 760, counterMm: 820 },
  ])(
    "builds a $cabinetDepthMm mm cabinet on a $carcassMm mm carcass under a $counterMm mm worktop",
    ({ cabinetDepthMm, carcassMm, counterMm }) => {
      const kit = kitAt(cabinetDepthMm);
      const body = kit.make.baseCabinet(0.6, { doors: 2 });

      expect(depthMmOf(body, "carcass_shell")).toBe(carcassMm);
      expect(depthMmOf(body, "countertop")).toBe(counterMm);
      expect(Math.round(kit.depths.baseCarcassDepthM * 1000)).toBe(carcassMm);
    },
  );

  // **The anti-invariant M5 states in capitals: not one shipped dimension moves.** At the declared
  // 600 the formula must reproduce the vendored reference's own 0.560 and 0.620 to the micrometre,
  // or M1's parity gate — which diffs every base builder against that reference — goes red for a
  // reason that has nothing to do with this wave's four deliberate changes.
  it("reproduces the reference's own numbers exactly at the declared depth", () => {
    const depths = kitAt(WORKTOP_DEPTH_MM).depths;

    expect(depths.baseCarcassDepthM).toBe(0.56);
    expect(depths.cabinetDepthM).toBe(0.6);
  });

  // The worktop overhangs the carcass by one constant and does not scale with depth: 60 mm deeper
  // at every cabinet depth, never a proportion. ADR 0036 decision 3 puts the worktop outside
  // geometry and price entirely — it is bought separately and may be stone, wood or laminate — so
  // what is asserted here is only that the *drawn* slab keeps its fixed relationship to the carcass
  // it sits on, never that it influences anything.
  it("keeps the worktop's overhang a constant at every depth", () => {
    for (const cabinetDepthMm of [600, 700, 800]) {
      const kit = kitAt(cabinetDepthMm);
      const body = kit.make.baseCabinet(0.6, { doors: 2 });

      expect(
        depthMmOf(body, "countertop") - depthMmOf(body, "carcass_shell"),
      ).toBe(60);
    }
  });
});

describe("the hood is standard, and hung at the front, at every cabinet depth", () => {
  // ADR 0039 decision 1: *"hood is always standard"* — 500 at a 600 mm kitchen and 500 at a 700 mm
  // one, which is the whole of its exemption from ADR 0036's depth map. Decision 2 then puts the
  // gap behind it, so the deeper the kitchen the larger the gap and never the hood.
  it.each([
    { cabinetDepthMm: 600, seatMm: 350, gapMm: 100 },
    { cabinetDepthMm: 700, seatMm: 450, gapMm: 200 },
  ])(
    "leaves a $gapMm mm gap behind a 500 mm hood at $cabinetDepthMm mm",
    ({ cabinetDepthMm, seatMm, gapMm }) => {
      const kit = kitAt(cabinetDepthMm);

      expect(Math.round(kit.depths.hoodDepthM * 1000)).toBe(500);
      expect(Math.round(kit.depths.hoodSeatOffsetM * 1000)).toBe(seatMm);
      expect(Math.round((kit.depths.hoodSeatOffsetM - 0.25) * 1000)).toBe(
        gapMm,
      );
    },
  );
});
