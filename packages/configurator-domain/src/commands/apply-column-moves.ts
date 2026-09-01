// ADR 0031's arithmetic: the boundary between the run and the empty column beside it absorbs the
// whole delta, every member takes the same new centre, and both frozen columns move to new keys.
import { toMetres } from "../millimetres.js";
import { alongWallPosition, deriveColumnKeyAt } from "../module-grid.js";
import {
  withCurrentFullHeightMembers,
  type Column,
  type PlacementRecord,
} from "../void-engine.js";
import type {
  ColumnPlan,
  ColumnResize,
  EmptySpace,
  FrozenColumnMove,
  Resolved,
  SetWidthInput,
} from "./width-resize-model.js";

/** ADR 0031's arithmetic, and the whole of what the rule means: the column's outer edge — the one
 *  **away** from the empty space — holds, the empty column's far edge holds, and the boundary
 *  between them absorbs the whole delta. The two runs therefore still meet exactly where they met,
 *  so the run total is conserved and neither an overlap nor a gap is representable.
 *
 *  Every member takes the same new centre, which is rule 1 in one line: no body leaves the column.
 *  They need not have been flush going in — squaring up is what makes them flush coming out
 *  (ADR 0035 decision 6). */
export function planMoves(
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

/** Every coordinate this move writes must land on a whole millimetre (§2): the members' centres,
 *  which the document stores as integer `alongMm`, and the two frozen columns' centres, which
 *  ADR 0044 now records as an `emptyColumns` entry the moment either one is member-less.
 *
 *  **The two are different expressions and they decouple** — the reason this checks both since
 *  wave 5B2b, having checked only the members between logic review R1.5 and then:
 *
 *    member centre = `extent.centreMm + (requested − extent.widthMm) / 2` — whole iff the delta is even
 *    frozen centre = `extent.centreMm ± requested / 2`                    — whole iff `extent.centreMm` is
 *
 *  `resolveColumnExtent` takes the **union of the members' edges**, so two members offset by an odd
 *  millimetre give an odd extent width and a half-millimetre `centreMm`. The delta can still be
 *  even, so the members pass while the empty column lands between two millimetres — and
 *  `projectEmptyColumns` refuses such a centre rather than rounding it (rounding collapses two
 *  column keys into one). Without this half of the guard that refusal arrives as a **throw out of
 *  `setWidth`**, from a width chip with nothing catching on the path. Nothing in the catalogue
 *  guarantees the coupling: the seeded kitchen already carries 320 mm and 570 mm bodies.
 *
 *  A frozen move of zero width is skipped: rule 6 removes that key instead of recording it, so its
 *  centre is never written anywhere and refusing on it would reject a resize that consumes an empty
 *  column exactly.
 *
 *  R1.4 is unaffected — it asked whether an unfundable side should end the scan here, and it should:
 *  every quantity above is a fact about the two widths and the extent, so the other side answers
 *  identically. Returning immediately is therefore still right. */
function refuseFractionalCentres(move: ColumnResize): Resolved<ColumnResize> {
  const fractional = writtenCentres(move).find(
    (candidate) => !Number.isInteger(candidate.valueMm),
  );
  if (fractional === undefined) return { ok: true, value: move };
  return {
    ok: false,
    detail: { code: "NON_INTEGER_MILLIMETRES", params: fractional },
  };
}

/** Every centre the move is about to write, named by the field it lands in — `alongMm` on a
 *  placement, `centreMm` on a frozen column that ADR 0044 may record as an empty one. */
function writtenCentres(
  move: ColumnResize,
): readonly { readonly field: string; readonly valueMm: number }[] {
  return [
    ...move.members.map((member) => ({
      field: "alongMm",
      valueMm: member.alongMm,
    })),
    ...frozenMoves(move)
      .filter((frozen) => frozen.widthMm > 0)
      .map((frozen) => ({ field: "centreMm", valueMm: frozen.centreMm })),
  ];
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
export function moveFrozenColumns(
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
      ...alongWallPosition(frozen.column.wall, centreM),
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
export function frozenColumnKey(frozen: FrozenColumnMove): string {
  return deriveColumnKeyAt(frozen.column.wall, toMetres(frozen.centreMm));
}
