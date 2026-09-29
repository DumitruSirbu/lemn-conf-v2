// `DEVELOPMENT-SPEC.md` §6.1: a void is rendered as a translucent box plus dashed edges, inset
// 14 mm so it never overhangs a neighbour's face. The edges must never be a raycast target — see
// `NOOP_RAYCAST` — or a dashed outline steals clicks meant for the void (or a neighbour) behind it.
import * as THREE from "three";
import type { VoidRecord } from "@lemnaria/configurator-domain";

import { tagWall } from "./wall-tag.js";

/** `DEVELOPMENT-SPEC.md` §6.1: void meshes are inset 14 mm from their frame. */
export const VOID_INSET_M = 0.014;

const FILL_COLOR = 0x5a9bd8;
const EDGE_COLOR = 0x2f6fb0;
const DASH_SIZE_M = 0.02;
const GAP_SIZE_M = 0.012;

/** Assigned to `edges.raycast`, never inferred: three.js line raycasting is the specific defect
 *  §6.1 names ("void outlines must not be raycast targets"). Exported so a test can assert this
 *  exact function is installed, not merely that raycasting behaves as if it were. */
export const NOOP_RAYCAST = (): void => {
  /* void outlines are excluded from raycasting — see module doc */
};

export interface VoidMesh {
  readonly group: THREE.Group;
  readonly box: THREE.Mesh;
  readonly edges: THREE.LineSegments;
}

/** Builds the translucent box + dashed-edge representation of one derived void, positioned and
 *  rotated at the void's frame centre. `group.userData.voidId` is the selectable root's identity —
 *  picking climbs parents until it finds this. */
export function buildVoidMesh(voidRecord: VoidRecord): VoidMesh {
  const width = voidRecord.w - 2 * VOID_INSET_M;
  const height = voidRecord.h - 2 * VOID_INSET_M;
  // **This reader wants the clearance** (ADR 0060 decision 1): the box shows the customer how much
  // space is free, so it is drawn to §3.2's MAX over the column's members — appliance door bars
  // included — and deliberately not to `columnBuildDepthM`, the depth a cabinet dropped in here
  // would be manufactured to. Over the fridge column those are 742 and 600 mm, and the free space
  // really is the deeper of the two.
  const clearanceDepth = voidRecord.d - 2 * VOID_INSET_M;

  const geometry = new THREE.BoxGeometry(width, height, clearanceDepth);
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: FILL_COLOR,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const box = new THREE.Mesh(geometry, fillMaterial);
  box.name = "void_fill";

  const edgesGeometry = new THREE.EdgesGeometry(geometry);
  const edgeMaterial = new THREE.LineDashedMaterial({
    color: EDGE_COLOR,
    dashSize: DASH_SIZE_M,
    gapSize: GAP_SIZE_M,
  });
  const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial);
  edges.name = "void_edges";
  edges.computeLineDistances();
  edges.raycast = NOOP_RAYCAST;

  const group = new THREE.Group();
  group.name = "void";
  group.add(box, edges);
  group.position.set(
    voidRecord.x,
    voidRecord.y0 + voidRecord.h / 2,
    voidRecord.z,
  );
  group.rotation.y = voidRecord.ry;
  group.userData["voidId"] = voidRecord.id;
  tagWall(group, voidRecord.wall);

  return { group, box, edges };
}
