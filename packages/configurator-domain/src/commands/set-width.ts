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
import type { BodyProbe } from "../body-probe.js";
import {
  acceptsWidthMm,
  EXTRACTOR_HOOD_KIND,
  resolveBuildableSizes,
  resolveCatalogEquivalent,
  resolveWidthRangesMm,
  toInsertableBody,
  type InsertableBody,
} from "../catalog.js";
import type { Design, DesignPlacement, DesignWall } from "../design.js";
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMetres,
  toMillimetres,
} from "../millimetres.js";
import {
  deriveColumnKeyAt,
  withCurrentFullHeightMembers,
  derivePlacementRecords,
  recomputeVoids,
  rederiveTouchedColumns,
  MIN_WIDTH_M,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
  type WidthRangeMm,
} from "../void-engine.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  type BodyResizedEffect,
  type CommandResult,
  type CommandTarget,
} from "./command-result.js";
import {
  carriedAppearance,
  refuseBuiltSize,
  refuseUnusableMeasurement,
} from "./insert-body.js";
import { evaluateInsertFit, openingFromPlacement } from "./insert-fit.js";
import type {
  EmptySpaceRefusal,
  EmptySpaceSide,
  RejectionDetail,
} from "./rejection.js";

/** How close the funding column's facing edge must be to the resized run's, to count as **abutting**
 *  it. Float noise and nothing more (logic review R1.8).
 *
 *  §5.4 used `< 0.03` here, and that 30 mm was right for the question §5.4 asked — "do these two
 *  runs meet", answered only to *pick* a donor. ADR 0031 asks it of a column whose far edge is then
 *  **held** while the boundary between the two moves, so a candidate 29 mm away is not a neighbour
 *  the arithmetic can use: the new extents overlap by 29 mm, or leave a 29 mm strip belonging to no
 *  column at all. The second is worse than the first, because §4 derives no void for a gap between
 *  two frozen extents — ADR 0031 says so itself — so the strip would be invisible.
 *
 *  Folding the measured offset into the delta was the alternative and is rejected: it would move a
 *  boundary the customer did not ask to move, and leave the column at a width other than the one
 *  they tapped. Requiring the runs to actually meet keeps the resize the operation it claims to be.
 *
 *  The two edges are computed from different sources — the run's from its placements' integer
 *  millimetres, the empty column's from the frozen map's metres — so they are compared with a micron
 *  rather than with `===`. That is four orders of magnitude below any gap a design can hold and
 *  eight above the millimetre↔metre round-trip error. */
const EDGE_ABUTMENT_TOLERANCE_M = 1e-6;

/** §2's `MIN_W` in millimetres — the floor the **empty column** is measured against (ADR 0031). */
const MIN_WIDTH_MM = toMillimetres(MIN_WIDTH_M);

/** Right is tried first and left only if right cannot fund the move, so the same design always
 *  resizes the same way. An order, not a set. */
const EMPTY_SPACE_ORDER: readonly Side[] = ["right", "left"];

/** Float noise from the millimetre↔metre round trip, for the one comparison that must distinguish
 *  "these two runs touch" from "this opening lies over that body". Touching is not overlapping. */
const OVERLAP_EPSILON_M = 1e-6;

type Side = EmptySpaceSide["side"];

export interface SetWidthInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D: the frozen load-time extents. This command is the only one that may return a
   *  changed map, and it changes only the resized column's keys and the empty column's. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly target: CommandTarget;
  readonly widthMm: number;
  readonly probe: BodyProbe;
  readonly occurredAt: string;
}

type SetWidthResult = CommandResult<BodyResizedEffect>;

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

type Resolved<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** One member of the column, resolved to the §7 entry it will be rebuilt through and to the two
 *  integers its extent is read from.
 *
 *  `alongMm` and `widthMm` come from the **stored placement** rather than from the derived frame or
 *  from `Column.w`: those are the integers the document holds, `Column.w` is the MIN over members
 *  and can be stale after a delete, and a metre round trip would put a half-nanometre into a
 *  coordinate that must stay exact. */
interface ColumnMember {
  readonly record: PlacementRecord;
  readonly body: InsertableBody;
  readonly alongMm: number;
  readonly widthMm: number;
}

/** A column split by ADR 0035 decision 6: the bodies the column's width governs, and the hoods it
 *  does not. `members` is non-empty by construction — the selected body is always one of them. */
interface ColumnUnit {
  readonly members: readonly [ColumnMember, ...ColumnMember[]];
  readonly hoods: readonly ColumnMember[];
}

/** What resolving a column's membership needs, and all it needs: the design the integers are read
 *  from, the catalogue the entries resolve through, the records the column is filtered out of, and
 *  the selected body's label, which every refusal is phrased in terms of. */
interface ColumnContext {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly label: string;
}

/** One body about to be rebuilt: the same `ColumnMember`, with `alongMm` and `widthMm` moved from
 *  the values it is standing at to the ones it is going to.
 *
 *  Under ADR 0031 every member of the column carries the **same** `alongMm`, and under ADR 0035
 *  decision 6 every member the column's width governs carries the **same** `widthMm` — that is what
 *  squaring up is. A hood is the exception on the second half only: it takes the new centre and
 *  keeps the width it had. */
type Rebuild = ColumnMember;

/** A run's extent along its wall, in the integer millimetres the document holds. */
interface ExtentMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

/** The empty column that funds the move, before the move is planned. */
interface EmptySpace {
  readonly column: Column;
  readonly side: Side;
  readonly extent: ExtentMm;
  /** What is left of it afterwards. `0` is legal and removes the column (ADR 0031 rule 6). */
  readonly remainderMm: number;
}

/** A frozen column moved to a new width and a new along-wall centre. **Both** columns a resize
 *  touches get one: the run being resized and the empty one funding it.
 *
 *  Both need it for the same reason (FINDING Q1.1). ADR 0011 Gap D freezes a column's `regions`,
 *  `top`, `d` and `ry` because a cleared run must keep the opening it just freed, and
 *  `rederiveTouchedColumns` answers a key from the members **left** under it — so a column that had
 *  a member deleted earlier in the session loses that member's region the moment a resize re-derives
 *  it, and the opening the customer freed vanishes with no void and no way back. The resize is not
 *  a delete: it moves the boundary of the space a run occupies, so `w`, the centre and the key move
 *  and nothing else does.
 *
 *  `widthMm === 0` means the resize consumed the space exactly, and the key is removed (rule 6).
 *  Only the empty column can reach zero. */
interface FrozenColumnMove {
  readonly column: Column;
  readonly widthMm: number;
  readonly centreMm: number;
}

