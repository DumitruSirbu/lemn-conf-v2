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
 *  for one key and start. The names are made here from the policies below and none from a request; that the set is
 *  closed is held at run time by `isOwnPolicy`, since the type is the text a name is made of. */
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
 * Three times the designs one whole e2e run makes, rounded up to the next hundred, so that a misplaced flag means a
 * bounded figure and not no limit: 510 designs measured over a whole run, three times is 1,530, the next hundred is
 * 1,600. The e2e teardown fails when an invocation mints more than half of it, so the suite may grow by half before a
 * person must raise it.
 */
export const E2E_MINT_DAILY_FIGURE = 1600;

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

/** The owner's answer: 600 an hour for each network, for pages and for the API's two reads. */
const READ_WINDOW_MINUTES = 60;
export const READS_PER_BLOCK_FIGURE = 600;

/**
 * PROVISIONAL, the engineer's figure and not the owner's (the security review of M8C P6): 1,200 an hour for each network
 * block, over the preset listing and every preset image together. A room's Step 1 reads the listing once and an image
 * for each card it shows, up to eight and again for each time a card is opened, so the presets would spend the 600 of
 * `READS_PER_BLOCK_FIGURE` that pages and the design reads share, and a shared carrier network would be refused pages
 * for looking at kitchens. Its own bucket keeps the two apart. The owner's answer changes this constant and no code.
 */
export const PRESET_READS_PER_BLOCK_FIGURE = 1200;

/**
 * PROVISIONAL until the owner answers Q47: 100 browser reports of a policy violation an hour for each network block
 * (ADR 0161 decision 2). One page with a broken add-on sends a few; 100 is enough to learn that something is wrong and
 * small enough that a flood costs little. While no network source is named the one shared bucket holds all visitors'
 * reports together. The owner's answer changes this constant and no code.
 */
export const CSP_REPORT_WINDOW_MINUTES = 60;
export const CSP_REPORTS_PER_BLOCK_FIGURE = 100;

/**
 * Fifty presets saved in a Chișinău calendar day, counted once over every caller (plan M8C section 3.3, the security
 * review of P1): while authoring is ungated (ADR 0112 Amendment A) a flood of valid saves would fill the shared Blob
 * quota, hidden rows included, since the nightly export copies every row. The owner authors a library, a few kitchens
 * a day; a figure of this size bounds a flood and leaves the work room. Fifty saves in a day lock authoring out until
 * the next Chișinău midnight, which is the intended failure. The owner's answer changes this constant and no code.
 */
export const PRESET_CREATIONS_PER_DAY_FIGURE = 50;

/**
 * Three times what one whole e2e run makes of each, rounded up to the next hundred, by the same rule as the mint's: 395
 * saves and 146 share writes at the last count of a whole run. A bucket lasts one invocation, which may run the whole
 * suite, and the teardown fails above half of a figure.
 */
export const E2E_SAVES_PER_BLOCK_FIGURE = 1200;
export const E2E_SHARE_WRITES_PER_BLOCK_FIGURE = 500;

/**
 * A contact request's limits. The figures of a new request are ADR 0019 d5's row for the contact form: 3 an hour and 10
 * a day for a network, 2 an hour for a browser and 3 a day for an address. The contact form's day is the UTC day, so
 * the Chișinău day's totals stay the mint's alone.
 */
const CONTACT_HOUR_MINUTES = 60;
const CONTACT_DAY_MINUTES = 1440;
export const CONTACT_NEW_PER_BLOCK_HOUR_FIGURE = 3;
export const CONTACT_NEW_PER_BLOCK_DAY_FIGURE = 10;
export const CONTACT_NEW_PER_VISITOR_HOUR_FIGURE = 2;
export const CONTACT_NEW_PER_ADDRESS_DAY_FIGURE = 3;

/**
 * PROVISIONAL until the owner answers, which no record does: how many contact requests of any kind a network
 * may send in an hour (30), and how often one stored request may be tried again in an hour (10, at least the six a
 * retry's criterion needs). The owner's answer changes these two constants and no code.
 */
