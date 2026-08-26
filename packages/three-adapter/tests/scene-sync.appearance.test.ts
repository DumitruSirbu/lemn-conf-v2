// §5.5: finish and handle are recorded **per placement**, and M4's editor panel is what records
// them. The failure this file exists to catch is the one the panel shipped with: a chip marked
// itself, the record was written, a save was scheduled, and the scene was pixel-identical.
//
// §11 row 12 (resize preserves finish + handle) rides on the same seam: a resize re-signs the
// record, so the choice has to survive a rebuild rather than a mutation in place.
import type { Frame, PlacementRecord } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const SAGE = "#8d9a84";
const WALL_ROW_Y0_M = 1.5;

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

type RecordOverrides = Partial<Omit<PlacementRecord, "frame">> & {
  readonly id: string;
  readonly frame?: Partial<Frame>;
};

function makeRecord(overrides: RecordOverrides): PlacementRecord {
  return {
    buildId: "wall-2door",
    kind: "wall_cabinet",
    col: "A|2.00",
    wall: "A",
    rotated: false,
    band: "wall",
    widthMm: 600,
    heightMm: 700,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    accessory: false,
    ...overrides,
    frame: {
      x: 2,
      y0: WALL_ROW_Y0_M,
      z: 0.2,
      ry: 0,
      w: 0.6,
      h: 0.7,
      d: 0.4,
      ...overrides.frame,
    },
  };
}

function sync(records: readonly PlacementRecord[]): void {
  syncSolidBodies({ kit, solidsRoot, records });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

function meshesNamed(
  root: THREE.Object3D,
  pattern: RegExp,
): readonly THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node) && pattern.test(node.name)) found.push(node);
  });
  return found;
}

function frontsOf(root: THREE.Object3D): readonly THREE.Mesh[] {
  return meshesNamed(root, /door_front|drawer_front/);
}

function handlesOf(root: THREE.Object3D): readonly THREE.Mesh[] {
  return meshesNamed(root, /handle/);
}

function colourOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material) || !("color" in material)) {
    throw new Error(`Mesh "${mesh.name}" has no single coloured material`);
  }
  return `#${(material.color as THREE.Color).getHexString()}`;
}

describe("a recorded finish reaches the scene", () => {
  it("recolours the fronts of the body that recorded it", () => {
    sync([makeRecord({ id: "p1", finishKey: "sage" })]);

    const fronts = frontsOf(mounted("p1"));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(colourOf(front)).toBe(SAGE);
  });

  it("leaves every other body's fronts alone", () => {
    sync([
      makeRecord({ id: "p1", finishKey: "sage" }),
      makeRecord({ id: "p2", frame: { x: 3 } }),
    ]);

    for (const front of frontsOf(mounted("p2"))) {
      expect(front.material).toBe(kit.M.door);
    }
  });

  it("dresses the fronts in oak rather than a colour", () => {
    sync([makeRecord({ id: "p1", finishKey: "oak" })]);

    for (const front of frontsOf(mounted("p1"))) {
      expect((front.material as THREE.MeshStandardMaterial).map).toBe(
        kit.M.oak.map,
      );
    }
  });

  it("ignores a finish recorded on a body that cannot take one", () => {
    sync([makeRecord({ id: "p1", finishKey: "sage", canFinish: false })]);

    for (const front of frontsOf(mounted("p1"))) {
      expect(front.material).toBe(kit.M.door);
    }
  });

  it("shares one material per finish instead of cloning per front", () => {
    sync([
      makeRecord({ id: "p1", finishKey: "clay" }),
      makeRecord({ id: "p2", finishKey: "clay", frame: { x: 3 } }),
    ]);

    const materials = new Set(
      [...frontsOf(mounted("p1")), ...frontsOf(mounted("p2"))].map(
        (front) => front.material,
      ),
    );
    expect(materials.size).toBe(1);
  });
});

describe("a design that records no finish renders as it did before", () => {
  it("leaves every front on the kit's own door material", () => {
    sync([makeRecord({ id: "p1" }), makeRecord({ id: "p2", frame: { x: 3 } })]);

    const fronts = [...frontsOf(mounted("p1")), ...frontsOf(mounted("p2"))];
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(front.material).toBe(kit.M.door);
  });
});

describe("a finish change re-signs the body", () => {
  it("rebuilds the body so the new finish is on screen", () => {
    sync([makeRecord({ id: "p1", finishKey: "sage" })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", finishKey: "graphite" })]);

    expect(mounted("p1")).not.toBe(before);
    for (const front of frontsOf(mounted("p1"))) {
      expect(colourOf(front)).toBe("#2b2d30");
    }
  });

  it("keeps the identical instance when the finish did not change", () => {
    const records = [makeRecord({ id: "p1", finishKey: "sage" })];
    sync(records);
    const before = mounted("p1");

    sync(records);

    expect(mounted("p1")).toBe(before);
  });

  it("carries the finish through a resize, which is §11 row 12", () => {
    sync([makeRecord({ id: "p1", finishKey: "sage" })]);

    sync([makeRecord({ id: "p1", finishKey: "sage", widthMm: 800 })]);

    const fronts = frontsOf(mounted("p1"));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(colourOf(front)).toBe(SAGE);
  });
});

describe("a recorded handle mode reaches the scene", () => {
  it("renders a black handle darker than the steel one it replaces", () => {
    sync([
      makeRecord({ id: "p1", handleMode: "black" }),
      makeRecord({ id: "p2", handleMode: "steel", frame: { x: 3 } }),
    ]);

    const black = handlesOf(mounted("p1"));
    expect(black.length).toBeGreaterThan(0);
    for (const handle of black) {
      expect(handle.material).not.toBe(kit.M.steel);
      expect(colourOf(handle)).toBe("#1c1e20");
      expect(handle.visible).toBe(true);
    }
    for (const handle of handlesOf(mounted("p2"))) {
      expect(handle.material).toBe(kit.M.steel);
    }
  });

  it("leaves a body with no recorded mode on the kit's steel", () => {
    sync([makeRecord({ id: "p1" })]);

    const handles = handlesOf(mounted("p1"));
    expect(handles.length).toBeGreaterThan(0);
    for (const handle of handles) expect(handle.material).toBe(kit.M.steel);
  });

  it("ignores a black mode recorded on a body that cannot take a handle", () => {
    sync([makeRecord({ id: "p1", handleMode: "black", canHandle: false })]);

    for (const handle of handlesOf(mounted("p1"))) {
      expect(handle.material).toBe(kit.M.steel);
    }
  });

  it("re-signs on a handle change and rebuilds black to steel", () => {
    sync([makeRecord({ id: "p1", handleMode: "black" })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", handleMode: "steel" })]);

    expect(mounted("p1")).not.toBe(before);
    for (const handle of handlesOf(mounted("p1"))) {
      expect(handle.material).toBe(kit.M.steel);
    }
  });

  it("keeps a black handle hidden when the mode is push", () => {
    sync([makeRecord({ id: "p1", handleMode: "push" })]);

    for (const handle of handlesOf(mounted("p1"))) {
      expect(handle.visible).toBe(false);
    }
  });
});

describe("finish and handle are independent choices", () => {
  it("applies both to the same body without either undoing the other", () => {
    sync([makeRecord({ id: "p1", finishKey: "sage", handleMode: "black" })]);

    const body = mounted("p1");
    for (const front of frontsOf(body)) expect(colourOf(front)).toBe(SAGE);
    for (const handle of handlesOf(body)) {
      expect(colourOf(handle)).toBe("#1c1e20");
    }
  });
});
