// The pure pricing query: one design, one catalogue, one book, one answer.
//
// - It imports no book: the book is a parameter (ADR 0062 seam 1), and nothing under `pricing/`
//   imports `sample-price-book.ts`.
// - It re-derives no order and no label: line order is `projectDesignForDisplay`'s (ADR 0063).
// - It fails whole: every refusal returns before a single line is published.
import { widthDerivedDoorLeafCount } from "../cabinet-handles.js";
import { resolveCatalogEquivalent } from "../catalog.js";
import type { Design } from "../design.js";
import { boundedFailureReason } from "../failure-text.js";
import {
  ContradictoryFrontDeclarationError,
  doorLeafCount,
  frontPopulationQueryFor,
  UnbuildableDoorBandError,
  UndeclaredFrontPopulationError,
} from "../front-population.js";
import {
  countHardwareMechanisms,
  type HardwareMechanismCounts,
} from "../hardware-mechanisms.js";
import {
  projectDesignForDisplay,
  type DisplayEntry,
} from "../queries/design-projection.js";
import { findOverflowingPlacementIds } from "../queries/overflowing-placements.js";
import { findSinkAccessories } from "../queries/sink-accessories.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

import {
  MissingAnchorLeafCountError,
  NoPriceForSizeError,
} from "./anchored-price-formula.js";
import { parsePriceBook } from "./parse-price-book.js";
import {
  DEEP_CABINET_DEPTH_MM,
  isBuiltAtDeepDepth,
  roundHalfUpToTenLei,
  splitCabinetsByPercentage,
  type CabinetPercentages,
  type DeepensAtDeepDepth,
} from "./percentage-lines.js";
import {
  ACCESSORY_IDS,
  accessoryRuleOf,
  amountForBody,
  DEFAULT_CABINET_SUPPLIER,
  DEPTH_RULE_ID,
  exactAmountOfTerms,
  InexactPriceArithmeticError,
  usableCoefficientOf,
  type AccessoryId,
  type AccessoryRule,
  type CabinetPriceRule,
  type HardwareTier,
  type MaterialTier,
  type PriceBook,
  type PriceCoefficientField,
  type PricedBody,
  type PricedTerm,
  type TierGroup,
  type TierIdentity,
} from "./price-book.js";
import type {
  AccessoryPriceLine,
  CabinetPriceLine,
  DepthPriceLine,
  PriceLine,
  PricingFailure,
  PricingFailureCode,
  PricingResult,
  WholeKitchenPriceLine,
} from "./price-lines.js";

/** The whole-kitchen choices a design was configured with, passed in by the caller holding the book.
 *  An absent choice is priced at the book's own default tier.
 *
 *  Each key is `string | undefined`, not merely optional: `DesignSettings` is inferred from a Zod
 *  `.optional()`, which `exactOptionalPropertyTypes` would refuse to assign to a plain `?: string`. */
export interface WholeKitchenSelections {
  readonly hardwareTierId?: string | undefined;
  readonly materialTierId?: string | undefined;
}

/** Everything the query needs, named rather than positional. */
export interface PriceDesignRequest {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** Supplied by the caller: the query imports no book. */
  readonly book: PriceBook;
  /** Matched for **equality** against the book's own version: no "current version" fallback. */
  readonly pricingVersion: string;
  readonly selections?: WholeKitchenSelections | undefined;
}

/**
 * Prices a design. Every line, the exact total, and the book's version and status — or one refusal
 * naming what could not be resolved.
 */
export function priceDesign(request: PriceDesignRequest): PricingResult {
  return priceDesignWithDeepening(request, undefined);
}

/**
 * `priceDesign` with the answer to A-6's question supplied, so a book in percentage form prices. Not exported from the
 * package root: a book in percentage form is refused by `priceDesign` until which cabinets deepen (ADR 0177 A-6) is
 * wired as its own input, because a default would be this module deciding it. `deepensAtDeepDepth` is asked of the
 * priced-as catalogue row of each manufacturer-supplied cabinet, and only for a design built at
 * `DEEP_CABINET_DEPTH_MM`.
 */
