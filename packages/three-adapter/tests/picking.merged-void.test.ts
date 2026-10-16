// 8U criterion 12, the tap: a 600 and an 800 mm space merged into one 1400 mm column answer one void id per level
// wherever the box is tapped, the former seam included, and a cabinet behind the box still wins (§11 row 22).
//
// R6: the domain's merge capped at 800 turns the first case red; `pick` asking voids first turns the solids case red.
import {
  deriveColumns,
  DesignSchema,
  recomputeVoids,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createPickingRaycaster, pick } from "../src/picking.js";
import { buildVoidMesh } from "../src/void-mesh.js";

const NOW = "2026-10-16T12:00:00.000Z";
const SPAN_LEFT_M = 1.2;
const FORMER_SEAM_M = 1.8;
const SPAN_RIGHT_M = 2.6;
/** Clear of the 14 mm inset at either end, so every tap lands inside the drawn box. */
const EDGE_CLEARANCE_M = 0.02;
const TAPS_ACROSS = 29;
const CAMERA_DISTANCE_M = 5;

describe("tapping a merged 1400 mm space (8U criterion 12)", () => {
  it("answers one void per level, and the same id at every tap across the box, either side of the former seam", () => {
    const voids = mergedLevelVoids();
    const group = voidGroup(voids);

    expect(voids).toHaveLength(3);
    for (const record of voids) {
      expect(record.x - record.w / 2).toBeCloseTo(SPAN_LEFT_M, 9);
      expect(record.x + record.w / 2).toBeCloseTo(SPAN_RIGHT_M, 9);
    }
    for (const record of voids) {
      const picked = tapsAcross(record).map((x) =>
        pick(
          rayFromTheRoomAt(x, midHeightOf(record)),
          new THREE.Group(),
          group,
        ),
      );

      expect(new Set(picked.map((selection) => selection?.id))).toEqual(
        new Set([record.id]),
      );
    }
  });

  it("lets a cabinet standing behind the merged box take the tap, though the box is nearer", () => {
    const [baseVoid] = mergedLevelVoids();
    if (!baseVoid) throw new Error("the merged column published no void");
    const solids = new THREE.Group();
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.1));
    cabinet.position.set(FORMER_SEAM_M, 0.43, -0.2);
    cabinet.userData["placementId"] = "behind";
    solids.add(cabinet);
    solids.updateMatrixWorld(true);

    const selection = pick(
      rayFromTheRoomAt(FORMER_SEAM_M, midHeightOf(baseVoid)),
      solids,
      voidGroup([baseVoid]),
    );

    expect(selection).toEqual({ kind: "placement", id: "behind" });
  });
});

/** The editor's load of two stored, agreeing member-less spaces on wall A, through the domain's public build. */
function mergedLevelVoids(): VoidRecord[] {
  const design = DesignSchema.parse({
    room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [],
    emptyColumns: [
      {
        wall: "A",
        alongMm: 1500,
        widthMm: 600,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 580,
      },
      {
        wall: "A",
        alongMm: 2200,
        widthMm: 800,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 580,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  });
  const columns = deriveColumns([], design, design.room);
  return recomputeVoids([], columns).sort((a, b) => a.y0 - b.y0);
}

function voidGroup(records: readonly VoidRecord[]): THREE.Group {
  const group = new THREE.Group();
  for (const record of records) group.add(buildVoidMesh(record).group);
  group.updateMatrixWorld(true);
  return group;
}

function tapsAcross(record: VoidRecord): number[] {
  const leftM = record.x - record.w / 2 + EDGE_CLEARANCE_M;
  const stepM = (record.w - 2 * EDGE_CLEARANCE_M) / (TAPS_ACROSS - 1);
  const taps = Array.from(
    { length: TAPS_ACROSS },
    (_, index) => leftM + stepM * index,
  );
  return [...taps, FORMER_SEAM_M - 0.001, FORMER_SEAM_M, FORMER_SEAM_M + 0.001];
}

function midHeightOf(record: VoidRecord): number {
  return record.y0 + record.h / 2;
}

/** A tap from inside the room, square to wall A, at one point along it. */
function rayFromTheRoomAt(xM: number, yM: number): THREE.Raycaster {
  const raycaster = createPickingRaycaster();
  raycaster.set(
    new THREE.Vector3(xM, yM, CAMERA_DISTANCE_M),
    new THREE.Vector3(0, 0, -1),
  );
  return raycaster;
}
