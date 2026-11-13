import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_STORED_DEFAULTS_BYTES,
  storableDefaultsJsonOf,
} from "../src/dashboard-store-shapes.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
} from "../src/m10-ports.js";
import type { DashboardStoreFailure } from "../src/m10-ports.js";
import { readMigrationFiles } from "../src/migration-files.js";
import { NeonKitchenDefaultsStore } from "../src/neon-kitchen-defaults-store.js";
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
 * What a defaults save accepts before any statement, and what it makes of every reply a database could give. The bound
 * is in bytes of compact JSON and the table's ceiling is in bytes of `jsonb` text, so both are tested as bytes; the
 * reply is swept over every combination of the five facts the statement answers with, because the refusal that names
 * which revision was stale must never read a partial write as a clean refusal.
 */
const SESSION = {
  sessionTokenHash: "a".repeat(64),
  idleLifetimeSeconds: {
    client: 2_592_000,
    operator: 43_200,
    administrator: 43_200,
  },
};
const SAVED_ENTRY = {
  action: "kitchen-defaults-saved",
  detail: { changedFields: ["material"] },
} as const;

function save(defaults: unknown) {
  return new NeonKitchenDefaultsStore(WELL_FORMED_UNREACHABLE_VALUE).save({
    expectedRevision: "3",
    expectedAvailabilityRevision: "7",
    defaults,
    audit: { session: SESSION, entry: SAVED_ENTRY },
  });
}

async function failureOf(
  call: () => Promise<unknown>,
): Promise<DashboardStoreFailure> {
  const rejection = await rejectionOf(call());
  expect(rejection).toBeInstanceOf(DashboardStoreError);
  return (rejection as DashboardStoreError).failure;
}

function utf8BytesOf(defaults: unknown): number {
  return new TextEncoder().encode(JSON.stringify(defaults)).length;
}

/** A defaults object whose compact JSON is exactly `bytes` long, its one string made of `unit`. */
function defaultsOfExactly(bytes: number, unit: string): object {
  const unitBytes = new TextEncoder().encode(unit).length;
  const overhead = utf8BytesOf({ handle: "" });
  const units = Math.floor((bytes - overhead) / unitBytes);
  const filler = "x".repeat(bytes - overhead - units * unitBytes);
  return { handle: `${filler}${unit.repeat(units)}` };
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the bound on the defaults a save sends is in bytes", () => {
  it.each([
    ["one-byte", "a"],
    ["two-byte", "é"],
    ["three-byte", "€"],
    ["four-byte", "😀"],
  ])(
    "takes %s text up to exactly the bound and refuses one byte more",
    (_width, unit) => {
      const atTheBound = defaultsOfExactly(MAX_STORED_DEFAULTS_BYTES, unit);
      const oneByteOver = defaultsOfExactly(
        MAX_STORED_DEFAULTS_BYTES + 1,
        unit,
      );

      expect(utf8BytesOf(atTheBound)).toBe(MAX_STORED_DEFAULTS_BYTES);
      expect(utf8BytesOf(oneByteOver)).toBe(MAX_STORED_DEFAULTS_BYTES + 1);
      expect(storableDefaultsJsonOf(atTheBound)).toBeDefined();
      expect(storableDefaultsJsonOf(oneByteOver)).toBeUndefined();
    },
  );

  it("refuses text that is within the bound in characters and over it in bytes", () => {
    const charactersWithinBytesOver = {
      handle: "é".repeat(MAX_STORED_DEFAULTS_BYTES - 20),
    };

    expect(JSON.stringify(charactersWithinBytesOver).length).toBeLessThan(
      MAX_STORED_DEFAULTS_BYTES,
    );
    expect(storableDefaultsJsonOf(charactersWithinBytesOver)).toBeUndefined();
  });

  it("is far enough under the table's ceiling that no accepted defaults can pass it as jsonb text", () => {
    const ceilingOfTheTable = Number(
      /octet_length\(defaults::text\) <= (\d+)/.exec(
        readMigrationFiles().find(({ version }) => version === 29)?.sql ?? "",
      )?.[1],
    );
    const jsonbAddsASpaceAfterEachColonAndComma = 1.5;

    expect(
      MAX_STORED_DEFAULTS_BYTES * jsonbAddsASpaceAfterEachColonAndComma,
    ).toBeLessThanOrEqual(ceilingOfTheTable);
  });

  it("never lets through defaults whose jsonb text, printed with a space after each colon and comma, passes the ceiling", () => {
    const jsonbTextOf = (value: unknown): string => {
      if (Array.isArray(value)) {
        return `[${value.map(jsonbTextOf).join(", ")}]`;
      }
      if (typeof value === "object" && value !== null) {
        const members = Object.entries(value).map(
          ([key, member]) => `${JSON.stringify(key)}: ${jsonbTextOf(member)}`,
        );
        return `{${members.join(", ")}}`;
      }
      return JSON.stringify(value);
    };
    const manyTinyMembers = Object.fromEntries(
      Array.from({ length: 3_000 }, (_unused, index) => [
        `k${String(index)}`,
        index % 10,
      ]),
    );
    const manyTinyElements = { handle: Array.from({ length: 8_190 }, () => 1) };
    const shapes = fc.oneof(
      fc.constant(manyTinyMembers),
      fc.constant(manyTinyElements),
      fc.dictionary(
        fc.string({ maxLength: 3 }),
        fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 40 }),
        {
          maxKeys: 600,
        },
      ),
    );

    fc.assert(
      fc.property(shapes, (defaults) => {
        const text = storableDefaultsJsonOf(defaults);
        if (text === undefined) return;
        expect(
          new TextEncoder().encode(jsonbTextOf(JSON.parse(text))).length,
        ).toBeLessThanOrEqual(65_536);
      }),
      { seed: 20261104, numRuns: 100 },
    );
  });
});

