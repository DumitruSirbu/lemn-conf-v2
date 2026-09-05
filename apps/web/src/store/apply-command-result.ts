// The store's half of `docs/milestones/M3-mutations.md` work item 9: turn a domain `CommandResult`
// into the exact state the store should hold next.
//
// It lives beside the store rather than inside it for two reasons. The store's four actions stay
// the "call, apply, schedule" adapter the milestone's Boundaries section requires, and the two
// invariants that are easiest to break here — frozen columns and a selection that never dangles —
// become testable without zustand.
//
// No product rule lives here. Every guard is in the domain command that produced the result; this
// module only re-derives what the design implies and decides which existing thing is selected.
import {
  withCurrentFullHeightMembers,
  cabinetDepthMmOf,
  clipEmptyColumnsAtWallEnd,
  columnBuildDepthM,
  deriveCabinetWorldTransform,
  deriveColumns,
  derivePlacementRecords,
  getWallTransform,
  mergeAdjacentEmptyColumns,
  occupiedDepthOfEntryM,
  splitOversizedEmptyColumns,
  findVacatedVoid,
  projectFrozenMap,
  recomputeVoids,
  type BodyCatalog,
  type CatalogEntryDepthQuery,
  type Column,
  type CommandEffect,
  type CommandResult,
  type Design,
  type DesignRoom,
  type FrozenMapDocument,
  type PlacementRecord,
  type RejectionReason,
  type VoidRecord,
} from "@lemnaria/configurator-domain";

export type Selection = {
  readonly kind: "placement" | "void";
  readonly id: string;
} | null;

/** The state a successful command replaces in one `set()`. `lastRejection` is part of it: a
 *  command that succeeds clears the sentence a previous refusal left on screen. */
