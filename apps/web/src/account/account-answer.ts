import type {
  AccountFieldIssue,
  AccountIssueField,
  AccountRateLimitNotice,
} from "@/i18n/content";
import { clockTimeOf, isToldOnALaterDay } from "@/i18n/clock-time";

// What an account route answered, as the one state the screen draws. The class is read from the HTTP status and the
// body's `status` word together, because one status carries several words (`400` is `invalid-input`,
// `invalid-request` and a link's refusal). Nothing here keeps the answer's body, its headers or a field's value: a
// class, the fields to mark, a claimable count or a wait in seconds. The one exception is `received`, the success of
// the two signed-in requests whose answer is the data itself (the kitchens list and the export): the sender hands the
// parsed body on and the screen's own reader checks its shape.
//
// The form flows and the signed-in flows are two unions with one classifier module. They are separate so that every
// hook that switches over the form flows' outcomes stays exhaustive without learning classes it can never be given.

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
 * clock time it ends at, because the account day windows are Chișinău calendar days and "tomorrow" is wrong part of
 * the night. `unreadable` has no number: the answer's `Retry-After` could not be believed.
 */
export type AccountWait =
  | { readonly kind: "countdown"; readonly seconds: number }
  | { readonly kind: "minutes"; readonly minutes: number }
  | { readonly kind: "clock-time"; readonly seconds: number }
  | { readonly kind: "unreadable" };

/** The classes every account answer can be, whichever flow asked: the form flows and the signed-in flows both compose
 *  their outcome from it. */
export type SharedOutcome =
  | { readonly kind: "check-inbox" }
  | { readonly kind: "password-changed" }
  | {
      readonly kind: "invalid-input";
      readonly issues: readonly AccountFieldIssue[];
    }
  | { readonly kind: "link-invalid" }
  | { readonly kind: "rate-limited"; readonly wait: AccountWait }
  | { readonly kind: "unavailable" }
  | { readonly kind: "request-failed" }
  | { readonly kind: "platform-failed" }
  | { readonly kind: "unanswered" };

export type AccountOutcome =
  | SharedOutcome
  | { readonly kind: "signed-in"; readonly claimable: number }
  | { readonly kind: "invalid-credentials" }
  | { readonly kind: "challenge-failed" };

/** The request that got no answer at all. Told from `request-failed` by the fetch's rejection alone. */
export const UNANSWERED_OUTCOME: SharedOutcome = { kind: "unanswered" };

/** Any answer below `500` the flow has no class for: a refused request (`cross-site`, `invalid-request`, `413`,
 *  `415`), a body that is not JSON, or a word this flow never says. */
export const REQUEST_FAILED_OUTCOME: SharedOutcome = {
  kind: "request-failed",
};

/** A server error no word of the flow explains (a gateway's `502`, a `500` page that is not JSON). It is told from
 *  `request-failed` because a retry may mend it: a page that holds a single-use token keeps it for that retry. */
export const PLATFORM_FAILED_OUTCOME: SharedOutcome = {
  kind: "platform-failed",
};

/** A feedback the same button mends by pressing it again: the service was not there, or the request got no answer. */
export function isRetryable(feedback: { readonly kind: string }): boolean {
  return feedback.kind === "unavailable" || feedback.kind === "unanswered";
}

const COUNTDOWN_BELOW_SECONDS = 600;
const MINUTES_UNTIL_SECONDS = 3600;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const SHORTEST_WAIT_SECONDS = 1;
/** 25 hours, the longest a Chișinău day lasts and so the longest window an account limit states. It is the server's
 *  `LONGEST_DAY_SECONDS` (`lib/server/rate-limit/chisinau-day.ts`), held here because that module imports the
 *  persistence package, which a client module may not; keep the two equal. A longer `Retry-After` is not one a limit
 *  sent. */
const LONGEST_WAIT_SECONDS = 90_000;
const FIRST_SERVER_ERROR_STATUS = 500;

const OK_STATUS = 200;
const CREATED_STATUS = 201;
const ACCEPTED_STATUS = 202;
const NO_CONTENT_STATUS = 204;
const INVALID_INPUT_STATUS = 400;
const UNAUTHORISED_STATUS = 401;
const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;
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
  const stopped = limitOrOutageOutcomeOf(answer, word);
  if (stopped !== undefined) return stopped;
  const { refusal } = rule;
  if (isFlowRefusal(refusal, answer.status, word)) return refusal.outcome;
  if (
    rule.isChallenged &&
    answer.status === FORBIDDEN_STATUS &&
    word === "challenge-failed"
  ) {
    return { kind: "challenge-failed" };
  }
  return failedOutcomeOf(rule.placeableFields, answer, word);
}

/** `429` and `503` say the same in every flow: a limit with the wait it states, or a service that was not there. */
function limitOrOutageOutcomeOf(
  answer: AccountAnswer,
  word: string | undefined,
): SharedOutcome | undefined {
  if (answer.status === RATE_LIMITED_STATUS && word === "rate-limited") {
    return { kind: "rate-limited", wait: waitFrom(answer.retryAfter) };
  }
  if (answer.status === UNAVAILABLE_STATUS && word === "unavailable") {
    return { kind: "unavailable" };
  }
  return undefined;
}

