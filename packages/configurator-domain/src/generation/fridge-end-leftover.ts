// M7C wave C5 slices S1 and S2 — the leftover beside a fixed-width end body (the owner's Q6, 2026-10-01; ADR
// 0110 Amendment O, which departs from A4's *"at most 599 bare"* for this one case, with E6 as its
// precedent).
//
// Where the fridge ends a run and a plain door cabinet stands directly inboard of it, the 50–299 mm that
// would stay bare beyond the fridge goes to that cabinet instead: it is planned wider, in whole steps and
// up to the ceiling, and the fridge — fixed at its own width — moves outward by the same amount. What the
// cabinet cannot take stays bare beyond the fridge.
//
// **A plan in, a plan out, applied after the dishwasher** (ADR 0110 M2, *"dishwasher first"*): the
// conversion takes a door cabinet *at the dishwasher's width*, so a cabinet widened first would stop
// being one and the dishwasher would go elsewhere. Applied last, a cabinet the dishwasher took is a
// fixed-width body and nothing changes beside it. The reading order, the cut, the storage count and
// every other body's width stand where they were; only the one cabinet's span and the fridge's move.
//
// **One leaf for the L, the straight kitchen and the U.** It reads a plan's bases, floor widths and remainders
// by wall, and a U's fridge wall is a side wall whose free run already excludes the 100 mm slide reserve
// (ADR 0110 F7, 0108 H3), exactly as an L's wall B does, so what it reads is the same figure on every shape.
// A U plan carries one fridge, as a two-wall plan does (`placedFridge` places one); asserted in the tests.
//
// **The leftover is the plan's own remainder on the fridge's wall**, which is already the free run's end
// less the outermost body's end: a side wall's 100 mm reserve is not in the run, so it is never in it.

import type { DesignWall } from "../design.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { leftoverAbsorbedBesideAFixedBody } from "./leftover-rule.js";
import {
  basesAlongWall,
  type GenerationCoreRole,
  type UPlannedGenerationBase,
} from "./run-layout.js";

const FRIDGE_ROLE: GenerationCoreRole = "fridge";

/** What the absorb reads and rewrites: an L's or a straight kitchen's `KitchenCompositionPlan`, or a U's
 *  `UKitchenCompositionPlan` — both are assignable, the U's walls being a superset of the L's. */
export interface AbsorbablePlan {
  readonly bases: readonly UPlannedGenerationBase[];
  readonly floorWidthsMm: Readonly<
    Partial<Record<DesignWall, readonly number[]>>
  >;
  readonly remainderMm: Readonly<Partial<Record<DesignWall, number>>>;
}

/** The two bodies the absorb changes: the cabinet that grows and the fridge that moves out. */
interface AbsorbingPair {
  readonly cabinet: UPlannedGenerationBase;
  readonly fridge: UPlannedGenerationBase;
  readonly absorbedMm: number;
}

/** The plan with the leftover beyond its outermost fridge taken by the door cabinet inboard of it, and
 *  the plan unchanged where the fridge is not the outermost body, the body inboard is not a door cabinet,
 *  or the leftover is outside the owner's window. */
export function withTheLeftoverBesideTheFridgeAbsorbed<
  Plan extends AbsorbablePlan,
>(plan: Plan): Plan {
  const pair = absorbingPairIn(plan);
  return pair === undefined ? plan : withTheFridgeMovedOut(plan, pair);
}

function absorbingPairIn(plan: AbsorbablePlan): AbsorbingPair | undefined {
  // A plan carries at most one fridge: one core role, placed on one wall (asserted over every approved L,
  // straight and U room in `fridge-end-leftover.rooms.test.ts` and `fridge-end-leftover.u.rooms.test.ts`).
  // So the first is the only one, and *outermost* is a question about its own wall.
  const fridge = plan.bases.find((base) => base.role === FRIDGE_ROLE);
  if (fridge === undefined) return undefined;

  const alongTheWall = plan.bases.filter((base) => base.wall === fridge.wall);
  if (!alongTheWall.every((base) => base.endMm <= fridge.endMm)) {
    return undefined;
  }
  const cabinet = alongTheWall.find((base) => base.endMm === fridge.startMm);
  if (cabinet?.buildId !== DOOR_BASE_BUILD_ID) return undefined;

  const absorbedMm = leftoverAbsorbedBesideAFixedBody({
    neighbourWidthMm: cabinet.widthMm,
    leftoverMm: remainderOn(plan, fridge.wall),
  });
  return absorbedMm === 0 ? undefined : { cabinet, fridge, absorbedMm };
}

function withTheFridgeMovedOut<Plan extends AbsorbablePlan>(
  plan: Plan,
  pair: AbsorbingPair,
): Plan {
  const { wall } = pair.fridge;
  const bases = plan.bases.map((base) => withTheAbsorbApplied(base, pair));
  return {
    ...plan,
    bases,
    floorWidthsMm: {
      ...plan.floorWidthsMm,
      // Re-read in spatial order: a U's plan keeps its bases in the order the parts built them, not along the wall.
      [wall]: basesAlongWall(bases, wall).map((base) => base.widthMm),
    },
    remainderMm: {
      ...plan.remainderMm,
      [wall]: remainderOn(plan, wall) - pair.absorbedMm,
    },
  };
}

/** A wall that carries a fridge states its remainder; a plan that does not is malformed, and absorbing nothing
 *  from it would hide that. */
function remainderOn(plan: AbsorbablePlan, wall: DesignWall): number {
  const remainderMm = plan.remainderMm[wall];
  if (remainderMm === undefined) {
    throw new Error(
      `withTheLeftoverBesideTheFridgeAbsorbed: the plan carries a fridge on wall ${wall} but states no remainder for it`,
    );
  }
  return remainderMm;
}

/** The cabinet's far edge and the fridge's whole span move out by what the cabinet took; every other
 *  body is returned as it was. */
function withTheAbsorbApplied(
  base: UPlannedGenerationBase,
  { cabinet, fridge, absorbedMm }: AbsorbingPair,
): UPlannedGenerationBase {
  if (base === cabinet) {
    return {
      ...base,
      widthMm: base.widthMm + absorbedMm,
      endMm: base.endMm + absorbedMm,
    };
  }
  if (base === fridge) {
    return {
      ...base,
      startMm: base.startMm + absorbedMm,
      endMm: base.endMm + absorbedMm,
    };
  }
  return base;
}