export function priceDesignWithDeepening(
  request: PriceDesignRequest,
  deepensAtDeepDepth: DeepensAtDeepDepth | undefined,
): PricingResult {
  const unusable = refuseUnusableRequest(request);
  if (unusable) return { ok: false, failure: unusable };

  const entries = listEntriesInDisplayOrder(request);
  const cabinetLines = priceEveryPlacement(entries, request);
  if (isRefused(cabinetLines))
    return { ok: false, failure: cabinetLines.failure };

  const lines = isPercentageBook(request.book)
    ? pricePercentageForm(
        { entries, request, deepensAtDeepDepth },
        cabinetLines.value,
      )
    : priceFlatForm(entries, request, cabinetLines.value);
  if (isRefused(lines)) return { ok: false, failure: lines.failure };

  return finishPricing(request, lines.value);
}

/** The flat form, as it was before the percentage seam: cabinets, hardware, material, accessories, none rounded. */
function priceFlatForm(
  entries: readonly DisplayEntry[],
  request: PriceDesignRequest,
  cabinetLines: readonly CabinetPriceLine[],
): Attempt<readonly PriceLine[]> {
  const wholeKitchenLines = priceWholeKitchen(entries, request);
  if (isRefused(wholeKitchenLines)) return wholeKitchenLines;

  const accessoryLines = priceAccessories(entries, request);
  if (isRefused(accessoryLines)) return accessoryLines;

  return {
    value: [
      ...cabinetLines,
      ...wholeKitchenLines.value,
      ...accessoryLines.value,
    ],
  };
}

/** The total and the result envelope, once every line is known. */
function finishPricing(
  request: PriceDesignRequest,
  lines: readonly PriceLine[],
): PricingResult {
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

/** Every refusal that can be decided before a line exists: the book, then the version, then the
 *  design against the catalogue. */
function refuseUnusableRequest(
  request: PriceDesignRequest,
): PricingFailure | undefined {
  return (
    refuseUnusableBook(request.book) ??
    refuseVersionMismatch(request) ??
    refuseUncatalogedBody(request)
  );
}

/** Asks once every check `parse-price-book.ts` makes. Dereferencing a malformed book here would throw
 *  a `TypeError` out of the function whose job is to reject malformed books (ADR 0062 seam 1). */
function refuseUnusableBook(book: PriceBook): PricingFailure | undefined {
  const parsed = parsePriceBook(book);
  return parsed.ok ? undefined : parsed.failure;
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

/** The projection **throws** `UnknownBodyError` for a `buildId` the catalogue does not hold; this
 *  query refuses with a code, so it asks first and the throw is unreachable. */
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

/** The design's bodies in the one display order (ADR 0063), flattened out of the projection's groups. */
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

  const body = describePricedBody(entry, pricedAs, catalog);
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
      // The projection's label and width: a label pricing derived itself would be a second authority.
      label: entry.label,
      widthMm: entry.widthMm,
      // The one place the book's optional `suppliedBy` is defaulted (ADR 0062 seam 1).
      suppliedBy: rule.suppliedBy ?? DEFAULT_CABINET_SUPPLIER,
      quantity: 1,
      unitAmountMinor: amountMinor,
      amountMinor,
    },
  };
}

/** `amountForBody` **throws** for a coefficient that is not an exact count of minor units (ADR 0062
 *  seam 1); this query refuses with a code instead. `undefined` passes through untouched: an
 *  unimplemented formula shape is the caller's other refusal. A width above every listed size, unreadable
 *  fronts and an unbuildable door band have codes of their own; a defect leaves as itself, as in
 *  `refuseUnreadFrontsCause`; every other cause is `INVALID_AMOUNT`. */
function evaluateFormula(
  rule: CabinetPriceRule,
  body: PricedBody,
  placementId: string,
): Attempt<number | undefined> {
  try {
    return { value: amountForBody(rule.formula, body) };
  } catch (error) {
    if (isADefectNotARefusal(error)) throw error;
    return refusal(failureCodeOf(error), describeError(error), {
      placementId,
      id: rule.ruleId,
    });
  }
}

/** A throw no book or design can cause: the query's own caller left out the anchor's leaf count, or the catalogue
 *  declares fronts that contradict each other. Never a refusal a surface could render. */