interface ColumnResize {
  readonly label: string;
  /** The width the column was squared up to. Read from here rather than off the first `Rebuild`,
   *  because that list also carries the hoods, which keep widths of their own. */
  readonly widthMm: number;
  readonly members: readonly Rebuild[];
  readonly resized: FrozenColumnMove;
  readonly empty: FrozenColumnMove;
  readonly side: Side;
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

/** Everything ADR 0031 decides **before** it knows which side will fund the move: the column, its
 *  members, its extent, and that the requested width is legal for all of them.
 *
 *  `members` are the bodies the column's width governs; `hoods` are the ones it does not (ADR 0035
 *  decision 6 as amended). Only `members` narrow the width, only `members` set the extent, and both
 *  lists are rebuilt — a hood at its own width and the run's new centre. */
interface ColumnPlan {
  readonly label: string;
  readonly column: Column;
  readonly members: readonly [ColumnMember, ...ColumnMember[]];
  readonly hoods: readonly ColumnMember[];
  readonly extent: ExtentMm;
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

/** §9's `canWidth` read from the engine's end, for the body the customer actually selected: a
 *  `fixedWidth` entry is made at one size, and a body with no §7 equivalent (the corners, ADR 0011
 *  Gap A) has nothing to be rebuilt through.
 *
 *  **Identity is declared, never inferred.** The equivalent comes from `resolveCatalogEquivalent`,
 *  which reads the pointer the row declares (ADR 0022) and verifies it is `insertable`. §5.4's
 *  `buildIdOf` mesh-tree inspection is closed by name in ADR 0011 Gap A, §6.3 and §13.2. */
function resolveResizableBody(
  catalog: BodyCatalog,
  record: PlacementRecord,
): Resolved<InsertableBody> {
  const body = resolveRebuildBody(catalog, record);
  if (body && !record.fixedWidth) {
    return { ok: true, value: body };
  }
  return {
    ok: false,
    detail: {
      code: "NOT_RESIZABLE",
      params: { label: body?.label ?? describeRecordLabel(catalog, record) },
    },
  };
}

/** ADR 0031 rule 1 as ADR 0035 decision 6 amends it: the scope is the column, so **every** member
 *  has to be rebuildable — **except the hood, which the column's width does not govern at all**.
 *
 *  A corner, an appliance or a hob standing at any level stops the whole move, and the refusal names
 *  that body rather than the selected one, because the customer is looking at something else
 *  entirely and needs to be told what is in the way.
 *
 *  **The hood is the one member that is neither.** It is sized to the cooktop it extracts over, not
 *  to the run it hangs on (owner, 2026-08-28: *"the cabinets is resizable but the hood over it
 *  should remain same size"*), so it does not narrow the column's widths, it does not stop the move,
 *  and it does not take the new width. It still **moves**: it re-centres over the run beneath it
 *  (ADR 0039 decision 4), which is why it comes back in a list of its own rather than being dropped.
 *  A hood that cannot be rebuilt at all still refuses the move, because re-centring it is not
 *  optional.
 *
 *  It stays an ordinary placement in its column throughout — the exemption is from the width rule,
 *  not from the model. See `EXTRACTOR_HOOD_KIND` for why the test is a `kind` and not a new flag.
 *
 *  **The exemption is about the hood's siblings, not about the hood itself.** It answers what
 *  happens to a hood when *something else* is resized, which is the whole of what ADR 0035 decision
 *  6 and ADR 0039 decision 4 decide. A customer selecting the hood and choosing its own width is
 *  decision 5's control, and what should happen to the run underneath then — nothing, most likely —
 *  is **not decided by any record**. So the selected body is always a full member of its column,
 *  hood or not, and that path behaves exactly as it did before this wave. Flagged for the owner
 *  rather than answered here; the shipped `hood-600` is `fixedWidth`, so nothing reachable today
 *  depends on the answer. */
function splitColumnMembers(
  context: ColumnContext,
  selected: ColumnMember,
): Resolved<ColumnUnit> {
  const members: [ColumnMember, ...ColumnMember[]] = [selected];
  const hoods: ColumnMember[] = [];
  for (const sibling of columnMembers(context.records, selected.record.col)) {
    if (sibling.id === selected.record.id) continue;
    const member = resolveMember(context, sibling);
    if (!member.ok) return member;
    (isHood(sibling) ? hoods : members).push(member.value);
  }
  return { ok: true, value: { members, hoods } };
}

/** A record and its resolved entry, joined to the two integers the extent is read from. `undefined`
 *  only where a derived record has no placement behind it, which the derivation makes impossible —
 *  every caller turns it into `COLUMN_MISMATCH` rather than assuming it away. */
function toColumnMember(
  design: Design,
  record: PlacementRecord,
  body: InsertableBody,
): ColumnMember | undefined {
  const placement = findPlacement(design, record.id);
  if (!placement) return undefined;
  return {
    record,
    body,
    alongMm: placement.alongMm,
    widthMm: placement.body.widthMm,
  };
}

/** One **sibling** of the selected body, resolved the same way — the selected body itself comes in
 *  already resolved, because §9's `canWidth` is answered on it by the caller.
 *
 *  A hood is asked only whether it can be **rebuilt**, never whether it can be **resized**: it keeps
 *  the width it has, so `fixedWidth` is not a fact about it that this move can violate. That is what
 *  lets the seeded `hood-600` — `fixedWidth: true` — re-centre over a run that resized under it. */
function resolveMember(
  context: ColumnContext,
  record: PlacementRecord,
): Resolved<ColumnMember> {
  const { catalog, label } = context;
  const body = isHood(record)
    ? resolveRebuildableHood(catalog, record)
    : resolveResizableBody(catalog, record);
  if (!body.ok) {
    return {
      ok: false,
      detail: {
        code: "COLUMN_MEMBER_NOT_RESIZABLE",
        params: { label, memberLabel: memberLabelOf(body.detail, label) },
      },
    };
  }
  const member = toColumnMember(context.design, record, body.value);
  if (!member) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label } },
    };
  }
  return { ok: true, value: member };
}

function resolveRebuildableHood(
  catalog: BodyCatalog,
  record: PlacementRecord,
): Resolved<InsertableBody> {
  const body = resolveRebuildBody(catalog, record);
  if (body) return { ok: true, value: body };
  return {
    ok: false,
    detail: {
      code: "NOT_RESIZABLE",
      params: { label: describeRecordLabel(catalog, record) },
    },
  };
}

/** ADR 0035 decision 6 as amended, and ADR 0039 decision 4: the exemption is keyed off the hood's
 *  declared catalogue identity and nothing else. Deliberately **not** a `PlacementRecord` flag —
 *  ADR 0038 deleted the standalone-accessory machinery and the owner asked for this "without
 *  separating it again from cabinets". */
function isHood(record: PlacementRecord): boolean {
  return record.kind === EXTRACTOR_HOOD_KIND;
}

/** `resolveResizableBody`'s refusal already carries the member's own name; this reads it back out
 *  rather than resolving the label a second time and risking two answers. */
function memberLabelOf(detail: RejectionDetail, fallback: string): string {
  return detail.code === "NOT_RESIZABLE" ? detail.params.label : fallback;
}

/** §3.2's membership: the bodies filed under one column key, in placement order. */
function columnMembers(
  records: readonly PlacementRecord[],
  col: string,
): readonly PlacementRecord[] {
  return records.filter((record) => record.col === col);
}

