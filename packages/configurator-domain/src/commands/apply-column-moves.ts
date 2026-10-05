// ADR 0031's arithmetic: the boundary between the run and the empty column beside it absorbs the
// whole delta, every member takes the same new centre, and both frozen columns move to new keys.
import { toMetres } from "../millimetres.js";
import { alongWallPosition, deriveColumnKeyAt } from "../module-grid.js";
import { splitEmptySpanAtCap } from "../split-empty-span.js";
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

/** ADR 0031's arithmetic: the column's outer edge (away from the empty space) holds, the empty
 *  column's far edge holds, and the boundary between them absorbs the whole delta. The two runs still
 *  meet where they met, so the run total is conserved and neither an overlap nor a gap is
 *  representable. Every member takes the same new centre (no body leaves the column), squaring up
 *  members that were not flush (ADR 0035 decision 6). */
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
  // ADR 0052: the freed space, decomposed into columns none of which exceeds the ceiling. The first
  // piece sits against the cabinets the customer just moved and any overflow lands beyond it.
  const pieces = splitEmptySpanAtCap(
    emptyFarMm - outward * empty.remainderMm,
    emptyFarMm,
  );
  const [nearPiece, ...overflowPieces] = pieces;

  return chainMoveGuards(
    {
      label: plan.label,
      widthMm: input.widthMm,
      side: empty.side,
      members: [
        ...plan.members.map((member) => ({
          ...member,
          widthMm: input.widthMm,
          alongMm,
        })),
        // A hood the customer did not select keeps its own width and re-centres over the run beneath
        // it (ADR 0035 decision 6 as amended, ADR 0039 decision 4). A selected hood is a full member
        // of its column and moves with it; see `splitColumnMembers`.
        ...plan.hoods.map((hood) => ({ ...hood, alongMm })),
      ],
      // Both columns move as frozen extents; see `FrozenColumnMove`.
      resized: {
        column: plan.column,
        widthMm: input.widthMm,
        centreMm: alongMm,
      },
      // A remainder of zero yields no piece, and the zero-width move is what removes the key
      // (ADR 0031 rule 6), so it is written explicitly. Its centre is never read: `moveFrozenColumns`
      // and `refuseFractionalCentres` skip a move of zero width.
      empty: nearPiece
        ? { column: empty.column, ...nearPiece }
        : { column: empty.column, widthMm: 0, centreMm: emptyFarMm },
      // Every piece inherits the same frozen facts (`regions`, `top`, `d`, `ry`; ADR 0011 Gap D);
      // only `w`, the centre and the key differ.
      emptyOverflow: overflowPieces.map((piece) => ({
        column: empty.column,
        ...piece,
      })),
    },
    input.columns,
  );
}

/** Both guards a planned move must pass before anything is written. The arithmetic failure is
 *  reported before the geometric one: a fractional centre means the move was never well formed, a key
 *  collision that it was and lands somewhere it may not. */
function chainMoveGuards(
  move: ColumnResize,
  columns: ReadonlyMap<string, Column>,
): Resolved<ColumnResize> {
  const centred = refuseFractionalCentres(move);
  if (!centred.ok) return centred;
  return refuseKeyCollision(centred.value, columns);
}

/** §3.2's key is a position, so two columns cannot share one, and a move writes new keys for both the
 *  resized column and the empty one it spends. Writing over an occupied key deletes that column's
 *  frozen extent, and `refuseColumnDrift` cannot see it because the clobbered column's members still
 *  derive the key they always did. The pair is checked against each other too: a shrink that put both
 *  new keys on one position would write one and lose the other. */
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
  // A marker, not the sentence: the scan reads only the code here and tries the other edge, and
  // `refuseNoSideFunds` builds the customer-facing detail once no side is left. Filling `sides` here
  // would name one side while the other was untried.
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

/** Every coordinate this move writes must land on a whole millimetre (§2): the members' centres
 *  (integer `alongMm`) and the two frozen columns' centres, which ADR 0044 records as an
 *  `emptyColumns` entry once either is member-less.
 *
 *  The two decouple, so both are checked:
 *
 *    member centre = `extent.centreMm + (requested − extent.widthMm) / 2` — whole iff the delta is even
 *    frozen centre = `extent.centreMm ± requested / 2`                    — whole iff `extent.centreMm` is
 *
 *  `resolveColumnExtent` takes the union of the members' edges, so members offset by an odd
 *  millimetre give a half-millimetre `centreMm` while the delta stays even. `projectEmptyColumns`
 *  refuses such a centre rather than rounding it (rounding collapses two column keys), and unchecked
 *  that refusal would be a throw out of `setWidth`.
 *
 *  A frozen move of zero width is skipped: rule 6 removes its key, so its centre is never written.
 *  An unfundable side ends the scan at once: these quantities are facts about the two widths and the
 *  extent, so the other side answers identically. */
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

/** Both columns a resize touches, moved as the frozen extents ADR 0011 Gap D says they are:
 *  `regions`, `top`, `d` and `ry` come through untouched, and only `w`, the along-wall centre and the
 *  key move.
 *
 *  The empty column has no members for `rederiveTouchedColumns` to answer its key from, so its
 *  geometry survives only in the frozen map. The resized column must be carried too: after an earlier
 *  delete its membership has lost the member while the frozen map still carries its region, so
 *  re-deriving would drop the region and the freed opening would vanish with no way back.
 *
 *  Only `min(regions)` and `top` reach §4, so a frozen region whose member was rebuilt slightly taller
 *  changes nothing. A width of zero removes the key (rule 6); only the empty column can reach it.
 *
 *  Both old keys are deleted before either new one is set, so the passes cannot race. */
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
  // Last, because `hasFullHeightUnder` is a fact about a column's extent and both frozen moves must be
  // written before it can be re-answered.
  return withCurrentFullHeightMembers(updated, records);
}

/** Every frozen extent the move writes, in one list, so the two guards and the map rewrite agree on
 *  which columns a move touches. The overflow pieces carry the same source `column` as `empty`, so
 *  `moveFrozenColumns` deletes that key several times and `refuseKeyCollision` vacates it once; both
 *  are idempotent. */
function frozenMoves(move: ColumnResize): readonly FrozenColumnMove[] {
  return [move.resized, move.empty, ...move.emptyOverflow];
}

/** §3.2's key for a column at its new centre, derived as an occupied column's is: a body later
 *  inserted into an empty column must land under a key the map holds or `insertBody` refuses
 *  `COLUMN_MISMATCH`. */
export function frozenColumnKey(frozen: FrozenColumnMove): string {
  return deriveColumnKeyAt(frozen.column.wall, toMetres(frozen.centreMm));
}
