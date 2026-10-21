import { fc } from "@fast-check/vitest";
import { REQUEST_STATUSES } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  isWellFormedDesignId,
  likePatternContaining,
  shownStaffStatusOf,
} from "../src/staff-kitchen-reader.js";

/** Reads a `like` pattern with `\` as its escape, the way Postgres does, into the regular expression it means. */
function expressionOfLikePattern(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern.charAt(index);
    if (character === "\\") {
      index += 1;
      source += escapedForExpression(pattern.charAt(index));
    } else if (character === "%") {
      source += "[^]*";
    } else if (character === "_") {
      source += "[^]";
    } else {
      source += escapedForExpression(character);
    }
  }
  return new RegExp(`^${source}$`, "u");
}

function escapedForExpression(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("likePatternContaining", () => {
  it("matches every text that holds the search, whatever the search holds", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (search, before, after) => {
          const expression = expressionOfLikePattern(
            likePatternContaining(search),
          );

          expect(expression.test(`${before}${search}${after}`)).toBe(true);
        },
      ),
    );
  });

  it("matches no text that lacks the search, even when the search holds a pattern character", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom("a", "b", "%", "_", "\\") }),
        fc.string({ unit: fc.constantFrom("a", "b", "%", "_", "\\") }),
        (search, text) => {
          fc.pre(!text.includes(search));
          const expression = expressionOfLikePattern(
            likePatternContaining(search),
          );

          expect(expression.test(text)).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });

  it.each([
    ["%", "%\\%%"],
    ["_", "%\\_%"],
    ["\\", "%\\\\%"],
    ["\\%", "%\\\\\\%%"],
    ["", "%%"],
  ])("writes %j as %j", (search, pattern) => {
    expect(likePatternContaining(search)).toBe(pattern);
  });
});

describe("shownStaffStatusOf", () => {
  it.each(REQUEST_STATUSES)(
    "shows the saved status %s on a sent kitchen",
    (status) => {
      expect(shownStaffStatusOf({ isSent: true, storedStatus: status })).toBe(
        status,
      );
    },
  );

  it("shows new on a sent kitchen with none saved", () => {
    expect(shownStaffStatusOf({ isSent: true, storedStatus: null })).toBe(
      "new",
    );
  });

  it.each(["", "NEW", "new ", "from-a-later-build", "closed2"])(
    "marks the stored text %j on a sent kitchen as unrecognised and not as new",
    (stored) => {
      expect(shownStaffStatusOf({ isSent: true, storedStatus: stored })).toBe(
        "unrecognised",
      );
    },
  );

  it.each([null, "closed", "from-a-later-build"])(
    "shows nothing on a draft, whatever is stored (%j)",
    (stored) => {
      expect(
        shownStaffStatusOf({ isSent: false, storedStatus: stored }),
      ).toBeNull();
    },
  );
});

describe("isWellFormedDesignId", () => {
  it.each(["a", "A".repeat(21), "a-b_C9", "x".repeat(64)])(
    "accepts %j",
    (id) => {
      expect(isWellFormedDesignId(id)).toBe(true);
    },
  );

  it.each([
    "",
    "x".repeat(65),
    "a b",
    "a/b",
    "a.b",
    "a\n",
    "\n",
    "é",
    "a\u0000",
    7,
    null,
    undefined,
  ])("refuses %j", (id) => {
    expect(isWellFormedDesignId(id)).toBe(false);
  });
});
