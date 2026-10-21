"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  readStaffKitchenQuery,
  type RequestStatus,
  type StaffKitchenSegment,
} from "@lemnaria/configurator-domain";

import {
  classifySignedInAnswer,
  rateLimitNoticeOf,
} from "@/account/account-answer";
import { NO_REFERRER_POLICY } from "@/account/send-account-request";
import type { AccountRateLimitNotice } from "@/i18n/content";

import { raiseStaffSessionExpired } from "./staff-session-expiry";
import type {
  StaffKitchenListWire,
  StaffListedKitchenWire,
} from "./staff-kitchens-wire-contract";
import { staffKitchenListFrom } from "./staff-kitchens-wire-reading";

// The staff list of every client's kitchens (Lot 3 frames S2A to S2F). The filters live in this component's state and
// nowhere else: the address, the browser's storage and the log never hold a search, because it is a client's name or
// address.
//
// Requests are made from the person's actions (the first draw, a filter, the settled search, Enter, a page, "Încearcă din
// nou"), never from an effect that watches the query, and nothing is ever asked again on its own: a `429` or `503` waits
// for the person. A newer request aborts the one before it, and an answer that is not the newest one's is dropped. A
// refused session is not a failure of the list: the staff frame tells it, the list stays as it is, and the request that was
// refused is made again once the person has said they are signed in.

/** The pause after the last keystroke before the typed search is asked for. */
export const SEARCH_SETTLE_DELAY_MS = 500;

const STAFF_KITCHENS_ENDPOINT = "/api/staff/kitchens";
const FIRST_PAGE = 1;

export interface StaffKitchenFilters {
  readonly segment: StaffKitchenSegment;
  /** Held only under "sent": the other segments have no request to hold a status. */
  readonly status: RequestStatus | null;
  /** What the box holds now, before it has settled. */
  readonly searchText: string;
}

/** What one request asked for. The search is trimmed and `null` for none. */
interface StaffListQuery {
  readonly segment: StaffKitchenSegment;
  readonly status: RequestStatus | null;
  readonly search: string | null;
  readonly page: number;
}

/** Why the typed search was not asked for. Nothing is sent for it. */
export type SearchProblem = "too-long" | "refused";

/** Why a page could not be had, as the screen tells it. */
export type ListFailure =
  | { readonly kind: "unavailable" }
  | { readonly kind: "offline" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "failed" };

/** A new object for every page appended, so focus moves once per page. */
export interface RowFocusRequest {
  readonly rowId: string;
}

export interface PageLanding {
  readonly page: number;
}

/** The rows on screen: one page, or, on a phone, the pages loaded one after another. */
export interface StaffKitchensListing {
  /** The query that produced the newest page, so the screen can tell an empty list from an empty search. */
  readonly search: string | null;
  readonly segment: StaffKitchenSegment;
  readonly status: RequestStatus | null;
  readonly total: number;
  readonly pageSize: number;
  readonly firstPage: number;
  readonly lastPage: number;
  readonly rows: readonly StaffListedKitchenWire[];
  /** When the newest page was read: the moment "modified 2 days ago" is told against. */
  readonly readAtMs: number;
  readonly focusRequest: RowFocusRequest | undefined;
  /** A new object when the page the person chose by number has landed, so focus moves once; `undefined` for every
   *  other page, whatever replaced or outlived the jump. */
  readonly landedJump?: PageLanding | undefined;
}

export type MoreState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly failure: ListFailure };

export type StaffKitchensState =
  | { readonly phase: "loading" }
  | { readonly phase: "failed"; readonly failure: ListFailure }
  | { readonly phase: "forbidden" }
  | {
      readonly phase: "ready";
      readonly listing: StaffKitchensListing;
      readonly more: MoreState;
    };

export interface StaffKitchens {
  readonly filters: StaffKitchenFilters;
  readonly searchProblem: SearchProblem | undefined;
  readonly state: StaffKitchensState;
  readonly chooseSegment: (segment: StaffKitchenSegment) => void;
  readonly chooseStatus: (status: RequestStatus | null) => void;
  readonly typeSearch: (text: string) => void;
  /** Enter: the typed search is asked for now. */
  readonly submitSearch: () => void;
  readonly clearSearch: () => void;
  readonly goToPage: (page: number) => void;
  /** "Încarcă mai multe". A press while a page is out, or with no page left, does nothing. */
  readonly loadMore: () => void;
  /** "Încearcă din nou" after the first page could not be had. */
  readonly retry: () => void;
}

/** `jump` is a page chosen by number; `correct` is the one request that follows a jump past the end of a list that
 *  shrank. Both draw one page in place of the rows, as `replace` does, and both land. */
type ReadMode = "first" | "replace" | "append" | "jump" | "correct";

