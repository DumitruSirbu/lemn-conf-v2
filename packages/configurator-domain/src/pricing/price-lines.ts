// What a priced design is: an ordered list of traceable lines, an exact total, and the book's version,
// status and provisional flag carried forward; plus every way pricing can refuse.
//
// No Romanian copy lives here: a pricing failure renders no figure (not a zero, a stale one or a dash),
// and the flagged-total warning is owner-ruled copy belonging to the rendering surface (ADR 0065
// decision 7b).
import type { BodyLabel } from "../catalog.js";
import type {
  CabinetSupplier,
  PriceBookCurrency,
  PriceBookStatus,
} from "./price-book.js";

/** What a line is for. `cabinet` traces to a placement; `hardware` and `material` are the named
 *  whole-kitchen rules §12 permits a line to trace to instead; `depth` is the book's one depth rule; `accessory` traces
 *  to neither — it is billed per sink, which is a count of bodies rather than one body or the whole kitchen. */
export type PriceLineKind =
  | "cabinet"
  | "hardware"
  | "material"
  | "depth"
  | "accessory";

/** The fields every line carries, whatever it prices.
 *
 *  `amountMinor` is `quantity × unitAmountMinor` and both are exact safe integers, except on an accessory line. Pricing
 *  rounds at one named seam (ADR 0177 A-1): every amount is a whole number of tens of lei, and an accessory line is
 *  `r10(quantity × unitAmountMinor)` with the book's exact rate as its unit. */
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
  /** The catalogue row the rule was resolved through: the equivalent (ADR 0022) where the body has one,
   *  its own id where it has none. */
  readonly pricedAsBuildId: string;
  readonly label: BodyLabel;
  readonly widthMm: number;
  /** Who supplies this body: the book's declaration, defaulted once (`DEFAULT_CABINET_SUPPLIER`),
   *  always present. A `customer` line is drawn and listed but adds nothing to the total. Published
   *  beside `amountMinor`, not inferred from it: a manufacturer row can be free too, and telling a
   *  customer their fridge is *included* is the defect this closes. */
  readonly suppliedBy: CabinetSupplier;
}

/** A whole-kitchen tier, priced once after every placement line. Carries the tier's key beside its
 *  authored name (ADR 0106 decision 1) so the breakdown resolves the same words as the settings sheet;
 *  the line resolves nothing. */
export interface WholeKitchenPriceLine extends PriceLineCommon {
  readonly kind: "hardware" | "material";
  readonly tierId: string;
  readonly name: string;
  readonly description: string;
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
}

/** The uplift a 700 mm depth adds to the cabinets that get deeper: one line, published only when the design is built
 *  at 700 and at least one manufacturer-supplied cabinet deepens. Its amount is `0`
 *  when the book states 0 %, which a surface renders *inclus*. Quantity 1, as the whole-kitchen lines. */
export interface DepthPriceLine extends PriceLineCommon {
  readonly kind: "depth";
  /** The depth the design is built at, so the surface names it ("Adâncime 700 mm") without knowing it. */
  readonly depthMm: number;
  /** The depth rule's percentage this line was priced with, stored beside the amount so a reader of a stored snapshot can
   *  word the uplift without the live book (ADR 0154 decision 8). */
  readonly deepCabinetPercent: number;
}

/** An extra the design earns rather than chooses: the two sink extras (ADR 0070 decision 4). The same
 *  book-data-rendered shape as a tier line (ADR 0062: no copy in a component) and no `tierId`, since no
 *  control selects it. `quantity` is a count of sinks. A quantity of zero is not a line: it would render
 *  *inclus* and tell a customer a rack they are not getting is included. */
export interface AccessoryPriceLine extends PriceLineCommon {
  readonly kind: "accessory";
  /** Which of the book's named accessory rules produced this line: not the rule id, as `tierId` is not
   *  `ruleId` on a tier line. */
  readonly accessoryId: string;
  readonly name: string;
  readonly description: string;
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
}

export type PriceLine =
  | CabinetPriceLine
  | WholeKitchenPriceLine
  | DepthPriceLine
  | AccessoryPriceLine;

/** A priced design. Derived on every read and stored nowhere (§12: never store a total), so
 *  `DesignSchema` has no price field. */
