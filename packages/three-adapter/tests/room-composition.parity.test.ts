// **The gate that measures the room instead of the bodies in it.**
//
// M6 wave 6I2's finding, and QA's own sentence is the reason this file exists: *"`ci:local` passes
// because every gate measures per-body extents and none measures composition."* Wave 6I derived
// every body's depth and left three sets of *seats* literal — where each body stands — so at a
// 700 mm cabinet depth the reference room came apart while every per-body gate stayed green:
//
//   - the corner X-leg sank 70 mm into wall A instead of the 20 mm ADR 0025 declares,
//   - the corner return leg came 50 mm through wall B,
//   - the two corner legs' carcasses overlapped by 100 mm and their worktops by 700 × 100 mm,
//   - and both upper corner returns overlapped their wall-A neighbours by 70 mm.
//
// None of that is visible to a test that asks one body how deep it is. Every assertion here is about
// two things at once — a body and a wall, or a body and its neighbour — and each runs at **both**
// declared cabinet depths, because the class of defect is precisely "correct at the shipped depth".
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  readWallPlaneM,
  WALL_A_MESH_NAME,
  WALL_B_MESH_NAME,
} from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** The two cabinet depths ADR 0056 declares, with ADR 0028's map row for each. Written as data for
 *  the reason the tables in `cabinet-depth-parameter.test.ts` are: a test that reads the values it
 *  checks out of the module it checks proves nothing. */
const DECLARED_DEPTHS_MM = [
  { cabinetDepthMm: 600, wallDepthMm: 330 },
  { cabinetDepthMm: 700, wallDepthMm: 400 },
];

/** The room shell — not bodies, and not what this file is about. The pattern is anchored: an earlier
 *  draft used `/^wall_/` and silently excluded all twelve `wall_cabinet` bodies, which hid two of the
 *  four defects above. */
const SHELL_NAME = /^(wall_back|wall_left|floor|backsplash_wall_a)$/;

/** Millimetres, rounded. A `Box3` over the real geometry carries float noise a base seat shows as
 *  0.5800000047683715; this is the rounding `toMillimetres` exists to do, not a tolerance. */
function mm(metres: number): number {
  return Math.round(metres * 1000);
}

/** Two axis-aligned slabs that merely **share a face** are not intersecting — the corner worktops are
 *  built to butt, and the reference says so in as many words. Half a millimetre is comfortably below
 *  any real overlap (the smallest this file ever caught was 50 mm) and comfortably above float noise
 *  on a shared face, which is exactly zero. */
const SHARED_FACE_TOLERANCE_M = 0.0005;

interface RoomUnderTest {
  readonly room: THREE.Group;
  readonly wallAPlaneM: number;
  readonly wallBPlaneM: number;
}

const rooms = new Map<number, RoomUnderTest>();

beforeAll(() => {
  installHeadlessDocument();
  for (const { cabinetDepthMm, wallDepthMm } of DECLARED_DEPTHS_MM) {
    const kit: Kit = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm,
      wallDepthMm,
    });
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    rooms.set(cabinetDepthMm, {
      room,
      // Read off the wall meshes rather than written as 0, the way the probe reads them (§6.2's
      // second failed attempt was predicting a plane instead of measuring one).
      wallAPlaneM: readWallPlaneM(room, WALL_A_MESH_NAME),
      wallBPlaneM: readWallPlaneM(room, WALL_B_MESH_NAME),
    });
  }
});

function roomAt(cabinetDepthMm: number): RoomUnderTest {
  const built = rooms.get(cabinetDepthMm);
  if (!built) throw new Error(`no room at ${String(cabinetDepthMm)} mm`);
  return built;
}

function bodiesOf(room: THREE.Group): readonly THREE.Object3D[] {
  return room.children.filter((child) => !SHELL_NAME.test(child.name));
}

function boxOf(node: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(node);
}

const CABINET_DEPTHS_MM = DECLARED_DEPTHS_MM.map(
  ({ cabinetDepthMm }) => cabinetDepthMm,
);

