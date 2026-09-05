// **The gate that measures where a part sits inside the body that contains it.**
//
// ADR 0087. Two shipped gates could not have caught the defect this file exists for:
// `cabinet-depth-sweep.parity.test.ts` measures each body's finished *envelope*, which the worktop
// defines and the hob never reaches, and `room-composition.parity.test.ts` measures bodies against
// walls and neighbours, and the hob intersects nothing. Neither asks where an appliance stands
// **inside** its own cabinet, so the hob stayed frozen at a 600 mm seat through a whole wave whose
// subject was depth parameterisation and drifted 50 mm backwards at 700.
//
// Every claim here is a **relation between two named meshes measured in one built kit**, swept over
// the depths ADR 0056 declares. A table of expected positions would pass just as well if every
// number in it were wrong together — which is precisely how this defect shipped.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** The two cabinet depths ADR 0056 declares, with ADR 0028's wall-depth row for each. Written here
 *  as data for the reason `room-composition.parity.test.ts` writes them out too: a test that read
 *  the values it checks out of the module it checks would prove nothing. */
const SHALLOWEST_DECLARED_DEPTH_MM = 600;
const DEEPEST_DECLARED_DEPTH_MM = 700;
const DECLARED_DEPTHS_MM = [
  { cabinetDepthMm: SHALLOWEST_DECLARED_DEPTH_MM, wallDepthMm: 330 },
  { cabinetDepthMm: DEEPEST_DECLARED_DEPTH_MM, wallDepthMm: 400 },
];

const DECLARED_CABINET_DEPTHS_MM = [
  SHALLOWEST_DECLARED_DEPTH_MM,
  DEEPEST_DECLARED_DEPTH_MM,
];

/** The two §7 rows that carry a hob, both of which seat it through `seatHobOnWorktop`. */
const HOB_BEARING_BUILD_IDS = ["base-hob-2drawer", "base-hob-oven"] as const;

/** The owner's sentence in millimetres (ADR 0087 decision 4): *"you should use easy the back hob
 *  circles in same way as it was 600 mm worktop."* The cook stands at the worktop's front edge, so
 *  the reach to the back burners is the distance between those two, and it is the same number at
 *  every declared depth. 420 is what the shipped 600 mm kitchen measures. */
const BACK_BURNER_REACH_MM = 420;

/** ADR 0087 decision 1's declared fact, written here as data rather than read out of the module
 *  under test — a test that imported the constant would pass for any value of it. */
const FRONT_CLEARANCE_MM = 10;

/** How much worktop is left **behind** the hob, against the wall, at each declared depth. Two rows
 *  rather than one difference: the clearance in front is also satisfiable by a hob that shrank, and
 *  this pair with the fixed plate size pins which way the gap opens. */
const GAP_TO_WALL_MM = [
  { cabinetDepthMm: SHALLOWEST_DECLARED_DEPTH_MM, gapMm: 90 },
  { cabinetDepthMm: DEEPEST_DECLARED_DEPTH_MM, gapMm: 190 },
];

/** The owner's *"aligned to cabinets fronts"*, measured: what the hob stands proud of the drawer
 *  fronts of its own cabinet by, at every declared depth. */
const PROUD_OF_DRAWER_FRONTS_MM = 22;

/** And of the oven fascia in the same body — the 50 mm splay `base-hob-oven` opened at 700. */
const PROUD_OF_OVEN_FASCIA_MM = 29;

/** How far inside the hob's own footprint each end of the hood canopy stands, in the built room.
 *  The 500 mm canopy is shallower than the 520 mm plate, so it is the canopy that is inset, evenly
 *  at both ends — which is what "the extraction is over the pan" means once both follow the front. */
const CANOPY_INSET_IN_HOB_MM = 10;

/** A body built at a width every hob-bearing row can be made at, held constant across the sweep:
 *  this claim is about the depth axis, and a body built at two widths would let a width effect
 *  masquerade as a depth one. */
const SWEPT_BODY_SIZE = { widthM: 0.6, heightM: 0.7, depthM: 0.33 };

const kits = new Map<number, Kit>();
const rooms = new Map<number, THREE.Group>();

beforeAll(() => {
  installHeadlessDocument();
  for (const { cabinetDepthMm, wallDepthMm } of DECLARED_DEPTHS_MM) {
    const kit = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm,
      wallDepthMm,
    });
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    kits.set(cabinetDepthMm, kit);
    rooms.set(cabinetDepthMm, room);
  }
});

function kitAt(cabinetDepthMm: number): Kit {
  const kit = kits.get(cabinetDepthMm);
  if (!kit) throw new Error(`no kit at ${String(cabinetDepthMm)} mm`);
  return kit;
}

function roomAt(cabinetDepthMm: number): THREE.Group {
  const room = rooms.get(cabinetDepthMm);
  if (!room) throw new Error(`no room at ${String(cabinetDepthMm)} mm`);
  return room;
}

/** Millimetres, rounded. A `Box3` over the real geometry carries float noise a base seat shows as
 *  0.5800000047683715; this is the rounding `toMillimetres` exists to do, not a tolerance. */
