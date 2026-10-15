// The test-only functions that reach `contact_submissions` and `csp_reports`, under what their guards must refuse
// whatever else is true: production mode with every runner's marker set at once, a process whose markers are all
// blank, and a list in which one entry among good ones is not what the function takes (a request id, a writer mark).
// The driver is mocked, so a refusal is shown by no statement sent. The csp pair (8Q2 criterion 16) is swept beside the
// contact pair, and again over generated text, so a guard that checks a list's first entry alone, or a pattern that
// reaches beyond its own rows, is caught by a counterexample and not by a list somebody thought of.
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countContactSubmissionsForTests } from "../src/count-contact-submissions-for-tests.js";
import { countCspReportsForTests } from "../src/count-csp-reports-for-tests.js";
import { deleteContactSubmissionsForTests } from "../src/delete-contact-submissions-for-tests.js";
import { deleteCspReportsForTests } from "../src/delete-csp-reports-for-tests.js";
import {
  answerWith,
  driver,
  resetDriver,
} from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

const TEST_URL = "postgresql://owner:secret@host.neon.tech/lemnaria_test";
const EVERY_MARKER = ["VITEST", "TEST_WORKER_INDEX", "PLAYWRIGHT_TEST"];
const BLANKS = ["", " ", "\t\n"];
const GOOD_IDS = ["qa8k_request_0000000001", "qa8k_request_0000000002"];
const NOT_REQUEST_IDS = [
  "",
  "%",
  "short",
  "qa8k_request_000000000%",
  "qa8k request 0000000001",
  "qa8k_request_0000000001' or '1'='1",
  "q".repeat(65),
];

const CONTACT_TEST_ONLY_CALLS: readonly [
  string,
  (ids: readonly string[]) => Promise<unknown>,
][] = [
  ["deleteContactSubmissionsForTests", deleteContactSubmissionsForTests],
  ["countContactSubmissionsForTests", countContactSubmissionsForTests],
];

const ANOTHER_TEXT_THAT_IS_NO_ID = "!";

/** What a call was refused with, or nothing when it was not refused. */
function refusalOf(
  call: (ids: readonly string[]) => Promise<unknown>,
  ids: readonly string[],
): Promise<unknown> {
  return call(ids).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
}

/** The same words whatever text was refused is how a refusal is shown to hold none of it. */
function messageOf(refusal: unknown): string {
  if (!(refusal instanceof Error)) throw new Error("the call was not refused");
  return refusal.message;
}

function setEveryMarkerTo(value: string): void {
  for (const marker of EVERY_MARKER) vi.stubEnv(marker, value);
}

