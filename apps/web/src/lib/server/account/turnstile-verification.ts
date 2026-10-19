import "server-only";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  isLoopbackPublicOrigin,
  readPublicOrigin,
} from "@/lib/server/public-origin";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

// Server-side verification of a Cloudflare Turnstile token (ADR 0172 decision 5, Amendment E, item 5). Two kinds of "could
// not decide" are kept apart because they are answered oppositely. A deployment that is MISCONFIGURED (`not-configured`)
// must not silently lose its check, so the route refuses with 503 and the log is loud. A Cloudflare that cannot be
// REACHED (`unreachable`) while a token was presented is the owner's ruling of 2026-10-18: the request proceeds as if
// the challenge had passed, one `turnstile`/`unavailable` line is logged per occurrence, and the rate limiters (which
// still run in full) are the compensating control. Nothing here answers `passed` for an unreachable service: the
// route decides what `unreachable` means, and an empty token never reaches the network (it is `failed`).

/**
 * `failed`: Cloudflare answered and said no (or the token, action or host did not match), or the token is empty or too
 * long to be genuine. `unreachable`: a token was presented and siteverify could not be asked or its answer could not be
 * read (network error, timeout, a status other than 200, an unreadable body). `not-configured`: the deployment cannot
 * judge a challenge at all (no secret, no public origin, or a documented test secret outside the loopback e2e
 * environment).
 */
export type TurnstileOutcome =
  | "passed"
  | "failed"
  | "unreachable"
  | "not-configured";

export const TURNSTILE_SECRET_KEY_VARIABLE = "TURNSTILE_SECRET_KEY";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEADLINE_MILLISECONDS = 3_000;
/** Cloudflare documents a response token as at most 2,048 characters: a longer one cannot be genuine, so it is not
 *  sent. */
const MAX_TOKEN_CHARACTERS = 2_048;
/** A siteverify answer is a few hundred bytes; a body far past this is not Cloudflare's. Counted while it streams. */
const MAX_ANSWER_BYTES = 64 * 1024;

/**
 * Cloudflare's published always-pass, always-fail and already-spent secrets. The service answers them with the
 * placeholder host `example.com` and no `action`, so under one of them `success` alone could decide. That is allowed
 * only where the public origin is a loopback one (which `readPublicOrigin` accepts only beside the e2e fake sender's
 * flag, so no deployment has one): there a test secret proves nothing and nothing is at stake. Anywhere else a test
 * secret is a misconfiguration, and the answer is `unavailable` (ADR 0172 decision 5, criterion 5 as amended).
 */
const DOCUMENTED_TEST_SECRETS: ReadonlySet<string> = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export const TEST_SECRET_WARNING = `turnstile: a documented Cloudflare test secret is in use (${TURNSTILE_SECRET_KEY_VARIABLE}); challenges prove nothing`;

export const TEST_SECRET_REFUSED_LINE = `turnstile: a documented Cloudflare test secret is set (${TURNSTILE_SECRET_KEY_VARIABLE}) outside the loopback e2e environment; every challenge is refused as not configured`;

export const SECRET_MISSING_LINE = `turnstile: ${TURNSTILE_SECRET_KEY_VARIABLE} is missing or empty; every challenge is refused as not configured`;

export const PUBLIC_ORIGIN_MISSING_LINE =
  "turnstile: LEMNARIA_PUBLIC_ORIGIN is missing or unusable, so the hostname siteverify must report is unknown; every challenge is refused as not configured";

/** The only state of this module: whether the test-secret warning has been written, so it is written once. */
let hasWarnedOfTestSecret = false;

export interface TurnstileVerificationRequest {
  /** The token the widget produced, as the client sent it. */
  readonly token: string;
  /** The `action` the widget on this route was rendered with; siteverify must echo it. */
  readonly expectedAction: string;
}

interface SiteverifyAnswer {
  readonly success: boolean;
  readonly action: string | undefined;
  readonly hostname: string | undefined;
}

/**
 * Reads the secret and the public origin on every call (nothing is fixed at build), asks siteverify with a deadline,
 * and answers `passed` only when it said `success` and the `action` and the `hostname` are the ones this deployment
 * expects; only a documented test secret in the loopback e2e environment is judged on `success` alone. A missing
 * secret, a missing public origin and a test secret anywhere else are `not-configured` without asking. An empty or
 * oversized token is `failed` without asking. Only when a plausible token was sent and siteverify could not be asked or
 * read is the answer `unreachable`. Never rejects, and never puts the token, the secret or the client's address into a
 * thrown value or a log line.
 */
