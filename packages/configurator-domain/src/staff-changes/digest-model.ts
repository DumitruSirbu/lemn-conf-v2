// What one day's digest says, as facts and codes (frame D10D; ADR 0178 A-13). It carries no sentence: the subject is a
// count, the footer is the rule's own numbers and status codes, and the words, plurals and dates in a reader's locale
// are lane T's copy and the mail builder's.
//
// It also carries no e-mail address and no phone number: a row names its customer by the account name or, without an
// account, by the request reference (S-21, X0-5). Values are raw; escaping is the mail builder's job, at the output.

import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_DAYS,
  type DigestStoppingStatus,
} from "./digest-eligibility.js";
import { chisinauDayKey, type ChisinauDayKey } from "./chisinau-day.js";

/**
 * One kitchen the digest lists. The same shape as the persistence port's `DigestEligibleKitchen`, restated here because
 * the domain depends on no other package, and with its two instants as epoch milliseconds (`Date.getTime()`), because
 * the domain holds no `Date`. The revision is deliberately absent: it stays opaque and is recorded by the caller,
 * which holds the port's rows.
 */
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

/** The closed set of facts a row carries. */
export interface DigestRow {
  readonly designId: string;
  /** Omitted when the kitchen has no name; never an empty string. */
  readonly kitchenName?: string;
  readonly customer: DigestCustomerFact;
  readonly sentAtMs: number;
  readonly updatedAtMs: number;
  /** The Europe/Chisinau calendar day of each instant, so a reader's "yesterday" and date agree with the shop's. */
  readonly sentDay: ChisinauDayKey;
  readonly updatedDay: ChisinauDayKey;
}

/** How often the digest may be sent: one run per Europe/Chisinau calendar day, and only with something to list. */
export const DIGEST_CADENCE = "at-most-once-per-day" as const;

/** The rule the footer states, in the rule's own numbers and codes. */
export interface DigestFooterFacts {
  readonly cadence: typeof DIGEST_CADENCE;
  /** Days after the first send at which a kitchen drops out. */
  readonly windowDays: number;
  /** Statuses at which a kitchen drops out at once. */
  readonly stoppingStatuses: readonly DigestStoppingStatus[];
}

export interface DigestModel {
  readonly kind: "digest";
  /** The subject names this count and nothing else: no customer text reaches a subject. */
  readonly subjectCount: number;
  readonly rows: readonly DigestRow[];
  readonly footer: DigestFooterFacts;
}

/** No kitchen is eligible: no e-mail is sent (A-13). */
export const NOTHING_TO_SEND = Object.freeze({
  kind: "nothing-to-send",
} as const);
export type NothingToSend = typeof NOTHING_TO_SEND;

export const DIGEST_FOOTER_FACTS: DigestFooterFacts = Object.freeze({
  cadence: DIGEST_CADENCE,
  windowDays: DIGEST_WINDOW_DAYS,
  stoppingStatuses: DIGEST_STOPPING_STATUSES,
});

/**
 * Rows are ordered by the latest change first, then by design id, so the same eligible set always prints the same
 * e-mail. A design given twice is listed once, at its latest change: a kitchen appears once per round (frame D10D).
 */
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
    ...(kitchen.kitchenName ? { kitchenName: kitchen.kitchenName } : {}),
    customer: customerFact(kitchen),
    sentAtMs: kitchen.sentAtMs,
    updatedAtMs: kitchen.updatedAtMs,
    sentDay: chisinauDayKey(kitchen.sentAtMs),
    updatedDay: chisinauDayKey(kitchen.updatedAtMs),
  };
}

function customerFact(kitchen: DigestKitchenInput): DigestCustomerFact {
  return kitchen.customerName !== undefined
    ? { kind: "account-name", name: kitchen.customerName }
    : { kind: "request-reference", reference: kitchen.reference };
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
