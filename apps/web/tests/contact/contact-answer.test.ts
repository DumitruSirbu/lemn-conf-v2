import { fc } from "@fast-check/vitest";
import type { SubmissionIssue } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  classifyContactAnswer,
  contactWaitSecondsFrom,
  failureScreenOf,
  FAILED_OUTCOME,
  LONGEST_CONTACT_WAIT_SECONDS,
  UNANSWERED_OUTCOME,
  UNREADABLE_CONTACT_WAIT_SECONDS,
  type ContactAnswer,
  type ContactOutcome,
} from "@/contact/contact-answer";
import {
  CONTACT_REFUSAL_CODES,
  noticeNotSentAnswer,
  noticeNotSentRetryAnswer,
  refusalAnswer,
  rejectedAnswer,
  sentAnswer,
  type ContactRefusalCode,
} from "@/lib/server/contact/contact-responses";
import {
  CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  longestWaitSecondsOf,
} from "@/lib/server/rate-limit/limit-policy";
import {
  contactLimitReachedResponse,
  contactUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";

const A_REFERENCE = "LM-7K3QWXY2";

async function answerOf(response: Response): Promise<ContactAnswer> {
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    body: await response.json(),
  };
}

async function classify(response: Response): Promise<ContactOutcome> {
  return classifyContactAnswer(await answerOf(response));
}

function answerWith(
  status: number,
  body: unknown,
  retryAfter: string | null = null,
): ContactAnswer {
  return { status, body, retryAfter };
}

describe("the answers the route really makes, each in its class", () => {
  const OUTCOME_OF_REFUSAL: Readonly<
    Record<ContactRefusalCode, ContactOutcome["kind"]>
  > = {
    CONTACT_CROSS_SITE: "failed",
    CONTACT_NOT_JSON: "failed",
    CONTACT_BODY_TOO_LARGE: "failed",
    CONTACT_INVALID: "refused",
    CONTACT_REQUEST_CONFLICT: "conflict",
    CONTACT_DESIGN_NOT_CURRENT: "design-not-current",
    CONTACT_DESIGN_DOES_NOT_FIT: "does-not-fit",
  };

  function refusalOf(code: ContactRefusalCode): Response {
    if (code === "CONTACT_INVALID") {
      return refusalAnswer({
        code,
        issues: [{ field: "contact.name", code: "REQUIRED" }],
      });
    }
    if (code === "CONTACT_DESIGN_DOES_NOT_FIT") {
      return refusalAnswer({ code, placementIds: ["body-1"] });
    }
    return refusalAnswer({ code });
  }

  it.each(CONTACT_REFUSAL_CODES)("answers %s in its class", async (code) => {
    const outcome = await classify(refusalOf(code));

    expect(outcome.kind).toBe(OUTCOME_OF_REFUSAL[code]);
  });

  it("classifies a stored and notified request as sent, with its reference", async () => {
    expect(await classify(sentAnswer(A_REFERENCE))).toEqual({
      kind: "sent",
      reference: A_REFERENCE,
    });
  });

  it.each([
    ["the honeypot's or the time's refusal", rejectedAnswer],
    ["a stored request whose notice may be retried", noticeNotSentRetryAnswer],
    [
      "a stored request whose notice would not be helped by a retry",
      noticeNotSentAnswer,
    ],
    ["a limit that could not be judged", contactUnavailableResponse],
  ])("classifies %s as failed", async (_name, makeAnswer) => {
    expect(await classify(makeAnswer())).toEqual(FAILED_OUTCOME);
  });

  it("classifies a limit as limited, with the wait the answer states", async () => {
    const response = contactLimitReachedResponse(
      3600,
      CONTACT_NEW_BY_BLOCK_DAY_POLICY.window,
    );

    expect(await classify(response)).toEqual({
      kind: "limited",
      waitSeconds: 3600,
    });
  });

  it("holds the longest wait the server's longest contact window can state", () => {
    expect(LONGEST_CONTACT_WAIT_SECONDS).toBe(
      longestWaitSecondsOf(CONTACT_NEW_BY_BLOCK_DAY_POLICY.window),
    );
  });

  it("places each issue of an invalid request beside its field, by the code the domain made", async () => {
    const issues: readonly SubmissionIssue[] = [
      { field: "contact.name", code: "REQUIRED" },
      { field: "contact.phone", code: "PHONE_MOLDOVAN_INCOMPLETE" },
      { field: "contact.email", code: "MALFORMED" },
      { field: "contact.consent", code: "CONSENT_NOT_GIVEN" },
      { field: "contact.locality", code: "TOO_LONG" },
    ];

    const outcome = await classify(
      refusalAnswer({ code: "CONTACT_INVALID", issues }),
    );

    expect(outcome).toEqual({
      kind: "refused",
      issues: [
        { field: "name", code: "REQUIRED" },
        { field: "phone", code: "PHONE_MOLDOVAN_INCOMPLETE" },
        { field: "email", code: "MALFORMED" },
        { field: "consent", code: "CONSENT_NOT_GIVEN" },
        { field: "locality", code: "TOO_LONG" },
      ],
    });
  });

  it("keeps the issues the form can place and drops the ones no field of it can show", async () => {
    const issues: readonly SubmissionIssue[] = [
      { field: "elapsedMs", code: "MALFORMED" },
      { field: "contact.channel", code: "UNKNOWN_CHANNEL" },
      { field: "contact", code: "UNKNOWN_FIELD" },
      { field: "contact.phone", code: "PHONE_FORMAT_UNRECOGNISED" },
    ];

    const outcome = await classify(
      refusalAnswer({ code: "CONTACT_INVALID", issues }),
    );

    expect(outcome).toEqual({
      kind: "refused",
      issues: [{ field: "phone", code: "PHONE_FORMAT_UNRECOGNISED" }],
    });
  });

  it("classifies an invalid request with no issue the form can place as failed", async () => {
    const issues: readonly SubmissionIssue[] = [
      { field: "locale", code: "UNKNOWN_LOCALE" },
      { field: "request", code: "NOT_AN_OBJECT" },
    ];

    const outcome = await classify(
      refusalAnswer({ code: "CONTACT_INVALID", issues }),
    );

    expect(outcome).toEqual(FAILED_OUTCOME);
  });
});