export async function verifyTurnstile(
  request: TurnstileVerificationRequest,
): Promise<TurnstileOutcome> {
  const configuration = readConfiguration();
  if (configuration.kind === "not-configured") return "not-configured";
  const { secret, expectedHostname, isTestSecret } = configuration;
  if (!isPlausibleToken(request.token)) return "failed";
  const answer = await askSiteverify({ secret, request });
  if (answer === undefined) return reportUnreachable();
  return judgeAnswer({ answer, request, expectedHostname, isTestSecret });
}

type TurnstileConfiguration =
  | { readonly kind: "not-configured" }
  | {
      readonly kind: "configured";
      readonly secret: string;
      /** Undefined only under a test secret in the loopback e2e environment, where no hostname is compared. */
      readonly expectedHostname: string | undefined;
      readonly isTestSecret: boolean;
    };

/** Everything the deployment must hold for a challenge to mean anything; each gap is logged loudly, each call. */
function readConfiguration(): TurnstileConfiguration {
  const secret = secretFromEnvironment();
  if (secret === undefined) return reportNotConfigured(SECRET_MISSING_LINE);
  const isTestSecret = DOCUMENTED_TEST_SECRETS.has(secret);
  if (isTestSecret) {
    if (!isLoopbackPublicOrigin(process.env)) {
      return reportNotConfigured(TEST_SECRET_REFUSED_LINE);
    }
    warnOnceOfTestSecret();
    return {
      kind: "configured",
      secret,
      expectedHostname: undefined,
      isTestSecret,
    };
  }
  const expectedHostname = expectedHostnameFromEnvironment();
  if (expectedHostname === undefined) {
    return reportNotConfigured(PUBLIC_ORIGIN_MISSING_LINE);
  }
  return { kind: "configured", secret, expectedHostname, isTestSecret };
}

function judgeAnswer({
  answer,
  request,
  expectedHostname,
  isTestSecret,
}: {
  answer: SiteverifyAnswer;
  request: TurnstileVerificationRequest;
  expectedHostname: string | undefined;
  /** True only in the loopback e2e environment: readConfiguration refuses a test secret anywhere else. */
  isTestSecret: boolean;
}): TurnstileOutcome {
  if (!answer.success) return reportRefused();
  if (isTestSecret) return "passed";
  const isExpected =
    answer.action === request.expectedAction &&
    answer.hostname?.toLowerCase() === expectedHostname;
  return isExpected ? "passed" : reportRefused();
}

async function askSiteverify({
  secret,
  request,
}: {
  secret: string;
  request: TurnstileVerificationRequest;
}): Promise<SiteverifyAnswer | undefined> {
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: request.token,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DEADLINE_MILLISECONDS),
    });
    if (response.status !== 200) return undefined;
    const body = await readUtf8BodyWithLimit(response.body, MAX_ANSWER_BYTES);
    return body.ok ? shapedAnswer(JSON.parse(body.value)) : undefined;
  } catch {
    // The reason is dropped: a thrown value from the transport or the parser may quote the request body.
    return undefined;
  }
}

function shapedAnswer(body: unknown): SiteverifyAnswer | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { success, action, hostname } = body as Record<string, unknown>;
  if (typeof success !== "boolean") return undefined;
  return {
    success,
    action: typeof action === "string" ? action : undefined,
    hostname: typeof hostname === "string" ? hostname : undefined,
  };
}

function isPlausibleToken(token: string): boolean {
  return token.length > 0 && token.length <= MAX_TOKEN_CHARACTERS;
}

function secretFromEnvironment(): string | undefined {
  const value = process.env[TURNSTILE_SECRET_KEY_VARIABLE];
  return value === undefined || value === "" ? undefined : value;
}

/** The host of `LEMNARIA_PUBLIC_ORIGIN`, which siteverify's `hostname` must equal; undefined while the origin is
 *  unset or unusable, so a deployment that cannot say where it is cannot pass a challenge. */
function expectedHostnameFromEnvironment(): string | undefined {
  const origin = readPublicOrigin(process.env);
  return origin.status === "configured"
    ? new URL(origin.origin).hostname
    : undefined;
}

function warnOnceOfTestSecret(): void {
  if (hasWarnedOfTestSecret) return;
  hasWarnedOfTestSecret = true;
  console.warn(TEST_SECRET_WARNING);
}

/** Misconfiguration is never quiet: one constant line naming the gap, then the account event, on every attempt. */
function reportNotConfigured(line: string): {
  readonly kind: "not-configured";
} {
  console.error(line);
  reportAccountEvent({ event: "turnstile", outcome: "unavailable" });
  return { kind: "not-configured" };
}

function reportRefused(): "failed" {
  reportAccountEvent({ event: "turnstile", outcome: "refused" });
  return "failed";
}

/** One `turnstile`/`unavailable` line per occurrence, so an outage is visible. The line holds no token and no address. */
function reportUnreachable(): "unreachable" {
  reportAccountEvent({ event: "turnstile", outcome: "unavailable" });
  return "unreachable";
}
