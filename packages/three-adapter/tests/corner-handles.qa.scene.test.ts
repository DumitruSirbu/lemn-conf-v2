// M12 W1 adversarial QA (ADR 0182): the scene half of what `corner-handles.scene.test.ts` leaves open.
//
// That file mounts the seeded corners only. Here the corners come out of `generateKitchen` (both L directions, so the
// mirrored right-corner pieces are drawn too, and a large U, which stands the corner wall unit), at both cabinet
// depths, under every combination of the kitchen's and the top row's handle. Three things are asked of the real scene:
//  - W1-1: every body that is not a corner draws exactly what it drew when the corners took no handle, and a corner
//    that is left on the kitchen's default draws it too (byte identity against `HEAD` was captured by QA and is what
//    licenses `catalogWithCornersTakingNoHandle` (`support/before-adr-0182.ts`) as the "before");
//  - W1-2/W1-3: each corner that carries a bar draws the handle the rule resolves, written out here and not read from
//    the domain, at every kitchen handle;
//  - a handle changed on a mounted kitchen repaints the corners, rebuilding exactly the bodies whose handle moved.
// A handle stored on the bar-less return leg is drawn as nothing and does not throw.
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  type BodyCatalog,
  type BodyProbeFactory,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { forEachCabinetHandleMesh } from "../src/cabinet-handle-meshes.js";
import { disposeKit } from "../src/kit-disposal.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { catalogWithCornersTakingNoHandle } from "./support/before-adr-0182.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-11-14T12:00:00.000Z";
const BLACK_HANDLE_HEX = "1c1e20";
const TOP_ROW_FLOOR_MM = 2_200;
const DEPTHS_MM = [600, 700] as const;
const KITCHEN_HANDLES: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const BAR_LESS_RETURN_BUILD_ID = "base-corner-return-320";
const BAR_CARRYING_CORNER_BUILD_IDS: ReadonlySet<string> = new Set([
  "base-corner-x-900",
  "wall-corner-return-570",
  "wall-corner-return-570-top",
  "wall-corner-x-900",
  "wall-corner-x-900-top",
]);
const ROOMS: readonly Design["room"][] = [
  { shape: "L", widthMm: 3600, depthMm: 2600, heightMm: 2600 },
  {
    shape: "L",
    widthMm: 3600,
    depthMm: 2600,
    heightMm: 2600,
    cornerDirection: "left",
  },
  {
    shape: "L",
    widthMm: 4800,
    depthMm: 3500,
    heightMm: 2600,
    cornerDirection: "right",
  },
  { shape: "U", widthMm: 3334, depthMm: 3333, wallCMm: 3333, heightMm: 2600 },
  { shape: "U", widthMm: 5000, depthMm: 3333, wallCMm: 4200, heightMm: 2600 },
];

beforeAll(() => {
  installHeadlessDocument();
});

const kitsToDispose: { kit: Kit; room: THREE.Group }[] = [];
afterAll(() => {
  for (const { kit, room } of kitsToDispose) disposeKit(kit, room);
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

function generated(room: Design["room"], cabinetDepthMm: number): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
    newKitchenSettings: { cabinetDepthMm },
  });
  if (!result.ok) throw new Error(`sample room refused: ${result.reason.code}`);
  return result.design;
}

function kitFor(cabinetDepthMm: number): Kit {
  const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
  kitsToDispose.push({ kit, room: kit.builders["kitchen-l"]() });
  return kit;
}

function withKitchenHandles(
  design: Design,
  handles: { readonly handle?: Handle; readonly topRowHandle?: Handle },
): Design {
  return { ...design, settings: { ...design.settings, ...handles } };
}

function definedOnly(handles: {
  readonly handle: Handle | undefined;
  readonly topRowHandle: Handle | undefined;
}) {
  return {
    ...(handles.handle === undefined ? {} : { handle: handles.handle }),
    ...(handles.topRowHandle === undefined
      ? {}
      : { topRowHandle: handles.topRowHandle }),
  };
}

function mounted(input: {
  readonly kit: Kit;
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly into?: THREE.Group;
}): THREE.Group {
  const solidsRoot = input.into ?? new THREE.Group();
  const records = derivePlacementRecords(input.design, input.catalog);
  syncSolidBodies({
    kit: input.kit,
    solidsRoot,
    records,
    room: input.design.room,
  });
  solidsRoot.updateWorldMatrix(true, true);
  return solidsRoot;
}

interface DrawnBars {
  readonly built: number;
  readonly visible: number;
  readonly black: number;
  readonly materials: readonly string[];
}

