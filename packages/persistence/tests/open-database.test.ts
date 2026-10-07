import { Client, neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  InvalidConnectionUrlError,
  openDatabase,
  openDatabaseSession,
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

  it("accepts exactly the values `neon()` accepts, so a well-formed URL behaves as before", () => {
    const disagreements = VALUES_BOTH_JUDGE.flatMap((value, index) =>
      openerAccepts(value) === driverAccepts(value) ? [] : [index],
    );

    expect(disagreements).toEqual([]);
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

describe("the one accepted shape (rule B7), pinned for both entry points", () => {
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
    ["a host with no path, which the driver takes as `/`", "postgresql://u@h"],
    [
      "one slash after the scheme, which the driver re-parses as http:",
      "postgres:/u:p@h/db",
    ],
    ["no slash after the scheme", "postgres:u:p@h/db"],
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
