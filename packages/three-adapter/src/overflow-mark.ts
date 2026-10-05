// ADR 0065 decision 1's mark: a body whose run reaches past the end of its wall stays where the customer put it and is
// shown red as unbuildable (the warning sentence is the web app's). A surface wash, not a second outline: a body can be
// selected and overflowing, and two outlines would coincide in an ambiguous colour, whereas a wash tints faces and
// `selection-outline.ts` traces edges, so both read at once. It is an object, never a material mutation: bodies share
// `KitMaterials` instances, so tinting one body's material would tint every body drawn with it.
import * as THREE from "three";

import { transformRelativeTo } from "./relative-transform.js";
import { isMesh, toMaterials } from "./three-guards.js";
import { NOOP_RAYCAST } from "./void-mesh.js";
import { inheritWallTag } from "./wall-tag.js";

/**
 * The mark's own colour, deliberately not `SELECTION_HIGHLIGHT_COLOR` (`0xff2d2d`): a deep alarm red 90 units away in
 * RGB, outside the 60-unit ball `editor-rail.desktop.e2e.spec.ts` counts selection pixels in, so a mark is never
 * counted as a highlight nor the reverse. Drawn untone-mapped like the outline's colour, so what is declared is what
 * lands on screen.
 */
export const OVERFLOW_MARK_COLOR = 0xb3001b;

/** Enough to read as a warning across a whole cabinet, little enough that its doors, drawers and handles stay visible:
 *  the customer must recognise which cabinet to narrow or remove. */
export const OVERFLOW_MARK_OPACITY = 0.32;

/** Pushes the wash just proud of the faces so it does not z-fight the 1.6 mm chamfer. Smaller than
 *  `selection-outline.ts`'s 3 mm so a selected, marked body wears its outline outside the wash. */
const OVERFLOW_MARK_MARGIN_M = 0.002;

/** Drawn after the room and before both selection-outline passes (999 / 1000), so a selected marked body shows its
 *  outline over its wash. */
const OVERFLOW_MARK_RENDER_ORDER = 998;

export interface OverflowMarkInput {
  /** The mounted body the mark covers. */
  readonly target: THREE.Object3D;
  /** The object the mark is added to; its transform is relative to it, as a selection outline's is. */
  readonly parent: THREE.Object3D;
}

export interface OverflowMark {
  readonly group: THREE.Group;
  /** The tinted hull itself, exposed so a test can read the colour and opacity actually used. */
  readonly wash: THREE.Mesh;
}

/**
 *
 * Builds the mark for one body that reaches past the end of its wall: a translucent hull over the body's visible
 * extent, in `OVERFLOW_MARK_COLOR`. Depth-tested on purpose: a wash drawn through geometry would tint whatever stands
 * in front (the worktop, a neighbouring column) and mark a cabinet that fits, and marking the wrong body is worse than
 * not marking a hidden one. Nothing here is a raycast target (`NOOP_RAYCAST`): ADR 0065 requires a marked body to stay
 * selectable and editable.
 *
 */
export function buildOverflowMark(input: OverflowMarkInput): OverflowMark {
  const bounds = visibleBoundsInTargetSpace(input.target);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const margin = 2 * OVERFLOW_MARK_MARGIN_M;

  const geometry = new THREE.BoxGeometry(
    size.x + margin,
    size.y + margin,
    size.z + margin,
  );
  geometry.translate(centre.x, centre.y, centre.z);

  const wash = new THREE.Mesh(geometry, buildWashMaterial());
  wash.name = "overflow_mark_wash";
  wash.renderOrder = OVERFLOW_MARK_RENDER_ORDER;
  wash.raycast = NOOP_RAYCAST;

  const group = new THREE.Group();
  group.name = "overflow_mark";
  inheritWallTag(group, input.target);
  group.add(wash);
  group.matrixAutoUpdate = false;
  group.matrix.copy(transformRelativeTo(input.parent, input.target));

  return { group, wash };
}

/** Geometries and materials: a mark owns everything inside it, as `disposeSelectionOutline` does. */
export function disposeOverflowMark(mark: THREE.Object3D): void {
  mark.traverse((node) => {
    if (!isMesh(node)) return;
    node.geometry.dispose();
    for (const material of toMaterials(node.material)) material.dispose();
  });
}

function buildWashMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: OVERFLOW_MARK_COLOR,
    transparent: true,
    opacity: OVERFLOW_MARK_OPACITY,
    // Front faces only: a double-sided hull draws its far side where the body is thinner than its bounding box, so
    // those pixels take the wash twice.
    side: THREE.FrontSide,
    depthWrite: false,
    // An interface colour is not part of the tone-mapped photograph (`stage.ts`, ACES filmic); mapping it would shift
    // the chosen contrast.
    toneMapped: false,
  });
}

/**
 * The box every visible mesh of the target occupies, in the target's own local space. Visible only, as in
 * `selection-outline.ts`: §6.5 hides push-to-open handles, and a hull reaching one would stand proud of the body. Local
 * space, so the group's matrix carries the seating transform and the two cannot drift when the room is re-seated.
 */
function visibleBoundsInTargetSpace(target: THREE.Object3D): THREE.Box3 {
  target.updateWorldMatrix(true, true);
  const toTargetLocal = new THREE.Matrix4().copy(target.matrixWorld).invert();
  const bounds = new THREE.Box3();
  expandByVisibleMeshes(target, toTargetLocal, bounds);
  if (bounds.isEmpty()) bounds.setFromCenterAndSize(ZERO, ZERO);
  return bounds;
}

const ZERO = new THREE.Vector3();

function expandByVisibleMeshes(
  node: THREE.Object3D,
  toTargetLocal: THREE.Matrix4,
  bounds: THREE.Box3,
): void {
  if (!node.visible) return;
  if (isMesh(node)) expandByMesh(node, toTargetLocal, bounds);
  for (const child of node.children)
    expandByVisibleMeshes(child, toTargetLocal, bounds);
}

function expandByMesh(
  mesh: THREE.Mesh,
  toTargetLocal: THREE.Matrix4,
  bounds: THREE.Box3,
): void {
  mesh.geometry.computeBoundingBox();
  const meshBounds = mesh.geometry.boundingBox;
  if (!meshBounds) return;
  const toMarkSpace = new THREE.Matrix4()
    .copy(toTargetLocal)
    .multiply(mesh.matrixWorld);
  bounds.union(meshBounds.clone().applyMatrix4(toMarkSpace));
}
