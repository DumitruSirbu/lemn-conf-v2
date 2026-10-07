import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  InvalidConnectionUrlError,
  openDatabase,
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
