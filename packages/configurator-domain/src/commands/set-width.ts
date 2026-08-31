// ADR 0031 — a resize moves a **whole column**, and adjacent **empty space** funds it.
//
// This supersedes `DEVELOPMENT-SPEC.md` §5.4's donor rule in full. §5.4 took the whole delta from a
// neighbouring cabinet in the same row; that rule shipped, and produced two reachable resizes in the
// entire kitchen, because the donor's residue had to land on a legal width of its own. Every defect
// it needed patching for is downstream of a resize **shrinking a cabinet nobody selected**.
//
// So there is no donor. Selecting any body resizes every member of its column, at every level, and
// the width comes from an empty column immediately left or right on the same wall: growing narrows
// it, shrinking widens it, and the run total is conserved either way.
//
// Every member's centre moves by the same amount, which is exactly why the rule fits §3.2's model —
// no body leaves the column it is in, so the only column identity that moves is the whole column's
// and the empty one's. See `rederiveTouchedColumns` in `void-engine.ts` for that half.
//
// ADR 0035 amends that rule in two places, both of them here.
//
// **Decision 6 — a column is one width at every level, except the hood.** A column whose members
// stand at different widths used to refuse; it is now *squared up*, every member brought to the
// requested width. The hood is exempt in both directions: it is sized to the cooktop it extracts
// over rather than to the run it hangs on, so it neither narrows the column's widths nor takes
// the new one — it keeps its own and re-centres over the run beneath it (ADR 0039 decision 4). It
// stays an ordinary placement in its column while doing so; the exemption is from the width rule,
// not from the model, and it is keyed off `EXTRACTOR_HOOD_KIND` rather than off any of the
// standalone-accessory machinery ADR 0038 deleted.
//
// **Decision 7 — shrinking creates the empty space it needs.** ADR 0031 required an empty column to
// already be there in both directions, whose recorded consequence was that nothing in the shipped
// kitchen is resizable until something is deleted. A shrink now enters a new empty column at the
// extent it vacates, so a customer can narrow one column and widen its neighbour afterwards.
import {
  resolveBuildableSizes,
  resolveWidthRangesMm,
} from "../catalog.js";
import type { Design, DesignPlacement } from "../design.js";
import {
  derivePlacementRecords,
  rederiveTouchedColumns,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type WidthRangeMm,
} from "../void-engine.js";
import {
  frozenColumnKey,
  moveFrozenColumns,
  planMoves,
} from "./apply-column-moves.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  type BodyResizedEffect,
  type CommandTarget,
} from "./command-result.js";
import { fundingScan, refuseNoSideFunds } from "./plan-width-funding.js";
import { moveHood, rebuild } from "./rebuild-resized-bodies.js";
import type { EmptySpaceSide, RejectionDetail } from "./rejection.js";
import {
  describeRecordLabel,
  isHood,
  resolveResizableBody,
  splitColumnMembers,
  toColumnMember,
} from "./resolve-column-members.js";
import {
  intersectColumnRanges,
  intersectColumnWidths,
  refuseIllegalWidth,
  resolveColumnExtent,
} from "./resolve-column-width.js";
import {
  bodiesUnderOpenings,
  opensAnOpeningOverABody,
  refuseColumnDrift,
  type OverlapSet,
} from "./validate-width-result.js";
import type {
  ColumnPlan,
  ColumnResize,
  Resolved,
  SetWidthInput,
  SetWidthResult,
} from "./width-resize-model.js";

export type { SetWidthInput } from "./width-resize-model.js";

/** What `columnWidthCandidatesMm` needs, and deliberately less than `setWidth`: no width, no probe
 *  and no timestamp. Asking which widths exist builds nothing, so it cannot fail on a measurement
 *  and has nothing to stamp — and it never reads the frozen column map either, because a column's
 *  legal widths come from its members' catalogue rows rather than from its extent. */
export interface ColumnWidthChoicesInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
}

