import "server-only";

import { createHash } from "node:crypto";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

// The breached-password check (ADR 0169 decision 2). Have I Been Pwned's range API is asked by k-anonymity: of the
// password's SHA-1, only the first five hexadecimal characters leave this server, and the suffixes that come back are
// compared here. The password, its SHA-1 and its suffix are never returned, thrown or logged.

/** `breached` only when the corpus lists the password. `unknown` is every other answer the service can give. */
export type BreachCheckOutcome = "breached" | "not-breached" | "unknown";

const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";
const PREFIX_LENGTH = 5;
const SUFFIX_LENGTH = 35;
const DEADLINE_MILLISECONDS = 1_500;
/** The padded answer is about 40 KiB; a body far past that is not the service's. Counted in bytes while it streams. */
const MAX_ANSWER_BYTES = 512 * 1024;

/** One line of the answer: 35 hexadecimal characters, a colon and a count. */
const RANGE_LINE = /^([0-9A-F]{35}):(\d{1,10})$/;

/**
 * Whether the breach corpus lists `password`. Never rejects, and never answers `breached` on an unreachable, late,
 * non-200 or unreadable answer: those are `unknown` and one line is logged, because the policy accepts a password on
 * the length rule alone when the service is down (owner decision Q-L2). Padding entries, which carry a count of 0,
 * match nothing.
 */
export async function isBreachedPassword(
  password: string,
): Promise<BreachCheckOutcome> {
  const digest = createHash("sha1").update(password, "utf8").digest("hex");
  const prefix = digest.slice(0, PREFIX_LENGTH).toUpperCase();
  const suffix = digest.slice(PREFIX_LENGTH).toUpperCase();
  const listing = await fetchRangeListing(prefix);
  if (listing === undefined) {
    reportAccountEvent({ event: "breach-check", outcome: "unavailable" });
    return "unknown";
  }
  return listsSuffix(listing, suffix) ? "breached" : "not-breached";
}

async function fetchRangeListing(prefix: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${RANGE_ENDPOINT}${prefix}`, {
      method: "GET",
      headers: { "Add-Padding": "true" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DEADLINE_MILLISECONDS),
    });
    if (response.status !== 200) return undefined;
    const body = await readUtf8BodyWithLimit(response.body, MAX_ANSWER_BYTES);
    return body.ok ? body.value : undefined;
  } catch {
    // The reason is dropped: a thrown value from the transport may quote the request, and the request names the prefix.
    return undefined;
  }
}

function listsSuffix(listing: string, suffix: string): boolean {
  if (suffix.length !== SUFFIX_LENGTH) return false;
  return listing.split("\n").some((rawLine) => {
    const match = RANGE_LINE.exec(rawLine.trim());
    return match !== null && match[1] === suffix && Number(match[2]) > 0;
  });
}
