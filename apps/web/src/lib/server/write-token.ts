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

/** The hash of the write token this request carries for `designId`, or `undefined` when it carries
 *  none. Returning the hash rather than the token keeps the raw credential inside this module — a
 *  route handler has no reason to hold it, and what it never holds it cannot log. */
export function readWriteTokenHash(
  request: NextRequest,
  designId: string,
): string | undefined {
  const token = readWriteToken(request, designId);
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
  const token = readWriteToken(request, designId);
  if (token === undefined) return;
  setWriteTokenCookie(response, { designId, token });
}

function readWriteToken(
  request: NextRequest,
  designId: string,
): string | undefined {
  const token = request.cookies.get(cookieNameFor(designId))?.value;
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
