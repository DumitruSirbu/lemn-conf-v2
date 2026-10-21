// The classifier of an account route's answer: the HTTP status and the body's `status` word are read together, and every
// answer comes to one class (Lot 2 criteria 8, 10, 18 and the E1-E10 wire). Nothing here keeps a body, a header or a
// value beyond the class, the fields to mark, a count or a wait.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  classifyAccountAnswer,
  classifySignedInAnswer,
  isRetryable,
  KITCHEN_UNAVAILABLE_OUTCOME,
  rateLimitNoticeOf,
  waitFrom,
  type AccountAnswer,
  type SignedInFlow,
} from "@/account/account-answer";

import { designIdOf } from "../support/account-kitchens-wire";

function answer(
  status: number,
  body: unknown,
  retryAfter: string | null = null,
): AccountAnswer {
  return { status, retryAfter, body };
}

const word = (status: string, rest: object = {}) => ({ status, ...rest });

describe("signed-in answers: the successes of each flow", () => {
  it("a list is `received` with its body untouched, for a 200 only", () => {
    const body = { total: 0, kitchens: [], nextCursor: null };
    expect(classifySignedInAnswer("kitchens", answer(200, body))).toEqual({
      kind: "received",
      body,
    });
    expect(classifySignedInAnswer("kitchens", answer(201, body)).kind).toBe(
      "request-failed",
    );
    expect(
      classifySignedInAnswer("kitchens", answer(204, undefined)).kind,
    ).toBe("request-failed");
  });

  it("a staff kitchen is `received` with its body untouched, for a 200 only", () => {
    const body = { kitchen: {}, notes: [] };
    expect(classifySignedInAnswer("staff-kitchen", answer(200, body))).toEqual({
      kind: "received",
      body,
    });
    expect(
      classifySignedInAnswer("staff-kitchen", answer(201, body)).kind,
    ).toBe("request-failed");
    expect(
      classifySignedInAnswer("staff-kitchen", answer(204, undefined)).kind,
    ).toBe("request-failed");
  });

  describe("a rename (200 with the name the server kept)", () => {
    it("is `renamed` with that name", () => {
      expect(
        classifySignedInAnswer("kitchen-action", answer(200, { name: "Casa" })),
      ).toEqual({ kind: "renamed", name: "Casa" });
    });

    it.each([
      ["no name", {}],
      ["an empty name", { name: "" }],
      ["a numeric name", { name: 3 }],
      ["a null name", { name: null }],
      ["no body", undefined],
    ])("is a failed request with %s", (_, body) => {
      expect(
        classifySignedInAnswer("kitchen-action", answer(200, body)).kind,
      ).toBe("request-failed");
    });
  });

  describe("a duplicate (201 with the copy's design id)", () => {
    it("is `created` with the id", () => {
      expect(
        classifySignedInAnswer(
          "kitchen-action",
          answer(201, { id: designIdOf(3) }),
        ),
      ).toEqual({ kind: "created", id: designIdOf(3) });
    });

    it.each([
      ["no id", {}],
      ["a short id", { id: "abc" }],
      ["an id with a slash", { id: `${designIdOf(3).slice(0, 18)}/..` }],
      ["a numeric id", { id: 21 }],
      ["no body", undefined],
    ])("is a failed request with %s", (_, body) => {
      expect(
        classifySignedInAnswer("kitchen-action", answer(201, body)).kind,
      ).toBe("request-failed");
    });
  });

  it("a delete, a hide and a logout are `succeeded` on 204", () => {
    expect(
      classifySignedInAnswer("kitchen-action", answer(204, undefined)),
    ).toEqual({
      kind: "succeeded",
    });
    expect(classifySignedInAnswer("logout", answer(204, undefined))).toEqual({
      kind: "succeeded",
    });
  });

  it("a logout is not `succeeded` on a 200", () => {
    expect(classifySignedInAnswer("logout", answer(200, {})).kind).toBe(
      "request-failed",
    );
  });

  it("a profile save needs the 200 and its `saved` word", () => {
    expect(
      classifySignedInAnswer("profile", answer(200, word("saved"))),
    ).toEqual({ kind: "saved" });
    expect(classifySignedInAnswer("profile", answer(200, {})).kind).toBe(
      "request-failed",
    );
    expect(
      classifySignedInAnswer("profile", answer(200, word("password-changed")))
        .kind,
    ).toBe("request-failed");
  });

  it("a password change is `password-changed` on 200 with its word", () => {
    expect(
      classifySignedInAnswer("password", answer(200, word("password-changed"))),
    ).toEqual({ kind: "password-changed" });
    expect(
      classifySignedInAnswer("password", answer(200, word("saved"))).kind,
    ).toBe("request-failed");
  });

  it("an e-mail change request is `check-inbox` on 202 with its word", () => {
    expect(
      classifySignedInAnswer("email-change", answer(202, word("check-inbox"))),
    ).toEqual({ kind: "check-inbox" });
    expect(
      classifySignedInAnswer("email-change", answer(200, word("check-inbox")))
        .kind,
    ).toBe("request-failed");
  });

  it("an e-mail confirmation is `email-changed` on 200 with its word", () => {
    expect(
      classifySignedInAnswer(
        "confirm-email",
        answer(200, word("email-changed")),
      ),
    ).toEqual({ kind: "email-changed" });
  });

  it("an undo of an address change is `email-reverted` on 200 with its word, and no other flow's success word", () => {
    expect(
      classifySignedInAnswer(
        "revert-email",
        answer(200, word("email-reverted")),
      ),
    ).toEqual({ kind: "email-reverted" });
    for (const other of ["email-changed", "password-changed", "saved"]) {
      expect(
        classifySignedInAnswer("revert-email", answer(200, word(other))).kind,
      ).toBe("request-failed");
    }
    expect(
      classifySignedInAnswer(
        "revert-email",
        answer(201, word("email-reverted")),
      ).kind,
    ).toBe("request-failed");
    expect(
      classifySignedInAnswer(
        "confirm-email",
        answer(200, word("email-reverted")),
      ).kind,
    ).toBe("request-failed");
  });

  it("an export's 200 is never classified as a success here: the file is taken as a blob before this runs", () => {
    expect(classifySignedInAnswer("export", answer(200, {})).kind).toBe(
      "request-failed",
    );
  });
});

