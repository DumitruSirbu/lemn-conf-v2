import "server-only";

import type {
  DashboardStoreFailure,
  DashboardStoreOperation,
} from "@lemnaria/persistence";

/** Why a request was handed no price book. A closed list, so a line can only say one of these. */
export const NO_PRICE_BOOK_CAUSES = [
  "store-unavailable",
  "store-failed",
  "book-unparseable",
  "version-mismatch",
  "availability-unreadable",
  "availability-too-large",
  "unexpected",
] as const;

export type NoPriceBookCause = (typeof NO_PRICE_BOOK_CAUSES)[number];

/** What a store said went wrong: the operation and kind of its own closed lists, never a message or a value. */
export interface StoreFailureFacts {
  readonly operation: DashboardStoreOperation;
  readonly kind: DashboardStoreFailure;
}

const LABEL = "[price-book]";
const EVENT = "no-price-book";

/**
 * One line for one request that was handed no book: the cause, and for a store's failure its operation and kind. The line
 * is built from these alone, so nothing of a book, a version or a thrown message can be written. A version that was never
 * published is not a failure and writes no line.
 *
 * The write may not throw: a diagnostic that can fail would replace the answer it exists to explain.
 */
export function reportNoPriceBook(
  cause: NoPriceBookCause,
  store?: StoreFailureFacts,
): void {
  const line =
    store === undefined
      ? { event: EVENT, cause }
      : {
          event: EVENT,
          cause,
          operation: store.operation,
          kind: store.kind,
        };
  try {
    console.error(LABEL, line);
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
