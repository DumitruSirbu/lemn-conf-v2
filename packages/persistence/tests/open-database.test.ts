import { fc } from "@fast-check/vitest";
import { Client, neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  InvalidConnectionUrlError,
  NO_AGREED_DATABASE_NAME,
  agreedDatabaseNameOf,
  databaseNameOf,
  openDatabase,
  openDatabaseSession,
  parseConnectionUrl,
} from "../src/open-database.js";
import type { ConnectionVariableName } from "../src/open-database.js";
import { isTransientFailure } from "../src/retry-on-transient-failure.js";
import {
  ACCEPTED_VALUES,
  FAKE_HOST,
  FAKE_PASSWORD,
  FAKE_USER,
  REFUSED_VALUES,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

const CONNECTION_VARIABLES: readonly ConnectionVariableName[] = [
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "TEST_DATABASE_URL",
];

function refusalOf(
  value: string,
  variableName: ConnectionVariableName,
): InvalidConnectionUrlError {
  try {
    openDatabase(value, variableName);
  } catch (error) {
    if (error instanceof InvalidConnectionUrlError) return error;
    throw new Error("the opener threw something other than its domain error");
  }
  throw new Error("the opener accepted a value it must refuse");
}

function namesVariable(message: string, name: ConnectionVariableName): boolean {
  return new RegExp(`(?<![A-Z_])${name}(?![A-Z_])`).test(message);
}

describe.each(CONNECTION_VARIABLES)("openDatabase for %s", (variableName) => {
  describe.each(REFUSED_VALUES)("refuses a $label", ({ value }) => {
    it("throws the domain error naming the variable", () => {
      const refusal = refusalOf(value, variableName);

      expect(refusal.variableName).toBe(variableName);
      expect(refusal.message).toContain(variableName);
    });

    it("carries no marker on message, stack, any own property, the cause chain or util.inspect", () => {
      expect(markersFoundOn(refusalOf(value, variableName))).toEqual([]);
    });

    it("keeps neither the refused string nor the caught error: no cause, only its four own properties", () => {
      const refusal = refusalOf(value, variableName);

      expect("cause" in refusal).toBe(false);
      expect(Object.getOwnPropertyNames(refusal).sort()).toEqual([
        "message",
        "name",
        "stack",
        "variableName",
      ]);
    });

    it("is not a transient failure, so the persistence retry never repeats it", () => {
      expect(isTransientFailure(refusalOf(value, variableName))).toBe(false);
    });
  });

  it("says the same thing for every refused value, so the message reveals nothing about which part was bad", () => {
    const messages = REFUSED_VALUES.map(
      ({ value }) => refusalOf(value, variableName).message,
    );

    expect(new Set(messages).size).toBe(1);
  });

  it("names only its own variable", () => {
    const [{ value }] = REFUSED_VALUES as [(typeof REFUSED_VALUES)[number]];
    const others = CONNECTION_VARIABLES.filter((name) => name !== variableName);

    const { message } = refusalOf(value, variableName);

    expect(others.filter((other) => namesVariable(message, other))).toEqual([]);
  });

  describe.each(ACCEPTED_VALUES)("accepts a $label", ({ value }) => {
    it("opens a query function without throwing", () => {
      expect(typeof openDatabase(value, variableName)).toBe("function");
    });
  });
});

describe("openDatabase and the driver agree on what a connection string is", () => {
  const VALUES_BOTH_JUDGE = [
    ...REFUSED_VALUES.map(({ value }) => value),
    ...ACCEPTED_VALUES.map(({ value }) => value),
    `postgresql://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db?sslmode=require&channel_binding=require`,
    `postgres://${FAKE_USER}:p%40ss%2Fword@${FAKE_HOST}:5432/lemn%2Dfake-db`,
    `postgres://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}`,
    `postgres://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/`,
    `postgres://${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`,
    `postgres://:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`,
    `postgres://${FAKE_USER}:${FAKE_PASSWORD}@[::1]:5432/lemn-fake-db`,
    `postgres:/${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`,
    `POSTGRES://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`,
    ` postgres://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`,
    "",
  ];

  function driverAccepts(value: string): boolean {
    try {
      neon(value);
      return true;
    } catch {
      return false;
    }
  }

  function openerAccepts(value: string): boolean {
    try {
      openDatabase(value, "DATABASE_URL");
      return true;
    } catch {
      return false;
    }
  }

  it("never accepts a value `neon()` rejects, so the driver's own echoing error stays unreachable", () => {
    const acceptedByTheOpenerOnly = VALUES_BOTH_JUDGE.flatMap((value, index) =>
      openerAccepts(value) && !driverAccepts(value) ? [index] : [],
    );

    expect(acceptedByTheOpenerOnly).toEqual([]);
  });

  it("never accepts a swept string `neon()` rejects", () => {
    const fragments = [
      "postgres://",
      "postgresql://",
      "postgres:",
      FAKE_USER,
      FAKE_PASSWORD,
      FAKE_HOST,
      ":",
      "@",
      "/",
      "?",
      "#",
      "%ZZ",
      "%2F",
      "%",
      " ",
      "[",
      "5432",
      "notaport",
    ];
    const swept = fc
      .array(
        fc.oneof(fc.constantFrom(...fragments), fc.string({ maxLength: 3 })),
        { maxLength: 12 },
      )
      .map((parts) => parts.join(""));

    fc.assert(
      fc.property(swept, (value) => {
        expect(openerAccepts(value) && !driverAccepts(value)).toBe(false);
      }),
      { seed: 20261008, numRuns: 3_000 },
    );
  });

  it("refuses exactly three forms the driver takes: no database, one slash and no slash after the scheme", () => {
    const takenByTheDriverOnly = VALUES_BOTH_JUDGE.filter(
      (value) => driverAccepts(value) && !openerAccepts(value),
    );

    expect(takenByTheDriverOnly).toEqual(
      expect.arrayContaining([
        `postgres://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}`,
        `postgres:/${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`,
      ]),
    );
    expect(driverAccepts("postgres:u:p@h/db")).toBe(true);
    expect(openerAccepts("postgres:u:p@h/db")).toBe(false);
  });

  it("judges both a refused and an accepted case, so the comparison is not vacuous", () => {
    expect(VALUES_BOTH_JUDGE.some(openerAccepts)).toBe(true);
    expect(VALUES_BOTH_JUDGE.some((value) => !openerAccepts(value))).toBe(true);
  });
});

describe.each(CONNECTION_VARIABLES)(
  "openDatabaseSession for %s",
  (variableName) => {
    function sessionRefusalOf(value: string): InvalidConnectionUrlError {
      try {
        openDatabaseSession(value, variableName);
      } catch (error) {
        if (error instanceof InvalidConnectionUrlError) return error;
        throw new Error(
          "the opener threw something other than its domain error",
        );
      }
      throw new Error("the opener accepted a value it must refuse");
    }

    describe.each(REFUSED_VALUES)("refuses a $label", ({ value }) => {
      it("throws the domain error naming the variable, with no marker on any surface and no cause", () => {
        const refusal = sessionRefusalOf(value);

        expect(refusal.variableName).toBe(variableName);
        expect(refusal.message).toContain(variableName);
        expect(markersFoundOn(refusal)).toEqual([]);
        expect("cause" in refusal).toBe(false);
        expect(Object.getOwnPropertyNames(refusal).sort()).toEqual([
          "message",
          "name",
          "stack",
          "variableName",
        ]);
      });
    });

    describe.each(ACCEPTED_VALUES)("accepts a $label", ({ value }) => {
      it("constructs a client without connecting", () => {
        expect(openDatabaseSession(value, variableName)).toBeInstanceOf(Client);
      });
    });
  },
);

describe("openDatabaseSession and the drivers agree on what a connection string is", () => {
  const VALUES_BOTH_JUDGE = [
    ...REFUSED_VALUES.map(({ value }) => value),
    ...ACCEPTED_VALUES.map(({ value }) => value),
    `postgresql://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db?sslmode=require`,
    `postgres://${FAKE_USER}:p%40ss%2Fword@${FAKE_HOST}:5432/lemn%2Dfake-db`,
    `postgres://${FAKE_USER}:${FAKE_PASSWORD}@[::1]:5432/lemn-fake-db`,
    `postgres:/${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`,
    "",
  ];

  function judges(open: (value: string) => unknown, value: string): boolean {
    try {
      open(value);
      return true;
    } catch {
      return false;
    }
  }

  const sessionAccepts = (value: string): boolean =>
    judges((v) => openDatabaseSession(v, "MIGRATION_DATABASE_URL"), value);
  const queryAccepts = (value: string): boolean =>
    judges((v) => openDatabase(v, "DATABASE_URL"), value);
  const clientAccepts = (value: string): boolean =>
    judges((v) => new Client(v), value);

  it("applies the same shape rule as the query opener", () => {
    const disagreements = VALUES_BOTH_JUDGE.flatMap((value, index) =>
      sessionAccepts(value) === queryAccepts(value) ? [] : [index],
    );

    expect(disagreements).toEqual([]);
  });

  it("never accepts a value that `new Client` rejects, so the construction cannot throw the driver's own error", () => {
    const unconstructible = VALUES_BOTH_JUDGE.filter(
      (value) => sessionAccepts(value) && !clientAccepts(value),
    );

    expect(unconstructible).toEqual([]);
  });

  it("refuses the values `new Client` alone takes and then never settles on: a bad percent-escape and a wrong scheme", () => {
    const takenByTheDriverOnly = REFUSED_VALUES.filter(
      ({ value }) => clientAccepts(value) && !sessionAccepts(value),
    ).map(({ label }) => label);

    expect(takenByTheDriverOnly).toEqual(
      expect.arrayContaining(["bad percent-escape", "wrong scheme"]),
    );
  });

  it("judges both an accepted and a refused case, so the comparison is not vacuous", () => {
    expect(VALUES_BOTH_JUDGE.some(sessionAccepts)).toBe(true);
    expect(VALUES_BOTH_JUDGE.some((value) => !sessionAccepts(value))).toBe(
      true,
    );
  });
});

describe("the one accepted shape, pinned for both entry points", () => {
  const ACCEPTED_SHAPES: readonly [string, string][] = [
    [
      "postgres: with a user, a password, a host and a database",
      "postgres://u:p@h/db",
    ],
    ["postgresql:", "postgresql://u:p@h/db"],
    ["an upper-case scheme", "POSTGRES://u:p@h/db"],
    ["an empty password", "postgres://u:@h/db"],
    ["a user without a password", "postgres://u@h/db"],
    ["a port and a query", "postgres://u:p@h:5432/db?sslmode=require"],
    ["a percent-encoded password", "postgres://u:p%40w@h/db"],
  ];

  const REFUSED_SHAPES: readonly [string, string][] = [
    ["no user", "postgres://h/db"],
    ["an empty user", "postgres://:p@h/db"],
    ["a socket path", "socket:/var/run/postgresql?db=x"],
    ["a bare path and a name", "/var/run/postgresql db"],
    ["the pg: scheme", "pg://u:p@h/db"],
    ["another database's scheme", "mysql://u:p@h/db"],
    ["a keyword string", "host=h dbname=x user=u"],
    ["an empty host", "postgres://u:p@/db"],
    ["no database, which the driver takes", "postgresql://u@h"],
    ["an empty database name, which the driver takes", "postgres://u@h/"],
    [
      "one slash after the scheme, which the driver takes",
      "postgres:/u:p@h/db",
    ],
    ["no slash after the scheme, which the driver takes", "postgres:u:p@h/db"],
    ["the empty string", ""],
  ];

  it.each(ACCEPTED_SHAPES)("accepts %s", (_label, value) => {
    expect(() => openDatabase(value, "DATABASE_URL")).not.toThrow();
    expect(() =>
      openDatabaseSession(value, "MIGRATION_DATABASE_URL"),
    ).not.toThrow();
  });

  it.each(REFUSED_SHAPES)("refuses %s", (_label, value) => {
    expect(() => openDatabase(value, "DATABASE_URL")).toThrow(
      InvalidConnectionUrlError,
    );
    expect(() => openDatabaseSession(value, "MIGRATION_DATABASE_URL")).toThrow(
      InvalidConnectionUrlError,
    );
  });
});

describe("a refusal names a variable only if the value was read from it", () => {
  const HANDED_IN_OPENERS: readonly [
    string,
    (value: string) => unknown,
    readonly string[],
  ][] = [
    [
      "openDatabase",
      (value) => openDatabase(value),
      REFUSED_VALUES.map(({ value }) => value),
    ],
    [
      "openDatabaseSession",
      (value) => openDatabaseSession(value),
      REFUSED_VALUES.map(({ value }) => value),
    ],
    [
      "parseConnectionUrl",
      (value) => parseConnectionUrl(value),
      REFUSED_VALUES.filter(({ label }) =>
        ["missing host", "non-URL string", "bad port"].includes(label),
      ).map(({ value }) => value),
    ],
  ];

  it.each(HANDED_IN_OPENERS)(
    "%s refuses a handed-in value as handed in: no variable, no marker, the same four own properties",
    (_name, open, values) => {
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        const error = thrownBy(() => open(value));

        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
        expect((error as InvalidConnectionUrlError).variableName).toBe(
          undefined,
        );
        expect((error as Error).message).toMatch(
          /^The connection string handed in is not a valid/,
        );
        for (const variableName of CONNECTION_VARIABLES)
          expect((error as Error).message).not.toContain(variableName);
        expect(markersFoundOn(error)).toEqual([]);
        expect(Object.getOwnPropertyNames(error).sort()).toEqual([
          "message",
          "name",
          "stack",
          "variableName",
        ]);
      }
    },
  );

  it("still names the variable when the caller says it read the value from one", () => {
    const [{ value }] = REFUSED_VALUES as [(typeof REFUSED_VALUES)[number]];

    const error = thrownBy(() => openDatabase(value, "DATABASE_URL"));

    expect((error as InvalidConnectionUrlError).variableName).toBe(
      "DATABASE_URL",
    );
    expect((error as Error).message).toMatch(/^DATABASE_URL is not a valid/);
  });

  function thrownBy(run: () => unknown): unknown {
    try {
      run();
    } catch (error) {
      return error;
    }
    return undefined;
  }
});

