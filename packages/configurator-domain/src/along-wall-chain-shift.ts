// Wave 6J-c: **where a wall-B body stands along its wall once the corner beside it got deeper** —
// the production reader `alongWallPositionFollows` was declared for and did not have.
//
// `cabinet-depth-rule.ts` declares, per catalogue entry, which of two corner chains carries a body
// along wall B when the cabinet depth changes. Until this module it was a presence test and nothing
// more: `cabinetDepthRuleOf` threw unless the field was one of two literals, and no arm anywhere in
// `src/` branched on which. That is precisely the shape that file's own head comment is written
// against, and ADR 0089 decision 1 refuses carrying it unread.
//
// **Why a wall-B body moves at all.** Both walls walk from the same corner at the origin
// (`room-transforms.ts`), so a wall-A body's *depth* is measured along wall B: a wall-A body at the
// corner occupies wall B's along-wall interval `[0, its frame depth]`. Wall A owns that corner — its
// own run is anchored at 0 and does not move (ADR 0083 decision 1) — so when the setting deepens the
// corner body, the space it takes comes out of **wall B**, and every wall-B body slides by exactly
// what the corner gained.
//
// **Why two chains and not one delta.** The two bands stand against different wall-A bodies, and
// those bodies' depths are two different functions of the setting: the base run's carcass moves
// 560 → 660 while the wall band's carcass seat moves 291 → 361. A single uniform shift is wrong for
// one of the two by 30 mm (ADR 0089's measurement), which is why the field selects between two
// behaviours rather than labelling one. The 30 mm it leaves in wall B's top row at 700 is the
// product's answer and not a defect to smooth away — wave 6A3's *"never a sum of widths"*.
//
// Both reaches are read from `catalog.ts`'s own depth formulas rather than restated here, so a
// chain and the body it is measured against cannot drift apart the way two literals agreeing at one
// depth always eventually do.
import {
  cabinetDepthRuleOf,
  type AlongWallDepthChain,
} from "./cabinet-depth-rule.js";
import { baseCarcassDepthMm, wallCarcassSeatDepthMm } from "./catalog.js";
import type { DesignPlacement } from "./design.js";
import type { WallId } from "./room-transforms.js";
import type { BodyCatalog } from "./void-engine.js";

/** **The wall whose run the corner is taken out of.** Wall A is anchored at the corner and wall B
 *  begins past it, so a deeper corner consumes wall B's length and never wall A's. Named rather
 *  than written as a bare `"B"` at the one comparison below, because the asymmetry is a product
 *  fact — §2's two walls are geometrically symmetric and it is the *design* that puts the corner
 *  bodies on wall A. */
export const WALL_THE_CORNER_IS_TAKEN_FROM: WallId = "B";

/** Which chain's corner reach to measure, at which setting. */
export interface CornerReachQuery {
  readonly cabinetDepthMm: number;
  readonly chain: AlongWallDepthChain;
}

/** **How far wall A's corner body reaches into wall B's along-wall coordinate**, on this chain.
 *
 *  - **`base-formula`** — the base run's carcass, `baseCarcassDepthMm`: 560 at 600 and 660 at 700.
 *    It is `base-corner-x-900`'s own declared `frameDepthMm`, read through the formula rather than
 *    off that entry, so this module names no catalogue row and a fixture rename cannot silently
 *    zero the shift.
 *  - **`wall-map`** — the wall band's carcass seat, `wallCarcassSeatDepthMm`: 291 and 361. The wall
 *    band goes through §7's head-clearance map first, which is exactly why its delta is 70 and not
 *    the setting's own 100.
 *
 *  No third arm and no default: a fourth chain is a compile error here rather than a silent
 *  `base-formula`. */
export function cornerReachAlongWallMm(query: CornerReachQuery): number {
  switch (query.chain) {
    case "base-formula":
      return baseCarcassDepthMm(query.cabinetDepthMm);
    case "wall-map":
      return wallCarcassSeatDepthMm(query.cabinetDepthMm);
  }
}

/** A move between two settings, on one chain. */
export interface AlongWallShiftQuery {
  readonly fromCabinetDepthMm: number;
  readonly toCabinetDepthMm: number;
  readonly chain: AlongWallDepthChain;
}

/** **What the corner gained, which is what wall B gives up.** A difference of two reaches and
 *  nothing else, so it is zero when the setting does not change, and `from → to → from` returns the
 *  original coordinate exactly — the shift is a pure function of the setting and the declaration,
 *  with no accumulation to drift. */
export function alongWallShiftMm(query: AlongWallShiftQuery): number {
  return (
    cornerReachAlongWallMm({
      cabinetDepthMm: query.toCabinetDepthMm,
      chain: query.chain,
    }) -
    cornerReachAlongWallMm({
      cabinetDepthMm: query.fromCabinetDepthMm,
      chain: query.chain,
    })
  );
}

/** One placement, the catalogue that declares its chain, and the move being made. */
export interface AlongWallPositionQuery {
  readonly placement: DesignPlacement;
  readonly catalog: BodyCatalog;
  readonly fromCabinetDepthMm: number;
  readonly toCabinetDepthMm: number;
}

/** **Where this placement stands along its wall at the new setting.**
 *
 *  Total on every placement, so a caller cannot forget the two cases that do not move: a wall-A body
 *  keeps its coordinate because wall A is anchored at the corner, and a body whose entry left the
 *  catalogue keeps its own rather than being guessed at — the same stance `setCabinetDepth` takes one
 *  file over, where an unresolvable body becomes a refusal instead of a silent rewrite.
 *
 *  **Asked of every wall-B body, not only the ones whose depth follows the setting.** The two are
 *  different questions: `depthFollowsSetting` says whether a body is rebuilt, and this says where it
 *  stands. A freestanding fridge is 742 mm deep in both kitchens and ADR 0058's pinned tops finish at
 *  600 in both — and all of them still slide, because the corner in front of them took more wall.
 *  Excluding them would leave the run overlapping itself where the pinned rows begin. */
export function alongWallPositionAtMm(query: AlongWallPositionQuery): number {
  const { placement } = query;
  if (placement.wall !== WALL_THE_CORNER_IS_TAKEN_FROM)
    return placement.alongMm;
  const definition = query.catalog.get(placement.body.buildId);
  if (!definition) return placement.alongMm;
  return (
    placement.alongMm +
    alongWallShiftMm({
      fromCabinetDepthMm: query.fromCabinetDepthMm,
      toCabinetDepthMm: query.toCabinetDepthMm,
      chain: cabinetDepthRuleOf({
        buildId: placement.body.buildId,
        rule: definition.depthRule,
      }).alongWallPositionFollows,
    })
  );
}
