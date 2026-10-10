import { describe, expect, it } from "vitest";

import {
  CONTACT_UNAVAILABLE_CODE,
  contactLimitReachedResponse,
  contactUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";
import {
  CONTACT_EVERY_BY_BLOCK_POLICY,
  CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  CONTACT_TRIES_BY_REQUEST_POLICY,
  longestWaitSecondsOf,
  type WindowRule,
} from "@/lib/server/rate-limit/limit-policy";

const HOUR: WindowRule = CONTACT_EVERY_BY_BLOCK_POLICY.window;
const UTC_DAY: WindowRule = CONTACT_NEW_BY_BLOCK_DAY_POLICY.window;

function headerNames(response: Response): string[] {
  return [...response.headers.keys()].sort();
}

describe("contactLimitReachedResponse: the one 429 of every contact bucket", () => {
  it("answers 429 with the whole seconds as Retry-After, a fixed body and one code", async () => {
    const response = contactLimitReachedResponse(1800, HOUR);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1800");
    expect(await response.json()).toEqual({
      error: "The limit on contact requests is reached for now.",
      code: "CONTACT_LIMIT_REACHED",
    });
  });

  it("carries these headers and no other: the content type, no-store and the wait", () => {
    expect(headerNames(contactLimitReachedResponse(60, HOUR))).toEqual([
      "cache-control",
      "content-type",
      "retry-after",
    ]);
    expect(
      contactLimitReachedResponse(60, HOUR).headers.get("Cache-Control"),
    ).toBe("no-store");
  });

  it("is the same body for every window, since the body says nothing of which bucket refused", async () => {
    const hour = await contactLimitReachedResponse(60, HOUR).text();
    const day = await contactLimitReachedResponse(60, UTC_DAY).text();

    expect(day).toBe(hour);
  });

  it("checks the wait against the window it is handed: an hour's own, and a UTC day's", () => {
    expect(longestWaitSecondsOf(HOUR)).toBe(3600);
    expect(longestWaitSecondsOf(UTC_DAY)).toBe(86_400);
    expect(
      contactLimitReachedResponse(3600, HOUR).headers.get("Retry-After"),
    ).toBe("3600");
    expect(
      contactLimitReachedResponse(86_400, UTC_DAY).headers.get("Retry-After"),
    ).toBe("86400");
    expect(() => contactLimitReachedResponse(3601, HOUR)).toThrow(RangeError);
    expect(() => contactLimitReachedResponse(86_401, UTC_DAY)).toThrow(
      RangeError,
    );
  });

  it("takes the window of the tries' and of every request's policy as an hour", () => {
    expect(CONTACT_TRIES_BY_REQUEST_POLICY.window).toEqual(HOUR);
    expect(() =>
      contactLimitReachedResponse(3601, CONTACT_TRIES_BY_REQUEST_POLICY.window),
    ).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a wait of %s, which is no whole number of seconds",
    (seconds) => {
      expect(() => contactLimitReachedResponse(seconds, UTC_DAY)).toThrow(
        RangeError,
      );
    },
  );

  it("never sets a cookie", () => {
    expect(
      contactLimitReachedResponse(60, HOUR).headers.has("Set-Cookie"),
    ).toBe(false);
  });
});

describe("contactUnavailableResponse: the one 503, whatever the cause", () => {
  it("answers 503 with a fixed body and its code, and no Retry-After", async () => {
    const response = contactUnavailableResponse();

    expect(response.status).toBe(503);
    expect(response.headers.has("Retry-After")).toBe(false);
    expect(await response.json()).toEqual({
      error: "A contact request cannot be taken right now.",
      code: "CONTACT_UNAVAILABLE",
    });
    expect(CONTACT_UNAVAILABLE_CODE).toBe("CONTACT_UNAVAILABLE");
  });

  it("carries these headers and no other: the content type and no-store, and sets no cookie", () => {
    const response = contactUnavailableResponse();

    expect(headerNames(response)).toEqual(["cache-control", "content-type"]);
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });
});
