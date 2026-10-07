// **Which builder builds a given `buildId`, decided in one place.**
//
// There are two families and they take different arguments: §7's parameterised catalogue rows, built
// to a width, height and depth (`buildCatalogBody`), and M2's seeded decompositions. Four structural
// corner decompositions read the recorded width; the other seeded decompositions keep their
// reference geometry (`buildDecomposedBody`).
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
 * **The six structural corner decompositions read `size.widthM`.** Their recorded widths are set
 * when the shell is generated and stay frozen through a depth change (ADR 0089); their heights and
 * depth arguments still come from the fixed builders and kit. Every other seeded decomposition
 * ignores `size` and keeps its reference geometry. The base return's seat follows the kit's own
 * cabinet depth, the front plane of the body it butts against.
 */
export function buildAnyBody(
  kit: Kit,
  buildId: string,
  size: CatalogBodySize,
): THREE.Group {
  if (!isCatalogBuildId(buildId))
    return buildDecomposedBody(kit, buildId, size);
  return buildCatalogBody(kit, buildId, size);
}
