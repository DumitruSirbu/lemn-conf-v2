import "server-only";

import { randomBytes } from "node:crypto";

import type { NextResponse } from "next/server";

// The one session cookie (ADR 0169 decision 3), on `visitor.ts`'s model. The value is 256 random bits; the server
// stores only its SHA-256, so the value itself never reaches a URL, a body or a log from here.

/**
 * The `__Host-` prefix makes the browser enforce `Secure`, `Path=/` and no `Domain`, so a sibling subdomain cannot
 * overwrite it. For that reason `cookies.delete` must never be used on this name: Next serialises it as `Set-Cookie`
 * without `Secure`, and the browser silently ignores a `__Host-` cookie set without one, so the clear would look like
 * it worked. `clearSessionCookie` is the only way this name is cleared.
 */
export const SESSION_COOKIE_NAME = "__Host-lemnaria_session";

/** 256 bits from the platform CSPRNG, as `write-token.ts` and `visitor.ts` draw: `Math.random` yields no secret. */
const SESSION_VALUE_BYTES = 32;

/** Exactly what `randomBytes(32).toString("base64url")` produces: `ceil(256 / 6) = 43` characters, no padding. */
const WELL_FORMED_SESSION_VALUE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Every attribute both `setSessionCookie` and `clearSessionCookie` emit, from one constant so the two cannot drift: a
 * `__Host-` cookie cleared with a different `Path` or `Secure` is ignored, not cleared. No environment conditional on
 * `Secure`: browsers treat `http://localhost` as a secure context.
 */
const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

/** Anything that can be asked for a cookie by name, declared structurally as `visitor.ts` does, so a caller need not
 *  build a full `NextRequest`. */
export interface SessionCookieReader {
  get(name: string): { readonly value: string } | undefined;
}

/** A fresh session value. Every sign-in mints one; none is ever reused. */
export function mintSessionValue(): string {
  return randomBytes(SESSION_VALUE_BYTES).toString("base64url");
}

/**
 * Sets the session cookie. `maxAgeSeconds` is the role's absolute lifetime, given once when the session starts and
 * never re-sent: the idle expiry is the server's alone, so the cookie carries one clock and not two.
 */
export function setSessionCookie({
  response,
  value,
  maxAgeSeconds,
}: {
  response: NextResponse;
  value: string;
  maxAgeSeconds: number;
}): void {
  response.cookies.set(SESSION_COOKIE_NAME, value, {
    ...SESSION_COOKIE_ATTRIBUTES,
    maxAge: maxAgeSeconds,
  });
}

/** Clears the session cookie: the same attributes as `setSessionCookie` with `Max-Age=0`, never `cookies.delete`. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_ATTRIBUTES,
    maxAge: 0,
  });
}

/** The carried value if it has the shape this module mints, otherwise `undefined`: an absent and a malformed cookie
 *  read alike, because neither can name a session and the server looks nothing up for either. */
export function readSessionCookie(
  cookies: SessionCookieReader,
): string | undefined {
  const carried = cookies.get(SESSION_COOKIE_NAME)?.value;
  return carried !== undefined && WELL_FORMED_SESSION_VALUE.test(carried)
    ? carried
    : undefined;
}

/** Whether the request carries a value under the session cookie's name, whatever it is. An empty value names no
 *  session and a browser drops a cleared cookie, so only a value counts. A malformed one does: only a hand that edited
 *  it could have made one, and it names a session that is not live. */
export function carriesSessionCookie(cookies: SessionCookieReader): boolean {
  const carried = cookies.get(SESSION_COOKIE_NAME)?.value;
  return carried !== undefined && carried !== "";
}
