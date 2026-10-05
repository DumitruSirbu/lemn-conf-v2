// The dishwasher beside the sink (ADR 0110 Amendment M, M1, M7(e), M8, M9). A re-identification, never a
// width change: the dishwasher is a storage-role conversion, not a core role, so it takes a module the plan
// already stands beside the sink and every width, span, remainder, column and bottle stays where it was.
// Adjacency is the plumbing's (the niche drains into the sink's waste), so either side of the sink counts
// and across the corner counts; where nothing beside the sink can take it, it is omitted rather than
// displacing anything (F12).
//
// One re-identification, M1 or else (e): M1 converts a plain door cabinet beside the sink; only where there
// is none does (e) swap the drawer cabinet beside the sink. The tie between M1's same-wall and
// across-the-corner arms is empty in the approved range, so nothing here ranks them.
//
// Adjacency is read from spatial spans, never a wall letter: each wall's modules stand contiguous from its
// corner end, so a module abuts the sink where their spans meet on one wall, and two modules face each other
// across the corner where each is the first from the corner on its wall.
//
// The dishwasher's id is never a composed storage slot's: `D`, the plain-cabinet count the threshold drawer
// tests, reads that id prefix, and counting a dishwasher there would decide the threshold drawer as though
// the door cabinet still stood (M2: dishwasher first). A pure leaf: a plan in, a plan out.

import {
  DISHWASHER_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  isComposedStorageSlot,
  PAN_DRAWER_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
} from "./body-choice.js";
import type {
  GenerationAncillaryRunItem,
  GenerationCoreRole,
  KitchenCompositionPlan,
  PlannedGenerationBase,
} from "./run-layout.js";

/** The niche the generated kitchen chooses (ADR 0110 M1): the full-size dishwasher, one storage module wide,
 *  so a conversion inherits its module's span exactly. The catalogue's 450 mm slimline stays offered to
 *  the editor. */
export const DISHWASHER_PLANNED_WIDTH_MM = 600;

/** Its own id, so `isComposedStorageSlot` answers false for it and `D` never counts it (M2). */
const DISHWASHER_ID = "dishwasher";

/** The same module as a run item, for the dishwasher trades (M7 (b), (d), (c)): `dishwasher-trades.ts`
 *  stands it in the run directly after the sink, so this leaf stays the one place that knows what a
 *  dishwasher is. */
export const DISHWASHER_RUN_ITEM: GenerationAncillaryRunItem = {
  id: DISHWASHER_ID,
  role: "storage",
  buildId: DISHWASHER_BUILD_ID,
  widthMm: DISHWASHER_PLANNED_WIDTH_MM,
};

const SINK_ROLE: GenerationCoreRole = "sink";
const PREPARATION_ROLE: GenerationCoreRole = "preparation";

/** (e)'s two modules: the preparation cabinet beside the sink and the pan drawer directly beyond it. */
interface DrawerSwap {
  readonly preparation: PlannedGenerationBase;
  readonly panDrawer: PlannedGenerationBase;
}

/** The plan with its dishwasher beside the sink — M1's converted door cabinet, or else (e)'s drawer
 *  swap — and the plan unchanged where a dishwasher already stands, there is no sink, or neither
 *  applies (omission, not displacement). */
export function withTheDishwasherBesideTheSink(
  plan: KitchenCompositionPlan,
): KitchenCompositionPlan {
  const sink = plan.bases.find((base) => base.role === SINK_ROLE);
  if (sink === undefined || hasADishwasher(plan)) return plan;

  // `.find` takes the first in plan order (wall A's modules before wall B's), an order no ruling decides;
  // safe because no approved room offers two convertible door cabinets beside the sink.
  const doorCabinet = besideTheSink(plan, sink).find(isConvertibleDoorCabinet);
  if (doorCabinet !== undefined) {
    return withDoorCabinetConverted(plan, doorCabinet);
  }

  const swap = drawerSwapBesideTheSink(plan, sink);
  return swap === undefined ? plan : withDrawersSwapped(plan, swap);
}

/** Whether the plan already carries its dishwasher: this leaf's conversion or one of the trades. */
export function hasADishwasher(plan: KitchenCompositionPlan): boolean {
  return plan.bases.some(isTheDishwasher);
}

/** Keyed on the body (ADR 0121): the dishwasher is what stands, whichever rule stood it. */
export function isTheDishwasher(base: PlannedGenerationBase): boolean {
  return base.buildId === DISHWASHER_BUILD_ID;
}

/** ADR 0110 M1: a plain door cabinet the storage run composed, at the dishwasher's width. Never a drawer
 *  cabinet, the bottle, a column, the fridge or a core role. */
function isConvertibleDoorCabinet(base: PlannedGenerationBase): boolean {
  return (
    isComposedStorageSlot(base) &&
    base.buildId === DOOR_BASE_BUILD_ID &&
    hasTheDishwashersWidth(base)
  );
}