/** What each way of reading does: whether the rows give way to the loading state, whether the page landed on takes the
 *  person's focus, and whether an answer past the end of a shrunk list is corrected. The first read finds the screen
 *  already loading, and an appended page keeps the rows. */
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
  | { readonly kind: "page"; readonly list: StaffKitchenListWire }
  | { readonly kind: "failed"; readonly failure: ListFailure }
  | { readonly kind: "forbidden" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "aborted" };

const INITIAL_FILTERS: StaffKitchenFilters = {
  segment: "sent",
  status: null,
  searchText: "",
};

const INITIAL_QUERY: StaffListQuery = {
  segment: "sent",
  status: null,
  search: null,
  page: FIRST_PAGE,
};

const IDLE: MoreState = { kind: "idle" };

/** What is running: the request that may still answer, and the pause the typed search waits out. */
interface Flight {
  controller: AbortController | undefined;
  settleTimer: ReturnType<typeof setTimeout> | undefined;
}

export function useStaffKitchens(): StaffKitchens {
  const [filters, setFilters] = useState<StaffKitchenFilters>(INITIAL_FILTERS);
  const [searchProblem, setSearchProblem] = useState<SearchProblem>();
  const [state, setState] = useState<StaffKitchensState>({ phase: "loading" });
  const filtersRef = useRef(INITIAL_FILTERS);
  const queryRef = useRef(INITIAL_QUERY);
  const flightRef = useRef<Flight>({
    controller: undefined,
    settleTimer: undefined,
  });

  const setFiltersNow = useCallback((next: StaffKitchenFilters) => {
    filtersRef.current = next;
    setFilters(next);
  }, []);

  const read = useCallback(function read(
    query: StaffListQuery,
    mode: ReadMode,
  ): void {
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
      if (mode === "append" && step.kind === "page") {
        queryRef.current = query;
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
  }, []);

  useEffect(() => {
    const flight = flightRef.current;
    read(INITIAL_QUERY, "first");
    return () => {
      flight.controller?.abort();
      clearTimeout(flight.settleTimer);
    };
  }, [read]);

  const stopSettling = useCallback(() => {
    clearTimeout(flightRef.current.settleTimer);
    flightRef.current.settleTimer = undefined;
  }, []);

  /** Asks for `text` as the search unless it is the one already shown or the server would refuse it. */
  const settleSearch = useCallback(
    (text: string) => {
      stopSettling();
      const problem = problemOfSearch(text);
      setSearchProblem(problem);
      if (problem !== undefined) return;
      const search = searchOf(text);
      if (search === queryRef.current.search) return;
      read({ ...queryRef.current, search, page: FIRST_PAGE }, "replace");
    },
    [read, stopSettling],
  );

  /** The search a change of segment or status goes out with: the typed one if it is askable, else the last settled. */
  const searchForNewQuery = useCallback((): string | null => {
    stopSettling();
    const { searchText } = filtersRef.current;
    const problem = problemOfSearch(searchText);
    setSearchProblem(problem);
    return problem === undefined
      ? searchOf(searchText)
      : queryRef.current.search;
  }, [stopSettling]);

  const chooseSegment = useCallback(
    (segment: StaffKitchenSegment) => {
      if (segment === filtersRef.current.segment) return;
      setFiltersNow({ ...filtersRef.current, segment, status: null });
      read(
        {
          segment,
          status: null,
          search: searchForNewQuery(),
          page: FIRST_PAGE,
        },
        "replace",
      );
    },
    [read, searchForNewQuery, setFiltersNow],
  );

  const chooseStatus = useCallback(
    (status: RequestStatus | null) => {
      const { segment } = filtersRef.current;
      if (segment !== "sent" || status === filtersRef.current.status) return;
      setFiltersNow({ ...filtersRef.current, status });
      read(
        { segment, status, search: searchForNewQuery(), page: FIRST_PAGE },
        "replace",
      );
    },
    [read, searchForNewQuery, setFiltersNow],
  );

  const typeSearch = useCallback(
    (text: string) => {
      setFiltersNow({ ...filtersRef.current, searchText: text });
      stopSettling();
      flightRef.current.settleTimer = setTimeout(() => {
        settleSearch(text);
      }, SEARCH_SETTLE_DELAY_MS);
    },
    [setFiltersNow, settleSearch, stopSettling],
  );

  const submitSearch = useCallback(() => {
    settleSearch(filtersRef.current.searchText);
  }, [settleSearch]);

  const clearSearch = useCallback(() => {
    setFiltersNow({ ...filtersRef.current, searchText: "" });
    settleSearch("");
  }, [setFiltersNow, settleSearch]);

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
    searchProblem,
    state,
    chooseSegment,
    chooseStatus,
    typeSearch,
    submitSearch,
    clearSearch,
    goToPage,
    loadMore,
    retry,
  };
}

