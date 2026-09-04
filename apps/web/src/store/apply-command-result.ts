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
  clipEmptyColumnsAtWallEnd,
  deriveCabinetWorldTransform,
  deriveColumns,
  derivePlacementRecords,
  getWallTransform,
  mergeAdjacentEmptyColumns,
  splitOversizedEmptyColumns,
  findVacatedVoid,
  projectFrozenMap,
  recomputeVoids,
  type BodyCatalog,
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
 *  **What it deliberately does not fix, and cannot.** The surplus half, and a member-less column
 *  where there is nothing to measure at either depth, keep the depth they were frozen at. That depth
 *  belongs to the old setting, the body that supplied it is gone, and the mapping is per chain
 *  rather than a delta (a base run goes 620 → 720 while a wall run goes 330 → 400). That is exactly
 *  the residue [ADR 0073](../../../../docs/decisions/0073-a-frozen-extent-records-the-body-its-depth-came-from.md)
 *  rules on and wave 6K-c closes, by recording the `buildId` the depth came from and re-asking that
 *  entry. Do not guess it here. */
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
    const measured = atNewDepth.get(key);
    // Member-less at the new depth: nothing to measure, so ADR 0073's residue and not this rule's.
    if (!measured) continue;
    const explained = atOldDepth.get(key);
    const carriesSurplus =
      explained === undefined ||
      column.d - explained.d > FROZEN_SURPLUS_EPSILON_M;
    const depthM = carriesSurplus ? Math.max(column.d, measured.d) : measured.d;
    if (depthM === column.d) continue;
    republished.set(key, atDepthM(column, depthM));
  }
  return republished;
}

/** Float slack on the one comparison that decides which of the two rules a column gets, **not**
 *  manufacturing slack. Both operands are §3.2's MAX over `occupiedDepthM`, each a sum of declared
 *  millimetres divided by 1000, so a column whose depth is genuinely explained by its members can
 *  differ from the frozen value by a few ULPs. Read as a surplus, those ULPs would put the column on
 *  the deeper-only arm and freeze it at the old setting on every decrease — the defect this
 *  comparison exists to decide, arriving through its own tolerance.
 *
 *  Nine orders of magnitude below `FIT_TOLERANCE_M`, the same distance `MODULE_LINE_EPSILON_M` keeps
 *  for the same reason: ADR 0015 records what happens when a fit tolerance is used where a float
 *  epsilon belongs. A real surplus is a body's worth of depth, never a nanometre. */
const FROZEN_SURPLUS_EPSILON_M = 1e-9;

/** One column at a new depth, in either direction, with its along-wall position untouched.
 *
 *  The origin is the column's own half-depth on the wall's normal (`deriveColumns`), so the two move
 *  together or the run is drawn where the shallower kitchen stood. It is recomputed through the
 *  domain's own transform rather than by naming an axis here: `x` is the along-wall coordinate on
 *  wall A and the normal one on wall B, and a store that picked the axis itself would be a second
 *  author for §2's wall convention. The along-wall coordinate is projected back out with the same
 *  wall's tangent, which is what stops a widened extent from snapping to its members' centre. */
function atDepthM(column: Column, depthM: number): Column {
  const wall = getWallTransform(column.wall);
  const alongM = wall.tangent.x * column.x + wall.tangent.z * column.z;
  const { position } = deriveCabinetWorldTransform({
    wall: column.wall,
    alongM,
    y0M: columnFloorM(column),
    depthM,
  });
  return { ...column, d: depthM, x: position.x, z: position.z };
}

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