/** What is left once nothing of the flow matched: fields to correct, or a failure told by the status's class. */
function failedOutcomeOf(
  placeableFields: readonly AccountIssueField[],
  answer: AccountAnswer,
  word: string | undefined,
): SharedOutcome {
  if (answer.status === INVALID_INPUT_STATUS && word === "invalid-input") {
    return classifyInvalidInput(placeableFields, answer.body);
  }
  return answer.status >= FIRST_SERVER_ERROR_STATUS
    ? PLATFORM_FAILED_OUTCOME
    : REQUEST_FAILED_OUTCOME;
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
function classifyInvalidInput(
  placeableFields: readonly AccountIssueField[],
  body: unknown,
): SharedOutcome {
  const issues = ownValueOf(body, "issues");
  const placed = Array.isArray(issues)
    ? (issues as readonly unknown[]).flatMap((raw) =>
        placedIssueOf(placeableFields, raw),
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

/** The requests of the signed-in area, one per route family. `confirm-email` is the area's token page: it has no
 *  session, and the link it carries is its subject. */
export type SignedInFlow =
  | "kitchens"
  | "kitchen-action"
  | "profile"
  | "password"
  | "email-change"
  | "confirm-email"
  | "export"
  | "claim"
  | "logout";

/** What a signed-in route answered. The classes of the form flows keep their meaning here; the rest are the area's. */
export type SignedInOutcome =
  | SharedOutcome
  /** The work was done and the answer holds nothing the screen reads: a rename, a copy, a hide, a delete, a sign-out. */
  | { readonly kind: "succeeded" }
  /** The answer is the data. Its shape is the reading screen's to check, since only that screen knows what it needs. */
  | { readonly kind: "received"; readonly body: unknown }
  /** A claim's number: the designs that could be claimed, or the designs that were. */
  | { readonly kind: "counted"; readonly count: number }
  | { readonly kind: "saved" }
  | { readonly kind: "email-changed" }
  /** `401`: no live session. The page that asked sends the person to sign in. */
  | { readonly kind: "unauthenticated" }
  /** `403`: a live session whose account may not do this. It is never "the session expired". */
  | { readonly kind: "forbidden" }
  /** The one `404` of a kitchen: unknown, not the account's, hidden or deleted all read alike. */
  | { readonly kind: "kitchen-unavailable" }
  | { readonly kind: "wrong-password" }
  | { readonly kind: "conflict-sent" }
  | { readonly kind: "conflict-not-sent" };

interface SignedInSuccessRule {
  readonly status: number;
  /** The body's `status` word, for an answer that states one; a `204` and a data answer state none. */
  readonly word?: string;
  readonly outcomeOf: (body: unknown) => SignedInOutcome;
}

interface SignedInRefusalRule {
  readonly status: number;
  readonly word: string;
  readonly outcome: SignedInOutcome;
}

interface SignedInFlowRule {
  readonly successes: readonly SignedInSuccessRule[];
  readonly refusals: readonly SignedInRefusalRule[];
  /** The flow's route refuses a kitchen with the design routes' `404`, which has no `status` word. */
  readonly isAboutOneKitchen: boolean;
  /** The fields an `invalid-input` answer may mark. A field the form kit cannot yet draw is left out: its refusal
   *  reads as a failed request until the screen that draws it adds the field to `AccountIssueField`. */
  readonly placeableFields: readonly AccountIssueField[];
}

/** The answer to a kitchen that is not the account's to open. The sender gives it, too, for an id that cannot name a
 *  kitchen, since the server would refuse that id the same way. */
export const KITCHEN_UNAVAILABLE_OUTCOME: SignedInOutcome = {
  kind: "kitchen-unavailable",
};

const SUCCEEDED_OUTCOME: SignedInOutcome = { kind: "succeeded" };

const succeeded = (): SignedInOutcome => SUCCEEDED_OUTCOME;
const received = (body: unknown): SignedInOutcome => ({
  kind: "received",
  body,
});

const SIGNED_IN_FLOW_RULES: Readonly<Record<SignedInFlow, SignedInFlowRule>> = {
  kitchens: {
    successes: [{ status: OK_STATUS, outcomeOf: received }],
    refusals: [],
    isAboutOneKitchen: false,
    placeableFields: [],
  },
  "kitchen-action": {
    successes: [
      { status: OK_STATUS, outcomeOf: succeeded },
      { status: CREATED_STATUS, outcomeOf: succeeded },
      { status: NO_CONTENT_STATUS, outcomeOf: succeeded },
    ],
    refusals: [
      {
        status: CONFLICT_STATUS,
        word: "sent",
        outcome: { kind: "conflict-sent" },
      },
      {
        status: CONFLICT_STATUS,
        word: "not-sent",
        outcome: { kind: "conflict-not-sent" },
      },
    ],
    isAboutOneKitchen: true,
    placeableFields: [],
  },
  profile: {
    successes: [
      {
        status: OK_STATUS,
        word: "saved",
        outcomeOf: () => ({ kind: "saved" }),
      },
    ],
    refusals: [],
    isAboutOneKitchen: false,
    placeableFields: ["phone"],
  },
  password: {
    successes: [
      {
        status: OK_STATUS,
        word: "password-changed",
        outcomeOf: () => ({ kind: "password-changed" }),
      },
    ],
    refusals: [wrongPasswordRefusal()],
    isAboutOneKitchen: false,
    placeableFields: [],
  },
  "email-change": {
    successes: [
      {
        status: ACCEPTED_STATUS,
        word: "check-inbox",
        outcomeOf: () => ({ kind: "check-inbox" }),
      },
    ],
    refusals: [wrongPasswordRefusal()],
    isAboutOneKitchen: false,
    placeableFields: [],
  },
  "confirm-email": {
    successes: [
      {
        status: OK_STATUS,
        word: "email-changed",
        outcomeOf: () => ({ kind: "email-changed" }),
      },
    ],
    refusals: [
      {
        status: INVALID_INPUT_STATUS,
        word: "link-invalid",
        outcome: { kind: "link-invalid" },
      },
    ],
    isAboutOneKitchen: false,
    placeableFields: [],
  },
  export: {
    successes: [{ status: OK_STATUS, outcomeOf: received }],
    refusals: [],
    isAboutOneKitchen: false,
    placeableFields: [],
  },
  claim: {
    successes: [{ status: OK_STATUS, outcomeOf: countedFrom }],
    refusals: [],
    isAboutOneKitchen: false,
    placeableFields: [],
  },
  logout: {
    successes: [{ status: NO_CONTENT_STATUS, outcomeOf: succeeded }],
    refusals: [],
    isAboutOneKitchen: false,
    placeableFields: [],
  },
};

function wrongPasswordRefusal(): SignedInRefusalRule {
  return {
    status: INVALID_INPUT_STATUS,
    word: "wrong-password",
    outcome: { kind: "wrong-password" },
  };
}

/** The claim's two answers, `{claimable}` and `{claimed}`, are told by the number alone: a request knows which it
 *  sent. An answer with neither is not one the dialog can go on from. */
function countedFrom(body: unknown): SignedInOutcome {
  const count = ownValueOf(body, "claimable") ?? ownValueOf(body, "claimed");
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? { kind: "counted", count }
    : REQUEST_FAILED_OUTCOME;
}

/** The same pairing rule as the form flows: the HTTP status and the body's `status` word are read together. */
export function classifySignedInAnswer(
  flow: SignedInFlow,
  answer: AccountAnswer,
): SignedInOutcome {
  const rule = SIGNED_IN_FLOW_RULES[flow];
  const word = statusWordOf(answer.body);
  return (
    successOf(rule, answer, word) ??
    limitOrOutageOutcomeOf(answer, word) ??
    sessionRefusalOf(answer, word) ??
    flowRefusalOf(rule, answer, word) ??
    failedOutcomeOf(rule.placeableFields, answer, word)
  );
}

function successOf(
  rule: SignedInFlowRule,
  answer: AccountAnswer,
  word: string | undefined,
): SignedInOutcome | undefined {
  const success = rule.successes.find(
    (candidate) =>
      candidate.status === answer.status &&
      (candidate.word === undefined || candidate.word === word),
  );
  return success?.outcomeOf(answer.body);
}

/** The refusals of the account's session, which every signed-in route can give. */
function sessionRefusalOf(
  answer: AccountAnswer,
  word: string | undefined,
): SignedInOutcome | undefined {
  if (answer.status === UNAUTHORISED_STATUS && word === "unauthenticated") {
    return { kind: "unauthenticated" };
  }
  if (answer.status === FORBIDDEN_STATUS && word === "forbidden") {
    return { kind: "forbidden" };
  }
  return undefined;
}

function flowRefusalOf(
  rule: SignedInFlowRule,
  answer: AccountAnswer,
  word: string | undefined,
): SignedInOutcome | undefined {
  if (isOneKitchenRefusal(rule, answer)) return KITCHEN_UNAVAILABLE_OUTCOME;
  return rule.refusals.find(
    (refusal) => refusal.status === answer.status && refusal.word === word,
  )?.outcome;
}

/** The design routes' refusal is `{error: text}` under `404`. A `404` from anywhere else (the platform's page, a
 *  route that does not exist) has no such member and is a failed request. */
function isOneKitchenRefusal(
  rule: SignedInFlowRule,
  answer: AccountAnswer,
): boolean {
  return (
    rule.isAboutOneKitchen &&
    answer.status === NOT_FOUND_STATUS &&
    typeof ownValueOf(answer.body, "error") === "string"
  );
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
