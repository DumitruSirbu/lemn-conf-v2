// DOM-001: the executable half of validation. `DesignSchema` decides whether a document has the
// right *shape*; this decides whether the domain can actually derive geometry from it. The two are
// separate because a document can be perfectly shaped and still name a body that does not exist,
// stand two placements on one id, or put a cabinet through the ceiling — and each of those reaches
// `derivePlacementRecords` as a thrown `UnknownBodyError` or a silently wrong scene.
//
// One validator, three seams: the API write path, the stored-row load path, and any future import.

import {
  acceptsWidthMm,
  resolveCatalogEquivalent,
  toInsertableBody,
} from "./catalog.js";
import type {
  Design,
  DesignPlacement,
  DesignRoom,
  DesignWall,
  EmptyColumn,
  StoredColumnExtent,
} from "./design.js";
import { describeBoundedIssues } from "./failure-text.js";
import {
  MIN_BODY_HEIGHT_MM,
  NARROWEST_CATALOG_WIDTH_MM,
} from "./design-bounds.js";
import { toMetres, toMillimetres } from "./millimetres.js";
import {
  placementExtendsPastOwnWall,
  wallLengthMm,
} from "./queries/overflowing-placements.js";
import { InvalidDesignError } from "./repository.js";
import {
  deriveColumnKeyAt,
  derivePlacementRecords,
  MAX_EMPTY_COLUMN_WIDTH_MM,
  type BodyCatalog,
  type PlacementRecord,
} from "./void-engine.js";

/** Stable, public, and deliberately value-free: a code and a path say what a genuine client got
 *  wrong without echoing the attacker-supplied document back into a response or a log line. */
export type DesignValidationCode =
  | "DUPLICATE_PLACEMENT_ID"
  | "UNKNOWN_BUILD_ID"
  | "WIDTH_NOT_BUILDABLE"
  | "BODY_TOO_NARROW"
  | "BODY_TOO_SHORT"
  | "PLACEMENT_BEFORE_WALL_START"
  | "PLACEMENT_PAST_WALL_END"
  | "PLACEMENT_ABOVE_ROOM"
  | "EMPTY_COLUMN_INVERTED"
  | "EMPTY_COLUMN_BEFORE_WALL_START"
  | "EMPTY_COLUMN_PAST_WALL_END"
  | "EMPTY_COLUMN_ABOVE_ROOM"
  | "EMPTY_COLUMN_DEEPER_THAN_ROOM"
  | "EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT"
  | "EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN"
  | "EMPTY_COLUMN_OVERLAPS_PLACEMENT"
  | "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN"
  | "EMPTY_COLUMN_WIDER_THAN_CAP"
  | "COLUMN_EXTENT_HAS_NO_MEMBER"
  | "COLUMN_EXTENT_EXCLUDES_MEMBER"
  | "COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT"
  | "COLUMN_EXTENT_BEFORE_WALL_START"
  | "COLUMN_EXTENT_PAST_WALL_END"
  | "COLUMN_EXTENT_ABOVE_ROOM"
  | "COLUMN_EXTENT_DEEPER_THAN_ROOM"
  | "COLUMN_EXTENT_OVERLAPS_PLACEMENT"
  | "COLUMN_EXTENT_OVERLAPS_EMPTY_COLUMN"
  | "COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT"
  | "TIMESTAMPS_OUT_OF_ORDER";

export interface DesignValidationIssue {
  readonly code: DesignValidationCode;
  readonly path: string;
}

/**
 * Every reason this design cannot be executed against this catalogue, or an empty list.
 *
 * A query: it reports, it never throws and never mutates. `assertDesignValidForCatalog` is the
 * command built on it, for the seams that want a failure rather than a list.
 */
export function validateDesignForCatalog(
  design: Design,
  catalog: BodyCatalog,
): readonly DesignValidationIssue[] {
  return [
    ...findDuplicatePlacementIds(design.placements),
    ...findTimestampIssues(design),
    ...design.placements.flatMap((placement, index) =>
      findPlacementIssues(placement, `placements.${String(index)}`, {
        room: design.room,
        catalog,
      }),
    ),
    ...findEmptyColumnIssues(design),
    ...findColumnExtentIssues(design, catalog),
  ];
}

/** The same rule, for a caller whose only sane response to a bad document is to fail: the stored-row
 *  load path, where an invalid row must surface as a handled domain error rather than as an
 *  `UnknownBodyError` thrown at the client mid-hydration. */
export function assertDesignValidForCatalog(
  design: Design,
  catalog: BodyCatalog,
): void {
  const issues = fatalDesignValidationIssues(
    validateDesignForCatalog(design, catalog),
  );
  if (issues.length > 0) {
    throw new InvalidDesignError(describeDesignValidationIssues(issues));
  }
}

/** What a finding does to a load or a write: a `"refusal"` stops it, a `"mark"` is reported and
 *  carried. Both severities stay in the complete diagnostic report — migration needs the pre/post
 *  fact and visible surfaces need the mark. */
export type DesignIssueSeverity = "mark" | "refusal";

