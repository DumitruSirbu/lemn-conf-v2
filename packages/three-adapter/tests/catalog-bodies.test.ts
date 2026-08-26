// M3 work item 6 (`docs/milestones/M3-mutations.md`): `DEVELOPMENT-SPEC.md` §7's fourteen
// insertable entries, built at the size §5.2 planned for the opening.
//
// Every case is measured through the real probe rather than by reading the builder's arguments
// back, because the gate that decides whether a body can ever be inserted is `insertBody`'s
// built-size re-check against `FIT_TOLERANCE_M` — a body that builds to the wrong carcass is
// offered forever and refused forever, which is the silent failure shape M3's Risks section names.
import {
  FIT_TOLERANCE_M,
  INSERTABLE_BODY_DEFINITIONS,
  type BodyMeasurement,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  isCatalogBuildId,
} from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { measureBuiltBody } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** M1's parity epsilon, reused wherever a criterion asks for an exact number rather than a fit. */
const FLOAT_EPSILON_METRES = 1e-6;

const WORKTOP_HEIGHT_M = 0.86;
const WALL_CABINET_HEIGHT_M = 0.7;
const TOP_SLOT_HEIGHT_M = 0.4;
const HOOD_HEIGHT_M = 0.71;
const COLUMN_HEIGHT_M = 2.2;
const COLUMN_WIDTH_M = 0.6;
const BASE_COLUMN_DEPTH_M = 0.58;
const WALL_COLUMN_DEPTH_M = 0.33;
const DEEP_WALL_COLUMN_DEPTH_M = 0.6;

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function measure(
  buildId: string,
  size: { widthM: number; heightM: number; depthM: number },
): BodyMeasurement {
  return { ...measureBuiltBody({ kit, room, request: { buildId, ...size } }) };
}

interface SizeCase {
  readonly buildId: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly depthM: number;
  /** What the carcass must measure. Equal to the request for a parameterised entry; the entry's
   *  own fixed size for the four §7 calls "fixed", which ignore the request by design. */
  readonly carcassWidthM: number;
  readonly carcassHeightM: number;
}

function parameterised(
  buildId: string,
  widthM: number,
  heightM: number,
  depthM: number,
): SizeCase {
  return {
    buildId,
    widthM,
    heightM,
    depthM,
    carcassWidthM: widthM,
    carcassHeightM: heightM,
  };
}

const BASE_BUILD_IDS = [
  "base-2door",
  "base-1door",
  "base-3drawer",
  "base-panbank",
] as const;
const WALL_BUILD_IDS = [
  "wall-2door",
  "wall-1door",
  "wall-lift",
  "open-shelf",
] as const;

const SIZE_CASES: readonly SizeCase[] = [
  // §7: base carcasses are width-flexible and always build to the worktop line (§2's 0.86).
  ...BASE_BUILD_IDS.flatMap((buildId) =>
    [0.4, 0.57, 0.6, 0.8].map((widthM) =>
      parameterised(buildId, widthM, WORKTOP_HEIGHT_M, BASE_COLUMN_DEPTH_M),
    ),
  ),
  // `base-sink` is not in that list at 400 mm on purpose — see the aperture test below.
  ...[0.57, 0.6, 0.8].map((widthM) =>
    parameterised("base-sink", widthM, WORKTOP_HEIGHT_M, BASE_COLUMN_DEPTH_M),
  ),
  // §11 row 14: the niche accepts only 450 and 600, and both must build a real carcass.
  parameterised("base-dishwasher", 0.45, WORKTOP_HEIGHT_M, BASE_COLUMN_DEPTH_M),
  parameterised("base-dishwasher", 0.6, WORKTOP_HEIGHT_M, BASE_COLUMN_DEPTH_M),
  // §7: wall carcasses are width- **and** height-flexible, and the depth clamp must not change
  // either — a deep column (the over-fridge run) still builds a 400 mm carcass.
  ...WALL_BUILD_IDS.flatMap((buildId) =>
    [0.4, 0.57, 0.6, 0.8].flatMap((widthM) => [
      parameterised(
        buildId,
        widthM,
        WALL_CABINET_HEIGHT_M,
        WALL_COLUMN_DEPTH_M,
      ),
      parameterised(buildId, widthM, TOP_SLOT_HEIGHT_M, WALL_COLUMN_DEPTH_M),
      parameterised(
        buildId,
        widthM,
        WALL_CABINET_HEIGHT_M,
        DEEP_WALL_COLUMN_DEPTH_M,
      ),
    ]),
  ),
  // §7 fixes the hood at 710 mm in the two widths its chip set offers (ADR 0016).
  parameterised("hood", 0.6, HOOD_HEIGHT_M, WALL_COLUMN_DEPTH_M),
  parameterised("hood", 0.9, HOOD_HEIGHT_M, WALL_COLUMN_DEPTH_M),
  // The four fixed entries: asked for a size they do not have, they build their own and let
  // `refuseBuiltSize` turn the mismatch into a refusal. Nothing here may scale a finished group.
  {
    buildId: "tall-pantry",
    widthM: 0.8,
    heightM: 2.4,
    depthM: 0.56,
    carcassWidthM: COLUMN_WIDTH_M,
    carcassHeightM: COLUMN_HEIGHT_M,
  },
  {
    buildId: "tall-oven-tower",
    widthM: 0.8,
    heightM: 2.4,
    depthM: 0.56,
    carcassWidthM: COLUMN_WIDTH_M,
    carcassHeightM: COLUMN_HEIGHT_M,
  },
  {
    buildId: "tall-fridge-housing",
    widthM: 0.8,
    heightM: 2.4,
    depthM: 0.56,
    carcassWidthM: COLUMN_WIDTH_M,
    carcassHeightM: COLUMN_HEIGHT_M,
  },
  {
    buildId: "fridge-free",
    widthM: 0.6,
    heightM: 2.2,
    depthM: 0.68,
    carcassWidthM: 0.7,
    carcassHeightM: 1.85,
  },
];

