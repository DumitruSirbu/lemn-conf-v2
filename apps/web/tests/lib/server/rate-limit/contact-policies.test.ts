import { describe, expect, it } from "vitest";

import {
  ALL_LIMIT_POLICIES,
  choosePolicy,
  CONTACT_EVERY_BY_BLOCK_POLICY,
  CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE,
  CONTACT_LEAST_FORM_TIME_MS,
  CONTACT_NEW_BY_ADDRESS_POLICY,
  CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
  CONTACT_NEW_BY_VISITOR_POLICY,
  CONTACT_NEW_PER_ADDRESS_DAY_FIGURE,
  CONTACT_NEW_PER_BLOCK_DAY_FIGURE,
  CONTACT_NEW_PER_BLOCK_HOUR_FIGURE,
  CONTACT_NEW_PER_VISITOR_HOUR_FIGURE,
  CONTACT_TRIES_BY_REQUEST_POLICY,
  CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE,
  E2E_CONTACT_EVERY_BY_BLOCK_POLICY,
  E2E_CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  E2E_CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
  E2E_RATE_LIMIT_POLICY_FLAG,
  isE2eTwin,
  isOwnPolicy,
  longestWaitSecondsOf,
  type LimitPolicy,
  type PolicyPurpose,
} from "@/lib/server/rate-limit/limit-policy";

const HOUR = { kind: "utc-minutes", minutes: 60 };
const UTC_DAY = { kind: "utc-minutes", minutes: 1440 };

/** The six policies of a contact request and what each one is, with a figure and its source. */
const SIX: readonly [PolicyPurpose, LimitPolicy, string, number, object][] = [
  [
    "contact-new-by-block-hour",
    CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
    "contact-new-request-by-block-per-60-utc-minutes",
    3,
    HOUR,
  ],
  [
    "contact-new-by-block-day",
    CONTACT_NEW_BY_BLOCK_DAY_POLICY,
    "contact-new-request-by-block-per-1440-utc-minutes",
    10,
    UTC_DAY,
  ],
  [
    "contact-new-by-visitor",
    CONTACT_NEW_BY_VISITOR_POLICY,
    "contact-new-request-by-visitor-per-60-utc-minutes",
    2,
    HOUR,
  ],
  [
    "contact-new-by-address",
    CONTACT_NEW_BY_ADDRESS_POLICY,
    "contact-new-request-by-address-per-1440-utc-minutes",
    3,
    UTC_DAY,
  ],
  [
    "contact-every-by-block",
    CONTACT_EVERY_BY_BLOCK_POLICY,
    "contact-every-request-by-block-per-60-utc-minutes",
    30,
    HOUR,
  ],
  [
    "contact-tries-by-request",
    CONTACT_TRIES_BY_REQUEST_POLICY,
    "contact-tries-by-request-per-60-utc-minutes",
    10,
    HOUR,
  ],
];

describe("the six policies of a contact request", () => {
  it.each(SIX)(
    "holds %s as its name, its figure and its window",
    (_purpose, policy, name, figure, window) => {
      expect(policy).toEqual({ name, figure, window });
    },
  );

  it("takes the first four figures from ADR 0019's row for the contact form, and the day as the UTC day", () => {
    expect(CONTACT_NEW_PER_BLOCK_HOUR_FIGURE).toBe(3);
    expect(CONTACT_NEW_PER_BLOCK_DAY_FIGURE).toBe(10);
    expect(CONTACT_NEW_PER_VISITOR_HOUR_FIGURE).toBe(2);
    expect(CONTACT_NEW_PER_ADDRESS_DAY_FIGURE).toBe(3);
    expect(longestWaitSecondsOf(CONTACT_NEW_BY_BLOCK_DAY_POLICY.window)).toBe(
      86_400,
    );
    expect(CONTACT_NEW_BY_BLOCK_DAY_POLICY.window.kind).toBe("utc-minutes");
  });

  it("names the two figures Q39 leaves to the owner as constants of this module, thirty and ten", () => {
    expect(CONTACT_EVERY_PER_BLOCK_HOUR_FIGURE).toBe(30);
    expect(CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE).toBe(10);
  });

  it("names the least time a form was open as two seconds, provisional beside the two figures of Q39", () => {
    expect(CONTACT_LEAST_FORM_TIME_MS).toBe(2000);
  });

  it("allows a request at least six tries in an hour, which a retry that is never trapped needs", () => {
    expect(CONTACT_TRIES_BY_REQUEST_POLICY.figure).toBeGreaterThanOrEqual(6);
  });

  it("is in the closed set, by identity, with a name of its own each", () => {
    for (const [, policy] of SIX) expect(isOwnPolicy(policy)).toBe(true);
    const names = ALL_LIMIT_POLICIES.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the contact form's e2e twins: one for each bucket the suite's one block shares", () => {
  const TWINS: readonly [PolicyPurpose, LimitPolicy, LimitPolicy, object][] = [
    [
      "contact-every-by-block",
      CONTACT_EVERY_BY_BLOCK_POLICY,
      E2E_CONTACT_EVERY_BY_BLOCK_POLICY,
      HOUR,
    ],
    [
      "contact-new-by-block-hour",
      CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
      E2E_CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
      HOUR,
    ],
    [
      "contact-new-by-block-day",
      CONTACT_NEW_BY_BLOCK_DAY_POLICY,
      E2E_CONTACT_NEW_BY_BLOCK_DAY_POLICY,
      UTC_DAY,
    ],
  ];
  const FLAG_SET = { [E2E_RATE_LIMIT_POLICY_FLAG]: "1" };

  it.each(TWINS)(
    "gives %s a twin at 100 in the same window, under a name of its own",
    (_purpose, production, twin, window) => {
      expect(twin.figure).toBe(100);
      expect(twin.window).toEqual(window);
      expect(twin.name).not.toBe(production.name);
      expect(twin.name.startsWith(production.name)).toBe(false);
      expect(isE2eTwin(twin)).toBe(true);
    },
  );

  it.each(TWINS)(
    "chooses %s's twin under the flag and its production policy without",
    (purpose, production, twin) => {
      expect(choosePolicy({}, purpose)).toEqual({
        status: "chosen",
        policy: production,
      });
      expect(choosePolicy(FLAG_SET, purpose)).toEqual({
        status: "chosen",
        policy: twin,
      });
    },
  );

  it.each([
    "contact-new-by-visitor",
    "contact-new-by-address",
    "contact-tries-by-request",
  ] as const)(
    "gives %s no twin: its subject is not the block the suite shares",
    (purpose) => {
      const production = choosePolicy({}, purpose);

      expect(choosePolicy(FLAG_SET, purpose)).toEqual(production);
      expect(
        production.status === "chosen" && isE2eTwin(production.policy),
      ).toBe(false);
    },
  );

  it("is a misconfiguration beside a named source, as for every other purpose", () => {
    expect(
      choosePolicy(
        { ...FLAG_SET, CLIENT_NETWORK_SOURCE: "vercel" },
        "contact-every-by-block",
      ),
    ).toEqual({ status: "unavailable", variable: E2E_RATE_LIMIT_POLICY_FLAG });
  });
});
