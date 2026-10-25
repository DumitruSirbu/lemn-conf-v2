"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

import { useReloadOnPageRestore } from "@/account/use-claim";
import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchensCopy } from "@/i18n/use-content";
import { matchesMedia } from "@/lib/matches-media";

import styles from "./staff-kitchens.module.css";
import { StaffKitchenFilters } from "./staff-kitchen-filters";
import {
  EmptyKitchens,
  FailedKitchens,
  LoadingKitchens,
  NoResults,
  PageWithoutKitchens,
} from "./staff-kitchens-states";
import { KitchenCards, KitchensTable } from "./staff-kitchens-rows";
import { StaffPagination } from "./staff-pagination";
import {
  StaffForbiddenScreen,
  StaffShell,
  type StaffShellContext,
} from "./staff-shell";
import {
  useStaffKitchens,
  type MoreState,
  type RowFocusRequest,
  type StaffKitchens,
  type StaffKitchensListing,
} from "./use-staff-kitchens";

// "Bucătării clienți" (Lot 3 frames S2A to S2F, DS2A to DS2F): every client's kitchens, sent and draft, a page at a time.
// A desktop draws a table and numbered pages, a phone draws cards and "Încarcă mai multe"; both draw the same rows. Every
// string a client typed (a name, an address, a phone) is a React text child: nothing here builds markup from one.

/** Where the stylesheet turns the table on; the one number, in the one place the script has to know it. */
const DESKTOP_MEDIA_QUERY = "(min-width: 900px)";

export function StaffKitchensScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  const kitchens = useStaffKitchens();
  useReloadOnPageRestore();
  if (kitchens.state.phase === "forbidden") {
    return (
      <StaffForbiddenScreen locale={locale} page="kitchens" context={context} />
    );
  }
  return (
    <StaffShell locale={locale} page="kitchens" context={context}>
      <StaffKitchensContent locale={locale} kitchens={kitchens} />
    </StaffShell>
  );
}

function StaffKitchensContent({
  locale,
  kitchens,
}: {
  readonly locale: AppLocale;
  readonly kitchens: StaffKitchens;
}) {
  const copy = useStaffKitchensCopy();
  const countRef = useRef<HTMLParagraphElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLSelectElement>(null);
  const { state } = kitchens;
  const withFocusKept: StaffKitchens = {
    ...kitchens,
    clearSearch: () => {
      kitchens.clearSearch();
      searchRef.current?.focus();
    },
    chooseStatus: (status) => {
      kitchens.chooseStatus(status);
      if (status === null) statusRef.current?.focus();
    },
  };
  return (
    <section className={styles.page} data-testid="staff-kitchens-page">
      <h1 className={styles.heading}>{copy.title}</h1>
      <StaffKitchenFilters
        {...withFocusKept}
        searchRef={searchRef}
        statusRef={statusRef}
      />
      <div className={styles.results}>
        {state.phase === "loading" ? <LoadingKitchens /> : null}
        {state.phase === "failed" ? (
          <FailedKitchens failure={state.failure} onRetry={kitchens.retry} />
        ) : null}
        {state.phase === "ready" ? (
          <ListedKitchens
            locale={locale}
            listing={state.listing}
            more={state.more}
            countRef={countRef}
            kitchens={withFocusKept}
          />
        ) : null}
      </div>
    </section>
  );
}

function ListedKitchens({
  locale,
  listing,
  more,
  countRef,
  kitchens,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffKitchensListing;
  readonly more: MoreState;
  readonly countRef: RefObject<HTMLParagraphElement | null>;
  readonly kitchens: StaffKitchens;
}) {
  const copy = useStaffKitchensCopy();
  const isDesktop = useIsDesktop();
  useFocusAfterLanding(listing, countRef);
  useFocusOnFirstAppendedRow(listing.focusRequest);
  if (listing.total > 0 && listing.rows.length === 0) {
    return (
      <PageWithoutKitchens
        onShowFirstPage={() => {
          kitchens.goToPage(1);
        }}
      />
    );
  }
  if (listing.total === 0) {
    return listing.search !== null || listing.status !== null ? (
      <NoResults
        listing={listing}
        onClearSearch={kitchens.clearSearch}
        onClearStatus={() => {
          kitchens.chooseStatus(null);
        }}
      />
    ) : (
      <EmptyKitchens listing={listing} />
    );
  }
  return (
    <>
      <div className={styles.countRow}>
        <p
          ref={countRef}
          role="status"
          tabIndex={-1}
          className={styles.count}
          data-testid="staff-kitchens-count"
        >
          {copy.counts[listing.segment](listing.total)}
        </p>
        <span className={styles.sort}>
          {listing.segment === "sent" ? copy.sorts.sent : copy.sorts.modified}
        </span>
      </div>
      {isDesktop ? (
        <KitchensTable locale={locale} listing={listing} />
      ) : (
        <KitchenCards locale={locale} listing={listing} />
      )}
      <StaffPagination
        listing={listing}
        more={more}
        isDesktop={isDesktop}
        onGoToPage={kitchens.goToPage}
        onLoadMore={kitchens.loadMore}
      />
    </>
  );
}

/**
 * Once the page the person chose by number has landed, focus goes to the count so the new place is read. Only for that
 * very jump (the hook marks nothing else as landed), and only while focus is still on the document, where the button
 * that held it was left when the old rows went. Anything the person did since stays where they put it.
 */
function useFocusAfterLanding(
  { landedJump }: StaffKitchensListing,
  countRef: RefObject<HTMLParagraphElement | null>,
): void {
  useEffect(() => {
    if (landedJump === undefined) return;
    const focused = document.activeElement;
    const isFocusLeftBehind = focused === null || focused === document.body;
    if (isFocusLeftBehind) countRef.current?.focus();
  }, [landedJump, countRef]);
}

/** The first kitchen a page of "Încarcă mai multe" added takes focus, once: the request is the listing's own, so a change
 *  of width that draws the rows again does not make it again. */
function useFocusOnFirstAppendedRow(
  focusRequest: RowFocusRequest | undefined,
): void {
  useEffect(() => {
    if (focusRequest === undefined) return;
    const links =
      document.querySelectorAll<HTMLAnchorElement>("a[data-row-id]");
    // Compared, not selected by: the id is the server's text and is never put into a selector.
    Array.from(links)
      .find((link) => link.dataset.rowId === focusRequest.rowId)
      ?.focus();
  }, [focusRequest]);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktopWidth,
    () => matchesMedia(DESKTOP_MEDIA_QUERY),
    () => false,
  );
}

function subscribeToDesktopWidth(notify: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }
  const query = window.matchMedia(DESKTOP_MEDIA_QUERY);
  query.addEventListener("change", notify);
  return () => {
    query.removeEventListener("change", notify);
  };
}