/**
 * The severity of every validation code, declared per code rather than filtered by a list.
 *
 * **The membership rule (ADR 0069 decision 2), which is the artefact to maintain and not this
 * table.** A finding is a `"mark"` if and only if the single fact it asserts is that a run reaches
 * past the end of the wall it stands on. Every other finding is a `"refusal"`. A finding that
 * asserts that fact *together with* any other fact is a refusal until it is split into codes that
 * each assert one fact — which is why `COLUMN_EXTENT_OUTSIDE_ROOM` became four codes.
 *
 * The map is **total**, so adding a member to `DesignValidationCode` without classifying it fails
 * to compile. A filter list cannot be wrong about a code it was never shown, and a forgotten member
 * at two seams is exactly the defect ADR 0069 records.
 *
 * Severity is declared and never inferred from the code's spelling: a name is a label, not a rule,
 * and the next code meaning "past the wall" may not be spelled that way (ADR 0061's pattern).
 */
export const DESIGN_ISSUE_SEVERITY_BY_CODE: Readonly<
  Record<DesignValidationCode, DesignIssueSeverity>
> = {
  DUPLICATE_PLACEMENT_ID: "refusal",
  UNKNOWN_BUILD_ID: "refusal",
  WIDTH_NOT_BUILDABLE: "refusal",
  BODY_TOO_NARROW: "refusal",
  BODY_TOO_SHORT: "refusal",
  PLACEMENT_BEFORE_WALL_START: "refusal",
  // ADR 0065: the customer's body stays where they put it, saves, and resumes.
  PLACEMENT_PAST_WALL_END: "mark",
  PLACEMENT_ABOVE_ROOM: "refusal",
  EMPTY_COLUMN_INVERTED: "refusal",
  EMPTY_COLUMN_BEFORE_WALL_START: "refusal",
  // The same run after its bodies were removed. ADR 0065 tells the customer to remove something;
  // refusing this refuses precisely that remedy.
  EMPTY_COLUMN_PAST_WALL_END: "mark",
  EMPTY_COLUMN_ABOVE_ROOM: "refusal",
  EMPTY_COLUMN_DEEPER_THAN_ROOM: "refusal",
  EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT: "refusal",
  EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN: "refusal",
  EMPTY_COLUMN_OVERLAPS_PLACEMENT: "refusal",
  EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN: "refusal",
  EMPTY_COLUMN_WIDER_THAN_CAP: "refusal",
  COLUMN_EXTENT_HAS_NO_MEMBER: "refusal",
  COLUMN_EXTENT_EXCLUDES_MEMBER: "refusal",
  COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT: "refusal",
  COLUMN_EXTENT_BEFORE_WALL_START: "refusal",
  // The frozen extent of the column holding a marked body, which the store rewrites on every
  // command. Refusing it is refusing the second save.
  COLUMN_EXTENT_PAST_WALL_END: "mark",
  COLUMN_EXTENT_ABOVE_ROOM: "refusal",
  COLUMN_EXTENT_DEEPER_THAN_ROOM: "refusal",
  COLUMN_EXTENT_OVERLAPS_PLACEMENT: "refusal",
  COLUMN_EXTENT_OVERLAPS_EMPTY_COLUMN: "refusal",
  COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT: "refusal",
  TIMESTAMPS_OUT_OF_ORDER: "refusal",
};

/** The validation findings that make a design unsafe to load or write, by the declaration above. */
export function fatalDesignValidationIssues(
  issues: readonly DesignValidationIssue[],
): readonly DesignValidationIssue[] {
  return issues.filter(
    (issue) => DESIGN_ISSUE_SEVERITY_BY_CODE[issue.code] === "refusal",
  );
}

/** The shape of a domain-validation failure, through the one describer both halves of this
 *  project's validation now share. */
export function describeDesignValidationIssues(
  issues: readonly DesignValidationIssue[],
): string {
  return describeBoundedIssues(
    issues.map((issue) => `${issue.path}:${issue.code}`),
  );
}

/**
 * ADR 0044's half of the executable contract: a recorded empty space that the document's own
 * placements contradict.
 *
 * Every command writes both halves together, so an entry standing in occupied space can only reach
 * here from a hand-edited or hostile document — and DOM-001's lesson is that such a document is
 * refused at the write seam and the load seam rather than left to make a derivation wrong.
 */
function findEmptyColumnIssues(design: Design): DesignValidationIssue[] {
  const emptyColumns = design.emptyColumns ?? [];
  return [
    ...findUncontainedEmptyColumns(emptyColumns, design.room),
    ...findInvertedEmptyColumns(emptyColumns),
    ...findOversizedEmptyColumns(emptyColumns),
    ...findWallOverlaps(design),
    ...findCollidingColumnKeys(design.placements, emptyColumns),
  ];
}

