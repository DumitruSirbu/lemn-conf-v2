import "server-only";

// The account routes' lines, over closed lists. `reportAccountEvent` is handed an event kind, an outcome and the name
// of a limiter policy, and nothing else, so no line can hold a password, a token, a session value, an e-mail address or
// a phone number: there is no parameter to carry one (ADR 0169 decision 5; flow rules in M8B plan section 5).

/** What happened, by kind. A closed list that also types the line. */
export const ACCOUNT_EVENTS = [
  "register",
  "confirm-email",
  "login",
  "logout",
  "password-reset-request",
  "password-reset-complete",
  "claim",
  "session-read",
  "session-revoke",
  "breach-check",
  "turnstile",
  "mail",
] as const;

export type AccountEvent = (typeof ACCOUNT_EVENTS)[number];

/** How it ended. `unavailable` is the one that means something of ours could not be reached or judged. */
export const ACCOUNT_OUTCOMES = [
  "succeeded",
  "refused",
  "limited",
  "unavailable",
] as const;

export type AccountOutcome = (typeof ACCOUNT_OUTCOMES)[number];

export interface AccountEventReport {
  readonly event: AccountEvent;
  readonly outcome: AccountOutcome;
  /** The name of the limiter policy that decided it, for a `limited` outcome. */
  readonly policy?: string;
}

const LINE_LABEL = "[account]";
const OTHER_VALUE = "other";
const NO_POLICY_NAME = "none";

/** A policy name is lower-case words and hyphens, as `limit-policy.ts` writes them; anything else is not one. */
const POLICY_NAME_SHAPE = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Writes one line. The write may not throw: a diagnostic that can fail replaces the answer it exists to explain. A
 * value outside a list, which only a cast reaches, is written as `other`, and a policy name that is not shaped like
 * one is written as `none`.
 */
export function reportAccountEvent({
  event,
  outcome,
  policy,
}: AccountEventReport): void {
  const line = {
    event: ACCOUNT_EVENTS.find((known) => known === event) ?? OTHER_VALUE,
    outcome: ACCOUNT_OUTCOMES.find((known) => known === outcome) ?? OTHER_VALUE,
    ...(policy === undefined ? {} : { policy: sanitisedPolicyName(policy) }),
  };
  try {
    (outcome === "unavailable" ? console.error : console.warn)(
      LINE_LABEL,
      line,
    );
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}

function sanitisedPolicyName(policy: unknown): string {
  return typeof policy === "string" && POLICY_NAME_SHAPE.test(policy)
    ? policy
    : NO_POLICY_NAME;
}
