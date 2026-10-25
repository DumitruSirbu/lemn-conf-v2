import type { StaffAuditAction } from "@lemnaria/configurator-domain";

import type { StaffReadFailure } from "./staff-read-request";
import type {
  StaffAuditEventWire,
  StaffAuditPageWire,
} from "./staff-kitchens-wire-contract";
import { pageCountOf } from "./use-staff-kitchens";

// What the audit page shows of the log and how an answer changes it: the rows on screen, the state around them, and the
// rules by which a page that was asked for becomes the next state. Pure: nothing here asks, waits or remembers.

export const FIRST_PAGE = 1;

/** What one request asked for. */
export interface StaffAuditQuery {
  readonly actorId: string | null;
  readonly action: StaffAuditAction | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly page: number;
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
  /** The last page appended held no row that was not already shown: asking for the one after it would find none either. */
  readonly isExhausted: boolean;
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

/** `jump` is a page chosen by number; `correct` is the one request that follows a jump past the end of a log that has
 *  shrunk. Both draw one page in place of the rows, and both land. */
export type ReadMode = "first" | "replace" | "append" | "jump" | "correct";

export type PageStep =
  | { readonly kind: "page"; readonly log: StaffAuditPageWire }
  | { readonly kind: "failed"; readonly failure: AuditFailure }
  | { readonly kind: "forbidden" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "aborted" };

export type AnsweredStep = Exclude<PageStep, { kind: "sign-in" | "aborted" }>;

export const LOADING: StaffAuditState = { phase: "loading" };
export const NO_MORE_ASKED: MoreState = { kind: "idle" };

export const INITIAL_QUERY: StaffAuditQuery = {
  actorId: null,
  action: null,
  from: null,
  to: null,
  page: FIRST_PAGE,
};

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

/** Whether the rows give way to the skeleton while the page is out. */
export function showsLoadingWhileOut(mode: ReadMode): boolean {
  return MODE_RULES[mode].showsLoading;
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

/** How many rows of the log, counted from the newest, the listing has reached: the rows before its first page and the
 *  distinct rows it shows. Every page served is a row of the log, so the log grows under the person and a row can be
 *  met twice; only a row shown counts, once. */
export function rowsReachedBy(listing: StaffAuditListing): number {
  const before = (listing.firstPage - 1) * listing.pageSize;
  return Math.min(before + listing.events.length, listing.total);
}

/** Whether "Încarcă mai multe" has a page to ask for: the one rule, for the button and for a press of it. */
export function hasMoreRows(listing: StaffAuditListing): boolean {
  const isPageLeft =
    listing.lastPage < pageCountOf(listing.total, listing.pageSize);
  const isRowLeft = rowsReachedBy(listing) < listing.total;
  return isPageLeft && isRowLeft && !listing.isExhausted;
}

export function withMore(
  more: MoreState,
): (current: StaffAuditState) => StaffAuditState {
  return (current) =>
    current.phase === "ready" ? { ...current, more } : current;
}

/** The state an answer leaves. A page that could not be had leaves the pages already shown where they are. */
export function stateAfter({
  current,
  step,
  query,
  mode,
  readAtMs,
}: {
  readonly current: StaffAuditState;
  readonly step: AnsweredStep;
  readonly query: StaffAuditQuery;
  readonly mode: ReadMode;
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
        more: NO_MORE_ASKED,
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
    isExhausted: false,
  };
}

/**
 * The last page that exists, when the page asked for is past the end of a log that has shrunk since the person saw it
 * (or that they typed a page past): the answer holds no rows under a count that is not nought. It is asked for once,
 * and a correction is never itself corrected.
 */
export function pageAfterTheEnd(
  step: PageStep,
  mode: ReadMode,
): number | undefined {
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
    isExhausted: added.length === 0,
  };
}
