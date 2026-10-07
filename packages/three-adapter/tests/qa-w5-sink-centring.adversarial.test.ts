// Is the sink's 110 mm derived, or a constant tuned to two data points? (ADR 0098)
// `sink-front-clearance.parity.test.ts` gates only `declaredCabinetDepthsMm()`, which is two numbers, so
// any affine rule in the depth reproduces them. This file sweeps undeclared depths, probes the 578 mm floor
// (decision 6) on both sides of its transition, requires hob and sink to derive their seats by the same
// shape, and requires the stone to tile its own worktop exactly.
// Nothing reads a constant out of the module under test: every number is data or derived from the ruling,
// and every measurement is taken off named meshes in a built body.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  declaredCabinetDepthsMm,
  MIN_CABINET_DEPTH_MM,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** ADR 0098 decision 2's declared fact, `(620 − 400) / 2`. Data here, never imported. */
const FRONT_CLEARANCE_MM = 110;

/** The bowl and the hole cut for it: a manufactured size, and the same 400 the aperture is. */
const APERTURE_DEPTH_MM = 400;

/** ADR 0098 decision 6: `faucetToWallMm(d) = d − 578`, the depth at which the escutcheon meets the
 *  wall plane; re-measured here. */
const FAUCET_MEETS_THE_WALL_AT_MM = 578;

/** ADR 0087 decision 1's declared fact for the hob. Never derived from the sink's: two appliances, two
 *  reasons. Here so the shape of the two derivations can be compared without reading either number out
 *  of the module. */
const HOB_FRONT_CLEARANCE_MM = 10;

/** The one depth the owner's word "centred" is a ruling *about*. */
const DEPTH_THE_CENTRING_IS_RULED_AT_MM = 600;

/** The catalogue's own floor for a sink base (`SINK_MIN_WIDTH_MM`): the bowl is 560 mm and the
 *  carcass may be exactly that, which is the width at which the two flanking slabs vanish. */
const NARROWEST_SINK_WIDTH_MM = 560;

/** The depths the two appliances are compared at. They run well past the declared pair on purpose:
 *  a rule fitted to 600 and 700 reproduces both and nothing else. */
const SWEPT_DEPTHS_MM = [600, 640, 700, 760, 830, 900] as const;
const SHALLOWEST_SWEPT_DEPTH_MM = SWEPT_DEPTHS_MM[0];

/** `base-sink` reads only the width off its request — its depth is the kit's — so these are held
 *  constant to keep every sweep about the depth axis alone. */
const SWEPT_BODY_HEIGHT_M = 0.86;
const SWEPT_BODY_DEPTH_M = 0.58;
const SWEPT_BODY_WIDTH_MM = 800;

/** Every claim is a difference, so rounding happens once, on the difference: a worktop at an odd cabinet
 *  depth sits on a half-millimetre (`counterDepthMm` is `d + 20`, centred), so rounding each end first
 *  turns an exact 1 mm gap into 0 or 2. `+ 0` normalises negative zero, which `toEqual` distinguishes
 *  from `0` and which is not a distinction about geometry. */
const gapMm = (far: number, near: number): number =>
  Math.round((far - near) * 1000) + 0;

beforeAll(() => {
  installHeadlessDocument();
});

function kitAt(cabinetDepthMm: number): Kit {
  return makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
}

function bodyAt(
  cabinetDepthMm: number,
  buildId: string,
  widthMm: number,
): THREE.Group {
  const body = buildCatalogBody(kitAt(cabinetDepthMm), buildId, {
    widthM: widthMm / 1000,
    heightM: SWEPT_BODY_HEIGHT_M,
    depthM: SWEPT_BODY_DEPTH_M,
  });
  body.updateWorldMatrix(true, true);
  return body;
}

function sinkAt(cabinetDepthMm: number, widthMm = SWEPT_BODY_WIDTH_MM) {
  return bodyAt(cabinetDepthMm, "base-sink", widthMm);
}

