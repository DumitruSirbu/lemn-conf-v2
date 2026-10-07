// The wire-shape bounds every `Design` number and identifier is parsed against. They are limits on
// what a document may say, not product rules: what rejects a body that cannot be built is
// `validateDesignForCatalog`. Each is derived from a catalogue or spec constant rather than chosen,
// so a catalogue that gains a narrower row moves the bound with it.

import { INSERTABLE_BODY_DEFINITIONS } from "./catalog.js";
import { toMillimetres } from "./millimetres.js";
import { LEVELS, MIN_SPAN_M } from "./void-engine.js";

/**
 * The seeded room shell, in millimetres: the one L-shape the reference builder knows
 * (`packages/three-adapter/src/kitchen-parts.ts`: `RW = 4.2`, `RD = 3.4`, `WH = 2.6`). Restated, not
 * imported: the domain is I/O-free and `three-adapter` depends on it, never the reverse.
 *
 * The drawn shell is now a function of the room the customer entered, so these are no longer "the room
 * shell the scene builds", but their values must not move. The horizontal `MAX_ROOM_*` bounds below are
 * 1.5x the longer side (ADR 0124) and the height bound 1.5x its own, and the owner-approved maxima in
 * `room/approved-room-policy.ts` must sit at or under them (`approved-room-policy.test.ts` guards that).
 * Deriving the shell from `MAX_ROOM_*` would close the circle the other way round, and deriving `MAX_ROOM_*`
 * from the approved policy would make that guard unable to fail.
 */
const SCENE_SHELL_WIDTH_MM = 4200;
const SCENE_SHELL_DEPTH_MM = 3400;
const SCENE_SHELL_HEIGHT_MM = 2600;

/** A straight room's `depthMm` is never a wall (ADR 0130 decision 2), so validation fixes it to the one
 *  depth the product has drawn without being told, the seeded shell's own. Named for what it is for
 *  at its call site in `room/validate-room.ts`. */
export const LINEAR_ROOM_DEPTH_MM = SCENE_SHELL_DEPTH_MM;

/** Half as much again as the seeded shell: deliberate slack, not a product rule. Nothing in
 *  `packages/three-adapter/src` reads `MAX_ROOM_*`, `SCENE_SHELL_*` or any room ceiling. The product
 *  maxima are owner-approved literals in `room/approved-room-policy.ts` (ADR 0120 Amendment B2: 6000
 *  mm per wall); this factor sizes the storage ceiling those literals are guarded against, which is
 *  why it keeps a margin over them. */
const ROOM_HEADROOM_FACTOR = 1.5;

/**
 * The room a document may declare. Placement containment is checked against the room the document
 * itself carries, so without these a declared `10000 × 10000 × 10000` room would accept cabinets ten
 * metres along either wall and eight metres in the air; bounding the room makes containment a real
 * limit.
 *
 * Width and depth are one number on purpose: do not restore the 4200 / 3400 asymmetry, which was the
 * seeded shell's proportions and left wall B's storage ceiling under the owner's 6000 mm ruling
 * (ADR 0120 D1, ADR 0124). Never derive it from `APPROVED_ROOM_POLICY`; see the shell comment above.
 */
const MAX_ROOM_RUN_MM =
  Math.max(SCENE_SHELL_WIDTH_MM, SCENE_SHELL_DEPTH_MM) * ROOM_HEADROOM_FACTOR;
export const MAX_ROOM_WIDTH_MM = MAX_ROOM_RUN_MM;
export const MAX_ROOM_DEPTH_MM = MAX_ROOM_RUN_MM;
export const MAX_ROOM_HEIGHT_MM = SCENE_SHELL_HEIGHT_MM * ROOM_HEADROOM_FACTOR;

/**
 * The largest millimetre value a placement coordinate or a body dimension may carry: the outer wire
 * bound, stopping a number so large that arithmetic on it is meaningless before the domain validator
 * reads it. A placement must also fit the room, which `MAX_ROOM_*` bounds.
 */
export const MAX_DESIGN_DIMENSION_MM = 10_000;