export interface AppliedCommandState {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  /** The frozen extents, with `hasFullHeightUnder` re-answered from the new records — the one
   *  column field that describes what stands under an opening now rather than how far the run
   *  reaches. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly selection: Selection;
  readonly lastRejection: null;
}

/** A refusal touches nothing but the transient reason — same design, records, voids, selection. */
export interface RefusedCommandState {
  readonly lastRejection: RejectionReason;
}

export type CommandApplication =
  | { readonly applied: true; readonly state: AppliedCommandState }
  | { readonly applied: false; readonly state: RefusedCommandState };

export interface ApplyCommandResultInput {
  readonly result: CommandResult;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D: a column's **extent** is frozen at load time. It is an *input* to the
   *  recompute here, never an output — recomputing it from the mutated records would shrink a
   *  column to fit what is left, so a delete would free space that produces no void at all.
   *
   *  `hasFullHeightUnder` is the one field that is not part of that extent and *is* re-answered:
   *  frozen, a column whose full-height unit was deleted in this session went on reporting one
   *  standing there while the same design reloaded reported none. */
  readonly columns: ReadonlyMap<string, Column>;
  /**
   * The records the store held **before** this command — the same design at the depth it was at.
   *
   * Read by `cabinet_depth_set` and by nothing else, to ask one question a post-command map cannot
   * answer: was this frozen extent's depth fully explained by the members standing in it, or is part
   * of it a surplus a delete left behind? A column frozen deeper *by a delete* and one frozen deeper
   * *by the old setting* are indistinguishable from the current members alone, and telling them
   * apart is what lets the setting's own direction be followed without collapsing ADR 0011 Gap D's
   * freed opening.
   *
   * Required rather than defaulted for the reason `selection` is: a default would silently pick one
   * of the two behaviours for a caller that forgot to pass it.
   */
  readonly previousRecords: readonly PlacementRecord[];
  /**
   * The cabinet depth the held design declared **before** this command — the setting the kitchen is
   * leaving.
   *
   * Read by `cabinet_depth_set` and by nothing else, for ADR 0080 decision 4's one question: is this
   * extent's depth a **surplus** no rule could have produced, or is it simply what the fallback
   * itself published one setting ago? The second is a ratchet and follows the setting down; the first
   * is the absence of information and is kept.
   *
   * Required rather than defaulted for the reason `previousRecords` above is: a default would
   * silently pick one of the two behaviours for a caller that forgot to pass it, and here the two
   * differ by 70 mm on a wall opening.
   */
  readonly previousCabinetDepthMm: number;
  /** What is selected right now, which a **whole-kitchen** command leaves exactly where it was: it
   *  points at no cabinet, so it moves no selection (wave 6E). Every other effect names the
   *  placement it acted on and decides this for itself, so this is only ever read on those two
   *  arms — and it is required rather than defaulted, because a default here would silently
   *  deselect whatever the caller forgot to pass. */
  readonly selection: Selection;
}

export function applyCommandResult(
  input: ApplyCommandResultInput,
): CommandApplication {
  const { result } = input;
  if (!result.ok) {
    return { applied: false, state: { lastRejection: result.reason } };
  }

  const records = derivePlacementRecords(result.design, input.catalog);
  const columns = resolveColumns({
    effect: result.effect,
    frozen: input.columns,
    records,
    previousRecords: input.previousRecords,
    room: result.design.room,
    // Both read off the **result's own** design, so they describe the depth the command just wrote
    // rather than the one the store is leaving — `configurator-store.ts` builds the catalogue from
    // the same document for the same reason, and no depth constant is reached for here. ADR 0073's
    // own finding is two call sites still hard-coding `WORKTOP_DEPTH_MM`; this is not a third.
    //
    // **Not `effect.cabinetDepthMm`, which `CabinetDepthSetEffect` does carry.** The two are equal by
    // construction — `setCabinetDepth` writes the setting and the effect from one input — and taking
    // one operand from the effect while the catalogue beside it came from the design would be two
    // authors for one number. The document is also the half that gets saved and the half the map was
    // built at, so it is the one to agree with. Reading it off the design keeps this total as well:
    // no arm, and no effect that forgets to carry it.
    catalog: input.catalog,
    cabinetDepthMm: cabinetDepthMmOf(result.design),
    previousCabinetDepthMm: input.previousCabinetDepthMm,
  });
  const voids = recomputeVoids(records, columns);
  return {
    applied: true,
    state: {
      // Uncaught by design. `projectFrozenMap` throws `UnprojectableColumnError` only for a
      // frozen column the document cannot carry, and swallowing it here would save a design whose
      // empty space is silently missing — the defect ADR 0044 exists to fix, arriving by a new
      // route. A loud failure is the lesser harm, so this seam does not catch.
      design: withFrozenMap(result.design, projectFrozenMap(columns, records)),
      records,
      columns,
      voids,
      selection: resolveSelection(
        result.effect,
        records,
        voids,
        input.selection,
      ),
      lastRejection: null,
    },
  };
}

/** ADR 0044 and ADR 0053: the whole frozen map — the member-less columns and the frozen extents of
 *  the occupied ones — recorded on the design that is about to be held and saved. This is the
 *  **one** place it happens, and it is here rather than in a command because the frozen map is
 *  here: `removePlacement` never receives it, and a resize publishes its own answer into it through
 *  `effect.columns`, so projecting from the resolved map covers delete, resize, insert and every
 *  future effect with no per-command bookkeeping.
 *
 *  Written from `columns`, never re-derived from `result.design` — the design a command returns
 *  still carries the previous state's arrays, and the whole reason this runs is that the map, not
 *  the document, is what the command just moved.
 *
 *  Each key is **removed** rather than set to `[]` when its half is empty, so a kitchen with no free
 *  space serialises exactly as it did before ADR 0044: the fields are optional precisely so an
 *  untouched document is not rewritten, and an empty array would make every command produce a
 *  document that differs from the one it was given by a key with nothing in it. */
function withFrozenMap(design: Design, frozen: FrozenMapDocument): Design {
  const emptyColumns = frozen.emptyColumns ?? [];
  const columnExtents = frozen.columnExtents ?? [];
  const next = { ...design };
  if (emptyColumns.length > 0) next.emptyColumns = [...emptyColumns];
  else delete next.emptyColumns;
  if (columnExtents.length > 0) next.columnExtents = [...columnExtents];
  else delete next.columnExtents;
  return next;
}

/** ADR 0031 and ADR 0046: a resize and an **insert** are the two commands that move a frozen
 *  extent along the wall, so they are the two whose own answer replaces the map passed in. A depth
 *  change is the third and it moves a different axis — see `atCurrentCabinetDepth` for why that one
 *  cannot be carried forward either. Every other command leaves the extents alone and gets
 *  `hasFullHeightUnder` re-answered over them (ADR 0011 Gap D).
 *
 *  **The merge wraps the whole return value, not one branch.** ADR 0046 part 2 runs after every
 *  command, and the run that makes a merge possible usually arrives on the `body_inserted` arm: a
 *  400 mm body split off a 200 mm remainder, and that remainder is what meets the cleared column
 *  beside it. Merge only the non-effect branch and the freshly split column never meets its
 *  neighbour, with every domain test still green — which is why this seam is asserted at the store.
 *
 *  `withCurrentFullHeightMembers` runs over the merged map even on the arms whose map arrived
 *  current. That is the same author answering again rather than a second one: a merge rewrites the
 *  extents the question is asked of, and the funnel is what keeps the answer a fact about now.
 *
 *  The insert joined them on 2026-09-01: a body narrower than its column splits that column into an
 *  occupied half and an empty remainder, under two keys the one it replaced did not hold. Without
 *  this arm the effect's map is discarded, the map still carries the original wide column, and the
 *  level closes exactly as it did before the split existed — with every domain test still green,
 *  which is why this seam is asserted at the store.
 *
 *  The resized map arrives already current — `moveFrozenColumns` ends in the same
 *  `withCurrentFullHeightMembers` — so re-applying it here would be a second author for two fields.
 *  The reason the command owns this and the store does not is in `BodyResizedEffect`: *which* keys
 *  may change is a rule about the move, and a store that re-derived globally would make §10's delete
 *  produce no openings at all.
 *
 *  `voids` are recomputed against **this** map, not the one passed in. A resize moves the boundary
 *  between two columns, and an opening derived from the pre-move extents would be drawn where
 *  nothing is free any more. */
function resolveColumns(
  input: PublishedColumnsInput,
): ReadonlyMap<string, Column> {
  const { records, room } = input;
  const published = publishedColumns(input);
  // ADR 0037's merge ran here until 2026-08-30 and was withdrawn because §4 had no horizontal half.
  // It returns under ADR 0046's 800 mm cap, and what makes that safe is 5B4a's split rather than the
  // cap: no column is ever wider than its members when `recomputeVoids` runs. The cap cures only the
  // `widthFlex: 'fit'` refusal — see `merge-empty-columns.ts`.
  //
  // **Clip, then split, then merge — every command, in that order.** The clip is the owner's ruling
  // on ADR 0069's open question: a member-less column may never reach past the end of its own wall,
  // so it is held to `wallLengthMm` before anything else runs. **Clipping first is provably safe for
  // the split that follows it**, because a clip can only ever shrink a column's width — the far edge
  // moves in to the wall's own end and the near edge never moves — so the split can never see a
  // *wider* column for having run after the clip than it would have seen before. Running the split
  // first would risk publishing a column already cut to 800 mm that still reached past the wall,
  // which is exactly the state the clip exists to make unreachable.
  //
  // **Split before merge, and both after every command** (ADR 0052). The two are duals — one cuts
  // what exceeds the ceiling, the other joins what fits under it — and splitting first is what keeps
  // the answer tidy: a cleared 900 mm column beside a 50 mm strip becomes 800 + 150 rather than
  // 800 + 100 + 50. Neither can undo the other, so the pair is a fixpoint: no merged run exceeds the
  // ceiling, and no piece a split produces does.
  //
  // The split is here rather than in each command as **defence in depth, and it is reachable from no
  // document the loader accepts** — corrected 2026-09-02 after adversarial QA measured it.
  //
  // The first version of this comment said the delete was a producer with no command to put it in.
  // It is not: `deriveColumns` takes a column's width as `Math.min` over its members' frames, the
  // widest deletable body a document may carry is 800 mm (`base-corner-x-900` is `canDelete: false`),
  // and both seams already hold a *stored* entry to the ceiling. So clearing a column cannot leave
  // one wider than the cap, and QA confirmed removing this call leaves both suites green but for a
  // test written against a hand-built map.
  //
  // It stays anyway, and the reason is the DOM-001 lesson rather than a known caller: the two
  // commands that cut their own spans do so by a direction only they know, and this is the one place
  // that sees every map on its way to being published. A guard here is the difference between a
  // future producer being a bug and being an unsaveable — or, since the clip, an unofferable —
  // document.
  return withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(
      splitOversizedEmptyColumns(
        clipEmptyColumnsAtWallEnd(published, records, room),
        records,
      ),
      records,
    ),
    records,
  );
}

