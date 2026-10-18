import type {
  AccountFieldIssue,
  AccountIssueField,
  AccountRateLimitNotice,
} from "@/i18n/content";
import { clockTimeOf, isToldOnALaterDay } from "@/i18n/clock-time";

// What an account route answered, as the one state the screen draws. The class is read from the HTTP status and the
// body's `status` word together, because one status carries several words (`400` is `invalid-input`,
// `invalid-request` and a link's refusal). Nothing here keeps the answer's body, its headers or a field's value: a
// class, the fields to mark, a claimable count or a wait in seconds.

/** The five requests an account form makes. */
export type AccountFlow =
  | "register"
  | "login"
  | "forgot-password"
  | "verify-email"
  | "reset-password";

/** What the browser has of an answer. The body is what the answer's JSON read as, or `undefined` for none. */
export interface AccountAnswer {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly body: unknown;
}

/**
 * How a `429` is told. A short wait is a countdown on the button; a middling one is whole minutes; a long one is the
 * clock time it ends at, because the account day windows are UTC days and "tomorrow" is wrong part of the night.
 * `unreadable` has no number: the answer's `Retry-After` could not be believed.
 */
export type AccountWait =
  | { readonly kind: "countdown"; readonly seconds: number }
  | { readonly kind: "minutes"; readonly minutes: number }
  | { readonly kind: "clock-time"; readonly seconds: number }
  | { readonly kind: "unreadable" };

export type AccountOutcome =
  | { readonly kind: "check-inbox" }
  | { readonly kind: "signed-in"; readonly claimable: number }
  | { readonly kind: "password-changed" }
  | {
      readonly kind: "invalid-input";
      readonly issues: readonly AccountFieldIssue[];
    }
  | { readonly kind: "invalid-credentials" }
  | { readonly kind: "link-invalid" }
  | { readonly kind: "challenge-failed" }
  | { readonly kind: "rate-limited"; readonly wait: AccountWait }
  | { readonly kind: "unavailable" }
  | { readonly kind: "request-failed" }
  | { readonly kind: "unanswered" };

/** The request that got no answer at all. Told from `request-failed` by the fetch's rejection alone. */
export const UNANSWERED_OUTCOME: AccountOutcome = { kind: "unanswered" };

/** Any answer the flow has no class for: a refused request (`cross-site`, `invalid-request`, `413`, `415`), a
 *  platform error, a body that is not JSON, or a word this flow never says. */
export const REQUEST_FAILED_OUTCOME: AccountOutcome = {
  kind: "request-failed",
};

/** The pages that read a single-use token from the address: a reload cannot mend them, the e-mail's link can. */
export function isTokenFlow(flow: AccountFlow): boolean {
  return flow === "verify-email" || flow === "reset-password";
}

const COUNTDOWN_BELOW_SECONDS = 600;
const MINUTES_UNTIL_SECONDS = 3600;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const SHORTEST_WAIT_SECONDS = 1;
/** A UTC day, the longest window an account limit states; held here because the client cannot import the server's
 *  policy. A longer `Retry-After` is not one a limit sent. */
const LONGEST_WAIT_SECONDS = 86_400;

const OK_STATUS = 200;
const ACCEPTED_STATUS = 202;
const INVALID_INPUT_STATUS = 400;
const UNAUTHORISED_STATUS = 401;
const FORBIDDEN_STATUS = 403;
const RATE_LIMITED_STATUS = 429;
const UNAVAILABLE_STATUS = 503;

const WHOLE_NUMBER_OF_SECONDS = /^\d{1,6}$/;

type DomainOutcome = Extract<
  AccountOutcome,
  { kind: "invalid-credentials" | "link-invalid" }
>;

interface FlowRule {
  readonly successStatus: number;
  readonly successWord: SuccessWord;
  /** The flow's one refusal that is a word of its own, if it has one. */
  readonly refusal?: {
    readonly status: number;
    readonly word: string;
    readonly outcome: DomainOutcome;
  };
  readonly isChallenged: boolean;
  /** The fields an `invalid-input` answer may mark. None: the flow sends no field the person can correct. */
  readonly placeableFields: readonly AccountIssueField[];
}

type SuccessWord = "check-inbox" | "signed-in" | "password-changed";

const FLOW_RULES: Readonly<Record<AccountFlow, FlowRule>> = {
  register: {
    successStatus: ACCEPTED_STATUS,
    successWord: "check-inbox",
    isChallenged: true,
    placeableFields: ["email", "phone", "password"],
  },
  login: {
    successStatus: OK_STATUS,
    successWord: "signed-in",
    refusal: {
      status: UNAUTHORISED_STATUS,
      word: "invalid-credentials",
      outcome: { kind: "invalid-credentials" },
    },
    isChallenged: true,
    placeableFields: ["email", "password"],
  },
  "forgot-password": {
    successStatus: ACCEPTED_STATUS,
    successWord: "check-inbox",
    isChallenged: true,
    placeableFields: ["email"],
  },
  "verify-email": {
    successStatus: OK_STATUS,
    successWord: "signed-in",
    refusal: {
      status: INVALID_INPUT_STATUS,
      word: "link-or-password-invalid",
      outcome: { kind: "link-invalid" },
    },
    isChallenged: false,
    placeableFields: [],
  },
  "reset-password": {
    successStatus: OK_STATUS,
    successWord: "password-changed",
    refusal: {
      status: INVALID_INPUT_STATUS,
      word: "link-invalid",
      outcome: { kind: "link-invalid" },
    },
    isChallenged: false,
    // The body member is `newPassword` and the answer names the field `password`.
    placeableFields: ["password"],
  },
};

