// The selection highlight: three `LineSegments2` passes (ghost, casing, core) over the target's own edges. Lines are
// `LineSegments2` because WebGL ignores `LineBasicMaterial.linewidth` on desktop, so a basic line is always 1 px wide.
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type { SelectionKind } from "./picking.js";
import { transformRelativeTo } from "./relative-transform.js";
import { isMesh, toMaterials } from "./three-guards.js";
import { NOOP_RAYCAST } from "./void-mesh.js";
import { inheritWallTag } from "./wall-tag.js";

/**
 * Signal red, chosen against the declared palette (stage, paper, PAL decors, veneers, white walls). It is not a hue
 * the kitchen cannot contain: MDF's RAL picker admits `#ff2d2d` on a front, so contrast comes from the casing pass
 * (`SELECTION_OUTLINE_CASING_COLOR`), not from this constant (ADR 0091). `editor-rail.desktop.e2e.spec.ts` counts
 * selection pixels by nearness to it, which is valid only while the seeded fixture wears no finish.
 */
export const SELECTION_HIGHLIGHT_COLOR = 0xff2d2d;

/**
 * The second, contrasting pass. A customer can paint a front `#ff2d2d` through MDF's RAL picker and a red line on it
 * would vanish, and every hex is reachable, so a different red only relocates the collision. The outline is drawn
 * twice in two colours far apart, this near-black casing under the red core, so no single-colour front can equal
 * both: the nearest any front gets to both is 121.4 (asserted in `selection-outline.test.ts`). Near-black, not white:
 * the kitchen is bright, so a white casing is invisible. Not `0x000000`: pure black on a lit edge reads as a shadow.
 */
export const SELECTION_OUTLINE_CASING_COLOR = 0x101010;

/** Screen-space pixels: `LineSegments2` draws camera-facing quads, so the width takes effect, unlike `linewidth` on
 *  an ordinary `LineBasicMaterial`, which ANGLE and every desktop OpenGL driver ignore. */
export const SELECTION_OUTLINE_WIDTH_PX = 2;

/** A **sum**, not a ratio: what must survive is the rim, a difference of widths in screen pixels, and a ratio would
 *  make it vanish as the line narrows (a body far from the camera). A 1 px rim is the floor: below it the casing
 *  becomes an antialiasing artefact, so thinning the highlight moves the core and this addend stays at 2. */
export const SELECTION_OUTLINE_CASING_WIDTH_PX = SELECTION_OUTLINE_WIDTH_PX + 2;

/** The occluded half: drawn without depth testing so a body behind the worktop or a neighbour still shows. Thin and
 *  faint, measured on the real render: near full opacity it reads as floating in front of what covers it, and at 0.4
 *  its interior edges (shelves, carcass panels, sink bowl) became a red cage over the fronts. */
export const OCCLUDED_OUTLINE_OPACITY = 0.18;
export const OCCLUDED_OUTLINE_WIDTH_PX = 2;

/** Pushes the traced edges just proud of the surfaces they trace, so the depth-tested half is not
 *  buried inside its own 1.6 mm chamfer and z-fighting with it. */
const BODY_OUTLINE_MARGIN_M = 0.003;

/** A void is drawn with dashed blue edges 14 mm inside its frame (`void-mesh.ts`); expanding its outline by that
 *  inset puts the red on the frame, not on top of the dashes. */
const VOID_OUTLINE_MARGIN_M = 0.014;

/** Matches `void-mesh.ts`'s dash rhythm: a selected void keeps the dashed language it already
 *  speaks, so red-solid reads as "this cabinet" and red-dashed as "this empty slot". */
const DASH_SIZE_M = 0.02;
const GAP_SIZE_M = 0.012;

/** Degrees. Below 45° because the sharpest crease on a `chamferBox` is its 45° chamfer face; a higher threshold
 *  returns an empty outline. */
const EDGE_THRESHOLD_DEGREES = 20;

/** Ghost first, then casing, then core. Every pass writes no depth, so render order alone decides which colour a
 *  shared pixel ends up with. */
const OCCLUDED_RENDER_ORDER = 999;
const CASING_RENDER_ORDER = 1000;
const VISIBLE_RENDER_ORDER = 1001;

export interface SelectionOutlineInput {
  /** The mounted body or void group the outline traces. */
  readonly target: THREE.Object3D;
  /** The object the outline is added to. Its transform is relative to it, so any ancestor of the target works. */
  readonly parent: THREE.Object3D;
  readonly kind: SelectionKind;
}

