import {
  anchoredShapeReadsHeight,
  applyChanges,
  DEFAULT_CABINET_DEPTH_MM,
  isAnchoredShape,
  previewCabinet,
  priceGroupOf,
  pricedRowOf,
  readEditableFields,
  referenceCornerBuiltWidthsMm,
  roundUpToPriceStepMm,
  resolveWidthRangesMm,
  toInsertableBody,
  type BodyCatalog,
  type CabinetPriceRule,
  type PreviewRow,
  type PriceBook,
  type PricedRow,
} from "@lemnaria/configurator-domain";

import { shippedDeepeningRows } from "@/price/deepening-rows";

import {
  isRuleModified,
  type CabinetAnchorField,
  type CabinetDefaultPrice,
  type CabinetListInput,
  type CabinetPriceAddress,
  type CabinetRuleFacts,
  type CabinetWidthFacts,
} from "./cabinet-list-model";
import { priceDashboardCatalogue } from "./price-dashboard-catalogue";
import type {
  DashboardDraftWire,
  DashboardStateWire,
} from "./price-dashboard-wire-contract";

// The cabinet list's facts, worked out from what the dashboard's route answers: the active book, and the draft beside it. The
// browser works them out again after every write, so the list shows the new price without asking the server for it. Nothing
// here adds a price up: the default-size price is a row of `previewCabinet`, the book with the draft applied is
// `applyChanges`, and the width and the group of a row are the catalogue's.

/** Everything the screen is given: the dashboard's state, and the Romanian name of each cabinet by build id. */
export interface CabinetListPageInput {
  readonly state: DashboardStateWire;
  readonly cabinetNames: Readonly<Record<string, string>>;
}

export type CabinetListDerivation =
  | {
      readonly kind: "ready";
      readonly input: CabinetListInput;
      /** The active book with the draft applied: what a bulk preview scales. */
      readonly candidate: PriceBook;
    }
  | { readonly kind: "unreadable" };

/** A fact the book or the catalogue contradicts. A defect of ours, so the list is not drawn rather than drawn wrong. */
class CabinetListUnreadableError extends Error {
  constructor(detail: string) {
    super(`The cabinet list cannot be read: ${detail}`);
    this.name = "CabinetListUnreadableError";
  }
}

/**
 * The rows of the list for a state. A draft that does not apply, a rule the catalogue does not hold, a price the preview
 * refuses, or a cabinet whose price moved with no change naming it, is `unreadable`: the last is the seam's assertion that
 * an unmodified row's pending price equals its active one.
 */
export function deriveCabinetList(
  page: CabinetListPageInput,
): CabinetListDerivation {
  const { active, draft } = page.state;
  const applied = applyChanges(active.book, draft.changes);
  if (!applied.ok) return { kind: "unreadable" };
  try {
    const books = {
      active: active.book,
      candidate: applied.book,
      draft,
      names: page.cabinetNames,
    };
    const rules = active.book.cabinetRules.map((rule) =>
      factsOfRule(rule, books),
    );
    return { kind: "ready", input: { rules, draft }, candidate: applied.book };
  } catch (failure) {
    if (failure instanceof CabinetListUnreadableError) {
      return { kind: "unreadable" };
    }
    throw failure;
  }
}

/**
 * The price a cabinet is quoted at in a book, as the list draws it. `undefined` for a rule the book lacks and for a
 * customer-supplied one, which has no price.
 */
export function defaultSizePriceMinor(
  book: PriceBook,
  ruleId: string,
): number | undefined {
  const rule = book.cabinetRules.find((held) => held.ruleId === ruleId);
  if (rule === undefined || rule.suppliedBy === "customer") return undefined;
  const row = rowOfRule(rule, priceDashboardCatalogue());
  return defaultSizeRowOf(rule, book, widthsOf(row).defaultMm).priceMinor;
}

interface Books {
  readonly active: PriceBook;
  readonly candidate: PriceBook;
  readonly draft: DashboardDraftWire;
  readonly names: Readonly<Record<string, string>>;
}

function factsOfRule(rule: CabinetPriceRule, books: Books): CabinetRuleFacts {
  const row = rowOfRule(rule, priceDashboardCatalogue());
  const widths = widthsOf(row);
  const base = {
    ruleId: rule.ruleId,
    buildId: rule.buildId,
    name: books.names[rule.buildId] ?? rule.buildId,
    group: priceGroupOf(row),
    widths,
    isStructural: row.definition.structuralReason !== undefined,
    isCustomerSupplied: rule.suppliedBy === "customer",
  };
  if (base.isCustomerSupplied) return base;
  const price = priceOf(rule, books, widths.defaultMm);
  const anchorField = anchorFieldOf(rule.ruleId, books, widths.defaultMm);
  return {
    ...base,
    price,
    ...(anchorField === undefined ? {} : { anchorField }),
  };
}

function rowOfRule(rule: CabinetPriceRule, catalog: BodyCatalog): PricedRow {
  const row = pricedRowOf(catalog, rule.buildId);
  if (row === undefined) {
    throw new CabinetListUnreadableError(`no catalogue row for ${rule.ruleId}`);
  }
  return row;
}

// ---------------------------------------------------------------------------------------------------------------------
// Widths

