// M7 wave 7D4 slice S4 — criterion 15, the wave's only assertion outside `configurator-domain`.
//
// **Risk 8 is what this file is for.** Until 7D4 `base-3drawer` stood in a kitchen only where a
// customer put one. Its fronts, its handles and its price are now produced by a **run**, so a later
// wave that changes that row's declaration changes generated kitchens — and generation had no parity
// coverage of it at all. Everything here is built through the **real probe**, never a fake: a fake
// reports back the depth it was handed, so a domain test with one cannot see a body that does not
// stand where the plan says (backlog entry 9).
//
// **A drawer is reached through provenance, never through a build id, and that is a measured
// correction rather than a preference.** The **preparation** core module carries `base-3drawer` from
// this wave on (ADR 0110 Amendment F5), so *a placement whose build id is the drawer's* is satisfied
// in every placed kitchen whether or not the storage run composed one. Measured: with the composer's
// drawer slot set to `undefined` — the wave's central rule deleted outright — the build-id form of
// this file passed 15 of 15 while the domain suite went 8 red. Every claim about *the slot the run
// reaches after the hob* therefore goes through `isComposedStorageSlot` and the log's own step, which is
// the only thing that says which module planned a placement.
//
// **The composed slots still take two bodies; the third arrives as a module of its own.** 7D4 placed
// `base-panbank` nowhere. Since 7D5 S2 / Q-H6a (ADR 0110 Amendments J, K) the plan's own `pan-drawer`
// module stands it immediately before the hob — never in a composed storage slot — and since
// S3 / Q-H5 (Amendment L) a `threshold-drawer` module stands a second `base-3drawer` after the hob in
// *D* >= 6 kitchens short of drawers. Neither is a composed slot (`isComposedStorageSlot` answers
// false), so each claim below reaches them through the log's step id, never through a build id.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  doorLeafCount,
  drawerCount,
  DOOR_BASE_BUILD_ID,
  generateKitchen,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  PAN_DRAWER_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
  type DesignWall,
  type GenerationLog,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createBodyProbe,
  readWallPlaneM,
  WALL_A_MESH_NAME,
  WALL_B_MESH_NAME,
} from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";

/** `room-composition.parity.test.ts`'s own tolerance, retyped rather than imported for the reason
 *  that file's neighbours retype it: a gate that reads its definition of *touching* out of the code
 *  it checks proves only that the code equals itself. */
const SHARED_FACE_TOLERANCE_M = 0.0005;
const WALL_PLANE_EPSILON_M = 1e-6;
const SHELL_MESH_NAME =
  /^(carcass_shell|carcass|side_left|side_right|plinth|fridge_body|hood_canopy)$/;

/** `kitchen-parts.ts`'s two front names, retyped for the same reason. */
const DRAWER_FRONT_MESH_NAME = "drawer_front";
const DOOR_FRONT_MESH_NAME = "door_front";

/** The rooms every geometry assertion below is run over. The reference room is kept as the
 *  **counter-case**: generation stands no drawer in a composed slot in it at all — both of its wall-B
 *  composed slots take the door body and its only `base-3drawer` is the preparation core module — so it
 *  is the room that catches a claim selecting a drawer by build id. 6 300 x 4 700 stands one in a
 *  composed slot; the other two carry their drawers in the plan's own modules instead.
 *
 *  **The wall-B room moved for M7 wave 7D8 and the reason it was chosen did not.** It was
 *  900 x 4700, where the whole run stood on wall B and the layout ran against the reading order.
 *  After the re-key that room's run follows wall B the other way, the block takes its free end and it
 *  composes **no** storage slot at all — so it can no longer sample a drawer in a composed slot.
 *  1 500 x 3 400 was then chosen as the same subject on the same wall.
 *
 *  **7D5 S2 / Q-H6a moved the drawer again.** 1 500 x 3 400's hob wall has one slot left, the pan
 *  drawer takes it and the post-hob drawer slot is gone (ADR 0110 K1), so it is kept here as the room
 *  where the pan drawer displaces the composed drawer (`PAN_DRAWER_TAKES_THE_ONLY_SLOT_ROOM`), and the
 *  wall-B drawer-slot witness moves to 4 100 x 6 100 (K8's declared witness).
 *  **S3 / Q-H5:** 5 100 x 4 700 is the room that stands a `threshold-drawer`, measured through the
 *  real probe, inside the approved policy. */
