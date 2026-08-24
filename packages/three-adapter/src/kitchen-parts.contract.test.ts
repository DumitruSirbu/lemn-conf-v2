// The geometry acceptance criteria of `docs/milestones/M1-scene-port.md`, asserted against the
// port directly rather than against the reference. Where the parity suite proves "the port is the
// same as the reference", this suite proves "the reference contract in SPEC.md actually holds" —
// so a future change that drifts both files at once still fails here.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "./kitchen-parts.js";
import { createHeadlessCanvas } from "./testing/headless-canvas.js";
import { isMesh } from "./three-guards.js";
import { required } from "./testing/required.js";
import {
  chamferInset,
  findMesh,
  findMeshes,
  meshNames,
  worldBox,
} from "./testing/structure.js";

const EPS = 1e-6;
const CHAMFER_METRES = 0.0016;

let kit: Kit;

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function sizeOf(mesh: THREE.Mesh): [number, number, number] {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) throw new Error("no bounding box");
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
}

function expectSize(
  mesh: THREE.Mesh,
  expected: readonly [number, number, number],
) {
  const actual = sizeOf(mesh);
  actual.forEach((value, index) => {
    expect(value, `${mesh.name} axis ${String(index)}`).toBeCloseTo(
      expected[index] ?? NaN,
      6,
    );
  });
}

describe("anchor conventions", () => {
  it("puts every builder's origin on the floor and horizontally centred", () => {
    const floorStanding = [
      "base-2door",
      "base-3drawer",
      "tall-pantry",
      "tall-oven-tower",
    ] as const;
    for (const key of floorStanding) {
      const group = kit.builders[key]();
      const box = worldBox(group, group);
      expect(box.min.y, `${key} sits on the floor`).toBeCloseTo(0, 6);
      expect((box.min.x + box.max.x) / 2, `${key} is centred on X`).toBeCloseTo(
        0,
        3,
      );
    }
  });

  it("treats box y as the bottom of the box, not its centre", () => {
    const plinth = findMesh(kit.builders["base-2door"](), "plinth");
    // plinth(w, CARC_D) is built at y = 0 with height PLINTH; a centre-anchored helper would
    // place it at y = 0 and sink half of it below the floor.
    expect(plinth.position.y).toBeCloseTo(0.05, 6);
  });
});

describe("the derived plane table (SPEC.md)", () => {
  const base = () => kit.builders["base-2door"]();

  it("puts the carcass front at z = 0.280", () => {
    const shell = findMesh(base(), "carcass_shell");
    expect(shell.position.z + sizeOf(shell)[2] / 2).toBeCloseTo(0.28, 6);
  });

  it("puts the door front plane at z = 0.289 and its outer face at 0.298", () => {
    const cabinet = base();
    const door = findMeshes(cabinet, "door_front")[0];
    expect(door).toBeDefined();
    const box = worldBox(cabinet, required(door, "door_front mesh"));
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0.289, 6);
    expect(box.max.z).toBeCloseTo(0.298, 6);
  });

  it("puts the worktop front at z = 0.330, its top at y = 0.820 and finished height 0.860", () => {
    const cabinet = base();
    const box = worldBox(cabinet, findMesh(cabinet, "countertop"));
    expect(box.max.z).toBeCloseTo(0.33, 6);
    expect(box.min.y).toBeCloseTo(0.82, 6);
    expect(box.max.y).toBeCloseTo(0.86, 6);
  });

  it("recesses the plinth front to z = 0.220", () => {
    const cabinet = base();
    expect(worldBox(cabinet, findMesh(cabinet, "plinth")).max.z).toBeCloseTo(
      0.22,
      6,
    );
  });

  it("holds the wall band at 1.500 - 2.200 and the ceiling row at 2.200 - 2.600 in the scene", () => {
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    const bands = new Set<string>();
    for (const child of room.children) {
      if (child.name !== "wall_cabinet") continue;
      const box = new THREE.Box3().setFromObject(child);
      bands.add(`${box.min.y.toFixed(3)}-${box.max.y.toFixed(3)}`);
    }
    expect(bands).toContain("1.500-2.200");
    expect(bands).toContain("2.200-2.600");
  });
});

