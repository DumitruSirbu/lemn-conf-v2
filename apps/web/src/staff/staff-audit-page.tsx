"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { useReloadOnPageRestore } from "@/account/use-claim";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  PrimaryAction,
} from "@/account/account-shell";
import type { AppLocale } from "@/i18n/routing";
import {
  useAccountKitCopy,
  useStaffAuditCopy,
  useStaffKitchensCopy,
} from "@/i18n/use-content";

import { StaffAuditFilters } from "./staff-audit-filters";
import {
  hasFilters,
  hasMoreRows,
  rowsReachedBy,
  type MoreState,
  type RowFocusRequest,
  type StaffAuditListing,
} from "./staff-audit-listing";
import { AuditCards, AuditTable } from "./staff-audit-rows";
import {
  EmptyLog,
  LoadingAudit,
  NoResults,
  PageWithoutEvents,
} from "./staff-audit-states";
import styles from "./staff-audit.module.css";
import listStyles from "./staff-kitchens.module.css";
import { useIsDesktop } from "./staff-kitchens-list";
import { FailedList, ListFailureNotice } from "./staff-kitchens-states";
import { LoadMore, PageNumbers } from "./staff-pagination";
import {
  StaffForbiddenScreen,
  StaffShell,
  type StaffShellContext,
} from "./staff-shell";
import { useStaffAudit, type StaffAudit } from "./use-staff-audit";
import { pageCountOf } from "./use-staff-kitchens";

// "Jurnal de audit" (Lot 3 frames S8A to S8E, DS8A to DS8E): what every staff member did with a client's kitchen, newest
// first, a page at a time. A desktop draws a table and numbered pages, a phone draws cards and "Încarcă mai multe"; both
// draw the same rows. The page only reads: no control here changes the log, and the log says so.

export function StaffAuditScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  const audit = useStaffAudit();
  useReloadOnPageRestore();
  if (audit.state.phase === "forbidden") {
    return (
      <StaffForbiddenScreen locale={locale} page="audit" context={context} />
    );
  }
  return (
    <StaffShell locale={locale} page="audit" context={context}>
      <StaffAuditContent locale={locale} audit={audit} />
    </StaffShell>
  );
}

