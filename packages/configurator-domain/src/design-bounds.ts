// The wire-shape bounds every `Design` number and identifier is parsed against. They are limits on
// what a *document* may say, not product rules: what rejects a body that cannot be built is
// `validateDesignForCatalog`. Each is derived from a catalogue or spec constant rather than chosen,
// so a catalogue that gains a narrower row moves the bound with it.

import { INSERTABLE_BODY_DEFINITIONS } from "./catalog.js";
import { toMillimetres } from "./millimetres.js";
import { LEVELS, MIN_SPAN_M } from "./void-engine.js";

/**
 * The room shell the scene actually builds, in millimetres.
 *
 * `packages/three-adapter/src/kitchen-parts.ts` declares `RW = 4.2`, `RD = 3.4`, `WH = 2.6` and
 * builds the floor and both wall planes from them. Restated here rather than imported: the domain
 * is I/O-free and `three-adapter` depends on **it**, never the reverse, so the adapter is cited as
 * the source of the number instead of being made a dependency.
 */
const SCENE_SHELL_WIDTH_MM = 4200;
const SCENE_SHELL_DEPTH_MM = 3400;
const SCENE_SHELL_HEIGHT_MM = 2600;

/** Half as much again as the shell. Deliberate slack, not a product rule — §13.3 question 4 records
 *  that `LEVELS` and both wall planes are constants for this one room, so in practice every room
 *  *is* the shipped one — sized so a room a little larger than it still loads. */
const ROOM_HEADROOM_FACTOR = 1.5;

/**
 * The room a document may declare (review finding F2).
 *
 * Placement containment is checked against the room the document itself carries, so without these
 * the room was the attacker's own choice and containment constrained nothing: a declared
 * `10000 × 10000 × 10000` room accepted cabinets ten metres along either wall and eight metres in
 * the air, because the only operative ceiling was `MAX_DESIGN_DIMENSION_MM`. Bounding the room is
 * what turns containment back into a real limit.
 */
export const MAX_ROOM_WIDTH_MM = SCENE_SHELL_WIDTH_MM * ROOM_HEADROOM_FACTOR;
export const MAX_ROOM_DEPTH_MM = SCENE_SHELL_DEPTH_MM * ROOM_HEADROOM_FACTOR;
export const MAX_ROOM_HEIGHT_MM = SCENE_SHELL_HEIGHT_MM * ROOM_HEADROOM_FACTOR;

/**
 * The largest millimetre value a placement coordinate or a body dimension may carry.
 *
 * The outer wire bound, and no longer the operative one: a placement must also fit the room, which
 * `MAX_ROOM_*` above now bounds. This stops a number so large that arithmetic on it is meaningless
 * before the domain validator ever reads it.
 */
export const MAX_DESIGN_DIMENSION_MM = 10_000;

/** Longest `buildId` or placement id a document may carry. The catalogue's longest key is
 *  `wall-2door-700-over-fridge` at 26 characters and `insertBody` mints `n<index>`, so this is more
 *  than twice the longest identifier anything in the product produces. It exists because an
 *  unbounded string is a free multiplier on every accepted placement. */
export const MAX_IDENTIFIER_LENGTH = 64;

/** The longest run a wall can present, now that the room is bounded: wall A walks the room's width
 *  and wall B its depth (§2). */
const MAX_WALL_RUNS_MM: readonly number[] = [
  MAX_ROOM_WIDTH_MM,
  MAX_ROOM_DEPTH_MM,
];

/** The narrowest width any catalogue row may be built to, read off the rows themselves rather than
 *  restated here: 200 mm today, from the two hinged cabinets and the bottle cargo (ADR 0026). */
export const NARROWEST_CATALOG_WIDTH_MM = Math.min(
  ...INSERTABLE_BODY_DEFINITIONS.flatMap(([, definition]) =>
    (definition.widthRangesMm ?? []).map((range) => range.minMm),
  ),
);

/** The shortest body a document may carry, as §4's smallest span that ever becomes a void: nothing
 *  under it can be an opening, so nothing under it can be a body built into one. This is the bound
 *  ADR 0038 named as unreachable — the 40 mm cabinet — and it is reachable through the API. */