describe("an answer that is none of the route's", () => {
  it.each([
    ["no body", answerWith(200, undefined)],
    ["a sent word and no reference", answerWith(200, { status: "sent" })],
    [
      "a reference that is not text",
      answerWith(200, { status: "sent", reference: 7 }),
    ],
    [
      "another word",
      answerWith(200, { status: "queued", reference: A_REFERENCE }),
    ],
    ["an array", answerWith(200, [])],
    ["null", answerWith(200, null)],
  ])("is failed for a 200 with %s", (_name, answer) => {
    expect(classifyContactAnswer(answer)).toEqual(FAILED_OUTCOME);
  });

  it.each([
    [400, "CONTACT_REQUEST_CONFLICT"],
    [409, "CONTACT_INVALID"],
    [409, "CONTACT_DESIGN_DOES_NOT_FIT"],
    [422, "CONTACT_DESIGN_NOT_CURRENT"],
    [200, "CONTACT_LIMIT_REACHED"],
    [503, "CONTACT_LIMIT_REACHED"],
    [429, "CONTACT_UNAVAILABLE"],
  ])(
    "is failed for a %i that carries the code %s, since the status and the code must agree",
    (status, code) => {
      expect(classifyContactAnswer(answerWith(status, { code }, "60"))).toEqual(
        FAILED_OUTCOME,
      );
    },
  );

  it("is failed for a 400 that is not the invalid-request code, though it lists issues beside fields", () => {
    const issuesBesideFields = [{ field: "contact.name", code: "REQUIRED" }];

    expect(
      classifyContactAnswer(
        answerWith(400, {
          code: "CONTACT_REJECTED",
          issues: issuesBesideFields,
        }),
      ),
    ).toEqual(FAILED_OUTCOME);
  });

  it.each([404, 408, 500, 502, 503, 504])(
    "is failed for a %i with no body at all",
    (status) => {
      expect(classifyContactAnswer(answerWith(status, undefined))).toEqual(
        FAILED_OUTCOME,
      );
    },
  );

  it("is failed for a 429 from anything but the contact limit, which a firewall may send", () => {
    expect(
      classifyContactAnswer(answerWith(429, "Too Many Requests", "30")),
    ).toEqual(FAILED_OUTCOME);
  });

  it("reads only the body's own properties, whatever the prototype supplies", () => {
    const inheritingBody = Object.create({
      code: "CONTACT_REQUEST_CONFLICT",
    }) as unknown;

    expect(classifyContactAnswer(answerWith(409, inheritingBody))).toEqual(
      FAILED_OUTCOME,
    );
  });

  it("holds a class and never the sentence, the code or the body of the answer", async () => {
    const outcome = await classify(
      refusalAnswer({
        code: "CONTACT_INVALID",
        issues: [{ field: "contact.name", code: "REQUIRED" }],
      }),
    );

    const text = JSON.stringify(outcome);
    expect(text).not.toContain("The request is not valid");
    expect(text).not.toContain("CONTACT_INVALID");
  });

  it("is always one of the seven classes an answer can have, never unanswered, for any status and any JSON body", () => {
    const kinds = [
      "sent",
      "failed",
      "refused",
      "conflict",
      "design-not-current",
      "does-not-fit",
      "limited",
    ];

    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }),
        fc.option(fc.string(), { nil: null }),
        fc.jsonValue(),
        (status, retryAfter, body) => {
          const outcome = classifyContactAnswer({ status, retryAfter, body });

          expect(kinds).toContain(outcome.kind);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("which failures are told on a failure screen", () => {
  const SCREEN_OF_CLASS: readonly (readonly [
    ContactOutcome,
    string | undefined,
  ])[] = [
    [UNANSWERED_OUTCOME, "lost-connection"],
    [FAILED_OUTCOME, "not-sent"],
    [{ kind: "sent", reference: "LM-7K3QWXY2" }, undefined],
    [
      { kind: "refused", issues: [{ field: "phone", code: "REQUIRED" }] },
      undefined,
    ],
    [{ kind: "conflict" }, undefined],
    [{ kind: "design-not-current" }, undefined],
    [{ kind: "does-not-fit" }, undefined],
    [{ kind: "limited", waitSeconds: 60 }, undefined],
  ];

  it.each(SCREEN_OF_CLASS)("tells %j on %s", (outcome, screen) => {
    expect(failureScreenOf(outcome)).toBe(screen);
  });

  it("covers every class the classifier makes, and a failure is on a screen only for failed and unanswered", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }),
        fc.option(fc.string(), { nil: null }),
        fc.jsonValue(),
        (status, retryAfter, body) => {
          const outcome = classifyContactAnswer({ status, retryAfter, body });

          expect(failureScreenOf(outcome) === undefined).toBe(
            outcome.kind !== "failed",
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("the wait read from Retry-After", () => {
  it.each([
    ["0", 1],
    ["1", 1],
    ["60", 60],
    ["86400", 86_400],
    ["86401", UNREADABLE_CONTACT_WAIT_SECONDS],
    ["99999999999999999999999", UNREADABLE_CONTACT_WAIT_SECONDS],
    ["", UNREADABLE_CONTACT_WAIT_SECONDS],
    ["abc", UNREADABLE_CONTACT_WAIT_SECONDS],
    ["-5", UNREADABLE_CONTACT_WAIT_SECONDS],
    ["1.5", UNREADABLE_CONTACT_WAIT_SECONDS],
    [" 30", UNREADABLE_CONTACT_WAIT_SECONDS],
    ["Wed, 21 Oct 2026 07:28:00 GMT", UNREADABLE_CONTACT_WAIT_SECONDS],
    [null, UNREADABLE_CONTACT_WAIT_SECONDS],
  ])("reads %j as %i seconds", (retryAfter, seconds) => {
    expect(contactWaitSecondsFrom(retryAfter)).toBe(seconds);
  });

  it("is never less than a second and never more than the longest window, for any header text", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (retryAfter) => {
        const seconds = contactWaitSecondsFrom(retryAfter);

        expect(Number.isInteger(seconds)).toBe(true);
        expect(seconds).toBeGreaterThanOrEqual(1);
        expect(seconds).toBeLessThanOrEqual(LONGEST_CONTACT_WAIT_SECONDS);
      }),
      { numRuns: 500 },
    );
  });

  it("is the number itself for every whole number of seconds inside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: LONGEST_CONTACT_WAIT_SECONDS }),
        (seconds) => {
          expect(contactWaitSecondsFrom(String(seconds))).toBe(seconds);
        },
      ),
      { numRuns: 300 },
    );
  });
});