/**
 * ADR 0053's half of the executable contract: a recorded frozen extent that the document's own
 * placements contradict.
 *
 * **This is what replaced a disjointness proof, so it carries the weight that proof used to.**
 * Until this record, the stored half of the frozen map could never land on a key the placements
 * produced, and `deriveColumns` could therefore never overwrite a derived column. `columnExtents`
 * lands on exactly those keys on purpose, so what makes the overwrite safe is proved here instead:
 * every placement filed under an entry's key lies **inside** that entry. With that, restoring an
 * extent can only widen a column — it can never lose a member, and it can never publish an opening
 * over a body, which is the one failure this array could otherwise cause.
 *
 * An entry with no member at all is refused rather than restored: on a key the placements do not
 * hold, a frozen extent is an `emptyColumns` entry wearing the wrong array's name, and the nine
 * refusals that govern that array — overlap, key collision, the width ceiling — would not be asked
 * of it.
 *
 * **Two rules the empty-column half does not need, and why they are here.** An entry may not share
 * a key with another entry, because the second would overwrite the first in the map and a space the
 * document records would not exist in the derivation. And an entry is held to the room, because
 * containment bounds it only from **below**: a hostile document may declare an extent that contains
 * its members and still reaches ten metres up or out through the shell, which is review finding F2's
 * defect arriving on a new field.
 *
 * There is deliberately no inversion rule. A `topMm` at or below `y0Mm` cannot contain a member of
 * positive height, so `COLUMN_EXTENT_EXCLUDES_MEMBER` already refuses every inverted entry — and
 * an entry with no member is refused before the question is asked.
 */
function findColumnExtentIssues(
  design: Design,
  catalog: BodyCatalog,
): DesignValidationIssue[] {
  const columnExtents = design.columnExtents ?? [];
  if (columnExtents.length === 0) return [];
  const membersByKey = describeMembersByColumnKey(design, catalog);
  // A document naming a body no catalogue entry covers is already refused by `UNKNOWN_BUILD_ID`,
  // and the containment rule cannot be asked without the catalogue's own depth declaration. Skipping
  // it here reports one fault instead of two on a document that is refused either way.
  if (!membersByKey) return [];
  return [
    ...findCollidingColumnExtentKeys(columnExtents),
    ...columnExtents.flatMap((extent, index) =>
      findOneColumnExtentIssues(extent, index, {
        membersByKey,
        room: design.room,
      }),
    ),
  ];
}

/** What the containment rule needs to know about one placement, in the millimetres the document is
 *  written in — read off the **derived record** rather than off the placement, because the
 *  derivation is what a stored extent overrides: `frameHeightMm` and the declared occupied depth
 *  both part company with what the placement itself says (ADR 0018, ADR 0036, ADR 0039). */
interface MemberSpan {
  readonly floorMm: number;
  readonly topMm: number;
}

interface ColumnExtentContext {
  readonly membersByKey: ReadonlyMap<string, MemberSpan[]>;
  readonly room: DesignRoom;
}

function findOneColumnExtentIssues(
  extent: StoredColumnExtent,
  index: number,
  context: ColumnExtentContext,
): DesignValidationIssue[] {
  const path = `columnExtents.${String(index)}`;
  const members = context.membersByKey.get(columnExtentKey(extent)) ?? [];
  if (members.length === 0) {
    return [issueAt("COLUMN_EXTENT_HAS_NO_MEMBER", path)];
  }
  return [
    ...findExtentRoomIssues(extent, index, context.room),
    ...(members.every((member) => extentContains(extent, member))
      ? []
      : [issueAt("COLUMN_EXTENT_EXCLUDES_MEMBER", path)]),
  ];
}

/**
 * The two ways a member can stand outside the extent that claims it: below its floor, or above its
 * top. Asked in whole millimetres, because that is the resolution both sides are written in — the
 * document's own for the extent, and a rounded derivation for the member, whose sub-millimetre float
 * noise is not a containment breach.
 *
 * **Two, and not the four an extent has fields for. The other two are not invariants of the map this
 * validates, measured rather than assumed.**
 *
 * - *Along the wall.* §3.2 derives a column's `w` as the **MIN** over its members' widths, so a
 *   column is routinely narrower than a body it holds — the seeded `A|1.30` is 500 mm wide and
 *   carries a 600 mm base. The opposite is false too: a MIN over the original members stays frozen
 *   when some of them are deleted, so an extent is narrower than every remaining member after a
 *   partial delete. Neither direction is a rule.
 * - *Depth.* ADR 0011 Gap D freezes `d`, and a resize rebuilds its members with freshly measured
 *   seats — so a member's occupied depth can grow past the extent that holds it while the extent
 *   stays where Gap D put it. Measured on the shipped kitchen: shrinking the pantry leaves `B|1.77`
 *   frozen at 600 mm deep holding a top box that occupies 639 mm. Refusing that would refuse a
 *   document the product itself writes.
 *
 * Both are bounded from above by the room instead (`findExtentRoomIssues`), which is what stops an
 * extent reaching across the wall or out through the shell.
 *
 * **The vertical pair is the one that carries the guarantee**, and it is monotone by construction:
 * the floor is a MIN over the members' and the top a MAX, so a stored extent that passes this can
 * only ever hold *more* space than the placements imply. That is what makes restoring it able to
 * widen a column and unable to lose the space a member stands in.
 */