function isADefectNotARefusal(error: unknown): boolean {
  return (
    error instanceof MissingAnchorLeafCountError ||
    error instanceof ContradictoryFrontDeclarationError
  );
}

/** The refusal a formula's throw becomes: the three causes with a code of their own, else an unusable amount. */
function failureCodeOf(error: unknown): PricingFailureCode {
  if (error instanceof NoPriceForSizeError) return "NO_PRICE_FOR_SIZE";
  if (error instanceof UndeclaredFrontPopulationError) {
    return "UNDECLARED_FRONT_POPULATION";
  }
  if (error instanceof UnbuildableDoorBandError) return "UNBUILDABLE_DOOR_BAND";
  return "INVALID_AMOUNT";
}

/**
 * The catalogue row a body is priced as: its equivalent (ADR 0022) where it declares one, its own id
 * where it does not.
 *
 * Do not copy the projection's literal-`buildId` lookup: every seeded body has a non-insertable id
 * (ADR 0011 Gap A) that no price rule names. The six corner bodies have no equivalent by design
 * (ADR 0021) and are priced under their own ids.
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

/** The row a body is priced as, with its definition: looking the row up twice lets id and row diverge. */
interface PricingRow {
  readonly buildId: string;
  readonly definition: BodyDefinition | undefined;
  /** Set only when the entry **declares** an equivalent that did not resolve (a broken pointer, as
   *  opposed to a corner's correct absence). Message material only: see `describeUnresolvedRule`. */
  readonly unresolvedEquivalentId?: string;
}

/**
 * Words the reason no rule was found for the book's author. `resolveCatalogEquivalent` answers
 * `undefined` for three cases (no equivalent declared, declared one missing, declared one not
 * insertable); wording only, with no new failure code, because a dangling pointer is guarded by the
 * catalogue-integrity assertion in `catalog.test.ts`.
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
 * What a formula may know about a body: the placement's width and height (a body built to its
 * opening stands at a height its catalogue row does not state), and its door leaves.
 *
 * Two leaf counts, for two questions. `doorLeafCount`, which the linear shapes' door step reads, comes from the
 * **priced-as** row's width rule: seeded rows freeze `carriesHandles(n)` at their built size, so reading the
 * placement's own entry would give a resized seeded `wall-2door-600` no door step at 800 mm while an inserted
 * `wall-cabinet` beside it got one (ADR 0092 decision 1). An anchored door shape instead reads the leaves the body
 * itself carries (`builtDoorLeafCount`, what `countHardwareMechanisms` bills hinges over) against the priced-as
 * row's at the anchor width (`doorLeafCountAt`), so its panel step and its hinges count leaves alike (ADR 0177 A-3).
 */
function describePricedBody(
  entry: DisplayEntry,
  pricedAs: PricingRow,
  catalog: BodyCatalog,
): Attempt<PricedBody> {
  try {
    return {
      value: {
        widthMm: entry.widthMm,
        heightMm: entry.heightMm,
        doorLeafCount: doorLeavesAt(pricedAs, entry.widthMm),
        doorLeafCountAt: (widthMm) =>
          hardwareDoorLeaves(pricedAs, { widthMm, heightMm: entry.heightMm }),
        builtDoorLeafCount: () =>
          hardwareDoorLeaves(
            { buildId: entry.buildId, definition: catalog.get(entry.buildId) },
            entry,
          ),
      },
    };
  } catch (error) {
    return refusal("UNDECLARED_HANDLE_COUNT", describeError(error), {
      placementId: entry.placementId,
      id: pricedAs.buildId,
    });
  }
}

/** The leaves a row's own front population gives a body of this size: the count `countHardwareMechanisms` bills
 *  hinges over, so an anchored door term and hardware count leaves alike (ADR 0068 decision 1). Throws where the
 *  fronts cannot be read; `evaluateFormula` converts it. */
function hardwareDoorLeaves(
  row: {
    readonly buildId: string;
    readonly definition: BodyDefinition | undefined;
  },
  size: { readonly widthMm: number; readonly heightMm: number },
): number {
  return doorLeafCount(
    frontPopulationQueryFor({
      body: { buildId: row.buildId, ...size },
      definition: row.definition ?? {},
    }),
  );
}