/** The span the column's members occupy along their wall: **the union of their extents**, from the
 *  leftmost left edge to the rightmost right edge.
 *
 *  This used to require them to be **flush** and refuse `COLUMN_MEMBERS_UNALIGNED` otherwise — 13
 *  lockouts in the shipped design, reachable by inserting a 450 mm dishwasher into a 600 mm column's
 *  opening. **ADR 0035 decision 6 retires that refusal**: a resize now *squares the column up*,
 *  bringing every member to the target width. Owner, 2026-08-28: *"let's make them editable, I
 *  didn't get why we need to refuse."*
 *
 *  The union rather than the widest member or the selected one, and the difference is space
 *  accounting rather than taste. The delta this move takes from the adjacent empty column is
 *  `target − extent.widthMm`, and the empty column abuts the run at the union's edge — so measuring
 *  the extent from anything narrower would spend space a member of this very column is standing in,
 *  and the two runs would overlap by exactly the amount the narrowest member was out by.
 *
 *  Hoods are not in `members` and so are not in the union: a hood may overhang the run it hangs on
 *  and it neither funds nor consumes the run's space (ADR 0035 decision 6 as amended).
 *
 *  Total by construction, where the old one had a refusal branch: `members` is non-empty because the
 *  selected body is always one of them. */
function resolveColumnExtent(
  members: readonly [ColumnMember, ...ColumnMember[]],
): ExtentMm {
  const leftMm = Math.min(
    ...members.map((member) => member.alongMm - member.widthMm / 2),
  );
  const rightMm = Math.max(
    ...members.map((member) => member.alongMm + member.widthMm / 2),
  );
  return { centreMm: (leftMm + rightMm) / 2, widthMm: rightMm - leftMm };
}

/** The §7 entry a body would be rebuilt through, in its insertable shape. A resize rebuilds through
 *  the catalogue equivalent, so **a resized seeded body migrates its `buildId`**: after resizing a
 *  `base-drawer2-600` the stored placement carries `base-panbank`. It has to —
 *  `buildDecomposedBody` takes no width, and every seeded id is one fixed geometry. */
function resolveRebuildBody(
  catalog: BodyCatalog,
  record: PlacementRecord,
): InsertableBody | undefined {
  const equivalent = resolveCatalogEquivalent(catalog, record.buildId);
  if (!equivalent) return undefined;
  return toInsertableBody(equivalent.buildId, equivalent.definition);
}

/** A seeded row carries no `label`, so the refusal falls back to the entry's kind — the same
 *  fallback §9's header uses. */
function describeRecordLabel(
  catalog: BodyCatalog,
  record: PlacementRecord,
): string {
  return catalog.get(record.buildId)?.label ?? record.kind;
}

/** ADR 0031 rule 5: **a column's legal widths are the intersection of its members' declared sets.**
 *
 *  Rule 5's second sentence — a `widthFlex: 'fit'` member "accepts any width above its floor and so
 *  does not narrow the intersection" — was the ladder's, and ADR 0035 decision 2 retired it with the
 *  ladder. Every §7 row now carries a bound, so **every** member narrows the intersection, and a
 *  `'fit'` member narrows it to its own floor and ceiling rather than to nothing. The two facts the
 *  boolean used to hold apart are one fact again: `acceptsWidthMm` reads the entry's ranges, and a
 *  pan bank's are 300–800 because that is what a pan bank is made at.
 *
 *  Each member's set is resolved through `resolveBuildableSizes`, the same function §9 renders chips
 *  from, so a width the panel offers is a width this command will accept — for the member's own row
 *  at least. The intersection is the part §9 does not yet know about; see the note in `describe-
 *  selection.ts` about what the panel can and cannot derive from one selection.
 *
 *  Refusing the width the column already sits at is what keeps §9's tri-state honest: `active` and
 *  `free` are different states, and "a chip is free iff the command succeeds" is only true if the
 *  command refuses at the current width.
 *
 *  **"The width it sits at" is the extent's, not the selected body's**, and under ADR 0035 decision
 *  6's square-up those can differ: a column holding a 450 under a 600 has an extent of 600, so 600
 *  is `WIDTH_UNCHANGED` even though squaring up at it would move the 450. Right on both counts — the
 *  extent is the space the run occupies, and a move that changes it by nothing has no boundary to
 *  push and no empty column to push it into. The stepper never asks for it either: it offers ±50
 *  from the **selected** body's width, so from the 450 it asks 400 or 500 and from the 600 it asks
 *  550 or 650, and each of those does move the extent. */
function refuseIllegalWidth(
  input: SetWidthInput,
  label: string,
  column: ColumnUnit,
  extent: ExtentMm,
): RejectionDetail | undefined {
  const sizesMm = intersectColumnWidths(input.catalog, column);
  if (!sizesMm.includes(input.widthMm)) {
    // **The hood first, when the hood is the reason.** The floor is folded into the column's bound,
    // so without this the sentence names the *selected body's* widths and never the hood — and the
    // hood is the one thing the customer could delete to unlock the column.
    const hoodFloorMm = hoodWidthFloorMm(column.hoods);
    const membersAccept = column.members.every((member) =>
      acceptsWidthMm(member.body, input.widthMm),
    );
    if (input.widthMm < hoodFloorMm && membersAccept) {
      return {
        code: "COLUMN_HOOD_FLOOR",
        params: {
          label,
          hoodWidthMm: hoodFloorMm,
          requestedMm: input.widthMm,
        },
      };
    }
    return {
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label,
        sizesMm,
        widthRangesMm: intersectColumnRanges(column),
        availableMm: extent.widthMm,
      },
    };
  }
  if (input.widthMm === extent.widthMm) {
    return {
      code: "WIDTH_UNCHANGED",
      params: { label, widthMm: extent.widthMm },
    };
  }
  return undefined;
}

/** The **bound** a column can be built within: every member's ranges, intersected, then raised to
 *  the floor any hood in the column sets (ADR 0035 decision 6, amended 2026-08-29).
 *
 *  `intersectColumnWidths` beside this answers which *chips* the column offers, and that is what the
 *  command gates on. This answers what the column can be **built** at, which is what the customer is
 *  told — and the two are different facts: a column of cabinetry offers thirteen chips while being
 *  buildable anywhere across 200-800, so listing the chips in a refusal both reads badly and denies
 *  widths the column really does accept (5D2a QA finding B1, on the insert path; product-logic
 *  review R1.1, which found the resize path still doing it).
 *
 *  Empty when the members share no overlap at all. The one worked example this comment used to give
 *  — a `base-bottle-cargo` (200–300) under a `hood` (600–800) — stopped being one under ADR 0035
 *  decision 6: a hood is not a member for width purposes, so it can no longer be half of a disjoint
 *  pair. The branch stays because the intersection of declared ranges is not the engine's to assume
 *  non-empty; the sentence then falls back to the chips, which is the truthful thing to say when
 *  there is no common bound. */