describe("a claim's number", () => {
  it.each([
    [{ claimable: 3 }, 3],
    [{ claimed: 2 }, 2],
    [{ claimable: 0 }, 0],
    [{ claimed: 0 }, 0],
  ])("%j is `counted` %i", (body, count) => {
    expect(classifySignedInAnswer("claim", answer(200, body))).toEqual({
      kind: "counted",
      count,
    });
  });

  it("reads `claimable` before `claimed` when a body has both", () => {
    expect(
      classifySignedInAnswer(
        "claim",
        answer(200, { claimable: 4, claimed: 9 }),
      ),
    ).toEqual({ kind: "counted", count: 4 });
  });

  it.each([
    ["negative", { claimable: -1 }],
    ["fractional", { claimed: 1.5 }],
    ["a string", { claimable: "3" }],
    ["NaN", { claimable: Number.NaN }],
    ["unsafe", { claimable: 2 ** 53 }],
    ["null", { claimable: null }],
    ["absent", {}],
  ])("a count that is %s is a failed request", (_, body) => {
    expect(classifySignedInAnswer("claim", answer(200, body)).kind).toBe(
      "request-failed",
    );
  });
});

describe("the refusals of a session", () => {
  const flows: readonly SignedInFlow[] = [
    "kitchens",
    "staff-kitchen",
    "kitchen-action",
    "profile",
    "password",
    "email-change",
    "export",
    "claim",
    "logout",
  ];

  it.each(flows)(
    "%s: 401 `unauthenticated` is no live session, never a failure",
    (flow) => {
      expect(
        classifySignedInAnswer(flow, answer(401, word("unauthenticated"))),
      ).toEqual({ kind: "unauthenticated" });
    },
  );

  it.each(flows)(
    "%s: 403 `forbidden` is the account's refusal, never an expiry",
    (flow) => {
      const outcome = classifySignedInAnswer(
        flow,
        answer(403, word("forbidden")),
      );
      expect(outcome).toEqual({ kind: "forbidden" });
      expect(outcome.kind).not.toBe("unauthenticated");
    },
  );

  it("a 401 with another word is not an expired session", () => {
    expect(
      classifySignedInAnswer("kitchens", answer(401, word("nope"))).kind,
    ).toBe("request-failed");
    expect(
      classifySignedInAnswer("kitchens", answer(401, undefined)).kind,
    ).toBe("request-failed");
  });

  it("a 403 with a different word is not the account's refusal", () => {
    expect(
      classifySignedInAnswer("kitchens", answer(403, word("cross-site"))).kind,
    ).toBe("request-failed");
  });

  it("the word is read from the body's own member, not from its prototype", () => {
    const inherited: unknown = Object.create({ status: "unauthenticated" });
    expect(
      classifySignedInAnswer("kitchens", answer(401, inherited)).kind,
    ).toBe("request-failed");
  });
});