function extentContains(
  extent: StoredColumnExtent,
  member: MemberSpan,
): boolean {
  return extent.y0Mm <= member.floorMm && extent.topMm >= member.topMm;
}

/** The same room bound a placement and an empty column are held to, through the same rule and now
 *  under the same four names the `emptyColumns` half has carried since ADR 0044.
 *
 *  **The edge is load-bearing and belongs in the code, not only in the path.** The four edges no
 *  longer share a severity — past the wall's end is a mark and the other three refuse (ADR 0069
 *  decision 3) — so a single "this extent is not inside the room" code cannot be classified at all
 *  without reading the path. An extent breaching two edges emits two findings, and the fatal one
 *  still refuses it while the mark stays true. */
function findExtentRoomIssues(
  extent: StoredColumnExtent,
  index: number,
  room: DesignRoom,
): DesignValidationIssue[] {
  const path = `columnExtents.${String(index)}`;
  const breaches = findContainmentBreaches(
    toEmptyColumnSpan(extent, index),
    room,
  );
  return [
    ...(breaches.startsBeforeWall
      ? [issueAt("COLUMN_EXTENT_BEFORE_WALL_START", `${path}.alongMm`)]
      : []),
    ...(breaches.endsPastWall
      ? [issueAt("COLUMN_EXTENT_PAST_WALL_END", `${path}.alongMm`)]
      : []),
    ...(breaches.risesAboveRoom
      ? [issueAt("COLUMN_EXTENT_ABOVE_ROOM", `${path}.topMm`)]
      : []),
    ...(reachesPastRoomAcrossWall(extent, room)
      ? [issueAt("COLUMN_EXTENT_DEEPER_THAN_ROOM", `${path}.depthMm`)]
      : []),
  ];
}

/** Two entries addressing one slot in the column map: `deriveColumns` would restore both and keep
 *  the last, so one of the extents the document records would not exist in the derivation. Named on
 *  both sides for the reason `findCollidingColumnKeys` names both — neither entry is the offender
 *  on its own. */
function findCollidingColumnExtentKeys(
  columnExtents: readonly StoredColumnExtent[],
): DesignValidationIssue[] {
  const owners = new Map<string, number>();
  const issues: DesignValidationIssue[] = [];
  columnExtents.forEach((extent, index) => {
    const key = columnExtentKey(extent);
    const first = owners.get(key);
    if (first === undefined) {
      owners.set(key, index);
      return;
    }
    issues.push(
      issueAt(
        "COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT",
        `columnExtents.${String(first)}`,
      ),
      issueAt(
        "COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT",
        `columnExtents.${String(index)}`,
      ),
    );
  });
  return issues;
}

function columnExtentKey(extent: StoredColumnExtent): string {
  return deriveColumnKeyAt(extent.wall, toMetres(extent.alongMm));
}

/**
 * Every placement, as the containment rule sees it, grouped under the column key the derivation
 * files it under — or `undefined` when the catalogue cannot answer for one of them.
 *
 * `derivePlacementRecords` is the one function that knows which key a placement lands on and how
 * far up the space it fills reaches — `frameHeightMm` parts company with the height the placement
 * declares — so asking it here is what keeps this rule and `deriveColumns` reading the same numbers.
 * It throws only for a `buildId` the catalogue does not hold, which the caller has already
 * excluded.
 */
function describeMembersByColumnKey(
  design: Design,
  catalog: BodyCatalog,
): ReadonlyMap<string, MemberSpan[]> | undefined {
  if (
    design.placements.some((placement) => !catalog.has(placement.body.buildId))
  ) {
    return undefined;
  }
  const grouped = new Map<string, MemberSpan[]>();
  for (const record of derivePlacementRecords(design, catalog)) {
    const bucket = grouped.get(record.col);
    if (bucket) bucket.push(toMemberSpan(record));
    else grouped.set(record.col, [toMemberSpan(record)]);
  }
  return grouped;
}

function toMemberSpan(record: PlacementRecord): MemberSpan {
  return {
    floorMm: toMillimetres(record.frame.y0),
    topMm: toMillimetres(record.frame.y0 + record.frame.h),
  };
}

/**
 * ADR 0052: no empty column is wider than `MAX_EMPTY_COLUMN_WIDTH_MM`.
 *
 * **This refuses a column, never a space.** ADR 0037 and ADR 0043 both stand — a span of any width
 * may be left empty, and a document carrying a 1000 mm gap as an 800 and a 200 passes here. What is
 * refused is the *single entry* recording more than the ceiling, because it publishes an opening no
 * `widthFlex: 'fit'` body can be built into (`WIDTH_NOT_SUPPORTED`) and no command in the product
 * can produce one: the merge declines past the ceiling and a shrink splits at it.
 *
 * **The stored-row seam does not reach this for a version 1 document**, and that is deliberate:
 * `migrateFromV1` splits an oversized entry before the validator sees it, so an existing share link
 * loads as the columns the new rule allows rather than breaking. A version 2 document has no such
 * excuse — it was written under this rule — so it is refused here and, through the same function, at
 * the API write seam. DOM-001: both seams refuse together.
 */
