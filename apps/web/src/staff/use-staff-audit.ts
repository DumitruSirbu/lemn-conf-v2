"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isAccountId,
  readStaffAuditEntry,
  type StaffAuditAction,
} from "@lemnaria/configurator-domain";

import { classifySignedInAnswer } from "@/account/account-answer";

import { raiseStaffSessionExpired } from "./staff-session-expiry";
import {
  askStaffRoute,
  failureOf,
  type StaffReadFailure,
} from "./staff-read-request";
import { isInstant, ownValueOf } from "./staff-kitchens-wire-reading";
import type {
  StaffAuditActorWire,
  StaffAuditEntryWire,
  StaffAuditEventWire,
  StaffAuditKitchenWire,
  StaffAuditPageWire,
} from "./staff-kitchens-wire-contract";
import { pageCountOf } from "./use-staff-kitchens";

// The audit log of the staff (Lot 3 frames S8A to S8E). The filters live in this component's state and nowhere else:
// the address, the browser's storage and the log never hold them, because a person and a day are what staff were doing.
//
// Requests are made from the person's actions (the first draw, a filter, a page, "Încearcă din nou"), never from an
// effect that watches the filters, and nothing is ever asked again on its own: a `429` or `503` waits for the person.
// Every page the server serves is itself a row of the log (ADR 0173), so a request that nobody asked for would write one.
// A newer request aborts the one before it, and an answer that is not the newest one's is dropped. A refused session is
// not a failure of the log: the staff frame tells it, the page stays as it is, and the request that was refused is made
// again once the person has said they are signed in.

const STAFF_AUDIT_ENDPOINT = "/api/staff/audit";
const FIRST_PAGE = 1;

/** The first and last year a day filter may name: the server refuses any other (`DATE_OUT_OF_RANGE`), so the page does
 *  not send one. Kept equal to `lib/server/staff/staff-audit-query.ts` by a test. */
export const EARLIEST_FILTER_YEAR = 2000;
export const LATEST_FILTER_YEAR = 9998;

/** `YYYY-MM-DD`: what a date field holds, and what the server takes for a Chișinău day. */
const DAY_TEXT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/** What the four controls hold now. A day is `""` for none. */
export interface StaffAuditFilters {
  readonly actorId: string | null;
  readonly action: StaffAuditAction | null;
  readonly from: string;
  readonly to: string;
}

/** What one request asked for. */
export interface StaffAuditQuery {
  readonly actorId: string | null;
  readonly action: StaffAuditAction | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly page: number;
}

/** Why the days were not asked for. Nothing is sent for them. */
export type DateProblem =
  | { readonly kind: "invalid-day"; readonly field: "from" | "to" }
  | { readonly kind: "inverted" };

/** A staff member the "Persoană" menu offers: seen in a row, and shown by the address the row had. */
export interface StaffAuditActorOption {
  readonly id: string;
  readonly email: string;
}

export type AuditFailure = StaffReadFailure;

export interface RowFocusRequest {
  readonly eventId: string;
}

export interface PageLanding {
  readonly page: number;
}

/** The rows on screen: one page, or, on a phone, the pages loaded one after another. */
export interface StaffAuditListing {
  /** What the newest page was asked with, so the screen can tell an empty log from filters that matched nothing. */
  readonly query: StaffAuditQuery;
  readonly total: number;
  readonly pageSize: number;
  readonly firstPage: number;
  readonly lastPage: number;
  readonly events: readonly StaffAuditEventWire[];
  /** When the newest page was read: the moment "2 days ago" is told against. */
  readonly readAtMs: number;
  readonly focusRequest: RowFocusRequest | undefined;
  /** A new object when the page the person chose by number has landed, so focus moves once. */
  readonly landedJump?: PageLanding | undefined;
}

export type MoreState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly failure: AuditFailure };

export type StaffAuditState =
  | { readonly phase: "loading" }
  | { readonly phase: "failed"; readonly failure: AuditFailure }
  | { readonly phase: "forbidden" }
  | {
      readonly phase: "ready";
      readonly listing: StaffAuditListing;
      readonly more: MoreState;
    };