interface PublishedColumnsInput {
  readonly effect: CommandEffect;
  readonly frozen: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  /** The same records before the command ran — see `ApplyCommandResultInput.previousRecords`. */
  readonly previousRecords: readonly PlacementRecord[];
  readonly room: DesignRoom;
  /** The catalogue at the depth the command wrote, read by `cabinet_depth_set` and by nothing else:
   *  ADR 0073 decision 2 re-answers a frozen extent by asking the body it recorded for its declared
   *  `occupiedDepth` in **this** map. It is the map the store goes on to hold, so the answer and the
   *  geometry beside it cannot come from two different depths. */
  readonly catalog: BodyCatalog;
  /** The design's own declared cabinet depth, for the one operand `catalog` cannot supply: ADR 0073
   *  decision 3's `columnBuildDepthM` fallback, for an extent whose source is absent or unknown. */
  readonly cabinetDepthMm: number;
  /** The same setting as the design declared it **before** this command — see
   *  `ApplyCommandResultInput.previousCabinetDepthMm`. */
  readonly previousCabinetDepthMm: number;
}

/** Which map goes on to be clipped, split, merged and published — the three commands that move an
 *  extent, and the fall-through for everything else. */
function publishedColumns(
  input: PublishedColumnsInput,
): ReadonlyMap<string, Column> {
  const { effect } = input;
  if (effect.type === "body_resized" || effect.type === "body_inserted") {
    return effect.columns;
  }
  if (effect.type === "cabinet_depth_set") return atCurrentCabinetDepth(input);
  return input.frozen;
}

