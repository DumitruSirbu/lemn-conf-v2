import { inspect } from "node:util";

import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  MAIL_FAILURE_KINDS,
  type MailFailureKind,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";
import {
  MAIL_TIMED_OUT,
  outcomeOfSendFailure,
  outcomeOfSendResult,
} from "@/lib/server/mail/smtp-answer";

const MARKER = "SmtpAnswerMarker5d81c0";

const REFUSED_CODES = [
  "EAUTH",
  "ENOAUTH",
  "EENVELOPE",
  "ECONFIG",
  "EFILEACCESS",
  "EURLACCESS",
  "EREQUIRETLS",
];
const UNREACHABLE_CODES = ["ECONNECTION", "ESOCKET", "EDNS", "ETLS", "EPROXY"];
const OTHER_LIBRARY_CODES = [
  "EMESSAGE",
  "ESTREAM",
  "EOAUTH2",
  "EMAXLIMIT",
  "EMAXRECIPIENTS",
  "ESENDMAIL",
  "ESES",
  "EFETCH",
  "ERR_ACCESS_DENIED",
];
const ANY_CODE_WORD = [
  ...REFUSED_CODES,
  ...UNREACHABLE_CODES,
  ...OTHER_LIBRARY_CODES,
  "ETIMEDOUT",
  "EPROTOCOL",
];

/** Reply codes that decide nothing: not an integer from 200 to 599, whatever else they look like. */
const UNUSABLE_REPLY_CODES: readonly unknown[] = [
  undefined,
  null,
  0,
  99,
  100,
  199,
  600,
  999,
  1.5,
  250.5,
  Number.NaN,
  Infinity,
  "550",
  "421",
  {},
  [],
  true,
];
const NON_DECIDING_REPLY_CODES: readonly unknown[] = [
  ...UNUSABLE_REPLY_CODES,
  200,
  250,
  354,
  399,
];

const markerText = fc.constantFrom(
  MARKER,
  `550-5.4.5 ${MARKER}`,
  `550 5.4.5 ${MARKER}`,
  `421 4.7.0 ${MARKER}`,
  `535 5.7.8 ${MARKER}`,
  "",
);

const quotedMembers = fc.record({
  message: markerText,
  command: markerText,
  stack: markerText,
});
const codeWord = fc.oneof(
  fc.constantFrom(...ANY_CODE_WORD),
  fc.string(),
  fc.constantFrom<unknown>(undefined, null, 5, {}, ["EAUTH"]),
);
const anyReplyCode = fc.oneof(
  fc.constantFrom(
    ...UNUSABLE_REPLY_CODES,
    200,
    250,
    354,
    399,
    421,
    450,
    500,
    535,
    550,
    599,
  ),
  fc.integer({ min: -10, max: 1000 }),
  fc.double({ noDefaultInfinity: false }),
);

function thrownWith(members: Record<string, unknown>): Error {
  return Object.assign(new Error(MARKER), members);
}

function isUsableReplyCode(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 200 &&
    value <= 599
  );
}

function expectOneKindWithNothingKept(outcome: MailOutcome): void {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) return;
  expect(MAIL_FAILURE_KINDS).toContain(outcome.kind);
  expect(outcome.kind).not.toBe("payload-mismatch");
  expect(
    Object.keys(outcome).every((key) => ["ok", "kind", "status"].includes(key)),
  ).toBe(true);
  const readings = `${JSON.stringify(outcome)}\n${inspect(outcome, { depth: null, showHidden: true })}`;
  expect(readings).not.toContain(MARKER);
}

