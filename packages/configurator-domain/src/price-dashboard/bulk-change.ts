import { normaliseBand } from "../bands.js";
import { roundHalfUpToTenLei } from "../pricing/percentage-lines.js";
import type { CabinetPriceRule, PriceBook } from "../pricing/price-book.js";
import { PERCENT_BASE } from "../pricing/price-bounds.js";
import type { PriceGroupCode } from "../staff/dashboard-audit-action.js";
import type { BodyCatalog } from "../void-engine.js";

import {
  isCabinetAddress,
  prepareWrite,
  readEditableFields,
  type CabinetAddress,
} from "./editable-fields.js";
import { judgeRuleAgainstCatalog } from "./judge-book.js";
import { pricedRowOf, type PricedRow } from "./priced-row.js";

// A bulk percentage over the cabinets' prices (ADR 0177 A-14; frame D2D): every amount a cabinet's price is made of (the
// anchor, both width steps, the door leaf, the height step and each listed size) becomes `r10(amount × (100 + p) / 100)`,
// in integers. Prices of customer-supplied rows are not touched (they have none to scale), and neither is any percentage.
//
// The plan lists every amount in scope, ones that round back to their current value included: the caller (R2's bulk
// route) drops those and refuses an action that leaves none. `scope` counts what the dialog's preview names ("22 dulapuri,
// 64 prețuri"), `changed` what the plan really changes.

/** The least and greatest whole percentage a bulk action may apply. Architect's bounds (the plan's M2-a), not a business
 *  figure: −90 % keeps every price a tenth of itself and 300 % quadruples it, and a price the book cannot hold or the
 *  catalogue cannot price is refused after scaling, whatever the percentage. */
export const MIN_BULK_PERCENT = -90;
export const MAX_BULK_PERCENT = 300;

/** Which cabinets a bulk action applies to (`DraftBulk` states the same without the ids). */
export type BulkTarget =
  | { readonly scope: "all" }
  | { readonly scope: "group"; readonly groupCode: PriceGroupCode }
  | { readonly scope: "selection"; readonly ruleIds: readonly string[] };

export interface BulkChangeRequest {
  /** The candidate book: the active one with the draft applied (ruling R2-Q6). */
  readonly book: PriceBook;
  readonly catalog: BodyCatalog;
  readonly target: BulkTarget;
  /** A whole percentage from `MIN_BULK_PERCENT` to `MAX_BULK_PERCENT`, never 0. */
  readonly percent: number;
}

/** A cabinet price set to a value. */
export interface PlannedCabinetPrice {
  readonly address: CabinetAddress;
  readonly value: number;
}

/** How many cabinets and how many prices (amounts) a set of changes touches. */
export interface BulkCounts {
  readonly ruleCount: number;
  readonly amountCount: number;
}

/** Same names as the wire's bulk refusal codes, so the route passes them on. */
export const BULK_PLAN_REFUSAL_CODES = Object.freeze([
  "NOT_A_WHOLE_NUMBER",
  "PERCENT_OUT_OF_RANGE",
  "UNKNOWN_RULE",
  "NO_CABINETS_SELECTED",
  "PRICE_WOULD_BE_NEGATIVE",
] as const);
export type BulkPlanRefusalCode = (typeof BULK_PLAN_REFUSAL_CODES)[number];

export type BulkPlan =
  | {
      readonly kind: "planned";
      readonly changes: readonly PlannedCabinetPrice[];
      /** Everything in scope, before rounding is compared with the current price. */
      readonly scope: BulkCounts;
      /** Only the prices whose scaled amount differs from the current one. */
      readonly changed: BulkCounts;
    }
  | { readonly kind: "refused"; readonly code: BulkPlanRefusalCode };

/** `r10(amount × (100 + percent) / 100)`, half up, in integers; never `-0`. */
export function scaledAmountMinor(
  amountMinor: number,
  percent: number,
): number {
  const scaled = roundHalfUpToTenLei(
    amountMinor * (PERCENT_BASE + percent),
    PERCENT_BASE,
  );
  return scaled === 0 ? 0 : scaled;
}

/** The price group D2 lists a catalogue row under: the six structural corners, else its band (the top row hangs on
 *  the wall, a full-height unit is a "tall" one). */
export function priceGroupOf(row: PricedRow): PriceGroupCode {
  if (row.definition.structuralReason === "corner") return "corner";
  const band = normaliseBand(row.definition.band);
  return band === "column" ? "tall" : band;
}

export function planBulkChange(request: BulkChangeRequest): BulkPlan {
  const refusedPercent = refusalOfPercent(request.percent);
  if (refusedPercent !== undefined) return refusal(refusedPercent);
  const scope = rulesInScope(request);
  if (scope.kind === "unknown-rule") return refusal("UNKNOWN_RULE");
  const inScope = pricesOf(request.book, scope.rules).map((price) =>
    scaledPrice(price, request.percent),
  );
  return inScope.length === 0
    ? refusal("NO_CABINETS_SELECTED")
    : planned(request, inScope);
}

function refusal(code: BulkPlanRefusalCode): BulkPlan {
  return { kind: "refused", code };
}

/** 0 % changes nothing (and `-0` is not a reduction), a fraction cannot be held exactly, and the bounds are the
 *  action's own. */
