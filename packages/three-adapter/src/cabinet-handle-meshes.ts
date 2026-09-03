// **How a cabinet's handle is told from an appliance's** — one rule, and the only place it is
// written (ADR 0061 decision 1).
//
// `barHandle` returns a group named `handle`, and every caller adds it to the thing it belongs to.
// `doorSlab` adds it beside the `door_front` slab it opens; the oven, the microwave, the dishwasher
// and the freestanding fridge add it to the appliance's own group, which holds no front at all. So a
// handle is a **cabinet's** handle exactly when the group it hangs from also holds a front — the
// front it opens.
//
// A bare `handle_bar` count cannot do it: `base-hob-oven` has one and none of it is the cabinet's,
// while `tall-oven-tower` has four of which exactly two are. Until wave 6L the rule existed only in
// the capability gate that decides whether a body *has* a handle choice, and the path that *applies*
// one reached every bar in the group — so `handle: "push"` hid the oven's and the microwave's bars
// with the cabinet's, and `handle: "black"` repainted appliance hardware in cabinet hardware
// (`docs/BACKLOG.md` entry 18). It lives here now, with the apply path and the gate as its two
// callers.
import * as THREE from "three";

import { isFrontMesh } from "./finishes.js";
import { isMesh } from "./three-guards.js";

/** The group `barHandle` builds. Both a cabinet's handle and an appliance's are one of these. */
export const HANDLE_GROUP_NAME = "handle";

/** The rule itself: this node is a handle group, and the group it hangs from also holds a front. */
export function isCabinetHandleGroup(node: THREE.Object3D): boolean {
  if (isMesh(node) || node.name !== HANDLE_GROUP_NAME) return false;
  const owner = node.parent;
  if (!owner) return false;
  return owner.children.some((sibling) => isFrontMesh(sibling));
}

/** Every mesh a handle choice may touch on this body — the bar and its stems, for each of the
 *  body's **own** handles. An appliance's bar is not among them and keeps the material and the
 *  visibility its builder gave it, at every setting of §5.5's `handle`. */
export function forEachCabinetHandleMesh(
  root: THREE.Object3D,
  visit: (part: THREE.Mesh) => void,
): void {
  root.traverse((node) => {
    if (!isCabinetHandleGroup(node)) return;
    node.traverse((part) => {
      if (isMesh(part)) visit(part);
    });
  });
}

/** How many handles on this built body are the cabinet's — the number the parity gate holds each
 *  catalogue entry's declaration to (ADR 0061 decision 3). Groups, not meshes: one handle is a bar
 *  and two stems.
 *
 *  Named for the **built** side on purpose: the declared side is the domain's `cabinetHandleCount`,
 *  and "declared versus built" is the whole content of the gate that compares them. */
export function countBuiltCabinetHandles(root: THREE.Object3D): number {
  let cabinetHandles = 0;
  root.traverse((node) => {
    if (isCabinetHandleGroup(node)) cabinetHandles += 1;
  });
  return cabinetHandles;
}