function findOversizedEmptyColumns(
  emptyColumns: readonly EmptyColumn[],
): DesignValidationIssue[] {
  return emptyColumns.flatMap((emptyColumn, index) =>
    emptyColumn.widthMm > MAX_EMPTY_COLUMN_WIDTH_MM
      ? [
          issueAt(
            "EMPTY_COLUMN_WIDER_THAN_CAP",
            `emptyColumns.${String(index)}.widthMm`,
          ),
        ]
      : [],
  );
}

/** The room bounds a space exactly as it bounds a body, through the one containment rule and its
 *  one wall-run bound (`findContainmentBreaches`). An empty column that was held only to
 *  `MAX_DESIGN_DIMENSION_MM` was a space the derivation would publish outside the shell — a column
 *  nine metres along a 3.6 m wall, with openings a body can then be offered into. */
function findUncontainedEmptyColumns(
  emptyColumns: readonly EmptyColumn[],
  room: DesignRoom,
): DesignValidationIssue[] {
  return emptyColumns.flatMap((emptyColumn, index) => {
    const path = `emptyColumns.${String(index)}`;
    const breaches = findContainmentBreaches(
      toEmptyColumnSpan(emptyColumn, index),
      room,
    );
    return [
      ...(breaches.startsBeforeWall
        ? [issueAt("EMPTY_COLUMN_BEFORE_WALL_START", `${path}.alongMm`)]
        : []),
      ...(breaches.endsPastWall
        ? [issueAt("EMPTY_COLUMN_PAST_WALL_END", `${path}.alongMm`)]
        : []),
      ...(breaches.risesAboveRoom
        ? [issueAt("EMPTY_COLUMN_ABOVE_ROOM", `${path}.topMm`)]
        : []),
      ...(reachesPastRoomAcrossWall(emptyColumn, room)
        ? [issueAt("EMPTY_COLUMN_DEEPER_THAN_ROOM", `${path}.depthMm`)]
        : []),
    ];
  });
}

/**
 * The only depth in the document a client chooses.
 *
 * A placement has no depth of its own: `deriveFrame` takes it from the catalogue definition, or
 * from a `seatDepthMm` the insert command measured off a body it actually built. An empty column
 * carries its own, so a token holder may PUT a ten-metre depth — the schema bounds it only by
 * `MAX_DESIGN_DIMENSION_MM`, and `deriveCabinetWorldTransform` refuses nothing above zero — and
 * every later viewer of that share link renders a space protruding out through the shell.
 *
 * The bound is the wall's **own** normal run: §2 sends wall A's depth into the room's depth and
 * wall B's into its width, and no shipped body comes near either.
 *
 * Per-wall, and the along-wall bound agrees — see `wallLengthMm`.
 */
function reachesPastRoomAcrossWall(
  emptyColumn: EmptyColumn,
  room: DesignRoom,
): boolean {
  return (
    emptyColumn.depthMm >
    (emptyColumn.wall === "A" ? room.depthMm : room.widthMm)
  );
}

/**
 * Two spaces, or a space and a run of bodies, that the column map cannot hold apart.
 *
 * §3.2 addresses the map by `deriveColumnKeyAt`, which is a **coarser resolution than the document
 * it is derived from**: the key rounds a metre value to two places, so it is 10 mm granular while
 * `alongMm` is whole millimetres. Entries at 3576 and 3578 are two spaces by every rule this
 * validator has — ADR 0043 leaves an empty column no width floor, so they are legal and they do not
 * overlap — and they are one key. The same is true of a space recorded at an occupied column's
 * centre in a band the placements do not reach, which the overlap rule accepts because the two
 * never meet vertically.
 *
 * Whichever entry loses is a space the document records and the derivation does not have. That is
 * precisely what validation exists to prevent, so it is a refusal here rather than a drop in
 * `deriveColumns`.
 */
function findCollidingColumnKeys(
  placements: readonly DesignPlacement[],
  emptyColumns: readonly EmptyColumn[],
): DesignValidationIssue[] {
  const placementKeys = new Set(
    placements.map((placement) =>
      deriveColumnKeyAt(placement.wall, toMetres(placement.alongMm)),
    ),
  );
  const keyOwners = new Map<string, number[]>();
  const issues: DesignValidationIssue[] = [];
  emptyColumns.forEach((emptyColumn, index) => {
    const key = deriveColumnKeyAt(
      emptyColumn.wall,
      toMetres(emptyColumn.alongMm),
    );
    const path = `emptyColumns.${String(index)}`;
    if (placementKeys.has(key)) {
      issues.push(issueAt("EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT", path));
    }
    const owners = keyOwners.get(key) ?? [];
    // Both sides are named, not just the later one: neither entry is the offender on its own, and
    // a caller told only about the second would move it and collide with the first all over again.
    if (owners.length === 1) {
      issues.push(
        issueAt(
          "EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN",
          `emptyColumns.${String(owners[0] ?? 0)}`,
        ),
      );
    }
    if (owners.length > 0) {
      issues.push(issueAt("EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN", path));
    }
    keyOwners.set(key, [...owners, index]);
  });
  return issues;
}

