import { fc } from "@fast-check/vitest";
import { REQUEST_STATUSES } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  ROMANIAN_CEDILLA_LETTERS,
  ROMANIAN_COMMA_BELOW_LETTERS,
  foldRomanianSearchText,
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

describe("foldRomanianSearchText", () => {
  it.each([0, 1, 2, 3])(
    "writes cedilla letter %i as the comma-below letter in the same place and no other",
    (index) => {
      const cedilla = ROMANIAN_CEDILLA_LETTERS.charAt(index);
      const commaBelow = ROMANIAN_COMMA_BELOW_LETTERS.charAt(index);

      expect(foldRomanianSearchText(`a${cedilla}b`)).toBe(`a${commaBelow}b`);
      expect(foldRomanianSearchText(commaBelow)).toBe(commaBelow);
    },
  );

  it("keeps every other letter, including the plain S and T and the breve, circumflex and sharp letters", () => {
    const others = `STst${String.fromCodePoint(0x103, 0xe2, 0xee, 0xdf)} %_\\`;

    expect(foldRomanianSearchText(others)).toBe(others);
  });

  it("keeps the length in code points for any text, so the cap on a search is unchanged", () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(
            ...Array.from(ROMANIAN_CEDILLA_LETTERS),
            ...Array.from(ROMANIAN_COMMA_BELOW_LETTERS),
            "a",
            "S",
            "\u{1F373}",
          ),
        }),
        (text) => {
          expect(Array.from(foldRomanianSearchText(text))).toHaveLength(
            Array.from(text).length,
          );
          expect(foldRomanianSearchText(foldRomanianSearchText(text))).toBe(
            foldRomanianSearchText(text),
          );
        },
      ),
    );
  });
});
