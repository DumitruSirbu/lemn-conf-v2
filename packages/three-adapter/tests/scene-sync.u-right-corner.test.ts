// M7B wave U4 slice S2 (ADR 0132 decisions 1 and 2; acceptance criteria 1, 3 and 7): a U's scene.
//
// The four right-corner pieces — `cornerOf` says which — each stand in their own wrapper, mirrored
// about the piece's own origin with `applyCornerDirection`. Everything else, wall C's bodies and
// voids included, is drawn at its world frame, unmirrored. Picking, the selection outline and the
// overflow mark work on both kinds. The U is the domain's own (`buildUShellDesign`) and its records
// are the domain's own (`derivePlacementRecords`), so the scene is built from what the product hands
// the adapter.
import {
  buildKitchenLBodyCatalog,
  buildUShellDesign,
  cornerOf,
  derivePlacementRecords,
  deriveRecordedColumns,
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
  recomputeVoids,
  toMetres,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildOverflowMark } from "../src/overflow-mark.js";
import {
  createPickingRaycaster,
  pick,
  type Selection,
} from "../src/picking.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { RIGHT_CORNER_WRAPPER_NAME } from "../src/right-corner-wrapper.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import { buildSelectionOutline } from "../src/selection-outline.js";
import { isLine, isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
const BOUNDS_TOLERANCE_M = 1e-6;
/** Selection and mark hulls stand proud of the body they cover by a few millimetres
 *  (`selection-outline.ts` 3 mm, `overflow-mark.ts` 2 mm); this is the most a hull may differ. */
const HULL_TOLERANCE_M = 0.01;

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4500,
  depthMm: 3000,
  wallCMm: 3600,
  heightMm: 2600,
};

const LEFT_TO_RIGHT_TWIN = [
  ["p25", "right-p25"],
  ["p26", "right-p26"],
  ["p9", "right-p9"],
  ["p21", "right-p21"],
] as const;
const RIGHT_CORNER_IDS = LEFT_TO_RIGHT_TWIN.map(([, right]) => right);

beforeAll(() => {
  installHeadlessDocument();
});

interface MountedU {
  readonly kit: Kit;
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  /** The stage root: what an outline or a mark is added to, an ancestor of `solidsRoot`. */
  readonly stageRoot: THREE.Group;
  readonly solidsRoot: THREE.Group;
  readonly voidsRoot: THREE.Group;
}

/** A wall-C base cabinet, past the corner's return on wall C. Its seat is measured off the body the
 *  kit builds, as the probe does, so its back face lands on the wall's plane the way a real
 *  insert's does. */
function wallCCabinet(kit: Kit, id: string, alongMm: number): DesignPlacement {
  const buildId = "base-drawer3-600";
  const probe = createBodyBuiltAt(kit, buildId);
  const rearOverhangM = -probe.min.z;
  return {
    id,
    wall: "C",
    alongMm,
    y0Mm: 0,
    body: {
      buildId,
      widthMm: 600,
      heightMm: 820,
      seatDepthMm: Math.round(2 * rearOverhangM * 1000),
    },
  };
}

function createBodyBuiltAt(kit: Kit, buildId: string): THREE.Box3 {
  const catalog = buildKitchenLBodyCatalog(600);
  const records = derivePlacementRecords(
    {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          id: "probe",
          wall: "A",
          alongMm: 1000,
          y0Mm: 0,
          body: { buildId, widthMm: 600, heightMm: 820 },
        },
      ],
    },
    catalog,
  );
  const solidsRoot = new THREE.Group();
  syncSolidBodies({
    kit,
    solidsRoot,
    records,
    room: KITCHEN_L_DESIGN.room,
  });
  const body = required(solidsRoot.children[0], "the probe body");
  body.position.set(0, 0, 0);
  body.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(body);
}

function mountU(
  extra: (kit: Kit) => readonly DesignPlacement[] = () => [],
): MountedU {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const shellDesign = buildUShellDesign({
    room: U_ROOM,
    occurredAt: OCCURRED_AT,
  });
  const design: Design = {
    ...shellDesign,
    placements: [...shellDesign.placements, ...extra(kit)],
  };
  return mountDesign(kit, design);
}