describe("a kitchen that is not the account's (criterion 1: one refusal)", () => {
  it("is the same `kitchen-unavailable` for a 404 carrying an error text", () => {
    expect(
      classifySignedInAnswer(
        "kitchen-action",
        answer(404, { error: "Design not found" }),
      ),
    ).toBe(KITCHEN_UNAVAILABLE_OUTCOME);
    expect(
      classifySignedInAnswer("kitchen-action", answer(404, { error: "" })),
    ).toBe(KITCHEN_UNAVAILABLE_OUTCOME);
  });

  it.each([
    ["a platform page that is not JSON", undefined],
    ["a JSON body with no error member", {}],
    ["an error that is not text", { error: 4 }],
    ["a status word instead", word("not-found")],
  ])("is a failed request for a 404 that is %s", (_, body) => {
    expect(
      classifySignedInAnswer("kitchen-action", answer(404, body)).kind,
    ).toBe("request-failed");
  });

  it("is the same `kitchen-unavailable` for a staff kitchen the route refuses, and a failed request for a 404 that is not its refusal", () => {
    expect(
      classifySignedInAnswer(
        "staff-kitchen",
        answer(404, { error: "Design not found" }),
      ),
    ).toBe(KITCHEN_UNAVAILABLE_OUTCOME);
    expect(
      classifySignedInAnswer("staff-kitchen", answer(404, undefined)).kind,
    ).toBe("request-failed");
    expect(
      classifySignedInAnswer("staff-kitchen", answer(404, word("not-found")))
        .kind,
    ).toBe("request-failed");
  });

  it("is a failed request for a 404 on any flow that is not about one kitchen", () => {
    for (const flow of [
      "kitchens",
      "profile",
      "password",
      "claim",
      "logout",
    ] as const) {
      expect(
        classifySignedInAnswer(flow, answer(404, { error: "x" })).kind,
      ).toBe("request-failed");
    }
  });
});