function intersectColumnRanges(column: ColumnUnit): readonly WidthRangeMm[] {
  const perMember = column.members.map((member) =>
    resolveWidthRangesMm(member.body),
  );
  const first = perMember[0];
  if (first === undefined) return [];
  const intersected = perMember.reduce<readonly WidthRangeMm[]>(
    (accumulated, ranges) =>
      accumulated.flatMap((left) =>
        ranges
          .map((right) => ({
            minMm: Math.max(left.minMm, right.minMm),
            maxMm: Math.min(left.maxMm, right.maxMm),
          }))
          .filter((range) => range.minMm <= range.maxMm),
      ),
    first,
  );
  // The bound the customer is *told* has to carry the hood's floor too, or the sentence on the
  // disabled `−50` would name a minimum the command refuses.
  const floorMm = hoodWidthFloorMm(column.hoods);
  return intersected
    .map((range) => ({
      minMm: Math.max(range.minMm, floorMm),
      maxMm: range.maxMm,
    }))
    .filter((range) => range.minMm <= range.maxMm);
}

/** ADR 0035 decision 6 as amended 2026-08-29: **a hood floors its column's width.**
 *
 *  The exemption decision 6 grants is from *following* the column's width, never from *constraining*
 *  it — two different memberships, and only the first was retired. Wave 5D2b shipped the first
 *  without the second and product-logic review measured what that costs: a 600 mm hood over a run
 *  shrunk to 550 re-centres 25 mm left and lands **inside** the cabinet beside it, 200 mm buried by
 *  the eighth step, two solid bodies occupying one space. §5.4's "overlap is unrepresentable" was
 *  simply false, because nothing bounded the run from below.
 *
 *  Owner, 2026-08-29: *"if 600 is minimum for the hood, then is logic to set the minimum 600 mm, and
 *  grey out the −50mm button."* So the overlap stops being a state the model can reach rather than
 *  one a check has to catch — the run is never narrower than the hood, and the hood therefore never
 *  overhangs onto a neighbour.
 *
 *  **The hood's own width, not its catalogue floor.** A hood is sized to the cooktop it extracts
 *  over, so the number that matters is the one it is standing at; an 800 mm hood floors its column at
 *  800 even though the catalogue would build a hood at 600.
 *
 *  The widest hood wins where a column somehow holds two, and `0` — a column with none — floors
 *  nothing. `Math.max` of an empty list is `-Infinity`, which is why the seed is there. */
function hoodWidthFloorMm(hoods: readonly ColumnMember[]): number {
  return Math.max(0, ...hoods.map((hood) => hood.widthMm));
}

function intersectColumnWidths(
  catalog: BodyCatalog,
  column: ColumnUnit,
): readonly number[] {
  // A width has to be one **somebody** in the column offers, or the column would be resizable to a
  // width no chip in it renders. Every member bounds this list now — the ladder members that only
  // widened it retired with the ladder itself (ADR 0035 decision 2).
  const { members } = column;
  const offered = new Set(
    members.flatMap((member) =>
      resolveBuildableSizes(catalog, member.record.buildId),
    ),
  );
  // A hood is not a member and offers nothing, but it **floors** what the members may agree on
  // (`hoodWidthFloorMm`). Applied here rather than at the command's edge so the one function that
  // decides a column's legal widths decides this too: `columnWidthChoices` renders from it and
  // `refuseIllegalWidth` gates on it, so the `−50` at the hood's width is disabled carrying its
  // reason instead of failing on the tap.
  const floorMm = hoodWidthFloorMm(column.hoods);
  return [...offered]
    .filter(
      (widthMm) =>
        widthMm >= floorMm &&
        members.every((member) => acceptsWidthMm(member.body, widthMm)),
    )
    .sort((left, right) => left - right);
}

type EmptySpaceEvaluation =
  | { readonly ok: true; readonly value: EmptySpace }
  | { readonly ok: false; readonly reason: EmptySpaceRefusal };

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

/** One entry in the scan `fundColumnResize` walks: a side, and what it offers to fund the move. */
interface FundingAttempt {
  readonly side: Side;
  readonly space: EmptySpaceEvaluation;
}

/** Where the width comes from, in the order it is looked for.
 *
 *  **ADR 0031 rule 3 first**: an empty column that is already there is narrowed by a growth and
 *  widened by a shrink. **ADR 0035 decision 7 second**: a shrink that finds no empty column at all
 *  *creates* one out of the space it vacates.
 *
 *  Decision 7 is what makes the stepper usable. ADR 0031's recorded consequence was that **nothing
 *  in the shipped kitchen is resizable until something is deleted** — it loads with no empty column
 *  — so every `−50` would have been disabled on a design nobody had edited yet, and width editing
 *  stayed a second step of deleting. ADR 0031's own correction had already conceded the ground: it
 *  called creating a column "not representable", then noted that `moveFrozenColumns` synthesises one
 *  at a derived key on every legal resize. This spends exactly that machinery.
 *
 *  Ordered rather than chosen, and returning space to an existing opening wins: stepping a column
 *  down and back up puts the width back where it came from instead of leaving a sliver beside a
 *  widened opening. That ordering is also what delivers ADR 0037's outcome for the stepper without its merge —
 *  the second `−50` widens the strip the first one made instead of parking a second beside it — and
 *  it only started working when `evaluateEmptySpace` stopped applying `MIN_W` to a shrink.
 *
 *  **Creation is a last resort, not a fallback.** It is offered only when neither side has an empty
 *  column at all — not when one has one that then refuses. A shrink stopped by `RESIZE_OPENS_GAP`
 *  could technically be rescued by splitting a fresh strip off beside the opening that caused it,
 *  and that is a wider change than decision 7 makes: the decision is about a kitchen with no empty
 *  column anywhere, which is the state the shipped design loads in. */
function fundingScan(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
): readonly FundingAttempt[] {
  const existing = EMPTY_SPACE_ORDER.map((side) => ({
    side,
    space: evaluateEmptySpace(input, records, plan, side),
  }));
  if (existing.some((attempt) => attempt.space.ok)) return existing;

  const created = vacatedEmptySpace(input, plan);
  if (!created) return existing;
  return [
    ...existing,
    { side: created.side, space: { ok: true, value: created } },
  ];
}

/** ADR 0035 decision 7: the empty column a **shrink** brings into existence, expressed as the same
 *  `EmptySpace` an existing one produces so that `planMoves` needs no second arithmetic.
 *
 *  It starts as a zero-width column sitting exactly on the run's `VACATED_SPACE_SIDE` edge, and the
 *  remainder it is left at is the whole of what the shrink gives back. `planMoves` then holds that
 *  edge as the empty column's *far* edge and holds the run's opposite edge, so the new opening is
 *  precisely the strip the members withdrew from and the run total is conserved exactly as it is
 *  for an existing column.
 *
 *  **`MIN_W` deliberately does not apply here.** ADR 0031 refuses to *leave* an empty column between
 *  0 and 300 mm on the way through, on the grounds that an unusable sliver is not a state to create.
 *  A 50 mm step creates one every single time, so applying that floor here would disable the whole
 *  stepper — and the owner has since decided the other way round: an opening no cabinet fits "is ok
 *  to have empty space left" (ADR 0037). The floor stays where it was, on a growth consuming space
 *  that was already there.
 *
 *  `undefined` on a growth, which has nothing to vacate, and on a delta of zero. **Nothing else**:
 *  the strip's key colliding with one the frozen map holds is `refuseKeyCollision`'s question and no
 *  longer this function's, since clean-code review R3.5 gave the pair one guard. It is not
 *  theoretical either — measured on the shipped kitchen, narrowing `A|0.30` to 300 vacates 0.30–0.60,
 *  whose centre keys as `A|0.45`, the corner leg `p25`'s column — and it is refused there rather than
 *  nudged to a free key, which would put the empty column somewhere the cabinets did not vacate.
 *
 *  **ADR 0037's merge would not have reached that case, and was not meant to** — it united two *empty* columns;
 *  a strip landing inside an *occupied* column's extent is the different question M5 still records
 *  under *Not established* — "whether a resize should merge into an existing column key or refuse". */
