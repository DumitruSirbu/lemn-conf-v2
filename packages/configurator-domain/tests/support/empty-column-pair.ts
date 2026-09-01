// The smallest world in which ADR 0031's funding rule can be exercised at an arbitrary width: one
// cabinet with one empty column of a chosen width abutting it.
//
// It lives here because two suites built it independently and identically during wave 5B1
// (`set-width.creates-space.test.ts` and `qa-w5b1.adversarial.test.ts`), under two names — and one
// of those names, `pairWithEmptyRight`, already belonged to a *different* three-member fixture
// private to `set-width.test.ts`. Two fixtures with one name is how a test comes to assert something
// other than what its reader thinks (review finding R1.5).
//
// **Why a synthetic world rather than a shrink of the shipped kitchen**: a shrink always vacates a
// multiple of the 50 mm step, so the boundary widths this fixture exists for — 202, 250, 498, 500 —
// are not reachable that way.
import { clearBodies } from "./commands.js";
import { syntheticWorld } from "./synthetic-world.js";
import type { KitchenWorld } from "./kitchen-world.js";

/** The height a base member must be given. **860 mm is the base carcass's own height**, and it is
 *  load-bearing here rather than decorative: a shorter member makes the level it stands in shorter
 *  than the body a rebuild produces, so every resize refuses `HEIGHT_EXCEEDS_LEVEL` before it ever
 *  looks at a width — measured, and the reason an earlier version of this fixture reported the wrong
 *  refusal for every row that used it. */
const BASE_CARCASS_HEIGHT_MM = 860;

/** Where the two columns meet, along wall A. Arbitrary, and far enough from either end of the wall
 *  that a growth in either direction has room. */
const SHARED_EDGE_MM = 1600;

const OCCUPIED_WIDTH_MM = 600;

/** A 600 mm base on the left of `SHARED_EDGE_MM`, and an **empty column** of `emptyWidthMm` on its
 *  right. The right-hand body is emptied through the real delete, which is the only way an empty
 *  column comes to exist at all — ADR 0031 funds a resize from one and nothing else.
 *
 *  The occupied column is a single member, so it is also the whole column: ADR 0031 moves every
 *  level together, and one level keeps a width test about the width. */
export function pairWithEmptyColumnRight(emptyWidthMm: number): KitchenWorld {
  const world = syntheticWorld([
    {
      id: "L-base",
      wall: "A" as const,
      alongMm: SHARED_EDGE_MM - OCCUPIED_WIDTH_MM / 2,
      y0Mm: 0,
      body: {
        buildId: "base-drawer2-600",
        widthMm: OCCUPIED_WIDTH_MM,
        heightMm: BASE_CARCASS_HEIGHT_MM,
      },
    },
    {
      id: "R-base",
      wall: "A" as const,
      alongMm: SHARED_EDGE_MM + emptyWidthMm / 2,
      y0Mm: 0,
      body: {
        buildId: "base-drawer2-600",
        widthMm: emptyWidthMm,
        heightMm: BASE_CARCASS_HEIGHT_MM,
      },
    },
  ]);
  return clearBodies(world, ["R-base"]);
}
