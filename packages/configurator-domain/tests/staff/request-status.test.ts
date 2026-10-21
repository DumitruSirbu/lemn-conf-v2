import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  INITIAL_REQUEST_STATUS,
  REQUEST_STATUSES,
  isRequestStatus,
  judgeRequestStatus,
  shownRequestStatus,
  type RequestStatus,
} from "../../src/staff/request-status.js";

describe("the request statuses", () => {
  it("are the owner's four, in the order staff work a request", () => {
    expect(REQUEST_STATUSES).toEqual([
      "new",
      "contacted",
      "offer-sent",
      "closed",
    ]);
  });

  it("cannot be edited by a caller that imports the list", () => {
    expect(Object.isFrozen(REQUEST_STATUSES)).toBe(true);
  });

  describe("isRequestStatus accepts exactly those four codes", () => {
    it.each(REQUEST_STATUSES)("accepts %s", (status) => {
      expect(isRequestStatus(status)).toBe(true);
    });

    it.each([
      ["the empty string", ""],
      ["a different case", "New"],
      ["a leading space", " new"],
      ["a trailing space", "closed "],
      ["a display word, not a code", "Noua"],
      ["an underscore for the hyphen", "offer_sent"],
      ["an inherited object member", "constructor"],
      ["the prototype key", "__proto__"],
      ["an inherited method name", "toString"],
      ["an array holding a status", ["new"]],
      ["an object", { status: "new" }],
      ["null", null],
      ["undefined", undefined],
      ["a number", 0],
    ])("refuses %s", (_label, value) => {
      expect(isRequestStatus(value)).toBe(false);
    });
  });
});

describe("shownRequestStatus: what a kitchen's request shows", () => {
  it("shows a sent kitchen with no saved status as new", () => {
    expect(INITIAL_REQUEST_STATUS).toBe("new");
    expect(shownRequestStatus({ isSent: true, recorded: null })).toBe("new");
  });

  it.each(REQUEST_STATUSES)(
    "shows the saved status %s of a sent kitchen as it is",
    (recorded) => {
      expect(shownRequestStatus({ isSent: true, recorded })).toBe(recorded);
    },
  );

  it("shows a draft no status", () => {
    expect(shownRequestStatus({ isSent: false, recorded: null })).toBeNull();
  });

  it("shows a draft no status even if a status is somehow recorded for it", () => {
    const recorded: RequestStatus = "contacted";

    expect(shownRequestStatus({ isSent: false, recorded })).toBeNull();
  });
});

describe("judgeRequestStatus: what a status save may carry", () => {
  function refusalCodeOf(raw: unknown): string | undefined {
    const judgement = judgeRequestStatus(raw);
    return judgement.ok ? undefined : judgement.code;
  }

  it.each(REQUEST_STATUSES)("accepts %s and returns it", (listed) => {
    expect(judgeRequestStatus(listed)).toEqual({ ok: true, status: listed });
  });

  it("returns the listed constant for a string built at run time", () => {
    const built = ["offer", "sent"].join("-");

    const judgement = judgeRequestStatus(built);

    expect(judgement.ok && judgement.status).toBe("offer-sent");
  });

  describe("an absent status is REQUIRED", () => {
    it("undefined", () => {
      expect(refusalCodeOf(undefined)).toBe("REQUIRED");
    });
  });

  describe("a value that is not a string is NOT_TEXT, never coerced", () => {
    it.each([
      ["null", null],
      ["a number", 0],
      ["NaN", Number.NaN],
      ["true", true],
      ["false", false],
      ["an array holding a status", ["new"]],
      ["an object", { status: "new" }],
      ["an object whose toString names a status", { toString: () => "new" }],
      ["an object whose valueOf names a status", { valueOf: () => "new" }],
      ["a String object", new String("new")],
      [
        "a String object from another realm",
        runInNewContext("new String('new')"),
      ],
      ["a symbol", Symbol("new")],
      ["a bigint", 1n],
      ["a function", () => "new"],
    ])("%s", (_label, raw) => {
      expect(refusalCodeOf(raw)).toBe("NOT_TEXT");
    });
  });

  describe("a string that is not exactly a listed code is STATUS_NOT_IN_LIST", () => {
    it.each([
      ["the empty string", ""],
      ["a leading space", " new"],
      ["a trailing space", "new "],
      ["a trailing line feed", "new\n"],
      ["a tab", "\tnew"],
      ["a different case", "NEW"],
      ["a capital first letter", "New"],
      ["a mixed case", "Offer-Sent"],
      ["an underscore for the hyphen", "offer_sent"],
      ["a missing hyphen", "offersent"],
      ["a zero-width space inside", "ne\u200Bw"],
      ["a zero-width space before", "\u200Bclosed"],
      ["a byte order mark", "\uFEFFnew"],
      ["a no-break space", "new\u00A0"],
      ["a Cyrillic look-alike for e", "n\u0435w"],
      ["a full-width letter", "\uFF4Eew"],
      ["a decomposed look-alike", "closed\u0301"],
      ["a display word", "Noua"],
      ["a NUL after the code", "new\u0000"],
      ["the prototype key", "__proto__"],
      ["an inherited object member", "constructor"],
      ["another inherited member", "hasOwnProperty"],
      ["an inherited method name", "toString"],
      ["an array method name", "length"],
      ["an array index", "0"],
    ])("%s", (_label, raw) => {
      expect(refusalCodeOf(raw)).toBe("STATUS_NOT_IN_LIST");
    });
  });

  it("does not accept a name that a polluted Object.prototype or Array.prototype supplies", () => {
    Reflect.defineProperty(Object.prototype, "polluted", {
      value: "polluted",
      configurable: true,
      enumerable: false,
    });
    try {
      expect(refusalCodeOf("polluted")).toBe("STATUS_NOT_IN_LIST");
    } finally {
      Reflect.deleteProperty(Object.prototype, "polluted");
    }
  });

  it("answers with a code and never the value", () => {
    const judgement = judgeRequestStatus("secret-status");

    expect(JSON.stringify(judgement)).not.toContain("secret");
    expect(Object.keys(judgement).sort()).toEqual(["code", "ok"]);
  });

  it("agrees with isRequestStatus on every string", () => {
    for (const text of [
      ...REQUEST_STATUSES,
      "",
      "NEW",
      "constructor",
      "new ",
    ]) {
      expect(judgeRequestStatus(text).ok).toBe(isRequestStatus(text));
    }
  });
});
