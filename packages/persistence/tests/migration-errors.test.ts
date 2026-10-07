import { describe, expect, it } from "vitest";

import {
  MigrationExecutionError,
  MigrationSequenceError,
  causeUnlessItShowsTheConnection,
  isPrintableFailure,
} from "../src/migration-errors.js";
import { InvalidConnectionUrlError } from "../src/open-database.js";

const PASSWORD = "p4ss/w0rd@FAKE_8B";
const ENCODED_PASSWORD = encodeURIComponent(PASSWORD);
const USER = "fakeuser_8B";
const HOST = "fakehost-8b.invalid";
const CONNECTION_URL = `postgres://${USER}:${ENCODED_PASSWORD}@${HOST}/lemn-fake-db`;

function sqlStateError(): Error {
  return Object.assign(
    new Error("duplicate key value violates unique constraint"),
    {
      code: "23505",
    },
  );
}

describe("causeUnlessItShowsTheConnection", () => {
  it("keeps a cause that shows nothing of the connection, so its SQLSTATE stays reachable", () => {
    const error = sqlStateError();

    const options = causeUnlessItShowsTheConnection(error, CONNECTION_URL);

    expect(options.cause).toBe(error);
  });

  it.each([
    ["the whole connection string", CONNECTION_URL],
    ["the user", USER],
    ["the host", HOST],
    ["the password, decoded", PASSWORD],
    ["the password, as it is written in the string", ENCODED_PASSWORD],
  ])("drops a cause whose message shows %s", (_name, secret) => {
    const error = new Error(`connect failed near ${secret}`);

    expect(causeUnlessItShowsTheConnection(error, CONNECTION_URL)).toEqual({});
  });

  it("drops a cause that shows the connection only in its stack", () => {
    const error = new Error("clean message");
    error.stack = `Error: clean message\n    at ${HOST}`;

    expect(causeUnlessItShowsTheConnection(error, CONNECTION_URL)).toEqual({});
  });

  it("drops a cause that shows it in an own property, as Node's ERR_INVALID_URL does with `input`", () => {
    const error = Object.assign(new TypeError("Invalid URL"), {
      input: CONNECTION_URL,
    });

    expect(causeUnlessItShowsTheConnection(error, CONNECTION_URL)).toEqual({});
  });

  it("drops a cause that shows it on an error nested in a property or on its own cause chain", () => {
    const nested = { detail: { deeper: [`at ${USER}`] } };
    const chained = new Error("outer", { cause: new Error(`inner ${HOST}`) });

    expect(
      causeUnlessItShowsTheConnection(
        Object.assign(new Error("x"), nested),
        CONNECTION_URL,
      ),
    ).toEqual({});
    expect(causeUnlessItShowsTheConnection(chained, CONNECTION_URL)).toEqual(
      {},
    );
  });

  it("drops a cause that is not an Error but shows the connection", () => {
    expect(
      causeUnlessItShowsTheConnection(`refused ${HOST}`, CONNECTION_URL),
    ).toEqual({});
  });

  it("keeps a content-free cause that is not an Error, as a failed WebSocket connect rejects with", () => {
    const event = { type: "error" };

    expect(causeUnlessItShowsTheConnection(event, CONNECTION_URL).cause).toBe(
      event,
    );
  });

  it("survives a cyclic cause without looping", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    expect(causeUnlessItShowsTheConnection(cyclic, CONNECTION_URL).cause).toBe(
      cyclic,
    );
  });

  it("drops a cause whose own-property read throws only after the connection was shown elsewhere", () => {
    const hostile = Object.defineProperty(new Error(`near ${HOST}`), "boom", {
      get() {
        throw new Error("getter refuses");
      },
      enumerable: true,
    });

    expect(causeUnlessItShowsTheConnection(hostile, CONNECTION_URL)).toEqual(
      {},
    );
  });
});

describe("causeUnlessItShowsTheConnection, for a cause that shows only part of the string", () => {
  const LOWER_CASE_ESCAPES_URL = `postgres://${USER}:p%2fss%40w0rd@${HOST}/lemn-fake-db`;

  it("drops a DNS error that carries only the host", () => {
    const error = Object.assign(new Error(`getaddrinfo ENOTFOUND ${HOST}`), {
      code: "ENOTFOUND",
    });

    expect(causeUnlessItShowsTheConnection(error, CONNECTION_URL)).toEqual({});
  });

  it("drops a cause that carries only the host, in another case", () => {
    const error = new Error(`getaddrinfo ENOTFOUND ${HOST.toUpperCase()}`);

    expect(causeUnlessItShowsTheConnection(error, CONNECTION_URL)).toEqual({});
  });

  it("drops a cause that shows the password decoded when the URL wrote it percent-encoded", () => {
    const error = new Error("rejected p/ss@w0rd");

    expect(
      causeUnlessItShowsTheConnection(error, LOWER_CASE_ESCAPES_URL),
    ).toEqual({});
  });

  it("drops a cause that shows the password re-encoded in the other case of escape", () => {
    const error = new Error(`rejected ${encodeURIComponent("p/ss@w0rd")}`);

    expect(
      causeUnlessItShowsTheConnection(error, LOWER_CASE_ESCAPES_URL),
    ).toEqual({});
  });

  it("drops a cause that shows the password as written when the URL wrote it percent-encoded", () => {
    const error = new Error("rejected p%2fss%40w0rd");

    expect(
      causeUnlessItShowsTheConnection(error, LOWER_CASE_ESCAPES_URL),
    ).toEqual({});
  });

  it("keeps a cause that shows only the port, the scheme or the database name", () => {
    const error = new Error('database "lemn-fake-db" does not exist on 5432');

    expect(causeUnlessItShowsTheConnection(error, CONNECTION_URL).cause).toBe(
      error,
    );
  });
});

describe("isPrintableFailure", () => {
  it.each([
    ["a migration error", new MigrationSequenceError("a hole")],
    ["a migration execution error", new MigrationExecutionError("failed")],
    [
      "the opener's refusal",
      new InvalidConnectionUrlError("MIGRATION_DATABASE_URL"),
    ],
  ])(
    "allows %s, whose message carries no credential by construction",
    (_n, error) => {
      expect(isPrintableFailure(error)).toBe(true);
    },
  );

  it.each([
    ["a plain Error", new Error(CONNECTION_URL)],
    ["a TypeError", new TypeError("Invalid URL")],
    ["a string", CONNECTION_URL],
  ])("refuses %s", (_name, error) => {
    expect(isPrintableFailure(error)).toBe(false);
  });
});
