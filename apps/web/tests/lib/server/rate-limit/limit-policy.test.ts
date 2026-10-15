import { describe, expect, it } from "vitest";

import {
  ALL_LIMIT_POLICIES,
  CSP_REPORT_POLICY,
  choosePolicy,
  E2E_CONTACT_EVERY_BY_BLOCK_POLICY,
  E2E_CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  E2E_CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
  E2E_MINT_DAILY_FIGURE,
  E2E_MINT_POLICY,
  E2E_MINT_POLICY_NAME,
  E2E_RATE_LIMIT_POLICY_FLAG,
  E2E_SAVE_BY_BLOCK_POLICY,
  E2E_SAVES_PER_BLOCK_FIGURE,
  E2E_SHARE_WRITE_POLICY,
  E2E_SHARE_WRITES_PER_BLOCK_FIGURE,
  MINT_DAILY_FIGURE,
  MINT_POLICY,
  isE2eTwin,
  isOwnPolicy,
  MINT_POLICY_NAME,
  READ_POLICY,
  READS_PER_BLOCK_FIGURE,
  SAVE_BY_BLOCK_POLICY,
  SAVE_BY_CREDENTIAL_POLICY,
  SAVES_PER_BLOCK_FIGURE,
  SAVES_PER_CREDENTIAL_FIGURE,
  SHARE_WRITE_POLICY,
  SHARE_WRITES_PER_BLOCK_FIGURE,
  type LimitPolicy,
  type PolicyPurpose,
} from "@/lib/server/rate-limit/limit-policy";
import type { NetworkEnvironment } from "@/lib/server/rate-limit/network-source";