const PAN_DRAWER_TAKES_THE_ONLY_SLOT_ROOM: Design["room"] = {
  shape: "L",
  widthMm: 1500,
  depthMm: 3400,
  heightMm: 2600,
};
const THRESHOLD_DRAWER_ROOM: Design["room"] = {
  shape: "L",
  widthMm: 5100,
  depthMm: 4700,
  heightMm: 2600,
};
const SAMPLE_ROOMS: readonly Design["room"][] = [
  KITCHEN_L_DESIGN.room,
  // Past the approved 6000 mm on purpose (M7 7A3): 7D4's measured witness, a storable room.
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
  PAN_DRAWER_TAKES_THE_ONLY_SLOT_ROOM,
  THRESHOLD_DRAWER_ROOM,
];

/** The rooms whose plan stands a `pan-drawer` module (7D5 S2 / Q-H6a). The reference room is the
 *  counter-case and is not listed: its plan has none. */
const PAN_DRAWER_ROOMS: readonly Design["room"][] = SAMPLE_ROOMS.filter(
  (room) => room !== KITCHEN_L_DESIGN.room,
);

const PAN_DRAWER_MODULE_ID = "pan-drawer";
const THRESHOLD_DRAWER_MODULE_ID = "threshold-drawer";
const HOB_MODULE_ID = "hob";

interface DrawerSlotRoom {
  readonly room: Design["room"];
  readonly wall: DesignWall;
}

/** The two rooms whose generated run stands the drawer body in a slot the **storage run** composed,
 *  chosen so the slot lands on a different wall in each. Measured through the real probe: at
 *  6300 x 4700 wall A is the wider wall and the slot is its first composed one, standing behind the
 *  core; at 4100 x 6100 wall B is the wider wall, so the run ends there and the slot is wall B's
 *  first composed one — while wall A's composed slots are read **before** the hob and keep their
 *  doors (D15.7 on physical wall B, 7D8's P6a). */
const DRAWER_SLOT_ROOMS: readonly DrawerSlotRoom[] = [
  // Past the approved 6000 mm on purpose (M7 7A3): 7D4's measured witness, a storable room.
  {
    room: { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
    wall: "A",
  },
  // 7D5 S2 / Q-H6a: was 1500 x 3400, where the pan drawer now takes the hob wall's only slot and the
  // post-hob drawer slot is gone (ADR 0110 K1). Wall B 6100 mm is past the approved 6000 mm on
  // purpose: K8 empties D15.7's physical wall-B arm inside the policy and declares this room instead.
  {
    room: { shape: "L", widthMm: 4100, depthMm: 6100, heightMm: 2600 },
    wall: "B",
  },
];

beforeAll(() => {
  installHeadlessDocument();
});

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

interface GeneratedKitchen {
  readonly design: Design;
  readonly log: GenerationLog;
}

function generated(room: Design["room"]): GeneratedKitchen {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!result.ok) throw new Error(`sample room refused: ${result.reason.code}`);
  return result;
}

interface RenderedDesign {
  readonly kit: Kit;
  readonly room: THREE.Group;
  readonly solids: THREE.Group;
  readonly design: Design;
  readonly log: GenerationLog;
}

function render(kitchen: GeneratedKitchen): RenderedDesign {
  const { design } = kitchen;
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
  const room = kit.builders["kitchen-l"]();
  const solids = new THREE.Group();
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  syncSolidBodies({ kit, solidsRoot: solids, records, room: design.room });
  solids.updateWorldMatrix(true, true);
  return { kit, room, solids, design, log: kitchen.log };
}

function placementBodies(rendered: RenderedDesign) {
  return rendered.solids.children.flatMap((body) => {
    const placementId = body.userData["placementId"] as string | undefined;
    if (!placementId) return [];
    const placement = rendered.design.placements.find(
      (candidate) => candidate.id === placementId,
    );
    if (!placement) {
      throw new Error(`rendered unknown placement ${placementId}`);
    }
    return [{ body, placement }];
  });
}

/** The planned id behind each built placement, read off the log's own step. A placement carries the
 *  shell's id and no provenance of its own, and the log's step is the only thing that says which
 *  module of the plan produced it. */
function plannedIdByPlacement(log: GenerationLog): ReadonlyMap<string, string> {
  return new Map(
    log.steps.flatMap((step) =>
      step.status === "placed" ? [[step.placementId, step.id] as const] : [],
    ),
  );
}

