// The selection highlight: "the customer can see, without reading anything, which cabinet is
// being edited" (`DEVELOPMENT-SPEC.md` §6.1's picking result made visible, and the M2 mobile gate
// "a selected body and a selected slot are visually distinguishable without opening any panel").
//
// It replaces a `THREE.BoxHelper`. The helper failed the gate three ways at once, and each of the
// three is a decision recorded below: it drew the *bounding box* rather than the body, so its rear
// edges cut through the room and read as noise; it drew one-pixel lines, because WebGL ignores
// `LineBasicMaterial.linewidth` on every desktop platform; and it was depth-tested only, so the
// part of a selected body standing behind the worktop or a neighbour simply had no highlight.
//
// A box does survive here, in one place and one only: the faint pass that ignores depth. That is
// not the helper reinstated — it is a locator for a hidden selection, at a fifth of the opacity
// and half the width of the outline that identifies the body, and it is a box precisely *because*
// it is drawn through the geometry in front of it, where anything richer becomes the noise the
// helper was rejected for.
//
// **Three passes since wave 6V**, and the middle one is the product half of ADR 0091: a near-black
// casing between the ghost and the red core, so the highlight is a *pair* of colours rather than
// one. A flat front is one colour and can equal either constant; it cannot equal both.
// `SELECTION_OUTLINE_CASING_COLOR` carries the argument and the measured bound.
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type { SelectionKind } from "./picking.js";
import { transformRelativeTo } from "./relative-transform.js";
import { isMesh, toMaterials } from "./three-guards.js";
import { NOOP_RAYCAST } from "./void-mesh.js";

/**
 * Signal red, chosen for contrast against the **declared** palette: the warm paper/stage background
 * (`globals.css` `--paper #faf8f4`, `--stage #f2f0ea`), ADR 0071's six PAL decors and two veneer
 * woods, and the room's own white walls and worktop. Against those it still reads — none of them is
 * saturated in the red channel alone, and the warmest wood keeps a green channel well clear of this
 * one's.
 *
 * **It is not a hue the kitchen cannot contain, and it is no longer countable** (ADR 0091, wave 6R).
 * ADR 0071 decision 3 gives MDF a RAL picker and ADR 0078 decision 1 rules its offer to be every
 * free colour `FinishSchema` admits, so a customer can paint a front `0xff2d2d` exactly; wave 6R's
 * free-colour arm then puts that colour in the framebuffer, where the outline tracing it is at
 * distance 0 from the surface it is supposed to distinguish. `editor-rail.desktop.e2e.spec.ts`
 * counts selection pixels by nearness to this constant, and that measurement is valid only because
 * the seeded fixture wears no finish —
 * `packages/three-adapter/tests/qa-6m-mark-composite.adversarial.test.ts` asserts that premise and
 * the breach beside it.
 *
 * **Wave 6V closes the product half, and it does it beside this constant rather than by moving it**
 * — the picker admits every hex, so repainting would relocate the hole, not close it. What the
 * outline now distinguishes itself by is `SELECTION_OUTLINE_CASING_COLOR`: a *pair* of colours, and
 * a flat front is one colour, so no front can equal both. See that constant for the bound.
 */
export const SELECTION_HIGHLIGHT_COLOR = 0xff2d2d;

/**
 * **The second, contrasting pass — the half a front cannot equal.**
 *
 * ADR 0091's wave 6V, work item 1. A customer can paint a front `#ff2d2d` through MDF's RAL picker
 * (ADR 0078 decision 1), and a red line traced onto that front is at distance 0 from it: the
 * highlight disappears into the surface it is supposed to identify. The remedy is explicitly *not*
 * a different red — every hex is reachable, so a new constant only relocates the collision.
 *
 * Instead the outline is drawn twice, in two colours far apart: this near-black casing at
 * `SELECTION_OUTLINE_CASING_WIDTH_PX`, and the signal red on top of it at
 * `SELECTION_OUTLINE_WIDTH_PX`, leaving the casing showing as a rim on either side. **A flat front
 * is a single colour and the two constants are 247.4 apart, so a colour within the counting ball of
 * one is more than 120 units from the other** — asserted over the whole 24-bit cube in
 * `selection-outline.test.ts` rather than argued here. Paint the front red and the black rim reads;
 * paint it black and the red core reads.
 *
 * **Near-black rather than white**, measured on the real render at 1440 x 900: this kitchen is a
 * bright one — paper `#faf8f4`, stage `#f2f0ea`, white walls, an `#eceeeb` unfinished front — so a
 * white casing is invisible over most of the scene, which is the same defect one shade over. Dark
 * reads against the kitchen *and* against a saturated front, and against `pal.antracit` the red
 * core is what reads.
 *
 * Not `0x000000`: the casing is an interface colour drawn over a tone-mapped photograph, and pure
 * black on a lit edge reads as a shadow the renderer put there rather than as a line the app drew.
 */