describe("a database name is read only where every reader agrees", () => {
  const BACKSLASH_IN_USERINFO = `postgres://a@b\\${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemnaria_test`;

  function nameTheHttpDriverReads(value: string): string {
    const { protocol } = new URL(value);
    const reparsed = new URL(`http:${value.substring(protocol.length)}`);
    return decodeURIComponent(reparsed.pathname).replace(/^\//, "");
  }

  it("gives a name every reader gives, for an ordinary URL", () => {
    expect(
      agreedDatabaseNameOf("postgresql://u:p@h/lemn-conf-v2?sslmode=require"),
    ).toBe("lemn-conf-v2");
  });

  it("gives no name when the HTTP driver reads a backslash as a slash and the other readers do not", () => {
    expect(agreedDatabaseNameOf(BACKSLASH_IN_USERINFO)).toBe(
      NO_AGREED_DATABASE_NAME,
    );
    expect(nameTheHttpDriverReads(BACKSLASH_IN_USERINFO)).not.toBe(
      "lemnaria_test",
    );
  });

  it.each([
    ["a backslash in the user", BACKSLASH_IN_USERINFO],
    ["a percent-escape in the name", "postgres://u:p@h/lemn%2Dconf%2Dv2"],
    ["a backslash in the name", "postgres://u:p@h/foo\\..\\lemn-conf-v2"],
  ])(
    "refuses %s in both openers, and databaseNameOf has no name for it",
    (_label, value) => {
      expect(() => openDatabase(value)).toThrow(InvalidConnectionUrlError);
      expect(() => openDatabaseSession(value)).toThrow(
        InvalidConnectionUrlError,
      );
      expect(databaseNameOf(value)).toBe(NO_AGREED_DATABASE_NAME);
    },
  );

  describe("over a sweep of strings", () => {
    const fragments = [
      "postgres://",
      "postgresql://",
      "postgres:",
      FAKE_USER,
      FAKE_PASSWORD,
      FAKE_HOST,
      "lemnaria_test",
      "lemn-conf-v2",
      ":",
      "@",
      "/",
      "\\",
      "?",
      "#",
      "%2F",
      "%ZZ",
      "%",
      "\t",
      " ",
      "..",
      "[",
    ];
    const assembled = fc
      .array(
        fc.oneof(fc.constantFrom(...fragments), fc.string({ maxLength: 3 })),
        { maxLength: 14 },
      )
      .map((parts) => parts.join(""));
    const nearlyWellFormed = fc
      .record({
        scheme: fc.constantFrom("postgres://", "postgresql://"),
        user: fc.constantFrom(FAKE_USER, `a@b\\${FAKE_USER}`, `${FAKE_USER}\t`),
        password: fc.constantFrom(FAKE_PASSWORD, `x@${FAKE_PASSWORD}`, ""),
        host: fc.constantFrom(
          FAKE_HOST,
          `b\\${FAKE_HOST}`,
          `${FAKE_HOST}:5432`,
        ),
        path: fc.constantFrom(
          "/lemnaria_test",
          "/lemn-conf-v2",
          "/x/../lemnaria_test",
          "/lemnaria\ttest",
          "/lemnaria%5Ftest",
          "/lemnaria\\test",
          "/lemnaria_test?dbname=other",
          "/a b",
        ),
      })
      .map(
        ({ scheme, user, password, host, path }) =>
          `${scheme}${user}:${password}@${host}${path}`,
      );
    const swept = fc.oneof(assembled, nearlyWellFormed);
    const SWEEP = { seed: 20261008, numRuns: 4_000 };

    function isAccepted(value: string): boolean {
      try {
        openDatabase(value);
        return true;
      } catch {
        return false;
      }
    }

    it("accepts strings whose compared name is the session driver's, and the HTTP re-reading's", () => {
      const accepted = fc.sample(swept, SWEEP).filter(isAccepted);

      const differsFromTheSessionDriver = accepted.filter(
        (value) => databaseNameOf(value) !== new Client(value).database,
      );
      const differsFromTheHttpReading = accepted.filter(
        (value) => databaseNameOf(value) !== nameTheHttpDriverReads(value),
      );

      expect(accepted.length).toBeGreaterThan(0);
      expect(differsFromTheSessionDriver).toEqual([]);
      expect(differsFromTheHttpReading).toEqual([]);
    });

    it("accepts the same strings through the session opener as through the query opener", () => {
      fc.assert(
        fc.property(swept, (value) => {
          const sessionAccepts = (() => {
            try {
              openDatabaseSession(value);
              return true;
            } catch {
              return false;
            }
          })();

          expect(sessionAccepts).toBe(isAccepted(value));
        }),
        SWEEP,
      );
    });
  });
});

describe("an entry point refuses a string exactly when a consumer of it refuses it", () => {
  const withPassword = (password: string): string =>
    `postgresql://${FAKE_USER}:${password}@${FAKE_HOST}/lemn-conf-v2?sslmode=require`;
  const withParameter = (parameter: string): string =>
    `${withPassword(FAKE_PASSWORD)}&${parameter}`;

  const HEADER_REFUSES: readonly [string, string][] = [
    ["an interior line feed", withPassword("FAKEPASS\nWORD")],
    ["an interior carriage return", withPassword("FAKEPASS\rWORD")],
    ["an interior NUL", withPassword("FAKEPASS\u0000WORD")],
    ["a character above U+00FF", withPassword("FAKEPASSĀWORD")],
  ];
  const BOTH_ACCEPT: readonly [string, string][] = [
    ["a trailing line feed", `${withPassword(FAKE_PASSWORD)}\n`],
    ["a Latin-1 letter", withPassword("FAKEPASSé")],
    ["a tab", withPassword("FAKEPASS\tWORD")],
    ["a space", withPassword("FAKEPASS WORD")],
    ["a DEL", withPassword("FAKEPASS\u007fWORD")],
  ];
  const SESSION_REFUSES: readonly [string, string][] = [
    ["sslrootcert", withParameter("sslrootcert=system")],
    ["sslcert", withParameter("sslcert=/x")],
    ["sslkey", withParameter("sslkey=/x")],
  ];

  function refusalOf(run: () => unknown): InvalidConnectionUrlError {
    try {
      run();
    } catch (error) {
      if (error instanceof InvalidConnectionUrlError) return error;
    }
    throw new Error("the entry point did not refuse");
  }

  it.each(HEADER_REFUSES)(
    "refuses %s over HTTP, with the sentence about the request header, and accepts it for a session",
    (_label, value) => {
      const refusal = refusalOf(() => openDatabase(value, "DATABASE_URL"));

      expect(refusal.message).toMatch(/cannot be sent to the query endpoint/);
      expect(markersFoundOn(refusal)).toEqual([]);
      expect(() =>
        openDatabaseSession(value, "MIGRATION_DATABASE_URL"),
      ).not.toThrow();
    },
  );

  it.each(BOTH_ACCEPT)("accepts %s through both entry points", (_l, value) => {
    expect(() => openDatabase(value, "DATABASE_URL")).not.toThrow();
    expect(() =>
      openDatabaseSession(value, "MIGRATION_DATABASE_URL"),
    ).not.toThrow();
  });

  it.each(SESSION_REFUSES)(
    "accepts %s over HTTP, as before, and refuses it for a session with the sentence about the session client",
    (_label, value) => {
      expect(() => openDatabase(value, "DATABASE_URL")).not.toThrow();

      const refusal = refusalOf(() =>
        openDatabaseSession(value, "MIGRATION_DATABASE_URL"),
      );

      expect(refusal.message).toMatch(/migration session client will build/);
      expect(refusal.message).not.toMatch(/user, a host and a database/);
      expect(markersFoundOn(refusal)).toEqual([]);
      expect(refusal).not.toHaveProperty("cause");
    },
  );

  it("says one thing per class and each class's sentence is true of it: shape, request header, session client", () => {
    const [[, headerValue]] = HEADER_REFUSES as [[string, string]];
    const [[, sessionValue]] = SESSION_REFUSES as [[string, string]];
    const messages = new Set([
      refusalOf(() => openDatabase("postgres://h/db")).message,
      refusalOf(() => openDatabase(headerValue)).message,
      refusalOf(() => openDatabaseSession(sessionValue)).message,
    ]);

    expect(messages.size).toBe(3);
  });

  describe("over a sweep", () => {
    const fragments = [
      "postgresql://",
      "postgres://",
      FAKE_USER,
      FAKE_PASSWORD,
      FAKE_HOST,
      "lemn-conf-v2",
      ":",
      "@",
      "/",
      "?",
      "&",
      "\n",
      "\r",
      "\u0000",
      "Ā",
      "é",
      "\t",
      " ",
      "sslrootcert=system",
      "sslcert=/x",
      "sslkey=/x",
      "sslmode=require",
    ];
    const swept = fc
      .array(
        fc.oneof(fc.constantFrom(...fragments), fc.string({ maxLength: 3 })),
        { maxLength: 12 },
      )
      .map((parts) => parts.join(""));
    const wellFormedWithOneFragment = fc
      .constantFrom(...fragments)
      .map(
        (fragment) =>
          `postgresql://${FAKE_USER}:${FAKE_PASSWORD}${fragment}@${FAKE_HOST}/lemn-conf-v2?x=${fragment}`,
      );
    const wellFormedWithAParameter = fc
      .constantFrom(...fragments)
      .map(
        (fragment) =>
          `postgresql://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-conf-v2?sslmode=require&${fragment}`,
      );
    const anyValue = fc.oneof(
      swept,
      wellFormedWithOneFragment,
      wellFormedWithAParameter,
    );
    const SWEEP = { seed: 20261009, numRuns: 4_000 };

    function throwsFrom(run: () => unknown): boolean {
      try {
        run();
        return false;
      } catch {
        return true;
      }
    }

    function refusalMessageOf(run: () => unknown): string | undefined {
      try {
        run();
      } catch (error) {
        return (error as Error).message;
      }
      return undefined;
    }

    it("refuses over HTTP only what the shape rules, the header or the driver's constructor refuse, and over a session only what the shape rules or the session client refuse", () => {
      const shapeSentence = "is not a valid Postgres connection string";
      let sawHeaderRefusal = false;
      let sawSessionRefusal = false;
      fc.assert(
        fc.property(anyValue, (value) => {
          const overHttp = refusalMessageOf(() => openDatabase(value));
          const forASession = refusalMessageOf(() =>
            openDatabaseSession(value),
          );
          const shapeRefuses = forASession?.includes(shapeSentence) === true;
          const headerRefuses = throwsFrom(() => {
            new Headers({ "Neon-Connection-String": value });
          });
          const constructorRefuses = throwsFrom(() => neon(value));
          const sessionClientRefuses = throwsFrom(() => new Client(value));
          sawHeaderRefusal ||= !shapeRefuses && headerRefuses;
          sawSessionRefusal ||= !shapeRefuses && sessionClientRefuses;

          expect(overHttp !== undefined).toBe(
            shapeRefuses || headerRefuses || constructorRefuses,
          );
          expect(forASession !== undefined).toBe(
            shapeRefuses || sessionClientRefuses,
          );
        }),
        SWEEP,
      );

      expect(sawHeaderRefusal).toBe(true);
      expect(sawSessionRefusal).toBe(true);
    });
  });
});