export interface StaffAudit {
  readonly filters: StaffAuditFilters;
  readonly dateProblem: DateProblem | undefined;
  /** Every staff member seen in any row so far, so choosing one does not take the others from the menu. */
  readonly actors: readonly StaffAuditActorOption[];
  readonly state: StaffAuditState;
  readonly chooseActor: (actorId: string | null) => void;
  readonly chooseAction: (action: StaffAuditAction | null) => void;
  readonly chooseFrom: (day: string) => void;
  readonly chooseTo: (day: string) => void;
  readonly clearFilters: () => void;
  readonly goToPage: (page: number) => void;
  /** "Încarcă mai multe". A press while a page is out, or with no page left, does nothing. */
  readonly loadMore: () => void;
  /** "Încearcă din nou" after a page could not be had. */
  readonly retry: () => void;
}

/** `jump` is a page chosen by number; `correct` is the one request that follows a jump past the end of a log that has
 *  shrunk. Both draw one page in place of the rows, and both land. */
type ReadMode = "first" | "replace" | "append" | "jump" | "correct";

const MODE_RULES: Readonly<
  Record<
    ReadMode,
    {
      readonly showsLoading: boolean;
      readonly lands: boolean;
      readonly isCorrectable: boolean;
    }
  >
> = {
  first: { showsLoading: false, lands: false, isCorrectable: false },
  replace: { showsLoading: true, lands: false, isCorrectable: true },
  jump: { showsLoading: true, lands: true, isCorrectable: true },
  correct: { showsLoading: true, lands: true, isCorrectable: false },
  append: { showsLoading: false, lands: false, isCorrectable: false },
};

type PageStep =
  | { readonly kind: "page"; readonly log: StaffAuditPageWire }
  | { readonly kind: "failed"; readonly failure: AuditFailure }
  | { readonly kind: "forbidden" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "aborted" };

const NO_FILTERS: StaffAuditFilters = {
  actorId: null,
  action: null,
  from: "",
  to: "",
};

const INITIAL_QUERY: StaffAuditQuery = {
  actorId: null,
  action: null,
  from: null,
  to: null,
  page: FIRST_PAGE,
};

const IDLE: MoreState = { kind: "idle" };