/** The leaves the priced-as row's width rule derives at one width: what the linear shapes' door step reads. */
function doorLeavesAt(pricedAs: PricingRow, widthMm: number): number {
  return widthDerivedDoorLeafCount({
    buildId: pricedAs.buildId,
    rule: pricedAs.definition?.cabinetHandles,
    widthMm,
  });
}

/** Hardware, then material, after **all** placement lines, both always emitted. A free tier is a
 *  zero-amount line (rendered *inclus*); a missing rule or amount is a refusal, never a zero, because
 *  omission must never be read as "included". */
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

  const materialAmount = checkedBookAmount(
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

/** `find` is safe only because the book was parsed: `refuseRepeatedTierId` makes a tier id shared
 *  across both groups unreachable, so the price never depends on the book's typing order. */
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
 * An amount the book states outright, with the field name a refusal must report. `declared` is
 * `unknown` although the tier and accessory types declare `number`: a book is data authored outside
 * TypeScript (ADR 0062 seam 1).
 */
interface DeclaredBookAmount {
  readonly declared: unknown;
  readonly field: PriceCoefficientField;
}

/**
 * The hardware line's unit amount and whole amount, because its quantity is 1: three rates cannot
 * share one unit price (ADR 0092 decision 4).
 *
 * All three rates are checked whatever the design counts: a book declaring `null` for its
 * push-to-open rate is malformed even when this kitchen has no push body.
 */
function hardwareUnitAmount(
  tier: HardwareTier,
  design: {
    readonly entries: readonly DisplayEntry[];
    readonly catalog: BodyCatalog;
  },
): Attempt<number> {
  const rates = checkedHardwareRates(tier);
  if (isRefused(rates)) return rates;

  const mechanisms = countMechanisms(design.entries, design.catalog);
  if (isRefused(mechanisms)) return mechanisms;

  return checkedAmountOfTerms(
    chargedOverMechanisms(rates.value, mechanisms.value),
    tier.ruleId,
  );
}

/** A hardware tier's three rates, in the order they are charged: one list drives both the check and
 *  the terms built from it. */
const HARDWARE_RATE_FIELDS: readonly HardwareRateField[] = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
];

type HardwareRateField =
  | "perHingeMinor"
  | "perDrawerMinor"
  | "perPushToOpenMinor";

/** One rate a tier declares, known to be an exact count of minor units; the field picks the count. */
interface CheckedHardwareRate {
  readonly field: HardwareRateField;
  readonly minor: number;
}

/** Checks all three rates before the design is read at all (see `hardwareUnitAmount`). */
function checkedHardwareRates(
  tier: HardwareTier,
): Attempt<readonly CheckedHardwareRate[]> {
  const rates: CheckedHardwareRate[] = [];
  for (const field of HARDWARE_RATE_FIELDS) {
    const checked = checkedBookAmount(hardwareRate(tier, field), tier.ruleId);
    if (isRefused(checked)) return checked;
    rates.push({ field, minor: checked.value });
  }
  return { value: rates };
}

/** Each rate against the mechanism count it is billed over — the terms `exactAmountOfTerms` adds. */
function chargedOverMechanisms(
  rates: readonly CheckedHardwareRate[],
  counts: HardwareMechanismCounts,
): readonly PricedTerm[] {
  return rates.map((rate) => ({
    coefficientMinor: rate.minor,
    count: mechanismsChargedAt(counts, rate.field),
    field: rate.field,
  }));
}

/** Which of the three counts a rate is charged over (ADR 0092 decision 2). */
function mechanismsChargedAt(
  counts: HardwareMechanismCounts,
  field: HardwareRateField,
): number {
  switch (field) {
    case "perHingeMinor":
      return counts.hinges;
    case "perDrawerMinor":
      return counts.drawers;
    case "perPushToOpenMinor":
      return counts.pushToOpen;
  }
}

/** One of a tier's three rates, carrying its own field name so a refusal names the rate, not the tier. */
function hardwareRate(
  tier: HardwareTier,
  field: HardwareRateField,
): DeclaredBookAmount {
  return { declared: tier[field], field };
}

