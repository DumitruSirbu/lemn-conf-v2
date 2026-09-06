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
// decors would otherwise strand one clone per front per step, and `disposeSolidBody` disposes
// geometries only — a body's materials belong to its kit, never to the body.
//
// Wave 6R re-opened that hazard from the other side. A decor cache is safe because the decors are a
// declared table; MDF's colour picker is not a table, and its key space is every hex a pointer
// passes over. The free-colour half of the cache therefore has a **ceiling**
// (`MAX_FREE_COLOUR_MATERIALS_PER_KIT` below) where the palette half needs none.
import {
  FREE_COLOUR_PATTERN,
  MalformedColourValueError,
  MAX_PLACEMENTS,
  type Finish,
  type PaletteEntryId,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import {
  deriveBoundedKitMaterial,
  deriveKitMaterial,
} from "./kit-ownership.js";
import type { KitMaterials } from "./kitchen-parts.js";
import { isMesh } from "./three-guards.js";

/**
 * **How one finish is drawn, and the one hex it is drawn from.**
 *
 * `color` is a single declared value with two readers on purpose: it is the colour `M.door` is
 * repainted with for a flat decor, the tint `M.oak`'s wood texture is multiplied by for a wood, and
 * — through `swatchOf` below — the hex a surface paints its swatch with in either case. Two hex
 * codes for one decor is ADR 0028's failure in the one place a customer can see both at once.
 *
 * `isOak` says which material the colour is applied to. It carries what
 * `solidColorOf("oak")`'s refusal used to say — *a wood is a material, not a colour* — as a
 * declared fact rather than as a hole in the publication: the value below is an **approximation**
 * of a wood and not the wood itself, which is what ADR 0071 decision 2 licenses.
 */
interface FinishDefinition {
  readonly color: string;
  readonly isOak: boolean;
}

/** A decor with no wood in it: `M.door` repainted, and the swatch is the same flat colour. */
function flatColour(color: string): FinishDefinition {
  return { color, isOak: false };
}

/** A wood: `M.oak`'s one texture, tinted. **There is exactly one wood texture generator in this
 *  package** — `woodTex` (`kitchen-parts.ts`) — and this wave adds none. It is instantiated twice
 *  there, as `oakTex` and as the floor's `floorTex`; only `oakTex` becomes `M.oak`, so the **five**
 *  woods below are that one grain at five tints. A second generator would be photoreal rendering,
 *  which ADR 0071 decision 2 puts out of scope.
 *
 *  The tint **multiplies** the grain, so a wood renders darker and grainier in the 3D than its
 *  swatch reads at 34 px. The five keep their declared order under that shared map, and it is the
 *  part a customer is picking on: the three oaks lighten to darken as Bardolino (`#d8b483`), the
 *  *Stejar* veneer (`#cba173`) and Halifax (`#b09272`), and both walnuts are darker than all three —
 *  *Nuc Warmia* (`#8a5c3b`), then the *Nuc* veneer (`#6f4630`). */
function tintedWood(color: string): FinishDefinition {
  return { color, isOak: true };
}

/**
 * **Every palette entry the domain declares, drawn.** ADR 0071 decision 4's six PAL decors and
 * decision 3's two veneer woods.
 *
 * **Total by annotation, and that is the point.** `Record<PaletteEntryId, …>` makes a decor
 * declared in `materials.ts` and missing here a **compile failure**, rather than a lookup that
 * misses and leaves the front in the kit's own default white — which is M4's *Finisaj* defect
 * (`docs/STATUS.md`) one layer down. The ids are the domain's, not a second list beside them: this
 * table says how each is drawn and never which exist.
 *
 * *Alb* and *Antracit* keep the exact hexes this file has drawn since M1, so the two decors that
 * wave 6P's migration maps the shipped `white` and `graphite` onto are the same colours they were.
 */
const PALETTE_FINISHES: Readonly<Record<PaletteEntryId, FinishDefinition>> = {
  "pal.alb": flatColour("#eceeeb"),
  "pal.stejar-bardolino": tintedWood("#d8b483"),
  "pal.stejar-halifax": tintedWood("#b09272"),
  "pal.antracit": flatColour("#2b2d30"),
  "pal.gri-havanna": flatColour("#9a938a"),
  "pal.nuc-warmia": tintedWood("#8a5c3b"),
  "veneer.stejar": tintedWood("#cba173"),
  "veneer.nuc": tintedWood("#6f4630"),
};

/** A finish as one stable string, for a scene signature that has to notice a change without
 *  understanding it. Both kinds are tagged, so a decor id and a colour value can never collide. */
export function finishSignature(finish: Finish | undefined): string {
  if (!finish) return "";
  return finish.kind === "palette-entry"
    ? `palette-entry:${finish.entryId}`
    : `free-colour:${finish.value}`;
}

/**
 * **What a surface paints beside a decor's name**, for callers outside the adapter that must show
 * the same colour the materials are built from — the panel's swatches above all.
 *
 * **Total over every finish**, where `FINISH_COLORS` was a map with a hole in it and
 * `solidColorOf("oak")` threw for the one entry that had no hex to publish. That refusal has not
 * been deleted; the publication changed shape so that it has nothing left to refuse — every
 * declared entry now states a colour, and the only value that can still fail to be one is a free
 * colour arriving from a stored document, which is what `finishDefinitionOf` refuses below.
 *
 * `isWood` is published beside the hex rather than a second hex: a swatch that wants to look like
 * timber derives its grain from this one value and does not author a second.
 */
export interface FinishSwatch {
  readonly color: string;
  readonly isWood: boolean;
}

export function swatchOf(finish: Finish): FinishSwatch {
  const definition = finishDefinitionOf(finish);
  return { color: definition.color, isWood: definition.isOak };
}

/** **How this finish is drawn, whichever kind it is.** A palette entry reads the declared table; a
 *  free colour — MDF's RAL pick — is its own flat colour over `M.door`, which is why no table can
 *  hold it and why `FinishSchema`'s pattern is re-asserted here rather than trusted.
 *
 *  Throws rather than painting something: a value that is not a colour reaching this far has
 *  bypassed both the schema and the command, and `new THREE.Color` would have taken it as white. */
function finishDefinitionOf(finish: Finish): FinishDefinition {
  if (finish.kind === "palette-entry") return PALETTE_FINISHES[finish.entryId];
  if (!FREE_COLOUR_PATTERN.test(finish.value)) {
    throw new MalformedColourValueError(finish.value);
  }
  return flatColour(finish.value);
}

const FRONT_MESH_NAME = /door_front|drawer_front/;

/** One recoloured material per kit per finish, shared by every front wearing that finish exactly
 *  as `kit.M`'s own materials are shared — and owned by the kit, so `disposeKitAndStage` frees it
 *  with the materials it was cloned from. */
const FINISH_MATERIAL_KEY_PREFIX = "finish:";

/**
 * **The ceiling on the free-colour half of that cache**, which the palette half does not need: a
 * decor is one of eight declared ids, and a free colour is any of sixteen million.
 *
 * Derived rather than picked. A finish is a **per-placement** choice, so the most distinct colours
 * a supported room can wear at one time is one per placement, and `MAX_PLACEMENTS` is the domain's
 * own count of those (168 today, against 26 in the shipped seeded kitchen). A memo of that size
 * therefore has room for every colour a room is actually wearing; what a drag across the picker
 * pushes out of it are the intermediate colours the pointer passed through, and a live colour that
 * is pushed out is rebuilt the next time its body re-signs.
 */
const MAX_FREE_COLOUR_MATERIALS_PER_KIT = MAX_PLACEMENTS;

/** **What counts as a front**, for every reader in this package. `cabinet-handle-meshes.ts` asks the same
 *  question from the other side — a handle is the cabinet's when the group it hangs from holds one
 *  of these — and asking it of a second regex is how two definitions of a front drift apart.
 *
 *  Note `door_front` is the generic front name in this kit: `base-panbank` uses it for drawer fronts
 *  too, so a body with no `drawer_front` mesh is not thereby frontless. */
export function isFrontMesh(node: THREE.Object3D): node is THREE.Mesh {
  return isMesh(node) && FRONT_MESH_NAME.test(node.name);
}

export function collectFronts(root: THREE.Object3D): THREE.Mesh[] {
  const fronts: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (isFrontMesh(o)) fronts.push(o);
  });
  return fronts;
}

