// What a whole-kitchen tier costs, measured rather than transcribed. Neither the *inclus* nor the *de la +9 000* of
// frames 2E / D2E is readable off the book: a hardware tier states three per-mechanism rates (ADR 0070 decision 1).
// A tier's delta is the whole design priced at that tier less the same design at the group's `defaultTierId`: six
// evaluations of a pure query with the other group held at what the design carries, so it cancels out of every
// difference. This module names no price book (ADR 0062 seam 1): it takes one, as `priceDesign` does, and
// `use-priced-design.ts` alone names the sample (`tests/settings/global-settings-seams.test.ts`). It computes no
// door, leaf or mechanism count: those are priced per mechanism inside `priceDesign`, and counting them here would
// price a second time.
import {
  priceDesign,
  type BodyCatalog,
  type Design,
  type PriceBook,
  type TierGroup,
  type TierIdentity,
  type WholeKitchenSelections,
} from "@lemnaria/configurator-domain";

/** One tier as the settings surface needs it: what the book says it is, and what choosing it does
 *  to the total. */
export interface OfferedTier {
  readonly tierId: string;
  readonly name: string;
  readonly description: string;
  /** The catalogue leaves the book row names for its two rendered fields, carried across unresolved (ADR 0106
   *  decision 3). This module has no translator and wants none. */
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
  /**
   * What choosing this adds, in exact minor units (presentation rounds, only in `starting-price.ts`). Zero for
   * the group's default, never negative. Absent when the design could not be priced: a withdrawn tier makes
   * `priceDesign` refuse and this list is the control that fixes it, so a pricing failure costs the numbers,
   * never the choice. Also absent where a hardware tier prices below its group's default (`BelowDefaultTierRule`).
   */
  readonly deltaMinor?: number | undefined;
}

/** One whole-kitchen choice: what the book offers, and — when the design can be priced — what each
 *  option does to the total. */
export interface OfferedTierGroup {
  /** Every id the book offers, in book order: what the 6E commands take as `availableTierIds`. Published here
   *  so `setMaterialTier` has one answer to "what is on offer". */
  readonly tierIds: readonly string[];
  readonly defaultTierId: string;
  readonly tiers: readonly OfferedTier[];
}

export interface WholeKitchenTierOffer {
  readonly material: OfferedTierGroup;
  readonly hardware: OfferedTierGroup;
}

/**
 * A tier that costs less than the tier a design gets for free. Refused rather than rendered: the mockups draw
 * a delta as an addition (*de la +9 000*) and nothing says what a minus sign there means, so a book whose
 * default is not its cheapest tier is a book fault, not a discount. Raised by the material group alone; see
 * `BelowDefaultTierRule`.
 */
export class NegativeTierDeltaError extends Error {
  constructor(tierId: string, deltaMinor: number) {
    super(
      `Tier "${tierId}" prices the kitchen below its group's default by ` +
        `${String(-deltaMinor)} minor units; a tier delta is an addition, never a discount`,
    );
    this.name = "NegativeTierDeltaError";
  }
}

/** A group whose declared default is not one of its own tiers: a book fault. With no baseline to subtract,
 *  picking one would make this module choose what an unset kitchen costs, which is book data (ADR 0062). */
export class UnofferedDefaultTierError extends Error {
  constructor(defaultTierId: string) {
    super(
      `The price book defaults to tier "${defaultTierId}", which its own group does not offer`,
    );
    this.name = "UnofferedDefaultTierError";
  }
}

export interface OfferWholeKitchenTiersRequest {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** Supplied by the caller, never imported. See this module's head comment. */
  readonly book: PriceBook;
  readonly pricingVersion: string;
  /** What the design already carries. Each group is measured with the **other** group held at these,
   *  so the deltas describe the kitchen the customer is looking at. */
  readonly selections?: WholeKitchenSelections | undefined;
}

/**
 * Every tier both whole-kitchen groups offer, each with what choosing it adds to the total. The list is answered
 * whenever the book can be read and only the deltas depend on pricing: a withdrawn tier makes `priceDesign` refuse,
 * and this list is the control that fixes it. Deltas are all-or-nothing across both groups (a withdrawn material id
 * fails every hardware evaluation but no material one, and that half-set would show two amounts measured against
 * different kitchens). A tier priced below its group's default is the one per-tier omission, not an exception.
 */
export function offerWholeKitchenTiers(
  request: OfferWholeKitchenTiersRequest,
): WholeKitchenTierOffer {
  const deltas = measureEveryDelta(request);
  return {
    material: offeredGroup(request.book.material, deltas?.material),
    hardware: offeredGroup(request.book.hardware, deltas?.hardware),
  };
}

/**
 * Each group's deltas, kept in its own map and never flattened onto the bare tier id: ids are unique across the
 * two groups only because the book says so, and a hardware id equal to a material one would overwrite the
 * material amount with a hardware figure. Kept even though `parsePriceBook` refuses repeated ids across groups,
 * so relaxing that rule cannot turn into wrong money.
 */
interface MeasuredDeltasByGroup {
  readonly material: ReadonlyMap<string, number>;
  readonly hardware: ReadonlyMap<string, number>;
}

