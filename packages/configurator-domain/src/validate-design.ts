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
} from "./design.js";
import { describeBoundedIssues } from "./failure-text.js";
import {
  MIN_BODY_HEIGHT_MM,
  NARROWEST_CATALOG_WIDTH_MM,
} from "./design-bounds.js";
import { toMetres } from "./millimetres.js";
import { InvalidDesignError } from "./repository.js";
import { deriveColumnKeyAt, type BodyCatalog } from "./void-engine.js";

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
  ];
}

/** The same rule, for a caller whose only sane response to a bad document is to fail: the stored-row
 *  load path, where an invalid row must surface as a handled domain error rather than as an
 *  `UnknownBodyError` thrown at the client mid-hydration. */
export function assertDesignValidForCatalog(
  design: Design,
  catalog: BodyCatalog,
): void {
  const issues = validateDesignForCatalog(design, catalog);
  if (issues.length > 0) {
    throw new InvalidDesignError(describeDesignValidationIssues(issues));
  }
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
    ...findEmptyColumnOverlaps(design.placements, emptyColumns),
    ...findCollidingColumnKeys(design.placements, emptyColumns),
  ];
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
 * The bound is the wall's **own** normal run, and unlike `longestWallRunMm` that costs nothing:
 * §2 sends wall A's depth into the room's depth and wall B's into its width, and no shipped body
 * comes near either. The 400 mm slack that forced the along-wall rule to take the longer run is a
 * fact about along-wall coordinates, not about depths.
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
  readonly emptyColumnIndex?: number;
}

/**
 * Sorted per wall and swept, not compared pairwise.
 *
 * At the caps this document may carry that is 684 empty columns against 168 placements — about
 * 115k comparisons on every save and every load, including the overwhelming majority that carry no
 * empty column at all. Sorting once and keeping only the spans still open at the current
 * coordinate makes an honest document linear in its own size, which is what lets `MAX_EMPTY_COLUMNS`
 * bound the derivation rather than merely bound the document.
 */
function findEmptyColumnOverlaps(
  placements: readonly DesignPlacement[],
  emptyColumns: readonly EmptyColumn[],
): DesignValidationIssue[] {
  if (emptyColumns.length === 0) return [];
  const spans = [
    ...placements.map(toPlacementSpan),
    ...emptyColumns.map(toEmptyColumnSpan),
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

function recordOverlap(
  issues: Map<string, DesignValidationIssue>,
  first: WallSpan,
  second: WallSpan,
): void {
  const bothEmpty =
    first.emptyColumnIndex !== undefined &&
    second.emptyColumnIndex !== undefined;
  const code: DesignValidationCode = bothEmpty
    ? "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN"
    : "EMPTY_COLUMN_OVERLAPS_PLACEMENT";
  for (const span of [first, second]) {
    if (span.emptyColumnIndex === undefined) continue;
    const issue = issueAt(
      code,
      `emptyColumns.${String(span.emptyColumnIndex)}`,
    );
    issues.set(`${code}:${issue.path}`, issue);
  }
}

/** §12: `alongMm` is the centre of the run, on a placement and on an empty column alike, so both
 *  reach the sweep as the same kind of interval. */
function toPlacementSpan(placement: DesignPlacement): WallSpan {
  const halfWidthMm = placement.body.widthMm / 2;
  return {
    wall: placement.wall,
    alongStartMm: placement.alongMm - halfWidthMm,
    alongEndMm: placement.alongMm + halfWidthMm,
    floorMm: placement.y0Mm,
    topMm: placement.y0Mm + placement.body.heightMm,
  };
}

function toEmptyColumnSpan(emptyColumn: EmptyColumn, index: number): WallSpan {
  const halfWidthMm = emptyColumn.widthMm / 2;
  return {
    wall: emptyColumn.wall,
    alongStartMm: emptyColumn.alongMm - halfWidthMm,
    alongEndMm: emptyColumn.alongMm + halfWidthMm,
    floorMm: emptyColumn.y0Mm,
    topMm: emptyColumn.topMm,
    emptyColumnIndex: index,
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
  const breaches = findContainmentBreaches(toPlacementSpan(placement), room);
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
 *  is how an empty column came to be held to nothing while a placement was held to the room. */
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
    endsPastWall: span.alongEndMm > longestWallRunMm(room),
    risesAboveRoom: span.topMm > room.heightMm,
  };
}

/**
 * The horizontal bound a placement must fit inside — deliberately the room's **longer** recorded
 * run, not the run belonging to the placement's own wall.
 *
 * Per-wall would be the honest rule: §2 makes wall A's run the room width and wall B's the room
 * depth. It cannot be applied, because `Design.room` does not describe the shipped scene. The
 * seeded kitchen records a 3600 × 2400 room while `kitchen-parts.ts` builds a 4.2 × 3.4 m shell,
 * and its wall-B fridge (`p7`, centred at 2450 with a 700 mm body) stands out to 2800 mm — 400 mm
 * past the recorded depth. A per-wall bound would reject the design the product ships.
 *
 * **What this actually buys, and what it does not.** It does not confine a body to the wall it
 * stands on: a placement may overshoot its own wall by the whole difference between the room's two
 * runs. Because the axes are bounded independently, the shorter wall inherits the longer one's run
 * — a document declaring `{ widthMm: 6300, depthMm: 1, heightMm: 3900 }` validates clean with a
 * 600 mm body on wall B at `alongMm: 6000`, which is 2900 mm past wall B's real 3400 mm run and
 * 1300 mm above the real 2600 mm ceiling. Measured, not reasoned about.
 *
 * So the residual is capped at the **bounded room**, not at the wall. That is still a large
 * improvement — the same rule permitted ten metres while the room was whatever a caller declared —
 * but it is not the physical shell, and an earlier version of this comment said it was.
 * Reconciling the room record with the scene shell is the separate decision that would let this
 * become the per-wall rule and close the residual properly.
 */
function longestWallRunMm(room: DesignRoom): number {
  return Math.max(room.widthMm, room.depthMm);
}

function issueAt(
  code: DesignValidationCode,
  path: string,
): DesignValidationIssue {
  return { code, path };
}
