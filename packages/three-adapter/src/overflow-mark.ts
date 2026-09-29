// ADR 0065 decision 1's mark: the body whose run reaches past the end of its own wall is left
// exactly where the customer put it and is *shown* to be unbuildable. The owner asked for it in
// red — "if the last cabinets go off the wall to highlight it with red and show a warning" — and
// this is the red half; the sentence is the web application's.
//
// **Why a surface wash and not a second outline.** The mark has to compose with the selection
// highlight: a body can be selected *and* overflowing, and neither may be read as the other
// (M6 wave 6M). Two outlines on one body coincide pixel for pixel and the composite is simply an
// outline in an ambiguous colour. A wash and a line occupy different channels — the wash tints the
// body's faces, `selection-outline.ts` traces its edges — so the composite says both things at once
// and each is still legible on its own. It is also the only form that reads at a glance without
// hunting for an edge, which is what a *warning* has to do.
//
// **It is an object, never a material mutation**, for the reason `kitchen-stage.tsx` records at its
// outline effect: bodies in this kit share `KitMaterials` instances, so tinting a marked body's
// material would tint every body drawn with that material.
import * as THREE from "three";

import { transformRelativeTo } from "./relative-transform.js";
import { isMesh, toMaterials } from "./three-guards.js";
import { NOOP_RAYCAST } from "./void-mesh.js";
import { inheritWallTag } from "./wall-tag.js";

/**
 * The mark's own colour, and it is deliberately **not** `SELECTION_HIGHLIGHT_COLOR`.
 *
 * A deep alarm red rather than that constant's `0xff2d2d` signal red: still the red the owner asked
 * for, and 90 units away from the selection's colour in RGB — comfortably outside the 60-unit
 * Euclidean ball `editor-rail.desktop.e2e.spec.ts` counts selection pixels in, so a mark can never
 * be counted as a highlight nor a highlight as a mark. `overflow-mark.test.ts` pins that distance
 * rather than leaving it to be re-derived by eye.
 *
 * Like the outline's colour it is drawn untone-mapped (`stage.ts` tone-maps the photograph; an
 * interface colour is not part of it), so what is declared here is what lands on screen.
 */
export const OVERFLOW_MARK_COLOR = 0xb3001b;

/** Enough to read as a warning across a whole cabinet, little enough that the doors, drawer lines
 *  and handles underneath stay visible — the customer has to recognise *which* cabinet to narrow or
 *  remove, so a wash that hides the body it marks defeats its own purpose. */
export const OVERFLOW_MARK_OPACITY = 0.32;

/** Pushes the wash just proud of the faces it covers so it does not z-fight with the 1.6 mm chamfer
 *  it sits on. Smaller than `selection-outline.ts`'s 3 mm on purpose: a selected, marked body then
 *  wears the outline *outside* the wash rather than buried in it. */
const OVERFLOW_MARK_MARGIN_M = 0.002;

/** Drawn after the room and **before** both selection-outline passes (999 / 1000), so a selected
 *  marked body shows its outline over its wash rather than under it. */
const OVERFLOW_MARK_RENDER_ORDER = 998;

export interface OverflowMarkInput {
  /** The mounted body the mark covers. */
  readonly target: THREE.Object3D;
  /** The object the mark is added to. The mark's transform is expressed relative to it, exactly as
   *  a selection outline's is, so the caller may mount it on any ancestor of the target. */
  readonly parent: THREE.Object3D;
}

export interface OverflowMark {
  readonly group: THREE.Group;
  /** The tinted hull itself, exposed so a test can read the colour and opacity actually used. */
  readonly wash: THREE.Mesh;
}

/**
 * Builds the mark for one body that reaches past the end of its wall: a translucent hull over the
 * body's own visible extent, in `OVERFLOW_MARK_COLOR`.
 *
 * **Depth-tested, and that is the decision in this function.** `selection-outline.ts` carries a
 * second pass that ignores depth, because a selection the customer cannot find is a selection that
 * failed. A *wash* drawn through the geometry in front of it would tint whatever stands between the
 * camera and the marked body — the worktop, a neighbouring column — and so would appear to mark a
 * cabinet that fits perfectly well. Marking the wrong body is worse than not marking a hidden one,
 * and the warning sentence beside the scene is what covers the hidden case.
 *
 * Nothing here is a raycast target (`NOOP_RAYCAST`): the mark sits in front of the body's fronts,
 * and ADR 0065 requires a marked body to stay selectable and editable.
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

/** Geometries **and** materials: a mark owns everything inside it and shares nothing, the same rule
 *  and the same reason as `disposeSelectionOutline`. */
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
    // Front faces only. A double-sided hull draws its far side wherever the body inside is thinner
    // than its own bounding box — between shelves, around a handle — and those pixels take the wash
    // twice, so one cabinet reads as two different warnings.
    side: THREE.FrontSide,
    depthWrite: false,
    // The renderer tone-maps the whole scene (`stage.ts`, ACES filmic). An interface colour is not
    // part of the photograph, and a warning that arrives on screen several shades off is a warning
    // whose contrast was never the one that was chosen.
    toneMapped: false,
  });
}

/**
 * The box every **visible** mesh of the target occupies, in the target's own local space.
 *
 * Visible only, for the reason `selection-outline.ts` gives: §6.5 builds the push-to-open handles
 * and hides them, and a hull grown to reach a handle nobody can see would stand proud of the body
 * it marks. Local space, so the group's own matrix carries the seating transform and the two cannot
 * drift apart when the room is re-seated.
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