function hasTheDishwashersWidth(base: PlannedGenerationBase): boolean {
  return base.widthMm === DISHWASHER_PLANNED_WIDTH_MM;
}

function withDoorCabinetConverted(
  plan: KitchenCompositionPlan,
  doorCabinet: PlannedGenerationBase,
): KitchenCompositionPlan {
  return {
    ...plan,
    bases: plan.bases.map((base) =>
      base === doorCabinet ? asTheDishwasher(base) : base,
    ),
  };
}

/** The module's span kept exactly; only what stands in it changes. Role `storage`, not a core role (M1). */
function asTheDishwasher(base: PlannedGenerationBase): PlannedGenerationBase {
  return {
    ...base,
    id: DISHWASHER_ID,
    role: "storage",
    buildId: DISHWASHER_BUILD_ID,
  };
}

/** Every module that abuts the sink: along its own wall on either side, or flanking the corner body
 *  with it. */
function besideTheSink(
  plan: KitchenCompositionPlan,
  sink: PlannedGenerationBase,
): readonly PlannedGenerationBase[] {
  return plan.bases.filter(
    (base) =>
      abutsAlongTheWall(base, sink) ||
      facesAcrossTheCorner(plan, { base, sink }),
  );
}

function abutsAlongTheWall(
  base: PlannedGenerationBase,
  other: PlannedGenerationBase,
): boolean {
  return (
    base.wall === other.wall &&
    (base.endMm === other.startMm || base.startMm === other.endMm)
  );
}

/** Across the corner counts (F12): the two flank the corner body, each the first module from the corner on
 *  its own wall. */
function facesAcrossTheCorner(
  plan: KitchenCompositionPlan,
  pair: {
    readonly base: PlannedGenerationBase;
    readonly sink: PlannedGenerationBase;
  },
): boolean {
  return (
    pair.base.wall !== pair.sink.wall &&
    isFirstFromTheCorner(plan, pair.base) &&
    isFirstFromTheCorner(plan, pair.sink)
  );
}

/** A wall's modules stand contiguous from its corner end, so the first from the corner is the one no
 *  other module on that wall starts before. */
function isFirstFromTheCorner(
  plan: KitchenCompositionPlan,
  base: PlannedGenerationBase,
): boolean {
  return plan.bases.every(
    (other) => other.wall !== base.wall || other.startMm >= base.startMm,
  );
}

/**
 * ADR 0110 M7(e), variant (i), modelled by M8/M9: the dishwasher takes the place of the drawer cabinet
 * beside the sink (sink · DISHWASHER · pan-drawer · hob). It needs the preparation 3-drawer beside the sink
 * and the pan drawer directly beyond it on the same wall; those two are the "2 drawer cabinets", so no
 * separate count is kept, and the swap leaves the pan drawer standing. The preparation role moves onto it,
 * so no core role is lost. `undefined` where either is missing.
 */
function drawerSwapBesideTheSink(
  plan: KitchenCompositionPlan,
  sink: PlannedGenerationBase,
): DrawerSwap | undefined {
  const preparation = besideTheSink(plan, sink).find(
    isThePreparationDrawerCabinet,
  );
  if (preparation === undefined) return undefined;

  const panDrawer = plan.bases.find(
    (base) => isPanDrawer(base) && abutsAlongTheWall(base, preparation),
  );
  return panDrawer === undefined ? undefined : { preparation, panDrawer };
}

function isThePreparationDrawerCabinet(base: PlannedGenerationBase): boolean {
  return (
    base.role === PREPARATION_ROLE &&
    base.buildId === THREE_DRAWER_BASE_BUILD_ID &&
    hasTheDishwashersWidth(base)
  );
}

/** Keyed on the body, not the id (ADR 0121): a pan drawer is what stands, whatever composed it. */
function isPanDrawer(base: PlannedGenerationBase): boolean {
  return base.buildId === PAN_DRAWER_BASE_BUILD_ID;
}

/** Identity only (M9): the dishwasher takes the 3-drawer's module, and the preparation id and role move one
 *  module along onto the pan drawer, which keeps its own body. So `dropped` stays honest and the
 *  preparation step still finds its base by role. */
function withDrawersSwapped(
  plan: KitchenCompositionPlan,
  swap: DrawerSwap,
): KitchenCompositionPlan {
  const { preparation, panDrawer } = swap;
  const asThePreparation = (base: PlannedGenerationBase) => ({
    ...base,
    id: preparation.id,
    role: preparation.role,
  });
  return {
    ...plan,
    bases: plan.bases.map((base) => {
      if (base === preparation) return asTheDishwasher(base);
      return base === panDrawer ? asThePreparation(base) : base;
    }),
  };
}
