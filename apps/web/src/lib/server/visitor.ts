import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

/**
 * The one visitor cookie (ADR 0114 decision 1). Its name carries the `__Host-` prefix so the
 * browser itself enforces `Secure`, `Path=/` and no `Domain` — a sibling subdomain cannot set or
 * overwrite it (cookie tossing), and it is never sent beyond this host. That enforcement is also
 * why `cookies.delete` must never be used for this name: Next's `delete` serialises as `Set-Cookie`
 * with no `Secure` attribute (`next/dist/compiled/@edge-runtime/cookies`), and the browser silently
 * ignores a `__Host-` cookie set without one — the clear would look like it worked and would not
 * (M7 wave 7E3a plan, G7/G8). `clearVisitorCookie` below is the only way this name is ever cleared.
 */
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";

/** 256 bits from the platform CSPRNG, the same source and width `write-token.ts` uses and for the
 *  same reason: a secret drawn from `Math.random` is not a secret. */
const VISITOR_TOKEN_BYTES = 32;

/** Thirty days, sliding, refreshed by every successful save — ADR 0114 decision 1's lifetime row,
 *  which restates ADR 0019 decision 7's retention window rather than inventing a new number. */
const VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Exactly what `randomBytes(32).toString("base64url")` produces: 32 bytes is 256 bits, and
 *  base64url spends 6 bits per character with no `=` padding, so the length is fixed at
 *  `ceil(256 / 6) = 43`. Also the one predicate that tells a well-formed carried cookie from a
 *  malformed one — D1's whole reuse-or-mint decision rests on this single check. */
const WELL_FORMED_VISITOR_VALUE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Every attribute both `setVisitorCookie` and `clearVisitorCookie` emit, drawn from **one**
 * constant so the two can never drift apart (M7 wave 7E3a D4) — a clear whose attributes differed
 * from the set would not necessarily match the cookie the browser is holding, and a `__Host-`
 * cookie that does not match on `Path` and `Secure` is not cleared at all, it is ignored.
 *
 * No environment conditional on `Secure`: browsers treat `http://localhost` as a secure context, so
 * local development and Playwright keep working without one (measured, criterion 6).
 */
const VISITOR_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

/** A minted or reused visitor identity: the cookie's own value, and the hash `mint` stores. */
export interface ResolvedVisitor {
  readonly value: string;
  readonly hash: string;
}

/**
 * D1's reuse-or-mint decision, made once and handed to both the repository insert and the cookie.
 *
 * A well-formed carried value is reused outright — the mint re-emits it with a fresh `Max-Age`
 * rather than replacing it, so a browser that already has an identity keeps it across every design
 * it mints. An absent or malformed value is replaced with a fresh one. Either way the mint **always
 * sets the cookie**; there is no branch in which `POST /api/designs` answers 201 without one.
 *
 * Reads the cookie only — it neither sets nor clears anything, so a caller can decide whether to
 * proceed (D6's cross-site refusal runs first) before any state changes.
 */
export function resolveVisitorForMint(
  request: Pick<NextRequest, "cookies">,
): ResolvedVisitor {
  const carried = readVisitorValue(request.cookies);
  const value =
    carried !== undefined && WELL_FORMED_VISITOR_VALUE.test(carried)
      ? carried
      : randomBytes(VISITOR_TOKEN_BYTES).toString("base64url");
  return { value, hash: hashVisitor(value) };
}

/** Sets the visitor cookie to `value`, with a fresh 30-day `Max-Age`. The only two callers are the
 *  mint (D1) and `refreshVisitorCookie`; nothing else may set this cookie. */
export function setVisitorCookie(response: NextResponse, value: string): void {
  response.cookies.set(VISITOR_COOKIE_NAME, value, {
    ...VISITOR_COOKIE_ATTRIBUTES,
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * A successful save's refresh (D1): re-emits the **request's own** well-formed value, so the
 * cookie's lifetime slides with use exactly as the write-token cookie's does. Never mints — an
 * absent or malformed value is left alone, because minting here would hand a browser that arrived
 * with no identity (or a tampered one) a fresh one on the strength of a save to a design it may not
 * even own, which is not this function's decision to make.
 */
export function refreshVisitorCookie({
  request,
  response,
}: {
  request: Pick<NextRequest, "cookies">;
  response: NextResponse;
}): void {
  const carried = readVisitorValue(request.cookies);
  if (carried === undefined || !WELL_FORMED_VISITOR_VALUE.test(carried)) return;
  setVisitorCookie(response, carried);
}

/**
 * Clears the visitor cookie — the resume routes' only tool for "this browser's identity matches no
 * design" (D4). Emits the same attributes `setVisitorCookie` does, with `Max-Age=0`, and **never**
 * `response.cookies.delete`, which drops `Secure` and so cannot clear a `__Host-` cookie at all
 * (see the module doc comment).
 */
export function clearVisitorCookie(response: NextResponse): void {
  response.cookies.set(VISITOR_COOKIE_NAME, "", {
    ...VISITOR_COOKIE_ATTRIBUTES,
    maxAge: 0,
  });
}

/** SHA-256, hex, over the UTF-8 cookie value — the row's `visitor_hash`. Not shared with
 *  `write-token.ts`'s own digest: the two exist for the same reason (a 256-bit secret needs no slow
 *  KDF) but hashing two different secrets, and a shared helper would be a third use short of the
 *  rule this codebase applies before extracting one. Kept private, like `write-token.ts`'s own
 *  `hashWriteToken`: every caller needs the hash of a value this module already resolved, never an
 *  arbitrary one, so `resolveVisitorForMint`'s return is the only way out of this file. */
function hashVisitor(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Anything that can be asked for a cookie by name, declared structurally so a caller need not
 *  build a full `NextRequest` — the same shape `write-token.ts`'s `WriteCookieReader` uses. */
export interface VisitorCookieReader {
  get(name: string): { readonly value: string } | undefined;
}

function readVisitorValue(cookies: VisitorCookieReader): string | undefined {
  const value = cookies.get(VISITOR_COOKIE_NAME)?.value;
  return value === undefined || value === "" ? undefined : value;
}