function vacatedEmptySpace(
  input: SetWidthInput,
  plan: ColumnPlan,
): EmptySpace | undefined {
  const vacatedMm = plan.extent.widthMm - input.widthMm;
  if (vacatedMm <= 0) return undefined;

  return {
    // The strip was this column's, so it inherits this column's frozen facts — `regions`, `top`,
    // `d` and `ry` — which is what ADR 0011 Gap D requires of any column entered into the map.
    column: plan.column,
    side: VACATED_SPACE_SIDE,
    extent: {
      centreMm: plan.extent.centreMm + plan.extent.widthMm / 2,
      widthMm: 0,
    },
    remainderMm: vacatedMm,
  };
}

/** Which end of the run a shrink vacates when nothing else decides it. Arbitrary in the way
 *  `EMPTY_SPACE_ORDER` is arbitrary, and fixed for the same reason: the same design must always
 *  resize the same way. It matches that order's first side, so a column stepped down and back up
 *  returns to where it started. */
const VACATED_SPACE_SIDE: Side = "right";

/** Which of the three codes the customer reads, once both sides have answered.
 *
 *  **Ordered by how specific the answer is**, and each rank means the scan got further than the one
 *  below it. `COLUMN_KEY_COLLISION` wins whenever any side found the space and made the arithmetic
 *  work and was refused for **where the column would land**. `RESIZE_OPENS_GAP` is next: a side
 *  could have funded the move and an opening would have landed on a body. `NO_EMPTY_SPACE` is what
 *  is left when no side got that far.
 *
 *  **All three carry the whole scan**, so whichever is read the sentence says which side was tried
 *  and what each answered — "no room" on its own leaves the customer with nothing to act on, and
 *  they need to know which side to clear. */
function refuseNoSideFunds(
  input: SetWidthInput,
  plan: ColumnPlan,
  sides: readonly EmptySpaceSide[],
): RejectionDetail {
  const params = {
    label: plan.label,
    requestedMm: input.widthMm,
    deltaMm: input.widthMm - plan.extent.widthMm,
    sides,
  };
  // Ordered by how specific the answer is. A key collision is the sharpest thing the scan can say —
  // the space was there and the arithmetic worked, and the move was refused for where it would
  // *land* — so it outranks the gap, which in turn outranks "no space at all". Each is per-side and
  // the terminal code names whichever the scan actually met.
  if (sides.some((side) => side.reason === "key_taken")) {
    return { code: "COLUMN_KEY_COLLISION", params };
  }
  const opensAGap = sides.some((side) => side.reason === "opens_a_gap");
  return opensAGap
    ? { code: "RESIZE_OPENS_GAP", params }
    : { code: "NO_EMPTY_SPACE", params };
}

/** ADR 0031 rules 3 and 6: growing consumes the empty column and shrinking returns width to it,
 *  and a **growth** must leave the remainder either zero or at least `MIN_W`. Both floor reasons are
 *  reachable on growth alone, and deliberately so — see the note on the floor below.
 *
 *  It answers only what can be decided from geometry. `opens_a_gap`, the fourth reason a side can
 *  refuse, needs the rebuilt records and belongs to `fundColumnResize`. */
function evaluateEmptySpace(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
  side: Side,
): EmptySpaceEvaluation {
  const neighbour = findAdjacentEmptyColumn(input.columns, records, plan, side);
  if (!neighbour) return { ok: false, reason: "absent" };

  const extent = emptyColumnExtent(neighbour);
  // A frozen extent that does not sit on whole millimetres cannot be moved onto them either, so it
  // is not empty space this command can spend. Unreachable from any shipped design.
  if (!extent) return { ok: false, reason: "absent" };

  const deltaMm = input.widthMm - plan.extent.widthMm;
  const remainderMm = extent.widthMm - deltaMm;
  if (remainderMm < 0) return { ok: false, reason: "too_narrow" };
  // **The floor guards *making* a sliver, so only a growth can fail it** (product-logic review
  // R3.10, ADR 0037). A shrink only ever widens the column it returns space to, so a remainder under
  // `MIN_W` there means the column was *already* under it — and refusing on that turned the one
  // thing ADR 0037 asks for into its opposite: the second `−50` could not widen the 50 mm strip the
  // first had just made, fell through to `vacatedEmptySpace`, and created a second strip beside it.
  // Six presses freed 300 mm of wall as six unusable 50 mm slivers instead of one 300 mm space.
  //
  // It also makes the pair coherent. `vacatedEmptySpace` waives this floor when it *creates* a
  // strip; enforcing it here on the shrink that would have merged that strip away was the floor
  // applied exactly where it did harm and waived exactly where it made the sliver.
  if (deltaMm > 0 && remainderMm > 0 && remainderMm < MIN_WIDTH_MM) {
    return { ok: false, reason: "remainder_below_floor" };
  }
  return { ok: true, value: { column: neighbour, side, extent, remainderMm } };
}

/** ADR 0031's "empty" is **empty at every level**, matching the scope of the move: a column that is
 *  free only at the level being edited does not qualify, because the resize moves all levels.
 *
 *  That is exactly "no record is filed under this key", which is what §3.2's own membership says.
 *  The resized column's edges come from its members' stored millimetres rather than
 *  from `Column.w`, which is the MIN over members and goes stale when the narrowest one is deleted. */
function findAdjacentEmptyColumn(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
  side: Side,
): Column | undefined {
  const occupied = new Set(records.map((record) => record.col));
  const sharedEdgeM = toMetres(
    side === "right"
      ? plan.extent.centreMm + plan.extent.widthMm / 2
      : plan.extent.centreMm - plan.extent.widthMm / 2,
  );
  const abutting = [...columns.values()].filter(
    (candidate) =>
      candidate.key !== plan.column.key &&
      candidate.wall === plan.column.wall &&
      !occupied.has(candidate.key) &&
      Math.abs(facingEdgeM(candidate, side) - sharedEdgeM) <
        EDGE_ABUTMENT_TOLERANCE_M,
  );
  return abutting.sort(byFundingCapacity)[0];
}