/** A top at or below the floor is not a thin space, it is an extent with no height: §4 would read
 *  it as a column whose opening runs backwards. It is also how the overlap rule below would be
 *  bypassed — an inverted interval vertically overlaps nothing — so it is refused before the
 *  overlap sweep ever reads it. */
function findInvertedEmptyColumns(
  emptyColumns: readonly EmptyColumn[],
): DesignValidationIssue[] {
  const issues: DesignValidationIssue[] = [];
  emptyColumns.forEach((emptyColumn, index) => {
    if (emptyColumn.topMm <= emptyColumn.y0Mm) {
      issues.push(
        issueAt("EMPTY_COLUMN_INVERTED", `emptyColumns.${String(index)}.topMm`),
      );
    }
  });
  return issues;
}

/** One run of wall, as the overlap sweep compares them: how far it reaches along its wall and how
 *  far up it. A placement carries no index, which is what makes a placement-on-placement overlap
 *  unreportable — this wave adds a refusal for empty columns and must not add one for the
 *  placements, which have never been checked against each other. */
interface WallSpan {
  readonly wall: DesignWall;
  readonly alongStartMm: number;
  readonly alongEndMm: number;
  readonly floorMm: number;
  readonly topMm: number;
  readonly kind: "placement" | "emptyColumn" | "columnExtent";
  /** Which column this run belongs to — what lets an extent be compared with every placement
   *  **except** the ones it legitimately holds, which are the ones filed under its own key. */
  readonly columnKey: string;
  readonly index: number;
}

/**
 * Sorted per wall and swept, not compared pairwise.
 *
 * At the caps this document may carry that is 1262 empty columns and 168 extents against 168
 * placements, including the overwhelming majority that carry neither array. Sorting once and keeping
 * only the spans still open at the current coordinate makes an honest document linear in its own
 * size, which is what lets the caps bound the derivation rather than merely bound the document.
 *
 * **Both stored arrays are swept, by the same rule.** A recorded space standing where a body stands
 * is a document the domain cannot execute, and so is a recorded *extent* reaching across a column it
 * does not own: `recomputeVoids` builds what is taken from `membersByColumn.get(column.key)` — that
 * column's **own** members and nothing else — so a 2000 mm extent on a 600 mm column publishes
 * openings straight through its neighbours' bodies, selectable and insertable into. Containment is a
 * per-key vertical proof and says nothing across keys. This sweep is what says it.
 */
function findWallOverlaps(design: Design): DesignValidationIssue[] {
  const emptyColumns = design.emptyColumns ?? [];
  const columnExtents = design.columnExtents ?? [];
  if (emptyColumns.length === 0 && columnExtents.length === 0) return [];
  const spans = [
    ...design.placements.map(toPlacementSpan),
    ...emptyColumns.map(toEmptyColumnSpan),
    ...columnExtents.map(toColumnExtentSpan),
  ];
  return [...groupSpansByWall(spans).values()].flatMap(findOverlapsOnOneWall);
}

function findOverlapsOnOneWall(spans: WallSpan[]): DesignValidationIssue[] {
  const issues = new Map<string, DesignValidationIssue>();
  const open: WallSpan[] = [];
  for (const span of [...spans].sort(
    (a, b) => a.alongStartMm - b.alongStartMm,
  )) {
    dropSpansClosedBefore(open, span.alongStartMm);
    for (const earlier of open) {
      if (overlapVertically(earlier, span))
        recordOverlap(issues, earlier, span);
    }
    open.push(span);
  }
  return [...issues.values()];
}

/** Abutting is not overlapping. ADR 0046 merges two spaces that meet at a coordinate, so
 *  `a.end === b.start` is the input that feature reads and refusing it would make the merge
 *  unrepresentable — the comparison is `<=`, never `<`. */
function dropSpansClosedBefore(open: WallSpan[], alongMm: number): void {
  for (let index = open.length - 1; index >= 0; index -= 1) {
    if ((open[index]?.alongEndMm ?? 0) <= alongMm) open.splice(index, 1);
  }
}

/** Two runs at the same along-wall coordinate but different heights — a base cabinet and an empty
 *  space in the wall band above it — share no space at all, so the vertical question is as much
 *  part of the overlap as the horizontal one. Strictly positive for the same reason as above. */
function overlapVertically(first: WallSpan, second: WallSpan): boolean {
  return (
    Math.min(first.topMm, second.topMm) -
      Math.max(first.floorMm, second.floorMm) >
    0
  );
}

/** An extent standing over a body filed under its **own** key is not an overlap — holding that body
 *  is what the extent is for, and `extentContains` is what judges those. Every other pair is
 *  compared. */
function ownsTheMemberItOverlaps(first: WallSpan, second: WallSpan): boolean {
  const [extent, other] =
    first.kind === "columnExtent" ? [first, second] : [second, first];
  return (
    extent.kind === "columnExtent" &&
    other.kind === "placement" &&
    other.columnKey === extent.columnKey
  );
}