describe("outcomeOfSendFailure: the table", () => {
  const ROWS: readonly (readonly [
    string,
    Record<string, unknown>,
    MailFailureKind,
    number | undefined,
  ])[] = [
    [
      "an authentication code with no reply",
      { code: "EAUTH" },
      "refused",
      undefined,
    ],
    [
      "an authentication reply with a permanent code",
      { code: "EAUTH", responseCode: 535 },
      "refused",
      535,
    ],
    [
      "a temporary authentication reply, which decides before its code",
      { code: "EAUTH", responseCode: 454 },
      "busy",
      454,
    ],
    [
      "a 421 reply that ended the session",
      { code: "ECONNECTION", responseCode: 421 },
      "busy",
      421,
    ],
    ["a 450 reply", { responseCode: 450 }, "busy", 450],
    ["a 452 reply", { code: "EENVELOPE", responseCode: 452 }, "busy", 452],
    [
      "the sending limit, multi-line",
      {
        code: "EENVELOPE",
        responseCode: 550,
        response: "550-5.4.5 Daily limit",
      },
      "quota-spent",
      550,
    ],
    [
      "the sending limit, single line",
      { responseCode: 550, response: "550 5.4.5 Daily limit" },
      "quota-spent",
      550,
    ],
    [
      "a 550 that is not the sending limit",
      { responseCode: 550, response: "550 5.1.1 No such user" },
      "refused",
      550,
    ],
    [
      "a 550 whose reply is not text",
      { responseCode: 550, response: 5.45 },
      "refused",
      550,
    ],
    [
      "a 5.4.5 reply on another code",
      { responseCode: 551, response: "551 5.4.5 x" },
      "refused",
      551,
    ],
    [
      "a 5.4.5 that is not at the start of the reply",
      { responseCode: 550, response: "x 550 5.4.5" },
      "refused",
      550,
    ],
    ["a 599 reply", { responseCode: 599 }, "refused", 599],
    ["a timeout", { code: "ETIMEDOUT" }, "timed-out", undefined],
    ["a dropped connection", { code: "ECONNECTION" }, "unreachable", undefined],
    ["a protocol error", { code: "EPROTOCOL" }, "unreadable-answer", undefined],
    [
      "a protocol error carrying a permanent reply, which decides first",
      { code: "EPROTOCOL", responseCode: 554 },
      "refused",
      554,
    ],
    [
      "a success-class reply on a thrown error, falling to its code",
      { code: "EENVELOPE", responseCode: 354 },
      "refused",
      354,
    ],
    [
      "a success-class reply with an unknown code",
      { code: "EWHATEVER", responseCode: 250 },
      "unreachable",
      250,
    ],
    ["an unknown code", { code: "EWHATEVER" }, "unreachable", undefined],
    ["an error with no code", {}, "unreachable", undefined],
  ];

  it.each(ROWS)("answers %s", (_name, members, kind, status) => {
    const outcome = outcomeOfSendFailure(thrownWith(members));

    expect(outcome).toEqual(
      status === undefined ? { ok: false, kind } : { ok: false, kind, status },
    );
  });

  it("answers timed out for our own bound with no status", () => {
    expect(MAIL_TIMED_OUT).toEqual({ ok: false, kind: "timed-out" });
  });

  const THROWN_THAT_CANNOT_BE_READ: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["undefined", undefined],
    ["a number", 535],
    ["a string holding the marker", MARKER],
    ["a symbol", Symbol(MARKER)],
    ["a function", () => MARKER],
    [
      "an object whose code getter throws",
      Object.defineProperty({}, "code", {
        get: () => {
          throw new Error(MARKER);
        },
        enumerable: true,
      }),
    ],
    [
      "an object whose reply-code getter throws",
      Object.defineProperty({ code: "EAUTH" }, "responseCode", {
        get: () => {
          throw new Error(MARKER);
        },
      }),
    ],
    [
      "a proxy that throws on every read",
      new Proxy(
        {},
        {
          get: () => {
            throw new Error(MARKER);
          },
        },
      ),
    ],
  ];

  it.each(THROWN_THAT_CANNOT_BE_READ)(
    "answers one kind and never throws for %s",
    (_name, thrown) => {
      const outcome = outcomeOfSendFailure(thrown);

      expectOneKindWithNothingKept(outcome);
    },
  );

  it("answers by the reply code when only the code getter throws", () => {
    const thrown = Object.defineProperty({ responseCode: 450 }, "code", {
      get: () => {
        throw new Error(MARKER);
      },
    });

    expect(outcomeOfSendFailure(thrown)).toEqual({
      ok: false,
      kind: "busy",
      status: 450,
    });
  });
});

