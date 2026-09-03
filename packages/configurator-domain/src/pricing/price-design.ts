// **The pure pricing query**: one design, one catalogue, one book, one answer.
//
// A rebuild rather than an adaptation (ADR 0004: no pricing code survived M2 to adapt), against the
// millimetre `Design`/placement model.
//
// Three properties this module exists to hold, each of which is cheap here and expensive to
// retrofit:
//
// - **It imports no book.** The book is a parameter (ADR 0062 seam 1). Nothing under `pricing/`
//   imports `sample-price-book.ts` — `pricing-seams.test.ts` asserts the import graph, not just the
//   intention.
// - **It re-derives no order and no label.** `projectDesignForDisplay` is the one projection every
//   surface lists a design from, so the price lines' order **is** the breakdown's order and M8's:
//   wall → normalised band → `y0Mm` → `alongMm` → placement id, which after ADR 0063 is row-major.
//   Pricing does not sort, group or name anything of its own.
// - **It fails whole.** Every refusal returns before a single line is published.
//
// I/O-free, rendering-free, persistence-free: a function of its arguments returning plain data.
import {
  cabinetHandleCount,
  widthDerivedDoorLeafCount,
} from "../cabinet-handles.js";
import { resolveCatalogEquivalent } from "../catalog.js";
import type { Design } from "../design.js";
import {
  projectDesignForDisplay,
  type DisplayEntry,
} from "../queries/design-projection.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

import {
  amountForBody,
  listRuleIds,
  PRICE_BOOK_CURRENCY,
  type CabinetPriceRule,
  type HardwareTier,
  type MaterialTier,
  type PriceBook,
  type PricedBody,
  type TierGroup,
  type TierIdentity,
} from "./price-book.js";
import type {
  CabinetPriceLine,
  PricingFailure,
  PricingFailureCode,
  PricingResult,
  WholeKitchenPriceLine,
} from "./price-lines.js";

/** The whole-kitchen choices a design was configured with.
 *
 *  **Passed in rather than read off the document, because the document has no place to hold them
 *  yet**: wave 6E adds the settings container, and this wave must not add a field to `DesignSchema`
 *  ahead of it. An absent choice is priced at the book's own default tier, which is book data and
 *  not a rule living here. When 6E lands, its caller passes `design.settings` straight through and
 *  nothing in this module changes. */
export interface WholeKitchenSelections {
  readonly hardwareTierId?: string;
  readonly materialTierId?: string;
}

/** Everything the query needs, named rather than positional. */
export interface PriceDesignRequest {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** Supplied by the caller. See this module's head comment: the query imports no book. */
  readonly book: PriceBook;
  /** The version the caller asked to price at. Matched for **equality** against the book's own —
   *  no "current version" fallback, and no migration inside pricing. */
  readonly pricingVersion: string;
  readonly selections?: WholeKitchenSelections;
  /**
   * **What this wave consumes from ADR 0065's overflow detection, which wave 6A3 owns and which
   * does not exist yet.** The placements whose extent passes the end of their wall.
   *
   * Pricing neither detects this nor acts on it beyond carrying it: every body is priced, including
   * the ones that do not fit, and the total is flagged. Excluding them is the defect that decision
   * names — the total would silently drop and read as the kitchen getting *cheaper* at the moment
   * part of it became unbuildable.
   *
   * An id naming no placement is refused rather than ignored, so a stale report cannot silently
   * flag nothing.
   */
  readonly overflowingPlacementIds?: readonly string[];
}

/**
 * Prices a design. Every line, the exact total, and the book's version and status — or one refusal
 * naming what could not be resolved.
 */
export function priceDesign(request: PriceDesignRequest): PricingResult {
  const unusable = refuseUnusableRequest(request);
  if (unusable) return { ok: false, failure: unusable };

  const entries = listEntriesInDisplayOrder(request);
  const cabinetLines = priceEveryPlacement(entries, request);
  if (isRefused(cabinetLines))
    return { ok: false, failure: cabinetLines.failure };

  const wholeKitchenLines = priceWholeKitchen(entries, request);
  if (isRefused(wholeKitchenLines))
    return { ok: false, failure: wholeKitchenLines.failure };

  const lines = [...cabinetLines.value, ...wholeKitchenLines.value];
  const totalMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  if (!isExactAmount(totalMinor)) {
    return {
      ok: false,
      failure: failWith(
        "INVALID_AMOUNT",
        `Total ${String(totalMinor)} is not an exact count of minor units`,
      ),
    };
  }

  const overflowingPlacementIds = [...(request.overflowingPlacementIds ?? [])];
  return {
    ok: true,
    priced: {
      currency: request.book.currency,
      pricingVersion: request.book.version,
      status: request.book.status,
      lines,
      totalMinor,
      overflowingPlacementIds,
      totalIsFlagged: overflowingPlacementIds.length > 0,
    },
  };
}

