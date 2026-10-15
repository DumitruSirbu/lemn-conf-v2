import "server-only";

import {
  MAIL_ACCEPTED,
  type MailFailureKind,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";

const LOWEST_REPLY_CODE = 200;
const HIGHEST_REPLY_CODE = 599;
const FIRST_TRANSIENT_REPLY_CODE = 400;
const FIRST_PERMANENT_REPLY_CODE = 500;
const SENDING_LIMIT_REPLY_CODE = 550;

// Compared with, never copied: nothing the server or the library said is kept.
const SENDING_LIMIT_REPLY = /^550[ -]5\.4\.5\b/;

const REFUSED_ERROR_CODES: ReadonlySet<string> = new Set([
  "EAUTH",
  "ENOAUTH",
  "EENVELOPE",
  "ECONFIG",
  "EFILEACCESS",
  "EURLACCESS",
  "EREQUIRETLS",
]);
const TIMED_OUT_ERROR_CODE = "ETIMEDOUT";
const UNREADABLE_ERROR_CODE = "EPROTOCOL";

/** The bound passed before the transport answered. Ours, so it has no status. */
export const MAIL_TIMED_OUT: MailOutcome = Object.freeze({
  ok: false,
  kind: "timed-out",
});

/**
 * The answer to a `sendMail` that resolved: accepted only for exactly one accepted recipient and none rejected.
 * The entry itself is not compared with the configured address, because the library records it as it parsed it.
 */
export function outcomeOfSendResult(result: unknown): MailOutcome {
  const isAccepted =
    hasEntryCount(readMember(result, "accepted"), 1) && hasNoRejection(result);
  return isAccepted
    ? MAIL_ACCEPTED
    : failure("unreadable-answer", replyCodeOf(result));
}

/**
 * The answer to anything thrown. Reads only `code`, `responseCode` and, for one comparison, `response`: no
 * `message`, `command`, `stack` or `cause` is read, so none can be kept.
 */
export function outcomeOfSendFailure(thrown: unknown): MailOutcome {
  const replyCode = replyCodeOf(thrown);
  return failure(kindOfFailure(thrown, replyCode), replyCode);
}

function kindOfFailure(
  thrown: unknown,
  replyCode: number | undefined,
): MailFailureKind {
  if (replyCode !== undefined && replyCode >= FIRST_TRANSIENT_REPLY_CODE) {
    return kindOfReply(thrown, replyCode);
  }
  return kindOfErrorCode(readMember(thrown, "code"));
}

function kindOfReply(thrown: unknown, replyCode: number): MailFailureKind {
  if (replyCode < FIRST_PERMANENT_REPLY_CODE) return "busy";
  return isSendingLimitReply(thrown, replyCode) ? "quota-spent" : "refused";
}

function isSendingLimitReply(thrown: unknown, replyCode: number): boolean {
  const reply = readMember(thrown, "response");
  return (
    replyCode === SENDING_LIMIT_REPLY_CODE &&
    typeof reply === "string" &&
    SENDING_LIMIT_REPLY.test(reply)
  );
}

function kindOfErrorCode(errorCode: unknown): MailFailureKind {
  if (typeof errorCode !== "string") return "unreachable";
  if (REFUSED_ERROR_CODES.has(errorCode)) return "refused";
  if (errorCode === TIMED_OUT_ERROR_CODE) return "timed-out";
  if (errorCode === UNREADABLE_ERROR_CODE) return "unreadable-answer";
  return "unreachable";
}

/** The status is a server's reply code, and only when it is an integer SMTP knows; it is never read from text. */
function replyCodeOf(value: unknown): number | undefined {
  const replyCode = readMember(value, "responseCode");
  const isUsable =
    typeof replyCode === "number" &&
    Number.isInteger(replyCode) &&
    replyCode >= LOWEST_REPLY_CODE &&
    replyCode <= HIGHEST_REPLY_CODE;
  return isUsable ? replyCode : undefined;
}

function failure(
  kind: MailFailureKind,
  replyCode: number | undefined,
): MailOutcome {
  return replyCode === undefined
    ? { ok: false, kind }
    : { ok: false, kind, status: replyCode };
}

/** A member of whatever was thrown or resolved, which may be no object, or an object whose getter throws. */
function readMember(value: unknown, name: string): unknown {
  const isObject =
    (typeof value === "object" && value !== null) ||
    typeof value === "function";
  if (!isObject) return undefined;
  try {
    return (value as Record<string, unknown>)[name];
  } catch {
    return undefined;
  }
}

function hasEntryCount(value: unknown, count: number): boolean {
  try {
    return Array.isArray(value) && value.length === count;
  } catch {
    return false;
  }
}

/** Absent or empty. A member that cannot be read is not absent: it is an answer nobody can vouch for. */
function hasNoRejection(result: unknown): boolean {
  try {
    const rejected = (result as Record<string, unknown>).rejected;
    return rejected === undefined || hasEntryCount(rejected, 0);
  } catch {
    return false;
  }
}
