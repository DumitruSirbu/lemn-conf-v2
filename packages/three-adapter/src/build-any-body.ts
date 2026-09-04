// **Which builder builds a given `buildId`, decided in one place.**
//
// There are two families and they take different arguments: §7's parameterised catalogue rows, built
// to a width, height and depth (`buildCatalogBody`), and M2's seeded decompositions — the corner
// bases, the corner returns — which are one specific already-built body each and take no size at all
// (`buildDecomposedBody`).
//
// **This module exists because the choice between them was made twice and the two copies drifted.**
// `scene-sync.ts` guarded on `isCatalogBuildId` and fell through; `measure-built-body.ts` called
// `buildCatalogBody` directly with no guard, so `createBodyProbe` threw
// `No catalog builder registered` for every decomposition id. That is not a cosmetic difference: a
// depth change re-seats exactly those bodies (`set-cabinet-depth.ts`'s `reseat` arm), so the probe
// was asked to measure the one family it could not build, and a live `setCabinetDepth` on the seeded
// kitchen threw. Found 2026-09-04, wave 6K-d. Two copies of "which builder builds this id" is the
// same two-numbers-agreeing-by-luck shape ADR 0028 is about, applied to a dispatch instead of to a
// dimension — so there is now one author for it and `build-any-body.test.ts` fails if a second
// appears.
import type * as THREE from "three";

import {
  buildCatalogBody,
  isCatalogBuildId,
  type CatalogBodySize,
} from "./catalog-bodies.js";
import { buildDecomposedBody } from "./decomposed-bodies.js";
import type { Kit } from "./kitchen-parts.js";

/**
 * One body of either family, at the size a catalogue row would be built to.
 *
 * **A decomposition ignores `size`, and that is a property of the body rather than a shortcut here.**
 * A seeded entry describes one already-built body measured for one specific opening: its width,
 * height and position are not functions of anything a caller passes, which is why
 * `buildDecomposedBody` takes no size to begin with. What *is* a function of the kit is its **seat** —
 * `cornerBaseReturn` reads the kit's own cabinet depth for the front plane its leg butts into — so a
 * probe measuring one of these gets a real answer that follows the kit, and only that answer.
 * `set-cabinet-depth.ts`'s `reseat` arm states the same split from the domain side: *"its width,
 * height and position are not functions of the depth; its seat is."*
 */
export function buildAnyBody(
  kit: Kit,
  buildId: string,
  size: CatalogBodySize,
): THREE.Group {
  if (!isCatalogBuildId(buildId)) return buildDecomposedBody(kit, buildId);
  return buildCatalogBody(kit, buildId, size);
}
