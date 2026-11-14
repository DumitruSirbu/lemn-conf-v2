import { describe, expect, it } from "vitest";

import { shownDesignOf } from "@/staff/shown-design";

import { aDesign } from "../support/account-world";

const SENT = aDesign("sent-copy");
const CURRENT = aDesign("current-copy");

describe("the copy of a kitchen on screen", () => {
  it.each([
    ["sent, both readable", "sent", SENT, CURRENT, SENT, "as-sent"],
    ["current, both readable", "current", SENT, CURRENT, CURRENT, "current"],
    [
      "current, only the sent copy readable",
      "current",
      SENT,
      null,
      SENT,
      "as-sent",
    ],
    [
      "sent, only the current copy readable",
      "sent",
      null,
      CURRENT,
      CURRENT,
      "current",
    ],
  ] as const)(
    "chooses by the rule for %s",
    (_title, version, asSent, design, expectedDesign, expectedSource) => {
      expect(shownDesignOf({ asSent, design }, version)).toEqual({
        design: expectedDesign,
        source: expectedSource,
      });
    },
  );

  it("opens on the sent copy when no version is named", () => {
    expect(shownDesignOf({ asSent: SENT, design: CURRENT })?.source).toBe(
      "as-sent",
    );
  });

  it.each(["sent", "current"] as const)(
    "shows nothing when neither copy is readable, for %s",
    (version) => {
      expect(
        shownDesignOf({ asSent: null, design: null }, version),
      ).toBeUndefined();
    },
  );
});
