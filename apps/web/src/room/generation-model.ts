// Frame 1F's list as data (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:404-461`): no React, `three`,
// adapter or sentence. Keys, never sentences (ADR 0095 decision 3): a row with no catalogue leaf is a failing test.
//
// Six rows, not the log's twenty: `GenerationLog` has a step per physical body, the frame one row per thing the
// customer asked about. The set is `GENERATION_PRIORITIES` in the domain's order, the dishwasher, then one aggregate
// storage row, and the log is folded onto it. Uppers and the hood have no row (a 390 px screen cannot hold twenty).
// The dishwasher is a row but not a role: it is a storage-role body (ADR 0110 Amendment M1) with its own row
// (Amendment M3), so the storage row excludes it: where it is the only storage-role body, counting it would print
// *Depozitare — inclus* over a kitchen with no storage. Every row is `pending` before the one synchronous
// `generateKitchen` call and they all resolve together after it; nothing here paces or animates.
import {
  DISHWASHER_BUILD_ID,
  DISHWASHER_PLANNED_WIDTH_MM,
  GENERATION_PRIORITIES,
  type GenerationBaseRole,
  type GenerationCoreRole,
  type GenerationLog,
  type GenerationStep,
} from "@lemnaria/configurator-domain";

/** The three states frame 1F draws: the spinner, the green tick, and the dashed *nu poate fi
 *  inclus* row. */
export type GenerationRowStatus = "pending" | "placed" | "not_placed";

/**
 * What a row says it occupies. A core priority and the dishwasher declare a width the frame prints
 * (*Chiuvetă · 600*). Storage takes whatever the wall has left, so it has no number to print (*restul
 * peretelui*): a count of cabinets would be the per-cabinet row the aggregate exists to avoid.
 */
export type GenerationRowExtent =
  | { readonly kind: "width"; readonly millimetres: number }
  | { readonly kind: "restOfWall" };

/** The dishwasher's row. Not a `GenerationBaseRole`: the body it stands for carries role `storage`
 *  (ADR 0110 Amendment M1), and the row exists by Amendment M3. */
const DISHWASHER_ROW = "dishwasher";

/** What a row is about: one of the domain's base roles, or the dishwasher. */
export type GenerationRowId = GenerationBaseRole | typeof DISHWASHER_ROW;

export interface GenerationRow {
  readonly id: GenerationRowId;
  readonly extent: GenerationRowExtent;
  readonly status: GenerationRowStatus;
}

/** The aggregate row the frame draws last. Storage is not a `GENERATION_PRIORITIES` entry (the leftover rule
 *  plans it after them), so it is named once here. */
const STORAGE_ROLE: GenerationBaseRole = "storage";

/**
 * The label each base role is named by. The `satisfies` is the gate: a role added to `GenerationBaseRole` is a
 * compile error here, not a row rendering `room.compose.role.<role>` at the customer; that every key resolves in
 * both catalogues is asserted in `tests/room/generation-model.test.ts`. The dishwasher is not a role, so
 * `GENERATION_ROW_MESSAGE_KEY` names it. Also read by the dropped-roles sentence, which names core roles only.
 */
export const GENERATION_ROLE_MESSAGE_KEY = {
  fridge: "room.compose.role.fridge",
  sink: "room.compose.role.sink",
  preparation: "room.compose.role.preparation",
  hob: "room.compose.role.hob",
  storage: "room.compose.role.storage",
} as const satisfies Readonly<Record<GenerationBaseRole, string>>;

/** The label each row is named by: every role's, plus the dishwasher's own leaf. The `satisfies` is
 *  the same gate as above, widened to the row set. */
export const GENERATION_ROW_MESSAGE_KEY = {
  ...GENERATION_ROLE_MESSAGE_KEY,
  dishwasher: "room.compose.dishwasher",
} as const satisfies Readonly<Record<GenerationRowId, string>>;

