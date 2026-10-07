import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteDesignsForTests,
  findDesignIdsForTests,
} from "../src/delete-designs-for-tests.js";
import {
  InvalidConnectionUrlError,
  openDatabase,
  openDatabaseSession,
} from "../src/open-database.js";
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

    describe.each(PARSEABLE_BUT_NOT_DRIVER_SHAPED)(
      "a parseable $label naming an allowlisted database",
      ({ value }) => {
        it("is refused with the opener's own refusal, since the live suites could not open it", async () => {
          stubTestUrl(value);

          const error = await errorRaisedBy(() => {
            check(value);
          });

          expect(error).toBeInstanceOf(InvalidConnectionUrlError);
          expect(markersFoundOn(error)).toEqual([]);
        });
      },
    );

    describe.each(ACCEPTED)(
      "a well-formed $label naming an allowlisted database",
      ({ value }) => {
        it("is accepted: the guard judges database identity and whether the URL can be opened", async () => {
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

describe("the guard reads a database name only where every reader agrees", () => {
  const BACKSLASH_IN_USERINFO = `postgres://a@b\\u:p@host.invalid/${ALLOWLISTED_DATABASE}`;
  const AGREED_APPLICATION_URL =
    "postgresql://appuser:apppw@app-host.invalid/appdb";

  it.each(GUARD_ENTRY_POINTS)(
    "%s refuses a test URL whose written name is allowlisted while a driver reads another",
    async (_name, check) => {
      vi.stubEnv("TEST_DATABASE_URL", BACKSLASH_IN_USERINFO);
      vi.stubEnv("DATABASE_URL", AGREED_APPLICATION_URL);

      const error = await errorRaisedBy(() => {
        check(BACKSLASH_IN_USERINFO);
      });

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /^Refusing to run live database tests: .*not one of the databases/,
      );
    },
  );

  it.each(GUARD_ENTRY_POINTS)(
    "%s refuses any test URL when the application URL's name cannot be read in agreement",
    async (_name, check) => {
      const goodTestUrl = `postgresql://u:p@ci.invalid/${ALLOWLISTED_DATABASE}`;
      vi.stubEnv("TEST_DATABASE_URL", goodTestUrl);
      vi.stubEnv("DATABASE_URL", BACKSLASH_IN_USERINFO);

      const error = await errorRaisedBy(() => {
        check(goodTestUrl);
      });

      expect((error as Error).message).toMatch(
        /^Refusing to run live database tests: the database DATABASE_URL names is not read the same way/,
      );
      expect(markersFoundOn(error)).toEqual([]);
    },
  );

  it.each(GUARD_ENTRY_POINTS)(
    "%s still accepts a test URL and an application URL whose names every reader gives alike",
    async (_name, check) => {
      const goodTestUrl = `postgresql://u:p@ci.invalid/${ALLOWLISTED_DATABASE}`;
      vi.stubEnv("TEST_DATABASE_URL", goodTestUrl);
      vi.stubEnv("DATABASE_URL", AGREED_APPLICATION_URL);

      expect(
        await errorRaisedBy(() => {
          check(goodTestUrl);
        }),
      ).toBeUndefined();
    },
  );
});

describe("the guard allows a test URL only if both entry points would open it", () => {
  const FAKE_HEAD = "FAKEPASSHEAD_8B";
  const FAKE_TAIL = "FAKEPASSTAIL_8B";
  const APPLICATION_URL = "postgresql://appuser:apppw@app-host.invalid/appdb";
  const testUrlWith = (
    password: string,
    databaseName = ALLOWLISTED_DATABASE,
    query = "sslmode=require",
  ): string =>
    `postgresql://fakeuser_8B:${password}@fakehost-8b.invalid/${databaseName}?${query}`;

  function stubBoth(testUrl: string, applicationUrl = APPLICATION_URL): void {
    vi.stubEnv("TEST_DATABASE_URL", testUrl);
    vi.stubEnv("DATABASE_URL", applicationUrl);
  }

  it.each(GUARD_ENTRY_POINTS)(
    "%s refuses a password with a line break, and nothing of the value is in the refusal",
    async (_name, check) => {
      const value = testUrlWith(`${FAKE_HEAD}\n${FAKE_TAIL}`);
      stubBoth(value);

      const error = await errorRaisedBy(() => {
        check(value);
      });

      expect(error).toBeInstanceOf(InvalidConnectionUrlError);
      expect((error as Error).message).toMatch(/query endpoint/);
      expect(
        markersFoundOn(error, [
          FAKE_HEAD,
          FAKE_TAIL,
          "fakeuser_8B",
          "fakehost-8b",
        ]),
      ).toEqual([]);
    },
  );

  it("names TEST_DATABASE_URL for a value read from it, and DATABASE_URL for one derived from it", async () => {
    stubBoth(testUrlWith(`${FAKE_HEAD}\n${FAKE_TAIL}`));
    const fromOverride = await errorRaisedBy(() => resolveTestDatabaseUrl());
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv(
      "DATABASE_URL",
      testUrlWith(FAKE_HEAD, "appdb", "sslrootcert=system"),
    );
    const fromDerived = await errorRaisedBy(() => resolveTestDatabaseUrl());

    expect((fromOverride as InvalidConnectionUrlError).variableName).toBe(
      "TEST_DATABASE_URL",
    );
    expect((fromDerived as InvalidConnectionUrlError).variableName).toBe(
      "DATABASE_URL",
    );
  });

  it("refuses a URL a session cannot use, such as one with sslrootcert", async () => {
    const value = testUrlWith(
      FAKE_HEAD,
      ALLOWLISTED_DATABASE,
      "sslrootcert=system",
    );
    stubBoth(value);

    const error = await errorRaisedBy(() => {
      assertSafeTestDatabaseUrl(value);
    });

    expect((error as Error).message).toMatch(/migration session client/);
  });

  it("still reports an unlisted name as unlisted, and the application's own name as that, before the opener speaks", async () => {
    const unlisted = testUrlWith(`${FAKE_HEAD}\n${FAKE_TAIL}`, "somedb");
    stubBoth(unlisted);
    const unlistedError = await errorRaisedBy(() => {
      assertSafeTestDatabaseUrl(unlisted);
    });
    const sameAsApplication = testUrlWith(`${FAKE_HEAD}\n${FAKE_TAIL}`);
    stubBoth(sameAsApplication, testUrlWith("apppw"));
    const applicationError = await errorRaisedBy(() => {
      assertSafeTestDatabaseUrl(sameAsApplication);
    });

    expect((unlistedError as Error).message).toMatch(
      /not one of the databases/,
    );
    expect((applicationError as Error).message).toMatch(
      /the database name DATABASE_URL points at/,
    );
  });

  it.each([
    [
      "a pooled endpoint",
      "ep-cool-1234-pooler.eu-central-1.aws.neon.tech",
      "sslmode=require&channel_binding=require",
    ],
    [
      "a direct endpoint",
      "ep-cool-1234.eu-central-1.aws.neon.tech",
      "sslmode=require",
    ],
    [
      "an endpoint option",
      "ep-cool-1234.eu-central-1.aws.neon.tech",
      "sslmode=require&options=endpoint%3Dep-cool-1234",
    ],
  ])("still allows a real-shaped URL: %s", async (_label, host, query) => {
    const value = `postgresql://neondb_owner:npg_Fake%2Fpass%40word@${host}/${ALLOWLISTED_DATABASE}?${query}`;
    stubBoth(value);

    expect(
      await errorRaisedBy(() => {
        assertSafeTestDatabaseUrl(value);
      }),
    ).toBeUndefined();
    expect(await errorRaisedBy(() => resolveTestDatabaseUrl())).toBeUndefined();
  });

  it("allows only strings that both entry points open, over a sweep", () => {
    const pieces = [
      FAKE_HEAD,
      FAKE_TAIL,
      "\n",
      "\r",
      "\u0000",
      "\u0100",
      "\t",
      " ",
      "%40",
      "@",
    ];
    const sweep = fc.record({
      password: fc
        .array(fc.constantFrom(...pieces), { maxLength: 4 })
        .map((parts) => parts.join("")),
      query: fc.constantFrom(
        "sslmode=require",
        "sslrootcert=system",
        "sslcert=/x",
        "",
        "options=endpoint%3Dep-x",
      ),
      trailing: fc.constantFrom("", "\n", " "),
      user: fc.constantFrom("fakeuser_8B", ""),
    });
    let allowed = 0;

    fc.assert(
      fc.property(sweep, ({ password, query, trailing, user }) => {
        const value = `postgresql://${user}:${password}@fakehost-8b.invalid/${ALLOWLISTED_DATABASE}?${query}${trailing}`;
        vi.stubEnv("TEST_DATABASE_URL", value);
        vi.stubEnv("DATABASE_URL", APPLICATION_URL);
        try {
          assertSafeTestDatabaseUrl(value);
        } catch {
          return;
        }
        allowed += 1;

        expect(() => openDatabase(value)).not.toThrow();
        expect(() => openDatabaseSession(value)).not.toThrow();
      }),
      { seed: 20261010, numRuns: 1_500 },
    );
    expect(allowed).toBeGreaterThan(0);
  });
});
