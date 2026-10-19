"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AccountRateLimitNotice } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import { rateLimitNoticeOf } from "../account-answer";
import { loginPathWithReason } from "../login-arrival";
import { leaveFor } from "../on-signed-in";
import { sendSignedInRequest } from "../send-account-request";
import {
  kitchensPageFrom,
  type KitchensPage,
  type ListedKitchen,
} from "./kitchens-answer";

// The account's kitchens, read a page at a time (Lot 2 frames A9A to A9C, A9I, A9J). The first page replaces the screen's
// loading state; every later page is appended below the ones already shown, and a page that cannot be had leaves them
// where they are. The person asks for the next page; nothing is loaded on scroll.
//
// A page can come back with nothing to show (the server skips documents it cannot read, and a kitchen already shown can
// reappear) while it still names a next page. Such a page is never drawn: the next is asked for at once, so the person
// is never left at an empty list or a button that adds nothing.

/** The most pages in a row that may add nothing before the chain is given up. A server that keeps answering cursors
 *  without kitchens would otherwise be asked for ever. */
const MAX_CONSECUTIVE_EMPTY_PAGES = 10;

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

/** What the pages shown so far hold. */
export interface Listing {
  readonly kitchens: readonly ListedKitchen[];
  /** The account's count at the first page, including documents the server could not read. It is the line above the
   *  list only while pages remain; the last page replaces it with the kitchens actually loaded. */
  readonly total: number;
  readonly nextCursor: string | undefined;
  /** When the newest page was read: the moment "modified 2 days ago" is told against. */
  readonly readAtMs: number;
  /** The card that takes focus so the person is not left at the button that vanished with the last page: the first
   *  kitchen of the page just appended, or the last one shown when that page added none. */
  readonly focusRequest: CardFocusRequest | undefined;
}

/** A new object for every page appended, so focus moves once per page even when it lands on the same card twice. */
export interface CardFocusRequest {
  readonly kitchenId: string;
}

export type MoreState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly failure: ListFailure };

export type KitchensState =
  | { readonly phase: "loading" }
  | { readonly phase: "failed"; readonly failure: ListFailure }
  | { readonly phase: "forbidden" }
  | {
      readonly phase: "listed";
      readonly listing: Listing;
      readonly more: MoreState;
    };

export interface Kitchens {
  readonly state: KitchensState;
  /** "Încarcă mai multe". A press while a page is out, or with no page left, does nothing. */
  readonly loadMore: () => void;
  /** "Încearcă din nou" after the first page could not be had. */
  readonly retry: () => void;
}

/** What a request for a page came to. */
type PageStep =
  | { readonly kind: "page"; readonly page: KitchensPage }
  /** The chain of empty pages was given up; `page` holds the account's total and the cursor to go on from. */
  | { readonly kind: "stalled"; readonly page: KitchensPage }
  | { readonly kind: "failed"; readonly failure: ListFailure }
  | { readonly kind: "forbidden" }
  | { readonly kind: "sign-in" };

/** A step the screen draws: the person being sent to sign in leaves the document and draws nothing. */
type DrawnStep = Exclude<PageStep, { readonly kind: "sign-in" }>;

/** Which page to ask for, and the kitchens already shown, which a page must add to. */
interface PageRead {
  readonly cursor: string | undefined;
  readonly shownIds: ReadonlySet<string>;
}

const NOTHING_SHOWN: ReadonlySet<string> = new Set();
const IDLE: MoreState = { kind: "idle" };
/** The chain of empty pages was given up: told as a page that could not be had, which the button asks for again. */
const STALLED: MoreState = { kind: "failed", failure: { kind: "failed" } };