/** **A frozen extent may be carried forward across every command except this one, and the reason is
 *  the axis rather than the command.**
 *
 *  ADR 0011 Gap D freezes a column's extent so a delete frees space instead of shrinking the run to
 *  what is left. That argument is about the **along-wall and vertical** axes — the width a partial
 *  delete left behind is the customer's, and nothing can re-derive it. It says nothing about depth,
 *  which is §3.2's MAX over the members' `occupiedDepthM` and is a pure function of the bodies
 *  standing there. A depth change rebuilds every one of those bodies, so carried forward unchanged
 *  the map describes the run at the depth the session **opened** at: the geometry, the openings
 *  `recomputeVoids` derives from it, and — because `projectFrozenMap` writes this map into
 *  `columnExtents` — the document that is then saved and reloaded. The domain command makes the same
 *  observation one package over and re-derives for the same reason (`set-cabinet-depth.ts`).
 *
 *  **The extent is split into what its members explain and what a delete left behind, and only the
 *  first half follows the setting.** Asked at the *old* depth: if the frozen depth is what the
 *  members standing there measured before the command, nothing was deleted and the depth the same
 *  members measure at the *new* setting is authoritative — **in both directions**, because the
 *  command that publishes this map is the one that just rebuilt every one of them. If the frozen
 *  depth exceeds that, the surplus came from a body no longer present — the 620 mm opening a base
 *  cabinet left under a wall run — and it is kept, deeper-only, because re-deriving it from the wall
 *  body alone is exactly what Gap D stops.
 *
 *  **This is why the pre-command records are a parameter.** A column frozen deeper by a delete and
 *  one frozen deeper by the old setting look identical from the current members; the first must keep
 *  its depth and the second must lose it. Nothing in the post-command state distinguishes them, and
 *  a rule with no direction — "deeper only, always" — silently picks the wrong one of the two on
 *  every decrease.
 *
 *  **The surplus half follows the setting too, since wave 6K-c**, and that is the whole of what this
 *  wave changed here. The surplus is a depth some body supplied and the extent now records which one
 *  ([ADR 0073](../../../../docs/decisions/0073-a-frozen-extent-records-the-body-its-depth-came-from.md)
 *  decision 1), so instead of carrying the frozen number forward it is re-asked in the catalogue
 *  built at the new depth — see `frozenDepthAtThisSettingM`. Guessing it was what could not be done;
 *  reading a recorded declaration is not a guess.
 *
 *  **And it publishes a depth and a source together, never a depth alone**
 *  ([ADR 0079](../../../../docs/decisions/0079-a-republished-depth-names-the-body-it-came-from.md)
 *  decision 1). This was the one writer in the product that could part them: it took the winner's
 *  depth and carried the *old* `depthFromBuildId` across untouched, so one ordinary depth change on
 *  the shipped fixture recorded a pinned top as the source of a 699 mm pantry — correct depth, false
 *  record — and the record is what answers once the pantry is deleted. QA measured 99 mm lost four
 *  commands later, saved and reloaded. */
