import { LONGEST_DAY_SECONDS } from "@/lib/server/rate-limit/chisinau-day";
import {
  CLIENT_NETWORK_SOURCE_VARIABLE,
  type NetworkEnvironment,
} from "@/lib/server/rate-limit/network-source";

/** A window is data: the Chișinău calendar day, or whole minutes on the UTC clock (sixty being the hour). Nothing
 *  else about a policy changes when a window does, but its name, which carries it. */
export type WindowRule =
  | { readonly kind: "chisinau-day" }
  | { readonly kind: "utc-minutes"; readonly minutes: number };

const SECONDS_PER_MINUTE = 60;

/** The most seconds a refusal can tell a caller to wait: the whole window, which is when its count starts again. */
export function longestWaitSecondsOf(window: WindowRule): number {
  return window.kind === "chisinau-day"
    ? LONGEST_DAY_SECONDS
    : window.minutes * SECONDS_PER_MINUTE;
}

/** A name carries its window, so a window of another length is a new name and two windows never state different ends
 *  for one key and start. The set is closed: every name below is written here, none is made from a request. */
export type PolicyName = string;

export interface LimitPolicy {
  readonly name: PolicyName;
  /** The most hits one bucket may count in its window; a hit that brings the count above it is refused. */
  readonly figure: number;
  readonly window: WindowRule;
}

const CHISINAU_DAY: WindowRule = Object.freeze({ kind: "chisinau-day" });

function utcMinutes(minutes: number): WindowRule {
  return Object.freeze({ kind: "utc-minutes", minutes });
}

function policyOf(
  stem: string,
  { figure, window }: Pick<LimitPolicy, "figure" | "window">,
): LimitPolicy {
  return Object.freeze({
    name: `${stem}-per-${labelOf(window)}`,
    figure,
    window,
  });
}

function labelOf(window: WindowRule): string {
  return window.kind === "chisinau-day"
    ? "chisinau-day"
    : `${String(window.minutes)}-utc-minutes`;
}

/** Twenty designs a calendar day in Chișinău, for each network block (the owner's figure). */
export const MINT_DAILY_FIGURE = 20;

/**
 * Twice the designs one whole e2e run makes, rounded up to the next hundred, so that a misplaced flag means about a
 * thousand a day and not no limit. A bucket lasts one invocation and one invocation may run the whole suite: 507
 * designs measured (desktop 132, mobile 191 and 184), twice is 1,014, the next hundred is 1,100. The e2e teardown
 * fails when an invocation mints more than half of it, so a person raises it as the suite grows.
 */
export const E2E_MINT_DAILY_FIGURE = 1100;

/**
 * PROVISIONAL, with the figure below and the window: ADR 0019's 600 a network and 300 a browser's design in the clock
 * hour, until the owner answers Q37 (the measured pace reaches 300 in under six minutes of steady dragging; his
 * options keep them, raise them, or move to ten-minute windows). His answer changes these constants and no code.
 */
const SAVE_WINDOW_MINUTES = 60;
export const SAVES_PER_BLOCK_FIGURE = 600;
export const SAVES_PER_CREDENTIAL_FIGURE = 300;

/** PROVISIONAL until the owner answers Q36, which asks how often a network may create or revoke a share link: 60 an
 *  hour for the two together is the recommendation, and no record gives a number. */
const SHARE_WRITE_WINDOW_MINUTES = 60;
export const SHARE_WRITES_PER_BLOCK_FIGURE = 60;

/** The owner's answer (Q15, iii): 600 an hour for each network, for pages and for the API's two reads. */
const READ_WINDOW_MINUTES = 60;
export const READS_PER_BLOCK_FIGURE = 600;

/**
 * Twice what one whole e2e run makes of each, rounded up to the next hundred, from the last count of a whole run; the
 * slice that starts enforcing a policy measures it again. A bucket lasts one invocation, which may run the whole suite.
 */
export const E2E_SAVES_PER_BLOCK_FIGURE = 800;
export const E2E_SHARE_WRITES_PER_BLOCK_FIGURE = 300;

export const MINT_POLICY = policyOf("design-mint", {
  figure: MINT_DAILY_FIGURE,
  window: CHISINAU_DAY,
});

export const E2E_MINT_POLICY = policyOf("design-mint-e2e", {
  figure: E2E_MINT_DAILY_FIGURE,
  window: CHISINAU_DAY,
});

export const SAVE_BY_BLOCK_POLICY = policyOf("design-save-by-block", {
  figure: SAVES_PER_BLOCK_FIGURE,
  window: utcMinutes(SAVE_WINDOW_MINUTES),
});

export const E2E_SAVE_BY_BLOCK_POLICY = policyOf("design-save-by-block-e2e", {
  figure: E2E_SAVES_PER_BLOCK_FIGURE,
  window: utcMinutes(SAVE_WINDOW_MINUTES),
});

