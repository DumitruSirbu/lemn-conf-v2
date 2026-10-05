import "server-only";

import { randomBytes } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { sha256Hex } from "./sha256-hex";

/** 256 bits from the platform CSPRNG (ADR 0019 decision 1), from `node:crypto` rather than `Math.random`,
 *  which is not a secret source. */
const WRITE_TOKEN_BYTES = 32;

/**
 * Thirty days, sliding: every successful save pushes the expiry out (`refreshWriteTokenCookie`), so a customer
 * still editing never loses access. Until M8's customer profiles (ADR 0115) there is no way back from an
 * expired cookie.
 */
const WRITE_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const COOKIE_NAME_PREFIX = "lemnaria_write_token_";

/** The token as the browser will hold it, beside the only form the database ever sees. */
export interface MintedWriteToken {
  readonly token: string;
  readonly hash: string;
}

/** Mints a fresh write credential for a design about to be created. The raw token leaves the server
 *  exactly once, in the `Set-Cookie` header; only its hash is persisted. */
export function mintWriteToken(): MintedWriteToken {
  const token = randomBytes(WRITE_TOKEN_BYTES).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

/**
 * Hands the token to the creating browser and to nothing else. `httpOnly` keeps it out of `document.cookie`;
 * `secure` keeps it off plaintext (browsers treat `http://localhost` as secure, so local development works);
 * `sameSite: "lax"` stops a cross-site form post carrying it; the per-design name and path mean a browser only
 * sends the credential for the one design being written. The token never appears in a URL, response body or log.
 */
export function setWriteTokenCookie(
  response: NextResponse,
  { designId, token }: { designId: string; token: string },
): void {
  response.cookies.set(cookieNameFor(designId), token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: writePathFor(designId),
    maxAge: WRITE_TOKEN_MAX_AGE_SECONDS,
  });
}

/**
 * Anything that can be asked for a cookie by name, declared structurally so a caller need not build a `NextRequest`.
 * The only reader that ever holds the credential is `NextRequest.cookies` inside `/api/designs/{id}`: the cookie is
 * scoped `Path=/api/designs/{id}`, so no page or other route request carries it. A server component's `cookies()`
 * satisfies this interface and compiles but can only answer "no credential", for the author too, which is why
 * `app/[locale]/d/[id]/page.tsx` defers write access to a client probe. Do not read this outside that route.
 */
export interface WriteCookieReader {
  get(name: string): { readonly value: string } | undefined;
}

/**
 * Whether this browser presents a write credential for `designId`: presence, not validity, and not the authorisation
 * decision; it lets a UI stop offering edits it cannot perform. The row decides validity (`saveAuthorized` makes the
 * hash part of the `update` predicate): do not "improve" this into a check a later write trusts, the time-of-check/
 * time-of-use window ADR 0019 rejects. A stale or forged cookie reads as writable and learns otherwise on its first
 * save (`unauthorized`).
 */
export function hasWriteCredentialFor(
  cookies: WriteCookieReader,
  designId: string,
): boolean {
  return readWriteToken(cookies, designId) !== undefined;
}

/** The hash of the write token this request carries for `designId`, or `undefined`. Returning the hash keeps
 *  the raw credential inside this module: a route handler that never holds it cannot log it. */
export function readWriteTokenHash(
  request: NextRequest,
  designId: string,
): string | undefined {
  const token = readWriteToken(request.cookies, designId);
  return token === undefined ? undefined : sha256Hex(token);
}

/**
 * Slides the cookie's expiry forward after a successful write. The token is read and re-issued inside this
 * module, so a route handler never holds the raw value. A request with no cookie is left alone: this refreshes
 * and never mints, which is `POST /api/designs`'s job.
 */
export function refreshWriteTokenCookie(
  { request, response }: { request: NextRequest; response: NextResponse },
  designId: string,
): void {
  const token = readWriteToken(request.cookies, designId);
  if (token === undefined) return;
  setWriteTokenCookie(response, { designId, token });
}

function readWriteToken(
  cookies: WriteCookieReader,
  designId: string,
): string | undefined {
  const token = cookies.get(cookieNameFor(designId))?.value;
  return token === undefined || token === "" ? undefined : token;
}

function cookieNameFor(designId: string): string {
  return `${COOKIE_NAME_PREFIX}${designId}`;
}

function writePathFor(designId: string): string {
  return `/api/designs/${encodeURIComponent(designId)}`;
}
