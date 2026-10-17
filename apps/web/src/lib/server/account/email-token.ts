import "server-only";

import { randomBytes } from "node:crypto";

import { sha256Hex } from "@/lib/server/sha256-hex";

// The single-use value an account e-mail carries after `#` (ADR 0169 decision 5). The mail holds the value; the
// database holds only its SHA-256, so a leaked table cannot be turned into a working link.

/** 256 bits from the platform CSPRNG, as the session value is drawn: `ceil(256 / 6) = 43` base64url characters. */
const EMAIL_TOKEN_BYTES = 32;

/** Exactly what `randomBytes(32).toString("base64url")` produces, and the only length `buildAccountMail` accepts. */
const WELL_FORMED_EMAIL_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;

/** How long a confirmation link works (ADR 0169 decision 5). */
const VERIFY_EMAIL_TOKEN_LIFETIME_HOURS = 24;

export interface MintedEmailToken {
  /** The value for the link. It is never stored, logged or returned to the client. */
  readonly value: string;
  /** What the database keeps: the SHA-256 hex of `value`. */
  readonly hash: string;
}

export function mintEmailToken(): MintedEmailToken {
  const value = randomBytes(EMAIL_TOKEN_BYTES).toString("base64url");
  return { value, hash: sha256Hex(value) };
}

/** Whether a value a client sent could be a token this module minted; anything else names no row and is not hashed. */
export function isWellFormedEmailToken(value: unknown): value is string {
  return typeof value === "string" && WELL_FORMED_EMAIL_TOKEN.test(value);
}

export function verifyEmailTokenExpiry(): Date {
  return new Date(
    Date.now() + VERIFY_EMAIL_TOKEN_LIFETIME_HOURS * MILLISECONDS_PER_HOUR,
  );
}