beforeEach(() => {
  resetDriver();
  vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  vi.stubEnv("DATABASE_URL", TEST_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(CONTACT_TEST_ONLY_CALLS)("%s", (name, call) => {
  it("refuses production mode with every runner's marker set at once, and sends no statement", async () => {
    setEveryMarkerTo("1");
    vi.stubEnv("NODE_ENV", "production");

    await expect(call(GOOD_IDS)).rejects.toThrow(
      `${name} was called with NODE_ENV=production`,
    );
    expect(driver.statements).toEqual([]);
  });

  it.each(BLANKS)(
    "refuses a process whose every marker is set to %j, and sends no statement",
    async (blank) => {
      setEveryMarkerTo(blank);

      await expect(call(GOOD_IDS)).rejects.toThrow(
        `${name} was called outside a test runner`,
      );
      expect(driver.statements).toEqual([]);
    },
  );

  it.each(NOT_REQUEST_IDS)(
    "sends no statement for a list of good ids with %j among them, and refuses in words that hold none of it",
    async (notAnId) => {
      const [first = "", second = ""] = GOOD_IDS;

      const refusal = await refusalOf(call, [first, notAnId, second]);

      expect(driver.statements).toEqual([]);
      expect(messageOf(refusal)).toBe(
        messageOf(await refusalOf(call, [ANOTHER_TEXT_THAT_IS_NO_ID])),
      );
    },
  );
});

const APPLICATION_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const GOOD_MARKS = ["a".repeat(64), "0123456789abcdef".repeat(4)];
const NOT_MARKS = [
  "",
  "%",
  "a".repeat(63),
  "a".repeat(65),
  "A".repeat(64),
  "g".repeat(64),
  `${"a".repeat(64)}\n`,
  `\n${"a".repeat(64)}`,
  `${"a".repeat(63)}'`,
  `${"a".repeat(32)}' or '1'='1`.padEnd(64, "a"),
  `${"a".repeat(32)}%${"a".repeat(31)}`,
  "\u0660".repeat(64),
  "\uff10".repeat(64),
  "\u{1D7CE}".repeat(32),
  `${"a".repeat(63)}\u0131`,
];

const CSP_TEST_ONLY_CALLS: readonly [
  string,
  (marks: readonly string[]) => Promise<unknown>,
][] = [
  ["deleteCspReportsForTests", deleteCspReportsForTests],
  ["countCspReportsForTests", countCspReportsForTests],
];

describe.each(CSP_TEST_ONLY_CALLS)("%s", (name, call) => {
  it("refuses production mode with every runner's marker set at once, and sends no statement", async () => {
    setEveryMarkerTo("1");
    vi.stubEnv("NODE_ENV", "production");

    await expect(call(GOOD_MARKS)).rejects.toThrow(
      `${name} was called with NODE_ENV=production`,
    );
    expect(driver.statements).toEqual([]);
  });

  it.each(BLANKS)(
    "refuses a process whose every marker is set to %j, and sends no statement",
    async (blank) => {
      setEveryMarkerTo(blank);

      await expect(call(GOOD_MARKS)).rejects.toThrow(
        `${name} was called outside a test runner`,
      );
      expect(driver.statements).toEqual([]);
    },
  );

  it("refuses an empty marker list's runner check first: production mode is refused even when there is nothing to send", async () => {
    setEveryMarkerTo("1");
    vi.stubEnv("NODE_ENV", "production");

    await expect(call([])).rejects.toThrow(
      `${name} was called with NODE_ENV=production`,
    );
    expect(driver.statements).toEqual([]);
  });

  it.each(NOT_MARKS)(
    "sends no statement for good marks with %j among them at any position, and refuses in words that hold none of it",
    async (notAMark) => {
      const [first = "", second = ""] = GOOD_MARKS;

      for (const list of [
        [notAMark, first, second],
        [first, notAMark, second],
        [first, second, notAMark],
        [notAMark],
      ]) {
        const refusal = await refusalOf(call, list);

        expect(driver.statements).toEqual([]);
        expect(messageOf(refusal)).toBe(
          messageOf(await refusalOf(call, [ANOTHER_TEXT_THAT_IS_NO_ID])),
        );
      }
    },
  );

  it("sends no statement for any list in which any entry is not exactly 64 lower-case hexadecimal characters, over generated text", async () => {
    const isAMark = (text: string): boolean => /^[0-9a-f]{64}$/.test(text);
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.string({ unit: "binary", maxLength: 80 }),
            fc.stringMatching(/^[0-9a-f]{60,68}$/),
            fc.stringMatching(/^[0-9a-fA-F]{64}[\n ]?$/),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        async (marks) => {
          resetDriver();
          if (marks.every(isAMark)) return;

          const refusal = await refusalOf(call, marks);

          expect(refusal).toBeInstanceOf(Error);
          expect(driver.statements).toEqual([]);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("sends exactly one statement holding exactly the marks handed over, in order and with a repeat kept, never a pattern", async () => {
    vi.stubEnv("DATABASE_URL", APPLICATION_URL);
    const repeated = [...GOOD_MARKS, ...GOOD_MARKS];
    answerWith([{ slot: 1, stored: 1 }]);

    await call(repeated);

    expect(driver.statements).toHaveLength(1);
    expect(driver.statements[0]?.values).toEqual([repeated]);
    expect(driver.statements[0]?.text).not.toMatch(
      /\blike\b|\bilike\b|~|%|\bor\b|;/i,
    );
  });

  it("names no table but csp_reports and says where only by the one mark column", async () => {
    vi.stubEnv("DATABASE_URL", APPLICATION_URL);
    answerWith([{ slot: 1, stored: 1 }]);

    await call(GOOD_MARKS);

    const text = (driver.statements[0]?.text ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/\bfrom csp_reports where writer_mark = any\(\?\)/);
    expect(text).not.toMatch(
      /csp_report_cursor|\bdesigns\b|rate_limit|contact_submissions/,
    );
  });
});
