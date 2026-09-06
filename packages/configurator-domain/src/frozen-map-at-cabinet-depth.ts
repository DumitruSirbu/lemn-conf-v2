// **The whole frozen map at a new cabinet depth, in one place** — ADR 0090 decision 5.
//
// Every rule here was the store's until wave 6J-d, and the arms are unchanged in what they decide:
// ADR 0073 decisions 2 and 3, ADR 0079 decisions 1 and 2, ADR 0080 decision 4. What changed is the
// **package**, and the reason is the inputs rather than taste. Once wave 6J-c made wall B's run
// slide, the depth answer needs the pre-command records keyed at the coordinates the run is
// *arriving* at — which needs the pre-command design, the catalogue at the depth being left, and the
// shift itself. `setCabinetDepth` holds all three natively; the store holds none of them and is
// handed `previousRecords` precisely because it lacks what the command has for free. Keyed the old
// way, `explains` is false for every wall-B column and every one of them falls into ADR 0080's
// surplus arm — a wrong depth, quietly, on the arm the whole 6K-c/6K-j line exists to get right.
//
// **The half-measure is refused by name** (ADR 0090's alternatives): moving only the position axis
// here and leaving the depth axis in the store puts two authors on one map at one seam, which is the
// failure mode this project has recorded three times. ADR 0088 decision 2 exists to stop it.
//
// The map this returns is published on `CabinetDepthSetEffect.columns` and is what
// `setCabinetDepth` projects its own `emptyColumns`/`columnExtents` from, so the command's result is
// self-consistent before any store sees it. The store keeps the funnel, the void recompute and the
// selection.
import {
  alongWallExtentPositionAtMm,
  type AlongWallExtentPositionQuery,
} from "./along-wall-chain-shift.js";
import { columnBuildDepthM } from "./cabinet-depth-rule.js";
import { clipEmptyColumnsToFreeGround } from "./clip-empty-columns-to-free-ground.js";
import type { DesignRoom } from "./design.js";
import { toMetres } from "./millimetres.js";
import { alongWallPosition, deriveColumnKeyAt } from "./module-grid.js";
import {
  deriveCabinetWorldTransform,
  getWallTransform,
} from "./room-transforms.js";
import {
  occupiedDepthOfEntryM,
  type CatalogEntryDepthQuery,
} from "./occupied-depth.js";
import {
  deriveColumns,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
} from "./void-engine.js";

/** Everything the answer depends on, and nothing the caller would have to re-derive.
 *
 *  The three record sets are the point of the interface: `frozen` is the map the design carries at
 *  the coordinates and depths it was loaded at, `records` is what stands there after the command,
 *  and `previousRecords` is what stood there *before* it — **at the new coordinates**, so all three
 *  operands share one key space. */