export const SELECTION_OUTLINE_CASING_COLOR = 0x101010;

/** Screen-space pixels, and honestly so: `LineSegments2` draws each segment as camera-facing
 *  quads, which is why this number has an effect at all. Setting `linewidth` on an ordinary
 *  `LineBasicMaterial` — what the `BoxHelper` used — is silently ignored by ANGLE and by every
 *  desktop OpenGL driver, so the old highlight was always exactly one pixel wide. */
export const SELECTION_OUTLINE_WIDTH_PX = 4;

/** The casing's width, and the reason it is `SELECTION_OUTLINE_WIDTH_PX + 4` rather than a ratio:
 *  what has to survive is the **rim**, and a rim is a difference of widths in screen pixels. At 8
 *  against 4 the casing shows 2 px on each side of the core at every camera distance, because
 *  `LineSegments2` sizes its quads in screen space. A ratio would make the rim vanish as the line
 *  narrows, which is exactly the case — a body far from the camera — where it is needed most. */
export const SELECTION_OUTLINE_CASING_WIDTH_PX = SELECTION_OUTLINE_WIDTH_PX + 4;

/** The occluded half of the outline: drawn without depth testing so a selected body standing
 *  behind the worktop, the hood or a neighbouring column still shows which body it is. Thinner and
 *  far fainter than the solid pass, for two reasons measured on the real render: at anything near
 *  full opacity it cannot be told from the near line, so the highlight reads as floating in front
 *  of whatever covers it; and because it ignores depth it draws *every* interior edge of the body
 *  — shelves, carcass panels, the sink bowl — over the fronts, which at 0.4 turned an outlined
 *  cabinet into a red cage. At this weight it locates a hidden selection without competing with
 *  the outline that matters. */
export const OCCLUDED_OUTLINE_OPACITY = 0.18;
export const OCCLUDED_OUTLINE_WIDTH_PX = 2;

/** Pushes the traced edges just proud of the surfaces they trace, so the depth-tested half is not
 *  buried inside its own 1.6 mm chamfer and z-fighting with it. */
const BODY_OUTLINE_MARGIN_M = 0.003;

/** A void is already drawn as a translucent blue box with dashed blue edges 14 mm inside its frame
 *  (`void-mesh.ts`). Expanding its selection outline by exactly that inset lands the red on the
 *  void's own frame instead of on top of the blue dashes, so the two never coincide. */
const VOID_OUTLINE_MARGIN_M = 0.014;

/** Matches `void-mesh.ts`'s dash rhythm: a selected void keeps the dashed language it already
 *  speaks, so red-solid reads as "this cabinet" and red-dashed as "this empty slot". */
const DASH_SIZE_M = 0.02;
const GAP_SIZE_M = 0.012;

/** Degrees. Below 45° because a chamfered box has no 90° edges to find — `chamferBox` bevels every
 *  one of them by 1.6 mm, so the sharpest crease in this kitchen is the 45° chamfer face itself,
 *  and a threshold above it would return an empty outline. */
const EDGE_THRESHOLD_DEGREES = 20;

/** Drawn after the room, ghost first, then the casing, then the core: each pass must win over the
 *  one before it wherever both land on a pixel. Every pass writes no depth, so the order here is
 *  the only thing deciding which colour a shared pixel ends up. */
const OCCLUDED_RENDER_ORDER = 999;
const CASING_RENDER_ORDER = 1000;
const VISIBLE_RENDER_ORDER = 1001;