/** Every built body with the planned id of the module that placed it. */
function plannedBodies(rendered: RenderedDesign) {
  const plannedIds = plannedIdByPlacement(rendered.log);
  return placementBodies(rendered).flatMap(({ body, placement }) => {
    const plannedId = plannedIds.get(placement.id);
    return plannedId === undefined ? [] : [{ body, placement, plannedId }];
  });
}

/** Every built body standing in a slot the **storage run** composed. Never `role === "storage"`,
 *  which the tall-end block's full-height columns also carry (ADR 0110 E5.2), and never a build id. */
function composedSlotBodies(rendered: RenderedDesign) {
  return plannedBodies(rendered).filter(({ plannedId }) =>
    isComposedStorageSlot({ id: plannedId }),
  );
}

/** The planned ids of the log's placed steps, in the log's own order. */
function placedModuleIds(log: GenerationLog): readonly string[] {
  return log.steps.flatMap((step) =>
    step.status === "placed" ? [step.id] : [],
  );
}

function plannedBodyOf(rendered: RenderedDesign, plannedId: string) {
  const found = plannedBodies(rendered).filter(
    (planned) => planned.plannedId === plannedId,
  );
  const [only] = found;
  if (found.length !== 1 || !only) {
    throw new Error(
      `expected one built ${plannedId}, found ${String(found.length)}`,
    );
  }
  return only;
}

/** The union of a body's carcass meshes — its fronts and worktop excluded, as in the shared-face
 *  check, because a front may legitimately overhang a neighbour's carcass line. */
function shellBoxOf(body: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  body.traverse((node) => {
    if (isMesh(node) && SHELL_MESH_NAME.test(node.name)) {
      box.union(new THREE.Box3().setFromObject(node));
    }
  });
  return box;
}

/** Signed distance along a wall between two shell boxes: 0 when they share a face, negative when
 *  they overlap. Wall A runs along x, wall B along z. */
function gapAlongWallM(wall: DesignWall, left: THREE.Box3, right: THREE.Box3) {
  const axis = wall === "A" ? "x" : "z";
  return Math.max(
    left.min[axis] - right.max[axis],
    right.min[axis] - left.max[axis],
  );
}

function builtFrontCount(body: THREE.Object3D, meshName: string): number {
  let fronts = 0;
  body.traverse((node) => {
    if (isMesh(node) && node.name === meshName) fronts += 1;
  });
  return fronts;
}

function declaredFrontsOf(placement: DesignPlacement, design: Design) {
  const definition = buildKitchenLBodyCatalog(cabinetDepthMmOf(design)).get(
    placement.body.buildId,
  );
  if (!definition) {
    throw new Error(`the catalogue holds no ${placement.body.buildId}`);
  }
  const query = {
    buildId: placement.body.buildId,
    rule: definition.fronts,
    widthMm: placement.body.widthMm,
    frameHeightMm: placement.body.heightMm,
  };
  return { drawers: drawerCount(query), doorLeaves: doorLeafCount(query) };
}

