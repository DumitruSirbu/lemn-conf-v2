import "server-only";

import { randomBytes } from "node:crypto";

import type { MintVisitor, RequestVisitor } from "@lemnaria/persistence";
import type { NextRequest, NextResponse } from "next/server";

import { sha256Hex } from "./sha256-hex";

/**
 * The one visitor cookie (ADR 0114 decision 1). The `__Host-` prefix makes the browser enforce `Secure`, `Path=/`
 * and no `Domain`, so a sibling subdomain cannot overwrite it. For that reason `cookies.delete` must never be used
 * on this name: Next serialises it as `Set-Cookie` without `Secure`, and the browser silently ignores a `__Host-`
 * cookie set without one, so the clear would look like it worked. `clearVisitorCookie` is the only way this name
 * is cleared.
 */
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";

/** 256 bits from the platform CSPRNG, as `write-token.ts` draws: a secret drawn from `Math.random` is not one. */
const VISITOR_TOKEN_BYTES = 32;

/** Thirty days, sliding, refreshed by every successful save: ADR 0114 decision 1, restating ADR 0019 decision 7's
 *  retention window rather than inventing a number. */
const VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Exactly what `randomBytes(32).toString("base64url")` produces: 256 bits at 6 bits per character with no `=`
 *  padding is `ceil(256 / 6) = 43` characters. The one predicate that separates a well-formed carried cookie from a
 *  malformed one: the reuse-or-mint decision rests on this check. */
const WELL_FORMED_VISITOR_VALUE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Every attribute both `setVisitorCookie` and `clearVisitorCookie` emit, from one constant so the two cannot drift:
 * a `__Host-` cookie cleared with a different `Path` or `Secure` is ignored, not cleared. No environment conditional
 * on `Secure`: browsers treat `http://localhost` as a secure context, so local development and Playwright still work.
 */
const VISITOR_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

/** A minted visitor identity: the cookie's own fresh value, and the tagged instruction `mint` needs to store it
 *  (ADR 0114 Amendment H1). */
export interface ResolvedVisitor {
  readonly value: string;
  readonly mintVisitor: MintVisitor;
}

/**
 * The mint's rotation decision (ADR 0114 Amendment H1: "Rotate on mint"), made once and handed to both the
 * repository insert and the cookie. Every mint issues a fresh value and none is re-emitted: a well-formed carried
 * value is tagged by `mintVisitor` as the one the repository's transaction moves every existing row away from, so
 * the browser keeps its designs under the new identity. Either way the mint sets the cookie; `POST /api/designs`
 * never answers 201 without one. It only reads the cookie, so a caller can decide whether to proceed (the
 * cross-site refusal runs first) before any state changes.
 */
export function resolveVisitorForMint(
  request: Pick<NextRequest, "cookies">,
): ResolvedVisitor {
  const carried = readVisitorValue(request.cookies);
  const value = randomBytes(VISITOR_TOKEN_BYTES).toString("base64url");
  const hash = sha256Hex(value);
  const mintVisitor: MintVisitor =
    carried !== undefined && WELL_FORMED_VISITOR_VALUE.test(carried)
      ? {
          kind: "rotate",
          visitorHash: hash,
          fromVisitorHash: sha256Hex(carried),
        }
      : { kind: "fresh", visitorHash: hash };
  return { value, mintVisitor };
}

/** Sets the visitor cookie to `value` with a fresh 30-day `Max-Age`. Only the mint and `refreshVisitorCookie` may
 *  call it. */
export function setVisitorCookie(response: NextResponse, value: string): void {
  response.cookies.set(VISITOR_COOKIE_NAME, value, {
    ...VISITOR_COOKIE_ATTRIBUTES,
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * A successful save's refresh: re-emits the request's own well-formed value, so the lifetime slides with use as the
 * write-token cookie's does. Never mints: an absent or malformed value is left alone, since minting here would hand
 * a browser with no (or a tampered) identity a fresh one on the strength of a save to a design it may not own.
 *
 * Callers must gate this on `saveAuthorized`'s `ownsVisitor` (ADR 0114 Amendment H3) first: a well-formed value may
 * no longer be the row's current one (another tab may have rotated it), and re-emitting it would lock the browser
 * out of every design it owns. The well-formedness check here only keeps this function total.
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
 * Clears the visitor cookie: the resume routes' tool for "this browser's identity matches no design". Emits the
 * same attributes as `setVisitorCookie` with `Max-Age=0`, and never `response.cookies.delete`, which drops `Secure`
 * (see the cookie name's doc).
 */
export function clearVisitorCookie(response: NextResponse): void {
  response.cookies.set(VISITOR_COOKIE_NAME, "", {
    ...VISITOR_COOKIE_ATTRIBUTES,
    maxAge: 0,
  });
}

/**
 * What a resume route read from the cookie, before it decides anything. Three states, because `absent` never clears
 * (nothing to clear, no query issued) while `malformed` clears and issues no query: collapsing them, as
 * `resolveVisitorForMint` does for its own purposes, would clear a cookie that was never there.
 */
export type CarriedVisitorCookie =
  | { readonly kind: "absent" }
  | { readonly kind: "malformed" }
  | { readonly kind: "well-formed"; readonly hash: string };

/** Reads and shape-checks the cookie for a resume route. It never sets or clears, so deciding first and mutating
 *  second stays possible. */
export function readVisitorCookieForResume(
  cookies: VisitorCookieReader,
): CarriedVisitorCookie {
  const carried = readVisitorValue(cookies);
  if (carried === undefined) return { kind: "absent" };
  if (!WELL_FORMED_VISITOR_VALUE.test(carried)) return { kind: "malformed" };
  return { kind: "well-formed", hash: sha256Hex(carried) };
}

/**
 * The share route's read: the hash if well-formed, otherwise `undefined`. It collapses `readVisitorCookieForResume`'s
 * absent and malformed on purpose: the share route's refusal is identical either way and issues no query.
 */
export function readVisitorHash(
  cookies: VisitorCookieReader,
): string | undefined {
  const carried = readVisitorValue(cookies);
  if (carried === undefined || !WELL_FORMED_VISITOR_VALUE.test(carried))
    return undefined;
  return sha256Hex(carried);
}

/**
 * A save's read: the tagged shape `saveAuthorized` needs to answer whether the request's value is the row's current
 * one. Built on `readVisitorHash`'s collapse of absent and malformed, because a request without a well-formed cookie
 * gets no refresh either way (ADR 0114 Amendment H3).
 */
export function resolveRequestVisitor(
  cookies: VisitorCookieReader,
): RequestVisitor {
  const hash = readVisitorHash(cookies);
  return hash === undefined
    ? { kind: "absent" }
    : { kind: "present", visitorHash: hash };
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