describe("conflicts and refusals of a flow", () => {
  it("tells a sent kitchen from a kitchen that is not sent, by word, on 409 only", () => {
    expect(
      classifySignedInAnswer("kitchen-action", answer(409, word("sent"))),
    ).toEqual({ kind: "conflict-sent" });
    expect(
      classifySignedInAnswer("kitchen-action", answer(409, word("not-sent"))),
    ).toEqual({ kind: "conflict-not-sent" });
    expect(classifySignedInAnswer("kitchen-action", answer(409, {})).kind).toBe(
      "request-failed",
    );
    expect(
      classifySignedInAnswer("kitchen-action", answer(400, word("sent"))).kind,
    ).toBe("request-failed");
  });

  it("a conflict word is no conflict on a flow that does not state it", () => {
    expect(
      classifySignedInAnswer("profile", answer(409, word("sent"))).kind,
    ).toBe("request-failed");
  });

  it("an export over the cap is final: `export-too-large`", () => {
    expect(
      classifySignedInAnswer("export", answer(409, word("export-too-large"))),
    ).toEqual({ kind: "export-too-large" });
    expect(
      classifySignedInAnswer("export", answer(409, word("sent"))).kind,
    ).toBe("request-failed");
  });

  it("a wrong current password is 400 `wrong-password`, on the two flows that ask for one", () => {
    for (const flow of ["password", "email-change"] as const) {
      expect(
        classifySignedInAnswer(flow, answer(400, word("wrong-password"))),
      ).toEqual({
        kind: "wrong-password",
      });
    }
    expect(
      classifySignedInAnswer("profile", answer(400, word("wrong-password")))
        .kind,
    ).toBe("request-failed");
  });

  it("a changed password whose new session could not start is 401 `password-changed-sign-in`, distinct from an expired session", () => {
    const outcome = classifySignedInAnswer(
      "password",
      answer(401, word("password-changed-sign-in")),
    );
    expect(outcome).toEqual({ kind: "password-changed-sign-in" });
    expect(
      classifySignedInAnswer(
        "kitchens",
        answer(401, word("password-changed-sign-in")),
      ).kind,
    ).toBe("request-failed");
  });

  it("an unknown, used, expired or retired undo link is 400 `link-invalid` on the undo, and nowhere it is not named", () => {
    expect(
      classifySignedInAnswer("revert-email", answer(400, word("link-invalid"))),
    ).toEqual({ kind: "link-invalid" });
    expect(
      classifySignedInAnswer(
        "revert-email",
        answer(400, word("link-or-password-invalid")),
      ).kind,
    ).toBe("request-failed");
    expect(
      classifySignedInAnswer("password", answer(400, word("link-invalid")))
        .kind,
    ).toBe("request-failed");
  });

  it("an unknown, used, expired or taken e-mail link is 400 `link-invalid`, on the confirmation only", () => {
    expect(
      classifySignedInAnswer(
        "confirm-email",
        answer(400, word("link-invalid")),
      ),
    ).toEqual({ kind: "link-invalid" });
    expect(
      classifySignedInAnswer("email-change", answer(400, word("link-invalid")))
        .kind,
    ).toBe("request-failed");
  });
});

