// **What a whole-kitchen tier costs, measured rather than transcribed.**
//
// Frames 2E / D2E print *inclus* against one tier and *de la +9 000* against the next. Neither
// number is readable off the book: `wholeKitchenMinor` is a whole-kitchen amount only by accident of
// the material group's shape, and a hardware tier states three **per-mechanism rates** —
// `perHingeMinor`, `perDrawerMinor` and `perPushToOpenMinor` (ADR 0070 decision 1) — so a surface
// that rendered the book's figure would be quoting a hardware price nobody pays. So a tier's delta
// here is **the whole design priced at that tier, less the same design priced at the group's own
// `defaultTierId`** — six evaluations of a pure query, one per offered tier, with the *other* group
// held at whatever the design already carries. The material term and the hardware term are both
// additive, so the held group cancels out of every difference.
//
// **This module names no price book** (ADR 0062 seam 1): it takes one, exactly as `priceDesign`
// does, and `use-priced-design.ts` remains the one module in this application that names the sample.
// `whole-kitchen-tiers.seams.test.ts` reads the source tree and holds that to one module.
//
// **It computes no door, leaf or mechanism count and must not start.** How many things a hardware
// tier is billed for is settled per mechanism — hinges, drawers and push-to-open latches — by
// ADR 0070 decision 1, and is already inside `priceDesign`. A surface reaching for `deriveDoorCount`
// or `widthDerivedDoorLeafCount` would be pricing a second time, on a denominator nobody ruled —
// the failure M6's plan warns about by name.
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
  /**
   * What choosing this adds, in exact minor units — presentation rounds it, and only in
   * `starting-price.ts`. Zero for the group's default, and never negative.
   *
   * **Absent when the design could not be priced**, which is the whole reason it is optional: a
   * document carrying a tier the book has since withdrawn makes `priceDesign` refuse, and the one
   * control that could put that document right is this list. A pricing failure costs the customer
   * the numbers; it must never cost them the choice.
   *
   * **Absent, too, where a *hardware* tier prices this design below its group's default** — the
   * same degraded path, for the same reason, reached for a different cause. See
   * `BelowDefaultTierRule`.
   */
  readonly deltaMinor?: number | undefined;
}

/** One whole-kitchen choice: what the book offers, and — when the design can be priced — what each
 *  option does to the total. */
export interface OfferedTierGroup {
  /** Every id the book offers, in book order. **This is what the 6E commands take as
   *  `availableTierIds`**, which is why it is published beside the tiers rather than recomposed by
   *  the caller: `setMaterialTier` refuses an id its caller did not offer, so a second derivation of
   *  this list is a second answer to "what is on offer". */
  readonly tierIds: readonly string[];
  readonly defaultTierId: string;
  readonly tiers: readonly OfferedTier[];
}

export interface WholeKitchenTierOffer {
  readonly material: OfferedTierGroup;
  readonly hardware: OfferedTierGroup;
}

/**
 * **A tier that costs less than the tier a design gets for free.**
 *
 * Refused rather than rendered, the way `price-breakdown-model.ts` refuses a divergence: the mockups
 * draw a delta as an addition — *de la +9 000* — and no decision says what a minus sign in that
 * badge means to a customer, so a book whose default is not its cheapest tier is a book fault to be
 * reported, not a discount to be invented. `whole-kitchen-tiers.test.ts` holds the sample book to
 * the shape that keeps this unreachable.
 *
 * **Raised by the material group alone** since wave 6W — see `BelowDefaultTierRule`. Its meaning and
 * its message are unchanged: what changed is which group can be in the state it describes, and a
 * flat per-kitchen amount ordered below its own default still is.
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

/** **A group whose declared default is not one of its own tiers.** A book fault of the same family
 *  as an undeclared handle count: there is no baseline to subtract, and picking one would be this
 *  module choosing what an unset kitchen costs — book data by ADR 0062's first seam. */
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
 * Every tier both whole-kitchen groups offer, each with what choosing it adds to the total.
 *
 * **The list comes from the book and is answered whenever the book can be read; only the deltas
 * depend on pricing.** A design carrying a tier the book has since withdrawn makes `priceDesign`
 * refuse — and the tier list is the one control that could put such a document right, so a surface
 * that blanked on that failure would remove the customer's only way out of it. The deltas degrade;
 * the choice does not.
 *
 * **Deltas are all-or-nothing across both groups, deliberately.** A withdrawn *material* id makes
 * every hardware evaluation fail — each holds material at what the design carries — while every
 * material evaluation succeeds, because it overrides the bad key. Publishing that half-set would put
 * two groups on one screen whose amounts were measured against different kitchens, and nothing on
 * screen would say so.
 *
 * **A tier that prices below its group's default is the one omission that is *per tier*, and that is
 * not an exception to the rule above** (`BelowDefaultTierRule`): every delta still published was
 * measured on the same kitchen against the same baseline, so nothing on screen is comparable to
 * anything it was not measured against. What the rule forbids is a half-set of amounts that
 * disagree about which kitchen they describe; this is a single amount that is not an addition.
 */
