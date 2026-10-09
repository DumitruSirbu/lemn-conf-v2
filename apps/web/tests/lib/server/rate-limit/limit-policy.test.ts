import { describe, expect, it } from "vitest";

import {
  choosePolicy,
  E2E_MINT_DAILY_FIGURE,
  E2E_MINT_POLICY,
  E2E_MINT_POLICY_NAME,
  E2E_RATE_LIMIT_POLICY_FLAG,
  MINT_DAILY_FIGURE,
  MINT_POLICY,
  MINT_POLICY_NAME,
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
      window: "chisinau-day",
    });
    expect(E2E_MINT_POLICY).toEqual({
      name: E2E_MINT_POLICY_NAME,
      figure: 1100,
      window: "chisinau-day",
    });
  });

  it("states the figures as constants: twenty a day, and a thousand for the suite", () => {
    expect(MINT_DAILY_FIGURE).toBe(20);
    expect(E2E_MINT_DAILY_FIGURE).toBe(1100);
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
  ["the development host's name", "vercel"],
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

      expect(choosePolicy(environmentOf(flag, source))).toEqual(expected);
    },
  );

  it("covers every cell of the table, with a floor on each outcome", () => {
    const outcomes = cells.map(({ flag, source }) =>
      choosePolicy(environmentOf(flag, source)),
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
    expect(choosePolicy({})).toEqual({ status: "chosen", policy: MINT_POLICY });
  });

  it("does not take an inherited flag as the flag", () => {
    const inherited = Object.create({
      [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
    }) as NetworkEnvironment;

    expect(choosePolicy(inherited)).toEqual({
      status: "chosen",
      policy: MINT_POLICY,
    });
  });

  it("does not count an inherited network source as present beside the flag", () => {
    const environment = Object.create({
      CLIENT_NETWORK_SOURCE: "vercel",
    }) as Record<string, string>;
    environment[E2E_RATE_LIMIT_POLICY_FLAG] = "1";

    expect(choosePolicy(environment)).toEqual({
      status: "chosen",
      policy: E2E_MINT_POLICY,
    });
  });

  it("names the flag and nothing of any value it saw", () => {
    const answer = choosePolicy({
      [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
      CLIENT_NETWORK_SOURCE: "VALUE-MARKER-2210",
    });

    expect(JSON.stringify(answer)).not.toContain("MARKER");
  });
});

describe("limit-policy.ts", () => {
  it("reads source: names neither the process environment nor the build mode", () => {
    expect(readSource("lib/server/rate-limit/limit-policy.ts")).not.toMatch(
      PROCESS_ENV_OR_BUILD_MODE,
    );
  });
});
