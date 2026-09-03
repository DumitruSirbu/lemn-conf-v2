import { MAX_EMPTY_COLUMNS } from "./design-bounds.js";
import type { Design, DesignRoom, EmptyColumn } from "./design.js";
import { DesignSchema } from "./design.js";
import { KITCHEN_L_BODY_CATALOG } from "./fixtures/kitchen-l-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "./module-grid.js";
import { InvalidDesignError } from "./repository.js";
import { describeSchemaIssues } from "./failure-text.js";
import {
  landsOnWholeMillimetres,
  splitEmptySpanAtCap,
} from "./split-empty-span.js";
import {
  assertDesignValidForCatalog,
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "./validate-design.js";
import type { BodyCatalog } from "./void-engine.js";

/** The version this build writes, and the version at which a document is owed no normalisation at
 *  all. `neon-configuration-repository.ts` stamps every row it writes with this value, importing it
 *  rather than restating it: two copies of this number that disagree is a migration that silently
 *  stops running. */
export const CURRENT_SCHEMA_VERSION = 3;

/** The oldest version still readable. Nothing below it was ever written, and a row claiming one is
 *  a row this build cannot account for. */
const OLDEST_SUPPORTED_SCHEMA_VERSION = 1;

/** One legacy shape, normalised away. Takes the catalogue because deciding whether a normalisation
 *  is owed can require knowing whether the document is executable, not only how it is shaped. */
type DesignNormalisation = (design: Design, catalog: BodyCatalog) => Design;

/** Every normalisation a stored document may still be owed, **keyed by the version that owes it**
 *  and applied in ascending version order by `carryForward`.
 *
 *  Version 1 is every document written before wave 5G, under a rule that bounded a *merge* and not
 *  an empty column, so it may carry an entry ADR 0052 no longer permits. Version 2 is every document
 *  written before the room correction of 2026-09-03, so it carries the seeded room as it then stood.
 *  A version 1 document is owed both, in that order.
 *
 *  **The order is load-bearing, and one defect has already turned on it.** Each entry may assume
 *  every older one has already run, and `correctPreCorrectionRoom` relies on it: that entry asks
 *  whether the corrected room rescues the document, and a version 1 document still carrying an
 *  oversized `emptyColumns` entry answers *no* for a reason that has nothing to do with its room.
 *  Run in the other order, the room correction declined to fire on precisely the documents version 1
 *  exists for — a v1 row carrying both legacy shapes at once. A future arm below these belongs at
 *  the **front** of this map, and its own guard may not assume anything a younger arm has not yet
 *  had the chance to fix. */
const NORMALISATIONS_BY_VERSION_OWING_THEM: ReadonlyMap<
  number,
  DesignNormalisation
> = new Map([
  [1, normaliseOversizedEmptyColumnEntries],
  [2, correctPreCorrectionRoom],
]);

/** Every normalisation the stored version still owes, oldest first. A document already at
 *  `CURRENT_SCHEMA_VERSION` walks none of them: its room and its columns are its own, including the
 *  3600 × 2400 an M7 customer may genuinely enter. */
function carryForward(
  design: Design,
  schemaVersion: number,
  catalog: BodyCatalog,
): Design {
  let carried = design;
  for (
    let version = schemaVersion;
    version < CURRENT_SCHEMA_VERSION;
    version += 1
  ) {
    carried = normalisationOwedBy(version)(carried, catalog);
  }
  return carried;
}

function normalisationOwedBy(version: number): DesignNormalisation {
  const normalisation = NORMALISATIONS_BY_VERSION_OWING_THEM.get(version);
  if (!normalisation) {
    throw new InvalidDesignError(
      `no normalisation is declared for schema version ${String(version)}`,
    );
  }
  return normalisation;
}

/** The seeded room as every document up to version 2 carried it, and the room the 2026-09-03
 *  correction replaced it with.
 *
 *  Written as literals rather than read from `KITCHEN_L_DESIGN.room`, deliberately: a migration is a
 *  statement about documents that were already written, so a later edit to the fixture must bring
 *  its own migration and must not retroactively change what this one produces. */
const PRE_CORRECTION_ROOM_MM = { widthMm: 3600, depthMm: 2400 } as const;
const CORRECTED_ROOM_MM = { widthMm: 3560, depthMm: 2830 } as const;

/** The room the correction of 2026-09-03 gave the seeded kitchen, written over the one a document
 *  stored before it carries — the v1 `emptyColumns` shape again, **normalise rather than refuse**.
 *
 *  Wall B's along-wall bound became the room's `depthMm`, and the seeded `p7` and `p24` end at 2800.
 *  That was legal under the old `max(widthMm, depthMm)` and is not under a 2400 depth, so five rows
 *  written from the seed stop loading — and a `/d/{id}` share link is the one artefact this project
 *  hands to someone who cannot be asked to reload it.
 *
 *  **Which of the two failures this is, because the next reader to meet a refusal at this seam has
 *  to tell them apart.** A document that was *legal under the rule in force when it was written* is
 *  normalised; a document that is malformed or unexecutable is refused, and DOM-001 is why. The
 *  bound above is not too tight and nothing here may loosen it: these rows are the first kind, and
 *  the tightening refusing them is the tightening working.
 *
 *  **Three guards, because a rewrite of a room is a rewrite of somebody's kitchen.** M7 lets a
 *  customer enter their own dimensions, and one of them may genuinely have a 3600 × 2400 room:
 *
 *  1. **The version.** This arm is not reached at version 3, which is what M7 writes. That alone
 *     settles the customer case.
 *  2. **The exact pre-correction pair**, so no other room is a candidate at any version.
 *  3. **The corrected room must not be fatally invalid**, which then fails on its own terms with
 *     its own fatal issues rather than on a room it never had.
 *
 *  **Provenance is why there is no fourth guard asking whether the document is already valid**
 *  (ADR 0069 decision 5b, amending decision 5). Before M7 there is no room control, so at version
 *  ≤ 2 the pair `{3600, 2400}` has exactly one origin — the seeded fixture's mis-measurement — and
 *  the correction is owed to every such row unconditionally. Asking whether the bodies happen to
 *  fit under the *wrong* room answers a question with no bearing on whether the wall was measured
 *  correctly, and it declined the correction for exactly the rows that were fine while applying it
 *  to the ones that were not.
 *
 *  **What makes the rewrite safe is not that the result validates.** It is that the corrected room
 *  is the constant `{3560, 2830}`, reached only at version ≤ 2 from the exact pre-correction pair.
 *  No room value is ever derived from the document's own placements, so a body at 3000 on wall B is
 *  still past the wall after the correction and is still marked: nothing is rescued into a room
 *  nobody entered (ADR 0069 decision 5). */
function correctPreCorrectionRoom(
  design: Design,
  catalog: BodyCatalog,
): Design {
  if (!isPreCorrectionRoom(design.room)) return design;

  const corrected: Design = {
    ...design,
    room: { ...design.room, ...CORRECTED_ROOM_MM },
  };
  // Fatal findings only: since ADR 0065 an overflow after the correction is a mark, not a failure
  // to rescue, and wall A narrows by 40 mm, so a corrected row may show a mark it did not show
  // before. That mark is true — the alternative is a kitchen built against a measurement the
  // product knows is wrong.
  if (hasFatalIssues(corrected, catalog)) return design;
  return corrected;
}

function isPreCorrectionRoom(room: DesignRoom): boolean {
  return (
    room.widthMm === PRE_CORRECTION_ROOM_MM.widthMm &&
    room.depthMm === PRE_CORRECTION_ROOM_MM.depthMm
  );
}

function hasFatalIssues(design: Design, catalog: BodyCatalog): boolean {
  return (
    fatalDesignValidationIssues(validateDesignForCatalog(design, catalog))
      .length > 0
  );
}

function parseDesign(raw: unknown): Design {
  const result = DesignSchema.safeParse(raw);
  // The *shape* of the failure, never `error.message`: that renders the whole tree, echoes an
  // unrecognised key verbatim, and grows with the row — and this error's message reaches a reader
  // of the share link through the load path's response.
  if (!result.success) {
    throw new InvalidDesignError(describeSchemaIssues(result.error.issues));
  }
  return result.data;
}

/** Every `emptyColumns` entry wider than the ceiling, replaced in place by the pieces it becomes —
 *  left to right, ceiling-sized, the remainder last — through the same `splitEmptySpanAtCap` the
 *  width command splits a shrink with.
 *
 *  Returned by identity when nothing is oversized, which is every document the product has ever
 *  written and all five rows in the application database as measured on 2026-09-02: a load that
 *  changes nothing must not rewrite the object a later save is diffed against.
 *
 *  **What this does not do is decide the document is valid.** The pieces can still collide on a key
 *  with each other or with a placement (`deriveColumnKeyAt` buckets at 10 mm, and a piece boundary
 *  is a new centre), and `assertDesignValidForCatalog` runs immediately after and refuses if they
 *  do. That is the failure mode ADR 0052 names as this wave's specific risk — a seam writing a
 *  document its own validator refuses — and it is refused loudly here rather than nudged, exactly as
 *  `refuseUnreproducibleKey` refuses it in the other direction. */
function normaliseOversizedEmptyColumnEntries(design: Design): Design {
  const emptyColumns = design.emptyColumns;
  if (!emptyColumns?.some(isWiderThanCap)) return design;

  const normalised = emptyColumns.flatMap(splitOneEntry);
  // The array grew, so the schema's own bound has to be re-asserted: `DesignSchema` capped what
  // arrived, and nothing has yet capped what this produced. A hostile v1 document of
  // `MAX_EMPTY_COLUMNS` entries at the widest a room may be is the shape that matters — thirteen
  // pieces each — and it must be refused rather than handed on as a document the write seam would
  // then reject anyway.
  if (normalised.length > MAX_EMPTY_COLUMNS) {
    throw new InvalidDesignError(
      `normalising empty columns would exceed the ${String(MAX_EMPTY_COLUMNS)}-entry bound`,
    );
  }
  return { ...design, emptyColumns: normalised };
}

/** One entry, as the columns ADR 0052 allows.
 *
 *  Left to right from the entry's own left edge, so the normalisation is a fact about the document
 *  and not about the order it happens to be read in.
 *
 *  **All or nothing.** A split whose pieces would not land on whole millimetres — only possible for
 *  an entry of odd width, which no command in this project can produce, since every width in §7's
 *  catalogue is even — is not performed at all, and the entry goes forward as it was for
 *  `assertDesignValidForCatalog` to refuse. Rounding a centre onto a millimetre would key the piece
 *  as its neighbour, which is the collapse `projectEmptyColumns` refuses at the other seam. */
function splitOneEntry(emptyColumn: EmptyColumn): readonly EmptyColumn[] {
  if (!isWiderThanCap(emptyColumn)) return [emptyColumn];
  const leftEdgeMm = emptyColumn.alongMm - emptyColumn.widthMm / 2;
  const pieces = splitEmptySpanAtCap(
    leftEdgeMm,
    leftEdgeMm + emptyColumn.widthMm,
  );
  if (!landsOnWholeMillimetres(pieces)) return [emptyColumn];
  // Every piece is the same space, so it keeps the entry's wall, floor, top and depth; only the
  // along-wall centre and the width differ.
  return pieces.map((piece) => ({
    ...emptyColumn,
    alongMm: piece.centreMm,
    widthMm: piece.widthMm,
  }));
}

function isWiderThanCap(emptyColumn: EmptyColumn): boolean {
  return emptyColumn.widthMm > MAX_EMPTY_COLUMN_WIDTH_MM;
}

/** Validates and migrates a stored payload to the current `Design` shape.
 *
 *  Version 3 is current. Older versions are carried forward rather than refused, through every
 *  normalisation their version predates and in the order
 *  `NORMALISATIONS_BY_VERSION_OWING_THEM` declares them.
 *
 *  DOM-001: the wire shape is only half the answer, so a migrated document is then held to the same
 *  executable contract the API write path enforces. A stored row that names a body no catalogue
 *  entry covers is a handled `InvalidDesignError` here, rather than an `UnknownBodyError` thrown
 *  inside the client's hydration where nothing is left to catch it (AV-3 step 5).
 *
 *  The catalogue defaults to the one the product loads, so the persistence adapter keeps calling
 *  this with two arguments; an import seam holding a different catalogue passes its own. */
export function migrateDesign(
  schemaVersion: number,
  raw: unknown,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): Design {
  refuseUnsupportedVersion(schemaVersion);
  const design = carryForward(parseDesign(raw), schemaVersion, catalog);
  assertDesignValidForCatalog(design, catalog);
  return design;
}

/** Refused before the payload is parsed: a row stamped with a version this build has never written
 *  is not a document with a bad field, and reporting its fields would say the wrong thing about it. */
function refuseUnsupportedVersion(schemaVersion: number): void {
  const isSupported =
    Number.isInteger(schemaVersion) &&
    schemaVersion >= OLDEST_SUPPORTED_SCHEMA_VERSION &&
    schemaVersion <= CURRENT_SCHEMA_VERSION;
  if (!isSupported) {
    throw new InvalidDesignError(
      `unsupported schema version ${String(schemaVersion)}`,
    );
  }
}