/** Every mechanism the design carries, or a refusal naming the first body whose fronts could not be
 *  read. Guarded body by body first: the error `countHardwareMechanisms` throws names a build id, and
 *  the refusal must name the placement too (ADR 0092 decision 1). */
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

/** `countHardwareMechanisms` **throws** for a body whose fronts cannot be read; this query refuses
 *  with a code instead. Only the two declared causes convert and everything else propagates
 *  unchanged: a bare catch would relabel a `TypeError` as a data condition (ADR 0092 decision 16). */
function refuseUnreadableFronts(
  entry: DisplayEntry,
  catalog: BodyCatalog,
): Refused | undefined {
  try {
    countHardwareMechanisms([entry], catalog);
    return undefined;
  } catch (error) {
    return refuseUnreadableFrontsCause(error, entry);
  }
}

/** Anything but the two declared causes is a defect, so it leaves as itself (same instance, same
 *  stack) and never as a refusal a surface could render. */
function refuseUnreadableFrontsCause(
  error: unknown,
  entry: DisplayEntry,
): Refused {
  const named = { placementId: entry.placementId, id: entry.buildId };

  if (error instanceof UndeclaredFrontPopulationError) {
    return refusal("UNDECLARED_FRONT_POPULATION", describeError(error), named);
  }
  if (error instanceof UnbuildableDoorBandError) {
    return refusal("UNBUILDABLE_DOOR_BAND", describeError(error), named);
  }
  throw error;
}

/** What a material tier charges once for the whole kitchen. */
function wholeKitchenAmount(tier: MaterialTier): DeclaredBookAmount {
  return { declared: tier.wholeKitchenMinor, field: "wholeKitchenMinor" };
}

/** Both whole-kitchen lines carry `quantity: 1` (ADR 0092 decision 4), so
 *  `amountMinor === quantity × unitAmountMinor` holds by construction. Takes an **already-checked**
 *  amount: the two kinds reach one by different routes, and folding both in gives two reasons to change. */
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
      ...textKeysOf(line.tier),
      quantity: WHOLE_KITCHEN_QUANTITY,
      unitAmountMinor: line.unitAmountMinor,
      amountMinor: WHOLE_KITCHEN_QUANTITY * line.unitAmountMinor,
    },
  };
}

const WHOLE_KITCHEN_QUANTITY = 1;

/** A book whose materials are percentages states a depth rule too (`parse-percentage-form.ts` holds the two together),
 *  so the depth rule is what tells the two forms apart. */
function isPercentageBook(book: PriceBook): boolean {
  return book.depthRule !== undefined;
}

/** Everything the percentage form is priced from. */
interface PercentageFormRequest {
  readonly entries: readonly DisplayEntry[];
  readonly request: PriceDesignRequest;
  readonly deepensAtDeepDepth: DeepensAtDeepDepth | undefined;
}

/**
 * The percentage form (ADR 0177 A-1): each cabinet carried through the three rounded stages, hardware and each
 * accessory rounded to 10 lei, so every line is a whole number of ten lei and they add to the total exactly. Lines in
 * the order cabinets, hardware, material, depth, accessories. Refused until A-6's answer is supplied.
 */
function pricePercentageForm(
  form: PercentageFormRequest,
  cabinetLines: readonly CabinetPriceLine[],
): Attempt<readonly PriceLine[]> {
  const { deepensAtDeepDepth, request, entries } = form;
  if (deepensAtDeepDepth === undefined) {
    return refusal(
      "INVALID_PRICE_BOOK",
      "A book stating its materials as percentages cannot be priced until which cabinets deepen is supplied " +
        "(ADR 0177 A-6)",
      { id: request.book.version },
    );
  }
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

  const rates = checkedPercentages(material.value, request.book);
  if (isRefused(rates)) return rates;

  const cabinetsAndUpliftLines = priceCabinetsInPercentages(
    { cabinetLines, rates: rates.value, material: material.value },
    { request, deepensAtDeepDepth },
  );
  if (isRefused(cabinetsAndUpliftLines)) return cabinetsAndUpliftLines;

  const hardwareLine = priceRoundedHardware(hardware.value, {
    entries,
    catalog: request.catalog,
  });
  if (isRefused(hardwareLine)) return hardwareLine;

  const accessoryLines = priceRoundedAccessories(entries, request);
  if (isRefused(accessoryLines)) return accessoryLines;

  const { cabinets, materialLine, depthLines } = cabinetsAndUpliftLines.value;
  return {
    value: [
      ...cabinets,
      hardwareLine.value,
      materialLine,
      ...depthLines,
      ...accessoryLines.value,
    ],
  };
}

