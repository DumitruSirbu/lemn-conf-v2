// What width a column may be built at, and whether the requested one is legal for it: the extent its
// members occupy, the intersection of their declared sets and ranges, and the floor a hood puts under
// both (ADR 0031 rule 5, ADR 0035 decision 6 as amended).
import {
  acceptsWidthMm,
  resolveBuildableSizes,
  resolveWidthRangesMm,
} from "../catalog.js";
import type { BodyCatalog, WidthRangeMm } from "../void-engine.js";
import type { RejectionDetail } from "./rejection.js";
import type {
  ColumnMember,
  ColumnUnit,
  ExtentMm,
  SetWidthInput,
} from "./width-resize-model.js";

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
export function refuseIllegalWidth(
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

export function intersectColumnWidths(
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