export interface PricedDesign {
  readonly currency: PriceBookCurrency;
  /** The book's version, so a snapshot can be checked against the book it was priced under
   *  (ADR 0062 seam 3). */
  readonly pricingVersion: string;
  readonly status: PriceBookStatus;
  /** Whether anybody has costed the amounts this was priced from, carried from the book beside
   *  `status`: a different question, since `status` says whether a result may be shown as a commercial
   *  offer and this whether the figures are placeholders. Every shipped book is `estimate` and
   *  provisional, so a surface cannot infer one from the other. Data only: no copy for it lives here. */
  readonly amountsProvisional: boolean;
  /** Placement lines in the projection's order, then hardware, then material, then accessories:
   *  appended rather than interleaved so every "hardware then material" assertion holds
   *  (ADR 0092 decision 11). */
  readonly lines: readonly PriceLine[];
  /** The exact sum of every line, in minor units: the lines are what was rounded, so nothing rounds the total. */
  readonly totalMinor: number;
  /** The placements reaching past the end of their wall, derived from the design being priced through
   *  `findOverflowingPlacementIds` (ADR 0069 decision 5c), so a surface marks the bodies the scene
   *  marks. Every one is priced: excluding a body that does not fit would make the total drop when part
   *  of the kitchen became unbuildable (ADR 0065 decision 6). */
  readonly overflowingPlacementIds: readonly string[];
  /** Whether the total must be shown flagged: derived from the list above and published beside it, so
   *  a surface does not have to know an empty array means no. */
  readonly totalIsFlagged: boolean;
}

/** Every way pricing refuses. Codes rather than sentences: nothing renders these to a customer, and
 *  a test asserting on prose is a test a copy edit breaks. */
export type PricingFailureCode =
  /** The book is not usable at all: wrong currency, a rule id used twice, or no rule at all for an
   *  accessory the design earns. */
  | "INVALID_PRICE_BOOK"
  /** The book's version is not the one the caller asked to price at. */
  | "PRICING_VERSION_MISMATCH"
  /** A placement names a `buildId` the catalogue does not hold. */
  | "UNKNOWN_BODY"
  /** A placement resolved no cabinet rule, directly or through its catalogue equivalent. */
  | "NO_RULE_FOR_BODY"
  /** A rule carries a formula shape this build does not know. */
  | "UNKNOWN_FORMULA_SHAPE"
  /** A fixed-size row is built wider than every size the book lists for it. Never priced at zero and never at
   *  the nearest listed size (ADR 0177 A-7). */
  | "NO_PRICE_FOR_SIZE"
  /** A selection, or a book's own default, names a tier the book does not hold. */
  | "UNKNOWN_TIER"
  /** The row a body is priced as declares no usable door-leaf count at the body's width (`describePricedBody`).
   *  Raised on that path alone, never on a hardware quantity: a body whose mechanisms cannot be counted, or whose
   *  leaves an anchored door shape cannot count, raises `UNDECLARED_FRONT_POPULATION`. */
  | "UNDECLARED_HANDLE_COUNT"
  /** A catalogue entry declares no usable front population, so its hinges, drawers and push-to-open
   *  latches cannot be counted (ADR 0092 decision 1). Never read as zero mechanisms: that would price a
   *  whole kitchen's hardware at nothing. */
  | "UNDECLARED_FRONT_POPULATION"
  /** A placement's own frame height leaves a `one-band-under-frame` row no band a door could be hung
   *  in, so its leaves, and the hinges counted over them, cannot be read (`UnbuildableDoorBandError`,
   *  ADR 0092 decision 16). A different cause from the code above: nothing is missing from the
   *  catalogue, the height on the placement is the fault. Reachable only from a `wall-cabinet` or
   *  `wall-lift` on a document no validator passed: a validated design cannot carry a frame of 6 mm or
   *  less (`findBodyDimensionIssues` floors it at `MIN_BODY_HEIGHT_MM`). Names the placement and build
   *  id; the band height is in `detail`. */
  | "UNBUILDABLE_DOOR_BAND"
  /** An amount or a total is not an exact safe integer of minor units. */
  | "INVALID_AMOUNT";

/** Why pricing refused, naming the id it could not resolve where there is one. `detail` is English
 *  developer text, not copy. */
export interface PricingFailure {
  readonly code: PricingFailureCode;
  readonly detail: string;
  /** The placement this refusal is about, where one is. */
  readonly placementId?: string;
  /** The catalogue or book id this refusal is about, where one is. */
  readonly id?: string;
}

/**
 * Fail whole: every line and the total, or none. A breakdown missing one body reads as a cheaper
 * kitchen.
 */
export type PricingResult =
  | { readonly ok: true; readonly priced: PricedDesign }
  | { readonly ok: false; readonly failure: PricingFailure };
