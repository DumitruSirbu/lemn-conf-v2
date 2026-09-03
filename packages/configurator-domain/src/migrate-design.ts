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
  validateDesignForCatalog,
} from "./validate-design.js";
import type { BodyCatalog } from "./void-engine.js";

/** Version 1 is every document written before wave 5G, under a rule that bounded a *merge* and not
 *  an empty column — so it may carry an entry ADR 0052 no longer permits, and the answer is to
 *  **normalise it rather than refuse it**.
 *
 *  A 900 mm empty column is executable: it renders correctly, and all it does wrong is refuse
 *  `widthFlex: 'fit'` inserts. It is a legal document under a superseded rule, not the unexecutable
 *  document DOM-001 refuses, and a `/d/{id}` share link is the one artefact this project hands to
 *  someone who cannot be asked to reload it. Clamping would silently delete wall; grandfathering
 *  would leave the invariant unenforceable. Splitting keeps every millimetre and produces a map that
 *  satisfies the new rule by construction, which the next save writes back in the normalised shape.
 *
 *  Before `assertDesignValidForCatalog`, because that is the seam that now refuses the oversized
 *  entry — normalising after it would refuse the very document this exists to carry. */
function migrateFromV1(raw: unknown, catalog: BodyCatalog): Design {
  return normaliseOversizedEmptyColumnEntries(migrateFromV2(raw, catalog));
}

/** Version 2 is written under ADR 0052, so an oversized entry in one is not a legacy shape to carry
 *  forward — it is a document that disagrees with the rule it was written under. Handed to
 *  `assertDesignValidForCatalog` unnormalised, which refuses it with `EMPTY_COLUMN_WIDER_THAN_CAP`,
 *  the same code the API write seam refuses it with.
 *
 *  What it *is* carried forward across is the room correction of 2026-09-03, because every document
 *  at this version or below was written from the seed as it then stood. */
function migrateFromV2(raw: unknown, catalog: BodyCatalog): Design {
  return correctPreCorrectionRoom(migrateFromV3(raw), catalog);
}

/** Version 3 is written under the corrected room, so its `room` is the document's own and nothing
 *  here may touch it — including the 3600 × 2400 an M7 customer may genuinely enter. */
function migrateFromV3(raw: unknown): Design {
  return parseDesign(raw);
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
 *     settles the customer case; the two below are what make a wrong version stamp survivable.
 *  2. **The exact pre-correction pair**, so no other room is a candidate at any version.
 *  3. **It must repair something.** A document its stored room already holds is returned by
 *     identity — a load that changes nothing must not rewrite the object a later save is diffed
 *     against — and so is one the corrected room would not rescue, which then fails on its own
 *     terms with its own issues rather than on a room it never had. */
function correctPreCorrectionRoom(
  design: Design,
  catalog: BodyCatalog,
): Design {
  if (!isPreCorrectionRoom(design.room)) return design;

  const corrected: Design = {
    ...design,
    room: { ...design.room, ...CORRECTED_ROOM_MM },
  };
  if (isValidForCatalog(design, catalog)) return design;
  if (!isValidForCatalog(corrected, catalog)) return design;
  return corrected;
}

function isPreCorrectionRoom(room: DesignRoom): boolean {
  return (
    room.widthMm === PRE_CORRECTION_ROOM_MM.widthMm &&
    room.depthMm === PRE_CORRECTION_ROOM_MM.depthMm
  );
}

function isValidForCatalog(design: Design, catalog: BodyCatalog): boolean {
  return validateDesignForCatalog(design, catalog).length === 0;
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

const MIGRATIONS: ReadonlyMap<
  number,
  (raw: unknown, catalog: BodyCatalog) => Design
> = new Map([
  [1, migrateFromV1],
  [2, migrateFromV2],
  [3, migrateFromV3],
]);

/** Validates and migrates a stored payload to the current `Design` shape.
 *
 *  Version 3 is current. Older versions are carried forward rather than refused, each arm adding the
 *  one normalisation its version predates: version 2 predates the 2026-09-03 room correction, and
 *  version 1 additionally predates ADR 0052's ceiling on an `emptyColumns` entry.
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
  const migrate = MIGRATIONS.get(schemaVersion);
  if (!migrate) {
    throw new InvalidDesignError(
      `unsupported schema version ${String(schemaVersion)}`,
    );
  }
  const design = migrate(raw, catalog);
  assertDesignValidForCatalog(design, catalog);
  return design;
}
