import { createHash, randomBytes } from "node:crypto";

import type { BrowserContext } from "@playwright/test";

// The session cookie as a spec must hold it. `src/lib/server/account/session-cookie.ts` and `sha256-hex.ts` are
// `server-only` and cannot be imported into a Playwright worker, so the three facts a spec needs are written out here
// and `staff-session.test.ts` pins each against the source module.

/** The one session cookie's name. `__Host-` makes the browser require `Secure`, `Path=/` and no `Domain`. */
export const SESSION_COOKIE_NAME = "__Host-lemnaria_session";

const SESSION_VALUE_BYTES = 32;

/** A fresh value of exactly the shape the server mints: 256 random bits, 43 characters of base64url. */
export function mintSessionValue(): string {
  return randomBytes(SESSION_VALUE_BYTES).toString("base64url");
}

/** What the server stores for a value (`account_sessions.token_hash`): SHA-256, hex, over the UTF-8 text. */
export function sessionTokenHashOf(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

type PlaywrightCookie = Parameters<BrowserContext["addCookies"]>[0][number];

/**
 * The cookie as the server sets it: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and host-only. Given as a `domain`
 * with no leading dot, which Chromium stores host-only, as the `__Host-` name requires; `Secure` is kept over the
 * suite's plain-HTTP `localhost` server, which Chromium treats as a secure origin.
 */
export function sessionCookieOf(
  value: string,
  origin: string,
): PlaywrightCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    domain: new URL(origin).hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  };
}
