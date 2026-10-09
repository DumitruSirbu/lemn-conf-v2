import "server-only";

import type { MailConfiguration } from "@/lib/server/mail/mail-configuration";
import {
  isSendableMailMessage,
  MAIL_ACCEPTED,
  MAIL_REFUSED_UNSENT,
  type MailFailureKind,
  type MailMessage,
  type MailOutcome,
  type MailSender,
} from "@/lib/server/mail/mail-sender";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

export const RESEND_SEND_URL = "https://api.resend.com/emails";

/** The provider refuses a call without a `User-Agent`. */
export const MAIL_USER_AGENT = "lemnaria-configurator";

/** One bound over the request and the reading of its answer: the customer waits for it. */
export const MAIL_REQUEST_TIMEOUT_MS = 10_000;

const ANSWER_MAX_BYTES = 16 * 1024;

const FIRST_SUCCESS_STATUS = 200;
const FIRST_REDIRECT_STATUS = 300;
const FIRST_SERVER_ERROR_STATUS = 500;
const FIRST_CLIENT_ERROR_STATUS = 400;
const LOWEST_HTTP_STATUS = 100;
const HIGHEST_HTTP_STATUS = 599;
const CONFLICT_STATUS = 409;
const TOO_MANY_REQUESTS_STATUS = 429;

// Compared with, never copied: nothing of the provider's body is kept.
const MISMATCHED_PAYLOAD_NAME = "invalid_idempotent_request";
const RATE_LIMIT_NAME = "rate_limit_exceeded";

const TIMED_OUT: MailOutcome = Object.freeze({ ok: false, kind: "timed-out" });
const UNREACHABLE: MailOutcome = Object.freeze({
  ok: false,
  kind: "unreachable",
});

export interface ResendRequest {
  readonly url: string;
  readonly init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly redirect: "manual";
  };
}

/**
 * Pure. The body is built from named members and never by spreading the message, so nothing a message
 * carries beyond its three fields can become a recipient, a header or markup. The only recipient is the
 * configured inbox.
 */
export function buildResendRequest(
  message: MailMessage,
  configuration: MailConfiguration,
): ResendRequest {
  return {
    url: RESEND_SEND_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": MAIL_USER_AGENT,
        "Idempotency-Key": message.key,
      },
      body: JSON.stringify({
        from: configuration.fromAddress,
        to: [configuration.notificationAddress],
        subject: message.subject,
        text: message.text,
      }),
      redirect: "manual",
    },
  };
}

/**
 * One attempt, never a rejection. The key is held by the closure alone: nothing the sender exposes,
 * and nothing it fails with, carries it.
 */
export function createResendMailSender(
  configuration: MailConfiguration,
): MailSender {
  return {
    send: (message) => sendOnce(message, configuration),
  };
}

async function sendOnce(
  message: MailMessage,
  configuration: MailConfiguration,
): Promise<MailOutcome> {
  const request = tryBuildRequest(message, configuration);
  if (request === undefined) return MAIL_REFUSED_UNSENT;
  return await exchangeWithinBound(request);
}

function tryBuildRequest(
  message: MailMessage,
  configuration: MailConfiguration,
): ResendRequest | undefined {
  try {
    return isSendableMailMessage(message)
      ? buildResendRequest(message, configuration)
      : undefined;
  } catch {
    return undefined;
  }
}

async function exchangeWithinBound(
  request: ResendRequest,
): Promise<MailOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<MailOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(TIMED_OUT);
    }, MAIL_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([exchange(request, controller.signal), bound]);
  } finally {
    clearTimeout(timer);
  }
}

async function exchange(
  request: ResendRequest,
  signal: AbortSignal,
): Promise<MailOutcome> {
  try {
    const response = await fetch(request.url, { ...request.init, signal });
    return await mapAnswer(response);
  } catch {
    // Neither a TypeError, a transport error nor an abort is kept: each can quote a header or a host.
    return UNREACHABLE;
  }
}

async function mapAnswer(response: Response): Promise<MailOutcome> {
  const { status } = response;
  if (status >= FIRST_SUCCESS_STATUS && status < FIRST_REDIRECT_STATUS) {
    const body = await readJsonObject(response);
    return typeof body?.id === "string"
      ? MAIL_ACCEPTED
      : failure("unreadable-answer", status);
  }
  if (status === CONFLICT_STATUS) {
    const isMismatch =
      (await readErrorName(response)) === MISMATCHED_PAYLOAD_NAME;
    return failure(isMismatch ? "payload-mismatch" : "busy", status);
  }
  if (status === TOO_MANY_REQUESTS_STATUS) {
    const isRateLimit = (await readErrorName(response)) === RATE_LIMIT_NAME;
    return failure(isRateLimit ? "busy" : "quota-spent", status);
  }
  return failure(kindOfOtherStatus(status), status);
}

function kindOfOtherStatus(status: number): MailFailureKind {
  if (status >= FIRST_SERVER_ERROR_STATUS && status <= HIGHEST_HTTP_STATUS) {
    return "unreachable";
  }
  if (
    status >= FIRST_CLIENT_ERROR_STATUS &&
    status < FIRST_SERVER_ERROR_STATUS
  ) {
    return "refused";
  }
  return "unreadable-answer";
}

/** The status is the response's own, and only when it is one HTTP knows; it is never read from a body. */
function failure(kind: MailFailureKind, status: number): MailOutcome {
  const isKnownStatus =
    Number.isInteger(status) &&
    status >= LOWEST_HTTP_STATUS &&
    status <= HIGHEST_HTTP_STATUS;
  return isKnownStatus ? { ok: false, kind, status } : { ok: false, kind };
}

async function readErrorName(response: Response): Promise<unknown> {
  return (await readJsonObject(response))?.name;
}

async function readJsonObject(
  response: Response,
): Promise<Record<string, unknown> | undefined> {
  const body = await readUtf8BodyWithLimit(response.body, ANSWER_MAX_BYTES);
  if (!body.ok) return undefined;
  return parseJsonObject(body.value);
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