/** Longest `buildId` or placement id a document may carry: more than twice the longest identifier the
 *  product produces (`wall-2door-700-over-fridge`, 26 characters; `insertBody` mints `n<index>`),
 *  because an unbounded string is a free multiplier on every accepted placement. */
export const MAX_IDENTIFIER_LENGTH = 64;

/** The longest run a wall can present: wall A walks the room's width, wall B its depth, and wall C its
 *  own `wallCMm` (§2; ADR 0132 decision 6), which `design.ts` bounds by `MAX_ROOM_DEPTH_MM`, so the
 *  third entry is wall C's run and not a guess at one. */
const MAX_WALL_RUNS_MM: readonly number[] = [
  MAX_ROOM_WIDTH_MM,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_DEPTH_MM,
];

/** The narrowest width any catalogue row may be built to, read off the rows: 200 mm today, from the
 *  two hinged cabinets and the bottle cargo (ADR 0026). */
export const NARROWEST_CATALOG_WIDTH_MM = Math.min(
  ...INSERTABLE_BODY_DEFINITIONS.flatMap(([, definition]) =>
    (definition.widthRangesMm ?? []).map((range) => range.minMm),
  ),
);

/** The shortest body a document may carry: §4's smallest span that ever becomes a void, since nothing
 *  under it can be an opening. Reachable through the API (the 40 mm cabinet ADR 0038 named). */
export const MIN_BODY_HEIGHT_MM = toMillimetres(MIN_SPAN_M);

/** The most placements a supported room can physically contain: each wall run at its maximum length,
 *  packed end to end with the narrowest catalogue body, in each of §2's three module bands. Every
 *  factor is declared elsewhere, so nothing here is a judgement call.
 *
 *  Today `(floor(6300/200) × 3 walls) × 3 bands = 279`, against 26 in the seeded kitchen;
 *  `design-bounds.test.ts` packs a U at this cap and shows it still serialises under
 *  `MAX_DESIGN_BYTES` and parses.
 *
 *  Containment is not what the validation seam enforces: a body past the end of its wall is a mark,
 *  not a refusal (ADR 0069), so the same packing could reach 450 placements. The cap binds slightly
 *  before the domain's rules would, two orders of magnitude outside any design this product
 *  produces. */
export const MAX_PLACEMENTS =
  MAX_WALL_RUNS_MM.reduce(
    (total, runMm) => total + Math.floor(runMm / NARROWEST_CATALOG_WIDTH_MM),
    0,
  ) * LEVELS.length;

/** The longest a single placement can serialise to: two `MAX_IDENTIFIER_LENGTH` identifiers, five
 *  five-digit millimetre values, the two optional enums, and JSON punctuation — roughly 280 bytes —
 *  rounded up so indentation and key order cannot make an honest document fail. */
const MAX_PLACEMENT_BYTES = 512;

/** The along-wall granularity of a column key: `deriveColumnKeyAt` renders a metre value with
 *  `toFixed(2)`, so two centres less than a centimetre apart address one column. */
const COLUMN_KEY_RESOLUTION_MM = 10;

/** §2's walls A, B and C, `DesignWallSchema`'s whole domain (ADR 0132 decision 1). Used for the keys a
 *  wall can present, never for which shape has which wall (`wallsOf`, `room/walls-of-shape.ts`), so
 *  the empty-column cap over-counts an L's and a straight room's wall-C keys by design. */
const WALL_COUNT = 3;

/**
 * The most empty columns a document the domain can execute may carry (ADR 0044).
 *
 * Derived from the rules that refuse a second entry, not from how narrow a gap can be:
 * `validateDesignForCatalog` refuses two empty columns sharing a `(wall, along)` key whatever their
 * bands, so bands are no multiplier, and ADR 0043 left an empty column no width floor, so
 * `WIDTH_STEP_MM` bounds nothing here. What bounds the count is the number of distinct keys a wall can
 * present: centres from 0 to the longest wall run at `COLUMN_KEY_RESOLUTION_MM`, `630 + 1` counting
 * both ends, and no two entries may share one. `(6300 / 10 + 1) × 3 = 1893`.
 *
 * Since ADR 0069 an extent past the end of its wall is a mark, so centres run to
 * `MAX_DESIGN_DIMENSION_MM` and the same arithmetic gives 2002 keys per wall; the cap binds slightly
 * first, two orders of magnitude past anything reachable (the shipped kitchen derives thirteen
 * columns).
 *
 * It bounds the keys a wall letter can present in the wire shape, not those a shape's own walls can,
 * so a document with no wall C never reaches those keys (ADR 0130 decision 3, ADR 0132 decision 5).
 */