/** The bars of every body mounted, by placement id: how many, how many show, how many are black, and each one's
 *  material as a string so two scenes are compared by what is drawn. */
function drawnBarsByPlacement(solidsRoot: THREE.Group): Map<string, DrawnBars> {
  const bars = new Map<string, DrawnBars>();
  for (const body of solidsRoot.children) {
    const placementId = body.userData["placementId"] as string | undefined;
    if (placementId === undefined) continue;
    let visible = 0;
    let black = 0;
    const materials: string[] = [];
    forEachCabinetHandleMesh(body, (part) => {
      const material = part.material as THREE.MeshStandardMaterial;
      if (part.visible) visible += 1;
      if (material.color.getHexString() === BLACK_HANDLE_HEX) black += 1;
      materials.push(
        [
          part.name,
          String(part.visible),
          material.type,
          material.color.getHexString(),
          String(material.roughness),
          String(material.metalness),
        ].join("/"),
      );
    });
    bars.set(placementId, {
      built: materials.length,
      visible,
      black,
      materials,
    });
  }
  return bars;
}

/** The handle a body is drawn with, from the rule's words: its own, else below the top row the kitchen's else steel,
 *  on the top row the top row's else push. Written out, so a change to the domain's resolver cannot move it. */
function expectedHandleOf(
  placement: Design["placements"][number],
  kitchen: { readonly handle?: Handle; readonly topRowHandle?: Handle },
): Handle {
  if (placement.body.handle !== undefined) return placement.body.handle;
  return placement.y0Mm >= TOP_ROW_FLOOR_MM
    ? (kitchen.topRowHandle ?? "push")
    : (kitchen.handle ?? "steel");
}