/** Every offered tier's delta, or `undefined` where any one of them could not be measured. */
function measureEveryDelta(
  request: OfferWholeKitchenTiersRequest,
): MeasuredDeltasByGroup | undefined {
  const material = measureGroup(
    request.book.material,
    (materialTierId) => totalAt(request, { materialTierId }),
    "refuse",
  );
  const hardware = measureGroup(
    request.book.hardware,
    (hardwareTierId) => totalAt(request, { hardwareTierId }),
    "offer-with-no-delta",
  );
  if (material === undefined || hardware === undefined) return undefined;
  return { material, hardware };
}

/** One evaluation of the pure query, with one setting overridden. `undefined` where the design
 *  cannot be priced at all — which is a fact about the design, not about the tier. */
function totalAt(
  request: OfferWholeKitchenTiersRequest,
  override: WholeKitchenSelections,
): number | undefined {
  const result = priceDesign({
    design: request.design,
    catalog: request.catalog,
    book: request.book,
    pricingVersion: request.pricingVersion,
    selections: { ...request.selections, ...override },
  });
  return result.ok ? result.priced.totalMinor : undefined;
}

/**
 * What a group does with a tier that prices this design below the group's own default (ADR 0092 decision 12).
 * - `"offer-with-no-delta"` (hardware): a tier states three per-mechanism rates, so which is cheapest depends on
 *   the customer's kitchen (a drawer-dominant design costs less at Hettich). Refusing would take the settings sheet
 *   away from a customer who only deleted wall cabinets, so the tier is offered with no delta badge.
 * - `"refuse"` (material): one flat per-kitchen amount, so its ordering against the default is a property of the
 *   book alone: a book fault, reported through `NegativeTierDeltaError`.
 */
type BelowDefaultTierRule = "refuse" | "offer-with-no-delta";

/** One tier and the total the whole kitchen reaches under it. */
interface MeasuredTier<TTier extends TierIdentity> {
  readonly tier: TTier;
  readonly totalMinor: number;
}

/** One group's deltas, or `undefined` where any tier in it could not be priced. */
function measureGroup<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
  totalFor: (tierId: string) => number | undefined,
  belowDefault: BelowDefaultTierRule,
): ReadonlyMap<string, number> | undefined {
  const measured: MeasuredTier<TTier>[] = [];
  for (const tier of group.tiers) {
    const totalMinor = totalFor(tier.tierId);
    // One unpriceable tier makes the whole set unpriceable: five stated amounts and a missing sixth reads as a
    // tier the book stopped offering.
    if (totalMinor === undefined) return undefined;
    measured.push({ tier, totalMinor });
  }
  const baseline = measured.find(
    ({ tier }) => tier.tierId === group.defaultTierId,
  );
  if (baseline === undefined)
    throw new UnofferedDefaultTierError(group.defaultTierId);
  return additiveDeltas(measured, baseline.totalMinor, belowDefault);
}

/** Every tier that states an amount, keyed by id. A tier priced below the default is left out rather than
 *  entered as a negative: absence already means *no amount*, so no surface needs a new state or a sign. */
function additiveDeltas<TTier extends TierIdentity>(
  measured: readonly MeasuredTier<TTier>[],
  baselineMinor: number,
  belowDefault: BelowDefaultTierRule,
): ReadonlyMap<string, number> {
  const deltas = new Map<string, number>();
  for (const one of measured) {
    const deltaMinor = exactDelta(one, baselineMinor, belowDefault);
    if (deltaMinor !== undefined) deltas.set(one.tier.tierId, deltaMinor);
  }
  return deltas;
}

/** What choosing this tier adds, or `undefined` where it subtracts and the group's rule is to offer
 *  it anyway. */
function exactDelta<TTier extends TierIdentity>(
  measured: MeasuredTier<TTier>,
  baselineMinor: number,
  belowDefault: BelowDefaultTierRule,
): number | undefined {
  const deltaMinor = measured.totalMinor - baselineMinor;
  if (deltaMinor >= 0) return deltaMinor;
  if (belowDefault === "refuse")
    throw new NegativeTierDeltaError(measured.tier.tierId, deltaMinor);
  return undefined;
}

/** The book's own list, with a delta attached to each tier where one was measured. Takes this group's map and
 *  no other's (`MeasuredDeltasByGroup`). The undeclared-default refusal runs here, not beside the arithmetic,
 *  so it still fires on a design nothing could be priced for. */
function offeredGroup<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
  deltas: ReadonlyMap<string, number> | undefined,
): OfferedTierGroup {
  if (!group.tiers.some((tier) => tier.tierId === group.defaultTierId))
    throw new UnofferedDefaultTierError(group.defaultTierId);
  return {
    tierIds: group.tiers.map((tier) => tier.tierId),
    defaultTierId: group.defaultTierId,
    tiers: group.tiers.map((tier) =>
      offeredTier(tier, deltas?.get(tier.tierId)),
    ),
  };
}

function offeredTier(
  tier: TierIdentity,
  deltaMinor: number | undefined,
): OfferedTier {
  return {
    tierId: tier.tierId,
    name: tier.name,
    description: tier.description,
    ...(tier.nameKey === undefined ? {} : { nameKey: tier.nameKey }),
    ...(tier.descriptionKey === undefined
      ? {}
      : { descriptionKey: tier.descriptionKey }),
    ...(deltaMinor === undefined ? {} : { deltaMinor }),
  };
}
