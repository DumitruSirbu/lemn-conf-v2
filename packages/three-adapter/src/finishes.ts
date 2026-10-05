// §5.5's finish, for one body or for a whole room. Recoloured materials are cached per kit, not cloned per front: a
// per-placement finish is re-applied every time a body re-signs, and `disposeSolidBody` disposes geometries only, so a
// clone per front per step would be stranded. The free-colour half of the cache has a ceiling
// (`MAX_FREE_COLOUR_MATERIALS_PER_KIT`) because MDF's picker key space is every hex a pointer passes over; the palette
// half is a declared table and needs none.
import {
  FREE_COLOUR_PATTERN,
  MalformedColourValueError,
  MAX_PLACEMENTS,
  type Finish,
  type PaletteEntryId,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { isDeclaredFinishSurface } from "./body-finish-surfaces.js";
import {
  deriveBoundedKitMaterial,
  deriveKitMaterial,
} from "./kit-ownership.js";
import type { KitMaterials } from "./kitchen-parts.js";
import { isMesh } from "./three-guards.js";

/**
 * How one finish is drawn, from one declared hex. `color` has two readers on purpose: the colour `M.door` is repainted
 * with (flat decor) or `M.oak`'s texture is tinted by (wood), and, through `swatchOf`, the hex a surface paints its
 * swatch with: two hex codes for one decor is ADR 0028's failure. `isOak` says which material takes the colour; a wood
 * here is an approximation of the wood, not the wood itself (ADR 0071 decision 2).
 */
interface FinishDefinition {
  readonly color: string;
  readonly isOak: boolean;
}

/** A decor with no wood in it: `M.door` repainted, and the swatch is the same flat colour. */
function flatColour(color: string): FinishDefinition {
  return { color, isOak: false };
}

/** A wood: `M.oak`'s one texture, tinted. There is exactly one wood texture generator (`woodTex` in
 *  `kitchen-parts.ts`), so the five woods are one grain at five tints; a second generator would be photoreal
 *  rendering, out of scope (ADR 0071 decision 2). The tint multiplies the grain, so the 3D reads darker than the
 *  swatch, but the declared order holds: Bardolino (`#d8b483`), *Stejar* veneer (`#cba173`) and Halifax (`#b09272`) are
 *  lighter than *Nuc Warmia* (`#8a5c3b`) and the *Nuc* veneer (`#6f4630`). */
function tintedWood(color: string): FinishDefinition {
  return { color, isOak: true };
}

/**
 * Every palette entry the domain declares, drawn (ADR 0071 decisions 3 and 4). Total by annotation: a decor declared in
 * `materials.ts` and missing here is a compile failure, not a lookup that leaves the front on the kit's default white.
 * The ids are the domain's: this table says how each is drawn, never which exist. *Alb* and *Antracit* keep the hexes
 * drawn since M1.
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

/** A finish as one stable string for a scene signature; both kinds are tagged, so a decor id and a colour value cannot
 *  collide. */
export function finishSignature(finish: Finish | undefined): string {
  if (!finish) return "";
  return finish.kind === "palette-entry"
    ? `palette-entry:${finish.entryId}`
    : `free-colour:${finish.value}`;
}

/**
 * What a surface paints beside a decor's name, for callers outside the adapter that must show the same colour the
 * materials are built from (the panel's swatches). Total over every finish: only a free colour from a stored document
 * can fail to be a colour, which `finishDefinitionOf` refuses. `isWood` is published beside the hex so a swatch derives
 * its grain from the one value.
 */
export interface FinishSwatch {
  readonly color: string;
  readonly isWood: boolean;
}

export function swatchOf(finish: Finish): FinishSwatch {
  const definition = finishDefinitionOf(finish);
  return { color: definition.color, isWood: definition.isOak };
}

/** How this finish is drawn, whichever kind. A free colour (MDF's RAL pick) is its own flat colour over `M.door`, so no
 *  table can hold it and `FinishSchema`'s pattern is re-asserted here. Throws: a non-colour reaching this far bypassed
 *  the schema and the command, and `new THREE.Color` would take it as white. */
function finishDefinitionOf(finish: Finish): FinishDefinition {
  if (finish.kind === "palette-entry") return PALETTE_FINISHES[finish.entryId];
  if (!FREE_COLOUR_PATTERN.test(finish.value)) {
    throw new MalformedColourValueError(finish.value);
  }
  return flatColour(finish.value);
}

const FRONT_MESH_NAME = /door_front|drawer_front/;

/** One recoloured material per kit per finish, shared by every front wearing it and owned by the kit, so
 *  `disposeKitAndStage` frees it with the materials it was cloned from. */
const FINISH_MATERIAL_KEY_PREFIX = "finish:";

/**
 *
 * The ceiling on the free-colour half of that cache (a decor is one of eight declared ids, a free colour any of sixteen
 * million). A finish is per placement, so a supported room wears at most `MAX_PLACEMENTS` colours at once; a drag
 * across the picker pushes out intermediate colours, and a live one pushed out is rebuilt when its body next re-signs.
 *
 */
const MAX_FREE_COLOUR_MATERIALS_PER_KIT = MAX_PLACEMENTS;

/** What counts as a front, for every reader in this package: `cabinet-handle-meshes.ts` asks the same question from the
 *  other side, and a second regex is how two definitions drift apart. `door_front` is the generic front name:
 *  `base-panbank` uses it for drawer fronts too, so a body with no `drawer_front` mesh is not frontless. */
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

/** Every surface a body wears its colour on: its fronts plus any mesh its builder declared (`body-finish-surfaces.ts`).
 *  Deliberately a second function, not a widening of `collectFronts`: that answers "what is a front", which
 *  `cabinet-handle-meshes.ts` and the whole-room repaint in `kitchen-stage.tsx` depend on, while an open shelf has no
 *  front and is painted. A mesh satisfying both is collected once. */
export function collectPaintedSurfaces(root: THREE.Object3D): THREE.Mesh[] {
  const painted: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (isFrontMesh(o) || isDeclaredFinishSurface(o)) painted.push(o);
  });
  return painted;
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

/** §5.5's per-placement finish: recolours this body's own painted surfaces and nothing else's. It uses
 *  `collectPaintedSurfaces`, not `collectFronts`: an open shelf follows the kitchen's colour and has no front. */
export function applyBodyFinish(
  body: THREE.Object3D,
  M: KitMaterials,
  finish: Finish,
): void {
  applyFinish(collectPaintedSurfaces(body), M, finish);
}

/** The two halves of the cache are told apart by the kind of finish, not by key count: a decor is retained for the
 *  kit's life, a free colour only while it is recent. */
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
