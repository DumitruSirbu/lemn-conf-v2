// What a priced design **is**: an ordered list of traceable lines, an exact total, and what the book
// says about itself — its version, its status, and whether its amounts have been costed at all —
// carried forward. Plus every way pricing can refuse.
//
// No Romanian copy lives here and none may. A pricing failure is never shown to a customer (wave 6C:
// a failure renders *no* figure — not a zero, not a stale one, not a dash that reads as free), and
// the flagged-total warning is owner-ruled copy belonging to the surface that renders it
// (ADR 0065 decision 7b). A domain module inventing either would be inventing product copy.
import type { PriceBookCurrency, PriceBookStatus } from "./price-book.js";

/** What a line is for. `cabinet` traces to a placement; the other two are the named whole-kitchen
 *  rules §12 permits a line to trace to instead. */
export type PriceLineKind = "cabinet" | "hardware" | "material";

/** The fields every line carries, whatever it prices.
 *
 *  `amountMinor` is always `quantity × unitAmountMinor` and both are exact safe integers: nothing
 *  here rounds, and a fraction reaching a line would be an amount somebody has already rounded. */
export interface PriceLineCommon {
  /** Derived, never supplied by price data, so it is stable across a re-ordered input array and
   *  across a change of amount. */
  readonly lineId: string;
  readonly kind: PriceLineKind;
  /** The book rule that produced this line — how a customer-visible amount traces to its source. */
  readonly ruleId: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
  readonly amountMinor: number;
}

/** One placement, priced. Carries the placement's id, its resolved rule, and the label and width
 *  the **projection** derived — never a label of pricing's own, so the breakdown, the scene and
 *  M8's review say the same words about the same body. */
export interface CabinetPriceLine extends PriceLineCommon {
  readonly kind: "cabinet";
  readonly placementId: string;
  /** The literal `buildId` standing in the design. */
  readonly buildId: string;
  /** The catalogue row the rule was resolved through — the equivalent (ADR 0022) where the body has
   *  one, and the body's own id where it has none. Published so a line names both the body the
   *  customer owns and the row it was priced as. */
  readonly pricedAsBuildId: string;
  readonly label: string;
  readonly widthMm: number;
}

/** A whole-kitchen tier, priced once after every placement line. */
export interface WholeKitchenPriceLine extends PriceLineCommon {
  readonly kind: "hardware" | "material";
  readonly tierId: string;
  readonly name: string;
  readonly description: string;
}

export type PriceLine = CabinetPriceLine | WholeKitchenPriceLine;

/** A priced design. Derived on every read and stored nowhere: §12's *"derive from `placements`,
 *  never store a total"*, which is why `DesignSchema` gains no price field in this wave or any
 *  later one. */
export interface PricedDesign {
  readonly currency: PriceBookCurrency;
  /** The book's version, carried so a snapshot can later be checked against the book it was priced
   *  under rather than re-priced under whatever is current (M8's inheritance, ADR 0062 seam 3). */
  readonly pricingVersion: string;
  readonly status: PriceBookStatus;
  /** **Whether anybody has ever costed the amounts this was priced from**, carried from the book
   *  beside `status` and never derived here.
   *
   *  A different question from `status`, and both are needed: `status` says whether a priced result
   *  may be shown as a commercial offer, this says whether the figures behind it are placeholders.
   *  Every book this repository ships is both — `estimate` and provisional — which is exactly why a
   *  surface cannot infer one from the other and why dropping this one silently would let 6C's
   *  price bar present a placeholder as though it had been costed.
   *
   *  Data only. What a surface does with it is 6C's and 6D's, as the flagged total's wording is
   *  (ADR 0065 decision 7b): no copy for it lives here. */
  readonly amountsProvisional: boolean;
  /** Placement lines in the projection's order, then hardware, then material. */
  readonly lines: readonly PriceLine[];
  /** The exact sum of every line, in minor units. Presentation rounds; this does not. */
  readonly totalMinor: number;
  /** The placements reaching past the end of their wall, **derived from the design being priced**
   *  through `findOverflowingPlacementIds` (ADR 0069 decision 5c), so a surface marks the same
   *  bodies the scene marks (ADR 0065 decision 6) and no caller can hand pricing a set computed off
   *  a different document. **Every one of them is priced**: excluding a body that does not fit would
   *  make the total drop at the moment part of the kitchen became unbuildable, which is the named
   *  defect that decision rejects. */
  readonly overflowingPlacementIds: readonly string[];
  /** Whether the total must be shown flagged. Derived from the list above and published beside it,
   *  so a surface asking *"is this total flagged?"* does not have to know that an empty array is
   *  the answer "no". */
  readonly totalIsFlagged: boolean;
}

/** Every way pricing refuses. Codes rather than sentences: nothing renders these to a customer, and
 *  a test asserting on prose is a test a copy edit breaks. */
export type PricingFailureCode =
  /** The book is not usable at all: wrong currency, or a rule id used twice. */
  | "INVALID_PRICE_BOOK"
  /** The book's version is not the one the caller asked to price at. */
  | "PRICING_VERSION_MISMATCH"
  /** A placement names a `buildId` the catalogue does not hold. */
  | "UNKNOWN_BODY"
  /** A placement resolved no cabinet rule, directly or through its catalogue equivalent. */
  | "NO_RULE_FOR_BODY"
  /** A rule carries a formula shape this build does not know. */
  | "UNKNOWN_FORMULA_SHAPE"
  /** A selection, or a book's own default, names a tier the book does not hold. */
  | "UNKNOWN_TIER"
  /** A catalogue entry declares no usable cabinet-handle count (ADR 0061 decision 4). */
  | "UNDECLARED_HANDLE_COUNT"
  /** A catalogue entry declares no usable front population, so its hinges, drawers and push-to-open
   *  latches cannot be counted (ADR 0092 decision 1). **Never read as zero mechanisms**: that would
   *  price a whole kitchen's hardware at nothing and look implemented. */
  | "UNDECLARED_FRONT_POPULATION"
  /** An amount or a total is not an exact safe integer of minor units. */
  | "INVALID_AMOUNT";

/** Why pricing refused, naming the thing it could not resolve.
 *
 *  Every failure names an id where there is one to name — the criterion is *"returns a failure
 *  naming the id it could not resolve"* — and `detail` is English developer text, deliberately not
 *  copy. */
export interface PricingFailure {
  readonly code: PricingFailureCode;
  readonly detail: string;
  /** The placement this refusal is about, where one is. */
  readonly placementId?: string;
  /** The catalogue or book id this refusal is about, where one is. */
  readonly id?: string;
}

/**
 * **Fail whole.** Either every line and the total, or no line and no total.
 *
 * There is no partial branch on purpose: a breakdown missing one body reads as a cheaper kitchen,
 * and a total that silently dropped a cabinet is worse than no total at all.
 */
export type PricingResult =
  | { readonly ok: true; readonly priced: PricedDesign }
  | { readonly ok: false; readonly failure: PricingFailure };
