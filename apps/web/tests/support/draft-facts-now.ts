import {
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { DraftFactsNow } from "@/price-dashboard/use-item-availability";

interface DraftThatMovesOptions {
  /** The book the draft sits on, asked at each reading so a test can move it between renders. */
  readonly book?: () => PriceBook;
  readonly isDraftOnly?: (item: DeletableItemRef) => boolean;
}

/**
 * A `readDraftNow` for a hook whose test says nothing about the draft: every reading is a new revision, so a conflict is
 * always met by a draft that has moved on and the deletion is judged again, never reported as an unread conflict.
 */
export function draftMovingOnEveryRead({
  book = () => SAMPLE_PRICE_BOOK,
  isDraftOnly = () => false,
}: DraftThatMovesOptions = {}): () => DraftFactsNow {
  let readings = 0;
  return () => ({
    revision: `reading-${String(readings++)}`,
    book: book(),
    isDraftOnly,
  });
}
