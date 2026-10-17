import "server-only";

import {
  FAKE_MAIL_FLAG,
  FAKE_MAIL_FLAG_ENABLED,
} from "@/lib/server/mail/fake-mail-flag";
import { PUBLIC_ORIGIN_VARIABLE } from "@/lib/server/public-origin-variable";

export { PUBLIC_ORIGIN_VARIABLE };

export type PublicOriginEnvironment = Readonly<
  Record<string, string | undefined>
>;

/** `unavailable` names the variable and nothing of what it holds, not even whether it was set. */
export type PublicOriginOutcome =
  | { readonly status: "configured"; readonly origin: string }
  | {
      readonly status: "unavailable";
      readonly variable: typeof PUBLIC_ORIGIN_VARIABLE;
    };

/** DNS's own bounds (RFC 1035 §2.3.4): a longer name never resolves, so it is a typo, not a host. */
const MAX_HOST_NAME_LENGTH = 253;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** A top-level label starts with a letter, so the host is a name: the URL standard reads one ending in a number as an
 *  IPv4 address and rewrites it. */
const TOP_LEVEL_LABEL = /^[a-z]/;

/** The developer's own machine, never a reachable address: accepted only beside the e2e fake sender's flag, and then
 *  over plain `http:` too. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/** The URL standard accepts port 0, which no server listens on: a link under it opens nothing. */
const UNUSABLE_PORT = "0";

const UNAVAILABLE: PublicOriginOutcome = {
  status: "unavailable",
  variable: PUBLIC_ORIGIN_VARIABLE,
};

/**
 * The site's public origin, for a link the server writes into a message: never the request's `Host`, which the sender
 * of the request chose. Pure: the environment is handed in. It never throws.
 *
 * Accepted is exactly an origin as the URL standard serialises one, so a value that parses only after normalising
 * (a path, a trailing `/`, userinfo, upper case, an explicit default port, a Unicode host, whitespace) is unavailable,
 * as is plain `http:` anywhere but a loopback host, an address literal that is not a loopback one, and a host ending
 * in a dot. A loopback host is accepted only in an environment that also holds the e2e fake sender's flag, which no
 * deployment sets, so no real notice can carry one.
 */
export function readPublicOrigin(
  environment: PublicOriginEnvironment,
): PublicOriginOutcome {
  const value = ownValue(environment, PUBLIC_ORIGIN_VARIABLE);
  if (value === undefined) return UNAVAILABLE;
  const kind = originKindOf(value);
  const isAccepted =
    kind === "public" ||
    (kind === "loopback" && isTheFakeSendersEnvironment(environment));
  return isAccepted ? { status: "configured", origin: value } : UNAVAILABLE;
}

type OriginKind = "public" | "loopback" | "unusable";

function originKindOf(value: string): OriginKind {
  const url = parsedUrl(value);
  if (url === undefined || url.origin !== value) return "unusable";
  if (url.port === UNUSABLE_PORT) return "unusable";
  if (LOOPBACK_HOSTS.has(url.hostname)) {
    return url.protocol === "https:" || url.protocol === "http:"
      ? "loopback"
      : "unusable";
  }
  return url.protocol === "https:" && isDnsHostName(url.hostname)
    ? "public"
    : "unusable";
}

/** The fake sender's own opt-in, read as it reads it: only this exact value. */
function isTheFakeSendersEnvironment(
  environment: PublicOriginEnvironment,
): boolean {
  return ownValue(environment, FAKE_MAIL_FLAG) === FAKE_MAIL_FLAG_ENABLED;
}

function parsedUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/** Letters, digits and inner hyphens in dot-separated labels: an ASCII host, so an IDN must be written in punycode. */
function isDnsHostName(hostName: string): boolean {
  const labels = hostName.split(".");
  return (
    hostName.length <= MAX_HOST_NAME_LENGTH &&
    labels.every((label) => DNS_LABEL.test(label)) &&
    TOP_LEVEL_LABEL.test(labels[labels.length - 1] ?? "")
  );
}

/** Only the environment's own string member: an inherited name is not set, and a getter that throws reads as unset. */
function ownValue(
  environment: PublicOriginEnvironment,
  name: string,
): string | undefined {
  try {
    if (!Object.hasOwn(environment, name)) return undefined;
    const value: unknown = environment[name];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