/** Every refusal that can be decided before a line exists, in the order
 *  `CONFIGURATION_MODEL.md` states: the book itself, then the version, then the design against the
 *  catalogue, then the caller's overflow report. */
function refuseUnusableRequest(
  request: PriceDesignRequest,
): PricingFailure | undefined {
  return (
    refuseUnusableBook(request.book) ??
    refuseVersionMismatch(request) ??
    refuseUncatalogedBody(request) ??
    refuseUnknownOverflowPlacement(request)
  );
}

function refuseUnusableBook(book: PriceBook): PricingFailure | undefined {
  // Read as a plain string, because a book supplied from outside TypeScript can carry any currency
  // it likes and this is the boundary that says so. The declared type is what a caller *promises*;
  // this is what the value is.
  const currency: string = book.currency;
  if (currency !== PRICE_BOOK_CURRENCY) {
    return failWith(
      "INVALID_PRICE_BOOK",
      `Book currency "${currency}" is not ${PRICE_BOOK_CURRENCY}`,
    );
  }
  // A repeated rule id makes a line untraceable to one rule, which is the whole point of carrying
  // the id on the line.
  const duplicated = firstDuplicate(listRuleIds(book));
  if (duplicated !== undefined) {
    return failWith(
      "INVALID_PRICE_BOOK",
      `Rule id "${duplicated}" is declared more than once`,
      { id: duplicated },
    );
  }
  // **A second rule for one catalogue row is not a redundancy — it is a book that does not say what
  // the cabinet costs**, and the two rules carry distinct ids, so the sweep above passes it. Without
  // this, `indexRulesByBuildId`'s `Map` keeps whichever came last and nothing anywhere says so.
  //
  // The population it bites is ADR 0062's manufacturer dashboard, whose whole purpose is editing
  // prices: "price this cabinet differently" is a plausible edit for a non-developer to make by
  // *adding* a rule rather than changing one, and it would succeed silently. Since ADR 0068 the two
  // rules can also differ in **shape**, so the discarded one is likelier to be the intended one.
  const pricedTwice = firstDuplicate(
    book.cabinetRules.map((rule) => rule.buildId),
  );
  if (pricedTwice !== undefined) {
    return failWith(
      "INVALID_PRICE_BOOK",
      `Catalogue row "${pricedTwice}" is priced by more than one rule`,
      { id: pricedTwice },
    );
  }
  return undefined;
}

function refuseVersionMismatch(
  request: PriceDesignRequest,
): PricingFailure | undefined {
  if (request.book.version === request.pricingVersion) return undefined;
  return failWith(
    "PRICING_VERSION_MISMATCH",
    `Book is version "${request.book.version}"; pricing was asked for "${request.pricingVersion}"`,
    { id: request.book.version },
  );
}

/** The projection **throws** `UnknownBodyError` for a `buildId` the catalogue does not hold, which
 *  is right for it and wrong here: this query refuses with a code. Asked first, so the throw is
 *  unreachable rather than caught. */
function refuseUncatalogedBody(
  request: PriceDesignRequest,
): PricingFailure | undefined {
  for (const placement of request.design.placements) {
    const { buildId } = placement.body;
    if (request.catalog.has(buildId)) continue;
    return failWith(
      "UNKNOWN_BODY",
      `Placement "${placement.id}" names buildId "${buildId}", which the catalogue does not hold`,
      { placementId: placement.id, id: buildId },
    );
  }
  return undefined;
}

function refuseUnknownOverflowPlacement(
  request: PriceDesignRequest,
): PricingFailure | undefined {
  const placementIds = new Set(
    request.design.placements.map((placement) => placement.id),
  );
  for (const placementId of request.overflowingPlacementIds ?? []) {
    if (placementIds.has(placementId)) continue;
    return failWith(
      "UNKNOWN_OVERFLOW_PLACEMENT",
      `Overflow was reported for placement "${placementId}", which this design does not contain`,
      { placementId },
    );
  }
  return undefined;
}

/** The design's bodies in the one display order (ADR 0063, row-major), flattened out of the
 *  projection's groups. The groups are the breakdown's headings; a price line list is flat. */