function mountDesign(kit: Kit, design: Design): MountedU {
  const catalog = buildKitchenLBodyCatalog(600);
  const records = derivePlacementRecords(design, catalog);
  const stageRoot = new THREE.Group();
  const solidsRoot = new THREE.Group();
  const voidsRoot = new THREE.Group();
  solidsRoot.add(buildKitchenShell(kit, design.room));
  stageRoot.add(solidsRoot, voidsRoot);

  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  const columns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
  );
  syncVoidMeshes({ voidsRoot, voids: recomputeVoids(records, columns) });
  stageRoot.updateMatrixWorld(true);
  return { kit, design, records, stageRoot, solidsRoot, voidsRoot };
}

function mounted(scene: MountedU, placementId: string): THREE.Object3D {
  const found = scene.solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  return required(found, `mounted ${placementId}`);
}

function placementIdOf(object: THREE.Object3D): string {
  return String(object.userData["placementId"]);
}

function worldBoxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function isWrapped(object: THREE.Object3D): boolean {
  return object.name === RIGHT_CORNER_WRAPPER_NAME;
}

function expectBoxWithin(inner: THREE.Box3, outer: THREE.Box3, by: number) {
  for (const axis of ["x", "y", "z"] as const) {
    expect(outer.min[axis]).toBeLessThanOrEqual(
      inner.min[axis] + BOUNDS_TOLERANCE_M,
    );
    expect(outer.max[axis]).toBeGreaterThanOrEqual(
      inner.max[axis] - BOUNDS_TOLERANCE_M,
    );
    expect(inner.min[axis] - outer.min[axis]).toBeLessThan(by);
    expect(outer.max[axis] - inner.max[axis]).toBeLessThan(by);
  }
}

describe("the right corner's four pieces stand in mirrored wrappers (ADR 0132 decision 2)", () => {
  it("wraps exactly the pieces cornerOf calls right, and no other body", () => {
    const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);
    const catalog = buildKitchenLBodyCatalog(600);
    const rightByTheDomain = scene.design.placements
      .filter((p) => cornerOf(p, scene.design.room, catalog) === "right")
      .map((p) => p.id);

    const wrapped = scene.solidsRoot.children
      .filter(isWrapped)
      .map(placementIdOf);

    expect(rightByTheDomain).toHaveLength(4);
    expect([...wrapped].sort()).toEqual([...rightByTheDomain].sort());
    expect([...wrapped].sort()).toEqual([...RIGHT_CORNER_IDS].sort());
  });

  it("mirrors each wrapper with applyCornerDirection and leaves its body an untouched, identity leaf group", () => {
    const scene = mountU();

    for (const id of RIGHT_CORNER_IDS) {
      const wrapper = mounted(scene, id);
      const body = required(wrapper.children[0], `${id}'s body`);

      expect(wrapper.scale.toArray(), id).toEqual([-1, 1, 1]);
      expect(wrapper.children, id).toHaveLength(1);
      expect(body.scale.toArray(), id).toEqual([1, 1, 1]);
      expect(body.position.toArray(), id).toEqual([0, 0, 0]);
      expect(body.rotation.y, id).toBe(0);
      expect(body.userData["placementId"], id).toBeUndefined();
    }
  });

  it("seats each wrapper at its record's frame, position and yaw", () => {
    const scene = mountU();

    for (const id of RIGHT_CORNER_IDS) {
      const record = required(
        scene.records.find((r) => r.id === id),
        id,
      );
      const wrapper = mounted(scene, id);

      expect(wrapper.position.x).toBeCloseTo(record.frame.x, 9);
      expect(wrapper.position.y).toBeCloseTo(record.frame.y0, 9);
      expect(wrapper.position.z).toBeCloseTo(record.frame.z, 9);
      expect(wrapper.rotation.y).toBeCloseTo(record.frame.ry, 9);
    }
  });

  it.each(LEFT_TO_RIGHT_TWIN)(
    "draws %s's right twin %s as its mirror image in x = W/2: same footprint, reflected",
    (leftId, rightId) => {
      const scene = mountU();
      const widthM = toMetres(U_ROOM.widthMm);
      const left = worldBoxOf(mounted(scene, leftId));
      const right = worldBoxOf(mounted(scene, rightId));

      expect(right.min.x).toBeCloseTo(widthM - left.max.x, 6);
      expect(right.max.x).toBeCloseTo(widthM - left.min.x, 6);
      expect(right.min.y).toBeCloseTo(left.min.y, 6);
      expect(right.max.y).toBeCloseTo(left.max.y, 6);
      expect(right.min.z).toBeCloseTo(left.min.z, 6);
      expect(right.max.z).toBeCloseTo(left.max.z, 6);
    },
  );

  it("seats the right X-leg at the left X-leg's own −0.020 (ADR 0025 mirrored)", () => {
    const scene = mountU();

    const left = worldBoxOf(mounted(scene, "p25"));
    const right = worldBoxOf(mounted(scene, "right-p25"));

    expect(right.min.z).toBeCloseTo(-0.02, 6);
    expect(right.min.z).toBeCloseTo(left.min.z, 6);
  });

  it("gives exactly the four right-corner pieces a negative world determinant, and every other body a positive one", () => {
    const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);

    const negative = scene.solidsRoot.children
      .filter((child) => child.userData["placementId"] !== undefined)
      .filter((child) => child.matrixWorld.determinant() < 0)
      .map(placementIdOf);

    expect([...negative].sort()).toEqual([...RIGHT_CORNER_IDS].sort());
  });

  it("keeps a wrapper across an unchanged sync, and re-mounts a piece whose side changed", () => {
    const scene = mountU();
    const wrapper = mounted(scene, "right-p25");
    const sync = (room: DesignRoom): void => {
      syncSolidBodies({
        kit: scene.kit,
        solidsRoot: scene.solidsRoot,
        records: scene.records,
        room,
      });
    };

    sync(U_ROOM);
    expect(mounted(scene, "right-p25")).toBe(wrapper);

    sync({ ...U_ROOM, shape: "L", wallCMm: undefined });
    const unwrapped = mounted(scene, "right-p25");
    expect(unwrapped).not.toBe(wrapper);
    expect(isWrapped(unwrapped)).toBe(false);
    expect(unwrapped.scale.toArray()).toEqual([1, 1, 1]);

    sync(U_ROOM);
    expect(isWrapped(mounted(scene, "right-p25"))).toBe(true);
  });
});

