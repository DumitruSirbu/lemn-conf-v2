"use client";

import { useEffect, useRef, type RefObject } from "react";

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
import { AuditCards, AuditTable } from "./staff-audit-rows";
import styles from "./staff-audit.module.css";
import listStyles from "./staff-kitchens.module.css";
import { useIsDesktop } from "./staff-kitchens-list";
import {
  FailedKitchens,
  ListFailureNotice,
  useTextAfterFirstPaint,
} from "./staff-kitchens-states";
import { LoadMore, PageNumbers } from "./staff-pagination";
import {
  StaffForbiddenScreen,
  StaffShell,
  type StaffShellContext,
} from "./staff-shell";
import {
  hasFilters,
  useStaffAudit,
  type MoreState,
  type RowFocusRequest,
  type StaffAudit,
  type StaffAuditListing,
} from "./use-staff-audit";
import { pageCountOf } from "./use-staff-kitchens";

// "Jurnal de audit" (Lot 3 frames S8A to S8E, DS8A to DS8E): what every staff member did with a client's kitchen, newest
// first, a page at a time. A desktop draws a table and numbered pages, a phone draws cards and "Încarcă mai multe"; both
// draw the same rows. The page only reads: no control here changes the log, and the log says so.

const SKELETON_ROW_COUNT = 7;

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
          <FailedKitchens failure={state.failure} onRetry={audit.retry} />
        ) : null}
        {state.phase === "ready" ? (
          <LoggedEvents
            locale={locale}
            listing={state.listing}
            more={state.more}
            audit={audit}
            onClearFilters={clearFilters}
          />
        ) : null}
      </div>
    </section>
  );
}

function LoggedEvents({
  locale,
  listing,
  more,
  audit,
  onClearFilters,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffAuditListing;
  readonly more: MoreState;
  readonly audit: StaffAudit;
  readonly onClearFilters: () => void;
}) {
  const showingRef = useRef<HTMLParagraphElement>(null);
  const isDesktop = useIsDesktop();
  useFocusAfterLanding(listing, showingRef);
  useFocusOnFirstAppendedRow(listing.focusRequest);
  if (listing.total > 0 && listing.events.length === 0) {
    return (
      <div data-testid="staff-audit-page-unshown">
        <FailedKitchens
          failure={{ kind: "failed" }}
          onRetry={() => {
            audit.goToPage(1);
          }}
        />
      </div>
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
    <>
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
    </>
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
  const to = from + listing.events.length - 1;
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
          hasMore={listing.lastPage < pageCount}
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

/** The words are a live region for a screen reader; the rows are only for the eye (frame S8A). */
function LoadingAudit() {
  const copy = useStaffAuditCopy();
  const announcement = useTextAfterFirstPaint(copy.loading);
  return (
    <>
      <p role="status" className={listStyles.visuallyHidden}>
        {announcement}
      </p>
      <ul
        className={styles.skeletonRows}
        aria-hidden="true"
        data-testid="staff-audit-skeleton"
      >
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
          <li key={index} className={styles.skeletonRow}>
            <span className={styles.skeletonLine} data-size="when" />
            <span className={styles.skeletonLine} data-size="who" />
            <span className={styles.skeletonLine} data-size="action" />
            <span className={styles.skeletonLine} data-size="object" />
          </li>
        ))}
      </ul>
    </>
  );
}

/** A log with nothing in it, at all (frame S8C): one sentence and no call to action. */
function EmptyLog() {
  const copy = useStaffAuditCopy().empty;
  return (
    <section className={listStyles.state} data-testid="staff-audit-empty">
      <span className={listStyles.stateMark} aria-hidden="true" />
      <h2 className={listStyles.stateTitle}>{copy.title}</h2>
      <p className={listStyles.stateBody}>{copy.body}</p>
    </section>
  );
}

/** Filters that matched nothing, and the one press that drops them (frame S8D). */
function NoResults({
  onClearFilters,
}: {
  readonly onClearFilters: () => void;
}) {
  const copy = useStaffAuditCopy();
  return (
    <section className={listStyles.state} data-testid="staff-audit-no-results">
      <span
        className={listStyles.stateMark}
        data-mark="search"
        aria-hidden="true"
      />
      <h2 className={listStyles.stateTitle}>{copy.noResults.title}</h2>
      <p className={listStyles.stateBody}>{copy.noResults.body}</p>
      <button
        type="button"
        className={listStyles.stateAction}
        onClick={onClearFilters}
      >
        {copy.filters.clear}
      </button>
    </section>
  );
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