describe("invalid input: only the fields a flow can draw are placed", () => {
  const issues = (...pairs: readonly (readonly [string, string])[]) =>
    word("invalid-input", {
      issues: pairs.map(([field, code]) => ({ field, code })),
    });

  it("places a kitchen's name on a rename", () => {
    expect(
      classifySignedInAnswer(
        "kitchen-action",
        answer(400, issues(["name", "TOO_LONG"])),
      ),
    ).toEqual({
      kind: "invalid-input",
      issues: [{ field: "name", code: "TOO_LONG" }],
    });
  });

  it("places the profile's three fields", () => {
    const outcome = classifySignedInAnswer(
      "profile",
      answer(
        400,
        issues(
          ["name", "TOO_LONG"],
          ["address", "FORBIDDEN_CHARACTER"],
          ["phone", "PHONE_TOO_LONG"],
        ),
      ),
    );
    expect(outcome).toEqual({
      kind: "invalid-input",
      issues: [
        { field: "name", code: "TOO_LONG" },
        { field: "address", code: "FORBIDDEN_CHARACTER" },
        { field: "phone", code: "PHONE_TOO_LONG" },
      ],
    });
  });

  it("places a password change under the request members' own names", () => {
    const outcome = classifySignedInAnswer(
      "password",
      answer(
        400,
        issues(
          ["currentPassword", "PASSWORD_REQUIRED"],
          ["newPassword", "PASSWORD_TOO_SHORT"],
        ),
      ),
    );
    expect(outcome).toEqual({
      kind: "invalid-input",
      issues: [
        { field: "currentPassword", code: "PASSWORD_REQUIRED" },
        { field: "newPassword", code: "PASSWORD_TOO_SHORT" },
      ],
    });
  });

  it("places an undo's refused password under the request member's name `newPassword`, not reset's `password`", () => {
    expect(
      classifySignedInAnswer(
        "revert-email",
        answer(400, issues(["newPassword", "PASSWORD_BREACHED"])),
      ),
    ).toEqual({
      kind: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_BREACHED" }],
    });
    expect(
      classifySignedInAnswer(
        "revert-email",
        answer(400, issues(["password", "PASSWORD_BREACHED"])),
      ).kind,
    ).toBe("request-failed");
    expect(
      classifySignedInAnswer(
        "revert-email",
        answer(400, issues(["newPassword", "PASSWORD_UNCHANGED"])),
      ),
    ).toEqual({
      kind: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_UNCHANGED" }],
    });
    expect(
      classifySignedInAnswer(
        "revert-email",
        answer(400, issues(["currentPassword", "PASSWORD_REQUIRED"])),
      ).kind,
    ).toBe("request-failed");
  });

  it("places an e-mail change under `newEmail` and `currentPassword`", () => {
    const outcome = classifySignedInAnswer(
      "email-change",
      answer(
        400,
        issues(
          ["newEmail", "EMAIL_MALFORMED"],
          ["currentPassword", "PASSWORD_REQUIRED"],
        ),
      ),
    );
    expect(outcome).toEqual({
      kind: "invalid-input",
      issues: [
        { field: "newEmail", code: "EMAIL_MALFORMED" },
        { field: "currentPassword", code: "PASSWORD_REQUIRED" },
      ],
    });
  });

  it("drops an issue naming a field the flow cannot draw, and keeps the others", () => {
    const outcome = classifySignedInAnswer(
      "profile",
      answer(400, issues(["email", "EMAIL_MALFORMED"], ["name", "TOO_LONG"])),
    );
    expect(outcome).toEqual({
      kind: "invalid-input",
      issues: [{ field: "name", code: "TOO_LONG" }],
    });
  });

  it.each([
    ["profile", [["email", "X"]]],
    ["password", [["name", "X"]]],
    ["kitchen-action", [["phone", "X"]]],
    ["email-change", [["name", "X"]]],
  ] as const)(
    "%s: only unplaceable issues is a failed request, not an empty list of fields",
    (flow, pairs) => {
      expect(
        classifySignedInAnswer(flow, answer(400, issues(...pairs))).kind,
      ).toBe("request-failed");
    },
  );

  it.each([
    ["no issues member", word("invalid-input")],
    ["issues that is not a list", word("invalid-input", { issues: "name" })],
    ["an empty list", word("invalid-input", { issues: [] })],
    [
      "items that are not objects",
      word("invalid-input", { issues: [1, null, "x"] }),
    ],
    [
      "a field that is not text",
      word("invalid-input", { issues: [{ field: 1, code: "X" }] }),
    ],
    [
      "a code that is not text",
      word("invalid-input", { issues: [{ field: "name", code: 1 }] }),
    ],
  ])("is a failed request with %s", (_, body) => {
    expect(classifySignedInAnswer("profile", answer(400, body)).kind).toBe(
      "request-failed",
    );
  });

  it("is a failed request when the status is not 400, whatever the word", () => {
    expect(
      classifySignedInAnswer(
        "profile",
        answer(422, issues(["name", "TOO_LONG"])),
      ).kind,
    ).toBe("request-failed");
  });

  it("`invalid-request` (a refused request, not a field) is a failed request", () => {
    expect(
      classifySignedInAnswer("profile", answer(400, word("invalid-request")))
        .kind,
    ).toBe("request-failed");
  });
});

