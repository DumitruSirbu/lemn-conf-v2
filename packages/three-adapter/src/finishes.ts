// Port of the finish switch in `design-source/Modern Kitchen Cabinets 3D (3)/preset-shots.html`.
//
// This exists so the M1 fidelity capture can reproduce the reference's four preset renders under
// their own conditions. The product-facing finish operation (`setFinish`) is a later milestone's
// work; do not build the editor's finish section on top of this module without revisiting it.
import * as THREE from "three";

import type { KitMaterials } from "./kitchen-parts.js";
import { isMesh } from "./three-guards.js";

export type FinishKey = "white" | "clay" | "sage" | "graphite" | "oak";

interface FinishDefinition {
  readonly color: string | null;
  readonly isOak: boolean;
}

const FINISHES: Readonly<Record<FinishKey, FinishDefinition>> = {
  white: { color: "#eceeeb", isOak: false },
  clay: { color: "#cbc3b8", isOak: false },
  sage: { color: "#8d9a84", isOak: false },
  graphite: { color: "#2b2d30", isOak: false },
  oak: { color: null, isOak: true },
};

const FRONT_MESH_NAME = /door_front|drawer_front/;

export function collectFronts(root: THREE.Object3D): THREE.Mesh[] {
  const fronts: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (isMesh(o) && FRONT_MESH_NAME.test(o.name)) fronts.push(o);
  });
  return fronts;
}

export function applyFinish(
  fronts: readonly THREE.Mesh[],
  M: KitMaterials,
  key: FinishKey,
): void {
  const definition = FINISHES[key];
  for (const front of fronts) {
    const material = (definition.isOak ? M.oak : M.door).clone();
    if (definition.color) material.color = new THREE.Color(definition.color);
    front.material = material;
  }
}