export interface SelectionOutlineInput {
  /** The mounted body or void group the outline traces. */
  readonly target: THREE.Object3D;
  /** The object the outline will be added to. The outline's transform is expressed relative to it,
   *  so the caller may add it to any ancestor of the target without the two drifting apart. */
  readonly parent: THREE.Object3D;
  readonly kind: SelectionKind;
}

export interface SelectionOutline {
  readonly group: THREE.Group;
  /** The depth-tested pass — the outline where the body is actually visible. */
  readonly visibleLine: LineSegments2;
  /** The wider near-black pass drawn directly beneath `visibleLine`, on the same edges, so the
   *  highlight shows a rim in a colour the front it traces cannot also be wearing. */
  readonly casingLine: LineSegments2;
  /** The pass that ignores depth, so occluded parts of the selection still read. */
  readonly occludedLine: LineSegments2;
}

/**
 * Builds the highlight for one selected body or void: a thick red outline of the target's **own
 * edges**, depth-tested and solid, over a near-black casing of the same edges two pixels wider on
 * each side, over a faint twelve-edge box that ignores depth and says only where the selection is
 * when something covers it (`boxGeometryAround`).
 *
 * The edges come from `EdgesGeometry` over every *visible* mesh in the target, which is what makes
 * this the body's form rather than a box around it: the carcass, the door and drawer divisions and
 * the visible handles are all in it, and the hidden push-to-open handles (§6.5 builds and hides
 * them) are not. Nothing here is a raycast target — `NOOP_RAYCAST`, the same rule §6.1 states for
 * void outlines, applied for the same reason.
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
  // One geometry for both depth-tested passes, because they trace exactly the same edges and it is
  // the largest buffer the outline owns. `disposeSelectionOutline` deduplicates by identity, which
  // is the rule that makes sharing safe here.
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
  group.add(occludedLine, casingLine, visibleLine);
  group.matrixAutoUpdate = false;
  group.matrix.copy(transformRelativeTo(input.parent, input.target));

  return { group, visibleLine, casingLine, occludedLine };
}

/** Geometries **and** materials: unlike a body, a selection outline owns everything inside it —
 *  the same rule, and the same reason, as `disposeVoidMesh`. */
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
    // The renderer tone-maps the whole scene (`stage.ts`, ACES filmic). An interface colour is not
    // part of the photograph: without this the chosen colour would land on screen desaturated and
    // several shades off, which is how a "contrasting" highlight ends up not contrasting — and it
    // is what keeps the two passes exactly as far apart on screen as they are declared to be.
    toneMapped: false,
  });

  const line = new LineSegments2(geometry, material);
  line.name = options.name;
  line.renderOrder = options.renderOrder;
  line.computeLineDistances();
  line.raycast = NOOP_RAYCAST;
  return line;
}

/**
 * The twelve edges of the box the outline occupies.
 *
 * This is what the depth-ignoring pass draws, and it is deliberately the crudest shape there is:
 * a pass that ignores depth draws *through* the body it traces, so handing it the full form —
 * every shelf, carcass panel and sink bowl edge — turned an outlined cabinet into a red cage over
 * its own doors. Measured on the real render at 1440 x 900, not reasoned about. Twelve faint lines
 * say "the selection is over here, behind this" and nothing more; the outline that identifies the
 * body is the solid, form-following one drawn on top of it.
 */
function boxGeometryAround(positions: readonly number[]): LineSegmentsGeometry {
  const box = new THREE.Box3().setFromArray(positions);
  const corners = [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) =>
      [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z)),
    ),
  );
  // Corner index bits: 4 = max x, 2 = max y, 1 = max z. A pair differing in exactly one bit is an
  // edge of the box; every other pair is a face or body diagonal.
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
 * Scales the collected points about their own bounding-box centre so the outline sits `marginM`
 * outside the form it traces, on all three axes.
 *
 * A uniform scale would not do: these bodies are not centred on their own origin (the origin is at
 * the floor, at the back face — §6.2), so scaling about it would *move* the outline off the body
 * rather than grow it around it. A degenerate axis — a panel with no thickness — is left alone
 * rather than divided by.
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