export interface ColumnWidthChoices {
  /** The width §9's `active` chip sits on, and the number its value label reads. */
  readonly currentWidthMm: number;
  /** Ascending, duplicate-free, and never empty — see `columnWidthChoices`. */
  readonly sizesMm: readonly number[];
  /** What the column may be **built** within, as ADR 0035 decision 3's discriminator: a range with
   *  `minMm < maxMm` means a stepper, every range a single width means a discrete choice.
   *
   *  Published because §9 was otherwise **inferring** it — reading two widths 50 apart out of
   *  `sizesMm` and concluding the column was stepped. That is the shape of defect ADR 0022 records
   *  (inferring identity priced a fridge housing as a pantry) and the one ADR 0035 decision 3 had to
   *  be corrected for (`fixedWidth` is `false` on both discrete rows). The panel now reads the fact
   *  the engine already computed. */
  readonly widthRangesMm: readonly WidthRangeMm[];
}

export function setWidth(input: SetWidthInput): SetWidthResult {
  const { design } = input;
  if (input.target.kind === "void") {
    return refuse(design, { code: "VOID_SELECTED", params: {} });
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(design, { code: "INVALID_OCCURRED_AT", params: {} });
  }

  const records = derivePlacementRecords(design, input.catalog);
  const record = records.find((candidate) => candidate.id === input.target.id);
  if (!record) {
    return refuse(design, { code: "TARGET_NOT_FOUND", params: {} });
  }

  const plan = planColumnResize(input, records, record);
  if (!plan.ok) return refuse(design, plan.detail);
  return fundColumnResize(input, records, record, plan.value);
}

/** What §9's width section may render for this selection: the widths to offer a chip for, and the
 *  one the `active` chip sits on.
 *
 *  **The column's widths, not the selected body's** (ADR 0031 rule 1, and the over/under-offer this
 *  closes). `describeSelection` answers per body, because `meta` is a projection of one placement and
 *  knows nothing about what stands above or below it. ADR 0031 decides per column, so a panel that
 *  rendered `meta.sizesMm` offered widths the column refuses and hid widths it accepts — the same
 *  "two code paths answer one question" shape ADRs 0016, 0017 and 0029 each caught. The list comes
 *  from `intersectColumnWidths`, the very function `setWidth` narrows against.
 *
 *  This publishes **candidates only**. Whether any one of them is a legal move is `setWidth`'s
 *  answer and nobody else's — see `queries/width-options.ts`, which asks it by running the command.
 *  So a column that cannot be resized at all still produces chips: they are rendered disabled with
 *  the engine's own reason, which is ADR 0032's rule applied to the width section.
 *
 *  **A column that cannot agree on a width still renders chips**, whichever way it fails to agree:
 *  a member that cannot be rebuilt at all, or members whose sets do not intersect. Both fall back to
 *  the selected body's own set, and every chip carries the command's own reason — the customer sees
 *  the widths their cabinet is made in and what is standing in the way of each. The **selected**
 *  body resolving no set is the one different answer — `undefined`, no section — because that is
 *  missing catalogue data rather than a fact about the column, and §9 does not offer a width control
 *  on a body with no width to change.
 *
 *  `undefined` where there is **nothing to choose from**, and that answer is load-bearing (FINDING
 *  R2.7): a body that resolves no set at all — a row whose `catalogEquivalentId` points nowhere,
 *  an entry whose declared floor excludes every member — gets
 *  no width section rather than a chipless one, so missing catalogue data fails loudly. The current
 *  width is folded into a set that exists; it never conjures one.
 *
 *  `currentWidthMm` is the **selected body's** width, and it is read here rather than inferred from
 *  a refusal code. §9 assumes exactly one `active` chip and puts the same number in the section's
 *  value label, so the `active` chip cannot be contingent on how far `setWidth` gets before it
 *  refuses — a column with an immovable member refuses every width, including the one it is
 *  standing at, and the section would then have no active chip at all.
 *
 *  A `widthFlex: 'fit'` body built to its opening can sit at a width no set contains — a
 *  `wall-2door` in a 700 mm opening — which is why it joins the list rather than being assumed to
 *  be in it. */