describe("a generated run's storage bodies, built by the real adapter", () => {
  it.each(SAMPLE_ROOMS)(
    "fills its composed slots from the two composed bodies and stands the pan drawer only as the plan's pan-drawer module in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const slotBodies = composedSlotBodies(rendered).map(
          ({ placement, plannedId }) =>
            `${plannedId}:${placement.body.buildId}`,
        );
        const panDrawerBodies = plannedBodies(rendered)
          .filter(
            ({ placement }) =>
              placement.body.buildId === PAN_DRAWER_BASE_BUILD_ID,
          )
          .map(({ plannedId }) => plannedId);
        const plannedPanDrawers = placedModuleIds(rendered.log).filter(
          (id) => id === PAN_DRAWER_MODULE_ID,
        );

        expect(slotBodies).not.toEqual([]);
        expect(
          slotBodies.filter(
            (slot) =>
              !slot.endsWith(DOOR_BASE_BUILD_ID) &&
              !slot.endsWith(THREE_DRAWER_BASE_BUILD_ID),
          ),
        ).toEqual([]);
        // 7D5 S2 / Q-H6a: was `not.toContain(PAN_DRAWER_BASE_BUILD_ID)` over every placement. The pan
        // drawer now stands wherever the plan's own `pan-drawer` module put it, and nowhere else.
        expect(panDrawerBodies).toEqual(plannedPanDrawers);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(DRAWER_SLOT_ROOMS)(
    "stands the drawer body in exactly one composed slot, on the wall the reading order reaches after the hob, in %o",
    ({ room, wall }) => {
      // **The wave's central rule, asserted where a build id cannot answer it.** The preparation core
      // module carries the same body, so `a drawer exists` is true in every placed kitchen; what is
      // true only while the composer's rule holds is that a slot the *storage run* composed carries one.
      const rendered = render(generated(room));
      try {
        const drawerSlots = composedSlotBodies(rendered).filter(
          ({ placement }) =>
            placement.body.buildId === THREE_DRAWER_BASE_BUILD_ID,
        );

        expect(THREE_DRAWER_BASE_BUILD_ID).not.toBe(DOOR_BASE_BUILD_ID);
        expect(drawerSlots.map(({ placement }) => placement.wall)).toEqual([
          wall,
        ]);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(DRAWER_SLOT_ROOMS)(
    "builds three drawer fronts and no leaf in that composed slot, in %o",
    ({ room }) => {
      const rendered = render(generated(room));
      try {
        const drawerSlots = composedSlotBodies(rendered).filter(
          ({ placement }) =>
            placement.body.buildId === THREE_DRAWER_BASE_BUILD_ID,
        );

        expect(drawerSlots).not.toEqual([]);
        for (const { body, plannedId } of drawerSlots) {
          expect([
            plannedId,
            builtFrontCount(body, DRAWER_FRONT_MESH_NAME),
            builtFrontCount(body, DOOR_FRONT_MESH_NAME),
          ]).toEqual([plannedId, 3, 0]);
        }
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  // 7D5 S2 / Q-H6a: the witness 1500 x 3400 left the drawer-slot rooms above because the pan drawer
  // took its hob wall's only slot (ADR 0110 K1). It is kept here as the room that shows the swap.
  it("stands the pan drawer on the hob's wall and no drawer in a composed slot where the hob's wall has one slot, in 1500 x 3400", () => {
    const rendered = render(generated(PAN_DRAWER_TAKES_THE_ONLY_SLOT_ROOM));
    try {
      const composedDrawers = composedSlotBodies(rendered).filter(
        ({ placement }) =>
          placement.body.buildId === THREE_DRAWER_BASE_BUILD_ID,
      );

      expect(
        composedDrawers.map(
          ({ plannedId, placement }) => `${plannedId}@${placement.wall}`,
        ),
      ).toEqual([]);

      const hob = plannedBodyOf(rendered, HOB_MODULE_ID);
      const panDrawer = plannedBodyOf(rendered, PAN_DRAWER_MODULE_ID);
      expect([panDrawer.placement.wall, hob.placement.wall]).toEqual([
        "B",
        "B",
      ]);
    } finally {
      disposeKit(rendered.kit, rendered.room);
    }
  });

  it.each(PAN_DRAWER_ROOMS)(
    "builds the plan's pan drawer as a pan-drawer body sharing a face with the hob, in %o",
    (room) => {
      // 7D5 S2 / Q-H6a: the pan drawer stands immediately before the hob. Which side is "before" is
      // the domain's reading order; what the adapter must honour is that the two bodies touch.
      const rendered = render(generated(room));
      try {
        const hob = plannedBodyOf(rendered, HOB_MODULE_ID);
        const panDrawer = plannedBodyOf(rendered, PAN_DRAWER_MODULE_ID);
        const gapM = gapAlongWallM(
          hob.placement.wall,
          shellBoxOf(hob.body),
          shellBoxOf(panDrawer.body),
        );

        expect(panDrawer.placement.body.buildId).toBe(PAN_DRAWER_BASE_BUILD_ID);
        expect(panDrawer.placement.wall).toBe(hob.placement.wall);
        expect(Math.abs(gapM)).toBeLessThanOrEqual(SHARED_FACE_TOLERANCE_M);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it("builds the plan's threshold drawer as three drawer fronts, on the far side of the hob from the pan drawer, in 5100 x 4700", () => {
    // S3 / Q-H5: a `threshold-drawer` module stands a 600 mm `base-3drawer` after the hob in a
    // D >= 6 kitchen short of drawers. It is not a composed slot, so it is reached by its step id.
    const rendered = render(generated(THRESHOLD_DRAWER_ROOM));
    try {
      const threshold = plannedBodyOf(rendered, THRESHOLD_DRAWER_MODULE_ID);
      const hob = plannedBodyOf(rendered, HOB_MODULE_ID);
      const panDrawer = plannedBodyOf(rendered, PAN_DRAWER_MODULE_ID);
      const axis = hob.placement.wall === "A" ? "x" : "z";
      const centreAlongWall = (body: THREE.Object3D) =>
        shellBoxOf(body).getCenter(new THREE.Vector3())[axis];
      const hobCentre = centreAlongWall(hob.body);

      expect([
        threshold.placement.body.buildId,
        threshold.placement.body.widthMm,
        threshold.placement.wall,
        isComposedStorageSlot({ id: threshold.plannedId }),
      ]).toEqual([THREE_DRAWER_BASE_BUILD_ID, 600, hob.placement.wall, false]);
      expect([
        builtFrontCount(threshold.body, DRAWER_FRONT_MESH_NAME),
        builtFrontCount(threshold.body, DOOR_FRONT_MESH_NAME),
      ]).toEqual([3, 0]);
      expect(Math.sign(centreAlongWall(threshold.body) - hobCentre)).toBe(
        -Math.sign(centreAlongWall(panDrawer.body) - hobCentre),
      );
    } finally {
      disposeKit(rendered.kit, rendered.room);
    }
  });

  it.each(SAMPLE_ROOMS)(
    "draws each storage body's declared fronts where the run put it, in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const storageBodies = placementBodies(rendered).filter(
          ({ placement }) =>
            // 7D5 S2 / Q-H6a: the pan drawer now stands in generated runs, so its fronts join the check.
            [
              DOOR_BASE_BUILD_ID,
              THREE_DRAWER_BASE_BUILD_ID,
              PAN_DRAWER_BASE_BUILD_ID,
            ].includes(placement.body.buildId),
        );
        const drawn = storageBodies.map(({ body, placement }) => ({
          id: `${placement.id}:${placement.body.buildId}`,
          drawers: builtFrontCount(body, DRAWER_FRONT_MESH_NAME),
          doorLeaves: builtFrontCount(body, DOOR_FRONT_MESH_NAME),
        }));
        const declared = storageBodies.map(({ placement }) => ({
          id: `${placement.id}:${placement.body.buildId}`,
          ...declaredFrontsOf(placement, rendered.design),
        }));

        expect(drawn).toEqual(declared);
        expect(drawn).not.toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(SAMPLE_ROOMS)(
    "seats every generated body's back face on its own wall plane in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const wallPlanes = {
          A: readWallPlaneM(rendered.room, WALL_A_MESH_NAME),
          B: readWallPlaneM(rendered.room, WALL_B_MESH_NAME),
        } as const;
        const offWall = placementBodies(rendered).flatMap(
          ({ body, placement }) => {
            const box = new THREE.Box3().setFromObject(body);
            const back = placement.wall === "A" ? box.min.z : box.min.x;
            const expected =
              placement.body.buildId === "base-corner-x-900"
                ? wallPlanes[placement.wall] - 0.02
                : placement.body.buildId === "hood"
                  ? wallPlanes[placement.wall] + 0.1
                  : wallPlanes[placement.wall];
            return Math.abs(back - expected) <= WALL_PLANE_EPSILON_M
              ? []
              : [
                  `${placement.body.buildId}:${String(back)} != ${String(expected)}`,
                ];
          },
        );

        expect(offWall).toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(SAMPLE_ROOMS)(
    "leaves only shared faces between the bodies of a composed run in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const boxes = placementBodies(rendered).flatMap(
          ({ body, placement }) => {
            const box = shellBoxOf(body);
            return box.isEmpty()
              ? []
              : [{ id: `${placement.id}:${placement.body.buildId}`, box }];
          },
        );
        const intersections: string[] = [];
        for (let left = 0; left < boxes.length; left += 1) {
          for (let right = left + 1; right < boxes.length; right += 1) {
            const a = boxes[left];
            const b = boxes[right];
            if (!a || !b) continue;
            const overlap = (["x", "y", "z"] as const).map(
              (axis) =>
                Math.min(a.box.max[axis], b.box.max[axis]) -
                Math.max(a.box.min[axis], b.box.min[axis]),
            );
            if (overlap.every((extent) => extent > SHARED_FACE_TOLERANCE_M)) {
              intersections.push(`${a.id}/${b.id}`);
            }
          }
        }

        expect(boxes.length).toBeGreaterThan(2);
        expect(intersections).toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );
});
