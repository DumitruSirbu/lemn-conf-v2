import { describe, expect, it } from "vitest";

import {
  INITIAL_REQUEST_STATUS,
  REQUEST_STATUSES,
  isRequestStatus,
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
