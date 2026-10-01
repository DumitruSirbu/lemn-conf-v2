import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  INSERTABLE_BODY_DEFINITIONS,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  toMetres,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { findMesh, worldBox } from "./support/structure.js";

const OCCURRED_AT = "2026-09-18T11:00:00.000Z";
const CORNER_IDS = ["p25", "p26", "p9", "p21"] as const;
const SHARED_FACE_TOLERANCE_M = 0.0005;
const DOOR_RETURN_CLEARANCE_M = 0.029;
const MINIMUM_WALL_BODY_WIDTH_MM = (() => {
  const wall = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === "wall-cabinet",
  )?.[1];
  if (!wall?.minWidthMm)
    throw new Error("missing hinged wall body width floor");
  return wall.minWidthMm;
})();
const COMPOSABLE_ROOM_SWEEP = [
  {
    label: "900 × 2200",
    room: { shape: "L", widthMm: 900, depthMm: 2200, heightMm: 2600 },
  },
  {
    label: "2100 × 1000",
    room: { shape: "L", widthMm: 2100, depthMm: 1000, heightMm: 2600 },
  },
  {
    label: "4000 × 4000",
    room: { shape: "L", widthMm: 4000, depthMm: 4000, heightMm: 2600 },
  },
  {
    label: "maximum 6000 × 6000",
    room: { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2600 },
  },
] as const;
const SHELL_ONLY_ROOM_SWEEP = [
  {
    label: "approved 900 × 1000",
    room: { shape: "L", widthMm: 900, depthMm: 1000, heightMm: 2600 },
  },
  {
    label: "engine-only 880 × 880",
    room: { shape: "L", widthMm: 880, depthMm: 880, heightMm: 2600 },
  },
  {
    label: "engine-only 881 × 881",
    room: { shape: "L", widthMm: 881, depthMm: 881, heightMm: 2600 },
  },
] as const;

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

function changedTo700(design: Design): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: realProbeFactory(),
    cabinetDepthMm: 700,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok)
    throw new Error(`depth change refused: ${result.reason.code}`);
  return result.design;
}

interface MountedCorner {
  readonly placement: DesignPlacement;
  readonly body: THREE.Object3D;
  readonly carcass: THREE.Box3;
}

function requiredCorner(
  corners: ReadonlyMap<string, MountedCorner>,
  id: (typeof CORNER_IDS)[number],
): MountedCorner {
  const corner = corners.get(id);
  if (!corner) throw new Error(`missing mounted corner ${id}`);
  return corner;
}

/** The normal scene mount reads record widths through buildAnyBody, then places each group at its
 * recorded centre. This measures the mounted carcass, not a width returned by the same domain
 * query that supplied the test expectation. */
function expectMountedCornersMatchRecords(
  design: Design,
  inspect?: (
    corners: ReadonlyMap<string, MountedCorner>,
    solids: THREE.Group,
  ) => void,
): void {
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm: cabinetDepthMmOf(design),
  });
  const room = kit.builders["kitchen-l"]();
  const solids = new THREE.Group();
  try {
    syncSolidBodies({
      kit,
      solidsRoot: solids,
      records: derivePlacementRecords(
        design,
        buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
      ),
      room: design.room,
    });
    const corners = new Map<string, MountedCorner>();
    for (const id of CORNER_IDS) {
      const placement = design.placements.find(
        (candidate) => candidate.id === id,
      );
      const mounted = solids.children.find(
        (candidate) => candidate.userData["placementId"] === id,
      );
      if (!placement || !mounted)
        throw new Error(`missing ${id} corner record or mesh`);
      const carcassName =
        id === "p25" || id === "p26" ? "carcass" : "carcass_shell";
      const box = worldBox(solids, findMesh(mounted, carcassName));
      const widthM =
        placement.wall === "A" ? box.max.x - box.min.x : box.max.z - box.min.z;
      const alongM =
        placement.wall === "A" ? mounted.position.x : mounted.position.z;
      const axis = placement.wall === "A" ? "x" : "z";
      const nearM = toMetres(placement.alongMm - placement.body.widthMm / 2);
      const farM = toMetres(placement.alongMm + placement.body.widthMm / 2);
      expect(widthM, id).toBeCloseTo(toMetres(placement.body.widthMm), 6);
      expect(alongM, id).toBeCloseTo(toMetres(placement.alongMm), 6);
      expect(
        Math.abs(box.min[axis] - nearM),
        `${id} near face`,
      ).toBeLessThanOrEqual(SHARED_FACE_TOLERANCE_M);
      expect(
        Math.abs(box.max[axis] - farM),
        `${id} far face`,
      ).toBeLessThanOrEqual(SHARED_FACE_TOLERANCE_M);
      corners.set(id, { placement, body: mounted, carcass: box });
    }
    inspect?.(corners, solids);
  } finally {
    disposeKit(kit, room);
  }
}