function mm(metres: number): number {
  return Math.round(metres * 1000);
}

function buildSweptBody(cabinetDepthMm: number, buildId: string): THREE.Group {
  const body = buildCatalogBody(
    kitAt(cabinetDepthMm),
    buildId,
    SWEPT_BODY_SIZE,
  );
  body.updateWorldMatrix(true, true);
  return body;
}

function meshesNamed(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.name === name) found.push(object);
  });
  if (found.length === 0) throw new Error(`no ${name} in ${root.name}`);
  return found;
}

/** The extreme face of every mesh carrying this name, in the frame of the root it is measured in. */
function faceMm(
  root: THREE.Object3D,
  name: string,
  side: "min" | "max",
): number {
  const bounds = new THREE.Box3();
  for (const mesh of meshesNamed(root, name)) {
    bounds.union(new THREE.Box3().setFromObject(mesh));
  }
  return mm(bounds[side].z);
}

/** Where the two **back** burner rings are centred, along the depth axis.
 *
 *  Read off the four `burner_ring` meshes rather than off a seat constant, and the back row is
 *  found by grouping them instead of by index: a cooktop whose rings were reordered would otherwise
 *  quietly change which pair this measures. The pair must agree to the millimetre — two burners on
 *  one row of an induction plate are on one line. */
function backBurnerCentreMm(root: THREE.Object3D): number {
  const centres = meshesNamed(root, "burner_ring").map((ring) =>
    mm(new THREE.Box3().setFromObject(ring).getCenter(new THREE.Vector3()).z),
  );
  const backRowMm = Math.min(...centres);

  expect(centres.filter((z) => z === backRowMm)).toHaveLength(2);
  return backRowMm;
}

describe("the hob holds its reach to the cook at every declared cabinet depth", () => {
  // ADR 0087 decision 4, and the whole reason this file exists. It fails on the code that shipped
  // wave 6K — 420 mm at 600 against 470 mm at 700 — because `HOB_FORWARD_OFFSET_M` was a metre
  // literal frozen at the 600 mm arithmetic while the worktop around it grew fore and aft.
  it.each(HOB_BEARING_BUILD_IDS)(
    "%s keeps the worktop front edge one reach from the back burners",
    (buildId) => {
      for (const cabinetDepthMm of DECLARED_CABINET_DEPTHS_MM) {
        const body = buildSweptBody(cabinetDepthMm, buildId);

        expect({
          cabinetDepthMm,
          reachMm: faceMm(body, "countertop", "max") - backBurnerCentreMm(body),
        }).toEqual({ cabinetDepthMm, reachMm: BACK_BURNER_REACH_MM });
      }
    },
  );

  // The declared fact itself, and the corollary ADR 0087 decision 5 names with it: the appliance
  // stays strictly **behind** the worktop's front edge — 10 mm, not zero — so each body still
  // finishes where `baseFinishedDepthMm` and `hobOvenBaseFinishedDepthMm` declare it does. A flush
  // hob would be the front-most mesh of its own body and would silently change what the domain says
  // that body occupies.
  it.each(HOB_BEARING_BUILD_IDS)(
    "%s leaves one declared clearance of worktop in front of the hob",
    (buildId) => {
      for (const cabinetDepthMm of DECLARED_CABINET_DEPTHS_MM) {
        const body = buildSweptBody(cabinetDepthMm, buildId);

        expect({
          cabinetDepthMm,
          clearanceMm:
            faceMm(body, "countertop", "max") -
            faceMm(body, "cooktop_glass", "max"),
        }).toEqual({ cabinetDepthMm, clearanceMm: FRONT_CLEARANCE_MM });
      }
    },
  );

  // Every millimetre of added depth lands **behind** the hob, against the wall — the owner's own
  // words. The worktop's back edge is the wall plane (§11 row 19), so the gap is measured to it.
  it.each(GAP_TO_WALL_MM)(
    "leaves $gapMm mm between the hob and the wall at $cabinetDepthMm mm",
    ({ cabinetDepthMm, gapMm }) => {
      const body = buildSweptBody(cabinetDepthMm, "base-hob-2drawer");

      expect(
        faceMm(body, "cooktop_glass", "min") -
          faceMm(body, "countertop", "min"),
      ).toBe(gapMm);
    },
  );

  // And that those two rows are the *whole* depth increase rather than two numbers that happen to
  // differ — measured again off the meshes, so a third declared depth extends the claim instead of
  // needing a third row written for it.
  it("grows that gap by exactly what the setting grows by", () => {
    const gapToWallMm = (cabinetDepthMm: number): number => {
      const body = buildSweptBody(cabinetDepthMm, "base-hob-2drawer");
      return (
        faceMm(body, "cooktop_glass", "min") - faceMm(body, "countertop", "min")
      );
    };

    expect(
      gapToWallMm(DEEPEST_DECLARED_DEPTH_MM) -
        gapToWallMm(SHALLOWEST_DECLARED_DEPTH_MM),
    ).toBe(DEEPEST_DECLARED_DEPTH_MM - SHALLOWEST_DECLARED_DEPTH_MM);
  });
});