export function useStaffAudit(): StaffAudit {
  const [filters, setFilters] = useState<StaffAuditFilters>(NO_FILTERS);
  const [dateProblem, setDateProblem] = useState<DateProblem>();
  const [actors, setActors] = useState<readonly StaffAuditActorOption[]>([]);
  const [state, setState] = useState<StaffAuditState>({ phase: "loading" });
  const filtersRef = useRef(NO_FILTERS);
  const queryRef = useRef(INITIAL_QUERY);
  const flightRef = useRef<{ controller: AbortController | undefined }>({
    controller: undefined,
  });
  const knownActorsRef = useRef(new Map<string, string>());

  const rememberActors = useCallback(
    (events: readonly StaffAuditEventWire[]) => {
      const known = knownActorsRef.current;
      let hasChanged = false;
      for (const { actor } of events) {
        if (actor.email === null || known.get(actor.id) === actor.email)
          continue;
        known.set(actor.id, actor.email);
        hasChanged = true;
      }
      if (hasChanged) setActors(optionsOf(known));
    },
    [],
  );

  const read = useCallback(
    function read(query: StaffAuditQuery, mode: ReadMode): void {
      const flight = flightRef.current;
      flight.controller?.abort();
      const controller = new AbortController();
      flight.controller = controller;
      if (mode !== "append") queryRef.current = query;
      if (MODE_RULES[mode].showsLoading) setState({ phase: "loading" });
      if (mode === "append") setState(withMore({ kind: "loading" }));
      void readPage(query, controller.signal).then((step) => {
        if (step.kind === "aborted") return;
        if (step.kind === "sign-in") {
          raiseStaffSessionExpired({
            askAgain: () => {
              read(query, mode);
            },
          });
          return;
        }
        if (step.kind === "page") {
          if (mode === "append") queryRef.current = query;
          rememberActors(step.log.events);
        }
        const lastPage = pageAfterTheEnd(step, mode);
        if (lastPage !== undefined) {
          read({ ...query, page: lastPage }, "correct");
          return;
        }
        const readAtMs = Date.now();
        setState((current) =>
          stateAfter({ current, step, query, mode, readAtMs }),
        );
      });
    },
    [rememberActors],
  );

  useEffect(() => {
    const flight = flightRef.current;
    read(INITIAL_QUERY, "first");
    return () => {
      flight.controller?.abort();
    };
  }, [read]);

  /** Shows `next` in the controls and, unless the days are unaskable, asks for its first page. */
  const applyFilters = useCallback(
    (next: StaffAuditFilters) => {
      filtersRef.current = next;
      setFilters(next);
      const problem = problemOfDays(next);
      setDateProblem(problem);
      if (problem !== undefined) return;
      read(queryOf(next, FIRST_PAGE), "replace");
    },
    [read],
  );

  const chooseActor = useCallback(
    (actorId: string | null) => {
      applyFilters({ ...filtersRef.current, actorId });
    },
    [applyFilters],
  );

  const chooseAction = useCallback(
    (action: StaffAuditAction | null) => {
      applyFilters({ ...filtersRef.current, action });
    },
    [applyFilters],
  );

  const chooseFrom = useCallback(
    (from: string) => {
      applyFilters({ ...filtersRef.current, from });
    },
    [applyFilters],
  );

  const chooseTo = useCallback(
    (to: string) => {
      applyFilters({ ...filtersRef.current, to });
    },
    [applyFilters],
  );

  const clearFilters = useCallback(() => {
    applyFilters(NO_FILTERS);
  }, [applyFilters]);

  const goToPage = useCallback(
    (page: number) => {
      read({ ...queryRef.current, page }, "jump");
    },
    [read],
  );

  const loadMore = useCallback(() => {
    if (state.phase !== "ready" || state.more.kind === "loading") return;
    const { listing } = state;
    if (listing.lastPage * listing.pageSize >= listing.total) return;
    read({ ...queryRef.current, page: listing.lastPage + 1 }, "append");
  }, [read, state]);

  const retry = useCallback(() => {
    read(queryRef.current, "replace");
  }, [read]);

  return {
    filters,
    dateProblem,
    actors,
    state,
    chooseActor,
    chooseAction,
    chooseFrom,
    chooseTo,
    clearFilters,
    goToPage,
    loadMore,
    retry,
  };
}

function optionsOf(
  known: ReadonlyMap<string, string>,
): readonly StaffAuditActorOption[] {
  return [...known]
    .map(([id, email]) => ({ id, email }))
    .sort((first, second) => first.email.localeCompare(second.email));
}

function queryOf(filters: StaffAuditFilters, page: number): StaffAuditQuery {
  return {
    actorId: filters.actorId,
    action: filters.action,
    from: filters.from === "" ? null : filters.from,
    to: filters.to === "" ? null : filters.to,
    page,
  };
}