describe("wall C's bodies and voids are drawn at their world frames, unmirrored (Q-U5)", () => {
  it("draws a wall-C body with a positive determinant, yaw −π/2, its back face on wall C's plane", () => {
    const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);
    const record = required(
      scene.records.find((r) => r.id === "c-base"),
      "c-base",
    );
    const body = mounted(scene, "c-base");

    expect(isWrapped(body)).toBe(false);
    expect(body.scale.toArray()).toEqual([1, 1, 1]);
    expect(body.matrixWorld.determinant()).toBeGreaterThan(0);
    expect(body.rotation.y).toBeCloseTo(-Math.PI / 2, 9);
    expect(body.position.x).toBeCloseTo(record.frame.x, 9);
    expect(body.position.z).toBeCloseTo(record.frame.z, 9);
    expect(worldBoxOf(body).max.x).toBeCloseTo(toMetres(U_ROOM.widthMm), 3);
  });

  it("draws every void with a positive determinant at its record's world frame, wall C's included", () => {
    const scene = mountU();
    const wallCVoids = scene.voidsRoot.children.filter((child) =>
      String(child.userData["voidId"]).startsWith("C|"),
    );

    expect(wallCVoids.length).toBeGreaterThan(0);
    for (const group of scene.voidsRoot.children) {
      expect(group.matrixWorld.determinant()).toBeGreaterThan(0);
      expect(group.scale.toArray()).toEqual([1, 1, 1]);
    }
    for (const group of wallCVoids) {
      expect(group.rotation.y).toBeCloseTo(-Math.PI / 2, 9);
      expect(group.position.x).toBeGreaterThan(toMetres(U_ROOM.widthMm) - 1);
    }
  });

  it("keeps the wall-C void at the frame the domain derived, box centre and all", () => {
    const scene = mountU();
    const columns = deriveRecordedColumns(
      scene.records,
      scene.design,
      toMetres(U_ROOM.widthMm),
    );
    const derived: VoidRecord = required(
      recomputeVoids(scene.records, columns).find((v) => v.id.startsWith("C|")),
      "a wall-C void",
    );
    const group = required(
      scene.voidsRoot.children.find((c) => c.userData["voidId"] === derived.id),
      derived.id,
    );

    expect(group.position.x).toBeCloseTo(derived.x, 9);
    expect(group.position.y).toBeCloseTo(derived.y0 + derived.h / 2, 9);
    expect(group.position.z).toBeCloseTo(derived.z, 9);
  });
});