export function useKitchens(locale: AppLocale): Kitchens {
  const [state, setState] = useState<KitchensState>({ phase: "loading" });
  const isRequestOutRef = useRef(false);

  const request = useCallback(
    (pageRead: PageRead, settle: (step: DrawnStep) => void) => {
      if (isRequestOutRef.current) return;
      isRequestOutRef.current = true;
      void readUntilKitchensAdded(pageRead).then((step) => {
        isRequestOutRef.current = false;
        if (step.kind === "sign-in") {
          // The document is on its way out; the guard is released but the screen is left as it is.
          leaveFor(loginPathWithReason(locale, "session-expired"));
          return;
        }
        settle(step);
      });
    },
    [locale],
  );

  const loadFirstPage = useCallback(() => {
    request({ cursor: undefined, shownIds: NOTHING_SHOWN }, (step) => {
      setState(firstPageState(step));
    });
  }, [request]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const retry = useCallback(() => {
    setState({ phase: "loading" });
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    if (state.phase !== "listed") return;
    const { nextCursor } = state.listing;
    if (nextCursor === undefined || isRequestOutRef.current) return;
    const shownIds = new Set(state.listing.kitchens.map(({ id }) => id));
    setState({ ...state, more: { kind: "loading" } });
    request({ cursor: nextCursor, shownIds }, (step) => {
      setState((current) => withNextPage(current, step));
    });
  }, [request, state]);

  return { state, loadMore, retry };
}

function firstPageState(step: DrawnStep): KitchensState {
  switch (step.kind) {
    case "page":
      return { phase: "listed", listing: firstListing(step.page), more: IDLE };
    case "stalled":
      return {
        phase: "listed",
        listing: firstListing(step.page),
        more: STALLED,
      };
    case "forbidden":
      return { phase: "forbidden" };
    case "failed":
      return { phase: "failed", failure: step.failure };
  }
}

function firstListing(page: KitchensPage): Listing {
  return {
    kitchens: page.kitchens,
    total: page.total,
    nextCursor: page.nextCursor,
    readAtMs: Date.now(),
    focusRequest: undefined,
  };
}

/** The shown pages with the next one appended, or with the reason it could not be had. A page that repeats a kitchen
 *  (one changed between two requests moves to the front of the order) adds it once. */
function withNextPage(current: KitchensState, step: DrawnStep): KitchensState {
  if (current.phase !== "listed") return current;
  switch (step.kind) {
    case "page":
      return {
        phase: "listed",
        listing: appended(current.listing, step.page),
        more: IDLE,
      };
    case "stalled":
      return {
        phase: "listed",
        listing: { ...current.listing, nextCursor: step.page.nextCursor },
        more: STALLED,
      };
    case "forbidden":
      return { phase: "forbidden" };
    case "failed":
      return {
        ...current,
        more: { kind: "failed", failure: step.failure },
      };
  }
}

function appended(listing: Listing, page: KitchensPage): Listing {
  const added = kitchensNotIn(listing.kitchens, page.kitchens);
  const focused = added[0] ?? listing.kitchens.at(-1);
  return {
    kitchens: [...listing.kitchens, ...added],
    total: listing.total,
    nextCursor: page.nextCursor,
    readAtMs: Date.now(),
    focusRequest: focused === undefined ? undefined : { kitchenId: focused.id },
  };
}

function kitchensNotIn(
  shown: readonly ListedKitchen[],
  candidates: readonly ListedKitchen[],
): readonly ListedKitchen[] {
  const shownIds = new Set(shown.map(({ id }) => id));
  return candidates.filter(({ id }) => !shownIds.has(id));
}

/** The first page that adds a kitchen to the ones shown, or the last page there is. A page that adds none and names a next
 *  one is not an answer: the next is asked for, up to `MAX_CONSECUTIVE_EMPTY_PAGES`. */
async function readUntilKitchensAdded({
  cursor,
  shownIds,
}: PageRead): Promise<PageStep> {
  let emptyPages = 0;
  let cursorToRead = cursor;
  for (;;) {
    const step = await readPage(cursorToRead);
    if (step.kind !== "page") return step;
    const { page } = step;
    const addsKitchen = page.kitchens.some(({ id }) => !shownIds.has(id));
    if (addsKitchen || page.nextCursor === undefined) return step;
    emptyPages += 1;
    if (emptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
      return { kind: "stalled", page };
    }
    cursorToRead = page.nextCursor;
  }
}

async function readPage(cursor: string | undefined): Promise<PageStep> {
  const outcome = await sendSignedInRequest(
    cursor === undefined ? { flow: "kitchens" } : { flow: "kitchens", cursor },
  );
  switch (outcome.kind) {
    case "received":
      return pageStepOf(outcome.body);
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return { kind: "forbidden" };
    case "rate-limited":
      return failed({
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, Date.now()),
      });
    case "unavailable":
      return failed({ kind: "unavailable" });
    case "unanswered":
      return failed({ kind: "offline" });
    default:
      return failed({ kind: "failed" });
  }
}

function pageStepOf(body: unknown): PageStep {
  const page = kitchensPageFrom(body);
  return page === undefined
    ? failed({ kind: "failed" })
    : { kind: "page", page };
}

function failed(failure: ListFailure): PageStep {
  return { kind: "failed", failure };
}
