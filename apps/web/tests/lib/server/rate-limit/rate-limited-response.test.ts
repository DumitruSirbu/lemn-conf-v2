import { describe, expect, it } from "vitest";

import {
  MINT_LIMIT_REACHED_CODE,
  MINT_UNAVAILABLE_CODE,
  mintLimitReachedResponse,
  mintUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";

import {
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";

function headerNames(response: Response): string[] {
  return [...response.headers.keys()].sort();
}

describe("mintLimitReachedResponse", () => {
  it("answers 429 with the whole seconds as Retry-After, a fixed body and its code", async () => {
    const response = mintLimitReachedResponse(4321);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("4321");
    expect(await response.json()).toEqual({
      error: "The limit on new designs is reached for today.",
      code: "MINT_LIMIT_REACHED",
    });
    expect(MINT_LIMIT_REACHED_CODE).toBe("MINT_LIMIT_REACHED");
  });

  it("carries these headers and no other: the content type, no-store and the wait", () => {
    expect(headerNames(mintLimitReachedResponse(60))).toEqual([
      "cache-control",
      "content-type",
      "retry-after",
    ]);
  });

  it.each([1, 82_800, 86_400, 90_000])(
    "accepts a wait of %i seconds",
    (seconds) => {
      expect(mintLimitReachedResponse(seconds).headers.get("Retry-After")).toBe(
        String(seconds),
      );
    },
  );

  it.each([0, -1, 90_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a wait of %s, which is no whole number of seconds in a day",
    (seconds) => {
      expect(() => mintLimitReachedResponse(seconds)).toThrow(RangeError);
    },
  );

  it("never sets a cookie", () => {
    expect(mintLimitReachedResponse(60).headers.has("Set-Cookie")).toBe(false);
  });
});

describe("mintUnavailableResponse", () => {
  it("answers 503 with a fixed body and its code, and no Retry-After", async () => {
    const response = mintUnavailableResponse();

    expect(response.status).toBe(503);
    expect(response.headers.has("Retry-After")).toBe(false);
    expect(await response.json()).toEqual({
      error: "A new design cannot be made right now.",
      code: "MINT_UNAVAILABLE",
    });
    expect(MINT_UNAVAILABLE_CODE).toBe("MINT_UNAVAILABLE");
  });

  it("carries these headers and no other: the content type and no-store", () => {
    expect(headerNames(mintUnavailableResponse())).toEqual([
      "cache-control",
      "content-type",
    ]);
  });

  it("never sets a cookie", () => {
    expect(mintUnavailableResponse().headers.has("Set-Cookie")).toBe(false);
  });
});

describe("rate-limited-response.ts", () => {
  it("reads source: names neither the process environment nor the build mode, and no count, block or key", () => {
    const source = readSource("lib/server/rate-limit/rate-limited-response.ts");

    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\b(?:count|block|subject|digest)\b/i);
  });
});