function listEntriesInDisplayOrder(
  request: PriceDesignRequest,
): readonly DisplayEntry[] {
  return projectDesignForDisplay(request.design, request.catalog).flatMap(
    (group) => group.entries,
  );
}

function priceEveryPlacement(
  entries: readonly DisplayEntry[],
  request: PriceDesignRequest,
): Attempt<readonly CabinetPriceLine[]> {
  const rulesByBuildId = indexRulesByBuildId(request.book.cabinetRules);
  const lines: CabinetPriceLine[] = [];
  for (const entry of entries) {
    const line = priceOnePlacement(entry, request.catalog, rulesByBuildId);
    if (isRefused(line)) return line;
    lines.push(line.value);
  }
  return { value: lines };
}

function priceOnePlacement(
  entry: DisplayEntry,
  catalog: BodyCatalog,
  rulesByBuildId: ReadonlyMap<string, CabinetPriceRule>,
): Attempt<CabinetPriceLine> {
  const pricedAs = resolvePricingRow(catalog, entry.buildId);
  const pricedAsBuildId = pricedAs.buildId;
  const rule = rulesByBuildId.get(pricedAsBuildId);
  if (!rule) {
    return refusal(
      "NO_RULE_FOR_BODY",
      `Placement "${entry.placementId}" (buildId "${entry.buildId}") ` +
        describeUnresolvedRule(pricedAs),
      { placementId: entry.placementId, id: pricedAsBuildId },
    );
  }

  const body = describePricedBody(entry, pricedAs);
  if (isRefused(body)) return body;

  const amountMinor = amountForBody(rule.formula, body.value);
  if (amountMinor === undefined) {
    return refusal(
      "UNKNOWN_FORMULA_SHAPE",
      `Rule "${rule.ruleId}" carries a formula this build cannot evaluate: ` +
        JSON.stringify(rule.formula),
      { placementId: entry.placementId, id: rule.ruleId },
    );
  }
  const exact = refuseInexactAmount(
    amountMinor,
    rule.ruleId,
    entry.placementId,
  );
  if (exact) return exact;

  return {
    value: {
      lineId: `placement:${entry.placementId}:cabinet`,
      kind: "cabinet",
      ruleId: rule.ruleId,
      placementId: entry.placementId,
      buildId: entry.buildId,
      pricedAsBuildId,
      // The projection's label and the projection's width. A label pricing derived itself would be
      // a second authority for the name of a body, which is what wave 6A exists to prevent.
      label: entry.label,
      widthMm: entry.widthMm,
      quantity: 1,
      unitAmountMinor: amountMinor,
      amountMinor,
    },
  };
}

/**
 * **The catalogue row a body is priced as** — its equivalent (ADR 0022, ADR 0029) where it declares
 * one, and its own id where it does not.
 *
 * The one lookup pricing must **not** copy from the projection, which resolves the literal `buildId`
 * only: that is correct for a label, and it would fail whole on every seeded body here, because
 * ADR 0011 Gap A gives every seeded entry a non-insertable id that no §7 rule is written for.
 *
 * The fallback is not a guess — it is the four corner bodies, which are structural (ADR 0021),
 * which nothing in §7 builds, and for which having no equivalent is the correct answer rather than
 * a missing one. A book therefore prices them under their own ids.
 */
function resolvePricingRow(catalog: BodyCatalog, buildId: string): PricingRow {
  const equivalent = resolveCatalogEquivalent(catalog, buildId);
  if (equivalent) return equivalent;
  const definition = catalog.get(buildId);
  const declaredEquivalentId = definition?.catalogEquivalentId;
  return {
    buildId,
    definition,
    ...(declaredEquivalentId === undefined
      ? {}
      : { unresolvedEquivalentId: declaredEquivalentId }),
  };
}

/** The catalogue row a body is priced as, carried as the pair it was looked up as. The definition
 *  travels with the id because the two shapes ADR 0068 added read the row as well as name it, and
 *  looking it up twice is how the id and the row it stands for start to diverge. */
interface PricingRow {
  readonly buildId: string;
  readonly definition: BodyDefinition | undefined;
  /** Set only when the entry **declares** an equivalent that did not resolve — a broken pointer, as
   *  opposed to the corners' correct absence. Message material and nothing more: see
   *  `describeUnresolvedRule`. */
  readonly unresolvedEquivalentId?: string;
}

