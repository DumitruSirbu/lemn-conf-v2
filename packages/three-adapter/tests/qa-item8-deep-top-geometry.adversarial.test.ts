// **Adversarial QA on ADR 0101 in the adapter — did the deleted constant become a measurement, or a
// second route to the same number?**
//
// `PINNED_DEEP_TOP_DEPTH_M` was 0.6 and is gone; the three deep tops now read `kit.depths
// .cabinetDepthM`. `cabinet-depth-source.test.ts` measures one of them off its built `carcass_shell`
// at each declared depth, which is a real measurement — but the kits it measures are the *paired*
// ones, cabinet depth 600 with wall depth 330 and 700 with 400. A builder that had been re-derived
// from the wall depth through ADR 0028's map backwards would reproduce both rows exactly and be
// indistinguishable from the ruling. So this file crosses the two:
//
//   - a 600 mm kitchen given a 700 mm kitchen's wall depth, and the reverse, so the two candidate
//     sources answer **different** numbers and only one of them can be right;
//   - ADR 0101 decision 4's identity at 600, reproduced against the expression the wave deleted —
//     `wallCabinet(W, doors, H, 0.6)` — node for node, with the same comparison required to **fail**
//     at 700 so the identity is not a claim about a comparison that cannot break;
//   - both deep-top build ids, where the shipped gate measures one;
//   - the three placements in the built room, where the shipped gate measures the decomposed body —
//     they are different call sites in different files and only one of them was under test.
import { declaredCabinetDepthsMm } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildDecomposedBody,
  hidePushOpenHandles,
} from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { describeStructure } from "./support/structure.js";

/** ADR 0036 decision 1's front assembly, as data: a fronted carcass's shell is its finished depth
 *  less the door slab and its bar handle. */
const FRONT_ASSEMBLY_MM = 39;

/** ADR 0028's map, written here rather than imported: the wall/top carcass depth at each declared
 *  cabinet depth. It is the number a deep top must **not** be built to. */
const WALL_DEPTH_MM = { 600: 330, 700: 400 } as const;

/** The two entries ADR 0101 unpinned, with the arguments the deleted code passed for each: the
 *  literal `0.6` that `PINNED_DEEP_TOP_DEPTH_M` stood for, and whether the decomposition hides the
 *  handles of a push-open front. Reconstructed here so decision 4's identity is checked against the
 *  expression that was removed, not against a paraphrase of it. */
const DEEP_TOPS = [
  {
    buildId: "wall-2door-600-deep-top",
    widthM: 0.6,
    doors: 2,
    heightM: 0.4,
    pushOpen: true,
  },
  {
    buildId: "wall-2door-700-over-fridge",
    widthM: 0.7,
    doors: 2,
    heightM: 0.75,
    pushOpen: false,
  },
] as const;

/** The depth the pin held these bodies at, at every setting, until 2026-09-07. */
const THE_DELETED_PIN_M = 0.6;

/** The three deep-top placements in the built room, found by the level they stand at: two at 2200
 *  and one at 1850 over the fridge. Wall B is rotated, so the depth axis of a wall-B body is the
 *  room's x. */
const DEEP_TOP_LEVELS_MM = [2200, 1850];

/** Millimetres, rounded. `+ 0` normalises IEEE-754's negative zero, which `toEqual` distinguishes
 *  from zero and which is not a distinction about geometry: a wall plane a hair below the origin
 *  rounds to `-0`. */
const mm = (metres: number): number => Math.round(metres * 1000) + 0;

beforeAll(() => {
  installHeadlessDocument();
});

function kitAt(cabinetDepthMm: number, wallDepthMm: number): Kit {
  return makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm,
  });
}

/** The declared kit for a depth: ADR 0028's own pairing. */
function pairedKitAt(cabinetDepthMm: number): Kit {
  return kitAt(
    cabinetDepthMm,
    WALL_DEPTH_MM[cabinetDepthMm as keyof typeof WALL_DEPTH_MM],
  );
}