export interface FrozenMapAtCabinetDepthInput {
  /** The frozen map as the pre-command document records it: ADR 0011 Gap D's extents, at the
   *  coordinates and the depths the design was holding. */
  readonly frozen: ReadonlyMap<string, Column>;
  /** The records the command just wrote — the new depth and the new along-wall coordinates. */
  readonly records: readonly PlacementRecord[];
  /**
   * The same bodies as they stood **before** the command, re-keyed at the coordinates they are
   * arriving at.
   *
   * It answers one question a post-command map cannot: was this frozen extent's depth fully
   * explained by the members standing in it, or is part of it a surplus a delete left behind? A
   * column frozen deeper *by a delete* and one frozen deeper *by the old setting* are
   * indistinguishable from the current members alone, and telling them apart is what lets the
   * setting's own direction be followed without collapsing ADR 0011 Gap D's freed opening.
   *
   * **Re-keyed, and that is not a detail.** These records are looked up by column key beside two
   * maps built at the new coordinates; left at the old ones they would answer for no column at all.
   */
  readonly previousRecords: readonly PlacementRecord[];
  /** **How far each column's members moved along their wall**, by the key that column had before the
   *  command — rung 2 of `alongWallExtentPositionAtMm`'s ladder, and the one rung that is exact.
   *
   *  Built by `alongWallShiftByColumnMm` from the same two derivations the command already has, and
   *  passed in rather than derived here because the pre-command records this module is handed are
   *  keyed at the coordinates they are *arriving* at — which is what the depth rules need and what
   *  this operand cannot be read from. A column with no entry holds no member, which is the question
   *  rung 2 asks. */
  readonly membersShiftMmByColumn: ReadonlyMap<string, number>;
  readonly room: DesignRoom;
  /** The catalogue at the depth the command wrote: ADR 0073 decision 2 re-answers a frozen extent by
   *  asking the body it recorded for its declared `occupiedDepth` in **this** map. */
  readonly catalog: BodyCatalog;
  /** The design's own declared cabinet depth after the command, for the one operand `catalog` cannot
   *  supply: ADR 0073 decision 3's `columnBuildDepthM` fallback, for an extent whose source is absent
   *  or unknown. */
  readonly cabinetDepthMm: number;
  /** The same setting as the design declared it **before** this command — the one thing that
   *  separates an unsourced depth this rule itself published one setting ago from one no rule could
   *  have produced (ADR 0080 decision 4). The two differ by 70 mm on a wall opening. */
  readonly previousCabinetDepthMm: number;
}

/** The frozen map the depth change publishes: every extent slid onto the chain the body it recorded
 *  declares, every depth re-answered at the new setting, and no member-less column left standing on
 *  ground a placement occupies.
 *
 *  Three passes in one order that matters. The slide runs **first**, because both of the others are
 *  keyed on the along-wall coordinate: the depth rules look their two operands up by column key, and
 *  the free-ground clip compares an extent's interval against a body's. */
export function frozenMapAtCabinetDepth(
  input: FrozenMapAtCabinetDepthInput,
): ReadonlyMap<string, Column> {
  return clipEmptyColumnsToFreeGround(
    atCurrentCabinetDepth(frozenExtentsSlidAlongTheWall(input), input),
    input.records,
  );
}

/** The five operands the slide reads, and none of the ones only the depth rules need.
 *
 *  **Narrower than `FrozenMapAtCabinetDepthInput` on purpose**, because wave 6K-i's planning map is
 *  built *before* the rebuild and so has no post-command records to offer. `FrozenMapAtCabinetDepthInput`
 *  satisfies it structurally, which is what lets the republished map keep passing itself. */
export interface FrozenExtentsSlideQuery {
  readonly frozen: ReadonlyMap<string, Column>;
  readonly catalog: BodyCatalog;
  readonly cabinetDepthMm: number;
  readonly previousCabinetDepthMm: number;
  readonly membersShiftMmByColumn: ReadonlyMap<string, number>;
}

/** ADR 0090 decisions 1 and 2: every positioned fact in the map moved onto the chain the body it
 *  recorded declares, in the command that moves the run.
 *
 *  **One ladder for both halves of the map** — `emptyColumns` and `columnExtents` alike — ordered by
 *  how much the document knows: an occupied extent moves by the delta its own members moved, a
 *  member-less one by the chain its recorded source declares, and one with neither by the chain
 *  `FOLLOWS_CABINET_DEPTH` declares. The first rung makes decision 2's claim — that an occupied
 *  extent lands exactly where its own members land — the derivation rather than a coincidence to be
 *  checked, which is what lets the last rung be a bare declaration.
 *
 *  Only the along-wall coordinate and the key move. The width, the floor, the top, the regions and
 *  the depth are ADR 0011 Gap D's frozen extent and are carried across untouched — this re-derives
 *  nothing from what stands in the column, which is the amendment ADR 0090 decision 6 makes to
 *  ADR 0088 decision 1.
 *
 *  **Exported because wave 6K-i's planning map is built from the same moved extents.** ADR 0090
 *  decision 6 says the planning map takes the extents *as decision 2 moves them*; restoring them at
 *  the coordinates the run is leaving while the placements plan at the ones it is arriving at is the
 *  same defect one seam earlier, inside `evaluateInsertFit`. One author, because a second copy of
 *  the ladder is what ADR 0088 decision 2 exists to prevent. */