export function columnWidthChoices(
  input: ColumnWidthChoicesInput,
): ColumnWidthChoices | undefined {
  if (input.target.kind === "void") return undefined;
  const records = derivePlacementRecords(input.design, input.catalog);
  const record = records.find((candidate) => candidate.id === input.target.id);
  if (!record) return undefined;

  // §9's `canWidth` read from the engine's end, and the same call `setWidth` opens with: a
  // `fixedWidth` entry is made at one size, and a body with no §7 equivalent has nothing to be
  // rebuilt through. Asked here so the answer has one author — a
  // `fixedWidth` body still resolves a perfectly good set, and publishing chips for it would leave
  // §9's flag as the only thing standing between the customer and a section of dead controls.
  const selectedBody = resolveResizableBody(input.catalog, record);
  if (!selectedBody.ok) return undefined;
  const selected = toColumnMember(input.design, record, selectedBody.value);
  if (!selected) return undefined;

  // The selected body's own set is the floor of what may be rendered, and the **only** thing whose
  // absence suppresses the section (FINDING R2.7). Resolved before the column, because everything
  // below is a narrowing of it.
  const declared = resolveBuildableSizes(input.catalog, record.buildId);
  if (declared.length === 0) return undefined;

  // The **hood-exempt** membership, exactly as `setWidth` computes it (ADR 0035 decision 6): a hood
  // standing in this column narrows nothing, and a column that holds one is no longer a column that
  // cannot agree on a width.
  const split = splitColumnMembers(
    {
      design: input.design,
      catalog: input.catalog,
      records,
      label: describeRecordLabel(input.catalog, record),
    },
    selected,
  );
  const intersected = split.ok
    ? intersectColumnWidths(input.catalog, split.value)
    : [];
  const intersectedRanges = split.ok ? intersectColumnRanges(split.value) : [];
  // **An empty intersection is not "no set" — it is a fact about the column, and ADR 0032 says a
  // fact about why this opening refuses gets rendered rather than dropped** (logic review L2).
  //
  // Two ways a column can fail to agree on a width, and they used to answer differently. A column
  // holding an *unresizable* member fell back here and rendered the body's own widths, each blocked
  // with `COLUMN_MEMBER_NOT_RESIZABLE` — which is right. A column whose members are all resizable
  // but whose sets are **disjoint** returned `undefined`: no section, no sentence, and a
  // `WIDTH_NOT_SUPPORTED` the engine had already computed thrown away. It used to be reachable in
  // two inserts — a `base-bottle-cargo` (200/300) under a `hood` (600–800) — and it is reachable
  // again: decision 6 took the hood out of the membership, and its 2026-08-29 amendment put it back
  // as a **floor**, so a 600 mm hood over a 200/300 cargo agrees on nothing.
  //
  // So both fall back to the same place. What suppresses a section is missing catalogue data about
  // the body itself, never a disagreement between bodies.
  const candidates = intersected.length > 0 ? intersected : declared;

  return {
    currentWidthMm: record.widthMm,
    sizesMm: [...new Set([...candidates, record.widthMm])].sort(
      (left, right) => left - right,
    ),
    // **The same fallback the widths take, on the same condition.** They were conditioned
    // differently for one commit — the widths fell back on an empty intersection, the ranges on
    // `!split.ok` — and a column can satisfy the second without the first. Measured on three taps
    // from the shipped kitchen (delete `p2`, insert a bottle cargo under the hood, select `p19`):
    // thirteen widths and no ranges, so §9 read "this column is a set", rendered a chip row, and put
    // **twelve identical dashed chips** on screen carrying one sentence — the exact shape ADR 0032's
    // arrangement and this wave's stepper exist to remove.
    widthRangesMm:
      intersectedRanges.length > 0
        ? intersectedRanges
        : resolveWidthRangesMm(selectedBody.value),
  };
}

