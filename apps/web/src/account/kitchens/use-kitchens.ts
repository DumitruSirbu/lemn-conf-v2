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
  /** The account's count at the first page. Later pages do not change it, so the line above the list stays put. */
  readonly total: number;
  readonly nextCursor: string | undefined;
  /** When the newest page was read: the moment "modified 2 days ago" is told against. */
  readonly readAtMs: number;
  /** The first kitchen of the page just appended, which takes focus so the person is not left at the button that
   *  vanished with the last page. */
  readonly focusKitchenId: string | undefined;
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
  | { readonly kind: "failed"; readonly failure: ListFailure }
  | { readonly kind: "forbidden" }
  | { readonly kind: "sign-in" };

/** A step the screen draws: the person being sent to sign in leaves the document and draws nothing. */
type DrawnStep = Exclude<PageStep, { readonly kind: "sign-in" }>;

export function useKitchens(locale: AppLocale): Kitchens {
  const [state, setState] = useState<KitchensState>({ phase: "loading" });
  const isRequestOutRef = useRef(false);

  const request = useCallback(
    (cursor: string | undefined, settle: (step: DrawnStep) => void) => {
      if (isRequestOutRef.current) return;
      isRequestOutRef.current = true;
      void readPage(cursor).then((step) => {
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
    request(undefined, (step) => {
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
    setState({ ...state, more: { kind: "loading" } });
    request(nextCursor, (step) => {
      setState((current) => withNextPage(current, step));
    });
  }, [request, state]);

  return { state, loadMore, retry };
}

function firstPageState(step: DrawnStep): KitchensState {
  switch (step.kind) {
    case "page":
      return {
        phase: "listed",
        listing: {
          kitchens: step.page.kitchens,
          total: step.page.total,
          nextCursor: step.page.nextCursor,
          readAtMs: Date.now(),
          focusKitchenId: undefined,
        },
        more: { kind: "idle" },
      };
    case "forbidden":
      return { phase: "forbidden" };
    case "failed":
      return { phase: "failed", failure: step.failure };
  }
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
        more: { kind: "idle" },
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
  const shownIds = new Set(listing.kitchens.map((kitchen) => kitchen.id));
  const added = page.kitchens.filter((kitchen) => !shownIds.has(kitchen.id));
  return {
    kitchens: [...listing.kitchens, ...added],
    total: listing.total,
    nextCursor: page.nextCursor,
    readAtMs: Date.now(),
    focusKitchenId: added[0]?.id,
  };
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
