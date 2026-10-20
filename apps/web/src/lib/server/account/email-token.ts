import "server-only";

import { randomBytes } from "node:crypto";

import { sha256Hex } from "@/lib/server/sha256-hex";

// The single-use value an account e-mail carries after `#` (ADR 0172 decision 5). The mail holds the value; the
// database holds only its SHA-256, so a leaked table cannot be turned into a working link.

/** 256 bits from the platform CSPRNG, as the session value is drawn: `ceil(256 / 6) = 43` base64url characters. */
const EMAIL_TOKEN_BYTES = 32;

/** Exactly what `randomBytes(32).toString("base64url")` produces, and the only length `buildAccountMail` accepts. */
const WELL_FORMED_EMAIL_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const MILLISECONDS_PER_MINUTE = 60 * 1_000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

/** How long a confirmation link works (ADR 0172 decision 5). */
const VERIFY_EMAIL_TOKEN_LIFETIME_HOURS = 24;

/** How long a reset link works (ADR 0172 decision 5): short, since it opens the account without the old password. */
const RESET_PASSWORD_TOKEN_LIFETIME_MINUTES = 30;

/**
 * How long an e-mail-change link works. PROVISIONAL: no record gives a figure. 24 hours as for a confirmation, since
 * the link goes to an inbox the person has to open, and it changes the address only; the password was asked for at the
 * request.
 */
const EMAIL_CHANGE_TOKEN_LIFETIME_HOURS = 24;

/**
 * How long the undo link of an address change works: the owner's ruling of 2026-10-20 (O28c), 24 hours and not the
 * architect's 7 days. Hours, since the figure is far shorter than a day count could express.
 */
const EMAIL_CHANGE_REVERT_TOKEN_LIFETIME_HOURS = 24;

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

export function resetPasswordTokenExpiry(): Date {
  return new Date(
    Date.now() +
      RESET_PASSWORD_TOKEN_LIFETIME_MINUTES * MILLISECONDS_PER_MINUTE,
  );
}

export function emailChangeTokenExpiry(): Date {
  return new Date(
    Date.now() + EMAIL_CHANGE_TOKEN_LIFETIME_HOURS * MILLISECONDS_PER_HOUR,
  );
}

export function emailChangeRevertTokenExpiry(): Date {
  return new Date(
    Date.now() +
      EMAIL_CHANGE_REVERT_TOKEN_LIFETIME_HOURS * MILLISECONDS_PER_HOUR,
  );
}
