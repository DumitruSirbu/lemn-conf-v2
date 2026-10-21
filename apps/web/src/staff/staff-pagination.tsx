"use client";

import { useStaffKitchensCopy } from "@/i18n/use-content";

import styles from "./staff-kitchens.module.css";
import { ListFailureNotice } from "./staff-kitchens-states";
import type { MoreState, StaffKitchensListing } from "./use-staff-kitchens";

// The foot of the list (frame S2B): "Se afișează a–b din n" and, on a desktop, the page numbers the person jumps by; on a
// phone, "Încarcă mai multe" in place of the numbers. Every target is at least 44 px; the arrows are drawn by the
// stylesheet, so their names are the buttons' labels alone.

/** Up to this many pages, every number is shown; beyond it, the first, the last and the neighbours of the current one. */
const ALL_PAGES_UP_TO = 8;

export type PageSlot =
  | { readonly kind: "page"; readonly page: number }
  | { readonly kind: "gap"; readonly after: number };

/**
 * The numbers to draw for page `current` of `pageCount`, in order and without a repeat: all of them when there are few,
 * else the first, the last and the current page with its neighbours, with a gap where pages are left out. A gap that
 * would hide a single page shows that page instead.
 */
export function pageSlotsOf(
  current: number,
  pageCount: number,
): readonly PageSlot[] {
  const wanted = wantedPagesOf(current, pageCount);
  return wanted.flatMap((page, index) => {
    const previous = wanted[index - 1];
    const slot: PageSlot = { kind: "page", page };
    if (previous === undefined || page - previous === 1) return [slot];
    if (page - previous === 2)
      return [{ kind: "page", page: previous + 1 }, slot];
    return [{ kind: "gap", after: previous }, slot];
  });
}

function wantedPagesOf(current: number, pageCount: number): readonly number[] {
  if (pageCount <= ALL_PAGES_UP_TO) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const kept = new Set([1, pageCount, current - 1, current, current + 1]);
  return [...kept]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((first, second) => first - second);
}

export interface StaffPaginationProps {
  readonly listing: StaffKitchensListing;
  readonly more: MoreState;
  readonly isDesktop: boolean;
  readonly onGoToPage: (page: number) => void;
  readonly onLoadMore: () => void;
}

export function StaffPagination({
  listing,
  more,
  isDesktop,
  onGoToPage,
  onLoadMore,
}: StaffPaginationProps) {
  const copy = useStaffKitchensCopy().pagination;
  const pageCount = Math.max(1, Math.ceil(listing.total / listing.pageSize));
  const from = (listing.firstPage - 1) * listing.pageSize + 1;
  const to = from + listing.rows.length - 1;
  return (
    <div className={styles.foot} data-testid="staff-kitchens-foot">
      {listing.rows.length === 0 ? null : (
        <p className={styles.showing}>
          {copy.showing({ from, to, total: listing.total })}
        </p>
      )}
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

function PageNumbers({
  current,
  pageCount,
  onGoToPage,
}: {
  readonly current: number;
  readonly pageCount: number;
  readonly onGoToPage: (page: number) => void;
}) {
  const copy = useStaffKitchensCopy().pagination;
  if (pageCount < 2) return null;
  return (
    <nav aria-label={copy.pagesLabel}>
      <ul className={styles.pages}>
        <li>
          <button
            type="button"
            className={styles.pageButton}
            data-arrow="previous"
            aria-label={copy.previous}
            disabled={current <= 1}
            onClick={() => {
              onGoToPage(current - 1);
            }}
          />
        </li>
        {pageSlotsOf(current, pageCount).map((slot) =>
          slot.kind === "gap" ? (
            <li key={`gap-after-${String(slot.after)}`} aria-hidden="true">
              <span className={styles.pageGap} />
            </li>
          ) : (
            <li key={slot.page}>
              <button
                type="button"
                className={styles.pageButton}
                aria-label={copy.pageNumber(slot.page)}
                aria-current={slot.page === current ? "page" : undefined}
                onClick={() => {
                  if (slot.page !== current) onGoToPage(slot.page);
                }}
              >
                {slot.page}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className={styles.pageButton}
            data-arrow="next"
            aria-label={copy.next}
            disabled={current >= pageCount}
            onClick={() => {
              onGoToPage(current + 1);
            }}
          />
        </li>
      </ul>
    </nav>
  );
}

/** The button stays reachable while a page is out (`aria-disabled`, not `disabled`), so focus is never dropped from it. */
function LoadMore({
  hasMore,
  more,
  onLoadMore,
}: {
  readonly hasMore: boolean;
  readonly more: MoreState;
  readonly onLoadMore: () => void;
}) {
  const copy = useStaffKitchensCopy().pagination;
  if (!hasMore) return null;
  const isLoading = more.kind === "loading";
  return (
    <div className={styles.more}>
      {more.kind === "failed" ? (
        <ListFailureNotice failure={more.failure} />
      ) : null}
      <button
        type="button"
        className={styles.moreButton}
        aria-busy={isLoading ? true : undefined}
        aria-disabled={isLoading ? true : undefined}
        onClick={isLoading ? undefined : onLoadMore}
      >
        {isLoading ? copy.loadingMore : copy.loadMore}
      </button>
    </div>
  );
}
