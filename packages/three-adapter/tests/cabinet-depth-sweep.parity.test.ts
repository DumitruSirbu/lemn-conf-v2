// **M6 wave 6I's criterion 1, against the meshes rather than against a constant.**
//
// The carry-out `docs/milestones/M5-width.md` hands M6 by name: beyond `baseCabinet`, the corner,
// return, dishwasher and oven-tower bodies stayed byte-identical across cabinet depths — measured in
// wave 5F's QA — while the base formula moved. It was a gap in reach rather than a live defect only
// because nothing ships at 700.
//
// Two kits are built, one at each depth ADR 0056 declares, and every floor-standing body is measured
// in both. The claim is per body and it is a **difference**: this body deepens by exactly what
// `baseCabinet` deepens by. Asserting a table of finished depths would pass just as well if every
// number in it were wrong together, and asserting that the numbers merely *agree* is what 5F's QA
// found already satisfied — by all four families standing still.
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildInsertableBodyDefinitions,
  cabinetDepthRuleOf,
  depthFollowsSetting,
  requireDeclaredCabinetDepthMm,
  UndeclaredCabinetDepthRuleError,
  type CabinetDepthRule,
  type CabinetDepthRuleQuery,
} from "@lemnaria/configurator-domain";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** The two depths ADR 0056 declares, **written here as data**. The domain deliberately keeps
 *  `declaredWorktopDepthsMm` off its barrel so no second caller can derive a wall depth from a
 *  depth that is not the declared one, and a test that read the values it checks out of the module
 *  it checks would prove nothing anyway — the stance `WALL_BUILD_DEPTHS_MM` already takes in
 *  `occupied-depth.parity.test.ts`. The domain's own `cabinet-depth-parameter.test.ts` asserts the
 *  map holds exactly this pair, so a third row cannot land here unnoticed. */
const SHALLOWEST_DECLARED_DEPTH_MM = 600;
const DEEPEST_DECLARED_DEPTH_MM = 700;
const DECLARED_DEPTHS_MM = [
  SHALLOWEST_DECLARED_DEPTH_MM,
  DEEPEST_DECLARED_DEPTH_MM,
];

const kits = new Map<number, Kit>();

beforeAll(() => {
  installHeadlessDocument();
  for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
    kits.set(
      cabinetDepthMm,
      makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm }),
    );
  }
});

function kitAt(cabinetDepthMm: number): Kit {
  const kit = kits.get(cabinetDepthMm);
  if (!kit) throw new Error(`no kit at ${String(cabinetDepthMm)} mm`);
  return kit;
}

/** How deep the built body is along its own depth axis, in whole millimetres.
 *
 *  Deliberately the **local extent** and not the distance from the wall plane. Every body here but
 *  one is seated by its back face (§11 row 19), so the two are the same number; the exception is the
 *  X-leg, which ADR 0025 seats from the L-joint rather than from the wall and which therefore stands
 *  20 mm inside it. Measuring the extent asks each body how deep it *is*, which is the question this
 *  criterion is about, and it keeps the one seating exception from having to be special-cased.
 *
 *  Rounded, because a `Box3` over the real geometry carries float noise a base seat shows as
 *  0.5800000047683715 — the same rounding `toMillimetres` exists to do, not a tolerance. */
function depthExtentMm(group: THREE.Group): number {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  return Math.round((box.max.z - box.min.z) * 1000);
}

/** The §7 rows that stand on the floor: the base band and the full-height band. The wall band is
 *  excluded because its depth is a *placement* variable rather than a property of the entry — it
 *  arrives already resolved through the map, and `occupied-depth.parity.test.ts` sweeps it at both
 *  depths from that side. */
function floorStandingBuildIds(): readonly string[] {
  return buildInsertableBodyDefinitions(SHALLOWEST_DECLARED_DEPTH_MM)
    .filter(([, definition]) => definition.band !== "wall")
    .map(([buildId]) => buildId);
}

/** A §7 body built at one depth, at a width every row can be made at. The width is held constant
 *  across the two kits on purpose: this criterion is about the depth axis, and a body built at two
 *  widths would let a width effect masquerade as a depth one. */
function catalogBodyDepthMm(cabinetDepthMm: number, buildId: string): number {
  return depthExtentMm(
    buildCatalogBody(kitAt(cabinetDepthMm), buildId, {
      widthM: 0.6,
      heightM: 0.7,
      depthM: 0.33,
    }),
  );
}

/** How much a measurement grows across the two declared depths — the shape every claim below takes,
 *  because a table of absolute depths would pass just as well if every number in it were wrong
 *  together. */
