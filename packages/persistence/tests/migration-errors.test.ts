import { describe, expect, it } from "vitest";

import {
  MigrationExecutionError,
  MigrationSequenceError,
  isPrintableFailure,
  reducedCauseOf,
} from "../src/migration-errors.js";
import { InvalidConnectionUrlError } from "../src/open-database.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";

const SECRET = "FAKEPASSWORD_8B";

function causeOf(error: unknown): unknown {
  return reducedCauseOf(error).cause;
}

describe("reducedCauseOf", () => {
  it("keeps the type name and a SQLSTATE code of a driver error, so the underlying SQLSTATE stays reachable", () => {
    const error = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });

    expect(causeOf(error)).toEqual({ name: "Error", code: "23505" });
  });

  it("keeps a Node error code", () => {
    const error = Object.assign(new Error(`getaddrinfo ENOTFOUND ${SECRET}`), {
      code: "ENOTFOUND",
    });

    expect(causeOf(error)).toEqual({ name: "Error", code: "ENOTFOUND" });
  });

  it("keeps the name of a subclass", () => {
    expect(causeOf(new TypeError("x"))).toEqual({ name: "TypeError" });
  });

  it("is a new plain value: not the error, with no message, stack or other property of it", () => {
    const error = Object.assign(
      new Error(`near ${SECRET}`, { cause: SECRET }),
      {
        code: "23505",
        input: SECRET,
        detail: { deeper: [SECRET] },
        [Symbol("hidden")]: SECRET,
      },
    );

    const cause = causeOf(error);

    expect(cause).not.toBe(error);
    expect(Object.getPrototypeOf(cause)).toBe(Object.prototype);
    expect(Object.keys(cause as object).sort()).toEqual(["code", "name"]);
    expect(Object.getOwnPropertySymbols(cause)).toEqual([]);
    expect(markersFoundOn(reducedCauseOf(error), [SECRET])).toEqual([]);
  });

  it.each([
    ["a name carrying text", "Error: connect to fakehost-8b.invalid"],
    ["a name starting with a digit", "1Error"],
    ["a name of 65 letters", "E".repeat(65)],
    ["an empty name", ""],
    ["a name with a space", "Bad Name"],
  ])("clamps %s to UnknownError", (_label, name) => {
    const error = Object.assign(new Error("x"), { name });

    expect(causeOf(error)).toEqual({ name: "UnknownError" });
  });

  it.each([
    ["a code carrying text", `password ${SECRET}`],
    ["a lower-case code", "enotfound"],
    ["a six-character SQLSTATE look-alike", "2350555"],
    ["an empty code", ""],
    ["a code of 65 characters", "E".repeat(65)],
    ["a code that is not a string", 23505],
  ])("drops %s", (_label, code) => {
    const error = Object.assign(new Error("x"), { code });

    expect(causeOf(error)).toEqual({ name: "Error" });
  });

  it("reads a throwing getter for name and for code as unknown and absent, never throws", () => {
    const hostile = new Error("x");
    Object.defineProperty(hostile, "name", {
      get() {
        throw new Error(`getter refuses ${SECRET}`);
      },
    });
    Object.defineProperty(hostile, "code", {
      get() {
        throw new Error(`getter refuses ${SECRET}`);
      },
    });

    expect(causeOf(hostile)).toEqual({ name: "UnknownError" });
  });

  it("does not call a prototype getter's secret into the cause", () => {
    const event = Object.create({
      get message() {
        return SECRET;
      },
      get target() {
        return { url: `wss://${SECRET}/v2` };
      },
    }) as object;

    expect(markersFoundOn(reducedCauseOf(event), [SECRET])).toEqual([]);
  });

  it.each([
    ["an object that is not an Error", { type: "error" }, "object"],
    ["a string", SECRET, "string"],
    ["undefined", undefined, "undefined"],
    ["null", null, "object"],
  ])("describes %s by its typeof alone", (_label, thrown, typeName) => {
    expect(causeOf(thrown)).toEqual({ name: typeName });
  });

  it("survives a cyclic error without looping", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    expect(causeOf(cyclic)).toEqual({ name: "object" });
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
    ["a plain Error", new Error(SECRET)],
    ["a TypeError", new TypeError("Invalid URL")],
    ["a string", SECRET],
  ])("refuses %s", (_name, error) => {
    expect(isPrintableFailure(error)).toBe(false);
  });
});