export function classifyAccountAnswer(
  flow: AccountFlow,
  answer: AccountAnswer,
): AccountOutcome {
  const rule = FLOW_RULES[flow];
  const word = statusWordOf(answer.body);
  if (answer.status === rule.successStatus && word === rule.successWord) {
    return classifySuccess(rule.successWord, answer.body);
  }
  if (answer.status === RATE_LIMITED_STATUS && word === "rate-limited") {
    return { kind: "rate-limited", wait: waitFrom(answer.retryAfter) };
  }
  if (answer.status === UNAVAILABLE_STATUS && word === "unavailable") {
    return { kind: "unavailable" };
  }
  const { refusal } = rule;
  if (isFlowRefusal(refusal, answer.status, word)) return refusal.outcome;
  if (
    rule.isChallenged &&
    answer.status === FORBIDDEN_STATUS &&
    word === "challenge-failed"
  ) {
    return { kind: "challenge-failed" };
  }
  if (answer.status === INVALID_INPUT_STATUS && word === "invalid-input") {
    return classifyInvalidInput(rule, answer.body);
  }
  return REQUEST_FAILED_OUTCOME;
}

function isFlowRefusal(
  refusal: FlowRule["refusal"],
  status: number,
  word: string | undefined,
): refusal is NonNullable<FlowRule["refusal"]> {
  return (
    refusal !== undefined && refusal.status === status && refusal.word === word
  );
}

function classifySuccess(word: SuccessWord, body: unknown): AccountOutcome {
  switch (word) {
    case "check-inbox":
      return { kind: "check-inbox" };
    case "password-changed":
      return { kind: "password-changed" };
    case "signed-in":
      return classifySignedIn(body);
  }
}

/** A sign-in with no count the screen can act on is not one it can go on from. */
function classifySignedIn(body: unknown): AccountOutcome {
  const claimable = ownValueOf(body, "claimable");
  return typeof claimable === "number" &&
    Number.isSafeInteger(claimable) &&
    claimable >= 0
    ? { kind: "signed-in", claimable }
    : REQUEST_FAILED_OUTCOME;
}

/** An answer with no issue the form can place beside a field is a failure: the person could not act on it. */
function classifyInvalidInput(rule: FlowRule, body: unknown): AccountOutcome {
  const issues = ownValueOf(body, "issues");
  const placed = Array.isArray(issues)
    ? (issues as readonly unknown[]).flatMap((raw) =>
        placedIssueOf(rule.placeableFields, raw),
      )
    : [];
  return placed.length > 0
    ? { kind: "invalid-input", issues: placed }
    : REQUEST_FAILED_OUTCOME;
}

function placedIssueOf(
  placeableFields: readonly AccountIssueField[],
  raw: unknown,
): readonly AccountFieldIssue[] {
  const field = ownValueOf(raw, "field");
  const code = ownValueOf(raw, "code");
  if (typeof field !== "string" || typeof code !== "string") return [];
  const placeable = placeableFields.find((candidate) => candidate === field);
  return placeable === undefined
    ? []
    : [{ field: placeable, code: asIssueCode(code) }];
}

/**
 * The domain builds an issue's code from its own unions and exports no runtime list of their members, so a list here
 * would be a second one. The resolver looks the sentence up by code and tells a code it lacks as a failed request.
 */
function asIssueCode(code: string): AccountFieldIssue["code"] {
  return code as AccountFieldIssue["code"];
}

/**
 * The wait `Retry-After` states: a whole number of seconds from one to the longest window. Anything else (absent,
 * nought, negative, fractional, past the window, text) is `unreadable`, never a number the screen would then tell.
 */
export function waitFrom(retryAfter: string | null): AccountWait {
  if (retryAfter === null || !WHOLE_NUMBER_OF_SECONDS.test(retryAfter)) {
    return { kind: "unreadable" };
  }
  const seconds = Number(retryAfter);
  if (seconds < SHORTEST_WAIT_SECONDS || seconds > LONGEST_WAIT_SECONDS) {
    return { kind: "unreadable" };
  }
  if (seconds < COUNTDOWN_BELOW_SECONDS) return { kind: "countdown", seconds };
  if (seconds <= MINUTES_UNTIL_SECONDS) {
    return { kind: "minutes", minutes: wholeMinutesOf(seconds) };
  }
  return { kind: "clock-time", seconds };
}

/** The seconds a button counts down, or none when the wait is told in minutes, in a clock time or not at all. */
export function countdownSecondsOf(wait: AccountWait): number | undefined {
  return wait.kind === "countdown" ? wait.seconds : undefined;
}

/**
 * The wait as the sentence needs it. A clock time is never earlier than `nowMs` plus the wait, since `clockTimeOf`
 * rounds up; it carries its day when that is not today's.
 */
export function rateLimitNoticeOf(
  wait: AccountWait,
  nowMs: number,
): AccountRateLimitNotice {
  switch (wait.kind) {
    case "countdown":
      return { kind: "minutes", minutes: wholeMinutesOf(wait.seconds) };
    case "minutes":
      return { kind: "minutes", minutes: wait.minutes };
    case "clock-time": {
      const endsAtMs = nowMs + wait.seconds * MS_PER_SECOND;
      return {
        kind: "at",
        time: clockTimeOf(endsAtMs),
        isTomorrow: isToldOnALaterDay(endsAtMs, nowMs),
      };
    }
    case "unreadable":
      return { kind: "unreadable" };
  }
}

function wholeMinutesOf(seconds: number): number {
  return Math.ceil(seconds / SECONDS_PER_MINUTE);
}

function statusWordOf(body: unknown): string | undefined {
  const word = ownValueOf(body, "status");
  return typeof word === "string" ? word : undefined;
}

/** Only what the body's own object holds; anything that is not an object holds nothing. */
function ownValueOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.hasOwn(value, name)
    ? (value as Readonly<Record<string, unknown>>)[name]
    : undefined;
}
