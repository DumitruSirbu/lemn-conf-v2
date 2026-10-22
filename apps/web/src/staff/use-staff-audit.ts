"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { StaffAuditAction } from "@lemnaria/configurator-domain";

import { problemOfDays, type DateProblem } from "./staff-audit-days";
import {
  FIRST_PAGE,
  INITIAL_QUERY,
  LOADING,
  NO_MORE_ASKED,
  hasMoreRows,
  pageAfterTheEnd,
  showsLoadingWhileOut,
  stateAfter,
  withMore,
  type ReadMode,
  type StaffAuditQuery,
  type StaffAuditState,
} from "./staff-audit-listing";
import { readPage } from "./staff-audit-request";
import { raiseStaffSessionExpired } from "./staff-session-expiry";
import type { StaffAuditEventWire } from "./staff-kitchens-wire-contract";

// The audit log of the staff (Lot 3 frames S8A to S8E). The filters live in this component's state and nowhere else:
// the browser's address bar, history and storage never hold them, because a person and a day are what staff were doing.
// The request itself does carry them, in the API URL's query (actor id, action, days; see `staff-audit-request.ts`).
//
// Requests are made from the person's actions (the first draw, a filter, a page, "Încearcă din nou"), never from an
// effect that watches the filters, and nothing is ever asked again on its own: a `429` or `503` waits for the person.
// Every page the server serves is itself a row of the log (ADR 0173), so a request that nobody asked for would write one.
// A newer request aborts the one before it, and an answer that is not the newest one's is dropped. A refused session is
// not a failure of the log: the staff frame tells it, the page stays as it was, and the request that was refused is made
// again once the person has said they are signed in.
//
// While the days cannot be asked for, the rows on screen are the answer to an older question: the paging and the retry
// do nothing then, so the rows are never read against a person or an action chosen since.

/** What the controls hold now. A day is `""` for none. */
export interface StaffAuditFilters {
  readonly actorId: string | null;
  readonly action: StaffAuditAction | null;
  readonly from: string;
  readonly to: string;
}

/** A staff member the "Persoană" menu offers: seen in a row, and shown by the address the row had. */
export interface StaffAuditActorOption {
  readonly id: string;
  readonly email: string;
}

export interface StaffAudit {
  readonly filters: StaffAuditFilters;
  readonly dateProblem: DateProblem | undefined;
  /** Every staff member seen in any row so far, so choosing one does not take the others from the menu. */
  readonly actors: readonly StaffAuditActorOption[];
  readonly state: StaffAuditState;
  /** Changes the named filters and asks for the first page, unless the days cannot be asked for. */
  readonly patchFilters: (patch: Partial<StaffAuditFilters>) => void;
  readonly clearFilters: () => void;
  readonly goToPage: (page: number) => void;
  /** "Încarcă mai multe". A press while a page is out, or with no page left, does nothing. */
  readonly loadMore: () => void;
  /** "Încearcă din nou" after a page could not be had. */
  readonly retry: () => void;
}

const NO_FILTERS: StaffAuditFilters = {
  actorId: null,
  action: null,
  from: "",
  to: "",
};

