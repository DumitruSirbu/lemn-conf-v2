// Generated runs are built through the real probe, never a fake: a fake reports back the depth it was
// handed, so it cannot see a body that does not stand where the plan says.
// A drawer is reached through provenance (`isComposedStorageSlot` and the log's step id), never through a
// build id: the `preparation` module also stands `base-3drawer`, so a build-id check passes in every placed
// kitchen whether or not the storage run composed one (ADR 0110 F6). `pan-drawer` and `threshold-drawer` are
// modules of their own, not composed slots, and are reached through the log's step id too.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  DISHWASHER_BUILD_ID,
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
import { assertGeneratedOnTwoWalls } from "./support/assert-generated-on-two-walls.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";

/** `room-composition.parity.test.ts`'s tolerance, retyped: a gate reading its definition of *touching*
 *  out of the code it checks proves only that the code equals itself. */
const SHARED_FACE_TOLERANCE_M = 0.0005;
const WALL_PLANE_EPSILON_M = 1e-6;
const SHELL_MESH_NAME =
  /^(carcass_shell|carcass|side_left|side_right|plinth|fridge_body|hood_canopy)$/;

/** `kitchen-parts.ts`'s two front names, retyped for the same reason. */
const DRAWER_FRONT_MESH_NAME = "drawer_front";
const DOOR_FRONT_MESH_NAME = "door_front";

// Rooms every geometry assertion runs over, each measured through the real probe. The reference room
// is the counter-case: no drawer stands in a composed slot there (both wall-B composed slots take the
// door body), so it catches a claim that selects a drawer by build id.
// 1500 x 3400: the hob wall has one slot and the pan drawer takes it, leaving no post-hob drawer slot
// (ADR 0110 K1). Its one composed slot faces the sink across the corner, so it is the dishwasher (ADR 0110 M1).
const PAN_DRAWER_TAKES_THE_ONLY_SLOT_ROOM: Design["room"] = {
  shape: "L",
  widthMm: 1500,
  depthMm: 3400,
  heightMm: 2600,
};
const DISHWASHER_TAKES_THE_ONLY_SLOT_ROOM = PAN_DRAWER_TAKES_THE_ONLY_SLOT_ROOM;
// 1500 x 4600: wall B is wider and wall A has a door slot whose sink has no door cabinet beside it,
// so ADR 0110 M7(e) swaps the drawers there.
const E_SWAP_ROOM: Design["room"] = {
  shape: "L",
  widthMm: 1500,
  depthMm: 4600,
  heightMm: 2600,
};
// 5200 x 5300 stands a `threshold-drawer` inside the approved policy (ADR 0110 Amendment L).
const THRESHOLD_DRAWER_ROOM: Design["room"] = {
  shape: "L",
  widthMm: 5200,
  depthMm: 5300,
  heightMm: 2600,
};
const SAMPLE_ROOMS: readonly Design["room"][] = [
  KITCHEN_L_DESIGN.room,
  // 6300 is past the approved 6000 mm on purpose: a measured witness that is still storable.
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
  PAN_DRAWER_TAKES_THE_ONLY_SLOT_ROOM,
  E_SWAP_ROOM,
  THRESHOLD_DRAWER_ROOM,
];

/** Every sample room but the one whose only slot became the dishwasher (ADR 0110 M1). */
const COMPOSED_SLOT_ROOMS: readonly Design["room"][] = SAMPLE_ROOMS.filter(
  (room) => room !== DISHWASHER_TAKES_THE_ONLY_SLOT_ROOM,
);

/** The rooms whose plan stands a `pan-drawer` module; the reference room's plan has none. */
const PAN_DRAWER_ROOMS: readonly Design["room"][] = SAMPLE_ROOMS.filter(
  (room) => room !== KITCHEN_L_DESIGN.room,
);

const PAN_DRAWER_MODULE_ID = "pan-drawer";
const PREPARATION_MODULE_ID = "preparation";
const DISHWASHER_MODULE_ID = "dishwasher";
const SINK_MODULE_ID = "sink";
const THRESHOLD_DRAWER_MODULE_ID = "threshold-drawer";
const HOB_MODULE_ID = "hob";

