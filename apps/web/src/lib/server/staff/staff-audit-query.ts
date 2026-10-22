import "server-only";

import { isAccountId, isStaffAuditAction } from "@lemnaria/configurator-domain";
import {
  MAX_STAFF_AUDIT_PAGE,
  type StaffAuditPageRequest,
} from "@lemnaria/persistence";

import { chisinauDayOf } from "@/lib/server/rate-limit/chisinau-day";
import type {
  StaffAuditQueryField,
  StaffAuditQueryRefusalCode,
} from "@/staff/staff-kitchens-wire-contract";

// What a staff member asks the audit page for, read from the URL's text to the port's request or to the members that are
// wrong, as codes. Nothing the person typed is repeated in an answer. Every value accepted here is one the port accepts,
// so a bad query is a `400` and never a store failure (`requireValidPageRequest` throws, and a throw is a `503`).

export interface StaffAuditQueryIssue {
  readonly field: StaffAuditQueryField;
  readonly code: StaffAuditQueryRefusalCode;
}

export type StaffAuditQueryReading =
  | { readonly ok: true; readonly request: StaffAuditPageRequest }
  | { readonly ok: false; readonly issues: readonly StaffAuditQueryIssue[] };

/**
 * The first and last calendar year a day filter may name. `Date.UTC` reads a year below 100 as 19xx, and the day after
 * 9999-12-31 is past the last instant the table's `timestamptz` reads back (the port's bound), so neither edge reaches
 * the clock. The log holds nothing older than the product.
 */
export const EARLIEST_AUDIT_FILTER_YEAR = 2000;
export const LATEST_AUDIT_FILTER_YEAR = 9998;

const FIRST_PAGE = 1;
const NOON_UTC_HOUR = 12;

/** Digits only, no sign, no leading zero: the one way a page number is written. */
const PAGE_NUMBER_TEXT = /^[1-9][0-9]*$/;
/** `YYYY-MM-DD`: the Chisinau calendar day as the page's date field sends it. */
const DAY_TEXT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

type FieldReading<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issue: StaffAuditQueryIssue };

/** A Chisinau calendar day as the half-open UTC window from its local midnight to the next day's. */
interface DayWindow {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * Reads `page`, `action`, `actor`, `from` and `to`; a member that is absent or empty is no filter, and any other member
 * is ignored. `from` and `to` are both **inclusive** Chisinau days: the window is `[start of from, start of the day
 * after to)`, so the day after is the next local midnight, never `to` plus 24 hours (29 March and 25 October 2026 are
 * days of 23 and 25 hours). A `to` before its `from` is refused. `actor` is an account id by shape only: nothing here
 * looks an address up.
 */
export function readStaffAuditQuery(
  searchParams: URLSearchParams,
): StaffAuditQueryReading {
  const members = readMembers(searchParams);
  const issues = issuesOfMembers(members);
  const request = issues.length === 0 ? requestOf(members) : undefined;
  return request === undefined ? { ok: false, issues } : { ok: true, request };
}

interface QueryMembers {
  readonly page: FieldReading<number>;
  readonly action: FieldReading<string | null>;
  readonly actor: FieldReading<string | null>;
  readonly from: FieldReading<DayWindow | null>;
  readonly to: FieldReading<DayWindow | null>;
}

function readMembers(searchParams: URLSearchParams): QueryMembers {
  return {
    page: readPage(searchParams.get("page")),
    action: readAction(searchParams.get("action")),
    actor: readActor(searchParams.get("actor")),
    from: readDay("from", searchParams.get("from")),
    to: readDay("to", searchParams.get("to")),
  };
}

function issuesOfMembers({
  page,
  action,
  actor,
  from,
  to,
}: QueryMembers): readonly StaffAuditQueryIssue[] {
  return [
    ...[page, action, actor, from, to].flatMap(issueOf),
    ...invertedRangeIssues(from, to),
  ];
}

/** The port's request, or `undefined` when a member was refused (the caller has already reported it). */
function requestOf({
  page,
  action,
  actor,
  from,
  to,
}: QueryMembers): StaffAuditPageRequest | undefined {
  if (!page.ok || !action.ok || !actor.ok || !from.ok || !to.ok) {
    return undefined;
  }
  return {
    actorAccountId: actor.value,
    action: action.value,
    occurredFrom: from.value?.startsAt ?? null,
    occurredBefore: to.value?.endsAt ?? null,
    page: page.value,
  };
}

function invertedRangeIssues(
  from: FieldReading<DayWindow | null>,
  to: FieldReading<DayWindow | null>,
): readonly StaffAuditQueryIssue[] {
  if (!from.ok || !to.ok || from.value === null || to.value === null) return [];
  const isInverted =
    from.value.startsAt.getTime() > to.value.startsAt.getTime();
  return isInverted ? [{ field: "range", code: "RANGE_INVERTED" }] : [];
}

function readPage(text: string | null): FieldReading<number> {
  if (isAbsent(text)) return accepted(FIRST_PAGE);
  if (!PAGE_NUMBER_TEXT.test(text)) return refused("page", "NOT_A_PAGE_NUMBER");
  const page = Number(text);
  return page <= MAX_STAFF_AUDIT_PAGE
    ? accepted(page)
    : refused("page", "NOT_A_PAGE_NUMBER");
}

function readAction(text: string | null): FieldReading<string | null> {
  if (isAbsent(text)) return accepted(null);
  return isStaffAuditAction(text)
    ? accepted(text)
    : refused("action", "UNKNOWN_VALUE");
}

function readActor(text: string | null): FieldReading<string | null> {
  if (isAbsent(text)) return accepted(null);
  return isAccountId(text)
    ? accepted(text)
    : refused("actor", "NOT_AN_ACCOUNT_ID");
}

function readDay(
  field: "from" | "to",
  text: string | null,
): FieldReading<DayWindow | null> {
  if (isAbsent(text)) return accepted(null);
  const parts = DAY_TEXT.exec(text);
  if (parts === null) return refused(field, "NOT_A_DATE");
  const [year, month, day] = parts.slice(1).map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return refused(field, "NOT_A_DATE");
  }
  if (year < EARLIEST_AUDIT_FILTER_YEAR || year > LATEST_AUDIT_FILTER_YEAR) {
    return refused(field, "DATE_OUT_OF_RANGE");
  }
  if (!isRealDay(year, month, day)) return refused(field, "NOT_A_DATE");
  return accepted(dayWindowOf(year, month, day));
}

/** Whether the calendar holds that day: February 30 and month 13 roll over in `Date.UTC`, so the result is read back. */
function isRealDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Noon UTC is 14:00 or 15:00 in Chisinau on the same date, whichever offset applies, so it names the day safely. */
function dayWindowOf(year: number, month: number, day: number): DayWindow {
  const { startsAt, endsAt } = chisinauDayOf(
    new Date(Date.UTC(year, month - 1, day, NOON_UTC_HOUR)),
  );
  return { startsAt, endsAt };
}

function isAbsent(text: string | null): text is null | "" {
  return text === null || text === "";
}

function accepted<Value>(value: Value): FieldReading<Value> {
  return { ok: true, value };
}

function refused(
  field: StaffAuditQueryField,
  code: StaffAuditQueryRefusalCode,
): FieldReading<never> {
  return { ok: false, issue: { field, code } };
}

function issueOf(
  reading: FieldReading<unknown>,
): readonly StaffAuditQueryIssue[] {
  return reading.ok ? [] : [reading.issue];
}
