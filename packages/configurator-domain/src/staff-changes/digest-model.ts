// What one day's digest says, as facts and codes with no sentence (ADR 0178 A-13); values are raw, escaping is the mailer's.

import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_DAYS,
  type DigestStoppingStatus,
} from "./digest-eligibility.js";
import { chisinauDayKey, type ChisinauDayKey } from "./chisinau-day.js";

/** The persistence port's `DigestEligibleKitchen` without `Date` (instants are epoch milliseconds) or revision. */
export type DigestKitchenInput = DigestCustomerInput & {
  readonly designId: string;
  readonly kitchenName?: string;
  readonly sentAtMs: number;
  readonly updatedAtMs: number;
};

type DigestCustomerInput =
  | { readonly customerName: string; readonly reference?: never }
  | { readonly reference: string; readonly customerName?: never };

export type DigestCustomerFact =
  | { readonly kind: "account-name"; readonly name: string }
  | { readonly kind: "request-reference"; readonly reference: string };

/** A closed set of facts: no e-mail, no phone. */
export interface DigestRow {
  readonly designId: string;
  /** Omitted when the kitchen has no name or a blank one. */
  readonly kitchenName?: string;
  readonly customer: DigestCustomerFact;
  readonly sentAtMs: number;
  readonly updatedAtMs: number;
  /** The Europe/Chisinau calendar day of each instant. */
  readonly sentDay: ChisinauDayKey;
  readonly updatedDay: ChisinauDayKey;
}

/** One run per Europe/Chisinau calendar day, and only with something to list. */
export const DIGEST_CADENCE = "at-most-once-per-day" as const;

/** The footer states the rule in its own numbers and codes. */
export interface DigestFooterFacts {
  readonly cadence: typeof DIGEST_CADENCE;
  /** Days after the first send at which a kitchen drops out. */
  readonly windowDays: number;
  /** Statuses at which a kitchen drops out at once. */
  readonly stoppingStatuses: readonly DigestStoppingStatus[];
}

export interface DigestModel {
  readonly kind: "digest";
  /** The subject carries this count and no customer text. */
  readonly subjectCount: number;
  readonly rows: readonly DigestRow[];
  readonly footer: DigestFooterFacts;
}

/** No kitchen is eligible, so no e-mail is sent. */
export const NOTHING_TO_SEND = Object.freeze({
  kind: "nothing-to-send",
} as const);
export type NothingToSend = typeof NOTHING_TO_SEND;

export const DIGEST_FOOTER_FACTS: DigestFooterFacts = Object.freeze({
  cadence: DIGEST_CADENCE,
  windowDays: DIGEST_WINDOW_DAYS,
  stoppingStatuses: DIGEST_STOPPING_STATUSES,
});

/** Rows run latest change first, then by design id; a design given twice is listed once, at its latest change. */
export function buildDigestModel(
  eligible: readonly DigestKitchenInput[],
): DigestModel | NothingToSend {
  const rows = onePerDesign(eligible.map(toDigestRow).sort(byLatestChange));
  if (rows.length === 0) return NOTHING_TO_SEND;
  return {
    kind: "digest",
    subjectCount: rows.length,
    rows,
    footer: DIGEST_FOOTER_FACTS,
  };
}

function toDigestRow(kitchen: DigestKitchenInput): DigestRow {
  return {
    designId: kitchen.designId,
    ...(hasText(kitchen.kitchenName)
      ? { kitchenName: kitchen.kitchenName }
      : {}),
    customer: customerFact(kitchen),
    sentAtMs: kitchen.sentAtMs,
    updatedAtMs: kitchen.updatedAtMs,
    sentDay: chisinauDayKey(kitchen.sentAtMs),
    updatedDay: chisinauDayKey(kitchen.updatedAtMs),
  };
}

function customerFact(kitchen: DigestKitchenInput): DigestCustomerFact {
  if (hasText(kitchen.customerName)) {
    return { kind: "account-name", name: kitchen.customerName };
  }
  if (hasText(kitchen.reference)) {
    return { kind: "request-reference", reference: kitchen.reference };
  }
  throw new RangeError(
    `buildDigestModel: kitchen ${kitchen.designId} has neither a customer name nor a request reference`,
  );
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function byLatestChange(first: DigestRow, second: DigestRow): number {
  const latestFirst = second.updatedAtMs - first.updatedAtMs;
  if (latestFirst !== 0) return latestFirst;
  return compareCodeUnits(first.designId, second.designId);
}

function compareCodeUnits(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function onePerDesign(sortedRows: readonly DigestRow[]): readonly DigestRow[] {
  const seen = new Set<string>();
  return sortedRows.filter((row) => {
    if (seen.has(row.designId)) return false;
    seen.add(row.designId);
    return true;
  });
}