export const MAX_EMPTY_COLUMNS =
  (Math.max(...MAX_WALL_RUNS_MM) / COLUMN_KEY_RESOLUTION_MM + 1) * WALL_COUNT;

/**
 * The most frozen extents of occupied columns a document may carry (ADR 0053). An entry is only legal
 * on a key some placement is filed under, so the placements bound the count directly. It does not
 * share `MAX_EMPTY_COLUMNS`' budget, which bounds keys a wall can present, the right bound for entries
 * that need no placement.
 */
export const MAX_COLUMN_EXTENTS = MAX_PLACEMENTS;

/** The geometry half of an empty column: a wall enum, five five-digit millimetre values and JSON
 *  punctuation, well under a hundred bytes, rounded up as `MAX_PLACEMENT_BYTES` is (ADR 0053). */
const EMPTY_COLUMN_GEOMETRY_BYTES = 128;

/** ADR 0073's `depthFromBuildId`, which the allowance above does not absorb: 26 bytes for the longest
 *  catalogue `buildId` (`wall-corner-return-570-top`) and 21 for `"depthFromBuildId":""`. Derived from
 *  the catalogue, as `MAX_PLACEMENT_BYTES` is derived from the document the product produces.
 *
 *  The margin is one byte. The longest entry `EmptyColumnSchema` can express (every coordinate at
 *  `MAX_DESIGN_DIMENSION_MM`, `depthFromBuildId` at `MAX_IDENTIFIER_LENGTH`) serialises to 173 bytes,
 *  174 with its separating comma, against the 175 below; `qa-5h.adversarial.test.ts` and
 *  `qa-6k-c-frozen-source.adversarial.test.ts` hold it there. A seventh field on this shape overflows
 *  unless the allowance moves with it. */
const DEPTH_FROM_BUILD_ID_BYTES = 26 + 21;

/** The longest a single empty column can serialise to. A stored column extent is the same shape, so it
 *  is allowed the same bytes. */
const MAX_EMPTY_COLUMN_BYTES =
  EMPTY_COLUMN_GEOMETRY_BYTES + DEPTH_FROM_BUILD_ID_BYTES;

/** Room, `presetId`, and the two timestamps, with the same rounding-up allowance. */
const DESIGN_ENVELOPE_BYTES = 1024;

/** Bytes of request body a save may carry (SEC-002), derived from the document that can legally be
 *  built so raising `MAX_PLACEMENTS` or `MAX_EMPTY_COLUMNS` cannot leave a limit that refuses a design
 *  this product produces. `emptyColumns` (ADR 0044) and `columnExtents` (ADR 0053) are counted because
 *  a placements-only cap would refuse a schema-valid document at `MAX_EMPTY_COLUMNS`. Counted off the
 *  request stream, never read from `Content-Length`, which a chunked request need not send truthfully.
 *
 *  Not a guarantee for every schema-valid document: `MAX_IDENTIFIER_LENGTH` counts UTF-16 code units
 *  while this counts bytes, so 64 non-ASCII characters would serialise past it. Nothing in the product
 *  mints a non-ASCII identifier. */
export const MAX_DESIGN_BYTES =
  MAX_PLACEMENTS * MAX_PLACEMENT_BYTES +
  MAX_EMPTY_COLUMNS * MAX_EMPTY_COLUMN_BYTES +
  MAX_COLUMN_EXTENTS * MAX_EMPTY_COLUMN_BYTES +
  DESIGN_ENVELOPE_BYTES;
