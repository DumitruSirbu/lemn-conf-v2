"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { AppLocale } from "@/i18n/routing";
import { useAccountKitCopy, useAccountKitchensCopy } from "@/i18n/use-content";

import accountStyles from "../account.module.css";
import { FormNotice, RateLimitNotice } from "../account-form-parts";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  PrimaryAction,
  PrimaryLink,
  startPathOf,
} from "../account-shell";
import { ForbiddenScreen } from "../forbidden-screen";
import { KitchenCard } from "./kitchen-card";
import type { ListedKitchen } from "./kitchens-answer";
import {
  useKitchens,
  type CardFocusRequest,
  type KitchensState,
  type ListFailure,
  type Listing,
  type MoreState,
} from "./use-kitchens";
import styles from "./kitchens.module.css";

// "Bucătăriile mele" (Lot 2 frames A9A to A9C, A9I, A9J): the signed-in client's kitchens, newest change first, a page at
// a time. It is read-only here: opening a kitchen is a link, and everything that changes one (rename, copy, share, hide,
// delete) is a later screen.

const LOADING_PLACEHOLDER_COUNT = 4;

/** How long the loading region stays empty before it is given its words: a live region is announced for a change made
 *  after it is in the page, not for one it was drawn with. */
const LIVE_REGION_FILL_DELAY_MS = 0;

export function KitchensScreen({ locale }: { readonly locale: AppLocale }) {
  const { state, loadMore, retry } = useKitchens(locale);
  if (state.phase === "forbidden") return <ForbiddenScreen locale={locale} />;
  return (
    <KitchensFrame locale={locale}>
      <KitchensContent
        state={state}
        locale={locale}
        loadMore={loadMore}
        retry={retry}
      />
    </KitchensFrame>
  );
}

/** The page when the server gate could not read the session store: nothing is known of the kitchens, so no request is
 *  made, and the way on is the page itself asked for again. */
export function KitchensUnavailableScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  return (
    <KitchensFrame locale={locale}>
      <FailedKitchens
        failure={{ kind: "unavailable" }}
        onRetry={() => {
          window.location.reload();
        }}
      />
    </KitchensFrame>
  );
}

function KitchensFrame({
  locale,
  children,
}: {
  readonly locale: AppLocale;
  readonly children: ReactNode;
}) {
  return (
    <AccountShell locale={locale} page="kitchens" isWide>
      {children}
    </AccountShell>
  );
}

interface KitchensContentProps {
  readonly state: Exclude<KitchensState, { readonly phase: "forbidden" }>;
  readonly locale: AppLocale;
  readonly loadMore: () => void;
  readonly retry: () => void;
}

function KitchensContent({
  state,
  locale,
  loadMore,
  retry,
}: KitchensContentProps) {
  switch (state.phase) {
    case "loading":
      return <LoadingKitchens />;
    case "failed":
      return <FailedKitchens failure={state.failure} onRetry={retry} />;
    case "listed":
      return state.listing.kitchens.length === 0 &&
        state.listing.nextCursor === undefined ? (
        <NoKitchens locale={locale} />
      ) : (
        <ListedKitchens
          listing={state.listing}
          more={state.more}
          locale={locale}
          loadMore={loadMore}
        />
      );
  }
}

function PageHeading() {
  const copy = useAccountKitchensCopy();
  return <AccountHeading title={copy.title} />;
}

/** The words are a live region for a screen reader; the placeholders are only for the eye. */
function LoadingKitchens() {
  const copy = useAccountKitchensCopy();
  const announcement = useTextAfterFirstPaint(copy.loading);
  return (
    <AccountPane>
      <PageHeading />
      <p role="status" className={styles.visuallyHidden}>
        {announcement}
      </p>
      <ul className={styles.list} aria-hidden="true">
        {Array.from({ length: LOADING_PLACEHOLDER_COUNT }, (_, index) => (
          <KitchenPlaceholder key={index} />
        ))}
      </ul>
    </AccountPane>
  );
}

/** Empty on the render that draws the region, the text on the next tick. */
function useTextAfterFirstPaint(text: string): string {
  const [isFilled, setIsFilled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFilled(true);
    }, LIVE_REGION_FILL_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return isFilled ? text : "";
}