function refusalOfPercent(percent: number): BulkPlanRefusalCode | undefined {
  if (!Number.isInteger(percent)) return "NOT_A_WHOLE_NUMBER";
  const isInBounds = percent >= MIN_BULK_PERCENT && percent <= MAX_BULK_PERCENT;
  return isInBounds && percent !== 0 ? undefined : "PERCENT_OUT_OF_RANGE";
}

// ---------------------------------------------------------------------------------------------------------------------
// Which rules

type ScopeReading =
  | { readonly kind: "rules"; readonly rules: readonly CabinetPriceRule[] }
  | { readonly kind: "unknown-rule" };

function rulesInScope(request: BulkChangeRequest): ScopeReading {
  const { book, catalog, target } = request;
  switch (target.scope) {
    case "all":
      return { kind: "rules", rules: book.cabinetRules };
    case "group":
      return {
        kind: "rules",
        rules: book.cabinetRules.filter(
          (rule) => groupOfRule(catalog, rule) === target.groupCode,
        ),
      };
    case "selection":
      return selectedRules(book.cabinetRules, target.ruleIds);
  }
}

function groupOfRule(
  catalog: BodyCatalog,
  rule: CabinetPriceRule,
): PriceGroupCode | undefined {
  const row = pricedRowOf(catalog, rule.buildId);
  return row === undefined ? undefined : priceGroupOf(row);
}

function selectedRules(
  rules: readonly CabinetPriceRule[],
  ruleIds: readonly string[],
): ScopeReading {
  const selected = rules.filter((rule) => ruleIds.includes(rule.ruleId));
  const known = new Set(selected.map((rule) => rule.ruleId));
  return ruleIds.every((ruleId) => known.has(ruleId))
    ? { kind: "rules", rules: selected }
    : { kind: "unknown-rule" };
}

// ---------------------------------------------------------------------------------------------------------------------
// Which amounts, and what they become

interface CabinetPrice {
  readonly address: CabinetAddress;
  readonly currentMinor: number;
}

interface ScaledPrice extends CabinetPrice {
  readonly scaledMinor: number;
}

/** The editable cabinet amounts of these rules, in the order the book lists them. A customer-supplied row has none:
 *  `readEditableFields` does not offer its fields. */
function pricesOf(
  book: PriceBook,
  rules: readonly CabinetPriceRule[],
): readonly CabinetPrice[] {
  const ruleIds = new Set(rules.map((rule) => rule.ruleId));
  return readEditableFields(book).flatMap(({ address, value }) =>
    isCabinetAddress(address) &&
    ruleIds.has(address.ruleId) &&
    typeof value === "number"
      ? [{ address, currentMinor: value }]
      : [],
  );
}

function scaledPrice(price: CabinetPrice, percent: number): ScaledPrice {
  return {
    ...price,
    scaledMinor: scaledAmountMinor(price.currentMinor, percent),
  };
}

function planned(
  request: BulkChangeRequest,
  inScope: readonly ScaledPrice[],
): BulkPlan {
  const changes = inScope.map(({ address, scaledMinor }) => ({
    address,
    value: scaledMinor,
  }));
  const refused = refusalOfScaledBook(request, changes);
  if (refused !== undefined) return refusal(refused);
  return {
    kind: "planned",
    changes,
    scope: countsOf(inScope),
    changed: countsOf(
      inScope.filter(
        ({ currentMinor, scaledMinor }) => currentMinor !== scaledMinor,
      ),
    ),
  };
}

function countsOf(
  prices: readonly { readonly address: CabinetAddress }[],
): BulkCounts {
  const ruleIds = new Set(prices.map(({ address }) => address.ruleId));
  return { ruleCount: ruleIds.size, amountCount: prices.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// What the scaled prices do to the book

/** A scaled price the book cannot hold is the percentage's fault, and so is one that leaves a cabinet the catalogue
 *  builds at or below zero (D3C's case, reached from the other side). */
function refusalOfScaledBook(
  request: BulkChangeRequest,
  changes: readonly PlannedCabinetPrice[],
): BulkPlanRefusalCode | undefined {
  const scaled = withPrices(request.book, changes);
  if (scaled === undefined) return "PERCENT_OUT_OF_RANGE";
  const scaledIds = new Set(changes.map(({ address }) => address.ruleId));
  for (const rule of scaled.cabinetRules) {
    if (!scaledIds.has(rule.ruleId)) continue;
    const code = refusalOfScaledRule(rule, request.catalog);
    if (code !== undefined) return code;
  }
  return undefined;
}

/** Only what scaling can cause: a price at or below zero, or above what a cabinet may cost. A fault the rule already
 *  had (a shape the catalogue cannot price, an amount that is not exact) is not the percentage's. */
function refusalOfScaledRule(
  rule: CabinetPriceRule,
  catalog: BodyCatalog,
): BulkPlanRefusalCode | undefined {
  switch (judgeRuleAgainstCatalog(rule, catalog)?.code) {
    case "PRICE_NOT_POSITIVE":
      return "PRICE_WOULD_BE_NEGATIVE";
    case "PRICE_TOO_LARGE":
      return "PERCENT_OUT_OF_RANGE";
    default:
      return undefined;
  }
}

/** The book with these prices set, or `undefined` when one is more than a price may be. */
function withPrices(
  book: PriceBook,
  changes: readonly PlannedCabinetPrice[],
): PriceBook | undefined {
  let scaled = book;
  for (const { address, value } of changes) {
    const judged = prepareWrite(scaled, address, value);
    if (!judged.ok) return undefined;
    scaled = judged.value(scaled);
  }
  return scaled;
}
