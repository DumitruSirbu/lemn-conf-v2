// What width a column may be built at, and whether the requested one is legal for it: the extent its
// members occupy, the intersection of their declared sets and ranges, and the floor a hood puts under
// both (ADR 0031 rule 5, ADR 0035 decision 6 as amended).
import {
  acceptsWidthMm,
  resolveBuildableSizes,
  resolveWidthRangesMm,
  type BodyLabel,
} from "../catalog.js";
import type { BodyCatalog, WidthRangeMm } from "../void-engine.js";
import type { RejectionDetail } from "./rejection.js";
import type {
  ColumnMember,
  ColumnUnit,
  ExtentMm,
  SetWidthInput,
} from "./width-resize-model.js";

/** The span the column's members occupy along their wall: the union of their extents, leftmost left edge
 *  to rightmost right edge. Members need not be flush: a resize squares the column up to the target
 *  width (ADR 0035 decision 6).
 *
 *  The union, not the widest or the selected member, because the delta taken from the adjacent empty
 *  column is `target − extent.widthMm` and that column abuts the run at the union's edge: a narrower
 *  extent would spend space a member of this column stands in. Hoods are not in `members` and so not in
 *  the union: a hood may overhang its run and neither funds nor consumes its space. Total by
 *  construction: `members` is non-empty because the selected body is one of them. */
export function resolveColumnExtent(
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

/** ADR 0031 rule 5: a column's legal widths are the intersection of its members' declared sets. Every
 *  member narrows it, a `'fit'` member to its own floor and ceiling (ADR 0035 decision 2), because
 *  `acceptsWidthMm` reads the entry's ranges.
 *
 *  Each member's set is resolved through `resolveBuildableSizes`, the function §9 renders chips from,
 *  so a width the panel offers is one this command accepts for the member's own row; the intersection
 *  is the part §9 cannot yet derive from one selection (see `describe-selection.ts`).
 *
 *  Refusing the width the column already sits at keeps §9's tri-state honest: a chip is free iff the
 *  command succeeds. "The width it sits at" is the extent's, not the selected body's: a 450 under a 600
 *  has an extent of 600, so 600 is `WIDTH_UNCHANGED` though squaring up would move the 450. The stepper
 *  asks ±50 from the selected body's width, so each of its requests does move the extent. */
export function refuseIllegalWidth(
  input: SetWidthInput,
  label: BodyLabel,
  column: ColumnUnit,
  extent: ExtentMm,
): RejectionDetail | undefined {
  const sizesMm = intersectColumnWidths(input.catalog, column);
  if (!sizesMm.includes(input.widthMm)) {
    // The hood first, when the hood is the reason: the floor is folded into the column's bound, so
    // otherwise the sentence names the selected body's widths and never the hood, the one thing the
    // customer could delete to unlock the column.
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
        // The bound is the **column's** intersection, not this body's own — see `boundScope`.
        boundScope: "column",
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

/** The **bound** a column can be built within: every member's ranges, intersected, then raised to the
 *  floor any hood in the column sets (ADR 0035 decision 6).
 *
 *  `intersectColumnWidths` answers which *chips* the column offers, which the command gates on; this
 *  answers what the column can be **built** at, which is what the customer is told. A column of
 *  cabinetry offers thirteen chips while buildable anywhere across 200-800, so listing chips in a
 *  refusal denies widths the column accepts. Empty when the members share no overlap; the sentence
 *  then falls back to the chips. */
export function intersectColumnRanges(
  column: ColumnUnit,
): readonly WidthRangeMm[] {
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

/** A hood floors its column's width (ADR 0035 decision 6 as amended): the exemption is from
 *  *following* the column's width, never from *constraining* it. Without a floor a 600 mm hood over a
 *  run shrunk to 550 re-centres 25 mm left and lands inside the neighbouring cabinet, so the run is
 *  never narrower than the hood.
 *
 *  The hood's own width, not its catalogue floor: an 800 mm hood floors its column at 800 though the
 *  catalogue builds a hood at 600. The widest hood wins where a column holds two, and `0` floors
 *  nothing (`Math.max` of an empty list is `-Infinity`, hence the seed). */
function hoodWidthFloorMm(hoods: readonly ColumnMember[]): number {
  return Math.max(0, ...hoods.map((hood) => hood.widthMm));
}

export function intersectColumnWidths(
  catalog: BodyCatalog,
  column: ColumnUnit,
): readonly number[] {
  // A width has to be one somebody in the column offers, or the column would be resizable to a width
  // no chip renders. Every member bounds this list.
  const { members } = column;
  const offered = new Set(
    members.flatMap((member) =>
      resolveBuildableSizes(catalog, member.record.buildId),
    ),
  );
  // A hood is not a member and offers nothing, but it floors what the members may agree on
  // (`hoodWidthFloorMm`). Applied here so the one function that decides a column's legal widths decides
  // this too: `columnWidthChoices` renders from it and `refuseIllegalWidth` gates on it.
  const floorMm = hoodWidthFloorMm(column.hoods);
  return [...offered]
    .filter(
      (widthMm) =>
        widthMm >= floorMm &&
        members.every((member) => acceptsWidthMm(member.body, widthMm)),
    )
    .sort((left, right) => left - right);
}