describe.each(DEPTHS_MM)("at %i mm", (cabinetDepthMm) => {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const catalogBefore = catalogWithCornersTakingNoHandle(catalog);
  let designs: readonly Design[] = [];
  beforeAll(() => {
    designs = ROOMS.map((room) => generated(room, cabinetDepthMm));
  });
  const cornersOf = (design: Design) =>
    design.placements.filter((placement) =>
      BAR_CARRYING_CORNER_BUILD_IDS.has(placement.body.buildId),
    );

  it("grows corners of both rows in the kitchens it sweeps, mirrored and not, and the corner wall unit", () => {
    const buildIds = new Set(
      designs.flatMap((design) =>
        cornersOf(design).map((placement) => placement.body.buildId),
      ),
    );

    expect([...buildIds].sort()).toEqual(
      [...BAR_CARRYING_CORNER_BUILD_IDS].sort(),
    );
  });

  it("draws every corner that carries a bar with the handle the rule resolves, under every kitchen and top-row handle", () => {
    const kit = kitFor(cabinetDepthMm);
    const wrong: string[] = [];
    let corners = 0;

    for (const design of designs) {
      for (const handle of KITCHEN_HANDLES) {
        for (const topRowHandle of KITCHEN_HANDLES) {
          const kitchen = definedOnly({ handle, topRowHandle });
          const bars = drawnBarsByPlacement(
            mounted({
              kit,
              design: withKitchenHandles(design, kitchen),
              catalog,
            }),
          );
          for (const placement of cornersOf(design)) {
            corners += 1;
            const wearing = expectedHandleOf(placement, kitchen);
            const drawn = bars.get(placement.id);
            const isRight =
              drawn !== undefined &&
              drawn.built > 0 &&
              drawn.visible === (wearing === "push" ? 0 : drawn.built) &&
              drawn.black === (wearing === "black" ? drawn.built : 0);
            if (!isRight) {
              wrong.push(
                `${JSON.stringify(design.room)} ${placement.id} ${placement.body.buildId} ` +
                  `kitchen=${String(handle)} top=${String(topRowHandle)} wants ${wearing} ${JSON.stringify(drawn)}`,
              );
            }
          }
        }
      }
    }

    expect(wrong).toEqual([]);
    expect(corners).toBeGreaterThan(400);
  });

  it("draws every body that is not a corner as it was drawn when the corners took no handle (W1-1, W1-2: nothing else moves)", () => {
    const kit = kitFor(cabinetDepthMm);
    const moved: string[] = [];
    let bodies = 0;

    for (const design of designs) {
      for (const handle of KITCHEN_HANDLES) {
        for (const topRowHandle of KITCHEN_HANDLES) {
          const dressed = withKitchenHandles(
            design,
            definedOnly({ handle, topRowHandle }),
          );
          const now = drawnBarsByPlacement(
            mounted({ kit, design: dressed, catalog }),
          );
          const before = drawnBarsByPlacement(
            mounted({ kit, design: dressed, catalog: catalogBefore }),
          );
          for (const placement of design.placements) {
            if (placement.body.buildId.includes("corner")) continue;
            bodies += 1;
            if (
              JSON.stringify(now.get(placement.id)) !==
              JSON.stringify(before.get(placement.id))
            ) {
              moved.push(`${placement.id} ${placement.body.buildId}`);
            }
          }
        }
      }
    }

    expect(moved).toEqual([]);
    expect(bodies).toBeGreaterThan(1_500);
  });

  it("draws a corner left on the kitchen's default exactly as it was drawn before (W1-1)", () => {
    const kit = kitFor(cabinetDepthMm);

    for (const design of designs) {
      for (const handles of [
        {},
        { handle: "steel" },
        { topRowHandle: "push" },
        { handle: "steel", topRowHandle: "push" },
      ] as const) {
        const dressed = withKitchenHandles(design, handles);
        const now = drawnBarsByPlacement(
          mounted({ kit, design: dressed, catalog }),
        );
        const before = drawnBarsByPlacement(
          mounted({ kit, design: dressed, catalog: catalogBefore }),
        );

        expect(Object.fromEntries(now)).toEqual(Object.fromEntries(before));
      }
    }
  });

  it("repaints the corners of a mounted kitchen when its handle changes, and rebuilds exactly the corners whose handle moved", () => {
    const kit = kitFor(cabinetDepthMm);
    const sequence: readonly { handle?: Handle; topRowHandle?: Handle }[] = [
      {},
      { handle: "black" },
      { handle: "black", topRowHandle: "black" },
      { handle: "push", topRowHandle: "black" },
      { handle: "push" },
      { handle: "steel", topRowHandle: "steel" },
      {},
    ];
    const surprises: string[] = [];

    for (const design of designs) {
      const stepped = new THREE.Group();
      let previous = new Map<string, THREE.Object3D>();
      let previousKitchen: (typeof sequence)[number] = {};
      for (const [step, kitchen] of sequence.entries()) {
        const dressed = withKitchenHandles(design, kitchen);
        mounted({ kit, design: dressed, catalog, into: stepped });
        const fresh = mounted({ kit, design: dressed, catalog });
        const current = new Map(
          stepped.children.map((child) => [
            child.userData["placementId"] as string,
            child,
          ]),
        );

        expect(Object.fromEntries(drawnBarsByPlacement(stepped))).toEqual(
          Object.fromEntries(drawnBarsByPlacement(fresh)),
        );
        for (const placement of cornersOf(design)) {
          const moved =
            expectedHandleOf(placement, kitchen) !==
            expectedHandleOf(placement, previousKitchen);
          const rebuilt =
            step > 0 &&
            previous.get(placement.id) !== current.get(placement.id);
          if (step > 0 && rebuilt !== moved) {
            surprises.push(
              `step ${String(step)} ${placement.id} moved=${String(moved)} rebuilt=${String(rebuilt)}`,
            );
          }
        }
        previous = current;
        previousKitchen = kitchen;
      }
    }

    expect(surprises).toEqual([]);
  });

  it("builds no bar for a handle stored on the bar-less return leg and does not throw, under any kitchen handle", () => {
    const kit = kitFor(cabinetDepthMm);
    const design = designs.find((candidate) =>
      candidate.placements.some(
        (placement) => placement.body.buildId === BAR_LESS_RETURN_BUILD_ID,
      ),
    );
    if (design === undefined)
      throw new Error("no kitchen stands the return leg");
    const leg = design.placements.find(
      (placement) => placement.body.buildId === BAR_LESS_RETURN_BUILD_ID,
    );
    if (leg === undefined) throw new Error("no return leg");

    for (const stored of ["steel", "black", "push"] as const) {
      const edited: Design = {
        ...design,
        placements: design.placements.map((placement) =>
          placement.id === leg.id
            ? { ...placement, body: { ...placement.body, handle: stored } }
            : placement,
        ),
      };
      for (const handle of KITCHEN_HANDLES) {
        const bars = drawnBarsByPlacement(
          mounted({
            kit,
            design: withKitchenHandles(
              edited,
              definedOnly({ handle, topRowHandle: undefined }),
            ),
            catalog,
          }),
        );

        expect(bars.get(leg.id)?.built).toBe(0);
      }
    }
  });
});
