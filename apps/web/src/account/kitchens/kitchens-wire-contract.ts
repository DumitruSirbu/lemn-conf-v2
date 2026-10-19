import type { Design, KitchenSummary } from "@lemnaria/configurator-domain";

// What `GET /api/account/kitchens` answers and the page that reads it expects, once. It lives outside `lib/server`
// because the client bundle may not import a server-only module, and holds types and constants only.

/**
 * Kitchens in one page. The caller names no size: a page carries up to this many full documents, so the figure is the
 * response's weight and is the server's to set.
 */
export const KITCHEN_PAGE_SIZE = 12;

/** The query member that carries the opaque cursor of the page after the one just read. */
export const KITCHEN_CURSOR_PARAMETER = "cursor";

/** One kitchen of the list. `document` is the stored design as this build reads it, so the card is priced with the
 *  one price book on the client; `summary` is the codes and numbers its name and meta line are written from. */
export interface ListedKitchenWire {
  readonly id: string;
  /** `null` is "never named". */
  readonly name: string | null;
  /** ISO 8601, UTC, milliseconds. */
  readonly updatedAt: string;
  readonly isSent: boolean;
  readonly summary: KitchenSummary;
  readonly document: Design;
}

export interface KitchenListWire {
  /** Every listed kitchen of the account, as counted with the page. It may exceed what the pages add up to: a kitchen
   *  whose stored document this build cannot read is counted and never returned. */
  readonly total: number;
  /** May be empty while `nextCursor` is not: a page of unreadable kitchens is skipped, not ended. */
  readonly kitchens: readonly ListedKitchenWire[];
  /** Opaque. `null` when no kitchen follows this page. */
  readonly nextCursor: string | null;
}
