import { fc } from "@fast-check/vitest";
import { neonConfig } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../src/open-database.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";

/**
 * A string `openDatabase` accepts must also be one a query can be sent with. The socket is replaced; the request is still
 * built by the runtime's own `Request`, so its header validation runs, and its refusal quotes the value.
 */
const PASSWORD_HEAD = "FAKEPASSHEAD_8B";
const PASSWORD_TAIL = "FAKEPASSTAIL_8B";
const USER = "fakeuser_8B";
const HOST = "fakehost-8b.invalid";
const MARKERS = [PASSWORD_HEAD, PASSWORD_TAIL, USER, HOST];
const SOCKET_REPLACED = "the socket was replaced by the test";

const originalFetchFunction: unknown = neonConfig.fetchFunction;

beforeEach(() => {
  neonConfig.fetchFunction = (
    url: string,
    init: RequestInit,
  ): Promise<never> => {
    new Request(url, init);
    return Promise.reject(new TypeError(SOCKET_REPLACED));
  };
});

afterEach(() => {
  neonConfig.fetchFunction = originalFetchFunction as typeof fetch;
});

async function errorOfAQueryOver(connectionUrl: string): Promise<unknown> {
  try {
    await openDatabase(connectionUrl)`select 1`;
  } catch (error) {
    return error;
  }
  throw new Error("the query did not fail");
}

function withPasswordBetween(separator: string): string {
  return `postgresql://${USER}:${PASSWORD_HEAD}${separator}${PASSWORD_TAIL}@${HOST}/lemn-conf-v2?sslmode=require`;
}

describe("a query through a string the opener accepts", () => {
  it.each([
    ["a trailing line feed", `${withPasswordBetween("")}\n`],
    ["a Latin-1 letter", withPasswordBetween("é")],
    ["a tab", withPasswordBetween("\t")],
    ["a space", withPasswordBetween(" ")],
    ["a DEL", withPasswordBetween("\u007f")],
    ["a plain password", withPasswordBetween("")],
  ])(
    "builds its request and fails only at the replaced socket, for %s",
    async (_label, value) => {
      const error = await errorOfAQueryOver(value);

      expect((error as Error).message).toContain(SOCKET_REPLACED);
      expect(markersFoundOn(error, MARKERS)).toEqual([]);
    },
  );

  it.each([
    ["an interior line feed", "\n"],
    ["an interior carriage return", "\r"],
    ["an interior NUL", "\u0000"],
    ["a character above U+00FF", "Ā"],
  ])(
    "is never reached for %s: the opener refused before the runtime could quote it",
    (_label, separator) => {
      expect(() => openDatabase(withPasswordBetween(separator))).toThrow(
        /cannot be sent to the query endpoint/,
      );
    },
  );

  it("throws nothing of the value for any swept string it accepts", async () => {
    const separators = ["", "\n", "\r", "\u0000", "Ā", "é", "\t", " "];
    const swept = fc.record({
      separator: fc.constantFrom(...separators),
      trailing: fc.constantFrom("", "\n", "\r\n", " "),
      query: fc.constantFrom(
        "sslmode=require",
        "sslmode=require&channel_binding=require",
        "",
      ),
    });

    let queried = 0;
    for (const { separator, trailing, query } of fc.sample(swept, {
      seed: 20261009,
      numRuns: 200,
    })) {
      const addressWithoutQuery =
        withPasswordBetween(separator).split("?")[0] ?? "";
      const value = `${addressWithoutQuery}?${query}${trailing}`;
      let accepted = true;
      try {
        openDatabase(value);
      } catch {
        accepted = false;
      }
      if (!accepted) continue;

      const error = await errorOfAQueryOver(value);
      queried += 1;

      expect(markersFoundOn(error, MARKERS)).toEqual([]);
    }

    expect(queried).toBeGreaterThan(0);
  });
});
