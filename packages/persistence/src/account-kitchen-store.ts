import type { Design, DesignId } from "@lemnaria/configurator-domain";

import { requireAccountIdShape } from "./account-id-shape.js";

/** The longest kitchen name `designs_name_length` (`0016`) admits, in characters (code points), not UTF-16 units. */
export const MAX_KITCHEN_NAME_CHARACTERS = 120;

/** The most kitchens one page returns. */
export const MAX_KITCHEN_PAGE_SIZE = 50;

export type AccountKitchenStoreOperation =
  | "list kitchens"
  | "count kitchens"
  | "rename a kitchen"
  | "duplicate a kitchen"
  | "hide a kitchen"
  | "delete a kitchen"
  | "mark a kitchen sent";

/** The database refused, did not answer, or answered with something that is not the row this port reads. Its `cause`
 *  is a `ReducedCause` (ADR 0146 B3), never the driver's own error, and its message holds no name or document. */
export class AccountKitchenStoreError extends Error {
  readonly operation: AccountKitchenStoreOperation;

  constructor(operation: AccountKitchenStoreOperation, options?: ErrorOptions) {
    super(
      `The account kitchen store could not ${operation}: the database gave no trustworthy answer.`,
      options,
    );
    this.name = "AccountKitchenStoreError";
    this.operation = operation;
  }
}

/**
 * Where the next page starts: the last kitchen of the page before it. `updatedAt` is the database's own text for the
 * column, UTC with six fractional digits (`2026-10-19T09:30:00.123456Z`), never a `Date`: a `Date` holds milliseconds,
 * the column holds microseconds, and a rounded cursor repeats or skips a row. Opaque to everything above this port;
 * a route validates one it received with `isKitchenCursor` before handing it down.
 */
export interface KitchenCursor {
  readonly updatedAt: string;
  readonly id: DesignId;
}

export interface KitchenPageRequest {
  /** The server's own session's account. No request member names one. */
  readonly accountId: string;
  /** 1 to `MAX_KITCHEN_PAGE_SIZE`. */
  readonly limit: number;
  /** Absent for the first page. */
  readonly after?: KitchenCursor;
}

/** A kitchen as the list shows it. `design` is the stored document as this build reads it (`migrateDesign`). */
export interface ListedKitchen {
  readonly id: DesignId;
  /** `null` is "never named", not an empty name. */
  readonly name: string | null;
  /** Millisecond precision, for display. Paging uses `KitchenCursor`. */
  readonly updatedAt: Date;
  readonly isSent: boolean;
  readonly design: Design;
}

export interface KitchenPage {
  readonly kitchens: readonly ListedKitchen[];
  /** Taken from the last row the page consumed, readable or not, so a skipped row never stalls the walk. */
  readonly nextCursor: KitchenCursor | null;
  /** Every listed kitchen of the account, counted by the same statement and snapshot as the page. A kitchen counted
   *  here may be absent from `kitchens` (see `skippedCount`), so `total` can exceed what the pages add up to. */
  readonly total: number;
  /**
   * Kitchens this page consumed whose stored document this build cannot read: left out of `kitchens`, still counted in
   * `total`. Nothing about them (id, name, document, the reason) leaves the store. Always 0 in the fake, which holds
   * parsed designs and cannot represent an unreadable document.
   */
  readonly skippedCount: number;
}

export interface KitchenRename {
  readonly accountId: string;
  readonly designId: DesignId;
  /** 1 to `MAX_KITCHEN_NAME_CHARACTERS` characters; the caller has already judged the text. */
  readonly name: string;
}

export interface KitchenDuplication {
  readonly accountId: string;
  /** The kitchen to copy. */
  readonly designId: DesignId;
  /**
   * The copy's name, composed by the caller (the store writes no sentence). It is stored as given and never
   * truncated: 1 to `MAX_KITCHEN_NAME_CHARACTERS` characters, so a caller that appends a suffix to the source's
   * name must truncate the source's name first, or the store refuses.
   */
  readonly name: string;
}

/** What `hide` and `markDeleted` act on: the owning account and the design, and nothing else. */
export interface KitchenMark {
  readonly accountId: string;
  readonly designId: DesignId;
}

/** Every outcome that is not a success is `none` for a design the account does not own, and for one that is missing,
 *  hidden or deleted: one outcome of one statement, so a caller cannot tell which it was. */
export type KitchenRenameOutcome =
  | { readonly kind: "renamed" }
  | { readonly kind: "none" };

export type KitchenDuplicationOutcome =
  | { readonly kind: "duplicated"; readonly id: DesignId }
  | { readonly kind: "none" };

/** `not-sent` is reported only to the owning account, after the ownership predicate matched. */
export type KitchenHideOutcome =
  | { readonly kind: "hidden" }
  | { readonly kind: "not-sent" }
  | { readonly kind: "none" };

/** `sent` is reported only to the owning account, after the ownership predicate matched. */
export type KitchenDeleteOutcome =
  | { readonly kind: "deleted" }
  | { readonly kind: "sent" }
  | { readonly kind: "none" };