function atCurrentCabinetDepth(
  input: PublishedColumnsInput,
): ReadonlyMap<string, Column> {
  // No stored half on either call: these two maps are only ever read for the depth their **members**
  // imply, and restoring the frozen entries into them would answer with the very numbers being
  // re-measured.
  const atNewDepth = deriveColumns(input.records, {}, input.room);
  const atOldDepth = deriveColumns(input.previousRecords, {}, input.room);
  const republished = new Map(input.frozen);
  for (const [key, column] of input.frozen) {
    const published = republishedDepth({
      frozen: frozenDepthAtThisSetting({ column, published: input }),
      measured: atNewDepth.get(key),
      explains: explainsTheFrozenDepth(column, atOldDepth.get(key)),
    });
    // **Both halves, not just the depth.** A depth that did not move can still have changed hands —
    // at a new setting a different member can win §3.2's MAX at the same number — and skipping on the
    // depth alone would leave the old source standing beside it, which is F1 in miniature.
    if (
      published.d === column.d &&
      published.depthFromBuildId === column.depthFromBuildId
    ) {
      continue;
    }
    republished.set(key, atDepthM(column, published));
  }
  return republished;
}

/** **A depth and the body whose declaration produced it**, or a depth with no body claimed for it.
 *
 *  The pairing invariant as a type (ADR 0079 decisions 1 and 3): every writer of a `Column.d` in this
 *  module hands one of these over, so a store that publishes a depth without saying where it came
 *  from does not compile. It is deliberately *not* the full value object option (c) proposed — that
 *  is a rewrite of every reader of `column.d` in three packages to prevent a mistake this one
 *  signature prevents at the only seam that has ever made it.
 *
 *  **Keyed `d` rather than `depthM`, so that a `Column` already is one** (ADR 0079 decision 10
 *  part 1). That is the whole point: `republishedDepth` *returns an operand* rather than assembling a
 *  result from two, so a depth taken from one operand and a source from the other is not a mistake to
 *  be tested for — it is a sentence that cannot be written. F1 was exactly that sentence. */
interface PublishedDepth {
  readonly d: number;
  /** Absent means ADR 0073 decision 3's fallback owns this depth: `columnBuildDepthM` is a declared
   *  size and no body's declaration, so claiming one for it would be the invention ADR 0073 refused.
   *  The next depth change re-applies the fallback. */
  readonly depthFromBuildId?: string | undefined;
}

/** The three answers one column's depth can have after the change, in one place so the arms cannot
 *  drift apart. */
interface RepublishedDepthQuery {
  /** The frozen depth, re-asked at the new setting, with the body that answered it (ADR 0073). */
  readonly frozen: PublishedDepth;
  /** §3.2's MAX over the members standing here **now**, or nothing if none are. `deriveColumns`
   *  records the winner of that MAX, so this operand carries its own source too. */
  readonly measured: Column | undefined;
  /** Whether those members already explained the frozen depth at the old setting. */
  readonly explains: boolean;
}

/** **Which of the two rules a column gets** — unchanged from wave 6K-a in its arms, and changed in
 *  what it returns: the winning operand supplies both the depth **and** the source, because both
 *  operands are sourced (ADR 0079 decision 2).
 *
 *  - *Fully explained by its members* — the frozen depth was §3.2's MAX over the bodies the command
 *    just rebuilt, so what they measure now is authoritative, in both directions, and the source is
 *    the measured column's. **Even when the frozen source is present and looks right**: at a new
 *    setting a different member can win the MAX, and the source must move with the depth.
 *  - *Carrying a surplus* — the deeper of the two, and where they are equal within
 *    `FROZEN_SURPLUS_EPSILON_M` the measured operand wins, because a member standing there is the
 *    better claim on a depth the members explain. Never shallower than either operand, which is
 *    ADR 0011 Gap D's freed opening intact.
 *  - *Member-less* — the frozen answer whole, source and all, or with no source when decision 3's
 *    fallback produced it. */
function republishedDepth(query: RepublishedDepthQuery): PublishedDepth {
  const { measured } = query;
  if (measured === undefined) return query.frozen;
  if (query.explains) return measured;
  return query.frozen.d - measured.d > FROZEN_SURPLUS_EPSILON_M
    ? query.frozen
    : measured;
}

/** Whether the members standing here explain the whole frozen depth — asked at the **old** depth,
 *  which is why the pre-command records are a parameter of this seam. */
function explainsTheFrozenDepth(
  column: Column,
  explained: Column | undefined,
): boolean {
  if (explained === undefined) return false;
  return column.d - explained.d <= FROZEN_SURPLUS_EPSILON_M;
}

interface FrozenDepthQuery {
  readonly column: Column;
  readonly published: PublishedColumnsInput;
}