export function frozenExtentsSlidAlongTheWall(
  input: FrozenExtentsSlideQuery,
): ReadonlyMap<string, Column> {
  const slid = new Map<string, Column>();
  for (const column of input.frozen.values()) {
    const moved = atAlongWallPosition(column, alongWallQueryFor(column, input));
    slid.set(moved.key, moved);
  }
  return slid;
}

function alongWallQueryFor(
  extent: Column,
  input: FrozenExtentsSlideQuery,
): AlongWallExtentPositionQuery {
  return {
    extent,
    catalog: input.catalog,
    fromCabinetDepthMm: input.previousCabinetDepthMm,
    toCabinetDepthMm: input.cabinetDepthMm,
    membersShiftMm: input.membersShiftMmByColumn.get(extent.key),
  };
}

/** One column at its new along-wall coordinate, or the column itself when the chain declines to move
 *  it. The off-wall coordinate is the column's own half-depth and stays exactly where it was — the
 *  same split `toClippedExtent` makes, through the same `alongWallPosition`, so §2's wall convention
 *  has one author. */
function atAlongWallPosition(
  column: Column,
  query: AlongWallExtentPositionQuery,
): Column {
  const alongMm = alongWallExtentPositionAtMm(query);
  if (alongMm === undefined) return column;
  const alongM = toMetres(alongMm);
  const key = deriveColumnKeyAt(column.wall, alongM);
  if (key === column.key) return column;
  return { ...column, key, ...alongWallPosition(column.wall, alongM) };
}

/** **A frozen extent may be carried forward across every command except this one, and the reason is
 *  the axis rather than the command.**
 *
 *  **Its sibling is `deriveColumnsOverFrozenExtents`, and the two are not one author** (ADR 0088
 *  decision 2, answered by wave 6K-i). They share the axis split's first half exactly — the vertical
 *  and along-wall axes are carried, and the along-wall move has one author in
 *  `frozenExtentsSlidAlongTheWall` above. They differ on the depth axis because they are asked
 *  different questions. The **planning** map is what a rebuilt body is fitted into, so its depth must
 *  be §3.2's MAX over what actually stands there at the new setting and nothing more — ADR 0088
 *  decision 3 makes that value-identical to `deriveColumns(records, {}, room)`, key for key. The
 *  **published** map is what the document then records, so a surplus a delete left behind is the
 *  customer's and survives here (ADR 0073, ADR 0079, ADR 0080). Merging them would put a surplus into
 *  a slot a body is about to be built into.
 *
 *  ADR 0011 Gap D freezes a column's extent so a delete frees space instead of shrinking the run to
 *  what is left. That argument is about the **along-wall and vertical** axes — the width a partial
 *  delete left behind is the customer's, and nothing can re-derive it. It says nothing about depth,
 *  which is §3.2's MAX over the members' `occupiedDepthM` and is a pure function of the bodies
 *  standing there. A depth change rebuilds every one of those bodies, so carried forward unchanged
 *  the map describes the run at the depth the session **opened** at: the geometry, the openings
 *  `recomputeVoids` derives from it, and — because `projectFrozenMap` writes this map into
 *  `columnExtents` — the document that is then saved and reloaded.
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
 *  **The surplus half follows the setting too, since wave 6K-c.** The surplus is a depth some body
 *  supplied and the extent now records which one ([ADR 0073](../../../docs/decisions/0073-a-frozen-extent-records-the-body-its-depth-came-from.md)
 *  decision 1), so instead of carrying the frozen number forward it is re-asked in the catalogue
 *  built at the new depth — see `frozenDepthAtThisSetting`. Guessing it was what could not be done;
 *  reading a recorded declaration is not a guess.
 *
 *  **And it publishes a depth and a source together, never a depth alone**
 *  ([ADR 0079](../../../docs/decisions/0079-a-republished-depth-names-the-body-it-came-from.md)
 *  decision 1). This was the one writer in the product that could part them: it took the winner's
 *  depth and carried the *old* `depthFromBuildId` across untouched, so one ordinary depth change on
 *  the shipped fixture recorded a pinned top as the source of a 699 mm pantry — correct depth, false
 *  record — and the record is what answers once the pantry is deleted. QA measured 99 mm lost four
 *  commands later, saved and reloaded. */