function recordOverlap(
  issues: Map<string, DesignValidationIssue>,
  first: WallSpan,
  second: WallSpan,
): void {
  if (ownsTheMemberItOverlaps(first, second)) return;
  for (const [span, other] of [
    [first, second],
    [second, first],
  ] as const) {
    const code = overlapCodeFor(span.kind, other.kind);
    if (!code) continue;
    const issue = issueAt(
      code,
      `${arrayNameOf(span.kind)}.${String(span.index)}`,
    );
    issues.set(`${code}:${issue.path}`, issue);
  }
}

/** The code an overlapping run is named with, or nothing when it is not named at all — a placement
 *  never is, which is what keeps a placement-on-placement overlap unreportable.
 *
 *  **An empty column gains no new code.** ADR 0044's nine refusals govern `emptyColumns` and this
 *  record leaves their meaning exactly as it found it, so a space overlapping an extent is reported
 *  once, on the extent: the entry this record added, and the one whose author has to move it. */
function overlapCodeFor(
  kind: WallSpan["kind"],
  otherKind: WallSpan["kind"],
): DesignValidationCode | undefined {
  if (kind === "placement") return undefined;
  if (kind === "emptyColumn") {
    if (otherKind === "columnExtent") return undefined;
    return otherKind === "emptyColumn"
      ? "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN"
      : "EMPTY_COLUMN_OVERLAPS_PLACEMENT";
  }
  if (otherKind === "placement") return "COLUMN_EXTENT_OVERLAPS_PLACEMENT";
  return otherKind === "emptyColumn"
    ? "COLUMN_EXTENT_OVERLAPS_EMPTY_COLUMN"
    : "COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT";
}

function arrayNameOf(kind: WallSpan["kind"]): string {
  return kind === "columnExtent" ? "columnExtents" : "emptyColumns";
}

/** §12: `alongMm` is the centre of the run, on a placement and on an empty column alike, so both
 *  reach the sweep as the same kind of interval. */
function toPlacementSpan(placement: DesignPlacement, index = 0): WallSpan {
  const halfWidthMm = placement.body.widthMm / 2;
  return {
    wall: placement.wall,
    alongStartMm: placement.alongMm - halfWidthMm,
    alongEndMm: placement.alongMm + halfWidthMm,
    floorMm: placement.y0Mm,
    topMm: placement.y0Mm + placement.body.heightMm,
    kind: "placement",
    columnKey: deriveColumnKeyAt(placement.wall, toMetres(placement.alongMm)),
    index,
  };
}

function toEmptyColumnSpan(emptyColumn: EmptyColumn, index: number): WallSpan {
  return toStoredSpan(emptyColumn, index, "emptyColumn");
}

function toColumnExtentSpan(
  extent: StoredColumnExtent,
  index: number,
): WallSpan {
  return toStoredSpan(extent, index, "columnExtent");
}

/** One builder for both stored arrays, because they are one wire shape — the kind is what the sweep
 *  judges them by. */
function toStoredSpan(
  entry: EmptyColumn,
  index: number,
  kind: "emptyColumn" | "columnExtent",
): WallSpan {
  const halfWidthMm = entry.widthMm / 2;
  return {
    wall: entry.wall,
    alongStartMm: entry.alongMm - halfWidthMm,
    alongEndMm: entry.alongMm + halfWidthMm,
    floorMm: entry.y0Mm,
    topMm: entry.topMm,
    kind,
    columnKey: deriveColumnKeyAt(entry.wall, toMetres(entry.alongMm)),
    index,
  };
}

/** Both walls originate at the same corner and walk their own axis (§2), so the same along-wall
 *  coordinate on wall A and on wall B are two different places and are never compared. */
function groupSpansByWall(
  spans: readonly WallSpan[],
): Map<DesignWall, WallSpan[]> {
  const grouped = new Map<DesignWall, WallSpan[]>();
  for (const span of spans) {
    const bucket = grouped.get(span.wall);
    if (bucket) bucket.push(span);
    else grouped.set(span.wall, [span]);
  }
  return grouped;
}

interface PlacementContext {
  readonly room: DesignRoom;
  readonly catalog: BodyCatalog;
}

/** §5.2 mints ids as the next free `n<index>` and every id-keyed derivation is a `Map` or a `Set`
 *  (`haveSameMembers` in `void-engine.ts`), so two placements sharing an id are not independently
 *  representable: one of them silently disappears from every membership comparison. */
function findDuplicatePlacementIds(
  placements: readonly DesignPlacement[],
): DesignValidationIssue[] {
  const seen = new Set<string>();
  const issues: DesignValidationIssue[] = [];
  placements.forEach((placement, index) => {
    if (seen.has(placement.id)) {
      issues.push(
        issueAt("DUPLICATE_PLACEMENT_ID", `placements.${String(index)}`),
      );
    }
    seen.add(placement.id);
  });
  return issues;
}

/** A document that claims it was last written before it was created is not a design anyone edited;
 *  it is a forged or corrupted row, and every "is this newer?" comparison downstream reads it. */