/** **The frozen depth itself, re-asked at the new setting** — ADR 0073, and the residue wave 6K-a
 *  named and could not close.
 *
 *  Two arms, and no arithmetic of this module's own in either:
 *
 *  - **Decision 2 — the recorded body, re-asked.** The extent records the `buildId` whose clearance
 *    supplied its depth, so the answer is that entry's own `occupiedDepth` declaration read off the
 *    catalogue built at the new depth. This gets the exceptions right *without naming them*: a
 *    `manufactured-size` machine and ADR 0058's two pinned tops declare `finishesAtMm`, which is not
 *    a function of the setting, so a column cleared of one does not move.
 *  - **Decision 3 as ADR 0080 decision 4 amends it — no source, or one the catalogue no longer
 *    holds.** The extent is answered by `columnBuildDepthM`, and the question that decides how is
 *    *"was this depth ever more than this rule could have produced"* — never *"is it deeper than the
 *    new answer"*, which is the ratchet.
 *
 *    A depth the fallback **itself** published one setting ago is not information: it follows the
 *    setting, exactly and in both directions, and carries no source. That ends the case ADR 0080
 *    condemns — a member-less wall column deepened 330 → 400 at 700 and then held at 400 in a 600 mm
 *    kitchen, standing 70 mm proud of every wall body around it, which is ADR 0028's own defect in
 *    mirror image arriving through a rule instead of a constant.
 *
 *    A depth **deeper than this rule could have produced at the setting being left** is a surplus,
 *    and there ADR 0073 decision 3 is unchanged: deeper-only, with the column's own source. It is the
 *    absence of information rather than a preference, and `columnBuildDepthM` cannot replace it —
 *    that function is a build *ceiling* (330/400, or 600/700 over a full-height member) and no
 *    setting makes it express a base run's 620/720. Answering a legacy cleared base slot from the
 *    wall map is 290 mm wrong at the setting it was frozen at, measured.
 *
 *  **The residual, re-scoped rather than fixed** (ADR 0080 decision 5, as amendment G corrects it): a
 *  cleared *base* column frozen at 620 with no recorded source stays 620 at both settings, because
 *  620 is deeper than this rule could ever produce and the fact that would have moved it was never
 *  recorded. It reaches no built body, and it self-corrects the moment anything is inserted into that
 *  column.
 *
 *  **The population is closed under descent, not by date.** No document whose columns all carry
 *  sources ever *enters* this arm — that is what makes the rule legacy-only. But a document already
 *  in it stays in it, and this build is why: the arm above publishes a depth with **no** source (ADR
 *  0079 decision 2 requires that, since `columnBuildDepthM` is no body's declaration) and
 *  `projectFrozenMap` writes that back out, so the saved document reaches the arm again on the next
 *  load. That is convergence rather than decay — the answer is `columnBuildDepthM` at the design's own
 *  setting, which follows the setting in both directions, so a descendant is never worse off than its
 *  ancestor. */
