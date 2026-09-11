import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

/** 256 bits from the platform CSPRNG — comfortably past ADR 0019's requirement, and drawn from
 *  `node:crypto` rather than `Math.random`, which is seeded predictably and is not a secret source. */
const WRITE_TOKEN_BYTES = 32;

/**
 * Thirty days, **sliding**, to match ADR 0019 decision 7's retention semantics rather than only its
 * number. Retention deletes a design 30 days after it was last *touched*; a cookie fixed at 30 days
 * after *mint* would expire under a customer who is still editing, and until decision 8's emailed
 * recovery link arrives in M8 there is no way back. `refreshWriteTokenCookie` is what makes the two
 * clocks the same clock: every successful save pushes both out together.
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
  return { token, hash: hashWriteToken(token) };
}

/**
 * Hands the token to the creating browser and to nothing else.
 *
 * `httpOnly` keeps it out of `document.cookie`, so an XSS foothold cannot read it; `secure` keeps it
 * off plaintext transport (browsers treat `http://localhost` as a secure context, so this does not
 * break local development); `sameSite: "lax"` stops a cross-site form post from carrying it; and the
 * per-design name and path mean a browser only ever sends the credential for the one design being
 * written. The token never appears in a URL, a response body, or a log line.
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
 * Anything that can be asked for a cookie by name. Declared structurally so a caller need not build
 * a `NextRequest` it does not have.
 *
 * **The only reader that ever holds the credential is `NextRequest.cookies` inside
 * `/api/designs/{id}`.** `setWriteTokenCookie` scopes the cookie `Path=/api/designs/{id}`, so the
 * browser attaches it to that one route and to nothing else: a request for `/[locale]/d/{id}`, for any other
 * page, or for any other API route carries no write-token cookie at all. A `cookies()` store from a
 * server component satisfies this interface structurally and will therefore compile, but it can only
 * ever answer "no credential" — for every visitor, the design's own author included. That is why
 * `app/[locale]/d/[id]/page.tsx` refuses to answer write access and defers to a client probe against the API
 * route. Do not read this from outside `/api/designs/{id}`; the answer is not a lookup that missed,
 * it is a question that route cannot be asked.
 */
export interface WriteCookieReader {
  get(name: string): { readonly value: string } | undefined;
}

/**
 * Whether this browser presents a write credential for `designId`.
 *
 * **Presence, not validity — and this is deliberately not the authorisation decision.** It answers
 * only "does a cookie for this design exist here", which is what a UI needs in order to stop
 * offering edits it cannot perform (`docs/STATUS.md`, M4 hand-off 3). Whether the token is the
 * *right* one is settled where it must be: `saveAuthorized` makes the hash part of the `update`
 * predicate, so the row itself decides. Verifying here and writing there would be exactly the
 * time-of-check/time-of-use window ADR 0019 rejects — so do not "improve" this into a check that a
 * later write then trusts.
 *
 * A browser holding a stale or forged cookie therefore reads as writable and discovers otherwise on
 * its first save, which the client surfaces as `unauthorized`. That is the honest bound of a
 * check that costs no round trip, and it never widens what a write is allowed to do.
 */
export function hasWriteCredentialFor(
  cookies: WriteCookieReader,
  designId: string,
): boolean {
  return readWriteToken(cookies, designId) !== undefined;
}

/** The hash of the write token this request carries for `designId`, or `undefined` when it carries
 *  none. Returning the hash rather than the token keeps the raw credential inside this module — a
 *  route handler has no reason to hold it, and what it never holds it cannot log. */
export function readWriteTokenHash(
  request: NextRequest,
  designId: string,
): string | undefined {
  const token = readWriteToken(request.cookies, designId);
  return token === undefined ? undefined : hashWriteToken(token);
}

/**
 * Slides the cookie's expiry forward after a successful write, so edit access lasts as long as the
 * design does.
 *
 * The token is read and re-issued entirely inside this module — a route handler still never holds
 * the raw value. A request carrying no cookie is left alone: this refreshes an existing credential
 * and never mints one, which is `POST /api/designs`'s job and nothing else's.
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

/** SHA-256, not a slow KDF: the token is 256 bits of uniform randomness rather than a guessable
 *  human secret, so there is no dictionary for a work factor to slow down. The hash exists to make
 *  a database leak non-transferable, not to resist brute force. */
function hashWriteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