describe("buildCatalogBody", () => {
  it("covers exactly the catalogue's insertable entries, in both directions", () => {
    const insertableIds = INSERTABLE_BODY_DEFINITIONS.map(([id]) => id);

    expect([...CATALOG_BUILD_IDS].sort()).toEqual([...insertableIds].sort());
  });

  it.each(SIZE_CASES)(
    "$buildId at $widthM × $heightM (depth $depthM) measures within the fit tolerance",
    (testCase) => {
      const measurement = measure(testCase.buildId, testCase);

      expect(measurement.carcassWidthM).toBeGreaterThan(0);
      expect(
        Math.abs(measurement.carcassWidthM - testCase.carcassWidthM),
      ).toBeLessThanOrEqual(FIT_TOLERANCE_M);
      expect(
        Math.abs(measurement.carcassHeightM - testCase.carcassHeightM),
      ).toBeLessThanOrEqual(FIT_TOLERANCE_M);
    },
  );

  it("refuses an unknown buildId the way buildDecomposedBody does", () => {
    expect(() =>
      buildCatalogBody(kit, "not-a-body", {
        widthM: 0.6,
        heightM: 0.7,
        depthM: 0.33,
      }),
    ).toThrow(/not-a-body/);
  });

  it("refuses a seeded decomposition id — those are never insertable (ADR 0011 Gap A)", () => {
    expect(isCatalogBuildId("wall-2door-600-top")).toBe(false);
    expect(() =>
      buildCatalogBody(kit, "wall-2door-600-top", {
        widthM: 0.6,
        heightM: 0.4,
        depthM: 0.33,
      }),
    ).toThrow(/wall-2door-600-top/);
  });

  // §11 row 20.
  it("builds a 570 mm wall cabinet to 570 mm with two doors", () => {
    const size = { widthM: 0.57, heightM: 0.7, depthM: 0.33 };
    const group = buildCatalogBody(kit, "wall-2door", size);

    expect(countMeshes(group, "door_front")).toBe(2);
    expect(measure("wall-2door", size).carcassWidthM).toBeCloseTo(0.57, 6);
  });

  it("builds a single door below §7's 450 mm door-count threshold", () => {
    const group = buildCatalogBody(kit, "wall-2door", {
      widthM: 0.45,
      heightM: 0.7,
      depthM: 0.33,
    });

    expect(countMeshes(group, "door_front")).toBe(1);
  });

  // §11 row 14: "a real carcass" is two sides, a plinth and a worktop — not an empty group.
  it.each([0.45, 0.6])(
    "builds a real dishwasher niche carcass at %s m",
    (widthM) => {
      const group = buildCatalogBody(kit, "base-dishwasher", {
        widthM,
        heightM: WORKTOP_HEIGHT_M,
        depthM: BASE_COLUMN_DEPTH_M,
      });

      const names: string[] = [];
      group.traverse((node) => names.push(node.name));
      expect(names).toContain("side_left");
      expect(names).toContain("side_right");
      expect(names).toContain("plinth");
      expect(names).toContain("countertop");
    },
  );

  // §11 row 6 with ADR 0016: canopy + chimney is the requested height, exactly.
  it("builds the hood to its requested height, chimney included", () => {
    const measurement = measure("hood", {
      widthM: 0.6,
      heightM: HOOD_HEIGHT_M,
      depthM: 0.5,
    });

    expect(measurement.carcassHeightM).toBeCloseTo(HOOD_HEIGHT_M, 6);
    expect(
      Math.abs(measurement.carcassHeightM - HOOD_HEIGHT_M),
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });

  // A recorded limitation, not a passing behaviour: `make.baseCabinet(w, {sink: true})` splits its
  // worktop around a **fixed** 560 mm aperture, so below that width the two `countertop_side`
  // pieces invert and the carcass measures wider and taller than it was asked for. §7 nevertheless
  // lists 400 in the sink base's width chip set. The body is therefore offered at 400 mm and then
  // refused by `insertBody`'s built-size re-check — the guard holds, which is what this asserts;
  // the chip set is the thing that is wrong, and parameterising the aperture is builder work this
  // wave may not do (M3 Risks: "must not be faked by scaling a finished group").
  it("cannot build a sink base below its fixed 560 mm aperture, and does not pretend to", () => {
    const narrow = measure("base-sink", {
      widthM: 0.4,
      heightM: WORKTOP_HEIGHT_M,
      depthM: BASE_COLUMN_DEPTH_M,
    });

    expect(Math.abs(narrow.carcassWidthM - 0.4)).toBeGreaterThan(
      FIT_TOLERANCE_M,
    );
    expect(
      measure("base-sink", {
        widthM: 0.56,
        heightM: WORKTOP_HEIGHT_M,
        depthM: BASE_COLUMN_DEPTH_M,
      }).carcassWidthM,
    ).toBeCloseTo(0.56, 6);
  });

  // The test that would have caught F1: `wall-lift` was built as `wallCabinet(w, 1, h, d)`, which
  // is character-for-character `wall-1door`, so *Corp suspendat rabatabil* and *Corp suspendat
  // 1 ușă* were the same body in the scene. No size assertion can see it — a lift-up and a hinged
  // door have identical carcasses, and the flap is not a carcass mesh — so the difference has to be
  // asserted where it lives: §6.5 puts an overhead flap's bar on the **bottom** edge, the edge a
  // hand can reach, while a 700 mm hinged door keeps its vertical bar.
  it("builds a lift-up that is not a hinged single door", () => {
    const size = { widthM: 0.6, heightM: 0.7, depthM: 0.33 };

    const lift = handleBarExtent(buildCatalogBody(kit, "wall-lift", size));
    const hinged = handleBarExtent(buildCatalogBody(kit, "wall-1door", size));

    expect(lift.widthM).toBeGreaterThan(lift.heightM);
    expect(hinged.heightM).toBeGreaterThan(hinged.widthM);
    expect(lift.centreY).toBeLessThan(hinged.centreY);
    expect(Math.abs(lift.centreX)).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });

  it("builds the lift-up's flap across the full opening, with no hinged door", () => {
    const lift = buildCatalogBody(kit, "wall-lift", {
      widthM: 0.8,
      heightM: 0.5,
      depthM: 0.33,
    });

    expect(countMeshes(lift, "door_front")).toBe(1);
    lift.updateWorldMatrix(true, true);
    const flap = lift.getObjectByName("door_front");
    if (!flap) throw new Error("the lift-up has no flap");
    const box = new THREE.Box3().setFromObject(flap);
    expect(box.max.x - box.min.x).toBeCloseTo(0.794, 3);
    expect(box.max.y - box.min.y).toBeCloseTo(0.494, 3);
  });

  // §7's `min(d, 0.4)` clamp, asserted on geometry rather than on the argument passed.
  it("clamps a wall carcass to 400 mm however deep its column is", () => {
    const shallow = buildCatalogBody(kit, "wall-1door", {
      widthM: 0.6,
      heightM: 0.7,
      depthM: 0.33,
    });
    const deep = buildCatalogBody(kit, "wall-1door", {
      widthM: 0.6,
      heightM: 0.7,
      depthM: 0.6,
    });

    expect(depthOf(shallow)).toBeCloseTo(0.33, 6);
    expect(depthOf(deep)).toBeCloseTo(0.4, 6);
  });
});

/** The bar's own extent, which is what tells a bottom-edge flap handle from a right-edge door
 *  handle: the same mesh name, rotated and placed differently. */
function handleBarExtent(group: THREE.Group): {
  widthM: number;
  heightM: number;
  centreX: number;
  centreY: number;
} {
  // The bar's own mesh carries the rotation and its handle group carries the placement, so the
  // world matrices have to be current before either can be read off a bounding box.
  group.updateWorldMatrix(true, true);
  const bar = group.getObjectByName("handle_bar");
  if (!bar) throw new Error("body has no handle_bar mesh");
  const box = new THREE.Box3().setFromObject(bar);
  return {
    widthM: box.max.x - box.min.x,
    heightM: box.max.y - box.min.y,
    centreX: (box.max.x + box.min.x) / 2,
    centreY: (box.max.y + box.min.y) / 2,
  };
}

function countMeshes(group: THREE.Group, meshName: string): number {
  let found = 0;
  group.traverse((node) => {
    if (node.name === meshName) found += 1;
  });
  return found;
}

function depthOf(group: THREE.Group): number {
  const shell = group.getObjectByName("carcass_shell");
  if (!shell) throw new Error("body has no carcass_shell mesh");
  const box = new THREE.Box3().setFromObject(shell);
  return box.max.z - box.min.z;
}