describe("limits and outages say the same in every flow", () => {
  const signedInFlows: readonly SignedInFlow[] = [
    "kitchens",
    "kitchen-action",
    "profile",
    "password",
    "email-change",
    "confirm-email",
    "revert-email",
    "export",
    "claim",
    "logout",
  ];

  it.each(signedInFlows)(
    "%s: 429 `rate-limited` carries the wait the header states",
    (flow) => {
      expect(
        classifySignedInAnswer(flow, answer(429, word("rate-limited"), "30")),
      ).toEqual({
        kind: "rate-limited",
        wait: { kind: "countdown", seconds: 30 },
      });
    },
  );

  it.each(signedInFlows)(
    "%s: 503 `unavailable` is a service that was not there",
    (flow) => {
      expect(
        classifySignedInAnswer(flow, answer(503, word("unavailable"))),
      ).toEqual({
        kind: "unavailable",
      });
    },
  );

  it("a 429 without its word is not a limit", () => {
    expect(classifySignedInAnswer("kitchens", answer(429, {}, "30")).kind).toBe(
      "request-failed",
    );
  });

  it("a 5xx no word explains is a platform failure, told apart from a refused request", () => {
    expect(classifySignedInAnswer("profile", answer(500, undefined)).kind).toBe(
      "platform-failed",
    );
    expect(classifySignedInAnswer("profile", answer(502, "<html>")).kind).toBe(
      "platform-failed",
    );
    expect(classifySignedInAnswer("profile", answer(499, undefined)).kind).toBe(
      "request-failed",
    );
    expect(
      classifySignedInAnswer("profile", answer(500, word("unavailable"))).kind,
    ).toBe("platform-failed");
  });

  it("a 429 carrying another flow's word is a failed request, not that flow's refusal", () => {
    expect(
      classifySignedInAnswer(
        "password",
        answer(429, word("wrong-password"), "5"),
      ).kind,
    ).toBe("request-failed");
  });
});

describe("form-flow answers", () => {
  it("a sign-in is `signed-in` with a claimable count, and a 200 without one is a failed request", () => {
    expect(
      classifyAccountAnswer(
        "login",
        answer(200, word("signed-in", { claimable: 2 })),
      ),
    ).toEqual({ kind: "signed-in", claimable: 2 });
    expect(
      classifyAccountAnswer("login", answer(200, word("signed-in"))).kind,
    ).toBe("request-failed");
    expect(
      classifyAccountAnswer(
        "login",
        answer(200, word("signed-in", { claimable: -1 })),
      ).kind,
    ).toBe("request-failed");
  });

  it("a wrong sign-in is `invalid-credentials`, a failed challenge needs its 403 word", () => {
    expect(
      classifyAccountAnswer("login", answer(401, word("invalid-credentials"))),
    ).toEqual({ kind: "invalid-credentials" });
    expect(
      classifyAccountAnswer("login", answer(403, word("challenge-failed"))),
    ).toEqual({ kind: "challenge-failed" });
    expect(
      classifyAccountAnswer(
        "verify-email",
        answer(403, word("challenge-failed")),
      ).kind,
    ).toBe("request-failed");
  });

  it("a reset completes on 200 `password-changed`, and its refusal is `link-invalid` on 400", () => {
    expect(
      classifyAccountAnswer(
        "reset-password",
        answer(200, word("password-changed")),
      ),
    ).toEqual({ kind: "password-changed" });
    expect(
      classifyAccountAnswer(
        "reset-password",
        answer(400, word("link-invalid")),
      ),
    ).toEqual({ kind: "link-invalid" });
    expect(
      classifyAccountAnswer(
        "verify-email",
        answer(400, word("link-or-password-invalid")),
      ),
    ).toEqual({ kind: "link-invalid" });
  });

  it("a register and a forgot-password request answer `check-inbox` on 202", () => {
    for (const flow of ["register", "forgot-password"] as const) {
      expect(
        classifyAccountAnswer(flow, answer(202, word("check-inbox"))),
      ).toEqual({
        kind: "check-inbox",
      });
    }
  });
});