export interface SelectionOutline {
  readonly group: THREE.Group;
  /** The depth-tested pass — the outline where the body is actually visible. */
  readonly visibleLine: LineSegments2;
  /** The wider near-black pass directly beneath `visibleLine` on the same edges, so the highlight keeps a rim the
   *  front it traces cannot also be wearing. */
  readonly casingLine: LineSegments2;
  /** The pass that ignores depth, so occluded parts of the selection still read. */
  readonly occludedLine: LineSegments2;
}

/**
 * Builds the highlight for one selected body or void: a red outline of the target's own edges (depth-tested), over a
 * wider near-black casing of the same edges, over a faint twelve-edge box that ignores depth (`boxGeometryAround`).
 * Edges come from `EdgesGeometry` over every visible mesh, so hidden push-to-open handles (§6.5) are not traced.
 * Nothing here is a raycast target (`NOOP_RAYCAST`, DEVELOPMENT-SPEC §6.1).
 */
export function buildSelectionOutline(
  input: SelectionOutlineInput,
): SelectionOutline {
  const isVoid = input.kind === "void";
  const positions = collectOutlinePositions(
    input.target,
    isVoid ? VOID_OUTLINE_MARGIN_M : BODY_OUTLINE_MARGIN_M,
  );

  const occludedLine = buildOutlinePass(boxGeometryAround(positions), {
    isDashed: isVoid,
    isDepthTested: false,
    opacity: OCCLUDED_OUTLINE_OPACITY,
    widthPx: OCCLUDED_OUTLINE_WIDTH_PX,
    renderOrder: OCCLUDED_RENDER_ORDER,
    color: SELECTION_HIGHLIGHT_COLOR,
    name: "selection_outline_occluded",
  });
  // One geometry for both depth-tested passes: it is the largest buffer, and `disposeSelectionOutline` deduplicates
  // by identity.
  const tracedEdges = new LineSegmentsGeometry().setPositions(positions);
  const casingLine = buildOutlinePass(tracedEdges, {
    isDashed: isVoid,
    isDepthTested: true,
    opacity: 1,
    widthPx: SELECTION_OUTLINE_CASING_WIDTH_PX,
    renderOrder: CASING_RENDER_ORDER,
    color: SELECTION_OUTLINE_CASING_COLOR,
    name: "selection_outline_casing",
  });
  const visibleLine = buildOutlinePass(tracedEdges, {
    isDashed: isVoid,
    isDepthTested: true,
    opacity: 1,
    widthPx: SELECTION_OUTLINE_WIDTH_PX,
    renderOrder: VISIBLE_RENDER_ORDER,
    color: SELECTION_HIGHLIGHT_COLOR,
    name: "selection_outline_visible",
  });

  const group = new THREE.Group();
  group.name = "selection_outline";
  inheritWallTag(group, input.target);
  group.add(occludedLine, casingLine, visibleLine);
  group.matrixAutoUpdate = false;
  group.matrix.copy(transformRelativeTo(input.parent, input.target));

  return { group, visibleLine, casingLine, occludedLine };
}

/** Geometries and materials: a selection outline owns everything inside it, as `disposeVoidMesh` does. */
export function disposeSelectionOutline(outline: THREE.Object3D): void {
  const disposed = new Set<THREE.BufferGeometry>();
  outline.traverse((node) => {
    if (!isMesh(node)) return;
    if (!disposed.has(node.geometry)) {
      disposed.add(node.geometry);
      node.geometry.dispose();
    }
    for (const material of toMaterials(node.material)) material.dispose();
  });
}

interface OutlinePassOptions {
  readonly isDashed: boolean;
  readonly isDepthTested: boolean;
  readonly opacity: number;
  readonly widthPx: number;
  readonly renderOrder: number;
  readonly color: number;
  readonly name: string;
}

function buildOutlinePass(
  geometry: LineSegmentsGeometry,
  options: OutlinePassOptions,
): LineSegments2 {
  const material = new LineMaterial({
    color: options.color,
    linewidth: options.widthPx,
    dashed: options.isDashed,
    dashSize: DASH_SIZE_M,
    gapSize: GAP_SIZE_M,
    transparent: true,
    opacity: options.opacity,
    depthTest: options.isDepthTested,
    depthWrite: false,
    // An interface colour is not part of the photograph: tone mapping would desaturate it and shrink the declared
    // separation between the two passes.
    toneMapped: false,
    // `LineSegments2` builds its quads in screen space, but three flips `gl.frontFace` when `matrixWorld`'s determinant
    // is negative (`WebGLRenderer.js`), which would cull every segment under a mirrored root. Double-siding a
    // screen-space quad hides nothing; the ban on `DoubleSide` applies to body geometry only (ADR 0129 Amendment (a)).
    side: THREE.DoubleSide,
  });

  const line = new LineSegments2(geometry, material);
  line.name = options.name;
  line.renderOrder = options.renderOrder;
  line.computeLineDistances();
  line.raycast = NOOP_RAYCAST;
  return line;
}

