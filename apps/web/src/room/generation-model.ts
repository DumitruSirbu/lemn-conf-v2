// **Frame 1F's list, as data** (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:404-461`),
// and nothing else: no React, no `three`, no adapter, no sentence.
//
// **Six rows, not the log's twenty** (M7 wave 7F4, ruling R11; the sixth by wave 7D5b, ADR 0110
// Amendment M3). `GenerationLog` carries a step per physical body — four core priorities, one per
// storage cabinet, one per upper and one hood, which is about twenty rows for an ordinary room — while
// the frame draws one row per *thing the customer asked about*. So the row set is
// `GENERATION_PRIORITIES` in the domain's own order, then **the dishwasher**, then **one aggregate row
// for storage**, and the log is *folded onto* it rather than listed. The consequences worth stating,
// because each is the reason the rule is written this way and not discovered later:
//
//   - **Uppers and the hood have no row.** They are not in `GENERATION_PRIORITIES`, the frame's
//     heading is *Ce este inclus, în ordinea priorității*, and a 390 px transient screen cannot hold
//     twenty rows without scrolling past its own footer.
//   - **The dishwasher is a row and not a role.** Since wave 7D5b it is a *storage-role* body
//     (Amendment M1), so no `GenerationBaseRole` names it; the owner nonetheless ruled it a row of its
//     own (Q-DW3, *"Converted, with 1F row"*), which departs from the approved mockup's five rows under
//     ADR 0104. The row is keyed on the body, and the storage row excludes it (Amendment M3): in the
//     rooms where the dishwasher is the only storage-role body, counting it would print
//     *Depozitare — inclus* over a kitchen with no storage at all.
//   - **7F4's *"the row set does not move when 7D3–7D5 land"* is restated, not withdrawn.** It held
//     for those three waves, which changed what storage *is* and not that storage happened. Wave 7D5b
//     is the one that moved it, by owner ruling, and it is the only move on record.
//
// **A status is the whole of a row's answer** (ruling R12). `generateKitchen` is one synchronous call
// that returns a finished log, so there is no per-step signal to render: every row is `pending` before
// the call and they all resolve together after it. Nothing here paces, sequences or animates
// anything, and there is no state a row can be in that the log did not put it in.
//
// **This module publishes keys, never sentences** (ADR 0095 decision 3). The render layer resolves
// them, which is also why a row with no catalogue leaf is a failing test rather than a rendered key.
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
 * What a row says it occupies.
 *
 * A core priority declares a width and the frame prints it (*Spălător · 600*), and so does the
 * dishwasher, whose width the domain publishes by name. Storage takes whatever the wall has left over
 * after the priorities, so it has **no number to print** — the frame writes *restul peretelui* — and
 * a count of cabinets would be the per-cabinet row R11 refuses, wearing an aggregate's clothes.
 */
export type GenerationRowExtent =
  | { readonly kind: "width"; readonly millimetres: number }
  | { readonly kind: "restOfWall" };

/** The dishwasher's row. Not a `GenerationBaseRole`: the body it stands for carries role `storage`
 *  (ADR 0110 Amendment M1), and the row exists by the owner's 1F ruling (Amendment M3). */
const DISHWASHER_ROW = "dishwasher";

/** What a row is about: one of the domain's base roles, or the dishwasher. */
export type GenerationRowId = GenerationBaseRole | typeof DISHWASHER_ROW;

export interface GenerationRow {
  readonly id: GenerationRowId;
  readonly extent: GenerationRowExtent;
  readonly status: GenerationRowStatus;
}

/** The aggregate row the frame draws last. Storage is not a `GENERATION_PRIORITIES` entry — the
 *  leftover rule plans it after them — so it is named once here rather than at each site that reads
 *  it. */
const STORAGE_ROLE: GenerationBaseRole = "storage";

