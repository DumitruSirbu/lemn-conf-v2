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
import type { Design, DesignPlacement, DesignRoom } from "./design.js";
import { describeBoundedIssues } from "./failure-text.js";
import {
  MIN_BODY_HEIGHT_MM,
  NARROWEST_CATALOG_WIDTH_MM,
} from "./design-bounds.js";
import { InvalidDesignError } from "./repository.js";
import type { BodyCatalog } from "./void-engine.js";

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
  const halfWidthMm = placement.body.widthMm / 2;
  const issues: DesignValidationIssue[] = [];
  if (placement.alongMm - halfWidthMm < 0) {
    issues.push(issueAt("PLACEMENT_BEFORE_WALL_START", `${path}.alongMm`));
  }
  if (placement.alongMm + halfWidthMm > longestWallRunMm(room)) {
    issues.push(issueAt("PLACEMENT_PAST_WALL_END", `${path}.alongMm`));
  }
  if (placement.y0Mm + placement.body.heightMm > room.heightMm) {
    issues.push(issueAt("PLACEMENT_ABOVE_ROOM", `${path}.y0Mm`));
  }
  return issues;
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
 * **What this actually buys, stated honestly** (review finding F2): it does not confine a body to
 * the wall it stands on, so a placement may overshoot its own wall by up to the difference between
 * the room's two runs. What it does is cap that overshoot at the room, and the room is itself
 * bounded by `MAX_ROOM_*` — so the worst case is roughly the physical shell rather than the ten
 * metres this rule permitted while the room was whatever a caller declared. Reconciling the room
 * record with the scene shell is a separate decision and would let this become the per-wall rule.
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