export const CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE = 30;
export const CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE = 10;

/**
 * PROVISIONAL, with the two figures above: the least time a form must have been open, in milliseconds, before a
 * request is taken. Short enough that an autofilled form sent by a real tap passes. What the client says it took is
 * what is compared, so it stops a careless sender only; the buckets are the bound.
 */
export const CONTACT_LEAST_FORM_TIME_MS = 2000;

/**
 * Three times what one whole e2e run sends of each of the three buckets the suite's one shared block counts, rounded up
 * to the next hundred, by the same rule as the mint's: 10 requests of any kind and 3 new ones, counted in the hour and
 * in the day, at the last count of a whole run, so 30 and 9 and 9 become 100 each. The teardown fails above half of a
 * figure.
 */
export const E2E_CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE = 100;
export const E2E_CONTACT_NEW_PER_BLOCK_HOUR_FIGURE = 100;
export const E2E_CONTACT_NEW_PER_BLOCK_DAY_FIGURE = 100;

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

export const PRESET_CREATION_POLICY = policyOf("preset-creation-global", {
  figure: PRESET_CREATIONS_PER_DAY_FIGURE,
  window: CHISINAU_DAY,
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

export const PRESET_READ_POLICY = policyOf("preset-read-by-block", {
  figure: PRESET_READS_PER_BLOCK_FIGURE,
  window: utcMinutes(READ_WINDOW_MINUTES),
});

export const CSP_REPORT_POLICY = policyOf("csp-report-by-block", {
  figure: CSP_REPORTS_PER_BLOCK_FIGURE,
  window: utcMinutes(CSP_REPORT_WINDOW_MINUTES),
});

export const CONTACT_EVERY_BY_BLOCK_POLICY = policyOf(
  "contact-every-request-by-block",
  {
    figure: CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE,
    window: utcMinutes(CONTACT_HOUR_MINUTES),
  },
);

export const E2E_CONTACT_EVERY_BY_BLOCK_POLICY = policyOf(
  "contact-every-request-by-block-e2e",
  {
    figure: E2E_CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE,
    window: utcMinutes(CONTACT_HOUR_MINUTES),
  },
);

export const CONTACT_NEW_BY_BLOCK_HOUR_POLICY = policyOf(
  "contact-new-request-by-block",
  {
    figure: CONTACT_NEW_PER_BLOCK_HOUR_FIGURE,
    window: utcMinutes(CONTACT_HOUR_MINUTES),
  },
);

export const E2E_CONTACT_NEW_BY_BLOCK_HOUR_POLICY = policyOf(
  "contact-new-request-by-block-e2e",
  {
    figure: E2E_CONTACT_NEW_PER_BLOCK_HOUR_FIGURE,
    window: utcMinutes(CONTACT_HOUR_MINUTES),
  },
);

export const CONTACT_NEW_BY_BLOCK_DAY_POLICY = policyOf(
  "contact-new-request-by-block",
  {
    figure: CONTACT_NEW_PER_BLOCK_DAY_FIGURE,
    window: utcMinutes(CONTACT_DAY_MINUTES),
  },
);

export const E2E_CONTACT_NEW_BY_BLOCK_DAY_POLICY = policyOf(
  "contact-new-request-by-block-e2e",
  {
    figure: E2E_CONTACT_NEW_PER_BLOCK_DAY_FIGURE,
    window: utcMinutes(CONTACT_DAY_MINUTES),
  },
);

export const CONTACT_NEW_BY_VISITOR_POLICY = policyOf(
  "contact-new-request-by-visitor",
  {
    figure: CONTACT_NEW_PER_VISITOR_HOUR_FIGURE,
    window: utcMinutes(CONTACT_HOUR_MINUTES),
  },
);

export const CONTACT_NEW_BY_ADDRESS_POLICY = policyOf(
  "contact-new-request-by-address",
  {
    figure: CONTACT_NEW_PER_ADDRESS_DAY_FIGURE,
    window: utcMinutes(CONTACT_DAY_MINUTES),
  },
);

export const CONTACT_TRIES_BY_REQUEST_POLICY = policyOf(
  "contact-tries-by-request",
  {
    figure: CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE,
    window: utcMinutes(CONTACT_HOUR_MINUTES),
  },
);

export const MINT_POLICY_NAME = MINT_POLICY.name;
export const E2E_MINT_POLICY_NAME = E2E_MINT_POLICY.name;

/** What a request is limited for. A bucket has an e2e twin when the suite's one shared block would count it: the
 *  credential's, the reads, and the contact form's buckets by a browser, an address and a stored request have none,
 *  since no test makes them often enough, and the suite's server counts no read under the shared bucket. A policy
 *  report has none either: the suite expects the production figure to be reached by no test (ADR 0161). The global
 *  cap on preset creation has none for the same reason: no test saves fifty presets in a day, and nor has the preset
 *  reads' bucket, which the suite's server counts no more than it counts the other reads. */
export type PolicyPurpose =
  | "mint"
  | "save-by-block"
  | "save-by-credential"
  | "share-write"
  | "preset-creation"
  | "read"
  | "preset-read"
  | "csp-report"
  | "contact-every-by-block"
  | "contact-new-by-block-hour"
  | "contact-new-by-block-day"
  | "contact-new-by-visitor"
  | "contact-new-by-address"
  | "contact-tries-by-request";

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
  "preset-creation": {
    production: PRESET_CREATION_POLICY,
    e2e: PRESET_CREATION_POLICY,
  },
  read: { production: READ_POLICY, e2e: READ_POLICY },
  "preset-read": { production: PRESET_READ_POLICY, e2e: PRESET_READ_POLICY },
  "csp-report": { production: CSP_REPORT_POLICY, e2e: CSP_REPORT_POLICY },
  "contact-every-by-block": {
    production: CONTACT_EVERY_BY_BLOCK_POLICY,
    e2e: E2E_CONTACT_EVERY_BY_BLOCK_POLICY,
  },
  "contact-new-by-block-hour": {
    production: CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
    e2e: E2E_CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
  },
  "contact-new-by-block-day": {
    production: CONTACT_NEW_BY_BLOCK_DAY_POLICY,
    e2e: E2E_CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  },
  "contact-new-by-visitor": {
    production: CONTACT_NEW_BY_VISITOR_POLICY,
    e2e: CONTACT_NEW_BY_VISITOR_POLICY,
  },
  "contact-new-by-address": {
    production: CONTACT_NEW_BY_ADDRESS_POLICY,
    e2e: CONTACT_NEW_BY_ADDRESS_POLICY,
  },
  "contact-tries-by-request": {
    production: CONTACT_TRIES_BY_REQUEST_POLICY,
    e2e: CONTACT_TRIES_BY_REQUEST_POLICY,
  },
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

const E2E_TWINS: ReadonlySet<LimitPolicy> = new Set(
  Object.values(TWINS_OF_PURPOSE)
    .filter(({ production, e2e }) => e2e !== production)
    .map(({ e2e }) => e2e),
);

/** The name a log line gives the policy a judgement was made under: its own, or `none` when no policy was chosen. */
export function policyNameOf(choice: PolicyChoice): string {
  return choice.status === "chosen" ? choice.policy.name : "none";
}

/** Whether `policy` is the e2e twin of a production policy, whose figure is not the production one. */
export function isE2eTwin(policy: LimitPolicy): boolean {
  return E2E_TWINS.has(policy);
}

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
      /** The variable that made the choice impossible, or nothing when no variable did. */
      readonly variable: typeof E2E_RATE_LIMIT_POLICY_FLAG | undefined;
    };

/** No policy was chosen and no variable made that so: what a purpose outside the list, and a sequence of no step,
 *  are answered. Written here once. */
export const NO_POLICY: PolicyChoice = Object.freeze({
  status: "unavailable",
  variable: undefined,
});

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
  if (!Object.hasOwn(TWINS_OF_PURPOSE, purpose)) return NO_POLICY;
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