function findTimestampIssues(design: Design): DesignValidationIssue[] {
  const createdAtMs = Date.parse(design.createdAt);
  const updatedAtMs = Date.parse(design.updatedAt);
  return updatedAtMs < createdAtMs
    ? [issueAt("TIMESTAMPS_OUT_OF_ORDER", "updatedAt")]
    : [];
}

function findPlacementIssues(
  placement: DesignPlacement,
  path: string,
  context: PlacementContext,
): DesignValidationIssue[] {
  // Catalogue membership first and alone: every later rule reads the entry, and a placement naming
  // no entry is the one that reaches the client as `UnknownBodyError` (AV-3).
  if (!context.catalog.has(placement.body.buildId)) {
    return [issueAt("UNKNOWN_BUILD_ID", `${path}.body.buildId`)];
  }
  return [
    ...findBodyDimensionIssues(placement, path),
    ...findCatalogWidthIssues(placement, path, context.catalog),
    ...findContainmentIssues(placement, path, context.room),
  ];
}

/** The floors no catalogue row can go under, whatever it declares: the narrowest width the
 *  catalogue offers, and §4's smallest span that ever becomes an opening. */
function findBodyDimensionIssues(
  placement: DesignPlacement,
  path: string,
): DesignValidationIssue[] {
  const issues: DesignValidationIssue[] = [];
  if (placement.body.widthMm < NARROWEST_CATALOG_WIDTH_MM) {
    issues.push(issueAt("BODY_TOO_NARROW", `${path}.body.widthMm`));
  }
  if (placement.body.heightMm < MIN_BODY_HEIGHT_MM) {
    issues.push(issueAt("BODY_TOO_SHORT", `${path}.body.heightMm`));
  }
  return issues;
}

/**
 * The width rule the entry itself states, asked through the one predicate both width paths already
 * use (`acceptsWidthMm`), so a stored width is judged by exactly the rule a resize is.
 *
 * A body with no catalogue equivalent — the four corner returns and legs, which §13.1 makes
 * structural — has no row stating its widths, and that is the correct answer for them rather than a
 * missing one. The floors in `findBodyDimensionIssues` still govern those.
 */
function findCatalogWidthIssues(
  placement: DesignPlacement,
  path: string,
  catalog: BodyCatalog,
): DesignValidationIssue[] {
  const equivalent = resolveCatalogEquivalent(catalog, placement.body.buildId);
  if (!equivalent) return [];
  const body = toInsertableBody(equivalent.buildId, equivalent.definition);
  if (!body) return [];
  return acceptsWidthMm(body, placement.body.widthMm)
    ? []
    : [issueAt("WIDTH_NOT_BUILDABLE", `${path}.body.widthMm`)];
}

/** §12: `alongMm` is the body's **centre** along its wall, so its run is the centre ± half a width;
 *  `y0Mm` is the underside, so its top is `y0Mm + heightMm`. */
function findContainmentIssues(
  placement: DesignPlacement,
  path: string,
  room: DesignRoom,
): DesignValidationIssue[] {
  const breaches = {
    ...findContainmentBreaches(toPlacementSpan(placement), room),
    // ADR 0065: a placement's overrun is a **published** fact with one query behind it, and the
    // scene, the breakdown, the price bar and this validator must mark the same bodies. Only this
    // edge is read from there; the other two have no such query and come from the helper.
    endsPastWall: placementExtendsPastOwnWall(placement, room),
  };
  return [
    ...(breaches.startsBeforeWall
      ? [issueAt("PLACEMENT_BEFORE_WALL_START", `${path}.alongMm`)]
      : []),
    ...(breaches.endsPastWall
      ? [issueAt("PLACEMENT_PAST_WALL_END", `${path}.alongMm`)]
      : []),
    ...(breaches.risesAboveRoom
      ? [issueAt("PLACEMENT_ABOVE_ROOM", `${path}.y0Mm`)]
      : []),
  ];
}

/** Which of the room's three bounds this run breaks. One rule for a body and for a space, reported
 *  without codes or paths so each caller names its own — the bounds themselves must not fork, which
 *  is how an empty column came to be held to nothing while a placement was held to the room. Every
 *  caller reads `startsBeforeWall` and `risesAboveRoom` from here and nowhere else.
 *
 *  **`endsPastWall` is the one exception, and it is stated rather than left to be discovered.** ADR
 *  0065 makes a placement's overrun a published fact, so `findContainmentIssues` overrides this
 *  field with `placementExtendsPastOwnWall` — the same rule reached through the query every other
 *  surface reads. The column paths have no placement to ask and take the copy computed here. */
interface ContainmentBreaches {
  readonly startsBeforeWall: boolean;
  readonly endsPastWall: boolean;
  readonly risesAboveRoom: boolean;
}

function findContainmentBreaches(
  span: WallSpan,
  room: DesignRoom,
): ContainmentBreaches {
  return {
    startsBeforeWall: span.alongStartMm < 0,
    endsPastWall: span.alongEndMm > wallLengthMm(span.wall, room),
    risesAboveRoom: span.topMm > room.heightMm,
  };
}

function issueAt(
  code: DesignValidationCode,
  path: string,
): DesignValidationIssue {
  return { code, path };
}