/**
 * The port for the kitchens an account owns ("My kitchens"). Every read and write names the account in its own
 * predicate. Nothing here changes `document`, `revision`, `write_token_hash`, `visitor_hash` or `account_id` of an
 * existing row, and only `duplicate` inserts.
 *
 * `hide` and `markDeleted` set an access-control mark and revoke the design's active share link in one atomic step.
 * They do not by themselves close the other ways into a kitchen (the visitor cookie and write token, a share `issue`):
 * no caller may expose them until the open, save, resume and share paths refuse a marked row.
 */
export interface AccountKitchenStore {
  /** Listed kitchens, newest first by `(updated_at desc, id desc)`. Hidden and deleted kitchens are never returned. */
  listPage(request: KitchenPageRequest): Promise<KitchenPage>;
  /** How many kitchens `listPage` would list for the account across all pages. */
  countListed(accountId: string): Promise<number>;
  /** Sets the name only: `updated_at` and `revision` stay, so an open editor gets no conflict. */
  rename(rename: KitchenRename): Promise<KitchenRenameOutcome>;
  /** Copies a listed kitchen to a new row of the same account, with no write token, no visitor and no marks. */
  duplicate(
    duplication: KitchenDuplication,
  ): Promise<KitchenDuplicationOutcome>;
  /** Hides a sent kitchen from its owner's list. The stored row stays. */
  hide(mark: KitchenMark): Promise<KitchenHideOutcome>;
  /** Deletes an unsent kitchen from its owner's list by a mark. The stored row stays. */
  markDeleted(mark: KitchenMark): Promise<KitchenDeleteOutcome>;
}

/**
 * The contact flow's port, kept apart from `AccountKitchenStore` so an account route never holds it. It is scoped by
 * design id alone, because the contact flow also sends designs no account owns, so the caller must pass an id it has
 * already verified (`loadOwned`); this port checks no owner.
 */
export interface SentMarkStore {
  /**
   * Records that a request for the design was stored: sets `sent_at` once, so the first instant stands and nothing ever
   * clears it. A design that is already sent, hidden or deleted by its client, or unknown, is left unchanged.
   */
  markSent(designId: DesignId): Promise<void>;
}

const CURSOR_UPDATED_AT_SHAPE =
  /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/;
const CURSOR_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const MILLISECOND_PREFIX_LENGTH = 23;

/** Whether a value is a cursor this store could have issued: a real UTC instant and a design-id-shaped id. */
export function isKitchenCursor(value: unknown): value is KitchenCursor {
  if (typeof value !== "object" || value === null) return false;
  const { updatedAt, id } = value as Record<string, unknown>;
  return (
    typeof updatedAt === "string" &&
    typeof id === "string" &&
    CURSOR_UPDATED_AT_SHAPE.test(updatedAt) &&
    CURSOR_ID_SHAPE.test(id) &&
    isCalendarInstant(updatedAt)
  );
}

/** The cursor text of a stored instant: a `Date`'s milliseconds, padded to the column's microseconds. */
export function cursorTextOf(instant: Date): string {
  return instant.toISOString().replace(/Z$/, "000Z");
}

/** The display instant of cursor text, at the milliseconds a `Date` holds. */
export function instantOfCursorText(updatedAt: string): Date {
  return new Date(`${updatedAt.slice(0, MILLISECOND_PREFIX_LENGTH)}Z`);
}

/** `Date` rolls an impossible day over (`02-31` reads as `03-03`) and the database refuses it, so the round trip is
 *  the check. */
function isCalendarInstant(updatedAt: string): boolean {
  const milliseconds = `${updatedAt.slice(0, MILLISECOND_PREFIX_LENGTH)}Z`;
  const instant = new Date(milliseconds);
  return (
    !Number.isNaN(instant.getTime()) && instant.toISOString() === milliseconds
  );
}

export function requireValidKitchenPageRequest({
  accountId,
  limit,
  after,
}: KitchenPageRequest): void {
  requireAccountIdShape(accountId, "list kitchens");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_KITCHEN_PAGE_SIZE) {
    throw new Error(
      `Refusing to list kitchens: a page holds 1 to ${String(MAX_KITCHEN_PAGE_SIZE)} of them.`,
    );
  }
  if (after !== undefined && !isKitchenCursor(after)) {
    throw new Error(
      "Refusing to list kitchens: the cursor is not one this store issues.",
    );
  }
}

/** What `judgeKitchenName` refuses (control, line and paragraph separators, lone surrogates) plus the format characters
 *  it removes: a name reaching the store has been judged, so none can remain, and a NUL or lone surrogate would be a
 *  driver error rather than a refusal. */
const UNSTORABLE_NAME_CHARACTER = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

export function requireValidKitchenName(
  name: unknown,
  operation: AccountKitchenStoreOperation,
): void {
  if (typeof name === "string" && isStorableKitchenName(name)) return;
  throw new Error(
    `Refusing to ${operation}: a kitchen name must be 1 to ${String(MAX_KITCHEN_NAME_CHARACTERS)} characters ` +
      `with no control or format character. The table would refuse the row.`,
  );
}

function isStorableKitchenName(name: string): boolean {
  const length = Array.from(name).length;
  return (
    length >= 1 &&
    length <= MAX_KITCHEN_NAME_CHARACTERS &&
    !UNSTORABLE_NAME_CHARACTER.test(name)
  );
}