import {
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";

describe("the policies as data", () => {
  it("names the mint's one row and the e2e policy's own, each carrying its window", () => {
    expect(MINT_POLICY_NAME).toBe("design-mint-per-chisinau-day");
    expect(E2E_MINT_POLICY_NAME).toBe("design-mint-e2e-per-chisinau-day");
    expect(MINT_POLICY).toEqual({
      name: MINT_POLICY_NAME,
      figure: 20,
      window: { kind: "chisinau-day" },
    });
    expect(E2E_MINT_POLICY).toEqual({
      name: E2E_MINT_POLICY_NAME,
      figure: 1600,
      window: { kind: "chisinau-day" },
    });
  });

  it("states the figures as constants: twenty a day, and sixteen hundred for the suite", () => {
    expect(MINT_DAILY_FIGURE).toBe(20);
    expect(E2E_MINT_DAILY_FIGURE).toBe(1600);
  });

  it("keeps the two names apart, so no count of one is a count of the other", () => {
    expect(E2E_MINT_POLICY_NAME).not.toBe(MINT_POLICY_NAME);
    expect(E2E_MINT_POLICY_NAME.startsWith(MINT_POLICY_NAME)).toBe(false);
    expect(MINT_POLICY_NAME.startsWith(E2E_MINT_POLICY_NAME)).toBe(false);
  });

  it("freezes both, so no caller moves a figure", () => {
    expect(Object.isFrozen(MINT_POLICY)).toBe(true);
    expect(Object.isFrozen(E2E_MINT_POLICY)).toBe(true);
  });
});

const HOUR = { kind: "utc-minutes", minutes: 60 };

describe("the policies of saves, shares and reads as data", () => {
  const ROWS: readonly [string, LimitPolicy, LimitPolicy][] = [
    [
      "saves by block",
      SAVE_BY_BLOCK_POLICY,
      {
        name: "design-save-by-block-per-60-utc-minutes",
        figure: 600,
        window: HOUR,
      } as LimitPolicy,
    ],
    [
      "saves by write credential",
      SAVE_BY_CREDENTIAL_POLICY,
      {
        name: "design-save-by-credential-per-60-utc-minutes",
        figure: 300,
        window: HOUR,
      } as LimitPolicy,
    ],
    [
      "share writes by block",
      SHARE_WRITE_POLICY,
      {
        name: "share-write-by-block-per-60-utc-minutes",
        figure: 60,
        window: HOUR,
      } as LimitPolicy,
    ],
    [
      "reads by block",
      READ_POLICY,
      {
        name: "read-by-block-per-60-utc-minutes",
        figure: 600,
        window: HOUR,
      } as LimitPolicy,
    ],
    [
      "policy reports by block, provisional until Q47",
      CSP_REPORT_POLICY,
      {
        name: "csp-report-by-block-per-60-utc-minutes",
        figure: 100,
        window: HOUR,
      } as LimitPolicy,
    ],
    [
      "the e2e twin of saves by block",
      E2E_SAVE_BY_BLOCK_POLICY,
      {
        name: "design-save-by-block-e2e-per-60-utc-minutes",
        figure: 1200,
        window: HOUR,
      } as LimitPolicy,
    ],
    [
      "the e2e twin of share writes",
      E2E_SHARE_WRITE_POLICY,
      {
        name: "share-write-by-block-e2e-per-60-utc-minutes",
        figure: 500,
        window: HOUR,
      } as LimitPolicy,
    ],
  ];

  it.each(ROWS)(
    "holds %s as its name, its figure and its window",
    (_label, policy, expected) => {
      expect(policy).toEqual(expected);
    },
  );

  it("states the figures as constants, the provisional ones among them", () => {
    expect(SAVES_PER_BLOCK_FIGURE).toBe(600);
    expect(SAVES_PER_CREDENTIAL_FIGURE).toBe(300);
    expect(SHARE_WRITES_PER_BLOCK_FIGURE).toBe(60);
    expect(READS_PER_BLOCK_FIGURE).toBe(600);
    expect(E2E_SAVES_PER_BLOCK_FIGURE).toBe(1200);
    expect(E2E_SHARE_WRITES_PER_BLOCK_FIGURE).toBe(500);
  });

  it("freezes every policy and its window, so no caller moves a figure or an edge", () => {
    expect(
      ALL_LIMIT_POLICIES.every(
        (policy) => Object.isFrozen(policy) && Object.isFrozen(policy.window),
      ),
    ).toBe(true);
  });

  it("gives every policy a name of its own that carries its window and starts with no other's", () => {
    const names = ALL_LIMIT_POLICIES.map((policy) => policy.name);

    // Eight before the contact form, its six policies and three twins since, and the policy report's one.
    expect(ALL_LIMIT_POLICIES).toHaveLength(18);
    expect(new Set(names).size).toBe(names.length);
    for (const policy of ALL_LIMIT_POLICIES) {
      const label =
        policy.window.kind === "chisinau-day"
          ? "chisinau-day"
          : `${String(policy.window.minutes)}-utc-minutes`;
      expect(policy.name.endsWith(`-per-${label}`)).toBe(true);
    }
    expect(
      names.filter((name) =>
        names.some((other) => other !== name && other.startsWith(`${name}-`)),
      ),
    ).toEqual([]);
  });

  it("gives every figure above nought and every window a whole number of minutes that divides a day", () => {
    for (const { figure, window } of ALL_LIMIT_POLICIES) {
      expect(Number.isInteger(figure) && figure >= 1).toBe(true);
      if (window.kind === "utc-minutes") {
        expect(1440 % window.minutes).toBe(0);
      }
    }
  });

  it("keeps each e2e twin above the production figure of its purpose, so a misplaced flag never lowers a limit", () => {
    expect(E2E_MINT_POLICY.figure).toBeGreaterThan(MINT_POLICY.figure);
    expect(E2E_SAVE_BY_BLOCK_POLICY.figure).toBeGreaterThan(
      SAVE_BY_BLOCK_POLICY.figure,
    );
    expect(E2E_SHARE_WRITE_POLICY.figure).toBeGreaterThan(
      SHARE_WRITE_POLICY.figure,
    );
  });
});

const ABSENT: unique symbol = Symbol("absent");
type FlagValue = string | undefined | typeof ABSENT;
type FlagCase = readonly [string, FlagValue];

const FLAG_CASES: readonly FlagCase[] = [
  ["absent", ABSENT],
  ["an own member holding undefined", undefined],
  ["empty", ""],
  ["exactly 1", "1"],
  ["true", "true"],
  ["01", "01"],
  ["a leading space", " 1"],
  ["a trailing space", "1 "],
  ["a trailing line break", "1\n"],
  ["0", "0"],
  ["another word", "e2e"],
];

const SOURCE_CASES: readonly FlagCase[] = [
  ["absent", ABSENT],
  ["an own member holding undefined", undefined],
  ["empty", ""],
  ["the platform's name", "vercel"],
  ["another word", "other"],
];

function environmentOf(flag: FlagValue, source: FlagValue): NetworkEnvironment {
  return {
    ...(flag === ABSENT ? {} : { [E2E_RATE_LIMIT_POLICY_FLAG]: flag }),
    ...(source === ABSENT ? {} : { CLIENT_NETWORK_SOURCE: source }),
  };
}

describe("choosePolicy: the flag against the network source", () => {
  const UNAVAILABLE = {
    status: "unavailable",
    variable: "LEMNARIA_E2E_RATE_LIMIT_POLICY",
  };

  interface Cell {
    readonly flagLabel: string;
    readonly flag: FlagValue;
    readonly sourceLabel: string;
    readonly source: FlagValue;
  }

  const cells = FLAG_CASES.flatMap(([flagLabel, flag]) =>
    SOURCE_CASES.map(
      ([sourceLabel, source]): Cell => ({
        flagLabel,
        flag,
        sourceLabel,
        source,
      }),
    ),
  );

  it.each(cells)(
    "decides the flag $flagLabel beside the source $sourceLabel as the rule says",
    ({ flag, source }) => {
      const isEnabled = flag === "1";
      const sourceIsPresent = source !== ABSENT;
      const expected = !isEnabled
        ? { status: "chosen", policy: MINT_POLICY }
        : sourceIsPresent
          ? UNAVAILABLE
          : { status: "chosen", policy: E2E_MINT_POLICY };

      expect(choosePolicy(environmentOf(flag, source), "mint")).toEqual(
        expected,
      );
    },
  );

  it("covers every cell of the table, with a floor on each outcome", () => {
    const outcomes = cells.map(({ flag, source }) =>
      choosePolicy(environmentOf(flag, source), "mint"),
    );
    const named = (name: string) =>
      outcomes.filter(
        (outcome) =>
          outcome.status === "chosen" && outcome.policy.name === name,
      );

    expect(cells).toHaveLength(FLAG_CASES.length * SOURCE_CASES.length);
    expect(named(MINT_POLICY_NAME).length).toBeGreaterThanOrEqual(40);
    expect(named(E2E_MINT_POLICY_NAME)).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "unavailable"),
    ).toHaveLength(SOURCE_CASES.length - 1);
  });

  it("chooses the mint's row for an empty environment", () => {
    expect(choosePolicy({}, "mint")).toEqual({
      status: "chosen",
      policy: MINT_POLICY,
    });
  });

  it("does not take an inherited flag as the flag", () => {
    const inherited = Object.create({
      [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
    }) as NetworkEnvironment;

    expect(choosePolicy(inherited, "mint")).toEqual({
      status: "chosen",
      policy: MINT_POLICY,
    });
  });

  it("does not count an inherited network source as present beside the flag", () => {
    const environment = Object.create({
      CLIENT_NETWORK_SOURCE: "vercel",
    }) as Record<string, string>;
    environment[E2E_RATE_LIMIT_POLICY_FLAG] = "1";

    expect(choosePolicy(environment, "mint")).toEqual({
      status: "chosen",
      policy: E2E_MINT_POLICY,
    });
  });

  it("names the flag and nothing of any value it saw", () => {
    const answer = choosePolicy(
      {
        [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
        CLIENT_NETWORK_SOURCE: "VALUE-MARKER-2210",
      },
      "mint",
    );

    expect(JSON.stringify(answer)).not.toContain("MARKER");
  });
});

describe("choosePolicy: one flag chooses the twin of every purpose that has one", () => {
  const PURPOSES: readonly [PolicyPurpose, LimitPolicy, LimitPolicy][] = [
    ["mint", MINT_POLICY, E2E_MINT_POLICY],
    ["save-by-block", SAVE_BY_BLOCK_POLICY, E2E_SAVE_BY_BLOCK_POLICY],
    [
      "save-by-credential",
      SAVE_BY_CREDENTIAL_POLICY,
      SAVE_BY_CREDENTIAL_POLICY,
    ],
    ["share-write", SHARE_WRITE_POLICY, E2E_SHARE_WRITE_POLICY],
    ["read", READ_POLICY, READ_POLICY],
    ["csp-report", CSP_REPORT_POLICY, CSP_REPORT_POLICY],
  ];
  const UNAVAILABLE = {
    status: "unavailable",
    variable: "LEMNARIA_E2E_RATE_LIMIT_POLICY",
  };

  it.each(PURPOSES)(
    "chooses the production policy of %s for an empty environment and for a flag that is not exactly 1",
    (purpose, production) => {
      const environments = FLAG_CASES.filter(([, flag]) => flag !== "1").map(
        ([, flag]) => environmentOf(flag, ABSENT),
      );

      for (const environment of [{}, ...environments]) {
        expect(choosePolicy(environment, purpose)).toEqual({
          status: "chosen",
          policy: production,
        });
      }
    },
  );

  it.each(PURPOSES)(
    "chooses the e2e twin of %s for the flag exactly 1 and no source",
    (purpose, _production, twin) => {
      expect(choosePolicy(environmentOf("1", ABSENT), purpose)).toEqual({
        status: "chosen",
        policy: twin,
      });
    },
  );

  it.each(PURPOSES)(
    "chooses nothing for %s when the flag is beside any source, whatever it holds",
    (purpose) => {
      for (const [, source] of SOURCE_CASES.filter(
        ([, value]) => value !== ABSENT,
      )) {
        expect(choosePolicy(environmentOf("1", source), purpose)).toEqual(
          UNAVAILABLE,
        );
      }
    },
  );

  it("moves exactly the mint, saves by block and share writes to a twin, not the credential or reads", () => {
    const moved = PURPOSES.filter(([purpose]) => {
      const production = choosePolicy({}, purpose);
      const flagged = choosePolicy(environmentOf("1", ABSENT), purpose);
      return JSON.stringify(production) !== JSON.stringify(flagged);
    }).map(([purpose]) => purpose);

    expect(moved).toEqual(["mint", "save-by-block", "share-write"]);
  });
});

describe("choosePolicy: a purpose that is not the list's own", () => {
  it.each([
    ["a word that is not a purpose", "save"],
    ["a purpose in another case", "Mint"],
    ["an inherited member's name", "constructor"],
    ["the prototype's name", "__proto__"],
    ["an inherited method's name", "toString"],
    ["empty", ""],
    ["nothing", undefined],
  ])(
    "is misconfigured for %s, answered and not thrown, naming no variable",
    (_label, purpose) => {
      expect(choosePolicy({}, purpose as PolicyPurpose)).toStrictEqual({
        status: "unavailable",
        variable: undefined,
      });
    },
  );
});

describe("isE2eTwin: which policies carry a figure that is not the production one", () => {
  it("is true of the six twins and of no other policy", () => {
    const twins = ALL_LIMIT_POLICIES.filter((policy) => isE2eTwin(policy));

    expect(twins).toEqual([
      E2E_MINT_POLICY,
      E2E_SAVE_BY_BLOCK_POLICY,
      E2E_SHARE_WRITE_POLICY,
      E2E_CONTACT_EVERY_BY_BLOCK_POLICY,
      E2E_CONTACT_NEW_BY_BLOCK_HOUR_POLICY,
      E2E_CONTACT_NEW_BY_BLOCK_DAY_POLICY,
    ]);
  });

  it("is false for a copy of a twin, which is not the twin", () => {
    expect(isE2eTwin({ ...E2E_MINT_POLICY })).toBe(false);
  });
});

describe("isOwnPolicy: the closed set, by identity", () => {
  it("knows every policy of the list", () => {
    expect(ALL_LIMIT_POLICIES.every((policy) => isOwnPolicy(policy))).toBe(
      true,
    );
  });

  it.each([
    ["a copy of the mint's policy", { ...MINT_POLICY }],
    [
      "a look-alike with the mint's name and figure",
      { name: MINT_POLICY_NAME, figure: 20, window: { kind: "chisinau-day" } },
    ],
    ["a policy's name", MINT_POLICY_NAME],
    ["nothing", undefined],
    ["null", null],
  ])("does not know %s", (_label, candidate) => {
    expect(isOwnPolicy(candidate)).toBe(false);
  });

  it("holds a list nobody can add to", () => {
    expect(Object.isFrozen(ALL_LIMIT_POLICIES)).toBe(true);
  });
});

describe("limit-policy.ts", () => {
  it("reads source: names neither the process environment nor the build mode", () => {
    expect(readSource("lib/server/rate-limit/limit-policy.ts")).not.toMatch(
      PROCESS_ENV_OR_BUILD_MODE,
    );
  });
});