describe("the chamfer", () => {
  it("is 1.6 mm absolute and never proportional to the box", () => {
    const narrow = findMesh(kit.builders["base-1door"](), "carcass_shell");
    const wide = findMesh(kit.builders["base-corner-x"](), "carcass");
    expect(chamferInset(narrow, sizeOf(narrow)[0])).toBeCloseTo(
      CHAMFER_METRES,
      6,
    );
    expect(chamferInset(wide, sizeOf(wide)[0])).toBeCloseTo(CHAMFER_METRES, 6);
  });

  it("keeps the chamfered box at its nominal outer size", () => {
    expectSize(
      findMesh(kit.builders["base-corner-x"](), "carcass"),
      [0.9, 0.72, 0.6],
    );
  });

  it("shrinks below 1.6 mm only when a box is too thin to carry it", () => {
    // bowl_edge_left is 2 mm thick, so the chamfer collapses to w/3 rather than eating the box.
    const edge = findMesh(kit.builders["sink-faucet"](), "bowl_edge_left");
    expect(chamferInset(edge, sizeOf(edge)[0])).toBeCloseTo(0.002 / 3, 6);
  });
});

describe("the sink — a cut worktop over an open no-top frame", () => {
  const sinkBase = () => kit.builders["base-sink"]();

  it("splits the worktop into front, back and two sides instead of one slab", () => {
    const names = meshNames(sinkBase());
    expect(names).not.toContain("countertop");
    expect(names).toContain("countertop_front");
    expect(names).toContain("countertop_back");
    expect(names.filter((n) => n === "countertop_side")).toHaveLength(2);
  });

  it("leaves a 0.28 x 0.20 half-size aperture through the worktop", () => {
    const cabinet = sinkBase();
    const front = worldBox(cabinet, findMesh(cabinet, "countertop_front"));
    const back = worldBox(cabinet, findMesh(cabinet, "countertop_back"));
    expect(front.min.z).toBeCloseTo(0.2, 6);
    expect(back.max.z).toBeCloseTo(-0.2, 6);
    const sides = findMeshes(cabinet, "countertop_side").map((m) =>
      worldBox(cabinet, m),
    );
    const inner = sides.map((box) =>
      Math.min(Math.abs(box.min.x), Math.abs(box.max.x)),
    );
    for (const edge of inner) expect(edge).toBeCloseTo(0.28, 6);
  });

  it("builds the carcass as an open frame with no top panel", () => {
    const names = meshNames(sinkBase());
    expect(names).not.toContain("carcass_shell");
    expect(names).not.toContain("panel_top");
    expect(names).toContain("panel_bottom");
    expect(names).toContain("side_left");
    expect(names).toContain("side_right");
  });

  it("keeps the bowl at its fixed 560 x 400 x 185 size inside an 800 mm host", () => {
    const cabinet = sinkBase();
    expectSize(findMesh(cabinet, "sink_rim_front"), [0.56, 0.012, 0.02]);
    expectSize(findMesh(cabinet, "bowl_wall_left"), [0.014, 0.185, 0.4]);
    expectSize(findMesh(cabinet, "bowl_floor"), [0.56, 0.012, 0.4]);
  });
});

describe("appliance cavities and proud fronts", () => {
  it("keeps the oven cavity strictly inside the carcass interior", () => {
    const oven = kit.builders.oven();
    expectSize(findMesh(oven, "oven_cavity"), [
      0.596 - 0.06,
      0.595 - 0.02,
      0.48,
    ]);
  });

  it("insets the oven cavity from the tower's back panel", () => {
    const tower = kit.builders["tall-oven-tower"]();
    tower.updateWorldMatrix(true, true);
    const cavity = worldBox(tower, findMesh(tower, "oven_cavity"));
    const backPanels = findMeshes(tower, "back_panel").map((m) =>
      worldBox(tower, m),
    );
    const deepest = Math.min(...backPanels.map((box) => box.min.z));
    expect(cavity.min.z).toBeGreaterThan(deepest);
  });

  it("sits the oven front proud by +0.018 and the microwave by +0.089", () => {
    const tower = kit.builders["tall-oven-tower"]();
    const oven = tower.children.find((c) => c.name === "oven");
    const microwave = tower.children.find((c) => c.name === "microwave");
    expect(oven?.position.z).toBeCloseTo(0.018, 6);
    expect(microwave?.position.z).toBeCloseTo(0.089, 6);
  });

  it("holds every purchased part at its fixed real-world size", () => {
    expectSize(
      findMesh(kit.builders.oven(), "oven_front"),
      [0.596, 0.595, 0.026],
    );
    expectSize(
      findMesh(kit.builders.microwave(), "mw_front"),
      [0.596, 0.38, 0.024],
    );
    expectSize(
      findMesh(kit.builders.cooktop(), "cooktop_glass"),
      [0.59, 0.012, 0.52],
    );
    expectSize(
      findMesh(kit.builders["fridge-free"](), "fridge_body"),
      [0.7, 1.85, 0.68],
    );
    const dishwasher = kit.builders.dishwasher();
    expectSize(findMesh(dishwasher, "dw_panel"), [0.596, 0.72 - 0.06, 0.018]);
    const dishwasherBox = worldBox(dishwasher, dishwasher);
    expect(dishwasherBox.max.y - dishwasherBox.min.y).toBeCloseTo(0.72, 6);
  });

  it("does not resize a fixed appliance to its host cabinet", () => {
    // The oven comes in one size, so the housing is sized to it and never the other way round.
    const standalone = findMesh(kit.builders.oven(), "oven_front");
    const housed = findMesh(kit.builders["tall-oven-tower"](), "oven_front");
    expect(sizeOf(housed)).toEqual(sizeOf(standalone));
  });

  it("varies only the dishwasher's width between the 450 and 600 niches", () => {
    // The dishwasher is the one appliance that ships in two widths, so the niche follows the
    // appliance on X. Height and depth are still fixed real-world sizes.
    const wide = sizeOf(findMesh(kit.make.dishwasherHousing(0.6), "dw_body"));
    const slim = sizeOf(findMesh(kit.make.dishwasherHousing(0.45), "dw_body"));
    expect(wide[0]).toBeCloseTo(0.542, 6);
    expect(slim[0]).toBeCloseTo(0.392, 6);
    expect(slim[1]).toBeCloseTo(wide[1], 6);
    expect(slim[2]).toBeCloseTo(wide[2], 6);
  });
});