/** Whether the query holds any filter: an empty answer to it is "no results", not an empty log. */
export function hasFilters(query: StaffAuditQuery): boolean {
  return (
    query.actorId !== null ||
    query.action !== null ||
    query.from !== null ||
    query.to !== null
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The days

/**
 * What the server would say of these days, found out before anything is sent: a day that is not a day of the calendar
 * or lies outside the years the log keeps, and a range that ends before it begins. The first problem found is the one
 * told. A day left empty is no filter.
 */
export function problemOfDays({
  from,
  to,
}: Pick<StaffAuditFilters, "from" | "to">): DateProblem | undefined {
  if (!isAskableDay(from)) return { kind: "invalid-day", field: "from" };
  if (!isAskableDay(to)) return { kind: "invalid-day", field: "to" };
  const isInverted = from !== "" && to !== "" && from > to;
  return isInverted ? { kind: "inverted" } : undefined;
}

function isAskableDay(text: string): boolean {
  if (text === "") return true;
  const parts = DAY_TEXT.exec(text);
  if (parts === null) return false;
  const [year, month, day] = parts.slice(1).map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  if (year < EARLIEST_FILTER_YEAR || year > LATEST_FILTER_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// ---------------------------------------------------------------------------------------------------------------------
// The state a request leaves

function withMore(
  more: MoreState,
): (current: StaffAuditState) => StaffAuditState {
  return (current) =>
    current.phase === "ready" ? { ...current, more } : current;
}

/** The state an answer leaves. A page that could not be had leaves the pages already shown where they are. */
function stateAfter({
  current,
  step,
  query,
  mode,
  readAtMs,
}: {
  readonly current: StaffAuditState;
  readonly step: Exclude<PageStep, { kind: "sign-in" | "aborted" }>;
  readonly query: StaffAuditQuery;
  readonly mode: ReadMode;
  /** Taken when the answer came, not inside the update, which React may run twice. */
  readonly readAtMs: number;
}): StaffAuditState {
  switch (step.kind) {
    case "forbidden":
      return { phase: "forbidden" };
    case "failed":
      return mode === "append"
        ? withMore({ kind: "failed", failure: step.failure })(current)
        : { phase: "failed", failure: step.failure };
    case "page":
      return {
        phase: "ready",
        listing:
          mode === "append" && current.phase === "ready"
            ? appended(current.listing, step.log, query, readAtMs)
            : firstListing({ log: step.log, query, mode, readAtMs }),
        more: IDLE,
      };
  }
}

function firstListing({
  log,
  query,
  mode,
  readAtMs,
}: {
  readonly log: StaffAuditPageWire;
  readonly query: StaffAuditQuery;
  readonly mode: ReadMode;
  readonly readAtMs: number;
}): StaffAuditListing {
  return {
    query,
    total: log.total,
    pageSize: log.pageSize,
    firstPage: log.page,
    lastPage: log.page,
    events: log.events,
    readAtMs,
    focusRequest: undefined,
    landedJump: MODE_RULES[mode].lands ? { page: log.page } : undefined,
  };
}

/**
 * The last page that exists, when the page asked for is past the end of a log that has shrunk since the person saw it
 * (or that they typed a page past): the answer holds no rows under a count that is not nought. It is asked for once,
 * and a correction is never itself corrected.
 */
function pageAfterTheEnd(step: PageStep, mode: ReadMode): number | undefined {
  if (step.kind !== "page" || !MODE_RULES[mode].isCorrectable) {
    return undefined;
  }
  const { log } = step;
  const lastPage = pageCountOf(log.total, log.pageSize);
  const isPastTheEnd =
    log.events.length === 0 && log.total > 0 && log.page > lastPage;
  return isPastTheEnd ? lastPage : undefined;
}

/** The shown pages with the next one after them. A row that moved between two requests is shown once: the log grows at
 *  its top, and each page served adds a row there. */
function appended(
  listing: StaffAuditListing,
  log: StaffAuditPageWire,
  query: StaffAuditQuery,
  readAtMs: number,
): StaffAuditListing {
  const shownIds = new Set(listing.events.map(({ id }) => id));
  const added = log.events.filter(({ id }) => !shownIds.has(id));
  const focused = added[0] ?? listing.events.at(-1);
  return {
    ...listing,
    query,
    total: log.total,
    pageSize: log.pageSize,
    lastPage: log.page,
    events: [...listing.events, ...added],
    readAtMs,
    focusRequest: focused === undefined ? undefined : { eventId: focused.id },
    landedJump: undefined,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The request

async function readPage(
  query: StaffAuditQuery,
  signal: AbortSignal,
): Promise<PageStep> {
  const reading = await askStaffRoute(addressOf(query), signal);
  switch (reading.kind) {
    case "aborted":
      return { kind: "aborted" };
    case "offline":
      return { kind: "failed", failure: { kind: "offline" } };
    case "answered":
      return stepOf(reading.answer);
  }
}

function addressOf(query: StaffAuditQuery): string {
  const members = new URLSearchParams({ page: String(query.page) });
  if (query.action !== null) members.set("action", query.action);
  if (query.actorId !== null) members.set("actor", query.actorId);
  if (query.from !== null) members.set("from", query.from);
  if (query.to !== null) members.set("to", query.to);
  return `${STAFF_AUDIT_ENDPOINT}?${members.toString()}`;
}

function stepOf(
  answer: Parameters<typeof classifySignedInAnswer>[1],
): PageStep {
  // The staff list's flow is the one that reads `200` as data and has no refusal of a kitchen; the log asks no more of it.
  const outcome = classifySignedInAnswer("kitchens", answer);
  switch (outcome.kind) {
    case "received": {
      const log = staffAuditPageFrom(outcome.body);
      return log === undefined
        ? { kind: "failed", failure: { kind: "failed" } }
        : { kind: "page", log };
    }
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return { kind: "forbidden" };
    default:
      return { kind: "failed", failure: failureOf(outcome) };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading the body

/**
 * The page the body holds, or nothing when any part of it is not what the contract says. Strict about the shape of
 * every row and lenient about what a row's action means: a row whose action or detail this build's domain does not
 * accept is still a row, told as unrecognised with its code as text, never dropped and never a failure of the page.
 */
export function staffAuditPageFrom(
  body: unknown,
): StaffAuditPageWire | undefined {
  const total = ownValueOf(body, "total");
  const page = ownValueOf(body, "page");
  const pageSize = ownValueOf(body, "pageSize");
  const rawEvents = ownValueOf(body, "events");
  if (!isCount(total) || !isPositiveCount(page)) return undefined;
  if (!isPositiveCount(pageSize) || !Array.isArray(rawEvents)) return undefined;
  if (rawEvents.length > pageSize) return undefined;
  const events = (rawEvents as readonly unknown[]).map(eventFrom);
  if (!events.every(isEvent)) return undefined;
  return { total, page, pageSize, events: withoutRepeats(events) };
}

function eventFrom(raw: unknown): StaffAuditEventWire | undefined {
  const id = ownValueOf(raw, "id");
  const occurredAt = ownValueOf(raw, "occurredAt");
  const entry = entryFrom(ownValueOf(raw, "entry"));
  const actor = actorFrom(ownValueOf(raw, "actor"));
  const subject = subjectFrom(ownValueOf(raw, "subject"));
  const kitchen = kitchenFrom(ownValueOf(raw, "kitchen"));
  if (typeof id !== "string" || id === "" || !isInstant(occurredAt)) {
    return undefined;
  }
  if (entry === undefined || actor === undefined) return undefined;
  if (subject === undefined || kitchen === undefined) return undefined;
  return {
    id,
    occurredAt,
    entry,
    actor,
    subject: subject.value,
    kitchen: kitchen.value,
  };
}

/** A recognised row is believed only as far as the domain reads it: the domain is asked again, so a body that calls a
 *  row recognised with a code or a detail it refuses is told as unrecognised. */
function entryFrom(raw: unknown): StaffAuditEntryWire | undefined {
  const kind = ownValueOf(raw, "kind");
  const action = ownValueOf(raw, "action");
  if (typeof action !== "string") return undefined;
  if (kind === "unrecognised") return { kind, action };
  if (kind !== "recognised") return undefined;
  const reading = readStaffAuditEntry(action, ownValueOf(raw, "detail"));
  return reading.ok
    ? { kind: "recognised", ...reading.entry }
    : { kind: "unrecognised", action };
}

function actorFrom(raw: unknown): StaffAuditActorWire | undefined {
  const id = ownValueOf(raw, "id");
  const email = ownValueOf(raw, "email");
  if (typeof id !== "string" || !isAccountId(id)) return undefined;
  if (email !== null && typeof email !== "string") return undefined;
  return { id, email };
}

function subjectFrom(
  raw: unknown,
): { readonly value: StaffAuditEventWire["subject"] } | undefined {
  if (raw === null) return { value: null };
  const email = ownValueOf(raw, "email");
  if (email !== null && typeof email !== "string") return undefined;
  return { value: { email } };
}

function kitchenFrom(
  raw: unknown,
): { readonly value: StaffAuditKitchenWire | null } | undefined {
  if (raw === null) return { value: null };
  const id = ownValueOf(raw, "id");
  const name = ownValueOf(raw, "name");
  if (typeof id !== "string" || id === "") return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  return { value: { id, name } };
}

/** A row named twice in one page is drawn once, where it first stands. */
function withoutRepeats(
  events: readonly StaffAuditEventWire[],
): readonly StaffAuditEventWire[] {
  const seen = new Set<string>();
  return events.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isEvent(
  event: StaffAuditEventWire | undefined,
): event is StaffAuditEventWire {
  return event !== undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveCount(value: unknown): value is number {
  return isCount(value) && value >= FIRST_PAGE;
}
