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
// **The criterion says *all three* storage bodies and this wave composes two.** `base-panbank` is
// kept by S1b for 7D5 under ADR 0110 Amendment H1 and generation places it **nowhere** — criterion
// 6's own must-not forbids it in a storage slot in this wave, so criterion 15's third body cannot
// appear in a generated design without breaking criterion 6. The two clauses were written on either
// side of D14/D15 and they disagree; **this file covers the two bodies generation composes and
// asserts the third is absent**, and the disagreement is reported rather than resolved here. The
// pan drawer's own fronts are already gated at every declared width by
// `front-population.parity.test.ts`; what is not gated anywhere else is a drawer body standing in a
// *generated* run, which is what follows.
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
 *  is the room that catches a claim selecting a drawer by build id. The other two stand one in a
 *  composed slot, on a different wall each. */
const SAMPLE_ROOMS: readonly Design["room"][] = [
  KITCHEN_L_DESIGN.room,
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
  { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2600 },
];

interface DrawerSlotRoom {
  readonly room: Design["room"];
  readonly wall: DesignWall;
}

/** The two rooms whose generated run stands the drawer body in a slot the **storage run** composed,
 *  chosen so the slot lands on a different wall in each. Measured through the real probe: at
 *  6300 x 4700 it is wall A's first composed slot, standing behind the core; at 900 x 4700 it is wall
 *  B's **highest-indexed** composed slot, where the hob stands among wall B's core and the reading order
 *  runs against the layout (D15.7's 3.1 % arm). */
const DRAWER_SLOT_ROOMS: readonly DrawerSlotRoom[] = [
  {
    room: { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
    wall: "A",
  },
  {
    room: { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2600 },
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

/** Every built body standing in a slot the **storage run** composed. Never `role === "storage"`,
 *  which the tall-end block's full-height columns also carry (ADR 0110 E5.2), and never a build id. */
function composedSlotBodies(rendered: RenderedDesign) {
  const plannedIds = plannedIdByPlacement(rendered.log);
  return placementBodies(rendered).flatMap(({ body, placement }) => {
    const plannedId = plannedIds.get(placement.id);
    if (plannedId === undefined || !isComposedStorageSlot({ id: plannedId })) {
      return [];
    }
    return [{ body, placement, plannedId }];
  });
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
    "fills its composed slots from the two composed bodies and stands no pan drawer in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const slotBodies = composedSlotBodies(rendered).map(
          ({ placement, plannedId }) =>
            `${plannedId}:${placement.body.buildId}`,
        );

        expect(slotBodies).not.toEqual([]);
        expect(
          slotBodies.filter(
            (slot) =>
              !slot.endsWith(DOOR_BASE_BUILD_ID) &&
              !slot.endsWith(THREE_DRAWER_BASE_BUILD_ID),
          ),
        ).toEqual([]);
        expect(
          rendered.design.placements.map((placement) => placement.body.buildId),
        ).not.toContain(PAN_DRAWER_BASE_BUILD_ID);
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

  it.each(SAMPLE_ROOMS)(
    "draws each storage body's declared fronts where the run put it, in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const storageBodies = placementBodies(rendered).filter(
          ({ placement }) =>
            [DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID].includes(
              placement.body.buildId,
            ),
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
            const box = new THREE.Box3();
            body.traverse((node) => {
              if (isMesh(node) && SHELL_MESH_NAME.test(node.name)) {
                box.union(new THREE.Box3().setFromObject(node));
              }
            });
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