describe("the hob stands on the plane of the fronts around it", () => {
  // The owner's *"aligned to cabinets fronts"*, on the meshes: whatever the hob stands proud of the
  // drawer fronts by, it stands proud by the same at every depth. On the shipped code it went from
  // 22 mm proud to 28 mm behind — the appliance receding past the plane of the cabinet it is
  // mounted on.
  it.each(DECLARED_CABINET_DEPTHS_MM)(
    "stands one handle's reach proud of its own drawer fronts at %i mm",
    (cabinetDepthMm) => {
      const body = buildSweptBody(cabinetDepthMm, "base-hob-2drawer");

      expect(
        faceMm(body, "cooktop_glass", "max") -
          faceMm(body, "drawer_front", "max"),
      ).toBe(PROUD_OF_DRAWER_FRONTS_MM);
    },
  );

  // `base-hob-oven` carries two appliances in one cabinet, and they must not splay: the oven fascia
  // already follows the carcass front (`OVEN_FORWARD_OFFSET_M`), so the hob has to as well. 50 mm of
  // disagreement opened here on the shipped code — 29 mm proud at 600, 21 mm behind at 700.
  it.each(DECLARED_CABINET_DEPTHS_MM)(
    "stands the same distance proud of the oven fascia below it at %i mm",
    (cabinetDepthMm) => {
      const body = buildSweptBody(cabinetDepthMm, "base-hob-oven");

      expect(
        faceMm(body, "cooktop_glass", "max") -
          faceMm(body, "oven_front", "max"),
      ).toBe(PROUD_OF_OVEN_FASCIA_MM);
    },
  );
});

describe("the extraction stays over the pan", () => {
  // `docs/design/DEVELOPMENT-SPEC.md` line 610 names this relationship in as many words —
  // *"Positions carry meaning — sink under the window, hob under the hood, dishwasher beside the
  // sink."* ADR 0039 hangs the hood at the front, so once the hob follows the front too the two
  // stay concentric; on the shipped code the extraction sat 60 mm forward of the pan at 700.
  //
  // Measured in the built room, where the seeded cooktop and the hood are **siblings** rather than
  // one parented to the other — `kitchen-parts.decomposition.parity.test.ts` diffs the reference
  // room child by child.
  it.each(DECLARED_CABINET_DEPTHS_MM)(
    "centres the hood canopy over the hob at %i mm",
    (cabinetDepthMm) => {
      const room = roomAt(cabinetDepthMm);

      expect({
        atTheWallMm:
          faceMm(room, "hood_canopy", "min") -
          faceMm(room, "cooktop_glass", "min"),
        atTheCookMm:
          faceMm(room, "cooktop_glass", "max") -
          faceMm(room, "hood_canopy", "max"),
      }).toEqual({
        atTheWallMm: CANOPY_INSET_IN_HOB_MM,
        atTheCookMm: CANOPY_INSET_IN_HOB_MM,
      });
    },
  );
});

describe("moving the hob moves nothing else", () => {
  // ADR 0087 decision 5: no stored document is migrated, and that is measured rather than assumed.
  // Both hob-bearing bodies' finished extents are what they were — the hob stays inside the mesh
  // that defines each of them — so `occupied-depth.parity.test.ts` holds with its declarations
  // untouched and no schema version moves.
  it.each(DECLARED_CABINET_DEPTHS_MM)(
    "leaves base-hob-2drawer finishing at its worktop, like any base cabinet, at %i mm",
    (cabinetDepthMm) => {
      const extentMm = (buildId: string): number => {
        const bounds = new THREE.Box3().setFromObject(
          buildSweptBody(cabinetDepthMm, buildId),
        );
        return mm(bounds.max.z - bounds.min.z);
      };

      expect(extentMm("base-hob-2drawer")).toBe(extentMm("base-cabinet"));
    },
  );

  // The oven, its filler band and the tower's microwave are all derived from `carcassFrontM`
  // already and must not move: the splay closes because the hob comes to where the oven is, not the
  // other way round. Each of these follows the setting, so each shifts by the 50 mm the front does.
  it.each([
    ["oven_front", "base-hob-oven"],
    ["oven_filler_door_front", "base-hob-oven"],
    ["mw_front", "tall-oven-tower"],
  ] as const)("leaves %s tracking the carcass front", (meshName, buildId) => {
    const frontMm = (cabinetDepthMm: number): number =>
      faceMm(buildSweptBody(cabinetDepthMm, buildId), meshName, "max");
    const carcassFrontMm = (cabinetDepthMm: number): number =>
      faceMm(
        buildSweptBody(cabinetDepthMm, "base-cabinet"),
        "carcass_shell",
        "max",
      );

    expect(
      frontMm(DEEPEST_DECLARED_DEPTH_MM) -
        frontMm(SHALLOWEST_DECLARED_DEPTH_MM),
    ).toBe(
      carcassFrontMm(DEEPEST_DECLARED_DEPTH_MM) -
        carcassFrontMm(SHALLOWEST_DECLARED_DEPTH_MM),
    );
  });
});