function KitchenPlaceholder() {
  return (
    <li className={styles.skeleton}>
      <span className={styles.skeletonThumb} />
      <span className={styles.skeletonLines}>
        <span className={styles.skeletonLine} data-size="badge" />
        <span className={styles.skeletonLine} data-size="name" />
        <span className={styles.skeletonLine} data-size="meta" />
        <span className={styles.skeletonLine} data-size="modified" />
      </span>
    </li>
  );
}

/** Frames A9I and A9J, when no page was had at all: the reason, and the one action that asks again. */
function FailedKitchens({
  failure,
  onRetry,
}: {
  readonly failure: ListFailure;
  readonly onRetry: () => void;
}) {
  const kit = useAccountKitCopy();
  return (
    <>
      <AccountPane>
        <PageHeading />
        <FailureNotice failure={failure} />
      </AccountPane>
      <AccountActions>
        <PrimaryAction onClick={onRetry}>{kit.retry}</PrimaryAction>
      </AccountActions>
    </>
  );
}

function FailureNotice({ failure }: { readonly failure: ListFailure }) {
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

/** Frame A9B: one way on, to the start of the configurator. */
function NoKitchens({ locale }: { readonly locale: AppLocale }) {
  const copy = useAccountKitchensCopy();
  return (
    <>
      <AccountPane>
        <PageHeading />
        <section className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden="true" />
          <h2 className={styles.emptyTitle}>{copy.emptyTitle}</h2>
          <p className={styles.emptyBody}>{copy.emptyBody}</p>
        </section>
      </AccountPane>
      <AccountActions>
        <PrimaryLink href={startPathOf(locale)}>
          {copy.startKitchen}
        </PrimaryLink>
      </AccountActions>
    </>
  );
}

interface ListedKitchensProps {
  readonly listing: Listing;
  readonly more: MoreState;
  readonly locale: AppLocale;
  readonly loadMore: () => void;
}

/** Frame A9C. */
function ListedKitchens({
  listing,
  more,
  locale,
  loadMore,
}: ListedKitchensProps) {
  const copy = useAccountKitchensCopy();
  return (
    <AccountPane>
      <PageHeading />
      <div className={styles.countRow}>
        <span className={styles.count}>
          {copy.count(shownCountOf(listing))}
        </span>
        <span className={styles.sort}>{copy.sortNewestFirst}</span>
      </div>
      <ul className={styles.list}>
        {listing.kitchens.map((kitchen) => (
          <KitchenCard
            key={kitchen.id}
            kitchen={kitchen}
            locale={locale}
            readAtMs={listing.readAtMs}
            focusRequest={focusRequestFor(kitchen, listing)}
          />
        ))}
      </ul>
      {listing.nextCursor === undefined ? null : (
        <MoreKitchens more={more} loadMore={loadMore} />
      )}
    </AccountPane>
  );
}

/** The account's count while pages remain; once the last is in, the cards actually loaded, since the server's count
 *  includes documents it could not read. */
function shownCountOf(listing: Listing): number {
  return listing.nextCursor === undefined
    ? listing.kitchens.length
    : listing.total;
}

function focusRequestFor(
  kitchen: ListedKitchen,
  listing: Listing,
): CardFocusRequest | undefined {
  return listing.focusRequest?.kitchenId === kitchen.id
    ? listing.focusRequest
    : undefined;
}

/** "Încarcă mai multe". A page that could not be had says so beside the button, which asks for it again; the kitchens
 *  already shown stay. The button stays reachable while a page is out (`aria-disabled`, not `disabled`) so focus is
 *  never dropped from it. */
function MoreKitchens({
  more,
  loadMore,
}: {
  readonly more: MoreState;
  readonly loadMore: () => void;
}) {
  const copy = useAccountKitchensCopy();
  const isLoading = more.kind === "loading";
  return (
    <div className={styles.more}>
      {more.kind === "failed" ? <FailureNotice failure={more.failure} /> : null}
      <div className={styles.moreButton}>
        <button
          type="button"
          className={accountStyles.secondary}
          aria-busy={isLoading ? true : undefined}
          aria-disabled={isLoading ? true : undefined}
          onClick={isLoading ? undefined : loadMore}
        >
          {isLoading ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : null}
          {isLoading ? copy.loadingMore : copy.loadMore}
        </button>
      </div>
    </div>
  );
}
