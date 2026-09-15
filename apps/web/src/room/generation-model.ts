// **Frame 1F's list, as data** (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:404-461`),
// and nothing else: no React, no `three`, no adapter, no sentence.
//
// **Five rows, not the log's twenty** (M7 wave 7F4, ruling R11). `GenerationLog` carries a step per
// physical body — four core priorities, one per storage cabinet, one per upper and one hood, which is
// about twenty rows for an ordinary room — while the frame draws one row per *role*. So the row set
// is `GENERATION_PRIORITIES` in the domain's own order plus **one aggregate row for storage**, and the
// log is *folded onto* it rather than listed. Two consequences worth stating, because both are the
// reason the rule is written this way and not discovered later:
//
//   - **Uppers and the hood have no row.** They are not in `GENERATION_PRIORITIES`, the frame's
//     heading is *Ce așezăm, în ordinea priorității*, and a 390 px transient screen cannot hold
//     twenty rows without scrolling past its own footer.
//   - **The row set does not move when 7D3–7D5 land.** Those waves change what storage *is*; they do
//     not change that storage happened, which is the only thing this row claims.
//
// **A status is the whole of a row's answer** (ruling R12). `generateKitchen` is one synchronous call
// that returns a finished log, so there is no per-step signal to render: every row is `pending` before
// the call and they all resolve together after it. Nothing here paces, sequences or animates
// anything, and there is no state a row can be in that the log did not put it in.
//
// **This module publishes keys, never sentences** (ADR 0095 decision 3). The render layer resolves
// them, which is also why a role with no catalogue leaf is a failing test rather than a rendered key.
import {
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
 * A core priority declares a width and the frame prints it (*Spălător · 600*). Storage takes whatever
 * the wall has left over after the four priorities, so it has **no number to print** — the frame
 * writes *restul peretelui* — and a count of cabinets would be the per-cabinet row R11 refuses,
 * wearing an aggregate's clothes.
 */
export type GenerationRowExtent =
  | { readonly kind: "width"; readonly millimetres: number }
  | { readonly kind: "restOfWall" };

export interface GenerationRow {
  readonly role: GenerationBaseRole;
  readonly extent: GenerationRowExtent;
  readonly status: GenerationRowStatus;
}

/** The aggregate row the frame draws below the four priorities. Storage is not a
 *  `GENERATION_PRIORITIES` entry — the leftover rule plans it after them — so it is named once here
 *  rather than spelled at each of the three sites that build a row set. */
const STORAGE_ROLE: GenerationBaseRole = "storage";

/**
 * **The label each row is named by, and the reason a new role cannot ship unnamed.**
 *
 * `satisfies Readonly<Record<GenerationBaseRole, string>>` is the gate: 7D5's `dishwasher` added to
 * `GenerationBaseRole` is a **compile error here**, not a row rendering `room.compose.role.dishwasher`
 * at the customer. That every key resolves in both catalogues is the paired assertion, in
 * `tests/room/generation-model.test.ts`.
 */
export const GENERATION_ROLE_MESSAGE_KEY = {
  fridge: "room.compose.role.fridge",
  sink: "room.compose.role.sink",
  preparation: "room.compose.role.preparation",
  hob: "room.compose.role.hob",
  storage: "room.compose.role.storage",
} as const satisfies Readonly<Record<GenerationBaseRole, string>>;

/** The status word beside a row, keyed by the state the row is in. */
export const GENERATION_STATUS_MESSAGE_KEY = {
  pending: "room.compose.status.pending",
  placed: "room.compose.status.placed",
  not_placed: "room.compose.status.notPlaced",
} as const satisfies Readonly<Record<GenerationRowStatus, string>>;

/**
 * The list as it is drawn on entering composition, **before `generateKitchen` is called at all**.
 *
 * Built from `GENERATION_PRIORITIES`' declared widths, which is the only width that exists before a
 * plan does (wave 7F4 ground truth G7: a `GenerationStep` carries a build id and no width). It is
 * also the width a resolved row shows, so nothing in a row moves when the log lands — criterion 29's
 * *"a row appearing or disappearing when the log lands"* applies to the numbers as much as the rows.
 */
export function pendingGenerationRows(): readonly GenerationRow[] {
  return generationRowsWith(() => "pending");
}

/**
 * The same five rows, with each status read off the log.
 *
 * **Total, and deliberately so** (criterion 30). Every role the domain can name — including `upper`
 * and `hood`, which have no row — every rejection code and every planning reason resolve to a row
 * set, and none of them throws: a row whose role the log never mentions reads `not_placed`, which is
 * true of a body that was never placed however it came not to be placed. There is no `default:` arm
 * silently dropping a case, because there is no switch: the question asked of the log is *did any
 * step for this role place*, and that is answerable for every log that can exist.
 */
export function resolveGenerationRows(
  log: GenerationLog,
): readonly GenerationRow[] {
  return generationRowsWith((role) => statusOfRoleIn(role, log.steps));
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
  statusOfRole: (role: GenerationBaseRole) => GenerationRowStatus,
): readonly GenerationRow[] {
  const priorities = GENERATION_PRIORITIES.map((priority) => ({
    role: priority.role,
    extent: { kind: "width", millimetres: priority.widthMm } as const,
    status: statusOfRole(priority.role),
  }));

  return [
    ...priorities,
    {
      role: STORAGE_ROLE,
      extent: { kind: "restOfWall" },
      status: statusOfRole(STORAGE_ROLE),
    },
  ];
}

/**
 * **One row's verdict, over however many steps carry its role.**
 *
 * For a core priority that is one step. For storage it is every storage cabinet the leftover rule
 * planned, and the row is *placed* when **any** of them placed — the 900 × 2200 room the owner ruled
 * on has none, and the row then reads *nu poate fi inclus* rather than vanishing (criterion 32).
 */
function statusOfRoleIn(
  role: GenerationBaseRole,
  steps: readonly GenerationStep[],
): GenerationRowStatus {
  const placedForThisRole = steps.some(
    (step) => step.role === role && step.status === "placed",
  );
  return placedForThisRole ? "placed" : "not_placed";
}