function StaffAuditContent({
  locale,
  audit,
}: {
  readonly locale: AppLocale;
  readonly audit: StaffAudit;
}) {
  const copy = useStaffAuditCopy();
  const personRef = useRef<HTMLSelectElement>(null);
  const { state } = audit;
  const isStale = audit.dateProblem !== undefined;
  const clearFilters = () => {
    audit.clearFilters();
    personRef.current?.focus();
  };
  return (
    <section className={listStyles.page} data-testid="staff-audit-page">
      <h1 className={listStyles.heading}>{copy.title}</h1>
      <p className={styles.note}>{copy.readOnlyNote}</p>
      <StaffAuditFilters {...audit} personRef={personRef} />
      <div className={listStyles.results}>
        {state.phase === "loading" ? <LoadingAudit /> : null}
        {state.phase === "failed" ? (
          <HeldBack isHeld={isStale}>
            <FailedList failure={state.failure} onRetry={audit.retry} />
          </HeldBack>
        ) : null}
        {state.phase === "ready" ? (
          <LoggedEvents
            locale={locale}
            listing={state.listing}
            more={state.more}
            audit={audit}
            isHeldBack={isStale}
            onClearFilters={clearFilters}
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * While the days cannot be asked for, the rows, the count and the foot on screen answer an older question: they are
 * dimmed and cannot be reached (`inert`: no press, no focus, and not read aloud), so nothing is read against what the
 * filters say now. The words of an empty log or of no results are not held: the press that drops the filters is the way out.
 */
function HeldBack({
  isHeld,
  children,
}: {
  readonly isHeld: boolean;
  readonly children: ReactNode;
}) {
  if (!isHeld) return <>{children}</>;
  return (
    <div className={styles.stale} data-stale="true" inert>
      {children}
    </div>
  );
}

function LoggedEvents({
  locale,
  listing,
  more,
  audit,
  isHeldBack,
  onClearFilters,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffAuditListing;
  readonly more: MoreState;
  readonly audit: StaffAudit;
  readonly isHeldBack: boolean;
  readonly onClearFilters: () => void;
}) {
  const showingRef = useRef<HTMLParagraphElement>(null);
  const isDesktop = useIsDesktop();
  useFocusAfterLanding(listing, showingRef);
  useFocusOnFirstAppendedRow(listing.focusRequest);
  if (listing.total > 0 && listing.events.length === 0) {
    return (
      <HeldBack isHeld={isHeldBack}>
        <PageWithoutEvents
          onShowFirstPage={() => {
            audit.goToPage(1);
          }}
        />
      </HeldBack>
    );
  }
  if (listing.total === 0) {
    return hasFilters(listing.query) ? (
      <NoResults onClearFilters={onClearFilters} />
    ) : (
      <EmptyLog />
    );
  }
  return (
    <HeldBack isHeld={isHeldBack}>
      {isDesktop ? (
        <AuditTable locale={locale} listing={listing} />
      ) : (
        <AuditCards locale={locale} listing={listing} />
      )}
      <AuditFoot
        listing={listing}
        more={more}
        isDesktop={isDesktop}
        showingRef={showingRef}
        onGoToPage={audit.goToPage}
        onLoadMore={audit.loadMore}
      />
    </HeldBack>
  );
}

/** "Se afișează a–b din n" and the way to the rest (frame S8B): numbered pages on a desktop, "Încarcă mai multe" on a
 *  phone. The words and the buttons are the kitchens list's own. */
function AuditFoot({
  listing,
  more,
  isDesktop,
  showingRef,
  onGoToPage,
  onLoadMore,
}: {
  readonly listing: StaffAuditListing;
  readonly more: MoreState;
  readonly isDesktop: boolean;
  readonly showingRef: RefObject<HTMLParagraphElement | null>;
  readonly onGoToPage: (page: number) => void;
  readonly onLoadMore: () => void;
}) {
  const copy = useStaffKitchensCopy().pagination;
  const pageCount = pageCountOf(listing.total, listing.pageSize);
  const from = (listing.firstPage - 1) * listing.pageSize + 1;
  const to = rowsReachedBy(listing);
  return (
    <div className={listStyles.foot} data-testid="staff-audit-foot">
      <p
        ref={showingRef}
        role="status"
        tabIndex={-1}
        className={listStyles.showing}
        data-testid="staff-audit-showing"
      >
        {copy.showing({ from, to, total: listing.total })}
      </p>
      {isDesktop ? (
        <PageNumbers
          current={listing.lastPage}
          pageCount={pageCount}
          onGoToPage={onGoToPage}
        />
      ) : (
        <LoadMore
          hasMore={hasMoreRows(listing)}
          more={more}
          onLoadMore={onLoadMore}
        />
      )}
    </div>
  );
}

/**
 * Once the page the person chose by number has landed, focus goes to the line that says which rows are shown, so the new
 * place is read. Only for that very jump, and only while focus is still on the document, where the button that held it
 * was left when the old rows went.
 */
function useFocusAfterLanding(
  { landedJump }: StaffAuditListing,
  showingRef: RefObject<HTMLParagraphElement | null>,
): void {
  useEffect(() => {
    if (landedJump === undefined) return;
    const focused = document.activeElement;
    const isFocusLeftBehind = focused === null || focused === document.body;
    if (isFocusLeftBehind) showingRef.current?.focus();
  }, [landedJump, showingRef]);
}

/** The first row a page of "Încarcă mai multe" added takes focus, once: the request is the listing's own, so a change of
 *  width that draws the rows again does not make it again. */
function useFocusOnFirstAppendedRow(
  focusRequest: RowFocusRequest | undefined,
): void {
  useEffect(() => {
    if (focusRequest === undefined) return;
    const rows = document.querySelectorAll<HTMLElement>("[data-event-id]");
    // Compared, not selected by: the id is the server's text and is never put into a selector.
    Array.from(rows)
      .find((row) => row.dataset.eventId === focusRequest.eventId)
      ?.focus();
  }, [focusRequest]);
}

/** The page when the server gate could not read the session store: nothing is known of the person, so no staff frame is
 *  drawn and no request is made, and the way on is the page itself asked for again. */
export function StaffAuditUnavailableScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const copy = useStaffAuditCopy();
  const kit = useAccountKitCopy();
  return (
    <AccountShell locale={locale} isWide>
      <AccountPane>
        <AccountHeading title={copy.title} />
        <ListFailureNotice failure={{ kind: "unavailable" }} />
      </AccountPane>
      <AccountActions>
        <PrimaryAction
          onClick={() => {
            window.location.reload();
          }}
        >
          {kit.retry}
        </PrimaryAction>
      </AccountActions>
    </AccountShell>
  );
}
