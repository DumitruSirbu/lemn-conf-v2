// M7C wave C5 slice S1 — the leftover beside a fixed-width end body (the owner's Q6, 2026-10-01; ADR
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
// **The leftover is the plan's own remainder on the fridge's wall**, which is already the free run's end
// less the outermost body's end: a side wall's 100 mm reserve is not in the run, so it is never in it.

import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { leftoverAbsorbedBesideAFixedBody } from "./leftover-rule.js";
import type {
  GenerationCoreRole,
  KitchenCompositionPlan,
  PlannedGenerationBase,
} from "./run-layout.js";

const FRIDGE_ROLE: GenerationCoreRole = "fridge";

/** The two bodies the absorb changes: the cabinet that grows and the fridge that moves out. */
interface AbsorbingPair {
  readonly cabinet: PlannedGenerationBase;
  readonly fridge: PlannedGenerationBase;
  readonly absorbedMm: number;
}

/** The plan with the leftover beyond its outermost fridge taken by the door cabinet inboard of it, and
 *  the plan unchanged where the fridge is not the outermost body, the body inboard is not a door cabinet,
 *  or the leftover is outside the owner's window. */
export function withTheLeftoverBesideTheFridgeAbsorbed(
  plan: KitchenCompositionPlan,
): KitchenCompositionPlan {
  const pair = absorbingPairIn(plan);
  return pair === undefined ? plan : withTheFridgeMovedOut(plan, pair);
}

function absorbingPairIn(
  plan: KitchenCompositionPlan,
): AbsorbingPair | undefined {
  // A two-wall plan carries at most one fridge: it is one core role, and the cut puts it on one wall
  // (asserted over every approved L and straight room in `fridge-end-leftover.rooms.test.ts`). So the
  // first is the only one, and *outermost* is a question about its own wall.
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
    leftoverMm: plan.remainderMm[fridge.wall],
  });
  return absorbedMm === 0 ? undefined : { cabinet, fridge, absorbedMm };
}

function withTheFridgeMovedOut(
  plan: KitchenCompositionPlan,
  pair: AbsorbingPair,
): KitchenCompositionPlan {
  const { wall } = pair.fridge;
  const bases = plan.bases.map((base) => withTheAbsorbApplied(base, pair));
  return {
    ...plan,
    bases,
    floorWidthsMm: {
      ...plan.floorWidthsMm,
      [wall]: bases
        .filter((base) => base.wall === wall)
        .map((base) => base.widthMm),
    },
    remainderMm: {
      ...plan.remainderMm,
      [wall]: plan.remainderMm[wall] - pair.absorbedMm,
    },
  };
}

/** The cabinet's far edge and the fridge's whole span move out by what the cabinet took; every other
 *  body is returned as it was. */
function withTheAbsorbApplied(
  base: PlannedGenerationBase,
  { cabinet, fridge, absorbedMm }: AbsorbingPair,
): PlannedGenerationBase {
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
