import { materialOfDesign } from "./design-material.js";
import { MAX_EMPTY_COLUMNS } from "./design-bounds.js";
import type {
  Design,
  DesignPlacement,
  DesignRoom,
  EmptyColumn,
} from "./design.js";
import { cabinetDepthMmOf, LegacyDesignSchema } from "./design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "./fixtures/kitchen-l-design.js";
import {
  DEFAULT_FINISH,
  isLegacyEnumFinishName,
  LEGACY_ENUM_FINISHES,
  materialOffersFinish,
  type Finish,
  type Material,
} from "./materials.js";
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

/** The version this build writes; a document at it is owed no normalisation. The persistence adapter
 *  imports it rather than restating it: two disagreeing copies silently stop the migration running.
 *  A rewrite of already-stored values owes a bump, an absent field does not (ADR 0055, ADR 0053). */
export const CURRENT_SCHEMA_VERSION = 5;

/** The oldest version still readable. Nothing below it was ever written. */
const OLDEST_SUPPORTED_SCHEMA_VERSION = 1;

/** One legacy shape, normalised away.
 *
 *  The catalogue is passed so an arm can measure what its own rewrite changes. It is no licence to ask
 *  whether the document is valid: that is `assertDesignValidForCatalog`'s question at the end of every
 *  load, and a finding the document carries either way is never a reason to decline a rewrite
 *  (ADR 0085 decision 1). */
type DesignNormalisation = (design: Design, catalog: BodyCatalog) => Design;

/** One legacy shape the **current schema cannot express**, normalised away while the document is still
 *  `unknown`: parsing first would refuse the very documents the arm rescues, and a refused load is a
 *  dead share link (ADR 0052). Nothing here validates; other malformations still fail at the schema. */
type RawNormalisation = (raw: unknown) => unknown;

/** Every normalisation a stored document may still be owed, keyed by the version that owes it and
 *  applied in ascending order by `carryForward`.
 *
 *  Version 1: may carry an oversized `emptyColumns` entry. Version 2: carries the seeded room as it
 *  stood before the 2026-09-03 correction. Version 3: carries no persisted cabinet depth. Version 4:
 *  carries a legacy string finish, owed entirely pre-parse (`RAW_NORMALISATIONS_BY_VERSION_OWING_THEM`).
 *
 *  Each entry may assume every older one has already run and nothing about a younger one, so a new
 *  older arm goes at the **front** of this map. */
const NORMALISATIONS_BY_VERSION_OWING_THEM: ReadonlyMap<
  number,
  DesignNormalisation
> = new Map([
  [1, normaliseOversizedEmptyColumnEntries],
  [2, correctPreCorrectionRoom],
  [3, addDefaultCabinetDepth],
  [4, nothingIsOwedAfterParse],
]);

/** Version 3 predates the persisted cabinet depth. Preserve the existing tier selections while
 * adding the depth every such document was actually built at. */
function addDefaultCabinetDepth(design: Design): Design {
  return {
    ...design,
    settings: {
      ...design.settings,
      cabinetDepthMm: 600,
    },
  };
}

/** Version 4's entry in the table above, so the lookup does not throw: everything it owes happens
 *  before the parse. The `canFinish` strip is not version-keyed (see
 *  `dropFinishFromBodiesThatCannotWearOne`). */
function nothingIsOwedAfterParse(design: Design): Design {
  return design;
}

/** The pre-parse half of the table above; a version with no entry owes nothing at this stage. Keyed
 *  at 4 only: every older document walks past 4 on its way to the current version. */
const RAW_NORMALISATIONS_BY_VERSION_OWING_THEM: ReadonlyMap<
  number,
  RawNormalisation
> = new Map([[4, replaceLegacyEnumFinishes]]);

/** Every normalisation the stored version still owes, oldest first. A document already at
 *  `CURRENT_SCHEMA_VERSION` walks none, so a customer's own 3600 x 2400 room is left alone. */
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