/**
 * **The label each base role is named by, and the reason a new role cannot ship unnamed.**
 *
 * `satisfies Readonly<Record<GenerationBaseRole, string>>` is the gate: a role added to
 * `GenerationBaseRole` is a **compile error here**, not a row rendering `room.compose.role.<role>` at
 * the customer. The dishwasher did not arrive that way — wave 7D5b made it a storage-role body, not a
 * role — so it is named by `GENERATION_ROW_MESSAGE_KEY` below instead. That every key resolves in
 * both catalogues is the paired assertion, in `tests/room/generation-model.test.ts`.
 *
 * Also read by the dropped-roles sentence, which names core roles only and so can never name the
 * dishwasher (7D5b criterion W4).
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
 * The list as it is drawn on entering composition, **before `generateKitchen` is called at all**.
 *
 * Built from `GENERATION_PRIORITIES`' declared widths and the dishwasher's published one, which are
 * the only widths that exist before a plan does (wave 7F4 ground truth G7: a `GenerationStep` carries
 * a build id and no width). They are also the widths a resolved row shows, so nothing in a row moves
 * when the log lands — criterion 29's *"a row appearing or disappearing when the log lands"* applies
 * to the numbers as much as the rows.
 */
export function pendingGenerationRows(): readonly GenerationRow[] {
  return generationRowsWith(() => "pending");
}

/**
 * The same six rows, with each status read off the log.
 *
 * **Total, and deliberately so** (criterion 30). Every role the domain can name — including `upper`
 * and `hood`, which have no row — every rejection code and every planning reason resolve to a row
 * set, and none of them throws: a row the log never mentions reads `not_placed`, which is true of a
 * body that was never placed however it came not to be placed. There is no `default:` arm silently
 * dropping a case, because there is no switch: the question asked of the log is *did any step for
 * this row place*, and that is answerable for every log that can exist.
 */
export function resolveGenerationRows(
  log: GenerationLog,
): readonly GenerationRow[] {
  return generationRowsWith((rowId) => statusOfRowIn(rowId, log.steps));
}

/**
 * The core roles the plan had no wall for, in `GENERATION_PRIORITIES`' order.
 *
 * **Core roles only** (ADR 0110's 2026-09-12 clarification point 3): a storage slot that was never
 * planned is not a role that was dropped, and the storage row already tells that truth on its own.
 *
 * Exported so `generation-steps.tsx` asks the model rather than reaching through `log.plan.dropped`
 * for itself — the one-line wrapper is the boundary, and it is what lets the plan's shape change
 * without a component following it.
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
 * **One row's verdict, over however many steps belong to it.**
 *
 * For a core priority that is one step, and for the dishwasher at most one. For storage it is every
 * storage cabinet the leftover rule planned, and the row is *placed* when **any** of them placed — the
 * 900 × 2200 room the owner ruled on has none, and the row then reads *nu poate fi inclus* rather than
 * vanishing (criterion 32).
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
 * The row a step is counted under: the dishwasher's when its body is the dishwasher, its own role's
 * otherwise. Upper and hood steps name a role no row has, so they are counted nowhere.
 *
 * **Keyed on the body, and ADR 0121 decision 2's two sentences are why.** The rule: *"the row says
 * the kitchen holds a dishwasher"*. The key: *"a placed step's body is `DISHWASHER_BUILD_ID`"*. The
 * nouns agree — the body is what a dishwasher is. The two correlates beside it are refused: the step
 * id `dishwasher` is a planner's name for a module (renaming it must not move this row), and the role
 * `storage` is shared with every cabinet the leftover rule plans — keyed on it, the row would read
 * *inclus* in every room with storage, and the storage row would read *inclus* in the rooms where the
 * dishwasher is the only storage-role body (7D5b criteria W2 and W3).
 */
function rowOfStep(
  step: GenerationStep,
): GenerationRowId | GenerationStep["role"] {
  return step.buildId === DISHWASHER_BUILD_ID ? DISHWASHER_ROW : step.role;
}