export const MIN_BODY_HEIGHT_MM = toMillimetres(MIN_SPAN_M);

/** The most placements a supported room can physically **contain**.
 *
 *  Derived, not chosen: each wall run at its maximum length, packed end to end with the narrowest
 *  body the catalogue offers, in each of §2's three module bands. Every factor is a constant
 *  declared elsewhere, so no arithmetic here is a judgement call. Review finding F2 moved the wall
 *  runs from `MAX_DESIGN_DIMENSION_MM` to the room bounds, which is what they always meant.
 *
 *  Today that is `(floor(6300/200) + floor(5100/200)) × 3 = 168`, against 26 in the shipped seeded
 *  kitchen.
 *
 *  **Containment is no longer what the validation seam enforces.** Since ADR 0069 a body past the
 *  end of its wall is a mark rather than a refusal, so a centre may reach `MAX_DESIGN_DIMENSION_MM`
 *  and the same packing gives 300 non-overlapping placements against this cap of 168. The cap
 *  therefore now binds slightly before the domain's own rules would — deliberately, and two orders
 *  of magnitude outside any design this product produces. */
export const MAX_PLACEMENTS =
  MAX_WALL_RUNS_MM.reduce(
    (total, runMm) => total + Math.floor(runMm / NARROWEST_CATALOG_WIDTH_MM),
    0,
  ) * LEVELS.length;

/** The longest a single placement can serialise to: two `MAX_IDENTIFIER_LENGTH` identifiers, five
 *  five-digit millimetre values, the two optional enums, and JSON punctuation — roughly 280 bytes
 *  — rounded up so indentation and key order cannot make an honest document fail. */
const MAX_PLACEMENT_BYTES = 512;

/** The along-wall granularity of a column **key**, which is coarser than the document it is
 *  derived from: `deriveColumnKeyAt` renders a metre value with `toFixed(2)`, so two centres less
 *  than a centimetre apart address one column. */
const COLUMN_KEY_RESOLUTION_MM = 10;

/** §2's two walls, A and B — `DesignWallSchema`'s whole domain. */
const WALL_COUNT = 2;

/**
 * The most empty columns a document the domain can execute may carry (ADR 0044).
 *
 * **Derived from the rules that refuse a second entry, not from how narrow a gap can be.** The
 * earlier derivation — the narrowest strip a resize can leave, times §2's three module bands — was
 * wrong twice over, and in opposite directions: `validateDesignForCatalog` refuses two empty
 * columns that share a `(wall, along)` key *whatever bands they sit in*, so the bands are not a
 * multiplier at all; and ADR 0043 left an empty column no width floor, so a legal entry is 1 mm
 * wide and `WIDTH_STEP_MM` bounds nothing here.
 *
 * What actually bounds the count is the number of **distinct keys** a wall can present, under
 * physical containment: an entry contained by its wall — by that wall's own run since ADR 0065
 * decision 5, so this stays an upper bound by taking the longer of the two — has its centre
 * somewhere from 0 to `MAX_WALL_RUN_MM` at `COLUMN_KEY_RESOLUTION_MM`, `630 + 1` of them counting
 * both ends, and no two entries may share one. `(6300 / 10 + 1) × 2 = 1262`.
 *
 * **The validation seam no longer enforces that containment at the wall's end.** Since ADR 0069 an
 * extent past the end of its wall is a mark rather than a refusal, so centres run to
 * `MAX_DESIGN_DIMENSION_MM` and the same arithmetic gives 2002 distinct keys per wall. This cap
 * therefore now binds slightly before the domain's own rules would — which is a correction to the
 * premise, not to the number: 1262 entries at 1 mm wide and 10 mm apart is already two orders of
 * magnitude past anything reachable, and the shipped kitchen derives thirteen columns in total.
 */
export const MAX_EMPTY_COLUMNS =
  (Math.max(...MAX_WALL_RUNS_MM) / COLUMN_KEY_RESOLUTION_MM + 1) * WALL_COUNT;

/**
 * The most frozen extents of **occupied** columns a document may carry (ADR 0053).
 *
 * Derived rather than chosen, and from a different quantity than `MAX_EMPTY_COLUMNS`: an entry is
 * only legal on a key some placement is filed under, so the placements bound the count directly and
 * the tighter of the two bounds binds each array on its own. It deliberately does not share
 * `MAX_EMPTY_COLUMNS`' budget — that one bounds the *keys a wall can present*, which is the right
 * bound for an array whose entries need no placement at all.
 */