/** Everything ADR 0031 decides about the **column**, before anything is built and before a side is
 *  chosen: the selected body has a width to change, every member of its column can be rebuilt, and
 *  the requested width is in the intersection of their sets. **Flushness is not among them** — it
 *  was, and ADR 0035 decision 6 retired it: a mixed column is squared up rather than refused. Which side funds the move
 *  is `fundColumnResize`'s question, and it is a separate one (FINDING Q1.2). */
function planColumnResize(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  record: PlacementRecord,
): Resolved<ColumnPlan> {
  const selected = resolveResizableBody(input.catalog, record);
  if (!selected.ok) return selected;
  const label = selected.value.label;

  const column = input.columns.get(record.col);
  if (!column) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label } },
    };
  }

  const member = toColumnMember(input.design, record, selected.value);
  if (!member) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label } },
    };
  }

  const split = splitColumnMembers(
    { design: input.design, catalog: input.catalog, records, label },
    member,
  );
  if (!split.ok) return split;
  const { members, hoods } = split.value;

  const extent = resolveColumnExtent(members);
  const illegal = refuseIllegalWidth(input, label, split.value, extent);
  if (illegal) return { ok: false, detail: illegal };

  return { ok: true, value: { label, column, members, hoods, extent } };
}

/** ADR 0031 rule 2, and **the phantom test is part of it** (FINDING Q1.2).
 *
 *  It used to pick the first side that funded the move on geometry and the `MIN_W` floor alone, and
 *  run the phantom check once afterwards, on the side already chosen. There was no fallback, so
 *  a side that would have worked was never tried — and *making more space available made a
 *  previously legal move illegal*: with only the left column empty, narrowing `A|0.75` to 200 is
 *  accepted; clear the right one **as well** and the scan takes the right, widens it to 900 mm over
 *  the corner leg `p25`, and refuses. Whether a side can fund the move is one question, and an
 *  opening landing on a body is one of the ways the answer is no.
 *
 *  So each side is carried all the way through the rebuild, and a phantom sends the scan on to the
 *  other side exactly as the superseded donor scan fell through. At most two attempts; the probe is
 *  called again for the second, which is the price of answering the question properly.
 *
 *  Anything else a rebuild refuses — a built-size mismatch, an unmeasurable body, a drifted column —
 *  returns immediately. Those are facts about the bodies and the width, identical on both sides, and
 *  retrying would only produce the same refusal with a different neighbour named. */
function fundColumnResize(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  record: PlacementRecord,
  plan: ColumnPlan,
): SetWidthResult {
  // Measured once, before anything moves: the bodies §4 already derives an opening on top of. A
  // resize is answerable for the overlaps it creates and for no others (logic review R1.7).
  // ADR 0035 decision 6: this column's own hoods overhang by design, so they are exempt from the
  // phantom-opening comparison — and only they are (QA Q2).
  const exemptHoodIds = new Set(plan.hoods.map((hood) => hood.record.id));
  const covered = bodiesUnderOpenings(records, input.columns, exemptHoodIds);
  const refusedSides: EmptySpaceSide[] = [];
  for (const { side, space } of fundingScan(input, records, plan)) {
    if (!space.ok) {
      refusedSides.push({ side, reason: space.reason });
      continue;
    }
    const move = planMoves(input, plan, space.value);
    if (!move.ok) {
      // **A key collision is a fact about this side, not about the move** — the resized column's new
      // centre depends on which edge is held, so a key taken when the right side funds it may be
      // free when the left does. It therefore falls through to the other side exactly as
      // `opens_a_gap` does (FINDING Q1.2's argument, and 5D2b's implementer caught that the first
      // version of this guard ended the scan instead). Every other planning failure is a fact about
      // the arithmetic and ends it.
      if (move.detail.code !== "COLUMN_KEY_COLLISION") {
        return refuse(input.design, move.detail);
      }
      refusedSides.push({ side, reason: "key_taken" });
      continue;
    }

    const attempt = applyColumnResize(
      { input, records, record, covered, exemptHoodIds },
      move.value,
    );
    if (attempt.outcome === "ok") return attempt.result;
    if (attempt.outcome === "refused") {
      return refuse(input.design, attempt.detail);
    }
    refusedSides.push({ side, reason: "opens_a_gap" });
  }
  return refuse(input.design, refuseNoSideFunds(input, plan, refusedSides));
}

