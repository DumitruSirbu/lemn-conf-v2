// The two test-only functions that reach `contact_submissions`, under what their guards must refuse whatever else is
// true: production mode with every runner's marker set at once, a process whose markers are all blank, and a list in
// which one id among good ones is not a request id. The driver is mocked, so a refusal is shown by no statement sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countContactSubmissionsForTests } from "../src/count-contact-submissions-for-tests.js";
import { deleteContactSubmissionsForTests } from "../src/delete-contact-submissions-for-tests.js";
import { driver, resetDriver } from "./support/mocked-neon-driver.js";

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