describe("a value that is not defaults a table can hold", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an array", [{ handle: "steel" }]],
    ["a string", '{"handle":"steel"}'],
    ["a number", 7],
    ["a date", new Date(0)],
    ["a function", () => ({})],
    ["a member holding a bigint", { depth: 1n }],
    ["a float", { depth: 1.5 }],
    ["a number past the safe integers", { depth: 2 ** 53 }],
    ["a string holding U+0000", { handle: "a\u0000b" }],
    ["a key holding U+0000", { "a\u0000b": "steel" }],
    ["a lone high surrogate", { handle: "\ud83d" }],
    ["a lone low surrogate", { handle: "\ude00" }],
    ["a nesting deeper than a parser can read", nestedDeeply(100_000)],
  ])(
    "is refused as an invalid request, before a statement, for %s",
    async (_name, defaults) => {
      expect(await failureOf(() => save(defaults))).toBe("invalid-request");
      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("is refused for a cycle", async () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;

    expect(await failureOf(() => save(cycle))).toBe("invalid-request");
    expect(queryDriver.statements).toHaveLength(0);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])(
    "does not store a default of %s as the null that JSON makes of it",
    (_name, value) => {
      const stored = storableDefaultsJsonOf({ depth: value });

      expect(stored?.includes("null")).not.toBe(true);
    },
  );

  it("takes an empty object, which a save keeps as defaults of its own", async () => {
    answerQueryWith([
      {
        revision: "4",
        availability_revision: "8",
        audited_rows: 1,
        is_session_live: true,
        is_revision_current: true,
      },
    ]);

    expect((await save({})).kind).toBe("ok");
    expect(queryDriver.statements[0]?.values).toContain("{}");
  });
});

describe("the reply to a save, over every combination of what the statement says", () => {
  interface Reply {
    readonly is_session_live: boolean;
    readonly revision: string | null;
    readonly availability_revision: string | null;
    readonly audited_rows: number;
    readonly is_revision_current: boolean;
  }

  const EVERY_REPLY: readonly Reply[] = [true, false].flatMap(
    (is_session_live) =>
      [null, "4"].flatMap((revision) =>
        [null, "8"].flatMap((availability_revision) =>
          [0, 1].flatMap((audited_rows) =>
            [true, false].map((is_revision_current) => ({
              is_session_live,
              revision,
              availability_revision,
              audited_rows,
              is_revision_current,
            })),
          ),
        ),
      ),
  );

  function isNothingWritten({
    revision,
    availability_revision,
    audited_rows,
  }: Reply): boolean {
    return (
      revision === null && availability_revision === null && audited_rows === 0
    );
  }

  function isWholeSave({
    revision,
    availability_revision,
    audited_rows,
  }: Reply): boolean {
    return (
      revision !== null && availability_revision !== null && audited_rows === 1
    );
  }

  async function outcomeOf(reply: Reply): Promise<string> {
    resetQueryDriver();
    answerQueryWith([reply]);
    try {
      const result = await save({ handle: "steel" });
      return result.kind === "ok" ? "ok" : result.kind;
    } catch (error) {
      return error instanceof DashboardStoreError
        ? error.failure
        : "not a store error";
    }
  }

  function expectedOutcomeOf(reply: Reply): string {
    if (!reply.is_session_live) return "not-recorded";
    if (isWholeSave(reply)) return "ok";
    if (!isNothingWritten(reply)) return "unexpected-answer";
    return reply.is_revision_current
      ? AVAILABILITY_CHANGED_MEANWHILE.kind
      : CHANGED_MEANWHILE.kind;
  }

  it("says not-recorded for every reply from no live session, whatever else it holds", async () => {
    for (const reply of EVERY_REPLY.filter(
      ({ is_session_live }) => !is_session_live,
    )) {
      expect(await outcomeOf(reply), JSON.stringify(reply)).toBe(
        "not-recorded",
      );
    }
  });

  it("answers ok only for a reply that moved the head, saved the defaults and wrote one audit row", async () => {
    for (const reply of EVERY_REPLY.filter(
      ({ is_session_live }) => is_session_live,
    )) {
      expect((await outcomeOf(reply)) === "ok", JSON.stringify(reply)).toBe(
        isWholeSave(reply),
      );
    }
  });

  it("names the stale revision for a refusal that wrote nothing, and the defaults one when both were stale", async () => {
    for (const reply of EVERY_REPLY.filter(
      (candidate) => candidate.is_session_live && isNothingWritten(candidate),
    )) {
      expect(await outcomeOf(reply), JSON.stringify(reply)).toBe(
        expectedOutcomeOf(reply),
      );
    }
  });

  it.each(
    EVERY_REPLY.filter(
      (reply) =>
        reply.is_session_live &&
        !isNothingWritten(reply) &&
        !isWholeSave(reply),
    ).map((reply) => [JSON.stringify(reply), reply] as const),
  )(
    "refuses a reply that shows part of a save, never reading it as a refusal that wrote nothing: %s",
    async (_name, reply) => {
      expect(await outcomeOf(reply)).toBe("unexpected-answer");
    },
  );
});

function nestedDeeply(depth: number): object {
  const root: Record<string, unknown> = {};
  let inner = root;
  for (let level = 0; level < depth; level += 1) {
    const next: Record<string, unknown> = {};
    inner["a"] = next;
    inner = next;
  }
  return root;
}
