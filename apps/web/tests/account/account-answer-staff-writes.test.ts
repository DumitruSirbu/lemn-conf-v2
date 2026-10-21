// The staff writes of the answer classifier (Lot 3 wave L3-U4): a note (`201`), a request status (`200`) and an unhide (`204`),
// each read together with the body's `status` word. Every flow is walked over every status the routes give, and every issue
// code a write's `400` carries has a sentence of its own in both catalogues.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  classifySignedInAnswer,
  type AccountAnswer,
  type SignedInFlow,
  type SignedInOutcome,
} from "@/account/account-answer";
import {
  resolveAccountFieldError,
  type AccountFieldIssue,
} from "@/i18n/content";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const STAFF_WRITES = ["staff-note", "staff-status", "staff-unhide"] as const;

const NOTE = {
  id: "note-1",
  text: "Am sunat.",
  createdAt: "2026-10-19T11:41:00.000Z",
  author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
} as const;
const STATUS_SAVED = {
  status: "contacted",
  changedBy: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
  changedAt: "2026-10-19T11:44:00.000Z",
} as const;

function answer(
  status: number,
  body: unknown,
  retryAfter: string | null = null,
): AccountAnswer {
  return { status, retryAfter, body };
}

const word = (status: string, rest: object = {}) => ({ status, ...rest });

function kindOf(flow: SignedInFlow, given: AccountAnswer): string {
  return classifySignedInAnswer(flow, given).kind;
}

describe("a staff note (201 with the note as stored)", () => {
  it("is `note-added` with the note, for a 201 only", () => {
    expect(
      classifySignedInAnswer("staff-note", answer(201, { note: NOTE })),
    ).toEqual({ kind: "note-added", note: NOTE });
    for (const status of [200, 202, 204]) {
      expect(kindOf("staff-note", answer(status, { note: NOTE }))).toBe(
        "request-failed",
      );
    }
  });

  it.each([
    ["no note", {}],
    ["a note that is not an object", { note: "text" }],
    ["a note with no id", { note: { ...NOTE, id: "" } }],
    ["a note with no text", { note: { ...NOTE, text: undefined } }],
    [
      "a note whose instant is not the server's form",
      { note: { ...NOTE, createdAt: "2026-10-19" } },
    ],
    ["a note with no author", { note: { ...NOTE, author: undefined } }],
  ])("is a failed request for %s", (_, body) => {
    expect(kindOf("staff-note", answer(201, body))).toBe("request-failed");
  });

  it("places a refused text at the text field, and no other field", () => {
    const issues = [{ field: "text", code: "FORBIDDEN_CHARACTER" }];
    expect(
      classifySignedInAnswer(
        "staff-note",
        answer(400, word("invalid-input", { issues })),
      ),
    ).toEqual({
      kind: "invalid-input",
      issues: [{ field: "text", code: "FORBIDDEN_CHARACTER" }],
    });
    expect(
      kindOf(
        "staff-note",
        answer(
          400,
          word("invalid-input", {
            issues: [{ field: "status", code: "REQUIRED" }],
          }),
        ),
      ),
    ).toBe("request-failed");
  });
});

describe("a staff status (200 with the status saved, and its 409 words)", () => {
  it.each(["new", "contacted", "offer-sent", "closed"])(
    "is `status-saved` for a saved %s: the status word of the body is the status, not a word of the answer's class",
    (value) => {
      const body = { ...STATUS_SAVED, status: value };
      expect(classifySignedInAnswer("staff-status", answer(200, body))).toEqual(
        {
          kind: "status-saved",
          saved: body,
        },
      );
    },
  );

  it("is `status-saved` for a kitchen that shows new with no last change", () => {
    const body = { status: "new", changedBy: null, changedAt: null };
    expect(classifySignedInAnswer("staff-status", answer(200, body))).toEqual({
      kind: "status-saved",
      saved: body,
    });
  });

  it.each([
    [
      "a status this build does not name",
      { ...STATUS_SAVED, status: "future" },
    ],
    ["no status", { changedBy: null, changedAt: null }],
    [
      "an instant that is not the server's form",
      { ...STATUS_SAVED, changedAt: "yesterday" },
    ],
    ["a person that is not one", { ...STATUS_SAVED, changedBy: "Mihai" }],
  ])("is a failed request for a 200 with %s", (_, body) => {
    expect(kindOf("staff-status", answer(200, body))).toBe("request-failed");
  });

  it.each([
    ["not-sent", "conflict-not-sent"],
    ["changed-meanwhile", "conflict-changed-meanwhile"],
    ["status-not-recognised", "conflict-status-not-recognised"],
  ])("tells the 409 word %s as %s", (conflict, kind) => {
    expect(kindOf("staff-status", answer(409, word(conflict)))).toBe(kind);
  });

  it.each(["not-hidden", "sent", "export-too-large", "anything", ""])(
    "tells a 409 with the word '%s' as a failed request: it is no word of this route",
    (conflict) => {
      expect(kindOf("staff-status", answer(409, word(conflict)))).toBe(
        "request-failed",
      );
    },
  );

  it("places a refused status at the status field only", () => {
    expect(
      classifySignedInAnswer(
        "staff-status",
        answer(
          400,
          word("invalid-input", {
            issues: [{ field: "status", code: "STATUS_NOT_IN_LIST" }],
          }),
        ),
      ),
    ).toEqual({
      kind: "invalid-input",
      issues: [{ field: "status", code: "STATUS_NOT_IN_LIST" }],
    });
    expect(
      kindOf(
        "staff-status",
        answer(
          400,
          word("invalid-input", {
            issues: [{ field: "text", code: "REQUIRED" }],
          }),
        ),
      ),
    ).toBe("request-failed");
  });
});

