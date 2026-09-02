import { MAX_EMPTY_COLUMNS } from "./design-bounds.js";
import type { Design, EmptyColumn } from "./design.js";
import { DesignSchema } from "./design.js";
import { KITCHEN_L_BODY_CATALOG } from "./fixtures/kitchen-l-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "./module-grid.js";
import { InvalidDesignError } from "./repository.js";
import { describeSchemaIssues } from "./failure-text.js";
import {
  landsOnWholeMillimetres,
  splitEmptySpanAtCap,
} from "./split-empty-span.js";
import { assertDesignValidForCatalog } from "./validate-design.js";
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
function migrateFromV1(raw: unknown): Design {
  return normaliseOversizedEmptyColumnEntries(parseDesign(raw));
}

/** Version 2 is written under ADR 0052, so an oversized entry in one is not a legacy shape to carry
 *  forward — it is a document that disagrees with the rule it was written under. Parsed and handed
 *  to `assertDesignValidForCatalog` unnormalised, which refuses it with
 *  `EMPTY_COLUMN_WIDER_THAN_CAP`, the same code the API write seam refuses it with. */
function migrateFromV2(raw: unknown): Design {
  return parseDesign(raw);
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

const MIGRATIONS: ReadonlyMap<number, (raw: unknown) => Design> = new Map([
  [1, migrateFromV1],
  [2, migrateFromV2],
]);

/** Validates and migrates a stored payload to the current `Design` shape.
 *
 *  Version 2 is current (ADR 0052). Version 1 is carried forward rather than refused: its one
 *  difference is an `emptyColumns` entry wider than the ceiling, which `migrateFromV1` splits into
 *  the columns the new rule allows. This is the version-keyed lookup `migrate-design.ts` has carried
 *  since it was written and never used.
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
  const design = migrate(raw);
  assertDesignValidForCatalog(design, catalog);
  return design;
}