export function applyFinish(
  fronts: readonly THREE.Mesh[],
  M: KitMaterials,
  finish: Finish,
): void {
  const material = finishMaterial(M, finish);
  for (const front of fronts) {
    front.material = material;
  }
}

/** §5.5's per-placement finish: recolours this body's own fronts and nothing else's. */
export function applyBodyFinish(
  body: THREE.Object3D,
  M: KitMaterials,
  finish: Finish,
): void {
  applyFinish(collectFronts(body), M, finish);
}

/** The two halves of the cache, told apart by the kind of finish and never by how many keys have
 *  arrived: a decor is retained for the kit's life, a free colour only while it is recent. */
function finishMaterial(M: KitMaterials, finish: Finish): THREE.Material {
  const key = FINISH_MATERIAL_KEY_PREFIX + finishSignature(finish);
  const build = () => buildFinishMaterial(M, finish);

  if (finish.kind === "palette-entry") return deriveKitMaterial(M, key, build);
  return deriveBoundedKitMaterial(
    M,
    { key, capacity: MAX_FREE_COLOUR_MATERIALS_PER_KIT },
    build,
  );
}

function buildFinishMaterial(M: KitMaterials, finish: Finish): THREE.Material {
  const definition = finishDefinitionOf(finish);
  const material = (definition.isOak ? M.oak : M.door).clone();
  material.color = new THREE.Color(definition.color);
  return material;
}
