// M7 wave 7D4 slice S4 — criterion 15, the wave's only assertion outside `configurator-domain`.
//
// **Risk 8 is what this file is for.** Until 7D4 `base-3drawer` stood in a kitchen only where a
// customer put one. Its fronts, its handles and its price are now produced by a **run**, so a later
// wave that changes that row's declaration changes generated kitchens — and generation had no parity
// coverage of it at all. Everything here is built through the **real probe**, never a fake: a fake
// reports back the depth it was handed, so a domain test with one cannot see a body that does not
// stand where the plan says (backlog entry 9).
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
  KITCHEN_L_DESIGN,
  PAN_DRAWER_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
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

/** Rooms whose generated run stands **both** composed storage bodies, chosen so the drawer lands on
 *  a different wall in each: wall A behind the block at 6300 x 4700, and wall B's highest index at
 *  900 x 4700, where the hob stands among wall B's core (D15.7's 3.1 % arm). */
const SAMPLE_ROOMS: readonly Design["room"][] = [
  KITCHEN_L_DESIGN.room,
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
  { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2600 },
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

function generated(room: Design["room"]): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!result.ok) throw new Error(`sample room refused: ${result.reason.code}`);
  return result.design;
}

interface RenderedDesign {
  readonly kit: Kit;
  readonly room: THREE.Group;
  readonly solids: THREE.Group;
  readonly design: Design;
}

function render(design: Design): RenderedDesign {
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
  return { kit, room, solids, design };
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

function storageBodiesIn(design: Design): readonly string[] {
  return design.placements
    .map((placement) => placement.body.buildId)
    .filter((buildId) =>
      [
        DOOR_BASE_BUILD_ID,
        THREE_DRAWER_BASE_BUILD_ID,
        PAN_DRAWER_BASE_BUILD_ID,
      ].includes(buildId),
    );
}

describe("a generated run's storage bodies, built by the real adapter", () => {
  it.each(SAMPLE_ROOMS)(
    "composes both storage bodies and no third one in %o",
    (room) => {
      // The sample's own precondition, and it is not idle: 71.5 % of placed rooms have no post-hob
      // storage slot at all (D15.7), so a sample picked without measuring would very likely stand no
      // drawer body in a composed slot anywhere.
      const bodies = storageBodiesIn(generated(room));

      expect(bodies).toContain(DOOR_BASE_BUILD_ID);
      expect(bodies).toContain(THREE_DRAWER_BASE_BUILD_ID);
      expect(bodies).not.toContain(PAN_DRAWER_BASE_BUILD_ID);
    },
  );

  it.each(SAMPLE_ROOMS)(
    "stands a body with three drawer fronts and no leaf where the run reads first after the hob, in %o",
    (room) => {
      // **Criterion 15's own numbers, asserted as numbers.** The comparison below this one reads
      // each body's declared front population back from the catalogue entry it was drawn from, and
      // **that comparison was measured green under sabotage**: with `THREE_DRAWER_BASE_BUILD_ID`
      // set to the door id — one line in `body-choice.ts`, and a generated run with no drawer body
      // in it at all — every assertion in this file still passed, because the run was consistent
      // with itself. What a *drawer* is has to come from somewhere other than the row the composer
      // chose.
      const design = generated(room);
      const rendered = render(design);
      try {
        const drawerBodies = placementBodies(rendered).filter(
          ({ placement }) =>
            placement.body.buildId === THREE_DRAWER_BASE_BUILD_ID,
        );

        expect(THREE_DRAWER_BASE_BUILD_ID).not.toBe(DOOR_BASE_BUILD_ID);
        expect(drawerBodies.length).toBeGreaterThan(0);
        for (const { body, placement } of drawerBodies) {
          expect([
            placement.id,
            builtFrontCount(body, DRAWER_FRONT_MESH_NAME),
            builtFrontCount(body, DOOR_FRONT_MESH_NAME),
          ]).toEqual([placement.id, 3, 0]);
        }
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(SAMPLE_ROOMS)(
    "draws each storage body's declared fronts where the run put it, in %o",
    (room) => {
      const design = generated(room);
      const rendered = render(design);
      try {
        const drawn = placementBodies(rendered)
          .filter(({ placement }) =>
            [DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID].includes(
              placement.body.buildId,
            ),
          )
          .map(({ body, placement }) => ({
            id: `${placement.id}:${placement.body.buildId}`,
            drawers: builtFrontCount(body, DRAWER_FRONT_MESH_NAME),
            doorLeaves: builtFrontCount(body, DOOR_FRONT_MESH_NAME),
          }));
        const declared = placementBodies(rendered)
          .filter(({ placement }) =>
            [DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID].includes(
              placement.body.buildId,
            ),
          )
          .map(({ placement }) => ({
            id: `${placement.id}:${placement.body.buildId}`,
            ...declaredFrontsOf(placement, design),
          }));

        expect(drawn).toEqual(declared);
        expect(
          drawn.filter((body) => body.id.endsWith(THREE_DRAWER_BASE_BUILD_ID)),
        ).not.toEqual([]);
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
