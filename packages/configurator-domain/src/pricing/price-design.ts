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
import { widthDerivedDoorLeafCount } from "../cabinet-handles.js";
import { resolveCatalogEquivalent } from "../catalog.js";
import type { Design } from "../design.js";
import { boundedFailureReason } from "../failure-text.js";
import {
  countHardwareMechanisms,
  type HardwareMechanismCounts,
} from "../hardware-mechanisms.js";
import {
  projectDesignForDisplay,
  type DisplayEntry,
} from "../queries/design-projection.js";
import { findOverflowingPlacementIds } from "../queries/overflowing-placements.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

import {
  amountForBody,
  listRuleIds,
  PRICE_BOOK_CURRENCY,
  PRICE_BOOK_STATUSES,
  usableCoefficientOf,
  type CabinetPriceRule,
  type HardwareTier,
  type MaterialTier,
  type PriceBook,
  type PriceBookStatus,
  type PriceCoefficientField,
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

/** The whole-kitchen choices a design was configured with — since wave 6E, `design.settings`,
 *  passed straight through by the caller holding the book.
 *
 *  **Passed in rather than read off the document here**, because this module takes a `Design` and
 *  still must not reach into it for a choice the *caller* is entitled to override; an absent choice
 *  is priced at the book's own default tier, which is book data and not a rule living here.
 *
 *  Each key is `string | undefined` rather than merely optional, and that is not decoration under
 *  `exactOptionalPropertyTypes`: `DesignSettings` is inferred from a Zod `.optional()`, which is
 *  present-and-`undefined`-assignable, so a plain `?: string` here would refuse the very value 6E
 *  exists to pass. The two readings mean the same thing to `selectTier`, which takes
 *  `string | undefined`. */
export interface WholeKitchenSelections {
  readonly hardwareTierId?: string | undefined;
  readonly materialTierId?: string | undefined;
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
  readonly selections?: WholeKitchenSelections | undefined;
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

  const overflowingPlacementIds = [
    ...findOverflowingPlacementIds(request.design),
  ];
  return {
    ok: true,
    priced: {
      currency: request.book.currency,
      pricingVersion: request.book.version,
      status: request.book.status,
      amountsProvisional: request.book.amountsProvisional,
      lines,
      totalMinor,
      overflowingPlacementIds,
      totalIsFlagged: overflowingPlacementIds.length > 0,
    },
  };
}

/** Every refusal that can be decided before a line exists, in the order
 *  `CONFIGURATION_MODEL.md` states: the book itself, then the version, then the design against the
 *  catalogue. */
function refuseUnusableRequest(
  request: PriceDesignRequest,
): PricingFailure | undefined {
  return (
    refuseUnusableBook(request.book) ??
    refuseVersionMismatch(request) ??
    refuseUncatalogedBody(request)
  );
}

/** What the book has to be before any of it is read, in the order it has always been asked: what it
 *  says about itself, then what its rules say about each other. */
function refuseUnusableBook(book: PriceBook): PricingFailure | undefined {
  return (
    refuseForeignCurrency(book) ??
    refuseUndeclaredStatus(book) ??
    refuseUndeclaredProvisionalFlag(book) ??
    refuseRepeatedRuleId(book) ??
    refuseRowPricedTwice(book)
  );
}

function refuseForeignCurrency(book: PriceBook): PricingFailure | undefined {
  // Read as a plain string, because a book supplied from outside TypeScript can carry any currency
  // it likes and this is the boundary that says so. The declared type is what a caller *promises*;
  // this is what the value is.
  const currency: string = book.currency;
  if (currency === PRICE_BOOK_CURRENCY) return undefined;
  return failWith(
    "INVALID_PRICE_BOOK",
    `Book currency "${currency}" is not ${PRICE_BOOK_CURRENCY}`,
  );
}

/** Read as `unknown` for the same reason the currency is read as a plain string, and refused for
 *  the same reason the flag below is. The status is **carried onto the priced result rather than
 *  acted on here**, so a book declaring `"Commercial"` or `null` publishes a `PricedDesign` whose
 *  status no surface anticipates — and which way that fails depends on how a surface happens to
 *  spell one equality. `status === "commercial"` fails safe; `status !== "estimate"` presents an
 *  estimate as a commercial offer. Neither spelling should be load-bearing, so the value is held to
 *  the union here instead. */
function refuseUndeclaredStatus(book: PriceBook): PricingFailure | undefined {
  const declared: unknown = book.status;
  if (isDeclaredStatus(declared)) return undefined;
  return failWith(
    "INVALID_PRICE_BOOK",
    `Book declares no "status", which is one of ${PRICE_BOOK_STATUSES.join(", ")}. ` +
      `Found: ${declared === undefined ? "nothing" : JSON.stringify(declared)}`,
  );
}

function isDeclaredStatus(declared: unknown): declared is PriceBookStatus {
  return (
    typeof declared === "string" &&
    (PRICE_BOOK_STATUSES as readonly string[]).includes(declared)
  );
}

/** Read as `unknown` for the same reason the currency is read as a plain string. The flag is
 *  **carried onto the priced result rather than acted on here**, so a book that omits it would
 *  publish an `undefined` that every surface reads as `false` — "these amounts have been costed" —
 *  which is the one direction this flag must never fail in. Refused rather than defaulted: a
 *  default would be this module deciding a fact about a book only its author knows. */
function refuseUndeclaredProvisionalFlag(
  book: PriceBook,
): PricingFailure | undefined {
  const declared: unknown = book.amountsProvisional;
  if (typeof declared === "boolean") return undefined;
  return failWith(
    "INVALID_PRICE_BOOK",
    `Book declares no "amountsProvisional" flag, which is a boolean. ` +
      `Found: ${declared === undefined ? "nothing" : JSON.stringify(declared)}`,
  );
}

function refuseRepeatedRuleId(book: PriceBook): PricingFailure | undefined {
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
  return undefined;
}

function refuseRowPricedTwice(book: PriceBook): PricingFailure | undefined {
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

  const evaluated = evaluateFormula(rule, body.value, entry.placementId);
  if (isRefused(evaluated)) return evaluated;

  const amountMinor = evaluated.value;
  if (amountMinor === undefined) {
    return refusal(
      "UNKNOWN_FORMULA_SHAPE",
      `Rule "${rule.ruleId}" carries a formula this build cannot evaluate: ` +
        JSON.stringify(rule.formula),
      { placementId: entry.placementId, id: rule.ruleId },
    );
  }
  const unpublishable = refuseUnpublishableAmount(
    amountMinor,
    rule.ruleId,
    entry.placementId,
  );
  if (unpublishable) return unpublishable;

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

/** `amountForBody` **throws** for a formula carrying a coefficient that is not an exact count of
 *  minor units (ADR 0062 seam 1: a book is assembled outside TypeScript, so its declared `number`
 *  is a promise and not a fact). That is right for it — there is no number to guess at — and this
 *  query refuses with a code instead, so the conversion is here and this function does nothing
 *  else. The same shape `refuseUnreadableFronts` has, for the same reason.
 *
 *  `undefined` travels through untouched: a shape nothing implements is the caller's other refusal
 *  and is not this one. */
function evaluateFormula(
  rule: CabinetPriceRule,
  body: PricedBody,
  placementId: string,
): Attempt<number | undefined> {
  try {
    return { value: amountForBody(rule.formula, body) };
  } catch (error) {
    return refusal("INVALID_AMOUNT", describeError(error), {
      placementId,
      id: rule.ruleId,
    });
  }
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
 * what `countHardwareMechanisms` does. A door step is part of a price *rule*, so it is a property of
 * the catalogue row the body is priced as; a *mechanism* count is a property of the already-built
 * body standing in the design. The difference is load-bearing rather than academic: every seeded row
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
 *  that is missing is a refusal, never a zero, because omission must never be read as "included".
 *  A tier whose *amount* is missing is the same refusal for the same reason — `checkedTierAmount`,
 *  which is what stops a `null` from arriving at the line as an honest-looking zero. */
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

  const hardwareAmount = hardwareUnitAmount(hardware.value, {
    entries,
    catalog: request.catalog,
  });
  if (isRefused(hardwareAmount)) return hardwareAmount;

  const hardwareLine = wholeKitchenLine({
    kind: "hardware",
    tier: hardware.value,
    unitAmountMinor: hardwareAmount.value,
  });
  if (isRefused(hardwareLine)) return hardwareLine;

  const materialAmount = checkedTierAmount(
    wholeKitchenAmount(material.value),
    material.value.ruleId,
  );
  if (isRefused(materialAmount)) return materialAmount;

  const materialLine = wholeKitchenLine({
    kind: "material",
    tier: material.value,
    unitAmountMinor: materialAmount.value,
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

/**
 * **The amount a tier is billed by, as the book declares it and before anything is multiplied by
 * it.** The field name travels with the number because a refusal has to say which of the two was
 * malformed, and because the number alone has lost that by the time it reaches the guard.
 *
 * `declared` is typed `unknown` although `HardwareTier` and `MaterialTier` both declare `number`,
 * for the reason `usableCoefficientOf` widens its own parameter: ADR 0062 seam 1 makes a book
 * versioned data authored outside TypeScript, so a declared `number` is a promise and not a fact.
 */
interface DeclaredTierAmount {
  readonly declared: unknown;
  readonly field: PriceCoefficientField;
}

/**
 * **What this whole kitchen's hardware costs at this tier** — the hardware line's unit amount, and
 * the line's whole amount, because the line's quantity is 1 (ADR 0092 decision 4). Three rates
 * cannot share one unit price, and 74 hinges plus 5 drawers do not add to a quantity anything can
 * be priced by.
 *
 * **All three rates are checked, whatever the design counts.** A book declaring `null` for its
 * push-to-open rate is malformed whether or not this particular kitchen has a push body — and the
 * seeded kitchen has none, so checking only the rates with a non-zero count would let that book
 * through every reconciliation this wave asserts.
 */
function hardwareUnitAmount(
  tier: HardwareTier,
  design: {
    readonly entries: readonly DisplayEntry[];
    readonly catalog: BodyCatalog;
  },
): Attempt<number> {
  const perHinge = checkedTierAmount(
    hardwareRate(tier, "perHingeMinor"),
    tier.ruleId,
  );
  if (isRefused(perHinge)) return perHinge;

  const perDrawer = checkedTierAmount(
    hardwareRate(tier, "perDrawerMinor"),
    tier.ruleId,
  );
  if (isRefused(perDrawer)) return perDrawer;

  const perPushToOpen = checkedTierAmount(
    hardwareRate(tier, "perPushToOpenMinor"),
    tier.ruleId,
  );
  if (isRefused(perPushToOpen)) return perPushToOpen;

  const mechanisms = countMechanisms(design.entries, design.catalog);
  if (isRefused(mechanisms)) return mechanisms;

  return {
    value:
      perHinge.value * mechanisms.value.hinges +
      perDrawer.value * mechanisms.value.drawers +
      perPushToOpen.value * mechanisms.value.pushToOpen,
  };
}

/** One of a hardware tier's three rates, carrying **its own** field name so a refusal says which of
 *  the three was unusable rather than only which tier was. */
function hardwareRate(
  tier: HardwareTier,
  field: "perHingeMinor" | "perDrawerMinor" | "perPushToOpenMinor",
): DeclaredTierAmount {
  return { declared: tier[field], field };
}

/** Every mechanism the design carries, or a refusal naming the first body whose fronts could not be
 *  read. **Guarded body by body before the total is taken**, because the error `countHardwareMechanisms`
 *  throws carries the build id in its message and a build id is not a placement id — and ADR 0092
 *  decision 1 requires the refusal to name both. */
function countMechanisms(
  entries: readonly DisplayEntry[],
  catalog: BodyCatalog,
): Attempt<HardwareMechanismCounts> {
  for (const entry of entries) {
    const unreadable = refuseUnreadableFronts(entry, catalog);
    if (unreadable) return unreadable;
  }
  return { value: countHardwareMechanisms(entries, catalog) };
}

/** `countHardwareMechanisms` **throws** `UndeclaredFrontPopulationError` for a body whose front
 *  population cannot be read (ADR 0092 decision 1), which is right for it: reading a missing
 *  declaration as zero mechanisms would price a whole kitchen's hinges at nothing and look
 *  implemented. This query refuses with a code instead, so the conversion is here and this function
 *  does nothing else — the shape the handle count's own conversion had before ADR 0092 replaced
 *  the hardware quantity basis. */
function refuseUnreadableFronts(
  entry: DisplayEntry,
  catalog: BodyCatalog,
): Refused | undefined {
  try {
    countHardwareMechanisms([entry], catalog);
    return undefined;
  } catch (error) {
    return refusal("UNDECLARED_FRONT_POPULATION", describeError(error), {
      placementId: entry.placementId,
      id: entry.buildId,
    });
  }
}

/** What a material tier charges once for the whole kitchen — the 2E sheet's *de la +9 000* delta,
 *  which is the largest single figure the book states. */
function wholeKitchenAmount(tier: MaterialTier): DeclaredTierAmount {
  return { declared: tier.wholeKitchenMinor, field: "wholeKitchenMinor" };
}

/** **Both whole-kitchen lines carry `quantity: 1`** (ADR 0092 decision 4). The material line always
 *  did; the hardware line does now that it prices three mechanisms at three rates, because three
 *  rates cannot share one unit price and 74 hinges plus 5 drawers do not add to a quantity anything
 *  can be priced by. `amountMinor === quantity × unitAmountMinor` still holds, trivially — and it is
 *  a published invariant of every line, so it holds here by construction rather than by luck.
 *
 *  Takes an **already-checked** amount: the two kinds reach one by different routes — a material
 *  tier declares its amount outright, a hardware tier declares three rates that are multiplied by a
 *  count — and folding both into this function would give it two reasons to change. */
function wholeKitchenLine(line: {
  readonly kind: "hardware" | "material";
  readonly tier: HardwareTier | MaterialTier;
  readonly unitAmountMinor: number;
}): Attempt<WholeKitchenPriceLine> {
  const unpublishable = refuseUnpublishableAmount(
    line.unitAmountMinor,
    line.tier.ruleId,
  );
  if (unpublishable) return unpublishable;
  return {
    value: {
      lineId: `kitchen:${line.kind}`,
      kind: line.kind,
      ruleId: line.tier.ruleId,
      tierId: line.tier.tierId,
      name: line.tier.name,
      description: line.tier.description,
      quantity: WHOLE_KITCHEN_QUANTITY,
      unitAmountMinor: line.unitAmountMinor,
      amountMinor: WHOLE_KITCHEN_QUANTITY * line.unitAmountMinor,
    },
  };
}

/** A whole-kitchen line is billed once for the kitchen, so its quantity is one. Named rather than
 *  written as a bare `1` twice, because it is the same fact both times. */
const WHOLE_KITCHEN_QUANTITY = 1;

/**
 * `usableCoefficientOf` **throws** for a tier amount that is not an exact count of minor units,
 * exactly as it does for a cabinet coefficient and for the same ADR 0062 seam 1 reason. This query
 * refuses with a code instead, so the conversion is here and this function does nothing else —
 * the shape `evaluateFormula` already has for the cabinet path.
 *
 * **`refuseUnpublishableAmount` cannot stand in for this and never could.** A `null`, `false`, `[]`
 * or `""` amount multiplied by a mechanism count is `0`: exact, non-negative, and published as a
 * line the breakdown renders *inclus* — omission read as "included", which is the one reading
 * `priceWholeKitchen` exists to prevent. `true` is worse still: a whole material upgrade billed at
 * one ban.
 */
function checkedTierAmount(
  amount: DeclaredTierAmount,
  ruleId: string,
): Attempt<number> {
  try {
    return { value: usableCoefficientOf(amount.declared, amount.field) };
  } catch (error) {
    return refusal("INVALID_AMOUNT", describeError(error), { id: ruleId });
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

/** Everything a finished amount has to be before it may appear on a line, integrality first: a
 *  fraction is the more specific fact about the number, and a negative fraction is both. */
function refuseUnpublishableAmount(
  amountMinor: number,
  ruleId: string,
  placementId?: string,
): Refused | undefined {
  return (
    refuseInexactAmount(amountMinor, ruleId, placementId) ??
    refuseNegativeAmount(amountMinor, ruleId, placementId)
  );
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

/** **A cabinet the customer would be paid to take.** Every coefficient a book states may be
 *  negative and the arithmetic stays exact, so integrality says nothing here: a manufacturer typing
 *  a minus sign through ADR 0062's dashboard published a line at a negative amount and a total that
 *  under-quoted, with no refusal anywhere (QA 6B2).
 *
 *  Asked of the **amount** rather than of the coefficients, because that is where the question
 *  actually is: a negative rate is not wrong in itself — a discount term the owner ruled would be
 *  one — and what may never be published is a line the whole of which is below zero. The total
 *  needs no guard of its own: it is a sum of lines that have each passed this one. */
function refuseNegativeAmount(
  amountMinor: number,
  ruleId: string,
  placementId?: string,
): Refused | undefined {
  if (amountMinor >= 0) return undefined;
  return refusal(
    "INVALID_AMOUNT",
    `Rule "${ruleId}" produced ${String(amountMinor)}, which is below zero`,
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

/**
 * The one place a `PricingFailure` is built, and therefore the one place its `detail` is made safe
 * to log or render.
 *
 * **Bounded unconditionally here rather than at each call site**, which is `failure-text.ts`'s own
 * discipline and the reason validation's copy of this bug is fixed and pricing's was not. Two
 * populations reach these strings: a book value, which ADR 0062 seam 1 puts outside TypeScript and
 * which `usableCoefficientOf` stringifies whole into its message, and `selectTier`'s tier id, which
 * comes straight off `request.selections` and is therefore **caller-chosen**. An unbounded,
 * un-scrubbed string from either is an amplification and a way to forge a log line.
 */
function failWith(
  code: PricingFailureCode,
  detail: string,
  named?: { readonly placementId?: string; readonly id?: string },
): PricingFailure {
  return { code, detail: boundedFailureReason(detail), ...named };
}