/**
 * **Why no rule was found, said in the terms the book's author has to act on.**
 *
 * `resolveCatalogEquivalent` answers `undefined` in three situations a caller cannot tell apart: the
 * entry declares no equivalent, the declared one is not in the catalogue, and the declared one is
 * there but is not insertable. The `?? buildId` fallback is right for the first — the four
 * structural corners have no equivalent and are priced under their own ids (ADR 0021, ADR 0022) —
 * and for the other two it produced a sentence that sent the reader hunting for a rule keyed on a
 * **seeded** id, which ADR 0022's whole premise says no book should ever hold.
 *
 * **Wording only, deliberately.** The behaviour is unchanged and there is no new failure code: a
 * pricing-specific code for a broken catalogue pointer would put the check in the wrong layer and
 * would be one more code wave 6C has to render or ignore. What makes a dangling pointer
 * unreachable is the catalogue-integrity assertion in `catalog.test.ts`, not a guard here.
 */
function describeUnresolvedRule(pricedAs: PricingRow): string {
  if (pricedAs.unresolvedEquivalentId === undefined) {
    return `resolves no rule for "${pricedAs.buildId}"`;
  }
  return (
    `declares equivalent "${pricedAs.unresolvedEquivalentId}", which the catalogue ` +
    `does not hold as an insertable row`
  );
}

/**
 * **What a formula is allowed to know about this body**: the width and the height the projection
 * derived, and the door leaves its width decides.
 *
 * The width and the height are the **placement's** — a body built to its opening stands at a height
 * its catalogue row does not state, which is exactly why the owner ruled height a price input
 * (2026-09-03).
 *
 * The leaf count is read from the **priced-as** row, and that is deliberate and is the opposite of
 * what `countCabinetHandles` does. A door step is part of a price *rule*, so it is a property of the
 * catalogue row the body is priced as; a handle *count* is a property of the already-built body
 * standing in the design. The difference is load-bearing rather than academic: every seeded row
 * declares `carriesHandles(n)` frozen at the size it was built, so reading the leaf count off the
 * placement's own entry would give a resized seeded `wall-2door-600` **no** step at 800 mm while an
 * inserted `wall-cabinet` beside it got one — two identical bodies at two prices.
 */
function describePricedBody(
  entry: DisplayEntry,
  pricedAs: PricingRow,
): Attempt<PricedBody> {
  try {
    return {
      value: {
        widthMm: entry.widthMm,
        heightMm: entry.heightMm,
        doorLeafCount: widthDerivedDoorLeafCount({
          buildId: pricedAs.buildId,
          rule: pricedAs.definition?.cabinetHandles,
          widthMm: entry.widthMm,
        }),
      },
    };
  } catch (error) {
    return refusal("UNDECLARED_HANDLE_COUNT", describeError(error), {
      placementId: entry.placementId,
      id: pricedAs.buildId,
    });
  }
}

/** Hardware, then material — after **all** placement lines, and both always emitted. A tier that
 *  costs nothing produces a line whose amount is zero, which the breakdown renders *inclus*; a rule
 *  that is missing is a refusal, never a zero, because omission must never be read as "included". */
function priceWholeKitchen(
  entries: readonly DisplayEntry[],
  request: PriceDesignRequest,
): Attempt<readonly WholeKitchenPriceLine[]> {
  const hardware = selectTier(
    request.book.hardware,
    request.selections?.hardwareTierId,
    "hardware",
  );
  if (isRefused(hardware)) return hardware;

  const material = selectTier(
    request.book.material,
    request.selections?.materialTierId,
    "material",
  );
  if (isRefused(material)) return material;

  const handles = countCabinetHandles(entries, request.catalog);
  if (isRefused(handles)) return handles;

  const hardwareLine = wholeKitchenLine({
    kind: "hardware",
    tier: hardware.value,
    quantity: handles.value,
    unitAmountMinor: hardware.value.perCabinetHandleMinor,
  });
  if (isRefused(hardwareLine)) return hardwareLine;

  const materialLine = wholeKitchenLine({
    kind: "material",
    tier: material.value,
    quantity: 1,
    unitAmountMinor: material.value.wholeKitchenMinor,
  });
  if (isRefused(materialLine)) return materialLine;

  return { value: [hardwareLine.value, materialLine.value] };
}

function selectTier<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
  chosenTierId: string | undefined,
  kind: "hardware" | "material",
): Attempt<TTier> {
  const tierId = chosenTierId ?? group.defaultTierId;
  const tier = group.tiers.find((candidate) => candidate.tierId === tierId);
  if (!tier) {
    return refusal(
      "UNKNOWN_TIER",
      `The book's ${kind} tiers hold no tier "${tierId}"`,
      { id: tierId },
    );
  }
  return { value: tier };
}