function withMore(
  more: MoreState,
): (current: StaffKitchensState) => StaffKitchensState {
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
  readonly current: StaffKitchensState;
  readonly step: Exclude<PageStep, { kind: "sign-in" | "aborted" }>;
  readonly query: StaffListQuery;
  readonly mode: ReadMode;
  /** Taken when the answer came, not inside the update, which React may run twice. */
  readonly readAtMs: number;
}): StaffKitchensState {
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
            ? appended(current.listing, step.list, readAtMs)
            : firstListing({ list: step.list, query, mode, readAtMs }),
        more: IDLE,
      };
  }
}

function firstListing({
  list,
  query,
  mode,
  readAtMs,
}: {
  readonly list: StaffKitchenListWire;
  readonly query: StaffListQuery;
  readonly mode: ReadMode;
  readonly readAtMs: number;
}): StaffKitchensListing {
  return {
    search: query.search,
    segment: query.segment,
    status: query.status,
    total: list.total,
    pageSize: list.pageSize,
    firstPage: list.page,
    lastPage: list.page,
    rows: list.kitchens,
    readAtMs,
    focusRequest: undefined,
    landedJump: MODE_RULES[mode].lands ? { page: list.page } : undefined,
  };
}

/** The number of pages a list of `total` kitchens makes: at least one, so an empty list still has a first page. */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * The last page that exists, when the page asked for is past the end of a list that has shrunk since the person saw
 * it (a client deleted a kitchen): the answer holds no rows under a count that is not nought. It is asked for once, and
 * only after a page was chosen by number; a correction is never itself corrected.
 */
function pageAfterTheEnd(step: PageStep, mode: ReadMode): number | undefined {
  if (step.kind !== "page" || !MODE_RULES[mode].isCorrectable) {
    return undefined;
  }
  const { list } = step;
  const lastPage = pageCountOf(list.total, list.pageSize);
  const isPastTheEnd =
    list.kitchens.length === 0 && list.total > 0 && list.page > lastPage;
  return isPastTheEnd ? lastPage : undefined;
}

/** The shown pages with the next one after them. A kitchen that moved between two requests is shown once. */
function appended(
  listing: StaffKitchensListing,
  list: StaffKitchenListWire,
  readAtMs: number,
): StaffKitchensListing {
  const shownIds = new Set(listing.rows.map(({ id }) => id));
  const added = list.kitchens.filter(({ id }) => !shownIds.has(id));
  const focused = added[0] ?? listing.rows.at(-1);
  return {
    ...listing,
    total: list.total,
    pageSize: list.pageSize,
    lastPage: list.page,
    rows: [...listing.rows, ...added],
    readAtMs,
    focusRequest: focused === undefined ? undefined : { rowId: focused.id },
    landedJump: undefined,
  };
}

function searchOf(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** What the server would say of this search, found out before anything is sent. The server counts code points after
 *  composing the text, which a text input's own length limit does not. */
function problemOfSearch(text: string): SearchProblem | undefined {
  const reading = readStaffKitchenQuery({ q: text });
  if (reading.ok) return undefined;
  const refusedSearch = reading.issues.find(({ field }) => field === "q");
  if (refusedSearch === undefined) return undefined;
  return refusedSearch.code === "TOO_LONG" ? "too-long" : "refused";
}

async function readPage(
  query: StaffListQuery,
  signal: AbortSignal,
): Promise<PageStep> {
  try {
    const response = await fetch(addressOf(query), {
      method: "GET",
      referrerPolicy: NO_REFERRER_POLICY,
      signal,
    });
    const body = await readJsonOrNothing(response);
    if (signal.aborted) return { kind: "aborted" };
    return stepOf({
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body,
    });
  } catch {
    return signal.aborted
      ? { kind: "aborted" }
      : { kind: "failed", failure: { kind: "offline" } };
  }
}

function addressOf(query: StaffListQuery): string {
  const members = new URLSearchParams({ segment: query.segment });
  if (query.status !== null) members.set("status", query.status);
  if (query.search !== null) members.set("q", query.search);
  members.set("page", String(query.page));
  return `${STAFF_KITCHENS_ENDPOINT}?${members.toString()}`;
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function stepOf(
  answer: Parameters<typeof classifySignedInAnswer>[1],
): PageStep {
  const outcome = classifySignedInAnswer("kitchens", answer);
  switch (outcome.kind) {
    case "received": {
      const list = staffKitchenListFrom(outcome.body);
      return list === undefined
        ? failedStep({ kind: "failed" })
        : { kind: "page", list };
    }
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return { kind: "forbidden" };
    case "rate-limited":
      return failedStep({
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, Date.now()),
      });
    case "unavailable":
      return failedStep({ kind: "unavailable" });
    default:
      return failedStep({ kind: "failed" });
  }
}

function failedStep(failure: ListFailure): PageStep {
  return { kind: "failed", failure };
}