/** What one attempt needs that is the same for both sides: the request, the records it started
 *  from, the selected placement, and the overlaps that were already there before anything moved. */
interface AttemptContext {
  readonly input: SetWidthInput;
  readonly records: readonly PlacementRecord[];
  readonly record: PlacementRecord;
  readonly covered: OverlapSet;
  /** This column's own hoods, exempt from the phantom-opening comparison because they overhang by
   *  design (ADR 0035 decision 6). Carried rather than re-derived so the *before* and *after* sets
   *  exempt the same bodies — QA Q2 is what happens when the exemption is a rule about the world
   *  instead of about this move. */
  readonly exemptHoodIds: ReadonlySet<string>;
}

/** One side's move, carried all the way through the rebuild. `opens_a_gap` is not a refusal yet —
 *  it sends the scan to the other side (FINDING Q1.2) — while `refused` is a fact about the bodies
 *  and the width that the other side would answer identically. */
type ColumnResizeAttempt =
  | { readonly outcome: "ok"; readonly result: SetWidthResult }
  | { readonly outcome: "opens_a_gap" }
  | { readonly outcome: "refused"; readonly detail: RejectionDetail };

/** Rebuild every member of the column, write them into the design, then update the two column keys
 *  the move touched. Nothing is written unless **every** rebuild passes every guard `insertBody`
 *  applies — §9's "refuse before offering, never after the tap" is only true of a resize if the
 *  whole column is atomic. */
function applyColumnResize(
  attempt: AttemptContext,
  move: ColumnResize,
): ColumnResizeAttempt {
  const { input, records, record } = attempt;
  const rebuilt = new Map<string, DesignPlacement>();
  for (const plan of move.members) {
    // The **selected** hood is not exempt from anything: selecting it is a full column resize, the
    // path this wave deliberately left as it was. Only a hood carried along by its neighbours' move
    // is moved rather than rebuilt.
    const built =
      isHood(plan.record) && plan.record.id !== record.id
        ? moveHood(input, plan)
        : rebuild(input, records, plan);
    if (!built.ok) return { outcome: "refused", detail: built.detail };
    rebuilt.set(built.value.id, built.value);
  }

  const design = withPlacements(
    input.design,
    input.design.placements.map(
      (placement) => rebuilt.get(placement.id) ?? placement,
    ),
    input.occurredAt,
  );

  const moved = derivePlacementRecords(design, input.catalog);
  const columns = moveFrozenColumns(
    rederiveTouchedColumns(input.columns, records, moved),
    move,
    moved,
  );
  const drift = refuseColumnDrift(columns, moved, rebuilt, move.label);
  if (drift) return { outcome: "refused", detail: drift };
  if (
    opensAnOpeningOverABody(
      attempt.covered,
      moved,
      columns,
      attempt.exemptHoodIds,
    )
  ) {
    return { outcome: "opens_a_gap" };
  }

  return {
    outcome: "ok",
    result: succeedWith(design, resizedEffect(record, move, rebuilt, columns)),
  };
}

function resizedEffect(
  record: PlacementRecord,
  move: ColumnResize,
  rebuilt: ReadonlyMap<string, DesignPlacement>,
  columns: ReadonlyMap<string, Column>,
): BodyResizedEffect {
  const selected = rebuilt.get(record.id);
  return {
    type: "body_resized",
    placementId: record.id,
    buildId: selected?.body.buildId ?? record.buildId,
    widthMm: move.widthMm,
    columnPlacementIds: move.members.map((member) => member.record.id),
    emptyColumnKey: move.empty.column.key,
    ...(move.empty.widthMm > 0
      ? { emptyColumnNewKey: frozenColumnKey(move.empty) }
      : {}),
    emptyColumnWidthMm: move.empty.widthMm,
    columns,
  };
}