export function useStaffAudit(): StaffAudit {
  const reader = useAuditReader();
  const filtering = useAuditFilters(reader.read);
  const paging = useAuditPaging(reader, filtering.hasDateProblem);
  return {
    filters: filtering.filters,
    dateProblem: filtering.dateProblem,
    actors: reader.actors,
    state: reader.state,
    patchFilters: filtering.patchFilters,
    clearFilters: filtering.clearFilters,
    ...paging,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The reading

interface AuditReader {
  readonly state: StaffAuditState;
  readonly actors: readonly StaffAuditActorOption[];
  readonly read: (query: StaffAuditQuery, mode: ReadMode) => void;
  /** What the newest request, or the page on screen, was asked with. */
  readonly newestQuery: () => StaffAuditQuery;
  readonly currentState: () => StaffAuditState;
}

/** Asks for pages, one at a time, and keeps the state the answers leave. */
function useAuditReader(): AuditReader {
  const { state, currentState, showState, restoreSettledState } =
    useAuditState();
  const { actors, rememberActors } = useKnownActors();
  const queryRef = useRef(INITIAL_QUERY);
  const flightRef = useRef<{ controller: AbortController | undefined }>({
    controller: undefined,
  });

  const read = useCallback(
    function read(query: StaffAuditQuery, mode: ReadMode): void {
      const flight = flightRef.current;
      flight.controller?.abort();
      const controller = new AbortController();
      flight.controller = controller;
      if (mode !== "append") queryRef.current = query;
      showState(stateWhileOut(mode));
      void readPage(query, controller.signal).then((step) => {
        if (step.kind === "aborted") return;
        if (step.kind === "sign-in") {
          restoreSettledState();
          raiseStaffSessionExpired({
            askAgain: () => {
              if (!controller.signal.aborted) read(query, mode);
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
        showState((current) =>
          stateAfter({ current, step, query, mode, readAtMs }),
        );
      });
    },
    [rememberActors, restoreSettledState, showState],
  );

  useEffect(() => {
    const flight = flightRef.current;
    read(INITIAL_QUERY, "first");
    return () => {
      flight.controller?.abort();
    };
  }, [read]);

  const newestQuery = useCallback(() => queryRef.current, []);
  return { state, actors, read, newestQuery, currentState };
}

/** What the page shows while a request is out: the rows give way to the skeleton, or, for a next page, say it is coming. */
function stateWhileOut(
  mode: ReadMode,
): (current: StaffAuditState) => StaffAuditState {
  if (mode === "append") return withMore({ kind: "loading" });
  return showsLoadingWhileOut(mode) ? () => LOADING : (current) => current;
}

/**
 * The state, readable at once by the next request (a ref follows every change), and the last one that was not a skeleton.
 * A request that is refused for the session gives the page back that state: the person was looking at rows, and a
 * skeleton would stay under the sheet after the sheet is gone.
 */
function useAuditState() {
  const [state, setState] = useState<StaffAuditState>(LOADING);
  const stateRef = useRef<StaffAuditState>(LOADING);
  const settledRef = useRef<StaffAuditState>(LOADING);

  const showState = useCallback(
    (update: (current: StaffAuditState) => StaffAuditState) => {
      const next = update(stateRef.current);
      stateRef.current = next;
      if (next.phase !== "loading") settledRef.current = next;
      setState(next);
    },
    [],
  );
  const restoreSettledState = useCallback(() => {
    showState(() => withMore(NO_MORE_ASKED)(settledRef.current));
  }, [showState]);
  const currentState = useCallback(() => stateRef.current, []);
  return { state, currentState, showState, restoreSettledState };
}

/** The staff members the rows named, by their latest address, for the "Persoană" menu. */
function useKnownActors() {
  const [actors, setActors] = useState<readonly StaffAuditActorOption[]>([]);
  const knownRef = useRef(new Map<string, string>());

  const rememberActors = useCallback(
    (events: readonly StaffAuditEventWire[]) => {
      const known = knownRef.current;
      let hasChanged = false;
      for (const { actor } of events) {
        if (actor.email === null || known.get(actor.id) === actor.email) {
          continue;
        }
        known.set(actor.id, actor.email);
        hasChanged = true;
      }
      if (hasChanged) setActors(optionsOf(known));
    },
    [],
  );
  return { actors, rememberActors };
}

function optionsOf(
  known: ReadonlyMap<string, string>,
): readonly StaffAuditActorOption[] {
  return [...known]
    .map(([id, email]) => ({ id, email }))
    .sort((first, second) => first.email.localeCompare(second.email));
}

// ---------------------------------------------------------------------------------------------------------------------
// The filters

/** The controls and the days they hold. A change is shown at once and asked for unless the days cannot be. */
function useAuditFilters(read: AuditReader["read"]) {
  const [filters, setFilters] = useState<StaffAuditFilters>(NO_FILTERS);
  const [dateProblem, setDateProblem] = useState<DateProblem>();
  const filtersRef = useRef(NO_FILTERS);
  const problemRef = useRef<DateProblem | undefined>(undefined);

  const applyFilters = useCallback(
    (next: StaffAuditFilters) => {
      const problem = problemOfDays(next);
      filtersRef.current = next;
      problemRef.current = problem;
      setFilters(next);
      setDateProblem(problem);
      if (problem === undefined) read(queryOf(next, FIRST_PAGE), "replace");
    },
    [read],
  );
  const patchFilters = useCallback(
    (patch: Partial<StaffAuditFilters>) => {
      applyFilters({ ...filtersRef.current, ...patch });
    },
    [applyFilters],
  );
  const clearFilters = useCallback(() => {
    applyFilters(NO_FILTERS);
  }, [applyFilters]);
  const hasDateProblem = useCallback(
    () => problemRef.current !== undefined,
    [],
  );

  return { filters, dateProblem, patchFilters, clearFilters, hasDateProblem };
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

// ---------------------------------------------------------------------------------------------------------------------
// The pages

/** The ways on from the rows shown. Each does nothing while the days cannot be asked for. */
function useAuditPaging(
  { read, newestQuery, currentState }: AuditReader,
  hasDateProblem: () => boolean,
) {
  const goToPage = useCallback(
    (page: number) => {
      if (hasDateProblem()) return;
      read({ ...newestQuery(), page }, "jump");
    },
    [hasDateProblem, newestQuery, read],
  );

  const loadMore = useCallback(() => {
    const current = currentState();
    if (hasDateProblem() || current.phase !== "ready") return;
    if (current.more.kind === "loading" || !hasMoreRows(current.listing)) {
      return;
    }
    read({ ...newestQuery(), page: current.listing.lastPage + 1 }, "append");
  }, [currentState, hasDateProblem, newestQuery, read]);

  const retry = useCallback(() => {
    if (hasDateProblem()) return;
    read(newestQuery(), "replace");
  }, [hasDateProblem, newestQuery, read]);

  return { goToPage, loadMore, retry };
}