function shiftMm(measure: (cabinetDepthMm: number) => number): number {
  return (
    measure(DEEPEST_DECLARED_DEPTH_MM) - measure(SHALLOWEST_DECLARED_DEPTH_MM)
  );
}

/** What the formula moves an ordinary base cabinet by — the yardstick every other body is held to,
 *  read off the meshes rather than written down as 100. */
function baseCabinetShiftMm(): number {
  return shiftMm((depthMm) => catalogBodyDepthMm(depthMm, "base-cabinet"));
}

/** What this §7 row declares about the setting, taken from the catalogue built at the shallowest
 *  depth — the rule is a property of the entry, not of the depth it was materialised at. Typed as
 *  optional because that is the case the resolver below exists to refuse. */
function depthRuleOf(buildId: string): CabinetDepthRule | undefined {
  return buildInsertableBodyDefinitions(SHALLOWEST_DECLARED_DEPTH_MM).find(
    ([id]) => id === buildId,
  )?.[1].depthRule;
}

/** How far this entry's depth is **allowed** to move across the two declared depths: the base
 *  cabinet's own shift if it follows the setting, and nothing if it declares an exception. The
 *  switch is the domain's (`depthFollowsSetting`) rather than restated here, and an entry that
 *  declares neither throws out of `cabinetDepthRuleOf` instead of being read as pinned. */
function expectedShiftMm(query: CabinetDepthRuleQuery): number {
  return depthFollowsSetting(cabinetDepthRuleOf(query))
    ? baseCabinetShiftMm()
    : 0;
}

describe("every floor-standing catalogue body moves with the cabinet-depth setting", () => {
  it("moves an ordinary base cabinet by the 100 mm the two depths differ by", () => {
    expect(baseCabinetShiftMm()).toBe(100);
  });

  it.each(floorStandingBuildIds())("%s", (buildId) => {
    const shift = shiftMm((depthMm) => catalogBodyDepthMm(depthMm, buildId));

    // `fridge-free` is the one §7 row that is not cabinetry: a freestanding fridge is a machine
    // somebody else builds at 680 mm, and no setting reaches it. Its entry says so
    // (`IS_A_MANUFACTURED_SIZE`), and the exception is read off that declaration rather than
    // written here as an id — an entry that stopped following the setting without saying so would
    // otherwise be exempted by this test instead of caught by it.
    //
    // Read through `cabinetDepthRuleOf` and `depthFollowsSetting` rather than by matching
    // `follows` here, which is the whole point of those two existing. A row that declares nothing
    // **throws** (`UndeclaredCabinetDepthRuleError`) instead of comparing equal to 0 and passing
    // for standing still — the fail-open this gate exists to close.
    expect(shift).toBe(
      expectedShiftMm({ buildId, rule: depthRuleOf(buildId) }),
    );
  });

  // The gate on the gate: the exemption above is granted by a declaration, so a row that declares
  // nothing must not be able to take it. Written against the resolver the sweep itself calls, with
  // a row that exists nowhere in the catalogue — the fail-open this replaced returned 0 here, which
  // any body that did not move would have satisfied.
  it("refuses a row that declares no depth rule rather than exempting it", () => {
    expect(() =>
      expectedShiftMm({ buildId: "undeclared-row", rule: undefined }),
    ).toThrow(UndeclaredCabinetDepthRuleError);
  });
});

describe("the two corner legs move with it too, which is 5F's measured gap", () => {
  // Neither leg is a §7 row — §13.1 makes a corner structural, so there is nothing to insert and
  // nothing to swap — so they are reached through their builders directly. They are the two bodies
  // 5F's QA named first, and the X-leg is the one whose footprint is the declared depth itself
  // rather than the depth less a front overhang: it carries its 280 mm door on the *side*.
  it.each([
    ["cornerBaseX", (kit: Kit) => kit.make.cornerBaseX()],
    ["cornerBaseReturn", (kit: Kit) => kit.make.cornerBaseReturn()],
  ] as const)("%s", (_name, build) => {
    expect(shiftMm((depthMm) => depthExtentMm(build(kitAt(depthMm))))).toBe(
      baseCabinetShiftMm(),
    );
  });

  // The return leg's whole job is to meet the front plane of the run it butts into — the **tall**
  // run, not the base one: `cornerBaseReturn`'s own comment says its depth "must equal the front
  // plane of the neighbour it butts into (0.56 against a standard base cabinet, 0.58 against a
  // deeper tall unit)", and 0.58 is the shipped call. So the number that matters is not only that
  // the leg moved but that it landed on that plane again, and it is measured on both bodies rather
  // than on the constant either is built from — which is the whole reason a literal 0.58 was the
  // wrong thing to leave here.
  //
  // The 1 mm is the shipped relationship and is preserved rather than corrected: a column finishes
  // at 599 (`tallUnitFinishedDepthMm`) and the leg at 600, which is ADR 0058's own measurement of
  // `p23` as *"1 mm proud — flush"*. Closing it would move a shipped dimension.
  it.each(DECLARED_DEPTHS_MM)(
    "leaves the return leg 1 mm proud of the tall run it closes at %i mm",
    (cabinetDepthMm) => {
      const kit = kitAt(cabinetDepthMm);

      // Both bodies seat their back face on the wall plane (§11 row 19), so each one's own extent
      // *is* the distance from that plane to its front — which is what has to line up. Their local
      // `max.z` values do not, because their origins sit at different halves.
      expect(
        depthExtentMm(kit.make.cornerBaseReturn()) -
          depthExtentMm(kit.make.tallPantry(0.6, 2)),
      ).toBe(1);
    },
  );
});

