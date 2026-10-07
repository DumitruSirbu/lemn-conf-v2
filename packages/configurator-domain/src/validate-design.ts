// The executable half of validation: `DesignSchema` checks shape, this checks the domain can derive geometry from it.
// One validator, three seams: API write, stored-row load, import.

import { materialOfDesign } from "./design-material.js";
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
import { type Material, materialOffersFinish } from "./materials.js";
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
  | "RECORDED_SPAN_OVERLAPS_CORNER_BODY"
  | "TIMESTAMPS_OUT_OF_ORDER"
  | "PLACEMENT_WEARS_UNOFFERED_FINISH"
  | "SETTINGS_WEAR_UNOFFERED_FINISH";

export interface DesignValidationIssue {
  readonly code: DesignValidationCode;
  readonly path: string;
}

/** Every reason this design cannot be executed against this catalogue, or an empty list. A query: never throws,
 *  never mutates. */
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
    ...findCornerOverlaps(design, catalog),
    ...findUnofferedFinishIssues(design),
  ];
}

/** ADR 0057 at the write seam: no stored design holds a finish its material does not offer. Refuses rather than
 *  rewrites; an undeclared material or an absent finish reports nothing (ADR 0078). */
function findUnofferedFinishIssues(design: Design): DesignValidationIssue[] {
  const lookup = materialOfDesign(design);
  if (lookup.kind === "undeclared") return [];

  const material = lookup.material;
  return [
    ...findUnofferedGlobalFinishIssues(design, material),
    ...findUnofferedPlacementFinishIssues(design, material),
  ];
}

/** ADR 0099 decision 6: the whole-kitchen colour is a second place a finish is chosen, so the invariant covers
 *  `settings.finish` too. No command reaches it; a restored backup or hand-edited document can. */
function findUnofferedGlobalFinishIssues(
  design: Design,
  material: Material,
): DesignValidationIssue[] {
  const finish = design.settings?.finish;
  if (finish === undefined || materialOffersFinish(material, finish)) return [];
  return [issueAt("SETTINGS_WEAR_UNOFFERED_FINISH", "settings.finish")];
}

function findUnofferedPlacementFinishIssues(
  design: Design,
  material: Material,
): DesignValidationIssue[] {
  return design.placements.flatMap((placement, index) => {
    const finish = placement.body.finish;
    if (finish === undefined || materialOffersFinish(material, finish)) {
      return [];
    }
    return [
      issueAt(
        "PLACEMENT_WEARS_UNOFFERED_FINISH",
        `placements.${String(index)}.body.finish`,
      ),
    ];
  });
}

/** The same rule as a failure rather than a list, for the stored-row load path, where an invalid row must surface as
 *  a domain error and not an `UnknownBodyError` mid-hydration. */
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

/** What a finding does: a `"refusal"` stops the load or write, a `"mark"` is reported and carried; both stay in the
 *  full diagnostic report. */
export type DesignIssueSeverity = "mark" | "refusal";

/** Severity per code (ADR 0069 decision 2): `"mark"` iff the single fact asserted is that a run reaches past its
 *  wall's end, else `"refusal"`. The map is total, so a new code must be classified. */
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
  // The same run after its bodies were removed: ADR 0065 tells the customer to remove something, so refusing this
  // refuses that remedy.
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
  // The frozen extent of a column holding a marked body, rewritten on every command: refusing it refuses the second
  // save.
  COLUMN_EXTENT_PAST_WALL_END: "mark",
  COLUMN_EXTENT_ABOVE_ROOM: "refusal",
  COLUMN_EXTENT_DEEPER_THAN_ROOM: "refusal",
  COLUMN_EXTENT_OVERLAPS_PLACEMENT: "refusal",
  COLUMN_EXTENT_OVERLAPS_EMPTY_COLUMN: "refusal",
  COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT: "refusal",
  // Not "past the end of its wall", so the membership rule would refuse it and make a stored document unloadable (ADR
  // 0052); ruled a mark like `PLACEMENT_PAST_WALL_END` (ADR 0065).
  RECORDED_SPAN_OVERLAPS_CORNER_BODY: "mark",
  TIMESTAMPS_OUT_OF_ORDER: "refusal",
  // Not "past the end of its wall", so a refusal (ADR 0069 decision 2); it fires only at `PUT /api/designs/[id]`, as
  // `migrateDesign` resolves it before asserting on load.
  PLACEMENT_WEARS_UNOFFERED_FINISH: "refusal",
  // ADR 0099 decision 6: refused like its sibling; a separate code since `settings.finish` is a field, not a
  // `placements` index.
  SETTINGS_WEAR_UNOFFERED_FINISH: "refusal",
};