/** Which empty column to spend when two abut the same edge. Two *can*: §3.2's columns are keyed on
 *  a centre and may overlap along the wall, so a 900 mm run and a 300 mm one can share a right-hand
 *  edge and both be empty.
 *
 *  It used to be whichever `columns.values()` yielded first — map insertion order, which is a
 *  property of how the design was loaded and not a rule anyone chose (logic review R1.8). **The
 *  widest wins**: it is the one most likely to fund the move at all, and the one least likely to be
 *  left under `MIN_W` as an unusable sliver. Ties break on the key, so the order is total and the
 *  same design always resizes the same way. */
function byFundingCapacity(left: Column, right: Column): number {
  return right.w - left.w || left.key.localeCompare(right.key);
}

/** The edge an empty column on `side` presents to the run being resized: one on the right meets it
 *  with its own left edge. */
function facingEdgeM(column: Column, side: Side): number {
  const centreM = alongWallM(column.wall, column);
  return side === "right" ? centreM - column.w / 2 : centreM + column.w / 2;
}

/** An empty column has no member to read integers off, so its extent comes from the frozen map —
 *  the one place its geometry survives at all once the last body in it was deleted. */
function emptyColumnExtent(column: Column): ExtentMm | undefined {
  const centreMm = toExactMillimetres(alongWallM(column.wall, column));
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) return undefined;
  return { centreMm, widthMm };
}

/** The along-wall coordinate: `x` on wall A, `z` on wall B — the axis `deriveColumnKey` buckets on
 *  and the only one a resize moves anything along. */
function alongWallM(
  wall: DesignWall,
  position: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? position.x : position.z;
}

/** ADR 0031's arithmetic, and the whole of what the rule means: the column's outer edge — the one
 *  **away** from the empty space — holds, the empty column's far edge holds, and the boundary
 *  between them absorbs the whole delta. The two runs therefore still meet exactly where they met,
 *  so the run total is conserved and neither an overlap nor a gap is representable.
 *
 *  Every member takes the same new centre, which is rule 1 in one line: no body leaves the column.
 *  They need not have been flush going in — squaring up is what makes them flush coming out
 *  (ADR 0035 decision 6). */
function planMoves(
  input: SetWidthInput,
  plan: ColumnPlan,
  empty: EmptySpace,
): Resolved<ColumnResize> {
  const outward = empty.side === "right" ? 1 : -1;
  const heldMm = plan.extent.centreMm - (outward * plan.extent.widthMm) / 2;
  const alongMm = heldMm + (outward * input.widthMm) / 2;

  const emptyFarMm =
    empty.extent.centreMm + (outward * empty.extent.widthMm) / 2;
  const emptyCentreMm = emptyFarMm - (outward * empty.remainderMm) / 2;

  return chainMoveGuards(
    {
      label: plan.label,
      widthMm: input.widthMm,
      side: empty.side,
      members: [
        // The column's own members are **squared up** to the requested width, whatever they were
        // standing at (ADR 0035 decision 6).
        ...plan.members.map((member) => ({
          ...member,
          widthMm: input.widthMm,
          alongMm,
        })),
        // A hood keeps its own width and **re-centres over the run beneath it** (ADR 0035 decision 6
        // as amended, ADR 0039 decision 4): its centre is the run's centre, and its width is its
        // own, so a resize moves it without stretching it.
        //
        // That is the rule for a hood the customer did **not** select. Selecting the hood itself is
        // undecided and unchanged by this wave — it is a full member of its column there, and the
        // column moves with it. `splitColumnMembers` has the reasoning.
        ...plan.hoods.map((hood) => ({ ...hood, alongMm })),
      ],
      // Both columns move as frozen extents, and for the same reason — see `FrozenColumnMove`.
      resized: {
        column: plan.column,
        widthMm: input.widthMm,
        centreMm: alongMm,
      },
      empty: {
        column: empty.column,
        widthMm: empty.remainderMm,
        centreMm: emptyCentreMm,
      },
    },
    input.columns,
  );
}

/** Both guards a planned move must pass before anything is written.
 *
 *  Ordered so the arithmetic failure is reported before the geometric one: a fractional centre means
 *  the move was never well formed, while a key collision means it was, and lands somewhere it may
 *  not. */
function chainMoveGuards(
  move: ColumnResize,
  columns: ReadonlyMap<string, Column>,
): Resolved<ColumnResize> {
  const centred = refuseFractionalCentres(move);
  if (!centred.ok) return centred;
  return refuseKeyCollision(centred.value, columns);
}

/** §3.2's key is a **position**, so two columns cannot share one — and a move writes new keys for
 *  both the resized column and the empty one it spends.
 *
 *  Wave 5D2b's QA found this as two instances of one hole: `vacatedEmptySpace` asked whether the
 *  *created strip's* key was taken, and nothing asked it of the *resized column's* — which moves on
 *  every accepted resize, growth included, so the hole predates decision 7 and this wave is merely
 *  the first that could reach it. Writing over an occupied key deletes that column's frozen extent
 *  outright, and `refuseColumnDrift` is blind to it because the clobbered column's members still
 *  derive the key they always did.
 *
 *  The pair is checked against each other as well as against the map: a shrink that put both new
 *  keys on one position would otherwise write one and lose the other. */
function refuseKeyCollision(
  move: ColumnResize,
  columns: ReadonlyMap<string, Column>,
): Resolved<ColumnResize> {
  const moved = frozenMoves(move).filter((frozen) => frozen.widthMm > 0);
  const vacatedKeys = new Set(
    frozenMoves(move).map((frozen) => frozen.column.key),
  );
  const newKeys = moved.map((frozen) => frozenColumnKey(frozen));

  const collides =
    new Set(newKeys).size !== newKeys.length ||
    newKeys.some((key) => columns.has(key) && !vacatedKeys.has(key));
  if (!collides) return { ok: true, value: move };
  // **A marker, not the sentence.** The scan reads only the code here — it records `key_taken` for
  // this side and tries the other edge — and `refuseNoSideFunds` builds the customer-facing detail
  // with the whole scan in it once no side is left. Filling `sides` here would name one side while
  // the other was still untried.
  return {
    ok: false,
    detail: {
      code: "COLUMN_KEY_COLLISION",
      params: {
        label: move.label,
        requestedMm: move.widthMm,
        deltaMm: 0,
        sides: [],
      },
    },
  };
}

/** Every **persisted** coordinate must land on a whole millimetre (§2). Half of an odd width would
 *  not, and the schema stores `alongMm` as an integer — so a catalogue set that ever lists a width
 *  of the opposite parity to the column's current one is refused here rather than rounded into a
 *  body that no longer meets its neighbour.
 *
 *  **The members only** (logic review R1.5). It used to check the empty column's new centre too, and
 *  that value is never persisted: it is consumed by `toMetres` and by `deriveColumnKeyAt`, which
 *  rounds to two decimals. §2's rule binds what the document stores, and the frozen map is derived
 *  state — a resize the model represents perfectly was being refused, under a code naming
 *  `alongMm`, a placement field that value is not.
 *
 *  Dropping it also settles R1.4, which asked whether an unfundable side should end the scan here.
 *  It cannot: a member's centre is `columnCentre ± (newWidth − oldWidth) / 2`, so it is fractional
 *  exactly when the delta is odd — a fact about the two widths and not about which side pays, and
 *  one the other side would answer identically. Returning immediately is therefore right.
 *
 *  (The empty column's centre could never have fired alone either, as it happens: it is
 *  `farEdge − remainder / 2`, and both terms move onto half-millimetres together with the delta's
 *  parity. The check was redundant as well as wrong about which rule it was enforcing.) */