describe("what stands inside a cabinet is a manufactured size and does not scale", () => {
  // Wave 6I's criterion 2, on the geometry: the *carcass* of a full-height cabinet follows the
  // setting and the oven and microwave mounted in it do not. The falsifiable form is that the oven
  // tower stays exactly one appliance-front deeper than the pantry beside it at **both** depths —
  // scaling the appliances would open that gap and pinning the tower would close it.
  it.each(DECLARED_DEPTHS_MM)(
    "keeps the oven tower one appliance front deeper than the pantry at %i mm",
    (cabinetDepthMm) => {
      expect(
        catalogBodyDepthMm(cabinetDepthMm, "tall-oven-tower") -
          catalogBodyDepthMm(cabinetDepthMm, "tall-pantry"),
      ).toBe(39);
    },
  );

  it.each(DECLARED_DEPTHS_MM)(
    "keeps the hob-and-oven base one oven fascia proud of its own worktop at %i mm",
    (cabinetDepthMm) => {
      expect(
        catalogBodyDepthMm(cabinetDepthMm, "base-hob-oven") -
          catalogBodyDepthMm(cabinetDepthMm, "base-cabinet"),
      ).toBe(28);
    },
  );

  // `docs/BACKLOG.md` entry 19, **recorded rather than fixed** here (ADR 0059). The dishwasher's
  // decor door follows the setting and `dw_body` does not, so the mounting clearance between them
  // closes as the setting drops and reaches zero at a 520 mm cabinet. This wave's criterion is only
  // that the floor is a number somebody read: both declared depths are measured here, on the
  // meshes, and both stand above it. Enforcing the floor is waves 6J and 6K.
  it.each([
    { cabinetDepthMm: 600, clearanceMm: 40 },
    { cabinetDepthMm: 700, clearanceMm: 90 },
  ])(
    "measures $clearanceMm mm between the decor door and the machine at $cabinetDepthMm mm",
    ({ cabinetDepthMm, clearanceMm }) => {
      const housing = kitAt(cabinetDepthMm).make.dishwasherHousing(0.6);
      housing.updateWorldMatrix(true, true);
      const faceMm = (meshName: string, side: "min" | "max"): number => {
        const mesh = housing.getObjectByName(meshName);
        if (!mesh) throw new Error(`no ${meshName} in the housing`);
        return Math.round(new THREE.Box3().setFromObject(mesh)[side].z * 1000);
      };

      expect(faceMm("door_front", "min") - faceMm("dw_body", "max")).toBe(
        clearanceMm,
      );
    },
  );

  it("builds both kits at a depth the product's own floor and map allow", () => {
    // Repointed 2026-09-06. This used to re-state ADR 0059's arithmetic over the literals above —
    // `(cabinetDepth − 40) / 2 − 240 > 0`, which evaluates `40 > 0` and `90 > 0` and calls no
    // production code, so it passed whatever the shipped floor was. Measured: dropping the overhang
    // term, which silently moves the floor to 480, left the whole adapter suite green.
    //
    // What it asks now is the one thing this file is entitled to ask and nobody else can: that the
    // two depths **it** builds its kits at are depths the domain still declares and still allows.
    // The floor's own value is pinned in the domain (`cabinet-depth-parameter.test.ts`), and the
    // clearance that produced it is measured on the meshes above and in `qa-5b10.adversarial`, so
    // neither is restated here.
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect([
        cabinetDepthMm,
        requireDeclaredCabinetDepthMm(cabinetDepthMm),
      ]).toEqual([cabinetDepthMm, cabinetDepthMm]);
    }
  });
});