export const SAVE_BY_CREDENTIAL_POLICY = policyOf("design-save-by-credential", {
  figure: SAVES_PER_CREDENTIAL_FIGURE,
  window: utcMinutes(SAVE_WINDOW_MINUTES),
});

export const SHARE_WRITE_POLICY = policyOf("share-write-by-block", {
  figure: SHARE_WRITES_PER_BLOCK_FIGURE,
  window: utcMinutes(SHARE_WRITE_WINDOW_MINUTES),
});

export const E2E_SHARE_WRITE_POLICY = policyOf("share-write-by-block-e2e", {
  figure: E2E_SHARE_WRITES_PER_BLOCK_FIGURE,
  window: utcMinutes(SHARE_WRITE_WINDOW_MINUTES),
});

export const READ_POLICY = policyOf("read-by-block", {
  figure: READS_PER_BLOCK_FIGURE,
  window: utcMinutes(READ_WINDOW_MINUTES),
});

export const MINT_POLICY_NAME = MINT_POLICY.name;
export const E2E_MINT_POLICY_NAME = E2E_MINT_POLICY.name;

/** What a request is limited for. The credential's bucket and the reads have no e2e twin: no test saves one design
 *  often enough to reach the first, and the suite's server counts no read under the shared bucket. */
export type PolicyPurpose =
  | "mint"
  | "save-by-block"
  | "save-by-credential"
  | "share-write"
  | "read";

interface Twins {
  readonly production: LimitPolicy;
  readonly e2e: LimitPolicy;
}

const TWINS_OF_PURPOSE: Readonly<Record<PolicyPurpose, Twins>> = {
  mint: { production: MINT_POLICY, e2e: E2E_MINT_POLICY },
  "save-by-block": {
    production: SAVE_BY_BLOCK_POLICY,
    e2e: E2E_SAVE_BY_BLOCK_POLICY,
  },
  "save-by-credential": {
    production: SAVE_BY_CREDENTIAL_POLICY,
    e2e: SAVE_BY_CREDENTIAL_POLICY,
  },
  "share-write": {
    production: SHARE_WRITE_POLICY,
    e2e: E2E_SHARE_WRITE_POLICY,
  },
  read: { production: READ_POLICY, e2e: READ_POLICY },
};

/** Every policy once, for a check that no two share a name. */
export const ALL_LIMIT_POLICIES: readonly LimitPolicy[] = Object.freeze([
  ...new Set(
    Object.values(TWINS_OF_PURPOSE).flatMap(({ production, e2e }) => [
      production,
      e2e,
    ]),
  ),
]);

/** Whether `candidate` is one of the closed set's own, by identity: an object with the same name and figure is not. */
export function isOwnPolicy(candidate: unknown): candidate is LimitPolicy {
  return ALL_LIMIT_POLICIES.some((policy) => policy === candidate);
}

export const E2E_RATE_LIMIT_POLICY_FLAG = "LEMNARIA_E2E_RATE_LIMIT_POLICY";

/** Only this exact value opts in, so a stray `true` or `01` cannot read as enabled. */
export const E2E_RATE_LIMIT_POLICY_FLAG_ENABLED = "1";

export type PolicyChoice =
  | { readonly status: "chosen"; readonly policy: LimitPolicy }
  | {
      readonly status: "unavailable";
      readonly variable: typeof E2E_RATE_LIMIT_POLICY_FLAG;
    };

/**
 * Pure: the environment is handed in, and no request can reach it. The production policy of the purpose is the
 * default. One flag, exactly `1`, chooses the e2e twin of every purpose that has one, and beside
 * `CLIENT_NETWORK_SOURCE` as an own member, whatever it holds, the flag is a misconfiguration and nothing is chosen.
 * A purpose that is not one of the list's own is a misconfiguration too, and is answered so and not by a throw.
 */
export function choosePolicy(
  environment: NetworkEnvironment,
  purpose: PolicyPurpose,
): PolicyChoice {
  if (!Object.hasOwn(TWINS_OF_PURPOSE, purpose)) {
    return { status: "unavailable", variable: E2E_RATE_LIMIT_POLICY_FLAG };
  }
  const { production, e2e } = TWINS_OF_PURPOSE[purpose];
  if (!isFlagSet(environment)) return { status: "chosen", policy: production };
  if (Object.hasOwn(environment, CLIENT_NETWORK_SOURCE_VARIABLE)) {
    return { status: "unavailable", variable: E2E_RATE_LIMIT_POLICY_FLAG };
  }
  return { status: "chosen", policy: e2e };
}

function isFlagSet(environment: NetworkEnvironment): boolean {
  return (
    Object.hasOwn(environment, E2E_RATE_LIMIT_POLICY_FLAG) &&
    environment[E2E_RATE_LIMIT_POLICY_FLAG] ===
      E2E_RATE_LIMIT_POLICY_FLAG_ENABLED
  );
}