function frozenDepthAtThisSetting(query: FrozenDepthQuery): PublishedDepth {
  const recorded = recordedSourceEntry(query);
  if (recorded) {
    return {
      d: occupiedDepthOfEntryM(recorded),
      depthFromBuildId: recorded.buildId,
    };
  }
  // **Asked once and used for both ceilings** (ADR 0080 decision 4). It is the live predicate, so the
  // two operands are the same answer about the same column.
  //
  // **That it can only ever make this rule keep more is a theorem of the comparison below, not an
  // assumption about the predicate** (ADR 0080 amendment C — the earlier claim was asserted, and was
  // false in the direction it did not consider). The test is an *equality*, so a reading that flipped
  // between the freeze and now makes it fail, and a failed test routes to the surplus arm, which
  // returns `max(column.d, declaredM)` — `declaredM` being the ceiling at the setting the design now
  // declares, bound just below. Both directions therefore keep at least as much:
  //
  //   true -> false : a 600 published under the lifted arm meets a 330 `atFreezeM`, reads as a
  //                   surplus, and is kept.
  //   false -> true : a 400 published under the capped arm meets a 600 `atFreezeM`, reads as a
  //                   surplus, and the MAX deepens it to `declaredM`. Deeper, never shallower.
  const { hasFullHeightUnder } = query.column;
  const declaredM = columnBuildDepthM({
    cabinetDepthMm: query.published.cabinetDepthMm,
    hasFullHeightUnder,
  });
  const atFreezeM = columnBuildDepthM({
    cabinetDepthMm: query.published.previousCabinetDepthMm,
    hasFullHeightUnder,
  });

  // **A depth this rule itself could have published is not information** (ADR 0080 decision 4). It
  // follows the setting exactly, in both directions, and carries no source — `columnBuildDepthM` is a
  // declared size and no body's declaration, so claiming one for it would be an invention, and that
  // includes dropping an id the column was carrying: a legacy wall column deepened 330 → 400 must not
  // keep an id declaring 330 against the day that id returns to the catalogue.
  //
  // **An equality, not a bound** (ADR 0080 amendment B and C). Every depth this rule publishes is
  // either `columnBuildDepthM` *exactly* — the arm below returns `declaredM` unchanged, and the
  // surplus arm's MAX returns it exactly when it wins — or a surplus strictly above it. So *"could
  // this rule have published this depth"* is an equality, and writing it as `d - atFreezeM <= ε`
  // additionally swallowed every depth **below** the ceiling. That was the defect: a raised ceiling
  // (an inserted full-height body overlapping a member-less slot) swallowing a legacy 620 that no
  // version of this rule ever published, and following the setting down to 600. The two forms differ
  // on exactly one shape, `declaredM < column.d < atFreezeM`; below `declaredM` the surplus arm's own
  // MAX returns `declaredM` anyway, so there they agree.
  //
  // **The predicate reads two fields of one document** — `column.d` and the setting the design
  // declared before this command — and never the session's history, so one document answers one way
  // whatever route reached it (ADR 0011's 2026-08-26 correction, satisfied by construction). A
  // document at 600 carrying an unsourced 400 and one at 700 carrying an unsourced 400 are two
  // different documents and get two different answers.
  //
  // The float band is the one the surplus test beside it uses: both operands are sums of declared
  // millimetres divided by 1000, and this arm publishes the ceiling bit-for-bit, so the next call
  // subtracts to exactly zero. No whole millimetre lies strictly inside the band, which QA pins.
  if (Math.abs(query.column.d - atFreezeM) <= FROZEN_SURPLUS_EPSILON_M) {
    return { d: declaredM };
  }

  // Otherwise it is a surplus no rule can re-answer, and ADR 0073 decision 3 is unchanged: the
  // deeper-only MAX, written as a choice between two producers rather than as `Math.max` because the
  // two answer the source differently and **a source survives exactly when the depth it explains
  // survives** (ADR 0079 decision 2). The column's own source travels with a surviving frozen depth —
  // including one the catalogue no longer holds, which explains that depth as well as anything can.
  return query.column.d > declaredM
    ? { d: query.column.d, depthFromBuildId: query.column.depthFromBuildId }
    : { d: declaredM };
}

/** The catalogue row this extent's depth came from, or nothing — an absent `depthFromBuildId` and one
 *  the map does not hold are the same answer here and neither is an error (ADR 0073 decision 7; a
 *  load that refuses is a dead link). */
function recordedSourceEntry(
  query: FrozenDepthQuery,
): CatalogEntryDepthQuery | undefined {
  const buildId = query.column.depthFromBuildId;
  if (buildId === undefined) return undefined;
  const definition = query.published.catalog.get(buildId);
  return definition ? { buildId, definition } : undefined;
}

/** Float slack on the comparisons that decide which rule a column gets, **not** manufacturing slack.
 *
 *  **Its first caller** is `explainsTheFrozenDepth`. Both operands there are §3.2's MAX over
 *  `occupiedDepthM`, each a sum of declared millimetres divided by 1000, so a column whose depth is
 *  genuinely explained by its members can differ from the frozen value by a few ULPs. Read as a
 *  surplus, those ULPs would put the column on the deeper-only arm and freeze it at the old setting
 *  on every decrease — the defect that comparison exists to decide, arriving through its own
 *  tolerance.
 *
 *  **Its second caller is `frozenDepthAtThisSetting`'s ratchet equality** (wave 6K-j), which is a
 *  structurally different decision: a frozen depth against `columnBuildDepthM` at the setting being
 *  left, rather than two measurements of the same members. The band is borrowed rather than
 *  duplicated because both are comparisons of declared millimetres over 1000 at the same magnitude,
 *  and the argument for why it is sound *there* — the arm publishes the ceiling bit-for-bit, so the
 *  next call subtracts to exactly zero, and no whole millimetre lies strictly inside the band — is
 *  written at that call site and pinned by `qa-6k-j-fallback-rule.adversarial.test.ts`. Named here so
 *  a later edit to this constant knows it moves two rules, not one.
 *
 *  Nine orders of magnitude below `FIT_TOLERANCE_M`, the same distance `MODULE_LINE_EPSILON_M` keeps
 *  for the same reason: ADR 0015 records what happens when a fit tolerance is used where a float
 *  epsilon belongs. A real surplus is a body's worth of depth, never a nanometre. */
const FROZEN_SURPLUS_EPSILON_M = 1e-9;

