"use client";

import { useEffect, useState } from "react";

import {
  FormNotice,
  RateLimitNotice,
  useSecondsUntil,
  waitOfFeedback,
} from "@/account/account-form-parts";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  PrimaryAction,
} from "@/account/account-shell";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitCopy, useStaffKitchensCopy } from "@/i18n/use-content";

import styles from "./staff-kitchens.module.css";
import type { ListFailure, StaffKitchensListing } from "./use-staff-kitchens";

// What the staff list shows in place of rows (frames S2A, S2C, S2C2, S2D, S2E): the skeleton while a page is out, the
// words of an empty segment, of a search or status that matched nothing, and why a page could not be had. The
// service-down and rate-limit words are the account area's own; a staff screen says them no differently.

const SKELETON_ROW_COUNT = 7;

/** Why a page could not be had: the wait of a limit, the service not being there, no answer at all, or an answer the
 *  screen could not read. */
export function ListFailureNotice({
  failure,
}: {
  readonly failure: ListFailure;
}) {
  const kit = useAccountKitCopy();
  switch (failure.kind) {
    case "rate-limited":
      return <RateLimitNotice notice={failure.notice} />;
    case "unavailable":
      return (
        <FormNotice tone="error" title={kit.unavailable.title}>
          {kit.unavailable.body}
        </FormNotice>
      );
    case "offline":
      return (
        <FormNotice tone="error" title={kit.offline.title}>
          {kit.offline.body}
        </FormNotice>
      );
    case "failed":
      return (
        <FormNotice tone="error" title={kit.requestFailed.title}>
          {kit.requestFailed.body}
        </FormNotice>
      );
  }
}

/** The failure and the one action that asks again. Nothing asks again on its own, and while a limit's wait is counted
 *  down the action is off (`aria-disabled`, so it stays reachable) and ignores a press; it wakes when the wait ends. */
export function FailedKitchens({
  failure,
  onRetry,
}: {
  readonly failure: ListFailure;
  readonly onRetry: () => void;
}) {
  const kit = useAccountKitCopy();
  const isWaiting = useSecondsUntil(waitOfFeedback(failure)?.endsAtMs) > 0;
  return (
    <div className={styles.state}>
      <ListFailureNotice failure={failure} />
      <button
        type="button"
        className={styles.stateAction}
        data-tone="primary"
        aria-disabled={isWaiting ? true : undefined}
        onClick={isWaiting ? undefined : onRetry}
      >
        {kit.retry}
      </button>
    </div>
  );
}

/** The words are a live region for a screen reader; the rows are only for the eye. */
export function LoadingKitchens() {
  const copy = useStaffKitchensCopy();
  const announcement = useTextAfterFirstPaint(copy.loading);
  return (
    <>
      <p role="status" className={styles.visuallyHidden}>
        {announcement}
      </p>
      <ul
        className={styles.skeletonRows}
        aria-hidden="true"
        data-testid="staff-kitchens-skeleton"
      >
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
          <li key={index} className={styles.skeletonRow}>
            <span className={styles.skeletonThumb} />
            <span className={styles.skeletonLines}>
              <span className={styles.skeletonLine} data-size="name" />
              <span className={styles.skeletonLine} data-size="meta" />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Empty on the render that draws the region, the text on the next tick: a live region announces a change, not what it
 *  was drawn with. */
function useTextAfterFirstPaint(text: string): string {
  const [isFilled, setIsFilled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFilled(true);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return isFilled ? text : "";
}

/** A segment with nothing in it, at all: one sentence and no call to action. */
export function EmptyKitchens({
  listing,
}: {
  readonly listing: StaffKitchensListing;
}) {
  const copy = useStaffKitchensCopy().empty[listing.segment];
  return (
    <section className={styles.state} data-testid="staff-kitchens-empty">
      <span className={styles.stateMark} aria-hidden="true" />
      <h2 className={styles.stateTitle}>{copy.title}</h2>
      <p className={styles.stateBody}>{copy.body}</p>
    </section>
  );
}

/** A search or a status that matched nothing, and the one press that drops it. */
export function NoResults({
  listing,
  onClearSearch,
  onClearStatus,
}: {
  readonly listing: StaffKitchensListing;
  readonly onClearSearch: () => void;
  readonly onClearStatus: () => void;
}) {
  const copy = useStaffKitchensCopy();
  const { search } = listing;
  const isSearch = search !== null;
  const words =
    search === null
      ? copy.noResults.forStatus
      : copy.noResults.forSearch(search);
  return (
    <section className={styles.state} data-testid="staff-kitchens-no-results">
      <span
        className={styles.stateMark}
        data-mark="search"
        aria-hidden="true"
      />
      <h2 className={styles.stateTitle}>{words.title}</h2>
      <p className={styles.stateBody}>{words.body}</p>
      <button
        type="button"
        className={styles.stateAction}
        onClick={isSearch ? onClearSearch : onClearStatus}
      >
        {isSearch ? copy.filters.searchClear : copy.noResults.clearStatus}
      </button>
    </section>
  );
}

/** The page when the server gate could not read the session store: nothing is known of the person, so no staff frame is
 *  drawn and no request is made, and the way on is the page itself asked for again. */
export function StaffKitchensUnavailableScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const copy = useStaffKitchensCopy();
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
