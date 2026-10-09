import {
  CLIENT_NETWORK_SOURCE_VARIABLE,
  type NetworkEnvironment,
} from "@/lib/server/rate-limit/network-source";

/** Names are a closed set, and a name carries its window: a window of another length is a new name, so two windows
 *  never state different ends for one key and start. */
export const MINT_POLICY_NAME = "design-mint-per-chisinau-day";
export const E2E_MINT_POLICY_NAME = "design-mint-e2e-per-chisinau-day";

export type PolicyName = typeof MINT_POLICY_NAME | typeof E2E_MINT_POLICY_NAME;

export interface LimitPolicy {
  readonly name: PolicyName;
  /** The most hits one bucket may count in its window; a hit that brings the count above it is refused. */
  readonly figure: number;
  readonly window: "chisinau-day";
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

export const MINT_POLICY: LimitPolicy = Object.freeze({
  name: MINT_POLICY_NAME,
  figure: MINT_DAILY_FIGURE,
  window: "chisinau-day",
});

export const E2E_MINT_POLICY: LimitPolicy = Object.freeze({
  name: E2E_MINT_POLICY_NAME,
  figure: E2E_MINT_DAILY_FIGURE,
  window: "chisinau-day",
});

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
 * Pure: the environment is handed in, and no request can reach it. The mint's one row is the default. The e2e policy
 * is chosen only by the flag, exactly `1`, and beside `CLIENT_NETWORK_SOURCE` as an own member, whatever it holds,
 * the flag is a misconfiguration and nothing is chosen.
 */
export function choosePolicy(environment: NetworkEnvironment): PolicyChoice {
  if (!isFlagSet(environment)) return { status: "chosen", policy: MINT_POLICY };
  if (Object.hasOwn(environment, CLIENT_NETWORK_SOURCE_VARIABLE)) {
    return { status: "unavailable", variable: E2E_RATE_LIMIT_POLICY_FLAG };
  }
  return { status: "chosen", policy: E2E_MINT_POLICY };
}

function isFlagSet(environment: NetworkEnvironment): boolean {
  return (
    Object.hasOwn(environment, E2E_RATE_LIMIT_POLICY_FLAG) &&
    environment[E2E_RATE_LIMIT_POLICY_FLAG] ===
      E2E_RATE_LIMIT_POLICY_FLAG_ENABLED
  );
}
