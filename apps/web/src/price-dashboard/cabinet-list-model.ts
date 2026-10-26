import {
  PRICE_GROUP_CODES,
  type DraftChange,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";

import type { DashboardDraftWire } from "./price-dashboard-wire-contract";

// What the cabinet list (frames D2A, D2B, D2M) is drawn from, and the pure rules that turn it into rows. Nothing here
// reads the price book or does arithmetic on a price: the amounts at the default size arrive already worked out (the
// seam is `CabinetRuleFacts`, filled by the server), and this module only decides what is modified, what a search
// matches and how the rows group.

/** How wide a cabinet can be made: any width between two bounds, or only the listed sizes. */
export type CabinetWidthRange =
  | { readonly kind: "range"; readonly minMm: number; readonly maxMm: number }
  | { readonly kind: "fixed"; readonly widthsMm: readonly number[] };

export interface CabinetWidthFacts {
  readonly range: CabinetWidthRange;
  /** The width the price is quoted at, and the one the picture is chosen by. */
  readonly defaultMm: number;
  /** A wall cabinet's default is the base cabinet's, so the row says "după dulapul de jos" and not a number. */
  readonly isDefaultFollowingBase: boolean;
  /** The default is a proposal the manufacturer has not confirmed yet ("propus"). */
  readonly isDefaultProposed: boolean;
}

/** The price at the default size (PAL, no hardware), in bani, before and after the draft. */
export interface CabinetDefaultPrice {
  readonly widthMm: number;
  /** Only for a row built to its opening (a wall cabinet): the height the price is quoted at. */
  readonly heightMm?: number;
  readonly activeMinor: number;
  /** What the price becomes once the draft is published; equal to `activeMinor` when the draft leaves it alone. */
  readonly pendingMinor: number;
}

/** One cabinet type of the book, as the list needs it. The server builds it from the active book and the catalogue. */
export interface CabinetRuleFacts {
  readonly ruleId: string;
  readonly buildId: string;
  /** The catalogue's Romanian name, in both locales until the official translation (frame D2R). */
  readonly name: string;
  readonly group: PriceGroupCode;
  readonly widths: CabinetWidthFacts;
  /** A structural piece the configurator places itself in L and U kitchens (corner rows). */
  readonly isStructural: boolean;
  /** The manufacturer does not supply it (a freestanding fridge, a hood): it has no price. */
  readonly isCustomerSupplied: boolean;
  /** Absent exactly for a customer-supplied row. */
  readonly price?: CabinetDefaultPrice;
}

/** Everything the list screen is given: the cabinets, and the draft beside them (X0's wire shape). */
export interface CabinetListInput {
  readonly rules: readonly CabinetRuleFacts[];
  readonly draft: DashboardDraftWire;
}

export interface CabinetRow {
  readonly facts: CabinetRuleFacts;
  /** The draft changes a price of this cabinet. */
  readonly isModified: boolean;
}

export interface CabinetGroup {
  readonly code: PriceGroupCode;
  readonly rows: readonly CabinetRow[];
  readonly modifiedCount: number;
}

/** Whether the draft holds a change to one of this cabinet's prices: its default-size price or a listed size's. */
export function isRuleModified(
  draft: DashboardDraftWire,
  ruleId: string,
): boolean {
  return draft.changes.some((change) => namesRule(change, ruleId));
}

function namesRule(change: DraftChange, ruleId: string): boolean {
  const { address } = change;
  const isCabinetAddress =
    address.kind === "cabinet" || address.kind === "cabinet-size";
  return isCabinetAddress && address.ruleId === ruleId;
}

/**
 * The number the header and the menu show: every change the draft holds, whatever it changes. The depth rule counts
 * with the cabinet prices (frame D2E2: "Numărul din antet include regula"), and so does a bulk action's every field.
 */
export function pendingPriceCountOf(draft: DashboardDraftWire): number {
  return draft.changes.length;
}

export function rowsOf(input: CabinetListInput): readonly CabinetRow[] {
  return input.rules.map((facts) => ({
    facts,
    isModified: isRuleModified(input.draft, facts.ruleId),
  }));
}

export interface CabinetListFilter {
  readonly query: string;
  readonly onlyModified: boolean;
}

/** The rows a person's search and "Doar modificate" leave, in the order they were given. */
export function filterRows(
  rows: readonly CabinetRow[],
  filter: CabinetListFilter,
): readonly CabinetRow[] {
  const needle = normalisedForSearch(filter.query);
  return rows.filter(
    (row) =>
      (!filter.onlyModified || row.isModified) &&
      normalisedForSearch(row.facts.name).includes(needle),
  );
}

/** The groups in the order the list draws them, each with its rows; a group with no row is left out. */
export function groupRows(
  rows: readonly CabinetRow[],
): readonly CabinetGroup[] {
  return PRICE_GROUP_CODES.map((code) => {
    const groupRows = rows.filter((row) => row.facts.group === code);
    return {
      code,
      rows: groupRows,
      modifiedCount: groupRows.filter((row) => row.isModified).length,
    };
  }).filter((group) => group.rows.length > 0);
}

/** Case and diacritics do not matter to a search: "coloana" finds "Coloană", "suspendat" finds "Dulap suspendat". */
export function normalisedForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("ro")
    .trim();
}

/** Whether the price at the default size changes with the draft, so the row shows the new one and the active beside it. */
export function hasPendingPrice(row: CabinetRow): boolean {
  const { price } = row.facts;
  return (
    row.isModified &&
    price !== undefined &&
    price.pendingMinor !== price.activeMinor
  );
}