describe("no Mesh, Line or Points in a U's scene has a negative scale component (criterion 3)", () => {
  it("holds over the shell, every body, every void, an outline and a mark", () => {
    const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);
    for (const id of [...RIGHT_CORNER_IDS, "c-base"]) {
      const target = mounted(scene, id);
      const outline = buildSelectionOutline({
        target,
        parent: scene.stageRoot,
        kind: "placement",
      });
      scene.stageRoot.add(outline.group);
      scene.stageRoot.add(
        buildOverflowMark({ target, parent: scene.stageRoot }).group,
      );
    }
    scene.stageRoot.updateMatrixWorld(true);

    const offenders: string[] = [];
    scene.stageRoot.traverse((node) => {
      const isLeaf =
        isMesh(node) || isLine(node) || node instanceof THREE.Points;
      if (isLeaf && node.scale.toArray().some((component) => component < 0)) {
        offenders.push(node.name);
      }
    });

    expect(offenders).toEqual([]);
  });

  it("never draws a body material DoubleSide", () => {
    const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);

    scene.solidsRoot.traverse((node) => {
      if (!isMesh(node)) return;
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const material of materials) {
        expect(material.side, node.name).not.toBe(THREE.DoubleSide);
      }
    });
  });
});

describe("the L is exactly what it was: nothing is wrapped outside a U", () => {
  const L_ROOMS: readonly DesignRoom[] = [
    KITCHEN_L_DESIGN.room,
    { ...KITCHEN_L_DESIGN.room, cornerDirection: "right" },
    { ...KITCHEN_L_DESIGN.room, shape: "linear" },
  ];

  it.each(
    L_ROOMS.map(
      (room) => [room.shape + (room.cornerDirection ?? ""), room] as const,
    ),
  )(
    "%s: every body is a direct, unwrapped, positive-scale child carrying its own tags",
    (_name, room) => {
      const kit = makeKit({ createCanvas: createHeadlessCanvas });
      const records = derivePlacementRecords(
        { ...KITCHEN_L_DESIGN, room },
        KITCHEN_L_BODY_CATALOG,
      );
      const solidsRoot = new THREE.Group();
      syncSolidBodies({ kit, solidsRoot, records, room });

      expect(solidsRoot.children).toHaveLength(records.length);
      solidsRoot.traverse((node) => {
        expect(node.name).not.toBe(RIGHT_CORNER_WRAPPER_NAME);
      });
      for (const child of solidsRoot.children) {
        expect(child.scale.toArray()).toEqual([1, 1, 1]);
        expect(String(child.userData["bodySignature"])).not.toContain("mirror");
      }
    },
  );
});

describe("picking climbs through a wrapper (§6.1, criterion 3)", () => {
  function selectionAlong(
    scene: MountedU,
    ray: { origin: THREE.Vector3; direction: THREE.Vector3 },
  ): Selection | null {
    const raycaster = createPickingRaycaster();
    raycaster.set(ray.origin, ray.direction.normalize());
    scene.stageRoot.updateMatrixWorld(true);
    return pick(raycaster, scene.solidsRoot, scene.voidsRoot);
  }

  it("selects the right X-leg from a click on its front", () => {
    const scene = mountU();
    const record = required(
      scene.records.find((r) => r.id === "right-p25"),
      "right-p25",
    );

    const selection = selectionAlong(scene, {
      // x - 0.3: the base return stands in front of the X-leg's far end, so the far end is where a click
      // reaches the X-leg's own front.
      origin: new THREE.Vector3(record.frame.x - 0.3, 0.4, 3),
      direction: new THREE.Vector3(0, 0, -1),
    });

    expect(selection).toEqual({ kind: "placement", id: "right-p25" });
  });

  it("selects the right corner's base return from the room side, and never the wall or the wrapper's body twice", () => {
    const scene = mountU();
    const record = required(
      scene.records.find((r) => r.id === "right-p26"),
      "right-p26",
    );

    const selection = selectionAlong(scene, {
      origin: new THREE.Vector3(record.frame.x - 2, 0.4, record.frame.z),
      direction: new THREE.Vector3(1, 0, 0),
    });

    expect(selection).toEqual({ kind: "placement", id: "right-p26" });
  });

  it("selects a wall-C body from a click on its front", () => {
    const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);

    const selection = selectionAlong(scene, {
      origin: new THREE.Vector3(toMetres(U_ROOM.widthMm) - 2, 0.4, 1.8),
      direction: new THREE.Vector3(1, 0, 0),
    });

    expect(selection).toEqual({ kind: "placement", id: "c-base" });
  });

  it("selects the base slot of an empty wall-C column (§11 row 2)", () => {
    const scene = mountU();

    const selection = selectionAlong(scene, {
      origin: new THREE.Vector3(toMetres(U_ROOM.widthMm) - 2, 0.4, 1.3),
      direction: new THREE.Vector3(1, 0, 0),
    });

    expect(selection).toEqual({ kind: "void", id: "C|1.30:v0:0.00" });
  });

  it("selects another wall-C cabinet after one is deleted (§11 row 22)", () => {
    const both = mountU((k) => [
      wallCCabinet(k, "c-first", 1800),
      wallCCabinet(k, "c-second", 2500),
    ]);
    syncSolidBodies({
      kit: both.kit,
      solidsRoot: both.solidsRoot,
      records: both.records.filter((record) => record.id !== "c-first"),
      room: both.design.room,
    });

    const selection = selectionAlong(both, {
      origin: new THREE.Vector3(toMetres(U_ROOM.widthMm) - 2, 0.4, 2.5),
      direction: new THREE.Vector3(1, 0, 0),
    });

    expect(selection).toEqual({ kind: "placement", id: "c-second" });
  });
});