describe("a staff unhide (204, and its one 409 word)", () => {
  it("is `succeeded` for a 204 only", () => {
    expect(kindOf("staff-unhide", answer(204, undefined))).toBe("succeeded");
    for (const status of [200, 201, 202]) {
      expect(kindOf("staff-unhide", answer(status, {}))).toBe("request-failed");
    }
  });

  it("tells a 409 not-hidden as `conflict-not-hidden`, and no other 409 word as a conflict", () => {
    expect(kindOf("staff-unhide", answer(409, word("not-hidden")))).toBe(
      "conflict-not-hidden",
    );
    for (const conflict of ["not-sent", "changed-meanwhile", "sent"]) {
      expect(kindOf("staff-unhide", answer(409, word(conflict)))).toBe(
        "request-failed",
      );
    }
  });

  it("places no field: a 400 is a failed request", () => {
    expect(
      kindOf(
        "staff-unhide",
        answer(
          400,
          word("invalid-input", {
            issues: [{ field: "text", code: "REQUIRED" }],
          }),
        ),
      ),
    ).toBe("request-failed");
  });
});

describe.each(STAFF_WRITES)(
  "%s: what every staff write is told alike",
  (flow) => {
    const cases: readonly (readonly [
      string,
      AccountAnswer,
      SignedInOutcome["kind"],
    ])[] = [
      ["a 401", answer(401, word("unauthenticated")), "unauthenticated"],
      ["a 403", answer(403, word("forbidden")), "forbidden"],
      [
        "the one refusal of a kitchen",
        answer(404, { error: "Design not found" }),
        "kitchen-unavailable",
      ],
      [
        "a 404 that is the platform's page",
        answer(404, undefined),
        "request-failed",
      ],
      [
        "a 429 with a wait",
        answer(429, word("rate-limited"), "30"),
        "rate-limited",
      ],
      ["a 503", answer(503, word("unavailable")), "unavailable"],
      ["a 500 with no word", answer(500, undefined), "platform-failed"],
      ["a 502 that is not JSON", answer(502, "<html>"), "platform-failed"],
      [
        "a 400 invalid-request",
        answer(400, word("invalid-request")),
        "request-failed",
      ],
      ["a 413", answer(413, word("payload-too-large")), "request-failed"],
      ["a 415", answer(415, word("unsupported-media-type")), "request-failed"],
      ["a 405", answer(405, undefined), "request-failed"],
    ];

    it.each(cases)("tells %s", (_, given, kind) => {
      expect(kindOf(flow, given)).toBe(kind);
    });

    it("tells a 429 with a wait that cannot be believed as a limit with no number", () => {
      expect(
        classifySignedInAnswer(flow, answer(429, word("rate-limited"), "soon")),
      ).toEqual({ kind: "rate-limited", wait: { kind: "unreadable" } });
    });
  },
);

describe("the sentences of the codes a staff write's 400 carries", () => {
  const CODES: readonly AccountFieldIssue[] = [
    { field: "text", code: "REQUIRED" },
    { field: "text", code: "NOT_TEXT" },
    { field: "text", code: "TOO_LONG" },
    { field: "text", code: "FORBIDDEN_CHARACTER" },
    { field: "text", code: "NOTE_TEXT_NOT_JUDGED" },
    { field: "status", code: "REQUIRED" },
    { field: "status", code: "NOT_TEXT" },
    { field: "status", code: "STATUS_NOT_IN_LIST" },
  ];

  describe.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)("in %s", (locale, messages) => {
    const translate = createTranslator({
      locale,
      messages: messages as typeof roMessages,
    });
    const requestFailed = translate("accountForm.requestFailedBody");

    it.each(CODES)(
      "has a sentence of its own for $field $code, and not the failed request's",
      (issue) => {
        const sentence = resolveAccountFieldError(translate, issue);

        expect(sentence).not.toBe("");
        expect(sentence).not.toBe(requestFailed);
      },
    );

    it("names the tab and the carriage return in the forbidden character's sentence", () => {
      const sentence = resolveAccountFieldError(translate, {
        field: "text",
        code: "FORBIDDEN_CHARACTER",
      });
      const named =
        locale === "ro"
          ? ["tabulare", "retur de car"]
          : ["табуляция", "возврат каретки"];

      for (const part of named) expect(sentence).toContain(part);
    });

    it("states the limit of a note that is too long as the domain's", () => {
      const sentence = resolveAccountFieldError(translate, {
        field: "text",
        code: "TOO_LONG",
      });

      expect(sentence).toContain("2000");
    });

    it("tells a code it has no sentence for as the failed request", () => {
      const unknown = {
        field: "status",
        code: "A_CODE_FROM_A_FUTURE_BUILD",
      } as unknown as AccountFieldIssue;

      expect(resolveAccountFieldError(translate, unknown)).toBe(requestFailed);
    });
  });
});
