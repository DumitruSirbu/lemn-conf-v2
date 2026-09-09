// **Adversarial QA on ADR 0098 — is the sink *derived*, or is 110 a constant tuned to two data
// points?**
//
// `sink-front-clearance.parity.test.ts` gates the ruling over `declaredCabinetDepthsMm()`, which is
// exactly two numbers. Two points determine a line, so a seat computed by *any* affine rule in the
// cabinet depth reproduces them; the shipped defect ADR 0098 fixed was itself an affine rule (a seat
// frozen at zero) that happened to look right at one of them. This file attacks that from the side
// the declared map cannot reach:
//
//   - the relation is swept over hundreds of undeclared depths, so a tuned pair of numbers breaks;
//   - the 578 mm floor ADR 0098 decision 6 derives is probed on both sides of its transition, where
//     the sign of the faucet's clearance changes — including at `MIN_CABINET_DEPTH_MM`, which
//     decision 6 says does **not** protect it;
//   - the hob and the sink are required to derive their seats by the **same shape**, which is the
//     owner's *"same principle as with hob"* stated as an invariant rather than as a comment;
//   - the stone is required to tile its own worktop exactly, which is what stops a future seat from
//     being applied to the assembly and not to the hole (or the other way round).
//
// **Nothing here reads a constant out of the module under test.** Every number is written as data or
// derived from the owner's ruling, and every measurement is taken off named meshes in a built body.
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

/** ADR 0098 decision 6: `faucetToWallMm(d) = d − 578`. The depth at which the escutcheon meets the
 *  wall plane, derived in the record from the declared constants and re-measured here. */
const FAUCET_MEETS_THE_WALL_AT_MM = 578;

/** ADR 0087 decision 1's declared fact for the hob, one body over. It is **not** derived from the
 *  sink's and may never be: two appliances, two reasons. It is here only so the *shape* of the two
 *  derivations can be compared without either number being read out of the module. */
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

/** **Every claim in this file is a difference, so the rounding happens once, on the difference.**
 *  A worktop at an odd cabinet depth sits on a half-millimetre — `counterDepthMm` is `d + 20` and
 *  the slab is centred — so rounding each end first turns an exact 1 mm gap into 0 or 2. The
 *  shipped suite never sees this because both declared depths are even; a sweep does, and rounding
 *  a difference is the honest measurement either way.
 *
 *  `+ 0` normalises IEEE-754's negative zero: a gap that rounds down from a hair below zero is
 *  `-0`, which `toEqual` distinguishes from `0` and which is not a distinction about geometry. */
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

/** The planes every claim below is a relation between, read off named meshes and left in **metres**
 *  so the rounding happens on the difference: the stone's two edges, the hole's two edges and the
 *  back of the faucet. The hole is read off the slabs that bound it rather than off the bowl, so
 *  "the rim lands on it" stays a claim about two independently measured things. */
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
  // **The attack.** `SINK_SEAT_OFFSET_M` is derived, so the clearance in front is the same number at
  // every depth the builder can be handed — not merely at the two the map declares. A seat that had
  // been fitted to the declared pair (a literal, a lookup table, an interpolation between 600 and
  // 700) reproduces both declared rows and breaks the moment a third depth is asked for, which is
  // what `makeKit` will be handed the day the owner declares one.
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

  // And the other half of the derivation: every millimetre of added depth lands **behind**. Stated
  // as the gap's own arithmetic rather than as "it grows", so a seat that gave the back 50 and the
  // front 50 — the reading ADR 0098 rejected, and the one "centred at every depth" would produce —
  // fails here rather than passing a monotonicity check.
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

  // ADR 0098 decision 6, at its transition rather than near it. The record derives 578 from the
  // constants; this measures the sign change on both sides of it, which is the only evidence that
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

  // **The anti-invariant decision 6 names and deliberately leaves unguarded**, pinned so it cannot
  // become a surprise: the declared *minimum* cabinet depth does not protect the sink. At 520 the
  // faucet stands 58 mm **through** the wall plane and becomes the back-most part of its own body,
  // silently changing what that body occupies. Only `requireDeclaredCabinetDepthMm` keeps that
  // unreachable, and only for as long as every declared depth is above 578.
  //
  // This is a characterisation, not an approval. Whoever declares a third depth below 578 must
  // re-read ADR 0098 decision 6; this test is what makes that unmissable.
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
  // The two sentences are one instruction, and only one depth satisfies both literally. Asserted as
  // an **equality at 600 and an inequality everywhere else**, so a future change that re-centred the
  // sink at every depth — the option ADR 0098 rejected, and the one that splits the added 100 mm
  // evenly — fails here even though it would still satisfy "the gap behind grew".
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

  // **Non-vacuity for the shipped gate.** `sink-front-clearance.parity.test.ts`'s centring case
  // loops over `declaredCabinetDepthsMm()` and `continue`s at every depth but 600, so it asserts
  // nothing at all the day 600 stops being declared — it passes over an empty set. ADR 0093
  // decision 1. Nothing there is weakened; the missing precondition is stated here instead.
  it("keeps 600 in the declared map, which is what makes the centring case assert anything", () => {
    expect(declaredCabinetDepthsMm()).toContain(
      DEPTH_THE_CENTRING_IS_RULED_AT_MM,
    );
  });
});

describe("the hob and the sink derive their seats by one shape", () => {
  // The owner's *"same principle as with hob"* as an invariant over both appliances at once: each
  // declares its clearance in **front**, so that number is depth-invariant, and each gives the whole
  // of any added depth to the gap **behind**. If one of the two were ever re-frozen as a literal
  // seat — the defect ADR 0087 found in the hob and ADR 0098 found in the sink — its front clearance
  // would start tracking the depth and this fails for that appliance alone.
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
          // The gap behind, less the depth that was added since the shallowest swept kitchen. It is
          // the added depth landing behind that makes this constant; a rule that split the addition
          // evenly would grow it by half of every step.
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

  // …and the two numbers stay different numbers. ADR 0098's Consequences: *"`HOB_FRONT_CLEARANCE_MM`
  // is 10 and this is 110; they are different appliances with different reasons and neither number
  // may be derived from the other."* A wave that unified them would pass every relation above.
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
  // ADR 0098 decision 5's real content: **four slabs and one assembly drawn from one seat.** The
  // shipped gate checks the rim against the aperture; this checks the *stone* against itself — that
  // the four slabs cover the whole worktop rectangle except the hole, with no gap and no overlap.
  // A seat applied to three of the four is a body with a visible slot in it that every
  // envelope-shaped gate passes.
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

  // The width boundary the catalogue actually offers: at `SINK_MIN_WIDTH_MM` the 560 mm bowl fills
  // the carcass, so the two flanking slabs are exactly zero wide. Characterised rather than
  // asserted away — it is the catalogue's own floor and it predates ADR 0098 — because a future
  // widening of the aperture would turn these into **negative** slabs, which is a body drawn
  // inside out and is what this pins.
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
  // The gate one level up from the body: the seeded room's own sink base, measured **in room
  // coordinates** against the wall it stands against. ADR 0098's rear gap is only real if the
  // faucet is in front of the wall plane in the assembled kitchen, not merely inside its own body's
  // envelope — and the wall is drawn by a different builder from the cabinet.
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

  // Exactly one sink in the shipped room, so the measurement above is about a body and not about
  // the union of two. Non-vacuity for the `boundsOf` union.
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