/** The selected material's percentage and the book's depth percentage, each held to an exact count like any other
 *  amount the book states. */
function checkedPercentages(
  material: MaterialTier,
  book: PriceBook,
): Attempt<CabinetPercentages> {
  const materialPercent = checkedBookAmount(
    { declared: material.percentOfCabinets, field: "percentOfCabinets" },
    material.ruleId,
  );
  if (isRefused(materialPercent)) return materialPercent;
  const deepCabinetPercent = checkedBookAmount(
    {
      declared: book.depthRule?.deepCabinetPercent,
      field: "deepCabinetPercent",
    },
    DEPTH_RULE_ID,
  );
  if (isRefused(deepCabinetPercent)) return deepCabinetPercent;
  return {
    value: {
      materialPercent: materialPercent.value,
      deepCabinetPercent: deepCabinetPercent.value,
    },
  };
}

/** What the cabinets become in the percentage form. */
interface PercentageCabinetLines {
  readonly cabinets: readonly CabinetPriceLine[];
  readonly materialLine: WholeKitchenPriceLine;
  /** Empty at depth 600 and when no manufacturer-supplied cabinet deepens; otherwise the one depth line. */
  readonly depthLines: readonly DepthPriceLine[];
}

/** The cabinet lines at their first stage, the material line and the depth line as sums of the later stages' differences. */
function priceCabinetsInPercentages(
  priced: {
    readonly cabinetLines: readonly CabinetPriceLine[];
    readonly rates: CabinetPercentages;
    readonly material: MaterialTier;
  },
  context: {
    readonly request: PriceDesignRequest;
    readonly deepensAtDeepDepth: DeepensAtDeepDepth;
  },
): Attempt<PercentageCabinetLines> {
  const deepeningOnes = deepeningCabinetFlags(priced.cabinetLines, context);
  const split = attemptExactly(
    () =>
      splitCabinetsByPercentage(
        priced.cabinetLines.map((line, index) => ({
          exactMinor: line.amountMinor,
          deepens: deepeningOnes[index] === true,
        })),
        priced.rates,
      ),
    priced.material.ruleId,
  );
  if (isRefused(split)) return split;

  const materialLine = wholeKitchenLine({
    kind: "material",
    tier: priced.material,
    unitAmountMinor: split.value.materialLineMinor,
  });
  if (isRefused(materialLine)) return materialLine;

  return {
    value: {
      cabinets: priced.cabinetLines.map((line, index) =>
        atRoundedAmount(
          line,
          split.value.cabinetMinors[index] ?? line.amountMinor,
        ),
      ),
      materialLine: materialLine.value,
      depthLines: depthLineOf(deepeningOnes, split.value.depthLineMinor),
    },
  };
}

/** Which cabinets take the depth uplift: a manufacturer-supplied one whose priced-as row deepens, in a design built at
 *  the deep depth. A customer-supplied row never does (ADR 0177 A-6). */
function deepeningCabinetFlags(
  cabinetLines: readonly CabinetPriceLine[],
  context: {
    readonly request: PriceDesignRequest;
    readonly deepensAtDeepDepth: DeepensAtDeepDepth;
  },
): readonly boolean[] {
  const isDeep = isBuiltAtDeepDepth(context.request.design);
  return cabinetLines.map(
    (line) =>
      isDeep &&
      line.suppliedBy === "manufacturer" &&
      context.deepensAtDeepDepth(line.pricedAsBuildId),
  );
}