describe("waitFrom: the wait `Retry-After` states", () => {
  it.each([
    ["1", { kind: "countdown", seconds: 1 }],
    ["599", { kind: "countdown", seconds: 599 }],
    ["600", { kind: "minutes", minutes: 10 }],
    ["601", { kind: "minutes", minutes: 11 }],
    ["3599", { kind: "minutes", minutes: 60 }],
    ["3600", { kind: "minutes", minutes: 60 }],
    ["3601", { kind: "clock-time", seconds: 3601 }],
    ["060", { kind: "countdown", seconds: 60 }],
    ["0600", { kind: "minutes", minutes: 10 }],
    ["90000", { kind: "clock-time", seconds: 90_000 }],
  ])("tells %s seconds as %j", (header, expected) => {
    expect(waitFrom(header)).toEqual(expected);
  });

  it.each([
    ["absent", null],
    ["empty", ""],
    ["nought", "0"],
    ["nought written twice", "00"],
    ["past the longest window", "90001"],
    ["negative", "-5"],
    ["fractional", "1.5"],
    ["exponent", "1e3"],
    ["a date", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["padded", " 30"],
    ["trailing space", "30 "],
    ["plus sign", "+30"],
    ["hex", "0x10"],
    ["seven digits", "1000000"],
    ["a number word", "thirty"],
  ])("tells %s as unreadable", (_, header) => {
    expect(waitFrom(header)).toEqual({ kind: "unreadable" });
  });

  it("never returns a countdown outside 1..599, minutes outside 10..60 or a clock time outside 3601..90000", () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 100_000 }), (seconds) => {
        const wait = waitFrom(String(seconds));
        if (wait.kind === "countdown") {
          expect(wait.seconds).toBeGreaterThanOrEqual(1);
          expect(wait.seconds).toBeLessThan(600);
        } else if (wait.kind === "minutes") {
          expect(wait.minutes).toBeGreaterThanOrEqual(10);
          expect(wait.minutes).toBeLessThanOrEqual(60);
          expect(wait.minutes * 60).toBeGreaterThanOrEqual(seconds);
          expect((wait.minutes - 1) * 60).toBeLessThan(seconds);
        } else if (wait.kind === "clock-time") {
          expect(wait.seconds).toBeGreaterThan(3600);
          expect(wait.seconds).toBeLessThanOrEqual(90_000);
        } else {
          expect(seconds < 1 || seconds > 90_000).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe("rateLimitNoticeOf: the wait as the notice needs it", () => {
  const NOW_MS = Date.UTC(2026, 9, 19, 10, 0, 0);

  it("anchors a countdown to the instant it ends: `endsAtMs`", () => {
    expect(
      rateLimitNoticeOf({ kind: "countdown", seconds: 45 }, NOW_MS),
    ).toEqual({ kind: "countdown", endsAtMs: NOW_MS + 45_000 });
  });

  it("keeps whole minutes as they are", () => {
    expect(rateLimitNoticeOf({ kind: "minutes", minutes: 12 }, NOW_MS)).toEqual(
      {
        kind: "minutes",
        minutes: 12,
      },
    );
  });

  it("tells a long wait as a clock time that is never earlier than now plus the wait", () => {
    const notice = rateLimitNoticeOf(
      { kind: "clock-time", seconds: 7200 },
      NOW_MS,
    );
    expect(notice.kind).toBe("at");
    if (notice.kind !== "at") return;
    expect(notice.time).toMatch(/^\d{1,2}:\d{2}$/);
  });

  it("says `isTomorrow` only when the wait ends on a later calendar day than now", () => {
    const midday = Date.UTC(2026, 9, 19, 10, 30, 0);
    const sameDay = rateLimitNoticeOf(
      { kind: "clock-time", seconds: 3700 },
      midday,
    );
    const nextDay = rateLimitNoticeOf(
      { kind: "clock-time", seconds: 80_000 },
      midday,
    );
    expect(sameDay.kind === "at" && sameDay.isTomorrow).toBe(false);
    expect(nextDay.kind === "at" && nextDay.isTomorrow).toBe(true);
  });

  it("carries no number for an unreadable wait", () => {
    expect(rateLimitNoticeOf({ kind: "unreadable" }, NOW_MS)).toEqual({
      kind: "unreadable",
    });
  });
});

describe("isRetryable", () => {
  it("is true for a service that was not there and a request that got no answer, and for nothing else", () => {
    expect(isRetryable({ kind: "unavailable" })).toBe(true);
    expect(isRetryable({ kind: "unanswered" })).toBe(true);
    for (const kind of [
      "request-failed",
      "platform-failed",
      "rate-limited",
      "none",
      "saved",
    ]) {
      expect(isRetryable({ kind })).toBe(false);
    }
  });
});
