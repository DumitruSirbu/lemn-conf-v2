// M7C wave C2 slice S2: the corner wall unit as the scene mounts it from a generated shell.
//
// S1 built the body and measured it on its own; this is the body the product now draws: two build ids
// decomposed by `buildDecomposedBody`, seated from their placements, the top one built with its bar and
// hidden as every top-row body is (§6.5), the right corner's through its mirror wrapper.
import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  buildUShellDesign,
  cabinetHandleCount,
  derivePlacementRecords,
  paletteFinish,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { countBuiltCabinetHandles } from "../src/cabinet-handle-meshes.js";
import { collectPaintedSurfaces } from "../src/finishes.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { installHeadlessDocument } from "./support/headless-canvas.js";
import { meshesOf, productKitAt } from "./support/wall-unit.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4100,
  depthMm: 3300,
  heightMm: 2600,
};
const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4000,
  depthMm: 3000,
  wallCMm: 2800,
  heightMm: 2600,
};
const HALIFAX = paletteFinish("pal.stejar-halifax");
const HALIFAX_HEX = "#b09272";
const UNIT_FINISH_SURFACES = [
  "carcass_shell",
  "corner_closure",
  "corner_stile",
  "door_front",
];

beforeAll(() => {
  installHeadlessDocument();
});

function mount(design: Design, cabinetDepthMm = 600): THREE.Group {
  const root = new THREE.Group();
  syncSolidBodies({
    kit: productKitAt(cabinetDepthMm),
    solidsRoot: root,
    records: derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMm),
    ),
    room: design.room,
  });
  root.updateMatrixWorld(true);
  return root;
}

function mountedBody(root: THREE.Group, placementId: string): THREE.Object3D {
  const body = root.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`nothing mounted for ${placementId}`);
  return body;
}

function colourOf(mesh: THREE.Mesh): string {
  return `#${(mesh.material as THREE.MeshStandardMaterial).color.getHexString()}`;
}

const lShell = buildLShellDesign({ room: L_ROOM, occurredAt: OCCURRED_AT });
const uShell = buildUShellDesign({ room: U_ROOM, occurredAt: OCCURRED_AT });

describe("what the scene mounts for the corner wall unit", () => {
  const root = mount(lShell);

  it.each([
    ["p27", 0.7],
    ["p28", 0.4],
  ])("mounts %s as one group, wall_corner_x, %f m tall", (id, heightM) => {
    const body = mountedBody(root, id);
    const shell = meshesOf(body).find((mesh) => mesh.name === "carcass_shell");

    expect(findGroup(body)?.name).toBe("wall_corner_x");
    expect(
      new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y,
    ).toBeCloseTo(heightM, 2);
    expect(shell).toBeDefined();
  });

  it("seats each unit with its back face on the wall plane and its near end in the corner", () => {
    for (const id of ["p27", "p28"]) {
      const box = new THREE.Box3().setFromObject(mountedBody(root, id));

      expect(box.min.z).toBeCloseTo(0, 6);
      expect(box.min.x).toBeCloseTo(0, 6);
      expect(box.max.x).toBeCloseTo(0.9, 6);
    }
  });

  it("draws the middle unit's bar, and builds the top unit's and hides it, the declared count matching the meshes", () => {
    const catalog = buildKitchenLBodyCatalog(600);

    for (const [id, buildId, visible] of [
      ["p27", "wall-corner-x-900", true],
      ["p28", "wall-corner-x-900-top", false],
    ] as const) {
      const body = mountedBody(root, id);
      const bars = meshesOf(body).filter((mesh) => mesh.name === "handle_bar");

      const rule = catalog.get(buildId)?.cabinetHandles;
      if (rule === undefined) throw new Error(`${buildId} declares no handles`);
      const declared = cabinetHandleCount({ buildId, rule, widthMm: 900 });
      expect(declared).toBe(1);
      expect(countBuiltCabinetHandles(body)).toBe(declared);
      expect(bars.length).toBeGreaterThan(0);
      expect(bars.every((bar) => bar.visible === visible)).toBe(true);
    }
  });

  it("wears the finish on exactly four meshes: the shell, the closure, the stile and the leaf", () => {
    for (const id of ["p27", "p28"]) {
      expect(
        collectPaintedSurfaces(mountedBody(root, id))
          .map((mesh) => mesh.name)
          .sort(),
      ).toEqual(UNIT_FINISH_SURFACES);
    }
  });

  it("takes a kitchen colour on all four and leaves its liner, back board and bar alone", () => {
    const painted = mount({
      ...lShell,
      settings: {
        ...lShell.settings,
        materialTierId: "material.melamine",
        finish: HALIFAX,
      },
    });
    const body = mountedBody(painted, "p27");

    for (const mesh of collectPaintedSurfaces(body)) {
      expect([mesh.name, colourOf(mesh)]).toEqual([mesh.name, HALIFAX_HEX]);
    }
    for (const name of ["front_liner", "carcass_back", "handle_bar"]) {
      const mesh = meshesOf(body).find((candidate) => candidate.name === name);
      expect(mesh && colourOf(mesh)).not.toBe(HALIFAX_HEX);
    }
  });

  it("is picked as the one body by a tap on its leaf, its stile or its bar", () => {
    const body = mountedBody(root, "p27");

    for (const name of ["door_front", "corner_stile", "handle_bar"]) {
      const mesh = meshesOf(body).find((candidate) => candidate.name === name);
      if (!mesh) throw new Error(`no ${name}`);
      const box = new THREE.Box3().setFromObject(mesh);
      const aim = box.getCenter(new THREE.Vector3()).setZ(box.max.z + 0.05);
      const raycaster = createPickingRaycaster();
      raycaster.set(aim, new THREE.Vector3(0, 0, -1));

      expect(pick(raycaster, root, new THREE.Group())?.id, name).toBe("p27");
    }
  });
});