/** The validation findings that make a design unsafe to load or write, by the declaration above. */
export function fatalDesignValidationIssues(
  issues: readonly DesignValidationIssue[],
): readonly DesignValidationIssue[] {
  return issues.filter(
    (issue) => DESIGN_ISSUE_SEVERITY_BY_CODE[issue.code] === "refusal",
  );
}

/** The shape of a domain-validation failure, through the describer both halves of validation share. */
export function describeDesignValidationIssues(
  issues: readonly DesignValidationIssue[],
): string {
  return describeBoundedIssues(
    issues.map((issue) => `${issue.path}:${issue.code}`),
  );
}

/** ADR 0044's half of the executable contract: a recorded empty space the document's own placements contradict; only
 *  a hand-edited or hostile document reaches it, so both seams refuse. */
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

/** ADR 0053's half: a recorded frozen extent the placements contradict. Every placement under an entry's key must
 *  lie inside it, so restoring can only widen a column. A member-less extent is refused, not restored; there is no
 *  inversion rule, as `COLUMN_EXTENT_EXCLUDES_MEMBER` already refuses every inverted entry. */
function findColumnExtentIssues(
  design: Design,
  catalog: BodyCatalog,
): DesignValidationIssue[] {
  const columnExtents = design.columnExtents ?? [];
  if (columnExtents.length === 0) return [];
  const membersByKey = describeMembersByColumnKey(design, catalog);
  // A document naming a body the catalogue lacks is already refused by `UNKNOWN_BUILD_ID`; containment needs the
  // catalogue's depth declaration, so skip rather than report twice.
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

/** What the containment rule needs of a placement, in millimetres, read off the derived record since that is what a
 *  stored extent overrides: `frameHeightMm` and the occupied depth differ from the placement's own (ADR 0018). */
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

/** Vertical containment in whole millimetres (ADR 0053). Along-wall and depth are not invariants (`w` is a MIN over
 *  members; a resize outgrows a frozen `d`), so only the room bounds them (`findExtentRoomIssues`). */
function extentContains(
  extent: StoredColumnExtent,
  member: MemberSpan,
): boolean {
  return extent.y0Mm <= member.floorMm && extent.topMm >= member.topMm;
}

/** The same room bound a placement and an empty column get. Each edge keeps its own code because severities differ
 *  (past the wall's end is a mark; ADR 0069 decision 3); a double breach emits two findings. */
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

/** Two entries addressing one slot: `deriveColumns` would keep the last, so a recorded extent would not exist. Both
 *  sides are named, as neither is the offender alone. */
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

/** Placements grouped under the column key the derivation files them under, via `derivePlacementRecords` so both
 *  read the same numbers; `undefined` when the catalogue lacks a body, which it would throw on. */
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

/** ADR 0052: no empty column is wider than `MAX_EMPTY_COLUMN_WIDTH_MM`. Refuses one entry, never a space (a 1000 mm
 *  gap as 800 plus 200 passes); `migrateFromV1` splits oversized entries first, so old share links load. */
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

/** The room bounds a space as it bounds a body, through `findContainmentBreaches`; an empty column held only to
 *  `MAX_DESIGN_DIMENSION_MM` would be published outside the shell. */
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

/** The only depth a client chooses, bounded by the wall's own normal run; wall A's is `max(depthMm, wallCMm)` so a
 *  U's longer side wall counts (ADR 0132 decision 7). `wallCMm` is undefined on an L or straight room. */
function reachesPastRoomAcrossWall(
  emptyColumn: EmptyColumn,
  room: DesignRoom,
): boolean {
  if (emptyColumn.wall !== "A") return emptyColumn.depthMm > room.widthMm;
  const drawnFloorDepthMm = Math.max(room.depthMm, room.wallCMm ?? 0);
  return emptyColumn.depthMm > drawnFloorDepthMm;
}

/** Entries the column map cannot hold apart: `deriveColumnKeyAt` is 10 mm granular and `alongMm` is not, so 3576 and
 *  3578 share a key. The loser would be a recorded space the derivation lacks, so it is refused rather than dropped. */
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
    // Both sides are named: neither entry is the offender alone, and moving only the second would collide with the
    // first again.
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

/** A top at or below the floor is an extent with no height, and an inverted interval overlaps nothing, so it would
 *  bypass the overlap sweep; refused before that sweep reads it. */
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

/** One run of wall as the overlap sweep compares them. A placement carries no index, so a placement-on-placement
 *  overlap is unreportable: placements are never checked against each other. */
interface WallSpan {
  readonly wall: DesignWall;
  readonly alongStartMm: number;
  readonly alongEndMm: number;
  readonly floorMm: number;
  readonly topMm: number;
  readonly kind: "placement" | "emptyColumn" | "columnExtent";
  /** The column this run belongs to, so an extent is compared with every placement except those filed under its own
   *  key. */
  readonly columnKey: string;
  readonly index: number;
}

/** Sorted per wall and swept, not compared pairwise, so cost is linear in the document. Both stored arrays are
 *  swept: an extent over another column publishes openings through its neighbours' bodies. */
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

/** Abutting is not overlapping: ADR 0046 merges spaces that meet at a coordinate, so `a.end === b.start` must be
 *  legal; the comparison is `<=`. */
function dropSpansClosedBefore(open: WallSpan[], alongMm: number): void {
  for (let index = open.length - 1; index >= 0; index -= 1) {
    if ((open[index]?.alongEndMm ?? 0) <= alongMm) open.splice(index, 1);
  }
}

/** Runs at the same along-wall coordinate but different heights share no space, so the vertical overlap must be
 *  strictly positive too. */
function overlapVertically(first: WallSpan, second: WallSpan): boolean {
  return (
    Math.min(first.topMm, second.topMm) -
      Math.max(first.floorMm, second.floorMm) >
    0
  );
}

/** An extent over a body filed under its own key is not an overlap: holding that body is its purpose, and
 *  `extentContains` judges it. */
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

/** The code an overlapping run is named with, or none: a placement never is, and a space overlapping an extent is
 *  reported once, on the extent (ADR 0044). */
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

/** The overlap across a shared corner, where a body's depth runs along the other wall: recorded spans against bodies
 *  only. A is mirrored onto `W − alongMm` for A∩C; B and C are never compared (ADR 0132 decisions 1, 7). */
function findCornerOverlaps(
  design: Design,
  catalog: BodyCatalog,
): DesignValidationIssue[] {
  const recorded = recordedCornerRuns(design, catalog);
  if (recorded.length === 0) return [];
  const bodies = bodyCornerRuns(design.placements, catalog);
  const issues = new Map<string, DesignValidationIssue>();
  sweepOneCorner(issues, recorded, bodies, "B");
  sweepOneCorner(
    issues,
    mirroredForTheFarCorner(recorded, design.room.widthMm),
    mirroredForTheFarCorner(bodies, design.room.widthMm),
    "C",
  );
  return [...issues.values()];
}

/** One corner's sweep: wall A's runs against `farWall`'s only, which keeps B and C from ever being compared. */
function sweepOneCorner(
  issues: Map<string, DesignValidationIssue>,
  recorded: readonly CornerRun[],
  bodies: readonly CornerRun[],
  farWall: DesignWall,
): void {
  const isAtThisCorner = (candidate: CornerRun): boolean =>
    candidate.run.wall === "A" || candidate.run.wall === farWall;
  const recordedHere = recorded.filter(isAtThisCorner);
  const bodiesHere = bodies.filter(isAtThisCorner);
  // Only runs reaching the corner can meet across it, so each side is filtered by the other's deepest reach.
  for (const span of nearerTheCornerThan(
    recordedHere,
    deepestReachMm(bodiesHere),
  )) {
    for (const body of nearerTheCornerThan(
      bodiesHere,
      deepestReachMm(recordedHere),
    )) {
      if (span.run.wall === body.run.wall) continue;
      if (!intersectsAcrossTheCorner(span, body)) continue;
      const issue = issueAt(
        "RECORDED_SPAN_OVERLAPS_CORNER_BODY",
        `${arrayNameOf(span.run.kind)}.${String(span.run.index)}`,
      );
      issues.set(issue.path, issue);
    }
  }
}

/** Wall A's runs restated in the A∩C corner's coordinates (`W − alongMm`, reversing the interval) to compare with
 *  wall C's (ADR 0132 decision 1). Other walls pass through untouched. */
function mirroredForTheFarCorner(
  runs: readonly CornerRun[],
  widthMm: number,
): CornerRun[] {
  return runs.map((corner) =>
    corner.run.wall === "A"
      ? {
          ...corner,
          run: {
            ...corner.run,
            alongStartMm: widthMm - corner.run.alongEndMm,
            alongEndMm: widthMm - corner.run.alongStartMm,
          },
        }
      : corner,
  );
}

/** One run as the corner comparison reads it: its interval along its own wall, and `reachMm` into the other wall's
 *  coordinate (`0 .. reachMm`). */
interface CornerRun {
  readonly run: WallSpan;
  readonly reachMm: number;
  /** For a recorded column with members: each one's vertical span and seat, so a body is met by the deepest member
   *  at its height. Absent on a body and a member-less entry. */
  readonly memberBands?: readonly MemberBand[];
}

interface MemberBand {
  readonly floorMm: number;
  readonly topMm: number;
  readonly seatMm: number;
}

/** Corner reach is the carcass seat (`frameDepthMm`), not the occupied depth: the shipped corner legs share 50 mm of
 *  plan by design, so occupied depth would mark the demo kitchen (docs/backlog/open.md entry 50). Nothing outside
 *  this comparison may read `frameDepthMm` as a wall distance: it encodes twice the rear overhang, and
 *  `occupiedDepthM` is the answer elsewhere. */
function carcassSeatMmOf(
  buildId: string | undefined,
  catalog: BodyCatalog,
): number | undefined {
  if (buildId === undefined) return undefined;
  return catalog.get(buildId)?.frameDepthMm;
}

/** Every placement the catalogue can seat; an unknown body is already `UNKNOWN_BUILD_ID` and contributes no guessed
 *  reach. */
function bodyCornerRuns(
  placements: readonly DesignPlacement[],
  catalog: BodyCatalog,
): CornerRun[] {
  return placements.flatMap((placement, index) => {
    const reachMm = carcassSeatMmOf(placement.body.buildId, catalog);
    return reachMm === undefined
      ? []
      : [{ run: toPlacementSpan(placement, index), reachMm }];
  });
}

/** Both stored arrays, each entry carrying the carcass line of the column it records. */
function recordedCornerRuns(design: Design, catalog: BodyCatalog): CornerRun[] {
  const seatsByColumn = deepestSeatByColumnMm(design.placements, catalog);
  const bandsByColumn = memberBandsByColumn(design.placements, catalog);
  const runOf = (run: WallSpan, entry: EmptyColumn): CornerRun => {
    const memberBands = bandsByColumn.get(run.columnKey);
    return {
      run,
      reachMm: recordedReachMm({ run, entry, seatsByColumn, catalog }),
      ...(memberBands === undefined ? {} : { memberBands }),
    };
  };
  return [
    ...(design.emptyColumns ?? []).map((entry, index) =>
      runOf(toEmptyColumnSpan(entry, index), entry),
    ),
    ...(design.columnExtents ?? []).map((entry, index) =>
      runOf(toColumnExtentSpan(entry, index), entry),
    ),
  ];
}

/** One recorded entry, the run it became, and the two places a seat can be found for it. */
interface RecordedReachQuery {
  readonly run: WallSpan;
  readonly entry: EmptyColumn;
  readonly seatsByColumn: ReadonlyMap<string, number>;
  readonly catalog: BodyCatalog;
}

/** Corner reach of a recorded column, by what the document knows: its members' seat at the compared body's height;
 *  else its recorded source's seat (ADR 0073); else `depthMm`, which over-reports, but only as a `mark`. */
function recordedReachMm(query: RecordedReachQuery): number {
  return (
    query.seatsByColumn.get(query.run.columnKey) ??
    carcassSeatMmOf(query.entry.depthFromBuildId, query.catalog) ??
    query.entry.depthMm
  );
}

/** The deepest carcass seat in each column: §3.2's MAX over the seat rather than the clearance, over the whole
 *  column since an entry describes a column, not a band. */
function deepestSeatByColumnMm(
  placements: readonly DesignPlacement[],
  catalog: BodyCatalog,
): Map<string, number> {
  const deepest = new Map<string, number>();
  for (const placement of placements) {
    const seatMm = carcassSeatMmOf(placement.body.buildId, catalog);
    if (seatMm === undefined) continue;
    const key = deriveColumnKeyAt(placement.wall, toMetres(placement.alongMm));
    deepest.set(key, Math.max(deepest.get(key) ?? 0, seatMm));
  }
  return deepest;
}

/** Every member of each column with its vertical span and seat, kept whole so a body at one height is met by the
 *  members at that height. */
function memberBandsByColumn(
  placements: readonly DesignPlacement[],
  catalog: BodyCatalog,
): Map<string, MemberBand[]> {
  const bands = new Map<string, MemberBand[]>();
  for (const placement of placements) {
    const seatMm = carcassSeatMmOf(placement.body.buildId, catalog);
    if (seatMm === undefined) continue;
    const key = deriveColumnKeyAt(placement.wall, toMetres(placement.alongMm));
    const band = {
      floorMm: placement.y0Mm,
      topMm: placement.y0Mm + placement.body.heightMm,
      seatMm,
    };
    bands.set(key, [...(bands.get(key) ?? []), band]);
  }
  return bands;
}

/** A recorded column's reach at the height of `other`: the deepest seat among members standing there, else the
 *  column's deepest. Never deeper than the column's own reach, so it can only remove a finding. */
function reachAtTheHeightOf(column: CornerRun, other: WallSpan): number {
  const standingThere = (column.memberBands ?? []).filter(
    (band) => band.floorMm < other.topMm && band.topMm > other.floorMm,
  );
  return standingThere.length === 0
    ? column.reachMm
    : Math.max(...standingThere.map((band) => band.seatMm));
}

/** The two runs stand in one another's solid: each reaches into the other's along-wall interval and they overlap in
 *  elevation (a base and a wall cabinet share plan area but no space). */
function intersectsAcrossTheCorner(
  first: CornerRun,
  second: CornerRun,
): boolean {
  return (
    reachesInto(first.run, reachAtTheHeightOf(second, first.run)) &&
    reachesInto(second.run, reachAtTheHeightOf(first, second.run)) &&
    overlapVertically(first.run, second.run)
  );
}

/** Whether this run's along-wall interval meets `0 .. reachMm`; strictly positive, since abutting is not overlapping
 *  and the shipped corner returns abut. */
function reachesInto(run: WallSpan, reachMm: number): boolean {
  return run.alongStartMm < reachMm && run.alongEndMm > 0;
}

function nearerTheCornerThan(
  runs: readonly CornerRun[],
  reachMm: number,
): CornerRun[] {
  return runs.filter((candidate) => candidate.run.alongStartMm < reachMm);
}

function deepestReachMm(runs: readonly CornerRun[]): number {
  return runs.reduce((deepest, run) => Math.max(deepest, run.reachMm), 0);
}

interface PlacementContext {
  readonly room: DesignRoom;
  readonly catalog: BodyCatalog;
}

/** Two placements sharing an id are not independently representable: id-keyed derivations are Maps and Sets, so one
 *  would silently vanish from membership comparisons. */
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

/** A document last written before it was created is forged or corrupted, and every "is this newer?" comparison
 *  downstream reads it. */
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
  // Catalogue membership first and alone: every later rule reads the entry, and an unknown one would reach the client
  // as `UnknownBodyError`.
  if (!context.catalog.has(placement.body.buildId)) {
    return [issueAt("UNKNOWN_BUILD_ID", `${path}.body.buildId`)];
  }
  return [
    ...findBodyDimensionIssues(placement, path),
    ...findCatalogWidthIssues(placement, path, context.catalog),
    ...findContainmentIssues(placement, path, context.room),
  ];
}

/** The floors no catalogue row can go under: the narrowest catalogue width and §4's smallest span that becomes an
 *  opening. */
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

/** The width rule the entry states, through `acceptsWidthMm` so a stored width is judged as a resize is. A body with
 *  no catalogue equivalent (the corner bodies, §13.1) has no row and falls to `findBodyDimensionIssues`. */
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
    // ADR 0065: a placement's overrun is a published fact with one query, so the scene, breakdown, price bar and this
    // validator mark the same bodies.
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

/** Which of the room's bounds a run breaks, without codes or paths so the bound cannot fork between body and space.
 *  `endsPastWall` is overridden for placements by `placementExtendsPastOwnWall` (ADR 0065). */
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