/** A depth line exists if and only if some cabinet deepens: then at 0 % it is present and its amount is 0. */
function depthLineOf(
  deepeningOnes: readonly boolean[],
  depthLineMinor: number,
): readonly DepthPriceLine[] {
  if (!deepeningOnes.some(Boolean)) return [];
  return [
    {
      lineId: "kitchen:depth",
      kind: "depth",
      ruleId: DEPTH_RULE_ID,
      depthMm: DEEP_CABINET_DEPTH_MM,
      quantity: WHOLE_KITCHEN_QUANTITY,
      unitAmountMinor: depthLineMinor,
      amountMinor: WHOLE_KITCHEN_QUANTITY * depthLineMinor,
    },
  ];
}

/** A cabinet line carrying its rounded amount: for a cabinet, unit and amount are one figure. */
function atRoundedAmount(
  line: CabinetPriceLine,
  roundedMinor: number,
): CabinetPriceLine {
  return { ...line, unitAmountMinor: roundedMinor, amountMinor: roundedMinor };
}

/** The hardware line at its exact amount, rounded to 10 lei. */
function priceRoundedHardware(
  tier: HardwareTier,
  design: {
    readonly entries: readonly DisplayEntry[];
    readonly catalog: BodyCatalog;
  },
): Attempt<WholeKitchenPriceLine> {
  const exact = hardwareUnitAmount(tier, design);
  if (isRefused(exact)) return exact;
  const rounded = attemptExactly(
    () => roundHalfUpToTenLei(exact.value),
    tier.ruleId,
  );
  if (isRefused(rounded)) return rounded;
  return wholeKitchenLine({
    kind: "hardware",
    tier,
    unitAmountMinor: rounded.value,
  });
}

/** Each accessory the design earns, its exact amount rounded to 10 lei (`unitAmountMinor` stays the book's rate). */
function priceRoundedAccessories(
  entries: readonly DisplayEntry[],
  request: PriceDesignRequest,
): Attempt<readonly AccessoryPriceLine[]> {
  const exact = priceAccessories(entries, request);
  if (isRefused(exact)) return exact;
  const rounded: AccessoryPriceLine[] = [];
  for (const line of exact.value) {
    const amountMinor = attemptExactly(
      () => roundHalfUpToTenLei(line.amountMinor),
      line.ruleId,
    );
    if (isRefused(amountMinor)) return amountMinor;
    rounded.push({ ...line, amountMinor: amountMinor.value });
  }
  return { value: rounded };
}

/** A computation in the percentage seam's integers; `InexactPriceArithmeticError` is a refusal, anything else a defect. */
function attemptExactly<TValue>(
  compute: () => TValue,
  ruleId: string,
): Attempt<TValue> {
  try {
    return { value: compute() };
  } catch (error) {
    if (!(error instanceof InexactPriceArithmeticError)) throw error;
    return refusal("INVALID_AMOUNT", describeError(error), { id: ruleId });
  }
}

/**
 * The sink extras, after every other line (ADR 0092 decision 11). Two lines at most, often none.
 *
 * Per sink, never per kitchen: the cover's quantity is the number of sink bodies, the rack's the
 * number of sinks that resolved a host, with no de-duplication when two racks share a wall cabinet.
 * A quantity of zero is no line at all: a zero would render *inclus* and tell the customer a rack
 * they are not getting is included.
 */
function priceAccessories(
  entries: readonly DisplayEntry[],
  request: PriceDesignRequest,
): Attempt<readonly AccessoryPriceLine[]> {
  const sinks = findSinkAccessories(entries, request.catalog);
  const quantities: Readonly<Record<AccessoryId, number>> = {
    sinkProtectiveCover: sinks.length,
    dishDryingRack: sinks.filter(
      (sink) => sink.rackHostPlacementId !== undefined,
    ).length,
  };

  const lines: AccessoryPriceLine[] = [];
  for (const accessoryId of ACCESSORY_IDS) {
    const line = accessoryLine({
      rule: accessoryRuleOf(request.book, accessoryId),
      accessoryId,
      quantity: quantities[accessoryId],
    });
    if (isRefused(line)) return line;
    if (line.value) lines.push(line.value);
  }
  return { value: lines };
}

/** One accessory the design earns, priced, or `undefined` where it earns none: an omission, which
 *  must never turn into an amount of zero. */
