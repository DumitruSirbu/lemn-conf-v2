import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteDesignsForTests,
  findDesignIdsForTests,
} from "../src/delete-designs-for-tests.js";
import { InvalidConnectionUrlError } from "../src/open-database.js";
import {
  assertSafeTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from "../src/test-database-url.js";
import {
  acceptedValuesFor,
  markersFoundOn,
  refusedValuesFor,
} from "./support/leaked-connection-markers.js";

const ALLOWLISTED_DATABASE = "lemnaria_test";
const OTHER_APPLICATION_URL =
  "postgresql://appuser:apppw@app-host.invalid/appdb";

const WRONG_SCHEME_APPLICATION_URL =
  refusedValuesFor("appdb").find(({ label }) => label === "wrong scheme")
    ?.value ?? "";

const UNPARSEABLE_LABELS: readonly string[] = [
  "missing host",
  "non-URL string",
  "bad port",
];

const REFUSED = refusedValuesFor(ALLOWLISTED_DATABASE);
const ACCEPTED = acceptedValuesFor(ALLOWLISTED_DATABASE);
const UNPARSEABLE = REFUSED.filter(({ label }) =>
  UNPARSEABLE_LABELS.includes(label),
);
const PARSEABLE_BUT_NOT_DRIVER_SHAPED = REFUSED.filter(
  ({ label }) => !UNPARSEABLE_LABELS.includes(label),
);

const HELPERS = [
  { name: "deleteDesignsForTests", run: () => deleteDesignsForTests(["id"]) },
  { name: "findDesignIdsForTests", run: () => findDesignIdsForTests(["id"]) },
];

function stubTestUrl(value: string): void {
  vi.stubEnv("TEST_DATABASE_URL", value);
  vi.stubEnv("DATABASE_URL", OTHER_APPLICATION_URL);
}

async function errorRaisedBy(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(HELPERS)("$name with TEST_DATABASE_URL set to", ({ run }) => {
  describe.each(REFUSED)("a $label", ({ value }) => {
    it("throws the opener's error naming TEST_DATABASE_URL, with no marker on any surface and no cause", async () => {
      stubTestUrl(value);

      const error = await errorRaisedBy(run);

      expect(error).toBeInstanceOf(InvalidConnectionUrlError);
      expect((error as InvalidConnectionUrlError).variableName).toBe(
        "TEST_DATABASE_URL",
      );
      expect(markersFoundOn(error)).toEqual([]);
      expect(error).not.toHaveProperty("cause");
    });
  });

  describe.each(ACCEPTED)("a well-formed $label", ({ value }) => {
    it("fails at the query with the driver's own error, carrying no marker", async () => {
      stubTestUrl(value);

      const error = await errorRaisedBy(run);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(InvalidConnectionUrlError);
      expect(markersFoundOn(error)).toEqual([]);
    });
  });
});

describe("the helpers when TEST_DATABASE_URL is unset and the URL is derived from DATABASE_URL", () => {
  it.each(HELPERS)(
    "$name names DATABASE_URL, the variable that is wrong, with no marker",
    async ({ run }) => {
      vi.stubEnv("TEST_DATABASE_URL", "");
      vi.stubEnv("DATABASE_URL", WRONG_SCHEME_APPLICATION_URL);

      const error = await errorRaisedBy(run);

      expect(error).toBeInstanceOf(InvalidConnectionUrlError);
      expect((error as InvalidConnectionUrlError).variableName).toBe(
        "DATABASE_URL",
      );
      expect(markersFoundOn(error)).toEqual([]);
    },
  );
});

const GUARD_ENTRY_POINTS: readonly [string, (testUrl: string) => void][] = [
  [
    "resolveTestDatabaseUrl",
    () => {
      resolveTestDatabaseUrl();
    },
  ],
  [
    "assertSafeTestDatabaseUrl",
    (testUrl) => {
      assertSafeTestDatabaseUrl(testUrl);
    },
  ],
];

describe.each(GUARD_ENTRY_POINTS)(
  "%s with TEST_DATABASE_URL set to",
  (_name, check) => {
    describe.each(UNPARSEABLE)("an unparseable $label", ({ value }) => {
      it("throws the opener's error naming TEST_DATABASE_URL, with no marker and no cause", async () => {
        stubTestUrl(value);

        const error = await errorRaisedBy(() => {
          check(value);
        });

        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
        expect((error as InvalidConnectionUrlError).variableName).toBe(
          "TEST_DATABASE_URL",
        );
        expect(markersFoundOn(error)).toEqual([]);
        expect(error).not.toHaveProperty("cause");
      });
    });

    describe.each([...PARSEABLE_BUT_NOT_DRIVER_SHAPED, ...ACCEPTED])(
      "a parseable $label naming an allowlisted database",
      ({ value }) => {
        it("makes the same decision as before: the guard judges database identity, not driver shape, and accepts", async () => {
          stubTestUrl(value);

          expect(
            await errorRaisedBy(() => {
              check(value);
            }),
          ).toBeUndefined();
        });
      },
    );
  },
);

describe("the guard when DATABASE_URL, the application's own URL, is unparseable", () => {
  describe.each(UNPARSEABLE)("a $label", ({ value }) => {
    it.each(GUARD_ENTRY_POINTS)(
      "%s throws the opener's error naming DATABASE_URL, with no marker",
      async (_name, check) => {
        const testUrl = `postgresql://u:p@ci.invalid/${ALLOWLISTED_DATABASE}`;
        vi.stubEnv("TEST_DATABASE_URL", testUrl);
        vi.stubEnv("DATABASE_URL", value);

        const error = await errorRaisedBy(() => {
          check(testUrl);
        });

        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
        expect((error as InvalidConnectionUrlError).variableName).toBe(
          "DATABASE_URL",
        );
        expect(markersFoundOn(error)).toEqual([]);
      },
    );
  });
});
