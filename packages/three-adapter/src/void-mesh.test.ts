// Work item 5's void mesh, and the picking-threshold risk's other half (`DEVELOPMENT-SPEC.md`
// §6.1): the dashed edge outline must never be a raycast target. That assertion is pinned here on
// the exact function reference, not on observed raycast behaviour, so a refactor that swaps in an
// equivalent-looking no-op still fails loudly.
import * as THREE from "three";
import type { VoidRecord } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { buildVoidMesh, NOOP_RAYCAST, VOID_INSET_M } from "./void-mesh.js";

function makeVoidRecord(overrides: Partial<VoidRecord> = {}): VoidRecord {
  return {
    id: "A|1.30:v0:0.00",
    col: "A|1.30",
    wall: "A",
    x: 1.3,
    z: 0.3,
    ry: 0,
    w: 0.6,
    d: 0.56,
    y0: 0,
    h: 0.86,
    spanY0: 0,
    spanH: 0.86,
    ...overrides,
  };
}

describe("buildVoidMesh", () => {
  it("installs the exact no-op raycast function on the edges, not an equivalent one", () => {
    const { edges } = buildVoidMesh(makeVoidRecord());
    // eslint-disable-next-line @typescript-eslint/unbound-method -- identity check, never called unbound
    expect(edges.raycast).toBe(NOOP_RAYCAST);
  });

  it("insets the box 14 mm from the frame on every axis", () => {
    const voidRecord = makeVoidRecord({ w: 0.6, h: 0.86, d: 0.56 });
    const { box } = buildVoidMesh(voidRecord);
    box.geometry.computeBoundingBox();
    const size = box.geometry.boundingBox?.getSize(new THREE.Vector3());
    expect(size?.x).toBeCloseTo(voidRecord.w - 2 * VOID_INSET_M, 6);
    expect(size?.y).toBeCloseTo(voidRecord.h - 2 * VOID_INSET_M, 6);
    expect(size?.z).toBeCloseTo(voidRecord.d - 2 * VOID_INSET_M, 6);
  });

  it("positions the group at the frame's vertical centre and horizontal centre", () => {
    const voidRecord = makeVoidRecord({
      x: 1.3,
      z: 0.3,
      y0: 1.5,
      h: 0.7,
      ry: Math.PI / 2,
    });
    const { group } = buildVoidMesh(voidRecord);
    expect(group.position.x).toBe(1.3);
    expect(group.position.z).toBe(0.3);
    expect(group.position.y).toBeCloseTo(1.5 + 0.7 / 2, 6);
    expect(group.rotation.y).toBe(Math.PI / 2);
  });

  it("tags the group root with the void id for picking to climb to", () => {
    const voidRecord = makeVoidRecord({ id: "B|0.61:v1:1.50" });
    const { group } = buildVoidMesh(voidRecord);
    expect(group.userData["voidId"]).toBe("B|0.61:v1:1.50");
  });

  it("computes line distances so the dashed material actually dashes", () => {
    const { edges } = buildVoidMesh(makeVoidRecord());
    expect(edges.geometry.attributes["lineDistance"]).toBeDefined();
  });
});