interface DrawerSlotRoom {
  readonly room: Design["room"];
  readonly wall: DesignWall;
}

/** The two rooms whose generated run stands the drawer body in a slot the storage run composed, on a
 *  different wall in each. At 6300 x 4700 wall A is the wider wall and the slot is its first composed one,
 *  behind the core; at 4100 x 6100 wall B is wider, the run ends there and the slot is wall B's first
 *  composed one, while wall A's composed slots are read before the hob and keep their doors. */
const DRAWER_SLOT_ROOMS: readonly DrawerSlotRoom[] = [
  {
    room: { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
    wall: "A",
  },
  // Wall B 6100 mm is past the approved 6000 mm on purpose: ADR 0110 K8 declares this room the witness.
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

/** The planned id behind each built placement, read off the log's step: a placement carries no
 *  provenance of its own, so the step is the only thing saying which module produced it. */
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

/** Every built body standing in a slot the storage run composed. Never `role === "storage"`, which the
 *  tall-end block's full-height columns also carry (ADR 0110 F6), and never a build id. */
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

/** The plan's pan drawer, found by its body: in an M7(e) room it carries the preparation id and role,
 *  so an id lookup would find nothing (ADR 0110 M9). */
function plannedPanDrawerOf(rendered: RenderedDesign) {
  const found = plannedBodies(rendered).filter(
    ({ placement }) => placement.body.buildId === PAN_DRAWER_BASE_BUILD_ID,
  );
  const [only] = found;
  if (found.length !== 1 || !only) {
    throw new Error(
      `expected one built pan drawer, found ${String(found.length)}`,
    );
  }
  expect([PAN_DRAWER_MODULE_ID, PREPARATION_MODULE_ID]).toContain(
    only.plannedId,
  );
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
  // Over `COMPOSED_SLOT_ROOMS`: 1500 x 3400 has no composed slot (its dishwasher is asserted below). The
  // pan drawer's planned id may be `preparation` where that module is the pan drawer (ADR 0110 M9).
  it.each(COMPOSED_SLOT_ROOMS)(
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
        const preparationIsThePanDrawer = rendered.log.plan.bases.some(
          (base) =>
            base.id === PREPARATION_MODULE_ID &&
            base.buildId === PAN_DRAWER_BASE_BUILD_ID,
        );
        const plannedPanDrawers = placedModuleIds(rendered.log).filter(
          (id) =>
            id === PAN_DRAWER_MODULE_ID ||
            (preparationIsThePanDrawer && id === PREPARATION_MODULE_ID),
        );

        expect(slotBodies).not.toEqual([]);
        expect(
          slotBodies.filter(
            (slot) =>
              !slot.endsWith(DOOR_BASE_BUILD_ID) &&
              !slot.endsWith(THREE_DRAWER_BASE_BUILD_ID),
          ),
        ).toEqual([]);
        expect(panDrawerBodies).toEqual(plannedPanDrawers);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(DRAWER_SLOT_ROOMS)(
    "stands the drawer body in exactly one composed slot, on the wall the reading order reaches after the hob, in %o",
    ({ room, wall }) => {
      // Asserted where a build id cannot answer: the preparation module carries the same body, so "a
      // drawer exists" is true everywhere; only the composer's rule puts one in a storage-run slot.
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

  // `base-dishwasher` (`dishwasherHousing`) draws a plinth, two carcass sides, a back panel, the
  // integrated machine (`dw_body`) and one decor door (`door_front`) with its handle, not an open niche;
  // so the built body is asserted against the catalogue's declared fronts.
  it("builds the plan's dishwasher as a housing with one decor door and no drawer, across the corner from the sink, in 1500 x 3400", () => {
    const rendered = render(generated(DISHWASHER_TAKES_THE_ONLY_SLOT_ROOM));
    try {
      const dishwasher = plannedBodyOf(rendered, DISHWASHER_MODULE_ID);
      const sink = plannedBodyOf(rendered, SINK_MODULE_ID);

      expect(composedSlotBodies(rendered)).toEqual([]);
      expect([
        dishwasher.placement.body.buildId,
        dishwasher.placement.body.widthMm,
        isComposedStorageSlot({ id: dishwasher.plannedId }),
      ]).toEqual([DISHWASHER_BUILD_ID, 600, false]);
      expect({
        drawers: builtFrontCount(dishwasher.body, DRAWER_FRONT_MESH_NAME),
        doorLeaves: builtFrontCount(dishwasher.body, DOOR_FRONT_MESH_NAME),
      }).toEqual(declaredFrontsOf(dishwasher.placement, rendered.design));
      expect(builtFrontCount(dishwasher.body, DOOR_FRONT_MESH_NAME)).toBe(1);
      expect(builtFrontCount(dishwasher.body, DRAWER_FRONT_MESH_NAME)).toBe(0);
      expect([
        dishwasher.placement.wall,
        dishwasher.placement.alongMm,
        sink.placement.wall,
        sink.placement.alongMm,
        // `alongMm` is a placement's centre: both modules span 900-1500 on their own walls, the first
        // from the corner, which is what *across the corner* means (ADR 0110 M1).
      ]).toEqual(["A", 1200, "B", 1200]);
    } finally {
      disposeKit(rendered.kit, rendered.room);
    }
  });

  // ADR 0110 M7(e): sink, dishwasher, pan drawer, hob, the dishwasher sharing a face with the sink on one
  // side and the pan drawer on the other.
  it("builds sink, dishwasher and pan-drawer preparation side by side on one wall, in 1500 x 4600", () => {
    const rendered = render(generated(E_SWAP_ROOM));
    try {
      const sink = plannedBodyOf(rendered, SINK_MODULE_ID);
      const dishwasher = plannedBodyOf(rendered, DISHWASHER_MODULE_ID);
      const preparation = plannedBodyOf(rendered, PREPARATION_MODULE_ID);
      const wall = dishwasher.placement.wall;

      expect(preparation.placement.body.buildId).toBe(PAN_DRAWER_BASE_BUILD_ID);
      expect(dishwasher.placement.body.buildId).toBe(DISHWASHER_BUILD_ID);
      expect([sink.placement.wall, preparation.placement.wall]).toEqual([
        wall,
        wall,
      ]);
      for (const neighbour of [sink, preparation]) {
        expect(
          Math.abs(
            gapAlongWallM(
              wall,
              shellBoxOf(dishwasher.body),
              shellBoxOf(neighbour.body),
            ),
          ),
          neighbour.plannedId,
        ).toBeLessThanOrEqual(SHARED_FACE_TOLERANCE_M);
      }
    } finally {
      disposeKit(rendered.kit, rendered.room);
    }
  });

  it.each(PAN_DRAWER_ROOMS)(
    "builds the plan's pan drawer as a pan-drawer body sharing a face with the hob, in %o",
    (room) => {
      // Which side is "before" the hob is the domain's reading order; the adapter must honour only that
      // the two bodies touch. The pan drawer is found by its body (see `plannedPanDrawerOf`).
      const rendered = render(generated(room));
      try {
        const hob = plannedBodyOf(rendered, HOB_MODULE_ID);
        const panDrawer = plannedPanDrawerOf(rendered);
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

  it("builds the plan's threshold drawer as three drawer fronts, on the far side of the hob from the pan drawer, in 5200 x 5300", () => {
    // A `threshold-drawer` module stands a 600 mm `base-3drawer` after the hob in a D >= 6 kitchen short of
    // drawers (ADR 0110 Amendment L). It is not a composed slot, so it is reached by its step id.
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
            [
              DOOR_BASE_BUILD_ID,
              THREE_DRAWER_BASE_BUILD_ID,
              PAN_DRAWER_BASE_BUILD_ID,
              DISHWASHER_BUILD_ID,
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
            assertGeneratedOnTwoWalls(placement.wall);
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
