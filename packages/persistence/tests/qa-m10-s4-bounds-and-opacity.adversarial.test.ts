import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_MS,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "../src/m10-ports.js";
import { NeonKitchenChangeStore } from "../src/neon-kitchen-change-store.js";
import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import { EFFECTIVE_SEEN_REVISION } from "../src/staff-kitchen-statements.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
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

const EARLIEST_CASTABLE_MS = Date.parse("0001-01-01T00:00:00.000Z");
const LATEST_CASTABLE_MS = Date.parse("9999-12-31T23:59:59.999Z");

const UNCASTABLE_INSTANTS: readonly (readonly [string, unknown])[] = [
  ["an invalid Date", new Date(Number.NaN)],
  ["a Date one millisecond past what a Date holds", new Date(8.64e15 + 1)],
  ["the latest instant a Date holds", new Date(8.64e15)],
  ["the earliest instant a Date holds", new Date(-8.64e15)],
  ["the first millisecond of year 10000", new Date(LATEST_CASTABLE_MS + 1)],
  [
    "the first millisecond of year 10000, parsed from its signed text",
    new Date(Date.parse("+010000-01-01T00:00:00.000Z")),
  ],
  ["the last millisecond of year 0000", new Date(EARLIEST_CASTABLE_MS - 1)],
  [
    "the last millisecond of year -1, parsed from its signed text",
    new Date(Date.parse("-000001-12-31T23:59:59.999Z")),
  ],
  ["a number", 1_790_000_000_000],
  ["its ISO text", "2026-11-10T08:00:00.000Z"],
  ["null", null],
  ["an object with a getTime", { getTime: () => 1_790_000_000_000 }],
];

const CASTABLE_INSTANTS: readonly (readonly [string, Date])[] = [
  ["the first millisecond of year 0001", new Date(EARLIEST_CASTABLE_MS)],
  ["the last millisecond of year 9999", new Date(LATEST_CASTABLE_MS)],
  ["the epoch", new Date(0)],
  ["a day in 2026", new Date("2026-11-10T08:00:00.000Z")],
];

describe("an instant the digest statement cannot cast is refused before it is sent", () => {
  it("puts the two bounds where the ISO text stops having four digits", () => {
    expect(new Date(EARLIEST_CASTABLE_MS).toISOString()).toBe(
      "0001-01-01T00:00:00.000Z",
    );
    expect(new Date(EARLIEST_CASTABLE_MS - 1).toISOString()).toBe(
      "0000-12-31T23:59:59.999Z",
    );
    expect(new Date(LATEST_CASTABLE_MS).toISOString()).toBe(
      "9999-12-31T23:59:59.999Z",
    );
    expect(new Date(LATEST_CASTABLE_MS + 1).toISOString()).toBe(
      "+010000-01-01T00:00:00.000Z",
    );
  });

  it.each(UNCASTABLE_INSTANTS)(
    "answers %s with invalid-request and no statement",
    async (_label, now) => {
      answerQueryWith([]);

      const failure = await rejectionOf(
        newStore().listDigestEligible(now as Date),
      );

      expect(failure).toBeInstanceOf(DashboardStoreError);
      expect((failure as DashboardStoreError).failure).toBe("invalid-request");
      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it.each(UNCASTABLE_INSTANTS)(
    "is answered the same way by the fake for %s",
    async (_label, now) => {
      const { changes } = newFakeDashboardWorld();

      const failure = await rejectionOf(
        changes.listDigestEligible(now as Date),
      );

      expect(failure).toBeInstanceOf(DashboardStoreError);
      expect((failure as DashboardStoreError).failure).toBe("invalid-request");
    },
  );

  it.each(CASTABLE_INSTANTS)(
    "sends %s, whose ISO text Postgres reads, and the fake lists for it",
    async (_label, now) => {
      answerQueryWith([]);

      await newStore().listDigestEligible(now);
      const fakeList =
        await newFakeDashboardWorld().changes.listDigestEligible(now);

      expect(queryDriver.statements).toHaveLength(1);
      expect(queryDriver.statements[0]?.values[0]).toBe(now.toISOString());
      expect(fakeList).toEqual([]);
    },
  );
});

describe("the effective seen revision is one text in the four statements that judge it", () => {
  const SESSION = {
    sessionTokenHash: "a".repeat(64),
    idleLifetimeSeconds: { client: 1, operator: 1, administrator: 1 },
  };
  const DESIGN_ID = "D".repeat(21);

  function squashed(text: string): string {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }

  async function everyStatementThatJudgesIt(): Promise<Record<string, string>> {
    const reader = new NeonStaffKitchenReader(WELL_FORMED_UNREACHABLE_VALUE);
    answerQueryWith([{ total: 0, changed_count: 0, id: null }]);
    await reader.listPage({
      segment: "sent",
      status: null,
      search: null,
      page: 1,
    });
    answerQueryWith([]);
    await reader.readOne(DESIGN_ID);
    answerQueryWith([
      {
        is_session_live: true,
        is_kitchen_visible: true,
        is_displayed_ahead: false,
        marked_rows: 1,
        audited_rows: 1,
        is_changed_after_seen: false,
      },
    ]);
    await newStore().markSeen({
      designId: DESIGN_ID,
      displayedRevision: "1",
      audit: {
        session: SESSION,
        entry: { action: "kitchen-seen", detail: {} },
      } as never,
    });
    answerQueryWith([]);
    await newStore().listDigestEligible(new Date("2026-11-10T08:00:00.000Z"));
    const [list, kitchen, mark, digest] = queryDriver.statements.map((s) =>
      squashed(s.text),
    );
    if (
      list === undefined ||
      kitchen === undefined ||
      mark === undefined ||
      digest === undefined
    ) {
      throw new Error("a statement was not sent");
    }
    return { list, kitchen, mark, digest };
  }

  it("is the constant, word for word, in the list, the kitchen's statement, the seen mark and the digest", async () => {
    const statements = await everyStatementThatJudgesIt();

    for (const [which, text] of Object.entries(statements)) {
      expect(text, which).toContain(squashed(EFFECTIVE_SEEN_REVISION));
    }
  });

  it("is spelled once in each statement, and no statement still reads the mark by coalesce", async () => {
    const statements = await everyStatementThatJudgesIt();
    const constant = squashed(EFFECTIVE_SEEN_REVISION);

    for (const [which, text] of Object.entries(statements)) {
      expect(text.split(constant).length - 1, which).toBe(1);
      expect(text, which).not.toMatch(/coalesce\(\s*seen\.seen_revision/);
    }
  });

  it("ignores a mark above the kitchen's own revision, and takes the greater of the mark and the latest request", () => {
    expect(squashed(EFFECTIVE_SEEN_REVISION)).toBe(
      "greatest(case when seen.seen_revision <= d.revision then seen.seen_revision end, latest.design_revision)",
    );
  });
});
