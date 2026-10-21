// Adversarial QA of wave L3-U4, the answer classifier of the three staff writes. The developer's file walks each flow over the
// answers its route gives; this one sweeps every HTTP status from 100 to 599 against every word the routes and their
// neighbours say, against an oracle written out again from the S7 route contract (the plan, section 2.2), and feeds the
// bodies a hostile or broken server could send. The oracle knows nothing of the classifier's tables.
import { describe, expect, it } from "vitest";

import {
  classifySignedInAnswer,
  type AccountAnswer,
  type SignedInOutcome,
} from "@/account/account-answer";

type WriteFlow = "staff-note" | "staff-status" | "staff-unhide";

const FLOWS: readonly WriteFlow[] = [
  "staff-note",
  "staff-status",
  "staff-unhide",
];
const REQUEST_STATUSES = ["new", "contacted", "offer-sent", "closed"] as const;
const WORDS = [
  undefined,
  "",
  "unauthenticated",
  "forbidden",
  "rate-limited",
  "unavailable",
  "invalid-input",
  "invalid-request",
  "not-sent",
  "not-hidden",
  "changed-meanwhile",
  "status-not-recognised",
  "sent",
  "link-invalid",
  "payload-too-large",
  "constructor",
  "__proto__",
  "toString",
  ...REQUEST_STATUSES,
] as const;
const NOTE = {
  id: "note-1",
  text: "Am sunat.",
  createdAt: "2026-10-19T11:41:00.000Z",
  author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
};
const PERSON_NONE = { changedBy: null, changedAt: null };

/** What the routes say, from the contract: the one success of each flow, and the conflicts of the status and unhide routes. */
const SUCCESS_STATUS: Readonly<Record<WriteFlow, number>> = {
  "staff-note": 201,
  "staff-status": 200,
  "staff-unhide": 204,
};
const CONFLICTS: Readonly<Record<WriteFlow, Readonly<Record<string, string>>>> =
  {
    "staff-note": {},
    "staff-status": {
      "not-sent": "conflict-not-sent",
      "changed-meanwhile": "conflict-changed-meanwhile",
      "status-not-recognised": "conflict-status-not-recognised",
    },
    "staff-unhide": { "not-hidden": "conflict-not-hidden" },
  };
const OWN_FIELD: Readonly<Record<WriteFlow, string | undefined>> = {
  "staff-note": "text",
  "staff-status": "status",
  "staff-unhide": undefined,
};

interface Given {
  readonly status: number;
  readonly word: string | undefined;
  readonly flow: WriteFlow;
  readonly hasError: boolean;
  readonly issueField: string | undefined;
}

/** The body the route would send for a status and word: a valid success body where the flow's success status asks for one. */
function bodyOf({ status, word, flow, hasError, issueField }: Given): unknown {
  if (status === SUCCESS_STATUS[flow]) {
    if (flow === "staff-note") return { note: NOTE };
    if (flow === "staff-status") return { status: word, ...PERSON_NONE };
    return undefined;
  }
  return {
    ...(word === undefined ? {} : { status: word }),
    ...(hasError ? { error: "Design not found" } : {}),
    ...(issueField === undefined
      ? {}
      : { issues: [{ field: issueField, code: "REQUIRED" }] }),
  };
}

function expectedKind(given: Given): SignedInOutcome["kind"] {
  const { status, word, flow, hasError, issueField } = given;
  if (status === SUCCESS_STATUS[flow]) {
    if (flow === "staff-note") return "note-added";
    if (flow === "staff-status") {
      return REQUEST_STATUSES.some((value) => value === word)
        ? "status-saved"
        : "request-failed";
    }
    return "succeeded";
  }
  if (status === 401 && word === "unauthenticated") return "unauthenticated";
  if (status === 403 && word === "forbidden") return "forbidden";
  if (status === 429 && word === "rate-limited") return "rate-limited";
  if (status === 503 && word === "unavailable") return "unavailable";
  if (status === 404 && hasError) return "kitchen-unavailable";
  if (
    status === 409 &&
    word !== undefined &&
    Object.hasOwn(CONFLICTS[flow], word)
  ) {
    return CONFLICTS[flow][word] as SignedInOutcome["kind"];
  }
  if (
    status === 400 &&
    word === "invalid-input" &&
    issueField !== undefined &&
    issueField === OWN_FIELD[flow]
  ) {
    return "invalid-input";
  }
  return status >= 500 ? "platform-failed" : "request-failed";
}

function answerOf(given: Given): AccountAnswer {
  return {
    status: given.status,
    retryAfter: given.status === 429 ? "30" : null,
    body: bodyOf(given),
  };
}

describe("every status against every word, for each staff write", () => {
  const statuses = Array.from({ length: 500 }, (_, index) => index + 100);

  it.each(FLOWS)(
    "%s tells each pair as the route contract does, and never as a success the contract does not give",
    (flow) => {
      const mismatches: string[] = [];
      for (const status of statuses) {
        for (const word of WORDS) {
          for (const hasError of [false, true]) {
            for (const issueField of [undefined, "text", "status"]) {
              const given = { status, word, flow, hasError, issueField };
              const told = classifySignedInAnswer(flow, answerOf(given)).kind;
              if (told !== expectedKind(given)) {
                mismatches.push(
                  `${String(status)} ${String(word)} error=${String(hasError)} issues=${String(issueField)}: told ${told}, contract ${expectedKind(given)}`,
                );
              }
            }
          }
        }
      }
      expect(mismatches).toEqual([]);
    },
  );
});