function atCurrentCabinetDepth(
  slid: ReadonlyMap<string, Column>,
  input: FrozenMapAtCabinetDepthInput,
): ReadonlyMap<string, Column> {
  // No stored half on either call: these two maps are only ever read for the depth their **members**
  // imply, and restoring the frozen entries into them would answer with the very numbers being
  // re-measured.
  const atNewDepth = deriveColumns(input.records, {}, input.room);
  const atOldDepth = deriveColumns(input.previousRecords, {}, input.room);
  // **The columns the records imply, with the frozen extents restored over them** — `deriveColumns`'
  // own ordering at the load seam (ADR 0044 and ADR 0053), and the reason this is not merely a copy
  // of the frozen map: an extent the ladder declines to move is no longer its column's extent once
  // the members have slid away, and a map built from the frozen keys alone would file those members
  // under no column at all. That is the head of the whole defect, arriving one arm over.
  //
  // The overlay is total on any document whose extents the ladder can place — every occupied key is
  // in the frozen map and lands on its members' new key by rung 2 — so this base normally
  // contributes nothing and the map is the frozen one exactly.
  const republished = new Map([...atNewDepth, ...slid]);
  for (const [key, column] of slid) {
    const published = republishedDepth({
      frozen: frozenDepthAtThisSetting({ column, input }),
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
 *  module hands one of these over, so a seam that publishes a depth without saying where it came
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
  readonly input: FrozenMapAtCabinetDepthInput;
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
 *  column. Its **coordinate** is answered by the last rung of `alongWallExtentPositionAtMm`'s ladder
 *  rather than by its depth, so it slides with its neighbours even though its depth cannot be
 *  re-derived (ADR 0090 Amendment A).
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
    cabinetDepthMm: query.input.cabinetDepthMm,
    hasFullHeightUnder,
  });
  const atFreezeM = columnBuildDepthM({
    cabinetDepthMm: query.input.previousCabinetDepthMm,
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
  const definition = query.input.catalog.get(buildId);
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
 *  wall A and the normal one on wall B, and a module that picked the axis itself would be a second
 *  author for §2's wall convention. The along-wall coordinate is projected back out with the same
 *  wall's tangent, which is what stops a widened extent from snapping to its members' centre — and
 *  it is the coordinate `frozenExtentsSlidAlongTheWall` has already moved this column to.
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

/** The column's own floor, which the transform validates as non-negative and then uses only for a
 *  `y` this shape does not carry. Read off `regions` rather than passed as zero so the value handed
 *  to the domain is the column's real one. A column with no region at all reaches neither
 *  `deriveColumns` nor a restored extent; `0` keeps this total rather than handing the transform the
 *  infinity an empty `Math.min` produces, which it would reject. */
function columnFloorM(column: Column): number {
  const floorsM = column.regions.map(([floorM]) => floorM);
  return floorsM.length > 0 ? Math.min(...floorsM) : 0;
}

/** A `Column` under construction. `Column`'s own fields are `readonly` — they are, correctly, a
 *  frozen extent — and this is the one place a field has to be **removed** rather than overwritten,
 *  which no spread can express. */
type MutableColumn = { -readonly [Field in keyof Column]: Column[Field] };