/** The twelve edges of the box the outline occupies, for the depth-ignoring pass. Deliberately crude: that pass draws
 *  through the body, so the full form (every shelf and carcass edge) became a red cage over the doors. */
function boxGeometryAround(positions: readonly number[]): LineSegmentsGeometry {
  const box = new THREE.Box3().setFromArray(positions);
  const corners = [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) =>
      [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z)),
    ),
  );
  // Corner index bits: 4 = max x, 2 = max y, 1 = max z. A pair differing in exactly one bit is a box edge.
  const edges: number[] = [];
  for (let from = 0; from < corners.length; from += 1) {
    for (let to = from + 1; to < corners.length; to += 1) {
      if (!isSingleBitApart(from, to)) continue;
      edges.push(...(corners[from]?.toArray() ?? []));
      edges.push(...(corners[to]?.toArray() ?? []));
    }
  }
  return new LineSegmentsGeometry().setPositions(edges);
}

function isSingleBitApart(left: number, right: number): boolean {
  const difference = left ^ right;
  return (difference & (difference - 1)) === 0;
}

/** Every visible mesh's edges, in the target's own local space, pushed outward by `marginM`. */
function collectOutlinePositions(
  target: THREE.Object3D,
  marginM: number,
): number[] {
  target.updateWorldMatrix(true, true);
  const toTargetLocal = new THREE.Matrix4().copy(target.matrixWorld).invert();
  const positions: number[] = [];
  appendVisibleMeshEdges(target, toTargetLocal, positions);
  expandFromCentre(positions, marginM);
  return positions;
}

function appendVisibleMeshEdges(
  node: THREE.Object3D,
  toTargetLocal: THREE.Matrix4,
  positions: number[],
): void {
  if (!node.visible) return;
  if (isMesh(node)) appendMeshEdges(node, toTargetLocal, positions);
  for (const child of node.children)
    appendVisibleMeshEdges(child, toTargetLocal, positions);
}

function appendMeshEdges(
  mesh: THREE.Mesh,
  toTargetLocal: THREE.Matrix4,
  positions: number[],
): void {
  const edges = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEGREES);
  const attribute = edges.getAttribute("position");
  const toOutlineSpace = new THREE.Matrix4()
    .copy(toTargetLocal)
    .multiply(mesh.matrixWorld);
  const vertex = new THREE.Vector3();
  for (let index = 0; index < attribute.count; index += 1) {
    vertex.fromBufferAttribute(attribute, index).applyMatrix4(toOutlineSpace);
    positions.push(vertex.x, vertex.y, vertex.z);
  }
  // Built only to be read: `EdgesGeometry` allocates its own buffers and nothing else holds them.
  edges.dispose();
}

/**
 * Scales the points about their bounding-box centre so the outline sits `marginM` outside the form on all three axes.
 * Not about the origin: a body's origin is at the floor, at the back face (§6.2), so that would move the outline off
 * the body. A degenerate axis (a panel with no thickness) is left alone rather than divided by.
 */
function expandFromCentre(positions: number[], marginM: number): void {
  if (positions.length === 0) return;
  const box = new THREE.Box3().setFromArray(positions);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3(
    axisScale(size.x, marginM),
    axisScale(size.y, marginM),
    axisScale(size.z, marginM),
  );

  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = grow(positions[index], centre.x, scale.x);
    positions[index + 1] = grow(positions[index + 1], centre.y, scale.y);
    positions[index + 2] = grow(positions[index + 2], centre.z, scale.z);
  }
}

const DEGENERATE_AXIS_M = 1e-6;

function axisScale(sizeM: number, marginM: number): number {
  if (sizeM <= DEGENERATE_AXIS_M) return 1;
  return (sizeM + 2 * marginM) / sizeM;
}

function grow(
  coordinate: number | undefined,
  centre: number,
  scale: number,
): number {
  return centre + ((coordinate ?? centre) - centre) * scale;
}