describe("no body stands through a wall, at either declared depth", () => {
  /** Every body that reaches behind a wall plane, and by how far. Wall A's bodies extend along +z
   *  and wall B's along +x, so a negative distance on either axis is a body inside the wall. */
  function crossingsAt(cabinetDepthMm: number): readonly string[] {
    const { room, wallAPlaneM, wallBPlaneM } = roomAt(cabinetDepthMm);
    return bodiesOf(room)
      .flatMap((body) => {
        const box = boxOf(body);
        const behindA = mm(wallAPlaneM - box.min.z);
        const behindB = mm(wallBPlaneM - box.min.x);
        const worst = Math.max(behindA, behindB);
        return worst > 0 ? [`${body.name} ${String(worst)} mm`] : [];
      })
      .sort();
  }

  // **The two the reference room ships with, and they are decisions rather than defects.** ADR 0025
  // seats a corner leg from the L-joint and not from the wall, so the X-leg's 900 × 600 footprint
  // deliberately overhangs the plane; the run-end panel is a 600 mm slab centred on the base run's
  // seat, which puts its back edge 10 mm behind the same plane the run's worktops are 10 mm behind.
  //
  // Stated as an exact list rather than a maximum, so a *new* body crossing a wall fails here even
  // if it crosses by less than these two do.
  const SHIPPED_CROSSINGS = ["corner_base_x 20 mm", "end_panel_right 10 mm"];

  it.each(CABINET_DEPTHS_MM)("at %i mm", (cabinetDepthMm) => {
    expect(crossingsAt(cabinetDepthMm)).toEqual(SHIPPED_CROSSINGS);
  });

  // The assertion above pins the *names and depths*; this one says the room is the same room at both
  // depths, which is what actually broke — the X-leg's 20 mm became 70 and the return leg's 0 became
  // −50, and no per-body gate could see either.
  it("crosses exactly the same walls by exactly the same amounts at both depths", () => {
    const [shallowestMm, deepestMm] = CABINET_DEPTHS_MM;

    expect(crossingsAt(deepestMm ?? 700)).toEqual(
      crossingsAt(shallowestMm ?? 600),
    );
  });
});

describe("no two worktops occupy the same space, at either declared depth", () => {
  /** Every worktop slab in the room, with the body it belongs to.
   *
   *  Worktops are the right surface to test this on and an axis-aligned box is exact for them: they
   *  are flat slabs at one height, so a bounding-box intersection *is* a solid intersection. A
   *  whole-body box is not — two perpendicular corner legs have overlapping boxes at every depth,
   *  including the shipped one, without their solids touching. */
  function worktopsAt(
    cabinetDepthMm: number,
  ): readonly { readonly label: string; readonly box: THREE.Box3 }[] {
    const { room } = roomAt(cabinetDepthMm);
    const slabs: { label: string; box: THREE.Box3 }[] = [];
    for (const body of bodiesOf(room)) {
      body.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (!node.name.startsWith("countertop")) return;
        slabs.push({ label: `${body.name}/${node.name}`, box: boxOf(node) });
      });
    }
    return slabs;
  }

  function intersectionsAt(cabinetDepthMm: number): readonly string[] {
    const slabs = worktopsAt(cabinetDepthMm);
    const found: string[] = [];
    for (let i = 0; i < slabs.length; i++) {
      for (let j = i + 1; j < slabs.length; j++) {
        const a = slabs[i];
        const b = slabs[j];
        if (!a || !b) continue;
        const overlaps = (["x", "y", "z"] as const).map(
          (axis) =>
            Math.min(a.box.max[axis], b.box.max[axis]) -
            Math.max(a.box.min[axis], b.box.min[axis]),
        );
        if (overlaps.every((extent) => extent > SHARED_FACE_TOLERANCE_M)) {
          found.push(`${a.label} through ${b.label}`);
        }
      }
    }
    return found.sort();
  }

  it.each(CABINET_DEPTHS_MM)("at %i mm", (cabinetDepthMm) => {
    expect(intersectionsAt(cabinetDepthMm)).toEqual([]);
  });

  // Guards the emptiness above from being vacuous: there are worktops to compare, and enough of them
  // that the sweep is doing work. Nine slabs is the base run's four, the sink's four pieces around
  // its aperture and the corner legs' two — a filter that stopped matching would otherwise turn this
  // whole block green by finding nothing.
  it.each(CABINET_DEPTHS_MM)("has worktops to compare at %i mm", (depthMm) => {
    expect(worktopsAt(depthMm).length).toBeGreaterThanOrEqual(9);
  });
});

