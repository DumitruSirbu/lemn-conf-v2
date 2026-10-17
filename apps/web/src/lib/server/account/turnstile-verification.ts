import "server-only";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { readPublicOrigin } from "@/lib/server/public-origin";

// Server-side verification of a Cloudflare Turnstile token (ADR 0169 decision 5). A write that cannot be challenged
// is refused, so every answer but `passed` ends the request: a failed challenge and an unreachable service differ
// only in the status the route gives (403 and 503), and nothing here answers `passed` by default.

/** `failed`: Cloudflare answered and said no (or the token, action or host did not match). `unavailable`: nothing
 *  could be decided, whether for a missing variable, an unreachable service or an answer that cannot be read. */
export type TurnstileOutcome = "passed" | "failed" | "unavailable";

export const TURNSTILE_SECRET_KEY_VARIABLE = "TURNSTILE_SECRET_KEY";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEADLINE_MILLISECONDS = 3_000;
/** Cloudflare documents a response token as at most 2,048 characters: a longer one cannot be genuine, so it is not sent. */
const MAX_TOKEN_CHARACTERS = 2_048;

/**
 * Cloudflare's published always-pass, always-fail and already-spent secrets. The service answers them with the
 * placeholder host `example.com` and no `action`, so under one of them `success` alone decides. That loses nothing
 * real: a test secret passes or fails everything whatever the host, and the warning below says one is in use.
 */
const DOCUMENTED_TEST_SECRETS: ReadonlySet<string> = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export const TEST_SECRET_WARNING = `turnstile: a documented Cloudflare test secret is in use (${TURNSTILE_SECRET_KEY_VARIABLE}); challenges prove nothing`;

/** The only state of this module: whether the test-secret warning has been written, so it is written once. */
let hasWarnedOfTestSecret = false;

export interface TurnstileVerificationRequest {
  /** The token the widget produced, as the client sent it. */
  readonly token: string;
  /** The `action` the widget on this route was rendered with; siteverify must echo it. */
  readonly expectedAction: string;
  /** The client's address, when the network source has one. Optional for Cloudflare. */
  readonly remoteIp?: string;
}

interface SiteverifyAnswer {
  readonly success: boolean;
  readonly action: string | undefined;
  readonly hostname: string | undefined;
}

/**
 * Reads the secret and the public origin on every call (nothing is fixed at build), asks siteverify with a deadline,
 * and answers `passed` only when it said `success` and, outside a documented test secret, the `action` and the
 * `hostname` are the ones this deployment expects. Never rejects, and never puts the token, the secret or the
 * client's address into a thrown value or a log line.
 */
export async function verifyTurnstile(
  request: TurnstileVerificationRequest,
): Promise<TurnstileOutcome> {
  const secret = secretFromEnvironment();
  if (secret === undefined) return reportUnavailable();
  warnOnceOfTestSecret(secret);
  if (!isPlausibleToken(request.token)) return "failed";
  const answer = await askSiteverify({ secret, request });
  if (answer === undefined) return reportUnavailable();
  return judgeAnswer({ answer, request, secret });
}

function judgeAnswer({
  answer,
  request,
  secret,
}: {
  answer: SiteverifyAnswer;
  request: TurnstileVerificationRequest;
  secret: string;
}): TurnstileOutcome {
  if (!answer.success) return reportRefused();
  if (DOCUMENTED_TEST_SECRETS.has(secret)) return "passed";
  const expectedHostname = expectedHostnameFromEnvironment();
  if (expectedHostname === undefined) return reportUnavailable();
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
        ...(request.remoteIp === undefined
          ? {}
          : { remoteip: request.remoteIp }),
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DEADLINE_MILLISECONDS),
    });
    if (response.status !== 200) return undefined;
    return shapedAnswer(await response.json());
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

function warnOnceOfTestSecret(secret: string): void {
  if (hasWarnedOfTestSecret || !DOCUMENTED_TEST_SECRETS.has(secret)) return;
  hasWarnedOfTestSecret = true;
  console.warn(TEST_SECRET_WARNING);
}

function reportRefused(): "failed" {
  reportAccountEvent({ event: "turnstile", outcome: "refused" });
  return "failed";
}

function reportUnavailable(): "unavailable" {
  reportAccountEvent({ event: "turnstile", outcome: "unavailable" });
  return "unavailable";
}
