import { MAX_EMPTY_COLUMNS } from "./design-bounds.js";
import type {
  Design,
  DesignPlacement,
  DesignRoom,
  EmptyColumn,
} from "./design.js";
import { cabinetDepthMmOf, LegacyDesignSchema } from "./design.js";
import { buildKitchenLBodyCatalog } from "./fixtures/kitchen-l-design.js";
import {
  DEFAULT_FINISH,
  isLegacyEnumFinishName,
  LEGACY_ENUM_FINISHES,
  type Finish,
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

/** The version this build writes, and the version at which a document is owed no normalisation at
 *  all. `neon-configuration-repository.ts` stamps every row it writes with this value, importing it
 *  rather than restating it: two copies of this number that disagree is a migration that silently
 *  stops running.
 *
 *  **Two waves raised this in the same day: 6J-a from 3 to 4 for the persisted cabinet depth, and
 *  6P from 4 to 5 for the finish model.** They were built in parallel and each bumped to 4; 6P
 *  merged second and took 5, keying its own arm at 4. The order is not arbitrary — a document
 *  written by 6J-a carries a depth and a legacy string finish, so it owes 6P's rewrite and must
 *  have a version that says so.
 *
 *  **The argument for 6P's bump is on the record because the two precedents point opposite ways.** ADR 0053 (`columnExtents`, `settings`): *an absent field whose absence is
 *  a legal state owes no bump* — a document written without the key loads exactly as it does today,
 *  and nothing about it is rewritten. ADR 0055 (the depth change): *a rewrite of stored values
 *  does.* This is the second shape and not the first, on three counts:
 *
 *  1. **It rewrites a value a document already carries.** `finish: "sage"` is not an absent field;
 *     it is a value with a new meaning, and every document holding one leaves this function
 *     carrying something else.
 *  2. **The stored shape changed, not only its membership.** A finish went from a string to a
 *     tagged object, so a document this build writes cannot be read by the build before it. A
 *     version is the only thing that tells the two apart at the row.
 *  3. **Without a bump there is no arm to key the normalisation on.** The rewrite would have to run
 *     unconditionally on every load, including on documents this build itself wrote, and its
 *     being a fixed point would be the only thing standing between a load and a silent rewrite —
 *     a computation where the table above is a declaration (ADR 0028). */
export const CURRENT_SCHEMA_VERSION = 5;

/** The oldest version still readable. Nothing below it was ever written, and a row claiming one is
 *  a row this build cannot account for. */
const OLDEST_SUPPORTED_SCHEMA_VERSION = 1;

/** One legacy shape, normalised away. Takes the catalogue because deciding whether a normalisation
 *  is owed can require knowing whether the document is executable, not only how it is shaped. */
type DesignNormalisation = (design: Design, catalog: BodyCatalog) => Design;

/** One legacy shape the **current schema cannot express**, normalised away while the document is
 *  still `unknown`.
 *
 *  A second stage exists for exactly one reason: `parseDesign` refuses what it cannot parse, and a
 *  document written under the shipped five-value finish enum is precisely that. Parsing first would
 *  refuse the documents this arm exists to rescue, and a load that refuses is a share link that is
 *  dead (ADR 0052). Nothing here validates: it rewrites one field into a shape the schema can then
 *  judge on its own terms, and a document that is malformed for any other reason still fails at the
 *  same gate with the same message. */
type RawNormalisation = (raw: unknown) => unknown;

/** Every normalisation a stored document may still be owed, **keyed by the version that owes it**
 *  and applied in ascending version order by `carryForward`.
 *
 *  Version 1 is every document written before wave 5G, under a rule that bounded a *merge* and not
 *  an empty column, so it may carry an entry ADR 0052 no longer permits. Version 2 is every document
 *  written before the room correction of 2026-09-03, so it carries the seeded room as it then stood.
 *  Version 3 is every document written before wave 6J-a, so it carries no persisted cabinet depth.
 *  Version 4 is every document written before wave 6P, when a finish was one of five strings; that
 *  normalisation is **entirely pre-parse** — `RAW_NORMALISATIONS_BY_VERSION_OWING_THEM`, keyed at 4
 *  — because it is the first legacy shape the current schema cannot even express, so after the parse
 *  a version 4 document is owed nothing. A version 1 document is owed all three of the older arms,
 *  in that order, and the pre-parse arm before any of them.
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

/** Version 4's answer to the table above, stated rather than left as a gap the lookup would throw
 *  on: everything a version 4 document is owed happens before the parse, so the parsed stage owes it
 *  nothing. **The `canFinish` strip used to sit here and was wrong there** — see
 *  `dropFinishFromBodiesThatCannotWearOne`, which is not version-keyed for a reason. */
function nothingIsOwedAfterParse(design: Design): Design {
  return design;
}

/** The pre-parse half of the same table, keyed the same way and walked over the same version range.
 *  A version with no entry owes nothing at this stage. Keyed at **4** rather than at each of 1-4:
 *  every older document walks past 4 on its way to the current version, so one entry reaches them
 *  all, and a document written at 4 — by wave 6J-a, carrying a depth and a legacy string finish —
 *  is exactly the case that must not be missed. */
const RAW_NORMALISATIONS_BY_VERSION_OWING_THEM: ReadonlyMap<
  number,
  RawNormalisation
> = new Map([[4, replaceLegacyEnumFinishes]]);

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

/** Every raw normalisation the stored version still owes, oldest first. Mirrors `carryForward` and
 *  runs before the parse it exists to make possible. */
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
  const result = LegacyDesignSchema.safeParse(raw);
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

/**
 * **What a document written under the shipped five-value finish enum becomes.**
 *
 * Every one of `white`, `clay`, `sage`, `graphite` and `oak` becomes `DEFAULT_FINISH`: the document
 * stays on PAL, and each cabinet that was wearing a colour resets to PAL's own default, *Alb*,
 * through the ordinary ADR 0057 reset. **The colour is lost and the price is not**, which is the
 * trade the owner took on 2026-09-04.
 *
 * The alternative on record was to deem a document wearing `clay` or `sage` to be MDF — the
 * material that still offers what it is wearing — and it was declined: it moves a design onto a
 * dearer tier the customer never chose, and a price that changes under a link somebody has already
 * shared is a worse surprise than a colour that does. ADR 0071 decision 5 narrows those two values
 * out of every palette; nothing here maps them to a nearest decor, for the reason ADR 0057 already
 * rejected nearest-finish mapping — an invisible substitution is worse than a visible loss.
 *
 * **No value is read for its shape.** A stored finish is one of five declared names or it is not a
 * legacy finish at all, and anything else travels to the schema exactly as it arrived, to be judged
 * there.
 *
 * Returned by identity when no placement carries one, so a load that changes nothing does not
 * rewrite the object a later save is diffed against — and so this arm is a fixed point on its own
 * output.
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

/** What one stored legacy name becomes, and the **two arms are the criterion's own split**.
 *
 *  `white`, `graphite` and `oak` are direct palette mappings — PAL *Alb*, PAL *Antracit* and a
 *  *Stejar* — so the document keeps the colour it was wearing. Only `clay` and `sage` reset, because
 *  ADR 0071 decision 5 narrows them out of every palette: they are paint and nothing else, and the
 *  owner's ruling of 2026-09-04 is scoped by its own title to those two. Resetting all five would
 *  render an anthracite kitchen white on a `/d/{id}` link the customer has already shared, which is
 *  a loss the ruling never asked for — the ruling traded *those two* colours to keep the document
 *  off a dearer tier, not every colour the enum could express.
 *
 *  **The arm is chosen by the declaration's `kind`, never by naming the two values here.** The reset
 *  is exactly "this value has no palette entry", so `LEGACY_ENUM_FINISHES` deciding it keeps this
 *  function and ADR 0071's narrowing from drifting apart — and it is what preserves the guard one
 *  test over that no migrated document ever holds a free colour, since PAL has no control that
 *  produces one and a PAL kitchen wearing paint is not a state the product can reach. */
function carriedForwardFrom(storedName: unknown): Finish {
  if (!isLegacyEnumFinishName(storedName)) return DEFAULT_FINISH;
  const declared = LEGACY_ENUM_FINISHES[storedName];
  return declared.kind === "palette-entry" ? declared : DEFAULT_FINISH;
}

/** A JSON object, or nothing. An array is not one: `placements` is walked as a list and its members
 *  are read as objects, and conflating the two is how a hostile document reaches a spread. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * **A body that cannot wear a finish does not carry one — on every load, at every version.**
 *
 * `open-shelf`, `hood` and `fridge-free` declare `canFinish: false`, and no command in this project
 * writes a finish onto one: `setFinish` refuses it (`commands/set-appearance.ts`) and `insertBody`
 * does not carry it across a swap. A stored document can still hold one, and the finish rewrite
 * above must not be the thing that puts it there — a normalisation that helpfully fills in a default
 * on a frontless body has invented a choice nobody made.
 *
 * **Deliberately not a version-keyed arm, and it was one until QA measured it.** Keyed at 3 it never
 * ran on a version 4 document at all, because `carryForward` walks `schemaVersion` up to
 * `CURRENT_SCHEMA_VERSION - 1` — so a row this build itself wrote could hold a finish on a hood, be
 * accepted by `PUT /api/designs/[id]` (nothing in `validate-design.ts` asks the question) and be
 * persisted with nothing left to remove it. Keying it *later* fixes nothing either: the walk is
 * ascending, so an arm above this one runs after it and its output is never re-checked. A property
 * of the loaded document has to be asserted on the loaded document.
 *
 * **It normalises rather than refuses**, ADR 0052: a `/d/{id}` link that refuses is a dead link, and
 * a finish on a frontless body is a document to correct rather than one to reject. An unknown build
 * id is left exactly as it is — whether the document is executable at all is
 * `assertDesignValidForCatalog`'s question, asked immediately after this, and answering it here
 * would refuse a document on the wrong grounds.
 *
 * Returned by identity when nothing is owed, so it is a fixed point and so a load that changes
 * nothing does not rewrite the object a later save is diffed against.
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

/** Validates and migrates a stored payload to the current `Design` shape.
 *
 *  `CURRENT_SCHEMA_VERSION` — 5 — is current. Older versions are carried forward rather than
 *  refused, through every
 *  normalisation their version predates and in the order
 *  `NORMALISATIONS_BY_VERSION_OWING_THEM` declares them — preceded by the pre-parse arms
 *  `RAW_NORMALISATIONS_BY_VERSION_OWING_THEM` declares, for the legacy shapes the current schema
 *  cannot parse at all, and followed by the one normalisation that is owed by no version in
 *  particular — `dropFinishFromBodiesThatCannotWearOne`, which runs on every load.
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
  catalog?: BodyCatalog,
): Design {
  refuseUnsupportedVersion(schemaVersion);
  // The raw stage first: it rescues documents `parseDesign` would refuse, which is the whole reason
  // it runs on `unknown`.
  const parsed = parseDesign(carryRawForward(raw, schemaVersion));
  const migrationCatalog =
    catalog ?? buildKitchenLBodyCatalog(cabinetDepthMmOf(parsed));
  const carried = carryForward(parsed, schemaVersion, migrationCatalog);
  requireCurrentCabinetDepth(carried);
  // Unconditional and after every arm, because it is a property of the loaded document rather than
  // a debt one version owes — including the version this build writes, and including whatever a
  // future arm produces.
  const design = dropFinishFromBodiesThatCannotWearOne(
    carried,
    migrationCatalog,
  );
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