function refuseFractionalCentres(move: ColumnResize): Resolved<ColumnResize> {
  const fractionalMm = move.members
    .map((member) => member.alongMm)
    .find((value) => !Number.isInteger(value));
  if (fractionalMm === undefined) return { ok: true, value: move };
  return {
    ok: false,
    detail: {
      code: "NON_INTEGER_MILLIMETRES",
      params: { field: "alongMm", valueMm: fractionalMm },
    },
  };
}

function findPlacement(
  design: Design,
  placementId: string,
): DesignPlacement | undefined {
  return design.placements.find((placement) => placement.id === placementId);
}

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

/** **Both** columns a resize touches, moved as the frozen extents ADR 0011 Gap D says they are:
 *  `regions`, `top`, `d` and `ry` come through untouched, and only `w`, the along-wall centre and
 *  the key move.
 *
 *  For the **empty** column that is the only way it can move at all — `rederiveTouchedColumns`
 *  answers a key from the members filed under it, and an empty column has none, so its geometry
 *  survives only in the frozen map.
 *
 *  For the **resized** column it is FINDING Q1.1. That function *does* answer its key, from the
 *  members left standing — and a column that had a member deleted earlier in the session has already
 *  lost that member from its membership while the frozen map still carries its region. Re-deriving
 *  drops the region, and the opening the customer just freed disappears: delete a wall cabinet, see
 *  the empty slot, narrow the cabinet still standing above it, and the slot is gone with no void and
 *  no way back. That is ADR 0011 Gap D verbatim, and ADR 0031 is what made it reachable — before
 *  column scope, a resize never moved a key with a *deleted* sibling under it.
 *
 *  Only `min(regions)` and `top` reach §4 (`deriveFreeSpans` takes what is *taken* from the current
 *  records), so carrying a frozen region whose member was rebuilt slightly taller changes nothing —
 *  the free spans are still computed from the bodies that are actually standing there.
 *
 *  A width of zero **removes** the key (rule 6). Only the empty column can reach it: consuming the
 *  space exactly is the one case where a column ceases to exist without anything being deleted.
 *
 *  Deleting both old keys before setting either new one, so the two passes cannot race: the empty
 *  column's old key and the resized column's new key are always distinct (their centres differ by at
 *  least half the resized column's width), but ordering that has to be reasoned about is ordering
 *  that will eventually be got wrong. */
function moveFrozenColumns(
  columns: ReadonlyMap<string, Column>,
  move: ColumnResize,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  const updated = new Map<string, Column>(columns);
  for (const frozen of frozenMoves(move)) updated.delete(frozen.column.key);
  for (const frozen of frozenMoves(move)) {
    if (frozen.widthMm <= 0) continue;
    const centreM = toMetres(frozen.centreMm);
    updated.set(frozenColumnKey(frozen), {
      ...frozen.column,
      key: frozenColumnKey(frozen),
      w: toMetres(frozen.widthMm),
      ...(frozen.column.wall === "A" ? { x: centreM } : { z: centreM }),
    });
  }
  // Last, because `hasFullHeightUnder` is a fact about a column's **extent** and both frozen moves
  // have to be written before it can be re-answered.
  //
  // ADR 0037's merge was here until 2026-08-30 and is withdrawn; `void-engine.ts` carries why.
  return withCurrentFullHeightMembers(updated, records);
}

function frozenMoves(move: ColumnResize): readonly FrozenColumnMove[] {
  return [move.resized, move.empty];
}

/** §3.2's key for a column at its new centre, derived exactly as an occupied column's is — an
 *  empty column has no member to derive one from, and a body later inserted into it must land under
 *  a key the map actually holds or `insertBody` refuses `COLUMN_MISMATCH`. */
function frozenColumnKey(frozen: FrozenColumnMove): string {
  return deriveColumnKeyAt(frozen.column.wall, toMetres(frozen.centreMm));
}

/** One body rebuilt at its new width, through the identical path `insertBody` uses: §5.2's fit
 *  guards, the probe, and the built-carcass re-check behind it. A resize that would build a body
 *  the engine refuses — `BUILT_SIZE_MISMATCH`, the sink's `minWidthMm` (ADR 0017), the hood's fixed
 *  710 (ADR 0016) — is refused here, and §9 wants that refusal to be unreachable in the first
 *  place: this is the backstop, not the gate. */
/** A hood is **moved**, never rebuilt.
 *
 *  ADR 0035 decision 6 as amended says a hood keeps its own width and re-centres over the run; ADR
 *  0039 says its depth is standard and its front alignment fixed. Nothing about a hood is a function
 *  of the run beneath it except *where its centre is* — so a resize writes one field.
 *
 *  Rebuilding it through `evaluateInsertFit` was wrong in three visible ways (product-logic review
 *  R3.2), all of them from resolving the seeded instance to its catalogue equivalent: `hood-600`
 *  became `hood`, the height went 700 → 710 because the catalogue then declared `HOOD_HEIGHT_MM` as 710, and
 *  `fixedWidth` flipped true → false, handing the hood a width control the fixture deliberately
 *  withholds. A customer who resized the **cabinet underneath** got a taller hood and a new control.
 *  The extra 10 mm then ate into the level above and the next step refused with a sentence about
 *  height.
 *
 *  The 700/710 disagreement between the fixture and the catalogue was real and is **resolved the other
 *  way**: ADR 0039 decision 5 measured a built hood at 700, so the fixture was right and the
 *  catalogue over-declared by 10 mm nobody makes. `HOOD_HEIGHT_MM` is 700 since wave 5F. A resize
 *  must still not resolve such a thing by accident, which is why this function exists. */
function moveHood(
  input: SetWidthInput,
  plan: Rebuild,
): Resolved<DesignPlacement> {
  const placement = findPlacement(input.design, plan.record.id);
  if (!placement) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label: plan.body.label } },
    };
  }
  return { ok: true, value: { ...placement, alongMm: plan.alongMm } };
}

