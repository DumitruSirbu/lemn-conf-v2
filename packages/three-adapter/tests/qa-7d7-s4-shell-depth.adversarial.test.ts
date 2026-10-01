import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  setCabinetDepth,
  toMetres,
  type BodyProbeFactory,
  type Design,
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

const occurredAt = "2026-09-18T11:00:00.000Z";
const shellOnlyRooms = [
  { label: "engine 880 × 880", widthMm: 880, depthMm: 880 },
  { label: "engine 881 × 881", widthMm: 881, depthMm: 881 },
  { label: "approved 900 × 1000", widthMm: 900, depthMm: 1000 },
] as const;
const cornerIds = ["p25", "p26", "p9", "p21"] as const;

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

function mountedCornerBoxes(design: Design): Map<
  string,
  {
    carcass: THREE.Box3;
    door?: THREE.Box3;
    top?: THREE.Box3;
  }
> {
  const depthMm = cabinetDepthMmOf(design);
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm: depthMm,
  });
  const room = kit.builders["kitchen-l"]();
  const solids = new THREE.Group();
  try {
    syncSolidBodies({
      kit,
      solidsRoot: solids,
      records: derivePlacementRecords(
        design,
        buildKitchenLBodyCatalog(depthMm),
      ),
      room: design.room,
    });
    const boxes = new Map<
      string,
      {
        carcass: THREE.Box3;
        door?: THREE.Box3;
        top?: THREE.Box3;
      }
    >();
    for (const id of cornerIds) {
      const record = design.placements.find((p) => p.id === id);
      const body = solids.children.find(
        (child) => child.userData["placementId"] === id,
      );
      if (!record || !body) throw new Error(`missing corner ${id}`);
      const carcass = worldBox(
        solids,
        findMesh(
          body,
          id === "p25" || id === "p26" ? "carcass" : "carcass_shell",
        ),
      );
      const axis = record.wall === "A" ? "x" : "z";
      expect(carcass.min[axis], `${id} near face`).toBeCloseTo(
        toMetres(record.alongMm - record.body.widthMm / 2),
        4,
      );
      expect(carcass.max[axis], `${id} far face`).toBeCloseTo(
        toMetres(record.alongMm + record.body.widthMm / 2),
        4,
      );
      boxes.set(id, {
        carcass,
        ...(id === "p25"
          ? { door: worldBox(solids, findMesh(body, "door_front")) }
          : {}),
        ...(id === "p25" || id === "p26"
          ? { top: worldBox(solids, findMesh(body, "countertop")) }
          : {}),
      });
    }
    return boxes;
  } finally {
    disposeKit(kit, room);
  }
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`missing ${label}`);
  return value;
}

describe("S4 shell-only boundary rooms keep their world-space junction after a real depth command", () => {
  it.each(shellOnlyRooms)("$label at 600 → 700", ({ widthMm, depthMm }) => {
    const shell = buildLShellDesign({
      room: { shape: "L", widthMm, depthMm, heightMm: 2600 },
      occurredAt,
    });
    const changed = setCabinetDepth({
      design: shell,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: realProbeFactory(),
      cabinetDepthMm: 700,
      occurredAt,
    });
    if (!changed.ok)
      throw new Error(`depth change refused: ${changed.reason.code}`);
    const at700 = changed.design;
    expect(cabinetDepthMmOf(at700)).toBe(700);
    expect(
      cornerIds.map(
        (id) => at700.placements.find((p) => p.id === id)?.body.widthMm,
      ),
    ).toEqual(
      cornerIds.map(
        (id) => shell.placements.find((p) => p.id === id)?.body.widthMm,
      ),
    );

    for (const [design, expectedResidueMm] of [
      [shell, 0],
      [at700, 30],
    ] as const) {
      const boxes = mountedCornerBoxes(design);
      const x = required(boxes.get("p25"), "X leg");
      const base = required(boxes.get("p26"), "base return");
      const wall = required(boxes.get("p9"), "wall return");
      const top = required(boxes.get("p21"), "top return");
      const door = required(x.door, "X door");
      const xTop = required(x.top, "X worktop");
      const baseTop = required(base.top, "return worktop");
      expect(base.carcass.min.z - x.carcass.max.z).toBeCloseTo(0, 4);
      expect(baseTop.min.z - xTop.max.z).toBeCloseTo(0, 4);
      expect(door.min.x - base.carcass.max.x).toBeGreaterThan(0.029);
      expect(door.min.z).toBeLessThan(base.carcass.max.z);
      expect(door.max.z).toBeGreaterThan(base.carcass.min.z);
      expect((base.carcass.max.z - wall.carcass.max.z) * 1000).toBeCloseTo(
        expectedResidueMm,
        4,
      );
      expect(wall.carcass.max.z).toBeCloseTo(top.carcass.max.z, 4);
    }
  });
});