describe("the bodies a hostile or broken server could send", () => {
  const parse = (text: string): unknown => JSON.parse(text);

  it("keeps a note to its four members and out of the prototype chain, whatever else the body carries", () => {
    const body = parse(
      `{"note":{"id":"n","text":"t","createdAt":"2026-10-19T11:41:00.000Z","author":{"email":null,"name":null,"__proto__":{"polluted":1}},"__proto__":{"polluted":1},"extra":"x"},"__proto__":{"polluted":2}}`,
    );

    const told = classifySignedInAnswer("staff-note", {
      status: 201,
      retryAfter: null,
      body,
    });

    expect(told).toEqual({
      kind: "note-added",
      note: {
        id: "n",
        text: "t",
        createdAt: "2026-10-19T11:41:00.000Z",
        author: { email: null, name: null },
      },
    });
    expect(Object.keys(told.kind === "note-added" ? told.note : {})).toEqual([
      "id",
      "text",
      "createdAt",
      "author",
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps a saved status to its three members, whatever else the body carries", () => {
    const told = classifySignedInAnswer("staff-status", {
      status: 200,
      retryAfter: null,
      body: parse(
        `{"status":"closed","changedBy":{"email":"a@b.md","name":null,"role":"administrator"},"changedAt":"2026-10-19T11:41:00.000Z","role":"administrator","__proto__":{"polluted":1}}`,
      ),
    });

    expect(told).toEqual({
      kind: "status-saved",
      saved: {
        status: "closed",
        changedBy: { email: "a@b.md", name: null },
        changedAt: "2026-10-19T11:41:00.000Z",
      },
    });
  });

  it.each([
    ["an inherited word", Object.create({ status: "unauthenticated" })],
    ["a word that is a number", { status: 401 }],
    ["a word that is a list", { status: ["unauthenticated"] }],
    ["a body that is a string", "unauthenticated"],
    ["a body that is a number", 401],
    ["a body that is null", null],
    ["a body that is a list", [{ status: "unauthenticated" }]],
  ])("does not tell a 401 with %s as the end of the session", (_, body) => {
    for (const flow of FLOWS) {
      expect(
        classifySignedInAnswer(flow, { status: 401, retryAfter: null, body })
          .kind,
      ).toBe("request-failed");
    }
  });

  it.each([
    [
      "an issue list that is an object",
      { "0": { field: "text", code: "REQUIRED" } },
    ],
    ["an issue list that is a string", "text"],
    ["an issue whose field is a list", [{ field: ["text"], code: "REQUIRED" }]],
    ["an issue whose code is a number", [{ field: "text", code: 7 }]],
    [
      "an issue named __proto__",
      parse(`[{"field":"__proto__","code":"REQUIRED"}]`),
    ],
    [
      "an issue named constructor",
      [{ field: "constructor", code: "REQUIRED" }],
    ],
    ["no issue at all", []],
  ])("tells a 400 with %s as a failed request, for each write", (_, issues) => {
    for (const flow of FLOWS) {
      expect(
        classifySignedInAnswer(flow, {
          status: 400,
          retryAfter: null,
          body: { status: "invalid-input", issues },
        }).kind,
      ).toBe("request-failed");
    }
  });

  it("keeps only the issues that name the write's own field, and none of what was refused", () => {
    const told = classifySignedInAnswer("staff-note", {
      status: 400,
      retryAfter: null,
      body: {
        status: "invalid-input",
        issues: [
          { field: "status", code: "REQUIRED" },
          { field: "text", code: "TOO_LONG", value: "secret client text" },
          { field: "email", code: "MALFORMED" },
        ],
      },
    });

    expect(told).toEqual({
      kind: "invalid-input",
      issues: [{ field: "text", code: "TOO_LONG" }],
    });
  });

  it.each([
    ["a 204 with a body", 204, { note: NOTE }],
    ["a 204 with text", 204, "ok"],
  ])(
    "takes %s of an unhide as done, and of a note or a status as nothing",
    (_, status, body) => {
      expect(
        classifySignedInAnswer("staff-unhide", {
          status,
          retryAfter: null,
          body,
        }).kind,
      ).toBe("succeeded");
      for (const flow of ["staff-note", "staff-status"] as const) {
        expect(
          classifySignedInAnswer(flow, { status, retryAfter: null, body }).kind,
        ).toBe("request-failed");
      }
    },
  );

  it("does not take the password flow's 401 word for the end of a staff session", () => {
    for (const flow of FLOWS) {
      expect(
        classifySignedInAnswer(flow, {
          status: 401,
          retryAfter: null,
          body: { status: "password-changed-sign-in" },
        }).kind,
      ).toBe("request-failed");
    }
  });
});