describe("the right corner of a U", () => {
  const root = mount(uShell);

  it("mounts the right corner's units through the mirror, and the left's unmirrored", () => {
    for (const [id, isMirrored] of [
      ["p27", false],
      ["p28", false],
      ["right-p27", true],
      ["right-p28", true],
    ] as const) {
      const body = mountedBody(root, id);

      expect(body.matrixWorld.determinant() < 0, id).toBe(isMirrored);
    }
  });

  it("puts the right unit's far end on the wall's end and its leaf's hinge on the side away from the corner", () => {
    const unit = new THREE.Box3().setFromObject(mountedBody(root, "right-p27"));
    const leaf = meshesOf(mountedBody(root, "right-p27")).find(
      (mesh) => mesh.name === "door_front",
    );
    if (!leaf) throw new Error("no leaf");
    const leafBox = new THREE.Box3().setFromObject(leaf);

    expect(unit.max.x).toBeCloseTo(U_ROOM.widthMm / 1000, 6);
    // The corner is at the right: the hinge is at the left edge, the leaf's near edge to the corner
    // being the one with the 30 mm clearance and the bar.
    expect(unit.max.x - leafBox.max.x).toBeGreaterThan(
      unit.min.x - leafBox.min.x + 0.3,
    );
  });
});

describe("the ceiling rule and the depth setting", () => {
  it("builds no top unit under 2600 and keeps the middle one", () => {
    const low = buildLShellDesign({
      room: { ...L_ROOM, heightMm: 2599 },
      occurredAt: OCCURRED_AT,
    });
    const root = mount(low);

    const mountedIds = root.children.map((child) =>
      String(child.userData["placementId"]),
    );

    expect(mountedIds).toContain("p27");
    expect(mountedIds).not.toContain("p28");
  });

  it("seats the unit at 700 with the wall depth the map gives, still on the wall plane", () => {
    const root = mount(lShell, 700);
    const box = new THREE.Box3().setFromObject(mountedBody(root, "p27"));

    expect(box.min.z).toBeCloseTo(0, 6);
    expect(box.max.z).toBeCloseTo(0.4, 6);
  });
});

function findGroup(body: THREE.Object3D): THREE.Object3D | undefined {
  if (body.name === "wall_corner_x") return body;
  let found: THREE.Object3D | undefined;
  body.traverse((node) => {
    if (found === undefined && node.name === "wall_corner_x") found = node;
  });
  return found;
}