describe("outcomeOfSendFailure: every answer is one kind and nothing of the error survives", () => {
  const RUNS_PER_ARM = 60;

  it("holds for any code, any reply code and any quoted member, with a status exactly when the reply code is usable", () => {
    fc.assert(
      fc.property(
        codeWord,
        anyReplyCode,
        markerText,
        quotedMembers,
        (code, responseCode, response, quoted) => {
          const outcome = outcomeOfSendFailure(
            thrownWith({ code, responseCode, response, ...quoted }),
          );

          expectOneKindWithNothingKept(outcome);
          const status = outcome.ok ? undefined : outcome.status;
          expect(status).toBe(
            isUsableReplyCode(responseCode) ? responseCode : undefined,
          );
        },
      ),
      { numRuns: 400 },
    );
  });

  interface Arm {
    readonly row: string;
    readonly kind: MailFailureKind;
    readonly arbitrary: fc.Arbitrary<Record<string, unknown>>;
  }

  const reply = (replyCode: fc.Arbitrary<number>) => replyCode;
  const ARMS: readonly Arm[] = [
    {
      row: "a refusing code with no deciding reply",
      kind: "refused",
      arbitrary: fc.record({
        code: fc.constantFrom(...REFUSED_CODES),
        responseCode: fc.constantFrom(...NON_DECIDING_REPLY_CODES),
        response: markerText,
      }),
    },
    {
      row: "a 4xx reply, whatever the code",
      kind: "busy",
      arbitrary: fc.record({
        code: codeWord,
        responseCode: reply(fc.integer({ min: 400, max: 499 })),
        response: markerText,
      }),
    },
    {
      row: "a 550 whose reply opens with 5.4.5",
      kind: "quota-spent",
      arbitrary: fc.record({
        code: codeWord,
        responseCode: fc.constant(550),
        response: fc
          .tuple(fc.constantFrom("550 5.4.5", "550-5.4.5"), markerText)
          .map(([opening, rest]) => `${opening} ${rest}`),
      }),
    },
    {
      row: "any other 5xx reply",
      kind: "refused",
      arbitrary: fc.record({
        code: codeWord,
        responseCode: reply(fc.integer({ min: 500, max: 599 })),
        response: fc.constantFrom(
          MARKER,
          "550 5.7.1 x",
          "551 5.4.5 x",
          "x 550 5.4.5",
          "",
        ),
      }),
    },
    {
      row: "a timeout code with no deciding reply",
      kind: "timed-out",
      arbitrary: fc.record({
        code: fc.constant("ETIMEDOUT"),
        responseCode: fc.constantFrom(...NON_DECIDING_REPLY_CODES),
        response: markerText,
      }),
    },
    {
      row: "a connection, socket, DNS, TLS or proxy code, or any other throw, with no deciding reply",
      kind: "unreachable",
      arbitrary: fc.record({
        code: fc.oneof(
          fc.constantFrom(...UNREACHABLE_CODES, ...OTHER_LIBRARY_CODES),
          fc.string({ minLength: 1 }).map((text) => `X${text}`),
          fc.constantFrom<unknown>(undefined, null, 7, {}),
        ),
        responseCode: fc.constantFrom(...NON_DECIDING_REPLY_CODES),
        response: markerText,
      }),
    },
    {
      row: "a protocol error with no deciding reply",
      kind: "unreadable-answer",
      arbitrary: fc.record({
        code: fc.constant("EPROTOCOL"),
        responseCode: fc.constantFrom(...NON_DECIDING_REPLY_CODES),
        response: markerText,
      }),
    },
  ];

  it.each(ARMS)("answers $kind for $row", ({ kind, arbitrary }) => {
    fc.assert(
      fc.property(arbitrary, quotedMembers, (members, quoted) => {
        const outcome = outcomeOfSendFailure(
          thrownWith({ ...members, ...quoted }),
        );

        expectOneKindWithNothingKept(outcome);
        expect(outcome).toMatchObject({ ok: false, kind });
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it("never answers payload mismatch, which an SMTP exchange has no way to say", () => {
    fc.assert(
      fc.property(
        codeWord,
        anyReplyCode,
        markerText,
        (code, responseCode, response) => {
          const outcome = outcomeOfSendFailure(
            thrownWith({ code, responseCode, response }),
          );

          expect(outcome).not.toMatchObject({ kind: "payload-mismatch" });
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("outcomeOfSendResult", () => {
  const ACCEPTED = "someone@example.org";

  it.each([
    [
      "one accepted entry and an empty rejected list",
      { accepted: [ACCEPTED], rejected: [] },
    ],
    ["one accepted entry and no rejected list", { accepted: [ACCEPTED] }],
    [
      "one accepted entry spelled as the library parsed it, not as configured",
      { accepted: ['"SomeOne"@Example.ORG'], rejected: [] },
    ],
  ])("is acceptance for %s", (_name, result) => {
    expect(outcomeOfSendResult(result)).toEqual({ ok: true });
  });

  const NOT_ACCEPTANCE: readonly (readonly [string, unknown])[] = [
    ["two accepted entries", { accepted: [ACCEPTED, ACCEPTED], rejected: [] }],
    ["no accepted entry", { accepted: [], rejected: [] }],
    [
      "one accepted and one rejected",
      { accepted: [ACCEPTED], rejected: ["other@example.org"] },
    ],
    [
      "a rejected list that is not an array",
      { accepted: [ACCEPTED], rejected: null },
    ],
    ["a rejected list that is text", { accepted: [ACCEPTED], rejected: "" }],
    ["an accepted list that is text", { accepted: ACCEPTED, rejected: [] }],
    [
      "an accepted list that is an object with a length",
      { accepted: { length: 1 }, rejected: [] },
    ],
    ["no accepted member", { rejected: [] }],
    [
      "an accepted getter that throws",
      Object.defineProperty({ rejected: [] }, "accepted", {
        get: () => {
          throw new Error(MARKER);
        },
      }),
    ],
    [
      "a rejected getter that throws",
      Object.defineProperty({ accepted: [ACCEPTED] }, "rejected", {
        get: () => {
          throw new Error(MARKER);
        },
      }),
    ],
    [
      "an accepted list whose length getter throws",
      {
        accepted: new Proxy([ACCEPTED], {
          get: () => {
            throw new Error(MARKER);
          },
        }),
        rejected: [],
      },
    ],
    ["null", null],
    ["undefined", undefined],
    ["text", MARKER],
    ["an empty object", {}],
  ];

  it.each(NOT_ACCEPTANCE)(
    "is an unreadable answer with no status for %s",
    (_name, result) => {
      expect(outcomeOfSendResult(result)).toEqual({
        ok: false,
        kind: "unreadable-answer",
      });
    },
  );

  it("keeps a reply code as the status only when it is an integer from 200 to 599", () => {
    fc.assert(
      fc.property(anyReplyCode, (responseCode) => {
        const outcome = outcomeOfSendResult({
          accepted: [],
          rejected: [],
          responseCode,
          response: MARKER,
        });

        expectOneKindWithNothingKept(outcome);
        expect(outcome).toMatchObject({ kind: "unreadable-answer" });
        const status = outcome.ok ? undefined : outcome.status;
        expect(status).toBe(
          isUsableReplyCode(responseCode) ? responseCode : undefined,
        );
      }),
      { numRuns: 200 },
    );
  });
});
