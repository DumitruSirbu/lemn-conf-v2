import type { SubmissionIssue } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  CONTACT_REFUSAL_CODES,
  refusalAnswer,
  noticeNotSentAnswer,
  noticeNotSentRetryAnswer,
  rejectedAnswer,
  sentAnswer,
  statusOfContactRefusal,
} from "@/lib/server/contact/contact-responses";
import { CONTACT_NEW_BY_BLOCK_DAY_POLICY } from "@/lib/server/rate-limit/limit-policy";
import {
  contactLimitReachedResponse,
  contactUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";

import { readSource } from "../server-source-support";

const crossSiteAnswer = () => refusalAnswer({ code: "CONTACT_CROSS_SITE" });
const notJsonAnswer = () => refusalAnswer({ code: "CONTACT_NOT_JSON" });
const bodyTooLargeAnswer = () =>
  refusalAnswer({ code: "CONTACT_BODY_TOO_LARGE" });
const requestConflictAnswer = () =>
  refusalAnswer({ code: "CONTACT_REQUEST_CONFLICT" });
const designNotCurrentAnswer = () =>
  refusalAnswer({ code: "CONTACT_DESIGN_NOT_CURRENT" });
const invalidAnswer = (issues: readonly SubmissionIssue[]) =>
  refusalAnswer({ code: "CONTACT_INVALID", issues });
const designDoesNotFitAnswer = (placementIds: readonly string[]) =>
  refusalAnswer({ code: "CONTACT_DESIGN_DOES_NOT_FIT", placementIds });

const A_REFERENCE = "LM-7K3QWXY2";
const MARKER = "SUBMITTED-VALUE-MARKER-5521";

/** The thirteen answers of the table, each made as the route will make it: its status and its code. */
const THIRTEEN: readonly [
  string,
  () => Response,
  number,
  string | undefined,
][] = [
  ["a cross-site request", crossSiteAnswer, 403, "CONTACT_CROSS_SITE"],
  ["a body that is not JSON", notJsonAnswer, 415, "CONTACT_NOT_JSON"],
  ["a body past its bound", bodyTooLargeAnswer, 413, "CONTACT_BODY_TOO_LARGE"],
  [
    "a limit, whichever bucket",
    () =>
      contactLimitReachedResponse(60, CONTACT_NEW_BY_BLOCK_DAY_POLICY.window),
    429,
    "CONTACT_LIMIT_REACHED",
  ],
  [
    "unavailable, whichever cause",
    contactUnavailableResponse,
    503,
    "CONTACT_UNAVAILABLE",
  ],
  [
    "a body that does not parse, or the schema's issues",
    () => invalidAnswer([]),
    400,
    "CONTACT_INVALID",
  ],
  ["the honeypot or the time", rejectedAnswer, 400, "CONTACT_REJECTED"],
  [
    "a request's id stored with another payload",
    requestConflictAnswer,
    409,
    "CONTACT_REQUEST_CONFLICT",
  ],
  [
    "every way the owned load fails",
    designNotCurrentAnswer,
    409,
    "CONTACT_DESIGN_NOT_CURRENT",
  ],
  [
    "a kitchen past its wall",
    () => designDoesNotFitAnswer(["p1"]),
    422,
    "CONTACT_DESIGN_DOES_NOT_FIT",
  ],
  [
    "a notice not accepted, a retry may follow",
    noticeNotSentRetryAnswer,
    502,
    "CONTACT_NOTICE_NOT_SENT_RETRY",
  ],
  [
    "a notice not accepted, no retry",
    noticeNotSentAnswer,
    502,
    "CONTACT_NOTICE_NOT_SENT",
  ],
  ["sent, now or before", () => sentAnswer(A_REFERENCE), 200, undefined],
];

describe("the thirteen answers of the contact route", () => {
  it.each(THIRTEEN)(
    "answers %s with its status and its code",
    async (_label, make, status, code) => {
      const response = make();
      const body = (await response.json()) as {
        code?: string;
        status?: string;
      };

      expect(response.status).toBe(status);
      expect(body.code).toBe(code);
      if (code === undefined) expect(body.status).toBe("sent");
    },
  );

  it("is thirteen answers under thirteen different statuses and codes that are not the limit's twice", () => {
    expect(THIRTEEN).toHaveLength(13);
    const codes = THIRTEEN.map(([, , , code]) => code).filter(Boolean);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each(THIRTEEN)(
    "never stores %s and sets, clears or refreshes no cookie",
    (_label, make) => {
      const response = make();

      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.has("Set-Cookie")).toBe(false);
      expect(response.headers.get("Content-Type")).toMatch(
        /^application\/json/,
      );
    },
  );

  it.each(THIRTEEN)(
    "holds no submitted value in %s: its body is a sentence and a code, or a status and a reference",
    async (_label, make) => {
      const body = (await make().json()) as Record<string, unknown>;

      expect(Object.keys(body).sort()).toSatisfy((keys: string[]) =>
        [
          ["code", "error"],
          ["code", "error", "issues"],
          ["code", "error", "placementIds"],
          ["reference", "status"],
        ].some((allowed) => JSON.stringify(allowed) === JSON.stringify(keys)),
      );
    },
  );
});

describe("what an answer adds to its sentence and its code", () => {
  it("lists each issue's field and code, rebuilt from those two, so nothing else reaches the body", async () => {
    const issue = {
      field: "contact.phone",
      code: "MALFORMED",
      value: MARKER,
      echo: MARKER,
    } as unknown as SubmissionIssue;

    const body = await invalidAnswer([issue, issue]).text();

    expect(JSON.parse(body)).toEqual({
      error: "The request is not valid.",
      code: "CONTACT_INVALID",
      issues: [
        { field: "contact.phone", code: "MALFORMED" },
        { field: "contact.phone", code: "MALFORMED" },
      ],
    });
    expect(body).not.toContain("MARKER");
  });

  it("lists no issue for a body that did not parse, under the same code", async () => {
    expect(await invalidAnswer([]).json()).toEqual({
      error: "The request is not valid.",
      code: "CONTACT_INVALID",
      issues: [],
    });
  });

  it("lists the owner's own bodies' ids for a kitchen past its wall, in the order given, and no more", async () => {
    expect(await designDoesNotFitAnswer(["p9", "p2", "p5"]).json()).toEqual({
      error: "This design does not fit its room.",
      code: "CONTACT_DESIGN_DOES_NOT_FIT",
      placementIds: ["p9", "p2", "p5"],
    });
  });

  it("holds the reference of a request that was sent, and of no failure", async () => {
    const failures = [
      requestConflictAnswer(),
      designNotCurrentAnswer(),
      noticeNotSentRetryAnswer(),
      noticeNotSentAnswer(),
      rejectedAnswer(),
    ];
    for (const failure of failures) {
      expect(await failure.text()).not.toContain("LM-");
    }
    expect(await sentAnswer(A_REFERENCE).json()).toEqual({
      status: "sent",
      reference: A_REFERENCE,
    });
  });

  it.each([
    "",
    "LM-",
    "LM-7",
    "lm-7k3qwxy2",
    `${A_REFERENCE}\n`,
    `${A_REFERENCE} `,
    `LM-${"A".repeat(30)}`,
    "ana@example.com",
    "not a reference at all",
  ])("refuses to say %j as a reference", (text) => {
    expect(() => sentAnswer(text)).toThrow(RangeError);
  });

  it.each([
    "LM-IIIIIIII",
    "LM-7K3QWXY",
    "LM-7K3QWXY22",
    "ABC-12",
    `LM-${"A".repeat(29)}`,
  ])(
    "says %j, which the table's shape admits though the generator would not make it",
    async (reference) => {
      expect(await sentAnswer(reference).json()).toEqual({
        status: "sent",
        reference,
      });
    },
  );

  it("answers the two outward failures with one sentence that differs only in its code", async () => {
    const retry = (await noticeNotSentRetryAnswer().json()) as {
      error: string;
    };
    const final = (await noticeNotSentAnswer().json()) as { error: string };

    expect(retry.error).toBe(final.error);
  });
});

describe("the logged refusals", () => {
  it("are the seven a caller can tell apart, and not the honeypot's or the time's", () => {
    expect([...CONTACT_REFUSAL_CODES]).toEqual([
      "CONTACT_CROSS_SITE",
      "CONTACT_NOT_JSON",
      "CONTACT_BODY_TOO_LARGE",
      "CONTACT_INVALID",
      "CONTACT_REQUEST_CONFLICT",
      "CONTACT_DESIGN_NOT_CURRENT",
      "CONTACT_DESIGN_DOES_NOT_FIT",
    ]);
  });

  it("have the status their answer has, from the one table", () => {
    expect(
      CONTACT_REFUSAL_CODES.map((code) => statusOfContactRefusal(code)),
    ).toEqual([403, 415, 413, 400, 409, 409, 422]);
  });
});

describe("contact-responses.ts", () => {
  const source = readSource("lib/server/contact/contact-responses.ts");

  it("reads source: makes every answer through the one maker, and names no cookie", () => {
    expect(source.match(/NextResponse\.json\(/g)).toHaveLength(1);
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/cookies?\b/i);
  });

  it("reads source: imports no mail, no store, no route and no limiter's judgement", () => {
    expect(source).not.toMatch(
      /lib\/server\/mail|ContactSubmissionStore|app\/api|judge-/,
    );
  });
});