describe("handles", () => {
  it("caps bars at 190 mm horizontal regardless of front width", () => {
    const narrow = findMesh(
      kit.make.baseCabinet(0.4, { drawers: 3 }),
      "handle_bar",
    );
    const wide = findMesh(
      kit.make.baseCabinet(0.8, { drawers: 3 }),
      "handle_bar",
    );
    expect(sizeOf(narrow)[1]).toBeCloseTo(0.19, 6);
    expect(sizeOf(wide)[1]).toBeCloseTo(0.19, 6);
  });

  it("caps vertical bars at 210 mm", () => {
    const bar = findMesh(kit.builders["base-2door"](), "handle_bar");
    expect(sizeOf(bar)[1]).toBeCloseTo(0.21, 6);
  });

  it("carries an overhead door's bar on its bottom edge at a 40 mm inset", () => {
    const overhead = kit.make.wallCabinet(0.6, 2, 0.4, 0.33);
    overhead.updateWorldMatrix(true, true);
    const door = overhead.children.find((c) => c.name === "door");
    expect(door).toBeDefined();
    const doorGroup = required(door, "overhead door group");
    const front = worldBox(overhead, findMesh(doorGroup, "door_front"));
    const handle = required(
      doorGroup.children.find((c) => c.name === "handle"),
      "overhead door handle",
    );
    const handleY = new THREE.Vector3();
    handle.getWorldPosition(handleY);
    expect(handleY.y - front.min.y).toBeCloseTo(0.04, 6);
  });

  it("keeps a tall door's bar vertical", () => {
    const pantryBar = findMesh(kit.builders["tall-pantry"](), "handle_bar");
    expect(pantryBar.rotation.z).toBeCloseTo(0, 6);
  });
});

describe("the two corner legs", () => {
  it("computes each leg's plinth recess from its own depth only", () => {
    const xLeg = kit.make.cornerBaseX();
    const xPlinth = worldBox(xLeg, findMesh(xLeg, "plinth"));
    expect(xPlinth.max.z).toBeCloseTo(0.6 / 2 - 0.06, 6);
    for (const depth of [0.56, 0.58, 0.62]) {
      const leg = kit.make.cornerBaseReturn(depth);
      const plinth = worldBox(leg, findMesh(leg, "plinth"));
      expect(plinth.max.z, `return leg at depth ${String(depth)}`).toBeCloseTo(
        depth / 2 - 0.06,
        6,
      );
    }
  });

  it("butts the two worktops at world z = 0.630 with no interior overlap", () => {
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    const xLeg = room.children.find((c) => c.name === "corner_base_x");
    const returnLeg = room.children.find(
      (c) => c.name === "corner_base_return",
    );
    expect(xLeg).toBeDefined();
    expect(returnLeg).toBeDefined();
    const xTop = worldBox(
      room,
      findMesh(required(xLeg, "corner X-leg"), "countertop"),
    );
    const returnTop = worldBox(
      room,
      findMesh(required(returnLeg, "corner return leg"), "countertop"),
    );
    expect(xTop.min.z).toBeCloseTo(-0.01, 3);
    expect(xTop.max.z).toBeCloseTo(0.63, 3);
    expect(returnTop.min.z).toBeCloseTo(0.63, 3);
    expect(returnTop.max.z).toBeCloseTo(0.9, 3);
    for (const box of [xTop, returnTop]) {
      expect(box.min.y).toBeCloseTo(0.82, 3);
      expect(box.max.y).toBeCloseTo(0.86, 3);
    }
    expect(returnTop.min.z - xTop.max.z).toBeGreaterThanOrEqual(-EPS);
  });

  it("is two separate bodies, neither parented to the other", () => {
    const room = kit.builders["kitchen-l"]();
    const xLeg = room.children.find((c) => c.name === "corner_base_x");
    const returnLeg = room.children.find(
      (c) => c.name === "corner_base_return",
    );
    expect(xLeg?.parent).toBe(room);
    expect(returnLeg?.parent).toBe(room);
  });
});

