import "server-only";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  isLoopbackPublicOrigin,
  readPublicOrigin,
} from "@/lib/server/public-origin";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

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
/** A siteverify answer is a few hundred bytes; a body far past this is not Cloudflare's. Counted while it streams. */
const MAX_ANSWER_BYTES = 64 * 1024;

/**
 * Cloudflare's published always-pass, always-fail and already-spent secrets. The service answers them with the
 * placeholder host `example.com` and no `action`, so under one of them `success` alone could decide. That is allowed
 * only where the public origin is a loopback one (which `readPublicOrigin` accepts only beside the e2e fake sender's
 * flag, so no deployment has one): there a test secret proves nothing and nothing is at stake. Anywhere else a test
 * secret is a misconfiguration, and the answer is `unavailable` (ADR 0169 decision 5, criterion 5 as amended).
 */
const DOCUMENTED_TEST_SECRETS: ReadonlySet<string> = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export const TEST_SECRET_WARNING = `turnstile: a documented Cloudflare test secret is in use (${TURNSTILE_SECRET_KEY_VARIABLE}); challenges prove nothing`;

export const TEST_SECRET_REFUSED_LINE = `turnstile: a documented Cloudflare test secret is set (${TURNSTILE_SECRET_KEY_VARIABLE}) outside the loopback e2e environment; every challenge is refused as unavailable`;

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
 * and answers `passed` only when it said `success` and the `action` and the `hostname` are the ones this deployment
 * expects; only a documented test secret in the loopback e2e environment is judged on `success` alone, and a test
 * secret anywhere else is `unavailable` without asking. Never rejects, and never puts the token, the secret or the
 * client's address into a thrown value or a log line.
 */
export async function verifyTurnstile(
  request: TurnstileVerificationRequest,
): Promise<TurnstileOutcome> {
  const secret = secretFromEnvironment();
  if (secret === undefined) return reportUnavailable();
  const isTestSecret = DOCUMENTED_TEST_SECRETS.has(secret);
  if (isTestSecret && !isLoopbackPublicOrigin(process.env)) {
    return refuseTestSecretOutsideLoopback();
  }
  if (isTestSecret) warnOnceOfTestSecret();
  if (!isPlausibleToken(request.token)) return "failed";
  const answer = await askSiteverify({ secret, request });
  if (answer === undefined) return reportUnavailable();
  return judgeAnswer({ answer, request, isTestSecret });
}

function judgeAnswer({
  answer,
  request,
  isTestSecret,
}: {
  answer: SiteverifyAnswer;
  request: TurnstileVerificationRequest;
  /** True only in the loopback e2e environment: verifyTurnstile answers a test secret anywhere else before asking. */
  isTestSecret: boolean;
}): TurnstileOutcome {
  if (!answer.success) return reportRefused();
  if (isTestSecret) return "passed";
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

function refuseTestSecretOutsideLoopback(): "unavailable" {
  console.error(TEST_SECRET_REFUSED_LINE);
  return reportUnavailable();
}

function reportRefused(): "failed" {
  reportAccountEvent({ event: "turnstile", outcome: "refused" });
  return "failed";
}

function reportUnavailable(): "unavailable" {
  reportAccountEvent({ event: "turnstile", outcome: "unavailable" });
  return "unavailable";
}
