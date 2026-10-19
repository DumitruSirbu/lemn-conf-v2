import "server-only";

import { isKitchenCursor, type KitchenCursor } from "@lemnaria/persistence";

import { KITCHEN_CURSOR_PARAMETER } from "@/account/kitchens/kitchens-wire-contract";

// The cursor on the wire is the store's `KitchenCursor` as base64url JSON. It is not signed, and need not be: it only
// names a position, and the store applies it under the session's own account predicate, so a forged one can move the
// page and reach no row of another account.

/** A cursor is the last row's instant and id, about 100 characters encoded; the bound refuses a body-sized value
 *  before it is decoded. */
const LONGEST_CURSOR_TEXT = 256;

const CURSOR_TEXT_SHAPE = /^[A-Za-z0-9_-]+$/;

/** `invalid` is any cursor member this route did not issue: repeated, empty, over-long, not base64url JSON, or not a
 *  cursor the store would issue. */
export type CursorRead =
  | { readonly kind: "first-page" }
  | { readonly kind: "after"; readonly cursor: KitchenCursor }
  | { readonly kind: "invalid" };

export function encodeKitchenCursor(cursor: KitchenCursor): string {
  const { updatedAt, id } = cursor;
  return Buffer.from(JSON.stringify({ updatedAt, id }), "utf8").toString(
    "base64url",
  );
}

export function readCursorParameter(query: URLSearchParams): CursorRead {
  const given = query.getAll(KITCHEN_CURSOR_PARAMETER);
  if (given.length === 0) return { kind: "first-page" };
  const [text] = given;
  if (given.length > 1 || text === undefined) return { kind: "invalid" };
  const cursor = decodeKitchenCursor(text);
  return cursor === undefined ? { kind: "invalid" } : { kind: "after", cursor };
}

function decodeKitchenCursor(text: string): KitchenCursor | undefined {
  if (text.length > LONGEST_CURSOR_TEXT || !CURSOR_TEXT_SHAPE.test(text)) {
    return undefined;
  }
  const decoded = jsonOrUndefined(
    Buffer.from(text, "base64url").toString("utf8"),
  );
  return isKitchenCursor(decoded) ? decoded : undefined;
}

function jsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