export const MAX_COLUMN_EXTENTS = MAX_PLACEMENTS;

/** The geometry half of an empty column: a wall enum, five five-digit millimetre values and JSON
 *  punctuation — well under a hundred bytes — rounded up as `MAX_PLACEMENT_BYTES` is, so key order
 *  and indentation cannot make an honest document fail. ADR 0053's per-entry allowance, unchanged. */
const EMPTY_COLUMN_GEOMETRY_BYTES = 128;

/** ADR 0073's `depthFromBuildId`, which the allowance above does **not** absorb — the record says so
 *  and re-derives rather than assuming: 26 bytes for the longest `buildId` the catalogue holds
 *  (`wall-corner-return-570-top`), and 21 for `"depthFromBuildId":""` — the key, both pairs of quotes
 *  and the colon. The comma that separates it from the field before it comes out of the round-up
 *  above, which stands about ten bytes clear of what the six geometry fields actually serialise to.
 *
 *  Derived from the catalogue rather than from `MAX_IDENTIFIER_LENGTH`, exactly as
 *  `MAX_PLACEMENT_BYTES` is derived from the document the product produces rather than from the
 *  widest one the schema can express.
 *
 *  **The margin is one byte, and it is stated here so the next field to arrive on this shape learns
 *  it from the comment rather than from a red test.** The longest entry `EmptyColumnSchema` can
 *  express — every coordinate at `MAX_DESIGN_DIMENSION_MM` and a `depthFromBuildId` at
 *  `MAX_IDENTIFIER_LENGTH` — serialises to 173 bytes, 174 with the comma that separates it from the
 *  entry before it, against the 175 below. Measured, not reasoned: `qa-5h.adversarial.test.ts`
 *  ("allows more bytes per entry than the longest entry the schema can express") and
 *  `qa-6k-c-frozen-source.adversarial.test.ts` both build that entry, parse it before measuring it,
 *  and hold it to this allowance. A seventh field on this shape overflows unless the allowance moves
 *  with it. */
const DEPTH_FROM_BUILD_ID_BYTES = 26 + 21;

/** The longest a single empty column can serialise to. A stored column extent is the same shape, so
 *  it is allowed the same bytes rather than deriving a second number for one shape. */
const MAX_EMPTY_COLUMN_BYTES =
  EMPTY_COLUMN_GEOMETRY_BYTES + DEPTH_FROM_BUILD_ID_BYTES;

/** Room, `presetId`, and the two timestamps, with the same rounding-up allowance. */
const DESIGN_ENVELOPE_BYTES = 1024;

/** Bytes of request body a save may carry (SEC-002). Derived from the document that can legally be
 *  built rather than picked, so raising `MAX_PLACEMENTS` or `MAX_EMPTY_COLUMNS` cannot leave a
 *  limit behind that refuses a design **this product produces**. ADR 0044's `emptyColumns` and
 *  ADR 0053's `columnExtents` are
 *  counted here for exactly that reason: a byte cap derived from the placements alone would refuse a
 *  document at `MAX_EMPTY_COLUMNS` that the schema accepts. It is counted off the request stream, never read from
 *  `Content-Length`, which a chunked request need not send truthfully.
 *
 *  Not a guarantee for every schema-valid document (review note F4): `MAX_IDENTIFIER_LENGTH` counts
 *  UTF-16 code units while this counts bytes, so identifiers of 64 non-ASCII characters would
 *  serialise past this while remaining schema- and domain-valid. Nothing in the product mints a
 *  non-ASCII identifier — `insertBody` mints `n<index>` and every catalogue key is ASCII. */
export const MAX_DESIGN_BYTES =
  MAX_PLACEMENTS * MAX_PLACEMENT_BYTES +
  MAX_EMPTY_COLUMNS * MAX_EMPTY_COLUMN_BYTES +
  MAX_COLUMN_EXTENTS * MAX_EMPTY_COLUMN_BYTES +
  DESIGN_ENVELOPE_BYTES;