function expectJunctionGeometry(
  corners: ReadonlyMap<string, MountedCorner>,
  solids: THREE.Group,
  expectedResidueMm: number,
): void {
  const x = requiredCorner(corners, "p25");
  const baseReturn = requiredCorner(corners, "p26");
  const wallReturn = requiredCorner(corners, "p9");
  const topReturn = requiredCorner(corners, "p21");
  const xTop = worldBox(solids, findMesh(x.body, "countertop"));
  const returnTop = worldBox(solids, findMesh(baseReturn.body, "countertop"));
  const door = worldBox(solids, findMesh(x.body, "door_front"));
  const carcassButtM = baseReturn.carcass.min.z - x.carcass.max.z;
  const stoneButtM = returnTop.min.z - xTop.max.z;
  const doorClearanceM = door.min.x - baseReturn.carcass.max.x;

  expect(Math.abs(carcassButtM), "base carcass seam").toBeLessThanOrEqual(
    SHARED_FACE_TOLERANCE_M,
  );
  expect(Math.abs(stoneButtM), "stone butt seam").toBeLessThanOrEqual(
    SHARED_FACE_TOLERANCE_M,
  );
  expect(stoneButtM, "stone volumes must not overlap").toBeGreaterThanOrEqual(
    -SHARED_FACE_TOLERANCE_M,
  );
  expect(
    doorClearanceM,
    "X-leg leaf beside the perpendicular return",
  ).toBeGreaterThan(DOOR_RETURN_CLEARANCE_M);
  expect(door.min.z).toBeLessThan(baseReturn.carcass.max.z);
  expect(door.max.z).toBeGreaterThan(baseReturn.carcass.min.z);

  const baseFarMm =
    baseReturn.placement.alongMm + baseReturn.placement.body.widthMm / 2;
  const wallFarMm =
    wallReturn.placement.alongMm + wallReturn.placement.body.widthMm / 2;
  const topFarMm =
    topReturn.placement.alongMm + topReturn.placement.body.widthMm / 2;
  expect(wallFarMm, "upper row cannot pass base row").toBeLessThanOrEqual(
    baseFarMm,
  );
  expect(baseFarMm - wallFarMm, "wall-B base minus wall row").toBe(
    expectedResidueMm,
  );
  expect(topFarMm).toBe(wallFarMm);
  if (expectedResidueMm > 0) {
    expect(
      expectedResidueMm,
      "residue cannot fit a hinged wall body",
    ).toBeLessThan(MINIMUM_WALL_BODY_WIDTH_MM);
  }
}

function expectWallAUpperOriginAtZero(design: Design): void {
  const wallAUpperTiles = (design.emptyColumns ?? []).filter(
    (tile) => tile.wall === "A" && tile.y0Mm === 1500,
  );
  expect(wallAUpperTiles.length).toBeGreaterThan(0);
  expect(
    Math.min(...wallAUpperTiles.map((tile) => tile.alongMm - tile.widthMm / 2)),
  ).toBe(0);
}