/** One column at a published depth, in either direction, with its along-wall position untouched.
 *
 *  The origin is the column's own half-depth on the wall's normal (`deriveColumns`), so the two move
 *  together or the run is drawn where the shallower kitchen stood. It is recomputed through the
 *  domain's own transform rather than by naming an axis here: `x` is the along-wall coordinate on
 *  wall A and the normal one on wall B, and a store that picked the axis itself would be a second
 *  author for §2's wall convention. The along-wall coordinate is projected back out with the same
 *  wall's tangent, which is what stops a widened extent from snapping to its members' centre.
 *
 *  **It takes a `PublishedDepth` and not a bare number** (ADR 0079 decision 3), which is the whole of
 *  the guarantee: this is the one seam in the product that has ever written a `Column.d` without the
 *  source that explains it, and a caller that tries to now fails to compile rather than shipping a
 *  record that lies about where its own depth came from. */
function atDepthM(column: Column, published: PublishedDepth): Column {
  const wall = getWallTransform(column.wall);
  const alongM = wall.tangent.x * column.x + wall.tangent.z * column.z;
  const { position } = deriveCabinetWorldTransform({
    wall: column.wall,
    alongM,
    y0M: columnFloorM(column),
    depthM: published.d,
  });
  const moved: MutableColumn = {
    ...column,
    d: published.d,
    x: position.x,
    z: position.z,
  };
  // Deleted rather than set to `undefined`, so an unsourced column is shaped exactly like one that
  // never had a source — the rule `toEmptyColumn` and `toColumnExtent` already follow, and the one
  // `JSON.stringify` and an `in` check disagree about.
  if (published.depthFromBuildId === undefined) delete moved.depthFromBuildId;
  else moved.depthFromBuildId = published.depthFromBuildId;
  return moved;
}

/** A `Column` under construction. `Column`'s own fields are `readonly` — they are, correctly, a
 *  frozen extent — and this is the one place a field has to be **removed** rather than overwritten,
 *  which no spread can express. */
type MutableColumn = { -readonly [Field in keyof Column]: Column[Field] };

/** The column's own floor, which the transform validates as non-negative and then uses only for a
 *  `y` this shape does not carry. Read off `regions` rather than passed as zero so the value handed
 *  to the domain is the column's real one. A column with no region at all reaches neither
 *  `deriveColumns` nor a restored extent; `0` keeps this total rather than handing the transform the
 *  infinity an empty `Math.min` produces, which it would reject. */
function columnFloorM(column: Column): number {
  const floorsM = column.regions.map(([floorM]) => floorM);
  return floorsM.length > 0 ? Math.min(...floorsM) : 0;
}

/** §5.1's closing step and the milestone's "selection never dangles" criterion, as one function:
 *  decide what the command points at, then keep it only if it still exists. */
function resolveSelection(
  effect: CommandEffect,
  records: readonly PlacementRecord[],
  voids: readonly VoidRecord[],
  current: Selection,
): Selection {
  const intended = intendSelection(effect, voids, current);
  return isStillPresent(intended, records, voids) ? intended : null;
}

function intendSelection(
  effect: CommandEffect,
  voids: readonly VoidRecord[],
  current: Selection,
): Selection {
  if (effect.type === "placement_removed") {
    // Found by geometry, never by a remembered id: void ids are regenerated on every recompute and
    // a merge with a neighbouring opening changes them (§5.1).
    const vacated = findVacatedVoid(voids, effect.vacated);
    return vacated ? { kind: "void", id: vacated.id } : null;
  }
  // Wave 6E's two, and wave 6J-b's third: a whole-kitchen setting acts on no cabinet, so it has no
  // placement to point at and the selection the customer is holding is carried through untouched.
  // It is still put through `isStillPresent` below, which is what keeps "the selection never
  // dangles" one rule rather than one rule with an exception.
  //
  // A depth change rebuilds every body but keeps every placement **id**, so the held selection is
  // still the same cabinet afterwards — a deeper one. Carrying it through is what stops a customer
  // losing their place because the kitchen got deeper around them.
  if (
    effect.type === "material_tier_set" ||
    effect.type === "hardware_tier_set" ||
    effect.type === "cabinet_depth_set"
  ) {
    return current;
  }
  return { kind: "placement", id: effect.placementId };
}

function isStillPresent(
  selection: Selection,
  records: readonly PlacementRecord[],
  voids: readonly VoidRecord[],
): boolean {
  if (!selection) return false;
  return selection.kind === "placement"
    ? records.some((record) => record.id === selection.id)
    : voids.some((record) => record.id === selection.id);
}