describe("the selection outline and the overflow mark work on wall C and on a mirrored piece", () => {
  const TARGETS = [
    ["the right X-leg (mirrored)", "right-p25", true],
    ["the right corner's base return (mirrored)", "right-p26", true],
    ["a wall-C body (unmirrored)", "c-base", false],
  ] as const;

  it.each(TARGETS)(
    "outlines %s where it stands, one-sided-proof and unmirrored in itself",
    (_name, id, isMirrored) => {
      const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);
      const target = mounted(scene, id);

      const outline = buildSelectionOutline({
        target,
        parent: scene.stageRoot,
        kind: "placement",
      });
      scene.stageRoot.add(outline.group);
      scene.stageRoot.updateMatrixWorld(true);

      expectBoxWithin(
        worldBoxOf(target),
        worldBoxOf(outline.visibleLine),
        HULL_TOLERANCE_M,
      );
      expect(outline.group.matrixWorld.determinant() < 0).toBe(isMirrored);
      for (const line of [
        outline.visibleLine,
        outline.casingLine,
        outline.occludedLine,
      ]) {
        expect((line.material as THREE.Material).side).toBe(THREE.DoubleSide);
        expect(line.scale.toArray()).toEqual([1, 1, 1]);
      }
    },
  );

  it.each(TARGETS)("marks %s over its own extent", (_name, id, isMirrored) => {
    const scene = mountU((kit) => [wallCCabinet(kit, "c-base", 1800)]);
    const target = mounted(scene, id);

    const mark = buildOverflowMark({ target, parent: scene.stageRoot });
    scene.stageRoot.add(mark.group);
    scene.stageRoot.updateMatrixWorld(true);

    expectBoxWithin(
      worldBoxOf(target),
      worldBoxOf(mark.wash),
      HULL_TOLERANCE_M,
    );
    expect(mark.group.matrixWorld.determinant() < 0).toBe(isMirrored);
    expect((mark.wash.material as THREE.Material).side).toBe(THREE.FrontSide);
  });

  it("outlines the mirrored X-leg where the left X-leg's outline would stand, reflected in x = W/2", () => {
    const scene = mountU();
    const widthM = toMetres(U_ROOM.widthMm);
    const outlineOf = (id: string) => {
      const outline = buildSelectionOutline({
        target: mounted(scene, id),
        parent: scene.stageRoot,
        kind: "placement",
      });
      scene.stageRoot.add(outline.group);
      scene.stageRoot.updateMatrixWorld(true);
      return worldBoxOf(outline.visibleLine);
    };

    const left = outlineOf("p25");
    const right = outlineOf("right-p25");

    expect(right.min.x).toBeCloseTo(widthM - left.max.x, 4);
    expect(right.max.x).toBeCloseTo(widthM - left.min.x, 4);
    expect(right.min.z).toBeCloseTo(left.min.z, 4);
    expect(right.max.z).toBeCloseTo(left.max.z, 4);
  });
});