describe("wave 7D7 S3b — a corner record reaches the mounted body", () => {
  it("draws the engine-only 880 × 1000 shell's non-reference X-leg at 600 and keeps its width after the depth command", () => {
    const shell = buildLShellDesign({
      room: { shape: "L", widthMm: 880, depthMm: 1000, heightMm: 2600 },
      occurredAt: OCCURRED_AT,
    });
    expect(shell.placements.find(({ id }) => id === "p25")?.body.widthMm).toBe(
      880,
    );
    expectMountedCornersMatchRecords(shell);

    const deepened = changedTo700(shell);
    expect(cabinetDepthMmOf(deepened)).toBe(700);
    expect(
      deepened.placements.map(({ id, body }) => [id, body.widthMm]),
    ).toStrictEqual(shell.placements.map(({ id, body }) => [id, body.widthMm]));
    expectMountedCornersMatchRecords(deepened);
  });

  it("renders a generated customer room at 600, then its 700 mm command result with frozen corner widths", () => {
    const result = generateKitchen({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
      probeAt: realProbeFactory(),
    });
    if (!result.ok)
      throw new Error(`generation refused: ${result.reason.code}`);
    const generated = result.design;
    expectWallAUpperOriginAtZero(generated);
    const cornersAt600 = generated.placements
      .filter(({ id }) => (CORNER_IDS as readonly string[]).includes(id))
      .map(({ id, body }) => [id, body.widthMm]);
    expect(cornersAt600).toStrictEqual([
      ["p25", 900],
      ["p26", 330], // 320 → 330 (ADR 0135)
      ["p9", 570],
      ["p21", 570],
    ]);
    expectMountedCornersMatchRecords(generated);

    const deepened = changedTo700(generated);
    expectWallAUpperOriginAtZero(deepened);
    expect(cabinetDepthMmOf(deepened)).toBe(700);
    expect(
      deepened.placements
        .filter(({ id }) => (CORNER_IDS as readonly string[]).includes(id))
        .map(({ id, body }) => [id, body.widthMm]),
    ).toStrictEqual(cornersAt600);
    expectMountedCornersMatchRecords(deepened);
  });
});

describe("wave 7D7 S4 — declared composable room sweep at generated 600 → command 700", () => {
  it.each(COMPOSABLE_ROOM_SWEEP)(
    "renders four recorded corner widths in $label",
    ({ room }) => {
      const result = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: realProbeFactory(),
      });
      if (!result.ok)
        throw new Error(`generation refused: ${result.reason.code}`);
      const generated = result.design;
      expectWallAUpperOriginAtZero(generated);
      expectMountedCornersMatchRecords(generated, (corners, solids) => {
        expectJunctionGeometry(corners, solids, 0);
      });

      const deepened = changedTo700(generated);
      expectWallAUpperOriginAtZero(deepened);
      expectMountedCornersMatchRecords(deepened, (corners, solids) => {
        expectJunctionGeometry(corners, solids, 30);
      });
      expect(
        deepened.placements
          .filter(({ id }) => (CORNER_IDS as readonly string[]).includes(id))
          .map(({ id, body }) => [id, body.widthMm]),
      ).toStrictEqual(
        generated.placements
          .filter(({ id }) => (CORNER_IDS as readonly string[]).includes(id))
          .map(({ id, body }) => [id, body.widthMm]),
      );
    },
  );
});

describe("wave 7D7 S4 — shell-only boundaries through the scene harness", () => {
  it.each(SHELL_ONLY_ROOM_SWEEP)(
    "renders four sized corner records in $label",
    ({ room }) => {
      const shell = buildLShellDesign({ room, occurredAt: OCCURRED_AT });
      expectMountedCornersMatchRecords(shell, (corners, solids) => {
        expectJunctionGeometry(corners, solids, 0);
      });
      expectWallAUpperOriginAtZero(shell);
    },
  );
});