/** The outer depth of a built body's `carcass_shell`, in millimetres. */
function shellDepthMm(body: THREE.Object3D): number {
  body.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  let found = 0;
  body.traverse((object) => {
    if (object.name !== "carcass_shell") return;
    found += 1;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  if (found !== 1) {
    throw new Error(`expected one carcass_shell, found ${String(found)}`);
  }
  return Math.round((bounds.max.z - bounds.min.z) * 1000);
}

/** The pre-ADR-0101 expression for one of these bodies, rebuilt from a kit at any depth. Both
 *  `hidePushOpenHandles` and the argument order are the deleted code's own. */
function asThePinBuiltIt(
  kit: Kit,
  deepTop: (typeof DEEP_TOPS)[number],
): THREE.Group {
  const built = kit.make.wallCabinet(
    deepTop.widthM,
    deepTop.doors,
    deepTop.heightM,
    THE_DELETED_PIN_M,
  );
  return deepTop.pushOpen ? hidePushOpenHandles(built) : built;
}

const dump = (body: THREE.Object3D): string =>
  JSON.stringify(describeStructure(body));

describe("the deep tops read the cabinet depth and are blind to the wall depth", () => {
  // **The attack on the deleted constant.** The two candidate sources are given deliberately
  // mismatched values, so they cannot answer the same number: a 600 mm kitchen carrying a 700 mm
  // kitchen's map row, and the reverse. Only one of the two can be what the builder reads, and this
  // says which. The shipped gate cannot: it only ever builds the declared pairs.
  it.each([
    { cabinetDepthMm: 600, wallDepthMm: WALL_DEPTH_MM[700] },
    { cabinetDepthMm: 700, wallDepthMm: WALL_DEPTH_MM[600] },
  ])(
    "builds to the cabinet depth at $cabinetDepthMm mm even given a $wallDepthMm mm wall row",
    ({ cabinetDepthMm, wallDepthMm }) => {
      const kit = kitAt(cabinetDepthMm, wallDepthMm);

      expect(
        DEEP_TOPS.map(({ buildId }) => ({
          buildId,
          shellMm: shellDepthMm(buildDecomposedBody(kit, buildId)),
        })),
      ).toEqual(
        DEEP_TOPS.map(({ buildId }) => ({
          buildId,
          shellMm: cabinetDepthMm - FRONT_ASSEMBLY_MM,
        })),
      );
    },
  );
});

describe("ADR 0101 decision 4: the 600 mm kitchen is identical, and the 700 mm one is not", () => {
  // **Decision 4 reproduced rather than trusted.** *"At `cabinetDepthMm = 600`, every declared depth
  // and every named mesh of `p22`, `p23` and `p24` is identical to `main` — not 'within tolerance',
  // identical."* The comparison is against the expression the wave deleted — `wallCabinet(W, doors,
  // H, PINNED_DEEP_TOP_DEPTH_M)` with the pin's own `0.6` — over the whole structure dump: every
  // node's name, type, geometry, material, visibility, transform and mesh outer size.
  it.each(DEEP_TOPS)(
    "$buildId is byte-identical at 600 mm to the pinned expression it replaced",
    (deepTop) => {
      const kit = pairedKitAt(600);

      expect(dump(buildDecomposedBody(kit, deepTop.buildId))).toEqual(
        dump(asThePinBuiltIt(kit, deepTop)),
      );
    },
  );

  // …and the same comparison **must fail** at 700, or the identity above is a claim about a
  // comparison that cannot break. This is the wave's whole point stated as the negation of decision
  // 4: the pin held 600 in a 700 mm kitchen and the owner reported it.
  it.each(DEEP_TOPS)(
    "$buildId departs from that expression at 700 mm, which is the fix",
    (deepTop) => {
      const kit = pairedKitAt(700);

      expect(dump(buildDecomposedBody(kit, deepTop.buildId))).not.toEqual(
        dump(asThePinBuiltIt(kit, deepTop)),
      );
    },
  );
});

describe("the deep tops in the room, which is a different call site", () => {
  /** Every `carcass_shell` in the built room standing at one of wall B's top-row levels. Wall B is
   *  rotated a quarter turn, so its bodies' depth axis is the room's **x**; wall A's top row stands
   *  at 2200 too and is excluded by having its back face on the room's z origin instead. */
  function topRowShellsOnWallB(cabinetDepthMm: number): readonly THREE.Box3[] {
    const room = pairedKitAt(cabinetDepthMm).builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    const found: THREE.Box3[] = [];
    room.traverse((object) => {
      if (object.name !== "carcass_shell") return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (!DEEP_TOP_LEVELS_MM.includes(mm(bounds.min.y))) return;
      if (mm(bounds.min.z) === 0) return;
      found.push(bounds);
    });
    return found;
  }

  // The room composes these through `makeKit`'s own `place(…)` calls, not through
  // `buildDecomposedBody`. They were three separate literals until this wave and are three separate
  // reads of `cabinetDepthM` now; nothing measured them **in the room** at 700.
  //
  // Stated over the whole top row on wall B rather than over the three: the fourth body up there is
  // the corner return top, which has no column under it and must stay on ADR 0028's map row. Three
  // lifted and one capped is the discrimination the wave has to preserve — a change that swept the
  // whole band to the cabinet-depth line would satisfy any assertion about the three alone.
  it.each(declaredCabinetDepthsMm())(
    "lifts exactly the three over columns and leaves the corner return capped at %i mm",
    (cabinetDepthMm) => {
      const shells = topRowShellsOnWallB(cabinetDepthMm);
      const wallDepthMm = WALL_DEPTH_MM[cabinetDepthMm as 600 | 700];

      expect(
        shells
          .map((bounds) => mm(bounds.max.x))
          .sort((left, right) => left - right),
      ).toEqual([
        wallDepthMm - FRONT_ASSEMBLY_MM,
        cabinetDepthMm - FRONT_ASSEMBLY_MM,
        cabinetDepthMm - FRONT_ASSEMBLY_MM,
        cabinetDepthMm - FRONT_ASSEMBLY_MM,
      ]);
      // The back face is the wall plane for every one of them: a wall body is seated at half its
      // shell so the shell's rear face lands on zero, which is §11 row 19 and is what "a deeper
      // kitchen grows forward" means for a wall body.
      expect(shells.map((bounds) => mm(bounds.min.x))).toEqual(
        shells.map(() => 0),
      );
    },
  );
});