function wholeKitchenLine(line: {
  readonly kind: "hardware" | "material";
  readonly tier: HardwareTier | MaterialTier;
  readonly quantity: number;
  readonly unitAmountMinor: number;
}): Attempt<WholeKitchenPriceLine> {
  const amountMinor = line.quantity * line.unitAmountMinor;
  const inexact = refuseInexactAmount(amountMinor, line.tier.ruleId);
  if (inexact) return inexact;
  return {
    value: {
      lineId: `kitchen:${line.kind}`,
      kind: line.kind,
      ruleId: line.tier.ruleId,
      tierId: line.tier.tierId,
      name: line.tier.name,
      description: line.tier.description,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
      amountMinor,
    },
  };
}

/**
 * **How many cabinet handles this kitchen has** — the hardware line's quantity, which is a count of
 * *cabinet* handles and never of handle meshes (ADR 0061 decision 2): `tall-oven-tower` bills two,
 * not the four bars its builder draws, because the oven's and the microwave's arrived with the
 * appliances.
 *
 * **Read from the placement's own catalogue entry, and this is the one lookup in this module that
 * does not go through `catalogEquivalentId`.** A price *rule* belongs to the catalogue row a body is
 * named after; a handle *count* is a property of the already-built body standing in the design.
 * The two diverge on a real row: `wall-corner-return-570` declares one handle, while
 * `wall-cabinet`'s per-door rule at 570 mm yields two.
 */
function countCabinetHandles(
  entries: readonly DisplayEntry[],
  catalog: BodyCatalog,
): Attempt<number> {
  let handles = 0;
  for (const entry of entries) {
    const counted = countHandlesOn(entry, catalog.get(entry.buildId));
    if (isRefused(counted)) return counted;
    handles += counted.value;
  }
  return { value: handles };
}

/** `cabinetHandleCount` **throws** for an entry that declares no usable count (ADR 0061 decision 4),
 *  which is right for it: a silent default would bill an appliance's bars as cabinet hardware, or
 *  stop billing hardware the customer is buying. This query refuses with a code instead, so the
 *  conversion is here and this function does nothing else. */
function countHandlesOn(
  entry: DisplayEntry,
  definition: BodyDefinition | undefined,
): Attempt<number> {
  try {
    return {
      value: cabinetHandleCount({
        buildId: entry.buildId,
        rule: definition?.cabinetHandles,
        widthMm: entry.widthMm,
      }),
    };
  } catch (error) {
    return refusal("UNDECLARED_HANDLE_COUNT", describeError(error), {
      placementId: entry.placementId,
      id: entry.buildId,
    });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function indexRulesByBuildId(
  rules: readonly CabinetPriceRule[],
): ReadonlyMap<string, CabinetPriceRule> {
  return new Map(rules.map((rule) => [rule.buildId, rule]));
}

function firstDuplicate(ids: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

/** An amount is a whole count of minor units. A fraction is not a surprising price — it is one
 *  something has already rounded, and rounding belongs to presentation. */
function isExactAmount(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor);
}

function refuseInexactAmount(
  amountMinor: number,
  ruleId: string,
  placementId?: string,
): Refused | undefined {
  if (isExactAmount(amountMinor)) return undefined;
  return refusal(
    "INVALID_AMOUNT",
    `Rule "${ruleId}" produced ${String(amountMinor)}, which is not an exact count of minor units`,
    { ...(placementId === undefined ? {} : { placementId }), id: ruleId },
  );
}

/** The refusal half of every step below `priceDesign`. A step answers with a value or with the one
 *  failure that ends the whole query — there is no third branch, because there is no partial
 *  result. */
interface Refused {
  readonly failure: PricingFailure;
}
type Attempt<TValue> = { readonly value: TValue } | Refused;

function isRefused<TValue>(attempt: Attempt<TValue>): attempt is Refused {
  return "failure" in attempt;
}

function refusal(
  code: PricingFailureCode,
  detail: string,
  named?: { readonly placementId?: string; readonly id?: string },
): Refused {
  return { failure: failWith(code, detail, named) };
}

function failWith(
  code: PricingFailureCode,
  detail: string,
  named?: { readonly placementId?: string; readonly id?: string },
): PricingFailure {
  return { code, detail, ...named };
}
