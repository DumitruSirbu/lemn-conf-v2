// §5.5's finish, for one body or for a whole room.
//
// It began as a port of the finish switch in
// `design-source/Modern Kitchen Cabinets 3D (3)/preset-shots.html`, so that the M1 fidelity
// capture could reproduce the reference's four preset renders under their own conditions. M4's
// editor panel made finish a *per-placement* choice (`PlacementRecord.finishKey`), and
// `scene-sync.ts` now applies it to a single mounted body at mount time; the whole-room call the
// capture route makes is unchanged and still recolours every front it is handed.
//
// Because a per-placement finish is re-applied every time a body re-signs, the recoloured
// materials are **cached per kit** rather than cloned per front: a customer stepping through the
// five chips would otherwise strand one clone per front per step, and `disposeSolidBody` disposes
// geometries only — a body's materials belong to its kit, never to the body.
import * as THREE from "three";

import { deriveKitMaterial } from "./kit-ownership.js";
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

/** Every finish that is a colour rather than a material. `oak` is deliberately absent: `FINISHES`
 *  records it as `{ color: null, isOak: true }`, so it has no hex to publish. */
export type SolidFinishKey = Exclude<FinishKey, "oak">;

/** The solid finish colours, for callers outside the adapter that must show the same colour the
 *  materials are built from — the panel's swatches above all. Derived from `FINISHES` rather than
 *  written out again, so the table the materials read stays the only place a colour is recorded. */
export const FINISH_COLORS = {
  white: solidColorOf("white"),
  clay: solidColorOf("clay"),
  sage: solidColorOf("sage"),
  graphite: solidColorOf("graphite"),
} satisfies Readonly<Record<SolidFinishKey, string>>;

function solidColorOf(key: SolidFinishKey): string {
  const { color } = FINISHES[key];
  if (!color) {
    throw new Error(
      `Finish "${key}" is a material, not a colour, and has no hex to publish`,
    );
  }
  return color;
}

const FRONT_MESH_NAME = /door_front|drawer_front/;

/** One recoloured material per kit per finish, shared by every front wearing that finish exactly
 *  as `kit.M`'s own materials are shared — and owned by the kit, so `disposeKitAndStage` frees it
 *  with the materials it was cloned from. */
const FINISH_MATERIAL_KEY_PREFIX = "finish:";

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
  const material = finishMaterial(M, key);
  for (const front of fronts) {
    front.material = material;
  }
}

/** §5.5's per-placement finish: recolours this body's own fronts and nothing else's. */
export function applyBodyFinish(
  body: THREE.Object3D,
  M: KitMaterials,
  key: FinishKey,
): void {
  applyFinish(collectFronts(body), M, key);
}

function finishMaterial(M: KitMaterials, key: FinishKey): THREE.Material {
  return deriveKitMaterial(M, FINISH_MATERIAL_KEY_PREFIX + key, () =>
    buildFinishMaterial(M, key),
  );
}

function buildFinishMaterial(M: KitMaterials, key: FinishKey): THREE.Material {
  const definition = FINISHES[key];
  const material = (definition.isOak ? M.oak : M.door).clone();
  if (definition.color) material.color = new THREE.Color(definition.color);
  return material;
}
