import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_MS,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "../src/m10-ports.js";
import { NeonKitchenChangeStore } from "../src/neon-kitchen-change-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * Adversarial QA of M10 wave S4 with no database: the digest's bounds reach SQL from the domain's constants and are
 * never restated, an instant the statement cannot cast is refused before it is sent, and no production file of the wave
 * does arithmetic on a revision (criterion S-c: a revision is opaque above SQL).
 */
const SOURCE = join(import.meta.dirname, "../src");

/** The production files S4 wrote or changed that handle a revision. The fakes' stand-in comparison is not among them. */
const FILES_THAT_HANDLE_A_REVISION = [
  "kitchen-change-statements.ts",
  "neon-kitchen-change-store.ts",
  "neon-staff-kitchen-reader.ts",
  "staff-kitchen-reader.ts",
  "staff-kitchen-statements.ts",
  "fake-staff-kitchen-reader.ts",
];

const ARITHMETIC_ON_A_VALUE =
  /\b(?:Number|BigInt|parseInt|parseFloat)\s*\(|\bMath\.\w+\s*\(|(?<![\w)\]])[+-]\s*\w*[rR]evision\b|\w*[rR]evision\w*\s*(?:[+\-*/%]|<|>|<=|>=)\s*\w/;

/** The code that names a revision, without comments and without the SQL in template literals, where `>` is SQL's. */
function codeLinesNamingARevision(file: string): string[] {
  const code = readFileSync(join(SOURCE, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/`[^`]*`/g, "``");
  return code
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => /revision/i.test(line));
}

function newStore(): NeonKitchenChangeStore {
  return new NeonKitchenChangeStore(WELL_FORMED_UNREACHABLE_VALUE);
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("a revision is opaque above SQL (S-c)", () => {
  it.each(FILES_THAT_HANDLE_A_REVISION)(
    "%s parses, orders and does arithmetic on no revision",
    (file) => {
      const offending = codeLinesNamingARevision(file).filter((line) =>
        ARITHMETIC_ON_A_VALUE.test(line),
      );

      expect(offending.map((line) => line.trim())).toEqual([]);
    },
  );

  it("sees the stand-in comparison where the plan puts it and nowhere in the statements", () => {
    const statements = [
      "kitchen-change-statements.ts",
      "staff-kitchen-statements.ts",
    ];

    for (const file of statements) {
      const text = readFileSync(join(SOURCE, file), "utf8");
      expect(text, file).not.toContain("isRevisionAhead");
    }
  });
});

describe("the digest's bounds come from the domain and are not restated", () => {
  const RESTATED_BOUNDS = [
    /\b720\b/,
    /\b2592000000\b/,
    /\b30\s+days?\b/i,
    /interval\s+'\s*\d+\s*hours?\s*'/i,
    /'offer-sent'/,
    /'closed'/,
    /\bnow\(\)/i,
    /current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp/i,
  ];

  async function sentList() {
    answerQueryWith([]);
    await newStore().listDigestEligible(new Date("2026-11-10T08:00:00.000Z"));
    const [statement] = queryDriver.statements;
    if (statement === undefined) throw new Error("no statement was sent");
    return statement;
  }

  it.each(
    RESTATED_BOUNDS.map((pattern) => [String(pattern), pattern] as const),
  )("leaves %s out of the statement's text", async (_label, pattern) => {
    const { text } = await sentList();

    expect(text).not.toMatch(pattern);
  });

  it("sends the passed instant, the domain's window in milliseconds and the domain's stopping statuses, as values", async () => {
    const { values } = await sentList();

    expect(values).toEqual([
      "2026-11-10T08:00:00.000Z",
      DIGEST_WINDOW_MS,
      DIGEST_STOPPING_STATUSES,
    ]);
    expect(DIGEST_WINDOW_MS).toBe(720 * 3_600_000);
  });

  it("sends the same text for every instant, so the instant is only ever a value", async () => {
    const texts = new Set<string>();
    for (const iso of [
      "2001-01-01T00:00:00.000Z",
      "2040-06-30T23:59:59.999Z",
    ]) {
      resetQueryDriver();
      answerQueryWith([]);
      await newStore().listDigestEligible(new Date(iso));
      texts.add(queryDriver.statements[0]?.text ?? "");
    }

    expect(texts.size).toBe(1);
  });
});

describe("an instant the digest statement cannot cast is refused before it is sent", () => {
  it.each([
    ["an invalid Date", new Date(Number.NaN)],
    ["a Date past what a Date holds", new Date(8.64e15 + 1)],
    [
      "the first year the ISO text prefixes with a sign",
      new Date(Date.UTC(10_000, 0, 1)),
    ],
    ["the last instant before year 0001", new Date(Date.UTC(1, 0, 1) - 1)],
    ["the latest instant a Date holds", new Date(8.64e15)],
    ["the earliest instant a Date holds", new Date(-8.64e15)],
  ])(
    "answers %s with invalid-request and no statement",
    async (_label, now) => {
      answerQueryWith([]);

      const failure = await rejectionOf(newStore().listDigestEligible(now));

      expect(failure).toBeInstanceOf(DashboardStoreError);
      expect((failure as DashboardStoreError).failure).toBe("invalid-request");
      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it.each([
    ["year 0001", new Date("0001-01-01T00:00:00.000Z")],
    ["year 9999", new Date("9999-12-31T23:59:59.999Z")],
    ["the epoch", new Date(0)],
  ])("sends %s, whose ISO text Postgres reads", async (_label, now) => {
    answerQueryWith([]);

    await newStore().listDigestEligible(now);

    expect(queryDriver.statements).toHaveLength(1);
  });
});