/** The union of every mesh carrying one of these names, in the frame of the root. */
function boundsOf(root: THREE.Object3D, ...names: string[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  let found = 0;
  root.traverse((object) => {
    if (!names.includes(object.name)) return;
    found += 1;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  if (found === 0) throw new Error(`no ${names.join("/")} in ${root.name}`);
  return bounds;
}

/** The planes every claim relates, read off named meshes and left in metres so rounding happens on the
 *  difference. The hole is read off the slabs that bound it, not the bowl, so "the rim lands on it"
 *  relates two independently measured things. */
interface DepthAxisM {
  readonly worktopFront: number;
  readonly worktopBack: number;
  readonly apertureFront: number;
  readonly apertureBack: number;
  readonly faucetBack: number;
}

function depthAxisOf(body: THREE.Object3D): DepthAxisM {
  const front = boundsOf(body, "countertop_front");
  const back = boundsOf(body, "countertop_back");
  return {
    worktopFront: front.max.z,
    worktopBack: back.min.z,
    apertureFront: front.min.z,
    apertureBack: back.max.z,
    faucetBack: boundsOf(body, "faucet").min.z,
  };
}

describe("the sink's 110 mm is a relation and not a constant tuned to two depths", () => {
  // The clearance in front is the same number at every depth the builder can be handed, not only the two
  // declared: a seat fitted to the declared pair (a literal, a table, an interpolation) breaks when a
  // third depth is asked for.
  propertyTest.prop([fc.integer({ min: 490, max: 1400 })])(
    "leaves the same worktop in front of the bowl at every buildable depth",
    (cabinetDepthMm) => {
      const axis = depthAxisOf(sinkAt(cabinetDepthMm));

      expect({
        cabinetDepthMm,
        clearanceMm: gapMm(axis.worktopFront, axis.apertureFront),
      }).toEqual({ cabinetDepthMm, clearanceMm: FRONT_CLEARANCE_MM });
    },
  );

  // Every millimetre of added depth lands behind, stated as the gap's own arithmetic rather than "it grows":
  // a seat that split the addition front and back (the reading ADR 0098 rejected) fails here.
  propertyTest.prop([fc.integer({ min: 490, max: 1400 })])(
    "gives the whole of the added depth to the gap behind the faucet",
    (cabinetDepthMm) => {
      const axis = depthAxisOf(sinkAt(cabinetDepthMm));

      expect({
        cabinetDepthMm,
        gapMm: gapMm(axis.faucetBack, axis.worktopBack),
      }).toEqual({
        cabinetDepthMm,
        gapMm: cabinetDepthMm - FAUCET_MEETS_THE_WALL_AT_MM,
      });
    },
  );

  // ADR 0098 decision 6 at its transition: the sign change on both sides of 578 is the only evidence that
  // the derived floor is the built one.
  it.each([
    { cabinetDepthMm: 577, expected: -1 },
    { cabinetDepthMm: FAUCET_MEETS_THE_WALL_AT_MM, expected: 0 },
    { cabinetDepthMm: 579, expected: 1 },
  ])(
    "puts the faucet's escutcheon exactly on the wall plane at 578 mm ($cabinetDepthMm)",
    ({ cabinetDepthMm, expected }) => {
      const axis = depthAxisOf(sinkAt(cabinetDepthMm));

      expect({
        cabinetDepthMm,
        gapMm: gapMm(axis.faucetBack, axis.worktopBack),
      }).toEqual({ cabinetDepthMm, gapMm: expected });
    },
  );

  // Anti-invariant ADR 0098 decision 6 leaves unguarded: the declared minimum cabinet depth does not
  // protect the sink. At 520 the faucet stands 58 mm through the wall plane and becomes the back-most part
  // of its body. Only `requireDeclaredCabinetDepthMm` keeps that unreachable, while every declared depth
  // is above 578. A characterisation, not an approval: declaring a depth below 578 means re-reading decision 6.
  it("does not protect the sink at MIN_CABINET_DEPTH_MM, which decision 6 says it does not", () => {
    const axis = depthAxisOf(sinkAt(MIN_CABINET_DEPTH_MM));
    const wholeBody = new THREE.Box3().setFromObject(
      sinkAt(MIN_CABINET_DEPTH_MM),
    );

    expect(MIN_CABINET_DEPTH_MM).toBeLessThan(FAUCET_MEETS_THE_WALL_AT_MM);
    expect(gapMm(axis.faucetBack, axis.worktopBack)).toBe(
      MIN_CABINET_DEPTH_MM - FAUCET_MEETS_THE_WALL_AT_MM,
    );
    expect(gapMm(wholeBody.min.z, axis.faucetBack)).toBe(0);
    // …and it is unreachable, because no declared depth is below the floor.
    expect(
      declaredCabinetDepthsMm().filter(
        (depthMm) => depthMm < FAUCET_MEETS_THE_WALL_AT_MM,
      ),
    ).toEqual([]);
  });
});

describe("'centred' is a ruling about 600 and 'like the hob' carries it everywhere else", () => {
  // Equality at 600 and inequality everywhere else, so a change that re-centred the sink at every depth
  // (the option ADR 0098 rejected) fails even though it would still satisfy "the gap behind grew".
  it("splits the worktop evenly at 600 and nowhere else", () => {
    const atSix = depthAxisOf(sinkAt(DEPTH_THE_CENTRING_IS_RULED_AT_MM));

    expect(gapMm(atSix.worktopFront, atSix.apertureFront)).toBe(
      gapMm(atSix.apertureBack, atSix.worktopBack),
    );

    for (const cabinetDepthMm of [601, 650, 700, 900]) {
      const axis = depthAxisOf(sinkAt(cabinetDepthMm));

      expect({
        cabinetDepthMm,
        centred:
          gapMm(axis.worktopFront, axis.apertureFront) ===
          gapMm(axis.apertureBack, axis.worktopBack),
      }).toEqual({ cabinetDepthMm, centred: false });
    }
  });

  // Non-vacuity for the shipped gate: `sink-front-clearance.parity.test.ts`'s centring case `continue`s at
  // every depth but 600, so it asserts nothing the day 600 stops being declared (ADR 0093 decision 1).
  it("keeps 600 in the declared map, which is what makes the centring case assert anything", () => {
    expect(declaredCabinetDepthsMm()).toContain(
      DEPTH_THE_CENTRING_IS_RULED_AT_MM,
    );
  });
});

describe("the hob and the sink derive their seats by one shape", () => {
  // The owner's "same principle as with hob" as an invariant over both appliances: each declares its
  // clearance in front (depth-invariant) and gives all added depth to the gap behind. A seat re-frozen as
  // a literal (the defect ADR 0087 found in the hob, ADR 0098 in the sink) makes that appliance's front
  // clearance track the depth, and fails for it alone.
  it.each([
    {
      what: "sink",
      buildId: "base-sink",
      frontMesh: "sink_rim_front",
      backMesh: "faucet",
      stoneNames: ["countertop_front", "countertop_back", "countertop_side"],
      clearanceMm: FRONT_CLEARANCE_MM,
    },
    {
      what: "hob",
      buildId: "base-hob-2drawer",
      frontMesh: "cooktop_glass",
      backMesh: "cooktop_glass",
      stoneNames: ["countertop"],
      clearanceMm: HOB_FRONT_CLEARANCE_MM,
    },
  ])(
    "$what holds its front clearance and grows behind, over a swept range of depths",
    ({ buildId, frontMesh, backMesh, stoneNames, clearanceMm }) => {
      const measured = SWEPT_DEPTHS_MM.map((cabinetDepthMm) => {
        const body = bodyAt(cabinetDepthMm, buildId, SWEPT_BODY_WIDTH_MM);
        const stone = boundsOf(body, ...stoneNames);
        return {
          cabinetDepthMm,
          frontMm: gapMm(stone.max.z, boundsOf(body, frontMesh).max.z),
          // The gap behind less the depth added since the shallowest swept kitchen: constant only if the
          // added depth lands behind; an even split would grow it by half of every step.
          rearBeyondTheAdditionMm:
            gapMm(boundsOf(body, backMesh).min.z, stone.min.z) -
            (cabinetDepthMm - SHALLOWEST_SWEPT_DEPTH_MM),
        };
      });
      const atTheShallowest = measured[0];
      if (!atTheShallowest) throw new Error("the sweep is empty");

      expect(measured).toEqual(
        SWEPT_DEPTHS_MM.map((cabinetDepthMm) => ({
          cabinetDepthMm,
          frontMm: clearanceMm,
          rearBeyondTheAdditionMm: atTheShallowest.rearBeyondTheAdditionMm,
        })),
      );
    },
  );

  // The hob's 10 and the sink's 110 are different appliances with different reasons and neither may be
  // derived from the other (ADR 0098 Consequences); unifying them would pass every relation above.
  it("keeps the two clearances independent numbers", () => {
    const sink = depthAxisOf(sinkAt(DEPTH_THE_CENTRING_IS_RULED_AT_MM));
    const hobBody = bodyAt(
      DEPTH_THE_CENTRING_IS_RULED_AT_MM,
      "base-hob-2drawer",
      SWEPT_BODY_WIDTH_MM,
    );

    expect(gapMm(sink.worktopFront, sink.apertureFront)).not.toBe(
      gapMm(
        boundsOf(hobBody, "countertop").max.z,
        boundsOf(hobBody, "cooktop_glass").max.z,
      ),
    );
  });
});

describe("the stone tiles its own worktop, at every depth and down to the narrowest sink", () => {
  // ADR 0098 decision 5: four slabs and one assembly drawn from one seat. This checks the stone against
  // itself: the slabs cover the worktop except the hole, with no gap or overlap. A seat applied to three of
  // the four leaves a visible slot that every envelope-shaped gate passes.
  propertyTest.prop([
    fc.integer({ min: 560, max: 1400 }),
    fc.constantFrom(NARROWEST_SINK_WIDTH_MM, 600, 700, 800),
  ])(
    "leaves no gap and no overlap between the four slabs",
    (cabinetDepthMm, widthMm) => {
      const body = sinkAt(cabinetDepthMm, widthMm);
      const axis = depthAxisOf(body);
      const sides = boundsOf(body, "countertop_side");

      // The two flanking slabs span exactly the hole, so front slab + hole + back slab tile the
      // worktop and the flanks fill what is left beside the hole.
      expect({
        sideFrontOffsetMm: gapMm(sides.max.z, axis.apertureFront),
        sideBackOffsetMm: gapMm(sides.min.z, axis.apertureBack),
        tiledMm:
          gapMm(axis.worktopFront, axis.apertureFront) +
          gapMm(axis.apertureFront, axis.apertureBack) +
          gapMm(axis.apertureBack, axis.worktopBack),
      }).toEqual({
        sideFrontOffsetMm: 0,
        sideBackOffsetMm: 0,
        tiledMm: gapMm(axis.worktopFront, axis.worktopBack),
      });
      expect(gapMm(axis.apertureFront, axis.apertureBack)).toBe(
        APERTURE_DEPTH_MM,
      );
    },
  );

  // At `SINK_MIN_WIDTH_MM` the 560 mm bowl fills the carcass, so the flanking slabs are exactly zero wide.
  // Pinned because a wider aperture would make them negative: a body drawn inside out.
  it("collapses the flanking slabs to nothing at the narrowest offered sink, never past it", () => {
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const sides = boundsOf(
        sinkAt(cabinetDepthMm, NARROWEST_SINK_WIDTH_MM),
        "countertop_side",
      );

      expect({
        cabinetDepthMm,
        widthMm: gapMm(sides.max.x, sides.min.x) - NARROWEST_SINK_WIDTH_MM,
      }).toEqual({ cabinetDepthMm, widthMm: 0 });
    }
  });
});

describe("the sink in the room it ships in", () => {
  // One level up from the body: the seeded room's sink base in room coordinates, against the wall it
  // stands against. The wall is drawn by a different builder from the cabinet, so the rear gap is only
  // real if the faucet is in front of the wall plane in the assembled kitchen.
  it.each(declaredCabinetDepthsMm())(
    "keeps the faucet in front of the wall it stands against at %i mm",
    (cabinetDepthMm) => {
      const room = kitAt(cabinetDepthMm).builders["kitchen-l"]();
      room.updateWorldMatrix(true, true);

      const faucet = boundsOf(room, "faucet");
      const stone = boundsOf(room, "countertop_back");

      // Wall A runs along x, so its plane is the worktop's own back edge in z.
      expect({
        cabinetDepthMm,
        gapMm: gapMm(faucet.min.z, stone.min.z),
      }).toEqual({
        cabinetDepthMm,
        gapMm: cabinetDepthMm - FAUCET_MEETS_THE_WALL_AT_MM,
      });
      expect(
        gapMm(faucet.min.z, stone.min.z),
        `at ${String(cabinetDepthMm)} mm`,
      ).toBeGreaterThan(0);
    },
  );

  // Exactly one sink, so the measurement above is about a body and not the union of two.
  it.each(declaredCabinetDepthsMm())(
    "holds exactly one sink assembly at %i mm",
    (cabinetDepthMm) => {
      const room = kitAt(cabinetDepthMm).builders["kitchen-l"]();
      const found: string[] = [];
      room.traverse((object) => {
        if (object.name === "sink_faucet") found.push(object.name);
      });

      expect(found).toEqual(["sink_faucet"]);
    },
  );
});