describe("the ceiling row", () => {
  it("builds its handles and hides them rather than omitting them", () => {
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    const hidden: THREE.Object3D[] = [];
    room.traverse((o) => {
      if (isMesh(o) && o.name.includes("handle") && !o.visible) hidden.push(o);
    });
    expect(hidden.length).toBeGreaterThan(0);
    for (const handle of hidden) {
      const box = new THREE.Box3().setFromObject(handle);
      expect(box.min.y, `${handle.name} is in the ceiling row`).toBeGreaterThan(
        2.2 - 0.05,
      );
      expect(box.max.y).toBeLessThan(2.6 + EPS);
    }
  });

  it("still exposes the handle meshes so the choice can be turned back on", () => {
    const room = kit.builders["kitchen-l"]();
    const ceilingRow = room.children.filter((child) => {
      room.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(child);
      return (
        child.name === "wall_cabinet" && box.min.y > 2.19 && box.max.y < 2.61
      );
    });
    expect(ceilingRow.length).toBeGreaterThan(0);
    for (const unit of ceilingRow) {
      expect(meshNames(unit), `${unit.name} keeps its bars`).toContain(
        "handle_bar",
      );
    }
  });
});

describe("the seeded L scene", () => {
  it("seats every wall cabinet flush against the back wall plane at z = 0", () => {
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    const facingBackWall = room.children.filter(
      (child) =>
        child.name === "wall_cabinet" && Math.abs(child.rotation.y) < EPS,
    );
    expect(facingBackWall.length).toBeGreaterThan(0);
    for (const unit of facingBackWall) {
      const shell = worldBox(room, findMesh(unit, "carcass_shell"));
      expect(shell.min.z, "carcass touches the wall").toBeCloseTo(0, 6);
    }
  });

  it("leaves no gap along the wall A base run", () => {
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    const spans = room.children
      .filter((c) =>
        ["corner_base_x", "base_cabinet", "dishwasher_housing"].includes(
          c.name,
        ),
      )
      .map((c) => new THREE.Box3().setFromObject(c))
      .map((box): [number, number] => [box.min.x, box.max.x])
      .sort((a, b) => a[0] - b[0]);
    expect(spans.length).toBeGreaterThan(3);
    for (let i = 1; i < spans.length; i++) {
      const previousEnd = spans[i - 1]?.[1] ?? NaN;
      const currentStart = spans[i]?.[0] ?? NaN;
      expect(
        currentStart - previousEnd,
        `gap before run segment ${String(i)}`,
      ).toBeLessThan(0.01);
    }
  });

  it("stands every body fully on the floor slab", () => {
    const room = kit.builders["kitchen-l"]();
    room.updateWorldMatrix(true, true);
    const floor = findMesh(room, "floor");
    const slab = worldBox(room, floor);
    const scene = new THREE.Box3().setFromObject(room);
    expect(scene.min.x).toBeGreaterThanOrEqual(slab.min.x - EPS);
    expect(scene.max.x).toBeLessThanOrEqual(slab.max.x + EPS);
    expect(scene.min.z).toBeGreaterThanOrEqual(slab.min.z - EPS);
    expect(scene.max.z).toBeLessThanOrEqual(slab.max.z + EPS);
    expect(scene.min.y).toBeCloseTo(slab.min.y, 6);
  });

  it("reads its wall planes from named wall meshes", () => {
    const room = kit.builders["kitchen-l"]();
    const back = room.children.find((c) => c.name === "wall_back");
    const left = room.children.find((c) => c.name === "wall_left");
    expect(back?.position.z).toBeCloseTo(0, 6);
    expect(left?.position.x).toBeCloseTo(0, 6);
  });
});