function rebuild(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  plan: Rebuild,
): Resolved<DesignPlacement> {
  const placement = findPlacement(input.design, plan.record.id);
  const column = input.columns.get(plan.record.col);
  if (!placement || !column) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label: plan.body.label } },
    };
  }

  // §5.3's opening, with the new width written over it. Everything else — the level slot, the span
  // it belongs to and the **depth** — is the opening this body already stands in, because a resize
  // changes a width and nothing else. Reading the depth from anywhere but here is how a swap once
  // built a wall cabinet to the depth of the base cabinet below it.
  const opening = {
    ...openingFromPlacement(plan.record, records, input.columns),
    alongM: toMetres(plan.alongMm),
    w: toMetres(plan.widthMm),
  };
  const fit = evaluateInsertFit({ body: plan.body, opening, column });
  if (!fit.ok) return { ok: false, detail: fit.detail };

  const measurement = input.probe.measure({
    buildId: plan.body.buildId,
    widthM: fit.plan.widthM,
    heightM: fit.plan.heightM,
    depthM: fit.plan.depthM,
  });
  const mismatch = refuseBuiltSize(plan.body, fit.plan, measurement);
  if (mismatch) return { ok: false, detail: mismatch };
  const unusable = refuseUnusableMeasurement(plan.body, measurement);
  if (unusable) return { ok: false, detail: unusable };

  const heightMm = toExactMillimetres(fit.plan.heightM);
  if (heightMm === undefined) {
    return {
      ok: false,
      detail: {
        code: "NON_INTEGER_MILLIMETRES",
        params: {
          field: "heightMm",
          valueMm: fit.plan.heightM * MILLIMETRES_PER_METRE,
        },
      },
    };
  }

  return {
    ok: true,
    value: {
      ...placement,
      // A resize moves a body along its wall and nowhere else, so `y0Mm` and `wall` come through
      // untouched: the module line a body stands on is not a function of its width.
      alongMm: plan.alongMm,
      body: {
        buildId: plan.body.buildId,
        widthMm: plan.widthMm,
        heightMm,
        seatDepthMm: toMillimetres(2 * measurement.seatOffsetM),
        // §11 rows 12 and 13, now for **every** member of the resized column.
        ...carriedAppearance(plan.body, plan.record),
      },
    },
  };
}

/** **`RESIZE_OPENS_GAP`, re-stated by ADR 0031 rather than deleted**, and asked here as a question
 *  rather than answered as a verdict.
 *
 *  It used to compare §4's derived opening set before and after and refuse on any difference. Under
 *  ADR 0031 that fires on every legal resize, because the empty column funding the move shrinks —
 *  so the comparison had to go while the defect it guarded stayed. This is that defect said
 *  directly: **no opening may appear where a body physically stands.**
 *
 *  Still reachable, and for a reason worth knowing. The empty column's extent is frozen (ADR 0011
 *  Gap D) while its width moves, so widening it past what its own members used to cover can bring
 *  its load-time regions over a body in a *neighbouring* column. Measured on the shipped kitchen:
 *  clear `A|1.30`, narrow `A|0.75` to 200, and the empty column reaches 900 mm wide with a base
 *  opening across the corner leg `p25` is standing in.
 *
 *  Refusing is the conservative direction and the one §9 asks for: a resize that cannot be
 *  represented is refused **before** it is offered, and the customer keeps a kitchen whose empty
 *  slots are all real. But it is refused only when **both** sides answer this way — the caller
 *  treats a `true` here as one side declining to fund the move, not as the end of the scan.
 *
 *  **It asks about the difference, not about the world** (logic review R1.7). Scanning every opening
 *  against every body meant that one pre-existing overlap — from seeded data, from a future command,
 *  from the near-abutment R1.8 describes — would refuse *every* resize anywhere in the design, on
 *  both sides, with a sentence about neighbours that had nothing to do with the cause and no action
 *  the customer could take. A body already standing under an opening is not this move's doing; a
 *  body that was not, and now is, is exactly what this refusal exists for. */
function opensAnOpeningOverABody(
  before: OverlapSet,
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
  exemptIds: ReadonlySet<string>,
): boolean {
  const after = bodiesUnderOpenings(records, columns, exemptIds);
  return [...after].some((placementId) => !before.has(placementId));
}

type OverlapSet = ReadonlySet<string>;

/** Which bodies currently have an opening derived on top of them — **by placement id**, not by
 *  opening, so the comparison survives the one thing a resize always does to an opening: move it
 *  onto a new column key. */
function bodiesUnderOpenings(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
  exemptIds: ReadonlySet<string>,
): OverlapSet {
  const covered = new Set<string>();
  for (const opening of recomputeVoids(records, columns)) {
    for (const record of records) {
      // **The hoods of the column being resized are not bodies an opening "appears where".** One
      // hangs *over* its run rather than sitting in it (ADR 0039), and ADR 0035 decision 6 makes
      // that structural: it keeps its own width while the cabinets beneath it change, so it
      // overhangs the strip its own shrink just vacated by construction. Every shrink of a column
      // holding one would otherwise refuse — measured at a 600 mm hood over a run narrowing
      // 600 → 550.
      //
      // **Scoped to this column's hoods, not to every hood in the design** (5D2b QA finding Q2).
      // The global skip let a real phantom opening through: a hood in a *different*, overlapping
      // column had an opening grow across 250 mm of it and the resize was accepted, where before
      // the wave it was correctly refused — and §9 would then offer inserts into a slot the hood
      // physically occupies.
      //
      // Excluded from the *before* set as well as the *after* one, so the comparison stays a
      // difference (logic review R1.7) rather than becoming a rule about the world.
      if (exemptIds.has(record.id)) continue;
      if (standsInOpening(record, opening)) covered.add(record.id);
    }
  }
  return covered;
}

/** Overlapping, not merely adjoining — the same distinction `overlapsAlongWall` draws in
 *  `void-engine.ts`. Two runs that meet on a boundary share a coordinate and nothing else, and an
 *  opening that starts exactly where a body ends is the normal case rather than the defect. */
function standsInOpening(
  record: PlacementRecord,
  opening: VoidRecord,
): boolean {
  if (record.wall !== opening.wall) return false;
  const recordAlongM = alongWallM(record.wall, record.frame);
  const openingAlongM = alongWallM(opening.wall, opening);
  return (
    overlaps(recordAlongM, record.frame.w, openingAlongM, opening.w) &&
    overlaps(
      record.frame.y0 + record.frame.h / 2,
      record.frame.h,
      opening.y0 + opening.h / 2,
      opening.h,
    )
  );
}

/** Two centred spans overlap when the gap between their edges is positive by more than float noise. */
function overlaps(
  leftCentre: number,
  leftSize: number,
  rightCentre: number,
  rightSize: number,
): boolean {
  const gap =
    Math.min(leftCentre + leftSize / 2, rightCentre + rightSize / 2) -
    Math.max(leftCentre - leftSize / 2, rightCentre - rightSize / 2);
  return gap > OVERLAP_EPSILON_M;
}

/** ADR 0011 Gap D, read for the one command that legitimately moves a body between columns: every
 *  body this operation moved must land in a key the updated map actually holds. A body filed under
 *  a key nothing derived is a phantom column, and §4 would simply never see it — no void, no
 *  opening, no way back. Asserted rather than assumed, the same way `insertBody` asserts it. */
function refuseColumnDrift(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
  rebuilt: ReadonlyMap<string, DesignPlacement>,
  label: string,
): RejectionDetail | undefined {
  const drifted = records.find(
    (record) => rebuilt.has(record.id) && !columns.has(record.col),
  );
  if (!drifted) return undefined;
  return { code: "COLUMN_MISMATCH", params: { label } };
}