export function offerWholeKitchenTiers(
  request: OfferWholeKitchenTiersRequest,
): WholeKitchenTierOffer {
  const deltas = measureEveryDelta(request);
  return {
    material: offeredGroup(request.book.material, deltas),
    hardware: offeredGroup(request.book.hardware, deltas),
  };
}

/** Every offered tier's delta, keyed by tier id, or `undefined` where any one of them could not be
 *  measured. Six evaluations of a pure query — one per tier, with the other group held at what the
 *  design carries. */
function measureEveryDelta(
  request: OfferWholeKitchenTiersRequest,
): ReadonlyMap<string, number> | undefined {
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
  return new Map([...material, ...hardware]);
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
 * **What a group does with a tier that prices *this design* below the group's own default**
 * (ADR 0092 decision 12, wave 6W).
 *
 * **Interim, pending owner review — ruled 2026-09-06 by the standing process, not by the owner**,
 * and marked here the way wave 6G marked its unruled strings so nobody reads it as settled. The
 * alternative the owner may prefer is a negative badge, which the mockups' *de la +9 000* has no
 * form for; it is a copy and design question and this is the half of 6W most likely to be overruled.
 *
 * The two groups differ because the *cause* differs, not because one is more convenient:
 *
 * - **`"offer-with-no-delta"` — hardware.** A hardware tier states three per-mechanism rates, so
 *   which tier is cheapest is a property of **the customer's own kitchen** and not of the book.
 *   ADR 0070's Hettich drawer figure is runners-only against Standard's complete box — an
 *   imprecision the owner accepted explicitly — so a drawer-dominant design genuinely does cost less
 *   at Hettich. Refusing there would take the settings sheet away from a customer whose only fault
 *   was deleting the wall cabinets, and the sheet is the one control an unpriceable document is
 *   recovered with. So the tier is offered with **no delta badge** — the module's existing
 *   *"the deltas degrade; the choice does not"* path, reached for a second cause rather than a
 *   second path invented beside it.
 * - **`"refuse"` — material.** A material tier is one flat per-kitchen amount, so its ordering
 *   against the default is a property of **the book alone**: no design can produce it and no design
 *   can put it right. That is still a book fault to be reported, and `NegativeTierDeltaError` keeps
 *   its meaning and its message for it.
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
    // One unpriceable tier makes the whole set unpriceable: a list where five tiers state an amount
    // and the sixth does not reads as a book that stopped offering the sixth.
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

/** Every tier that states an amount, keyed by id. **A tier priced below the default is left out
 *  rather than entered as a negative**: absence is already how this module says *no amount*, so the
 *  surface needs no new state to render it and no formatter needs a sign. */
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

/** The book's own list, with a delta attached to each tier where one was measured.
 *
 *  **The undeclared-default refusal runs here rather than beside the arithmetic**, so it still fires
 *  on a design nothing could be priced for: the default is what an unset choice resolves to, and a
 *  group that does not offer its own default cannot answer that question with or without a price. */
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
    ...(deltaMinor === undefined ? {} : { deltaMinor }),
  };
}