function widthsOf(row: PricedRow): CabinetWidthFacts {
  const insertable = toInsertableBody(row.buildId, row.definition);
  const defaultMm = row.definition.defaultWidthMm;
  if (insertable === undefined || defaultMm === undefined) {
    return builtWidthOf(row);
  }
  const ranges = resolveWidthRangesMm(insertable);
  const isFixed = ranges.every(({ minMm, maxMm }) => minMm === maxMm);
  return {
    range: isFixed
      ? { kind: "fixed", widthsMm: ranges.map(({ minMm }) => minMm) }
      : {
          kind: "range",
          minMm: Math.min(...ranges.map(({ minMm }) => minMm)),
          maxMm: Math.max(...ranges.map(({ maxMm }) => maxMm)),
        },
    defaultMm,
    isDefaultFollowingBase: false,
    isDefaultProposed: row.definition.defaultWidthSource === "proposed",
  };
}

/** A structural row is built at the one width the corner assembly gives it. */
function builtWidthOf(row: PricedRow): CabinetWidthFacts {
  const widthMm = referenceCornerBuiltWidthsMm().get(row.buildId);
  if (widthMm === undefined) {
    throw new CabinetListUnreadableError(`no built width for ${row.buildId}`);
  }
  return {
    range: { kind: "fixed", widthsMm: [widthMm] },
    defaultMm: widthMm,
    isDefaultFollowingBase: false,
    isDefaultProposed: false,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The price at the default size

function priceOf(
  rule: CabinetPriceRule,
  books: Books,
  defaultMm: number,
): CabinetDefaultPrice {
  const active = defaultSizeRowOf(rule, books.active, defaultMm);
  const pending = defaultSizeRowOf(
    candidateRuleOf(rule, books.candidate),
    books.candidate,
    defaultMm,
  );
  if (
    !isRuleModified(books.draft, rule.ruleId) &&
    active.priceMinor !== pending.priceMinor
  ) {
    throw new CabinetListUnreadableError(
      `${rule.ruleId} changed price with no draft change naming it`,
    );
  }
  const heightMm = quotedHeightMmOf(rule);
  return {
    widthMm: defaultMm,
    ...(heightMm === undefined ? {} : { heightMm }),
    activeMinor: active.priceMinor,
    pendingMinor: pending.priceMinor,
  };
}

function candidateRuleOf(
  rule: CabinetPriceRule,
  candidate: PriceBook,
): CabinetPriceRule {
  const held = candidate.cabinetRules.find(
    ({ ruleId }) => ruleId === rule.ruleId,
  );
  if (held === undefined) {
    throw new CabinetListUnreadableError(`${rule.ruleId} left the candidate`);
  }
  return held;
}

function defaultSizeRowOf(
  rule: CabinetPriceRule,
  book: PriceBook,
  defaultMm: number,
): PreviewRow {
  const preview = previewCabinet({
    rule,
    catalog: priceDashboardCatalogue(),
    book,
    material: book.material.defaultTierId,
    depth: DEFAULT_CABINET_DEPTH_MM,
    deepeningRows: shippedDeepeningRows(),
  });
  if (!preview.ok) {
    throw new CabinetListUnreadableError(`${rule.ruleId}: ${preview.code}`);
  }
  const atDefault = preview.rows.find(({ widthMm }) => widthMm === defaultMm);
  if (atDefault === undefined) {
    throw new CabinetListUnreadableError(
      `${rule.ruleId} has no ${String(defaultMm)} mm row`,
    );
  }
  return atDefault;
}

/** Only a row built to its opening is quoted at a height. */
function quotedHeightMmOf(rule: CabinetPriceRule): number | undefined {
  const { formula } = rule;
  return isAnchoredShape(formula.shape) &&
    anchoredShapeReadsHeight(formula.shape)
    ? (formula as { readonly anchorHeightMm?: number }).anchorHeightMm
    : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// The field the price cell edits

function anchorFieldOf(
  ruleId: string,
  books: Books,
  defaultMm: number,
): CabinetAnchorField | undefined {
  const pending = quotedFieldOf(books.candidate, ruleId, defaultMm);
  const active = quotedFieldOf(books.active, ruleId, defaultMm);
  if (pending === undefined || active === undefined) return undefined;
  return {
    address: pending.address,
    pendingMinor: pending.valueMinor,
    activeMinor: active.valueMinor,
  };
}

interface QuotedField {
  readonly address: CabinetPriceAddress;
  readonly valueMinor: number;
}

/** The anchor of an anchored rule, or the listed size the default width is priced as, for a rule priced per size. */
function quotedFieldOf(
  book: PriceBook,
  ruleId: string,
  defaultMm: number,
): QuotedField | undefined {
  for (const { address, value } of readEditableFields(book)) {
    if (typeof value !== "number") continue;
    if (address.kind === "cabinet" && address.ruleId === ruleId) {
      if (address.field === "anchorMinor") {
        return { address, valueMinor: value };
      }
    } else if (
      address.kind === "cabinet-size" &&
      address.ruleId === ruleId &&
      address.widthMm === roundUpToPriceStepMm(defaultMm)
    ) {
      return { address, valueMinor: value };
    }
  }
  return undefined;
}
