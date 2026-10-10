import { describe, expect, it } from "vitest";

import {
  isRejectedAsAutomatic,
  parseContactRequest,
} from "@/lib/server/contact/parse-contact-request";
import { CONTACT_LEAST_FORM_TIME_MS } from "@/lib/server/rate-limit/limit-policy";

import { bodyOf, requestOf } from "./submit-contact-harness";

const SERVED = ["ro", "ru"];

describe("the body's text as a request", () => {
  it("is a request when the schema accepts it", () => {
    const parsed = parseContactRequest(bodyOf(), SERVED);

    expect(parsed.kind).toBe("request");
  });

  it.each([
    ["an empty text", ""],
    ["a text that is no JSON", "{{{ not json"],
    ["JSON that is not an object", "[]"],
    ["JSON null", "null"],
  ])(
    "refuses %s with the one issue that says it is not an object",
    (_label, text) => {
      expect(parseContactRequest(text, SERVED)).toEqual({
        kind: "refused",
        refusal: {
          code: "CONTACT_INVALID",
          issues: [{ field: "request", code: "NOT_AN_OBJECT" }],
        },
      });
    },
  );

  it("refuses an object the schema refuses with each issue's field and code", () => {
    const parsed = parseContactRequest(
      JSON.stringify(requestOf({ locale: "xx" })),
      SERVED,
    );

    expect(parsed).toMatchObject({
      kind: "refused",
      refusal: {
        code: "CONTACT_INVALID",
        issues: [{ field: "locale", code: "UNKNOWN_LOCALE" }],
      },
    });
  });
});

describe("the honeypot and the time", () => {
  function requestWith(overrides: Record<string, unknown>) {
    const parsed = parseContactRequest(
      JSON.stringify(requestOf(overrides)),
      SERVED,
    );
    if (parsed.kind !== "request") throw new Error("expected a request");
    return parsed.request;
  }

  it("lets a form that was open exactly the least time through, and stops one millisecond short of it", () => {
    expect(
      isRejectedAsAutomatic(
        requestWith({ elapsedMs: CONTACT_LEAST_FORM_TIME_MS }),
      ),
    ).toBe(false);
    expect(
      isRejectedAsAutomatic(
        requestWith({ elapsedMs: CONTACT_LEAST_FORM_TIME_MS - 1 }),
      ),
    ).toBe(true);
  });

  it("stops a filled honeypot however long the form was open", () => {
    expect(
      isRejectedAsAutomatic(requestWith({ honeypot: "x", elapsedMs: 600_000 })),
    ).toBe(true);
  });
});