function accessoryLine(billed: {
  readonly rule: AccessoryRule | undefined;
  readonly accessoryId: AccessoryId;
  readonly quantity: number;
}): Attempt<AccessoryPriceLine | undefined> {
  if (billed.quantity < ONE_ACCESSORY) return { value: undefined };

  // A missing rule for an accessory the design earns is refused, not skipped: a skipped line would
  // read as omission.
  const { rule } = billed;
  if (!rule) {
    return refusal(
      "INVALID_PRICE_BOOK",
      `Book declares no "${billed.accessoryId}" accessory rule, ` +
        `which this design earns ${String(billed.quantity)} of`,
      { id: billed.accessoryId },
    );
  }

  const unitAmountMinor = checkedBookAmount(
    { declared: rule.perUnitMinor, field: "perUnitMinor" },
    rule.ruleId,
  );
  if (isRefused(unitAmountMinor)) return unitAmountMinor;

  const amountMinor = billed.quantity * unitAmountMinor.value;
  const unpublishable = refuseUnpublishableAmount(amountMinor, rule.ruleId);
  if (unpublishable) return unpublishable;

  return {
    value: {
      lineId: `accessory:${billed.accessoryId}`,
      kind: "accessory",
      ruleId: rule.ruleId,
      accessoryId: billed.accessoryId,
      name: rule.name,
      description: rule.description,
      ...textKeysOf(rule),
      quantity: billed.quantity,
      unitAmountMinor: unitAmountMinor.value,
      amountMinor,
    },
  };
}

const ONE_ACCESSORY = 1;

/** The catalogue text keys a book row names (ADR 0106 decision 1), carried onto its line. Absent
 *  rather than present-and-`undefined`, so a row naming no key stays distinguishable from a
 *  dashboard-authored row. */
function textKeysOf(row: {
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
}): { readonly nameKey?: string; readonly descriptionKey?: string } {
  return {
    ...(row.nameKey === undefined ? {} : { nameKey: row.nameKey }),
    ...(row.descriptionKey === undefined
      ? {}
      : { descriptionKey: row.descriptionKey }),
  };
}

/**
 * `usableCoefficientOf` **throws** for a tier or accessory amount that is not an exact count of minor
 * units; this query refuses with a code instead.
 *
 * `refuseUnpublishableAmount` cannot stand in for it: a `null`, `false`, `[]` or `""` amount times a
 * mechanism count is `0`, which publishes as *inclus*, and `true` bills a whole material upgrade at one ban.
 */
function checkedBookAmount(
  amount: DeclaredBookAmount,
  ruleId: string,
): Attempt<number> {
  try {
    return { value: usableCoefficientOf(amount.declared, amount.field) };
  } catch (error) {
    return refusal("INVALID_AMOUNT", describeError(error), { id: ruleId });
  }
}

/**
 * `exactAmountOfTerms` **throws** where a product or running sum leaves the exact-integer range; this
 * query refuses with a code instead. Separate from `checkedHardwareRates`: three exact rates do not
 * make an exact total, since two out-of-range products and a sum landing back inside the range would
 * publish a wrong amount that every later guard accepts.
 */
function checkedAmountOfTerms(
  terms: readonly PricedTerm[],
  ruleId: string,
): Attempt<number> {
  try {
    return { value: exactAmountOfTerms(terms) };
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

/** An amount is a whole count of minor units; rounding belongs to presentation. */
function isExactAmount(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor);
}

/** Everything a finished amount must be before it may appear on a line, integrality first. */
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

/** Asked of the **amount**, not the coefficients: a negative rate (a discount term) is legitimate, but
 *  a line whose whole amount is below zero may never be published. The total needs no guard of its
 *  own, being a sum of lines that each passed this one. */
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

/** A step answers with a value or with the one failure that ends the whole query; there is no
 *  partial result. */
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
 * The one place a `PricingFailure` is built, so the one place `detail` is made safe to log or render.
 * Bounded here rather than per call site: book values (ADR 0062 seam 1) and the caller-chosen tier id
 * both reach these strings, and an unbounded, un-scrubbed one amplifies and can forge a log line.
 */
function failWith(
  code: PricingFailureCode,
  detail: string,
  named?: { readonly placementId?: string; readonly id?: string },
): PricingFailure {
  return { code, detail: boundedFailureReason(detail), ...named };
}