/** Every raw normalisation the stored version still owes, oldest first; runs before the parse. */
function carryRawForward(raw: unknown, schemaVersion: number): unknown {
  let carried = raw;
  for (
    let version = schemaVersion;
    version < CURRENT_SCHEMA_VERSION;
    version += 1
  ) {
    const normalisation = RAW_NORMALISATIONS_BY_VERSION_OWING_THEM.get(version);
    if (normalisation) carried = normalisation(carried);
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

/** The seeded room as every document up to version 2 carried it. A literal, not read from a fixture:
 *  it describes documents already written, which no later fixture edit may change. */
const PRE_CORRECTION_ROOM_MM = { widthMm: 3600, depthMm: 2400 } as const;

/** The room the correction writes, read from the fixture (ADR 0083 decision 9): the arm repairs copies
 *  of the demo, so a room the demo no longer has would overflow once a customer chose the 700 mm depth.
 *  Still a constant fixed at module load, never derived from the document being migrated. */
const CORRECTED_ROOM_MM = {
  widthMm: KITCHEN_L_DESIGN.room.widthMm,
  depthMm: KITCHEN_L_DESIGN.room.depthMm,
} as const;

/** The room the 2026-09-03 correction gave the seeded kitchen, written over the one an older document
 *  stores: such a row was legal under the rule in force when written, so it is normalised, not refused.
 *
 *  Guards, because a rewrite of a room is a rewrite of somebody's kitchen:
 *  1. keyed at version 2, so only documents stored before any room control are walked;
 *  2. only the exact pre-correction pair is a candidate;
 *  3. the correction must not create a fatal finding the document did not already carry
 *     (`createsAFatalFinding`).
 *
 *  There is deliberately no guard asking whether the document is already valid: at version 2 or below
 *  the pair has exactly one origin, so the correction is owed unconditionally (ADR 0069 decision 5b).
 *  No room value is derived from the document's placements, so nothing is rescued into a room nobody
 *  entered (ADR 0069 decision 5). */
function correctPreCorrectionRoom(
  design: Design,
  catalog: BodyCatalog,
): Design {
  if (!isPreCorrectionRoom(design.room)) return design;

  const corrected: Design = {
    ...design,
    room: { ...design.room, ...CORRECTED_ROOM_MM },
  };
  if (createsAFatalFinding({ before: design, after: corrected, catalog })) {
    return design;
  }
  return corrected;
}

function isPreCorrectionRoom(room: DesignRoom): boolean {
  return (
    room.widthMm === PRE_CORRECTION_ROOM_MM.widthMm &&
    room.depthMm === PRE_CORRECTION_ROOM_MM.depthMm
  );
}

/** Whether the rewrite itself makes the document worse (ADR 0085 decision 2): a normalisation's guard
 *  asks about the normalisation, never about the document.
 *
 *  Fatal findings only: an overflow mark after the correction is true, not a failure to rescue
 *  (ADR 0065). Comparative: the one total validator runs on both rooms and a finding present under
 *  both is not caused by the rewrite. No code is classified here, so a code is room-relevant exactly
 *  when its findings differ across the rooms (ADR 0085 decision 3). Keyed by `(code, path)`, not count:
 *  removing one fatal finding while creating another must still decline. */
function createsAFatalFinding(rewrite: {
  readonly before: Design;
  readonly after: Design;
  readonly catalog: BodyCatalog;
}): boolean {
  const carried = new Set(fatalFindingKeys(rewrite.before, rewrite.catalog));
  return fatalFindingKeys(rewrite.after, rewrite.catalog).some(
    (key) => !carried.has(key),
  );
}

/** One fatal finding as the pair that identifies it, in the `path:code` shape
 *  `describeDesignValidationIssues` reports. */
function fatalFindingKeys(
  design: Design,
  catalog: BodyCatalog,
): readonly string[] {
  return fatalDesignValidationIssues(
    validateDesignForCatalog(design, catalog),
  ).map((issue) => `${issue.path}:${issue.code}`);
}

function parseDesign(raw: unknown): Design {
  const result = LegacyDesignSchema.safeParse(raw);
  // The *shape* of the failure, never `error.message`: that renders the whole tree, echoes an
  // unrecognised key verbatim, and grows with the row — and this error's message reaches a reader
  // of the share link through the load path's response.
  if (!result.success) {
    throw new InvalidDesignError(describeSchemaIssues(result.error.issues));
  }
  return result.data;
}

/** Every `emptyColumns` entry wider than the ceiling, replaced in place by the pieces it becomes
 *  through the same `splitEmptySpanAtCap` the width command uses (ADR 0052).
 *
 *  Returned by identity when nothing is oversized, so a load that changes nothing does not rewrite the
 *  object a later save is diffed against. It does not decide the document is valid: pieces can still
 *  collide on a column key, and `assertDesignValidForCatalog` refuses that loudly right after. */
function normaliseOversizedEmptyColumnEntries(design: Design): Design {
  const emptyColumns = design.emptyColumns;
  if (!emptyColumns?.some(isWiderThanCap)) return design;

  const normalised = emptyColumns.flatMap(splitOneEntry);
  // The array grew past what `DesignSchema` capped on arrival, so its bound is re-asserted here.
  if (normalised.length > MAX_EMPTY_COLUMNS) {
    throw new InvalidDesignError(
      `normalising empty columns would exceed the ${String(MAX_EMPTY_COLUMNS)}-entry bound`,
    );
  }
  return { ...design, emptyColumns: normalised };
}

/** One entry as the columns ADR 0052 allows, split left to right from its own left edge.
 *
 *  All or nothing: a split whose pieces would not land on whole millimetres (an odd width, which no
 *  command produces) is not performed, and the entry goes forward for the validator to refuse, since
 *  rounding a centre would key the piece as its neighbour. */
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

/**
 * What a document written under the five-value finish enum becomes: each of `white`, `clay`, `sage`,
 * `graphite` and `oak` maps through `carriedForwardFrom`, and the document stays on PAL.
 *
 * No value is read for its shape: anything that is not one of the five names travels to the schema
 * unchanged. Returned by identity when no placement carries one, so it is a fixed point.
 */
function replaceLegacyEnumFinishes(raw: unknown): unknown {
  const document = asRecord(raw);
  const placements = document?.["placements"];
  if (!document || !Array.isArray(placements)) return raw;
  if (!placements.some(carriesLegacyEnumFinish)) return raw;
  return { ...document, placements: placements.map(replaceOneEnumFinish) };
}

function carriesLegacyEnumFinish(placement: unknown): boolean {
  return isLegacyEnumFinishName(
    asRecord(asRecord(placement)?.["body"])?.["finish"],
  );
}

function replaceOneEnumFinish(placement: unknown): unknown {
  if (!carriesLegacyEnumFinish(placement)) return placement;
  const record = asRecord(placement) ?? {};
  const body = asRecord(record["body"]) ?? {};
  return {
    ...record,
    body: { ...body, finish: carriedForwardFrom(body["finish"]) },
  };
}

/** What one stored legacy name becomes. `white`, `graphite` and `oak` map to PAL palette entries and
 *  keep their colour; `clay` and `sage`, which ADR 0071 decision 5 narrows out of every palette, reset
 *  to `DEFAULT_FINISH` rather than move the design onto a dearer material tier.
 *
 *  The arm is chosen by the declaration's `kind` in `LEGACY_ENUM_FINISHES`, never by naming the two
 *  values here, so this function cannot drift from that narrowing. */
function carriedForwardFrom(storedName: unknown): Finish {
  if (!isLegacyEnumFinishName(storedName)) return DEFAULT_FINISH;
  const declared = LEGACY_ENUM_FINISHES[storedName];
  return declared.kind === "palette-entry" ? declared : DEFAULT_FINISH;
}

/** A JSON object, or nothing. An array is not one: conflating the two is how a hostile document
 *  reaches a spread. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * A body that cannot wear a finish does not carry one, on every load at every version: `open-shelf`,
 * `hood` and `fridge-free` declare `canFinish: false`, so a stored finish on one is dropped rather
 * than a default invented.
 *
 * Deliberately not a version-keyed arm: `carryForward` stops at `CURRENT_SCHEMA_VERSION - 1`, so a
 * keyed arm never ran on a document this build itself wrote, and `PUT /api/designs/[id]` would accept
 * and persist the finish. A property of the loaded document is asserted on the loaded document.
 *
 * It normalises rather than refuses (ADR 0052), and leaves an unknown build id alone for the validator.
 * Returned by identity when nothing is owed, so it is a fixed point.
 */
function dropFinishFromBodiesThatCannotWearOne(
  design: Design,
  catalog: BodyCatalog,
): Design {
  const wearsOne = (placement: DesignPlacement): boolean =>
    wearsAFinishItCannotWear(placement, catalog);
  if (!design.placements.some(wearsOne)) return design;
  return {
    ...design,
    placements: design.placements.map((placement) =>
      wearsOne(placement) ? withoutFinish(placement) : placement,
    ),
  };
}

function wearsAFinishItCannotWear(
  placement: DesignPlacement,
  catalog: BodyCatalog,
): boolean {
  if (placement.body.finish === undefined) return false;
  return catalog.get(placement.body.buildId)?.canFinish === false;
}

function withoutFinish(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

/**
 * No loaded document wears a finish its own material does not offer (ADR 0057): each such placement
 * is rewritten to the material's declared `defaultFinish`, never to a colour built from a swatch hex
 * (ADR 0078 decision 4).
 *
 * It runs on the load path, immediately before `assertDesignValidForCatalog`, so that validator's
 * `PLACEMENT_WEARS_UNOFFERED_FINISH` refusal is unreachable on load (ADR 0078 decision 2). Free
 * colours written onto a PAL kitchen exist in stored rows (ADR 0054).
 *
 * Its order relative to the strip is not load-bearing, because the two commute: this resolution never
 * adds or removes a `finish` key, and the strip reads only a finish's presence (ADR 0085 decision 6,
 * asserted in `tests/finish-resolution-at-the-load-seam.test.ts`). A change that reads a finish
 * **value** to decide, or writes a `finish` key where there was none, breaks that; measure first.
 *
 * Absence stays absence (ADR 0078 decision 5). An undeclared `materialTierId` resolves nothing and
 * must keep loading, never throwing (ADR 0078 decision 3). Keyed to no version and takes no bump,
 * for the reason `dropFinishFromBodiesThatCannotWearOne` states. Returned by identity when nothing
 * is owed.
 */
function resolveFinishesTheMaterialDoesNotOffer(design: Design): Design {
  const lookup = materialOfDesign(design);
  if (lookup.kind === "undeclared") return design;

  const material = lookup.material;
  const resolved = resolveGlobalFinishTheMaterialDoesNotOffer(design, material);
  const wearsUnoffered = (placement: DesignPlacement): boolean =>
    wearsAFinishTheMaterialDoesNotOffer(placement, material);
  if (!resolved.placements.some(wearsUnoffered)) return resolved;
  return {
    ...resolved,
    placements: resolved.placements.map((placement) =>
      wearsUnoffered(placement)
        ? wearing(placement, material.defaultFinish)
        : placement,
    ),
  };
}

/** The same correction for `settings.finish` (ADR 0099 decision 6). This build's own commands never
 *  produce such a document, so it is a load-seam safety net for one that arrived by another route
 *  (a restored backup, a hand-edited row) and keeps it loading (ADR 0052). Keyed to no version. */
function resolveGlobalFinishTheMaterialDoesNotOffer(
  design: Design,
  material: Material,
): Design {
  const finish = design.settings?.finish;
  if (finish === undefined || materialOffersFinish(material, finish)) {
    return design;
  }
  return {
    ...design,
    settings: { ...design.settings, finish: material.defaultFinish },
  };
}

function wearsAFinishTheMaterialDoesNotOffer(
  placement: DesignPlacement,
  material: Material,
): boolean {
  const finish = placement.body.finish;
  return finish !== undefined && !materialOffersFinish(material, finish);
}

function wearing(placement: DesignPlacement, finish: Finish): DesignPlacement {
  return { ...placement, body: { ...placement.body, finish } };
}

/** Validates and migrates a stored payload to the current `Design` shape.
 *
 *  Older versions are carried forward rather than refused: the pre-parse arms first, then the
 *  version-keyed ones, then the two normalisations owed by no version
 *  (`dropFinishFromBodiesThatCannotWearOne`, then `resolveFinishesTheMaterialDoesNotOffer`).
 *
 *  DOM-001: a migrated document is held to the executable contract the API write path enforces, so a
 *  row naming an uncatalogued body is a handled `InvalidDesignError` here, not an `UnknownBodyError`
 *  thrown inside client hydration.
 *
 *  The catalogue defaults to the one the product loads; an import seam passes its own. */
export function migrateDesign(
  schemaVersion: number,
  raw: unknown,
  catalog?: BodyCatalog,
): Design {
  refuseUnsupportedVersion(schemaVersion);
  // The raw stage runs first because it rescues documents `parseDesign` would refuse.
  const parsed = parseDesign(carryRawForward(raw, schemaVersion));
  const migrationCatalog =
    catalog ?? buildKitchenLBodyCatalog(cabinetDepthMmOf(parsed));
  const carried = carryForward(parsed, schemaVersion, migrationCatalog);
  requireCurrentCabinetDepth(carried);
  // Unconditional and after every arm: a property of the loaded document, not a debt one version owes.
  const stripped = dropFinishFromBodiesThatCannotWearOne(
    carried,
    migrationCatalog,
  );
  // Must precede the validator (ADR 0078 decision 2); its order against the strip is free (see its doc).
  const design = resolveFinishesTheMaterialDoesNotOffer(stripped);
  assertDesignValidForCatalog(
    design,
    catalog ?? buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  );
  return design;
}

function requireCurrentCabinetDepth(design: Design): void {
  if (design.settings?.cabinetDepthMm === undefined) {
    throw new InvalidDesignError(
      "schema version 5 requires settings.cabinetDepthMm",
    );
  }
}

/** Refused before the payload is parsed: a row stamped with a version this build never wrote is not a
 *  document with a bad field, and reporting its fields would say the wrong thing about it. */
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