describe("no two carcasses occupy the same space, at either declared depth", () => {
  /** The meshes that make up a body's **shell** — what actually competes for floor and wall space.
   *
   *  Deliberately not `CARCASS_MESH_NAME_PATTERN` from `measure-built-body.ts`, which includes
   *  `counter`: the corner X-leg's worktop overhangs the return leg's carcass by 50 mm *by design*
   *  (the two slabs butt above, the two carcasses butt below), so a pattern with worktops in it reads
   *  the shipped corner as an overlap. Doors are out for the same reason — a leaf stands in front of
   *  its own carcass and is allowed to pass a neighbour's footprint at a hinge.
   *
   *  This is the measure that catches a body seated into its neighbour, which a whole-body box
   *  cannot: two perpendicular corner legs have overlapping *boxes* at every depth, the shipped one
   *  included, without their solids meeting. */
  const SHELL_MESH_NAME =
    /^(carcass_shell|carcass|side_left|side_right|plinth|fridge_body|hood_canopy)$/;

  function shellsAt(
    cabinetDepthMm: number,
  ): readonly { readonly label: string; readonly box: THREE.Box3 }[] {
    const { room } = roomAt(cabinetDepthMm);
    return bodiesOf(room).flatMap((body, index) => {
      const shell = new THREE.Box3();
      body.traverse((node) => {
        if (node instanceof THREE.Mesh && SHELL_MESH_NAME.test(node.name)) {
          shell.union(boxOf(node));
        }
      });
      return shell.isEmpty()
        ? []
        : [{ label: `${body.name}#${String(index)}`, box: shell }];
    });
  }

  function intersectionsAt(cabinetDepthMm: number): readonly string[] {
    const shells = shellsAt(cabinetDepthMm);
    const found: string[] = [];
    for (let i = 0; i < shells.length; i++) {
      for (let j = i + 1; j < shells.length; j++) {
        const a = shells[i];
        const b = shells[j];
        if (!a || !b) continue;
        const overlaps = (["x", "y", "z"] as const).map(
          (axis) =>
            Math.min(a.box.max[axis], b.box.max[axis]) -
            Math.max(a.box.min[axis], b.box.min[axis]),
        );
        if (overlaps.every((extent) => extent > SHARED_FACE_TOLERANCE_M)) {
          found.push(
            `${a.label} through ${b.label} by ${String(mm(Math.min(...overlaps)))} mm`,
          );
        }
      }
    }
    return found.sort();
  }

  it.each(CABINET_DEPTHS_MM)("at %i mm", (cabinetDepthMm) => {
    expect(intersectionsAt(cabinetDepthMm)).toEqual([]);
  });

  // Non-vacuity, and it matters more here than anywhere else in this file: the whole assertion is
  // that a list is empty, so a shell pattern that stopped matching would make it pass by measuring
  // nothing at all. Named rather than counted, so the two bodies that legitimately have no shell say
  // why they have none — a hob is a glass plate lying on a worktop, and a finished end panel is a
  // single slab. Anything else dropping out of the sweep fails here.
  it.each(CABINET_DEPTHS_MM)(
    "measures every body's shell at %i mm",
    (depthMm) => {
      const measured = new Set(
        shellsAt(depthMm).map((shell) => shell.label.split("#")[0]),
      );
      const missing = bodiesOf(roomAt(depthMm).room)
        .map((body) => body.name)
        .filter((name) => !measured.has(name));

      expect([...new Set(missing)].sort()).toEqual([
        "end_panel_right",
        "induction_cooktop",
      ]);
    },
  );
});

describe("the L-joint butts rather than overlaps, at either declared depth", () => {
  // ADR 0025: the two legs are independent bodies that meet on a shared face like any two cabinets.
  // The X-leg's carcass front is where wall B's whole run begins, so this is the one measurement the
  // rest of that run is positioned from — and it is the one that was frozen at the 600 mm arithmetic.
  function carcassEdgeMm(
    cabinetDepthMm: number,
    bodyName: string,
    edge: "front" | "near",
  ): number {
    const { room } = roomAt(cabinetDepthMm);
    const body = room.children.find((child) => child.name === bodyName);
    if (!body) throw new Error(`no ${bodyName} in the room`);
    const carcass = body.getObjectByName("carcass");
    if (!carcass) throw new Error(`${bodyName} has no carcass mesh`);
    const box = boxOf(carcass);
    return edge === "front" ? mm(box.max.z) : mm(box.min.z);
  }

  it.each(CABINET_DEPTHS_MM)(
    "puts the return leg's carcass on the X-leg's front face at %i mm",
    (cabinetDepthMm) => {
      expect(carcassEdgeMm(cabinetDepthMm, "corner_base_return", "near")).toBe(
        carcassEdgeMm(cabinetDepthMm, "corner_base_x", "front"),
      );
    },
  );

  // And the joint really does move with the setting, so the equality above is not two constants
  // agreeing. 570 at a 600 mm kitchen and 670 at a 700 mm one (580 and 680 before ADR 0135): the base
  // run's carcass front, which is the leg's seat plus half its own footprint.
  it("moves the joint along wall B as the cabinet deepens", () => {
    expect(carcassEdgeMm(600, "corner_base_x", "front")).toBe(570);
    expect(carcassEdgeMm(700, "corner_base_x", "front")).toBe(670);
  });
});