/** The status word beside a row, keyed by the state the row is in. */
export const GENERATION_STATUS_MESSAGE_KEY = {
  pending: "room.compose.status.pending",
  placed: "room.compose.status.placed",
  not_placed: "room.compose.status.notPlaced",
} as const satisfies Readonly<Record<GenerationRowStatus, string>>;

/**
 * The list as drawn on entering composition, before `generateKitchen` is called. Built from the declared widths
 * of `GENERATION_PRIORITIES` and the dishwasher's published one: the only widths that exist before a plan does
 * (a `GenerationStep` carries a build id and no width). They are also the widths a resolved row shows, so no
 * number moves when the log lands.
 */
export function pendingGenerationRows(): readonly GenerationRow[] {
  return generationRowsWith(() => "pending");
}

/**
 * The same six rows, with each status read off the log. Total: every role the domain can name (including
 * `upper` and `hood`, which have no row), every rejection code and every planning reason resolves to a row set
 * without throwing. A row the log never mentions reads `not_placed`, true of a body never placed however it came
 * not to be. The question asked is *did any step for this row place*, so there is no `default:` arm to drop a case.
 */
export function resolveGenerationRows(
  log: GenerationLog,
): readonly GenerationRow[] {
  return generationRowsWith((rowId) => statusOfRowIn(rowId, log.steps));
}

/**
 * The core roles the plan had no wall for, in `GENERATION_PRIORITIES`' order. Core roles only (ADR 0110): a
 * storage slot never planned is not a dropped role, and the storage row already says so. Exported so
 * `generation-steps.tsx` asks the model rather than reaching through `log.plan.dropped`.
 */
export function droppedRolesIn(
  log: GenerationLog,
): readonly GenerationCoreRole[] {
  return log.plan.dropped;
}

function generationRowsWith(
  statusOfRow: (rowId: GenerationRowId) => GenerationRowStatus,
): readonly GenerationRow[] {
  const priorities = GENERATION_PRIORITIES.map((priority) => ({
    id: priority.role,
    extent: widthOf(priority.widthMm),
  }));
  const unresolvedRows: readonly Omit<GenerationRow, "status">[] = [
    ...priorities,
    { id: DISHWASHER_ROW, extent: widthOf(DISHWASHER_PLANNED_WIDTH_MM) },
    { id: STORAGE_ROLE, extent: { kind: "restOfWall" } },
  ];

  return unresolvedRows.map((row) => ({ ...row, status: statusOfRow(row.id) }));
}

function widthOf(millimetres: number): GenerationRowExtent {
  return { kind: "width", millimetres };
}

/**
 * One row's verdict over however many steps belong to it: one for a core priority, at most one for the
 * dishwasher, every storage cabinet the leftover rule planned for storage. The row is placed when any step
 * placed; a room with none (900 x 2200) reads *nu poate fi inclus* rather than vanishing.
 */
function statusOfRowIn(
  rowId: GenerationRowId,
  steps: readonly GenerationStep[],
): GenerationRowStatus {
  const isPlacedForThisRow = steps.some(
    (step) => step.status === "placed" && rowOfStep(step) === rowId,
  );
  return isPlacedForThisRow ? "placed" : "not_placed";
}

/**
 * The row a step is counted under: the dishwasher's when its body is the dishwasher, its own role's otherwise; upper
 * and hood steps name a role no row has and count nowhere. Keyed on the body (ADR 0121 decision 2), not the step id
 * (a planner's name for a module) or the role `storage` (shared with every leftover-rule cabinet): either would make
 * the dishwasher row read *inclus* in every room with storage and the storage row read *inclus* where the dishwasher
 * is the only storage-role body.
 */
function rowOfStep(
  step: GenerationStep,
): GenerationRowId | GenerationStep["role"] {
  return step.buildId === DISHWASHER_BUILD_ID ? DISHWASHER_ROW : step.role;
}
