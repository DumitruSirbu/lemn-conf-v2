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
  clipEmptyColumnsToFreeGround,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  splitOversizedEmptyColumns,
  findVacatedVoid,
  projectFrozenMap,
  recomputeVoids,
  withFrozenMap,
  type BodyCatalog,
  type Column,
  type ColumnExtent,
  type CommandEffect,
  type CommandResult,
  type Design,
  type DesignRoom,
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
  /** **The published face**: the frozen extents with `hasFullHeightUnder` re-answered from the new
   *  records, and every member-less column bounded by the length of the wall it stands on. This is
   *  what openings are derived from, what the scene draws and what an insert is matched against —
   *  ADR 0069's owner ruling, that nothing past the end of a wall is ever offered. */
  readonly columns: ReadonlyMap<string, Column>;
  /** **The recorded face**: the same map with ADR 0069's wall-end cap *not* applied, which is what
   *  the document is projected from (ADR 0090 Amendment B).
   *
   *  > A pass that derives its answer from the **room** may bound what the map publishes and may not
   *  > rewrite what the document records.
   *
   *  The cap is the only stage on that side of the line. The free-ground clip, ADR 0052's split and
   *  ADR 0046's merge derive from the placements or from a declared ceiling and are in both faces:
   *  no setting change undoes them. The cap is different because wave 6J-c made the wall's own
   *  length reversible from the customer's side — a space flush to wall B's end lost 100 mm at 700
   *  and kept the loss on the way back to 600, schema-valid and validator-silent. */
  readonly recordedColumns: ReadonlyMap<string, Column>;
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
   *  standing there while the same design reloaded reported none.
   *
   *  **The store's recorded face, not its published one** (ADR 0090 Amendment B). Handing the
   *  wall-bounded map in would carry ADR 0069's cap into the next command's record and out through
   *  `projectFrozenMap`, which is the defect that amendment closes — one command per 100 mm, and
   *  each document valid on its own. */
  readonly columns: ReadonlyMap<string, Column>;
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
  const { recorded, published } = resolveColumns({
    effect: result.effect,
    frozen: input.columns,
    records,
    room: result.design.room,
  });
  const voids = recomputeVoids(records, published);
  return {
    applied: true,
    state: {
      // Uncaught by design. `projectFrozenMap` throws `UnprojectableColumnError` only for a
      // frozen column the document cannot carry, and swallowing it here would save a design whose
      // empty space is silently missing — the defect ADR 0044 exists to fix, arriving by a new
      // route. A loud failure is the lesser harm, so this seam does not catch.
      // **Projected from the recorded face** (ADR 0090 Amendment B): the document keeps the width
      // the customer left, and a recorded extent the wall no longer covers is *marked* rather than
      // shortened — the same treatment ADR 0065 gives a placement the same slide pushes past the
      // same wall.
      design: withFrozenMap(result.design, projectFrozenMap(recorded, records)),
      records,
      columns: published,
      recordedColumns: recorded,
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

/** ADR 0044 and ADR 0053's projection, written onto the design that is about to be held and saved.
 *  It is the store's job for every command except the three that publish their own map, and it is
 *  written from `columns` and never re-derived from `result.design` — the design most commands
 *  return still carries the previous state's arrays, and the whole reason this runs is that the map,
 *  not the document, is what the command just moved.
 *
 *  `withFrozenMap` itself moved to the domain in wave 6J-d: `setCabinetDepth` now writes the same
 *  projection onto its own result (ADR 0090 decision 1), and "delete the key when its half is empty"
 *  spelled twice is how one of the two comes to serialise `[]`. Running it again over an identical
 *  map is the same author answering again, not a second one.
 */

/** ADR 0031, ADR 0046 and ADR 0090: a resize, an **insert** and a **depth change** are the three
 *  commands that move a frozen extent, so they are the three whose own answer replaces the map
 *  passed in. Every other command leaves the extents alone and gets `hasFullHeightUnder` re-answered
 *  over them (ADR 0011 Gap D).
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
function resolveColumns(input: PublishedColumnsInput): ResolvedColumns {
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
  //
  // **The free-ground clip joins them, between the two** (ADR 0090 decision 4b). A member-less
  // column standing on ground a placement occupies is dropped whole, and it earns its place in the
  // funnel by the same argument the wall-end clip does: a pass that only ever removes cannot hand
  // the split more work than it already had.
  //
  // **It is a guard with no reachable population, and that is the amended state of the rule.** The
  // first version of this comment said its population was decision 4a's legacy tail — an extent with
  // no recorded source, left on its own coordinate while the run slid out from under it. ADR 0090's
  // Amendment A overturned 4a: a sourceless extent now slides on the chain `FOLLOWS_CABINET_DEPTH`
  // declares, so it lands beside its neighbours rather than under them and there is nothing here to
  // drop. What the guard keeps is the structural statement — no published map places free space on
  // occupied ground — for a producer that does not yet exist, which is the same stance
  // `splitOversizedEmptyColumns` is documented as taking two paragraphs up. That it drops nothing is
  // asserted, and so is the fact that it still can.
  //
  // **And the funnel has two faces, differing by exactly one stage** (ADR 0090 Amendment B). The
  // wall-end cap derives its answer from the **room**, so it may bound what the map publishes and
  // may not rewrite what the document records; every other stage derives from the placements or
  // from a declared ceiling and is in both. Written as two pipelines rather than as a reordering:
  // ADR 0052 caps the merge at 800 mm, so a pair the cap narrows below that ceiling merges where the
  // same pair uncapped declines, and moving the stage would change a published answer.
  const funnelled = (columns: ReadonlyMap<string, ColumnExtent>) =>
    withCurrentFullHeightMembers(
      mergeAdjacentEmptyColumns(
        splitOversizedEmptyColumns(
          clipEmptyColumnsToFreeGround(columns, records),
          records,
        ),
        records,
      ),
      records,
    );
  return {
    recorded: funnelled(published),
    published: funnelled(clipEmptyColumnsAtWallEnd(published, records, room)),
  };
}

/** The two faces of one map: what is offered and drawn, and what is written back to the document. */
interface ResolvedColumns {
  readonly recorded: ReadonlyMap<string, Column>;
  readonly published: ReadonlyMap<string, Column>;
}

interface PublishedColumnsInput {
  readonly effect: CommandEffect;
  readonly frozen: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
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
  if (effect.type === "cabinet_depth_set") return effect.columns;
  return input.frozen;
}

/** **The depth command's own map, and no arm of this module's own** — ADR 0090 decision 5.
 *
 *  ADR 0073's, ADR 0079's and ADR 0080's depth rules stood here until wave 6J-d and now live in
 *  `frozen-map-at-cabinet-depth.ts`. They moved for the reason ADR 0088 decision 2 requires a wave to
 *  state: once wave 6J-c made wall B's run slide, answering them needs the pre-command design, the
 *  catalogue at the depth being left and the shift itself, all three of which `setCabinetDepth` holds
 *  natively and none of which this module is given. Repairing that here would also have put a product
 *  rule in a file whose head comment says none lives here.
 *
 *  What this module keeps is the funnel, the void recompute and the selection.
 */

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
