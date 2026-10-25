// A typed string set inside a sentence: stripped of the characters that reorder or isolate, then fenced between isolate marks.
// The strip comes first, so a closing mark inside the value cannot end the fence early and let what follows run out into the
// sentence. The characters are written as escapes.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isolated } from "@/staff/bidi-isolate";

const FIRST_STRONG_ISOLATE = "\u2068";
const POP_DIRECTIONAL_ISOLATE = "\u2069";
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

describe("isolated", () => {
  it("fences a plain value between the two isolate marks and changes nothing of it", () => {
    expect(isolated("ana.popescu@mail.md")).toBe(
      `${FIRST_STRONG_ISOLATE}ana.popescu@mail.md${POP_DIRECTIONAL_ISOLATE}`,
    );
  });

  it("cannot be closed early by a closing mark inside the value, followed by an override", () => {
    const fenced = isolated("name\u2069\u202Eevil");

    expect(fenced).toBe(
      `${FIRST_STRONG_ISOLATE}nameevil${POP_DIRECTIONAL_ISOLATE}`,
    );
    expect(fenced.indexOf(POP_DIRECTIONAL_ISOLATE)).toBe(fenced.length - 1);
  });

  it.each([
    ["the Arabic letter mark", "\u061C"],
    ["the left-to-right mark", "\u200E"],
    ["the right-to-left mark", "\u200F"],
    ["an embedding", "\u202A"],
    ["an embedding to the right", "\u202B"],
    ["the end of an embedding", "\u202C"],
    ["an override to the left", "\u202D"],
    ["an override to the right", "\u202E"],
    ["a left-to-right isolate", "\u2066"],
    ["a right-to-left isolate", "\u2067"],
    ["a first-strong isolate", "\u2068"],
    ["the end of an isolate", "\u2069"],
  ])("removes %s from the value", (_, control) => {
    expect(isolated(`a${control}b`)).toBe(
      `${FIRST_STRONG_ISOLATE}ab${POP_DIRECTIONAL_ISOLATE}`,
    );
  });

  it("keeps the joiners an emoji sequence is made of", () => {
    const sequence = "\u{1F469}\u200D\u{1F4BB}";

    expect(isolated(sequence)).toBe(
      `${FIRST_STRONG_ISOLATE}${sequence}${POP_DIRECTIONAL_ISOLATE}`,
    );
  });

  it("holds, for any value, exactly one opening and one closing mark, at the two ends, and no other control between", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", maxLength: 40 }),
        fc.constantFrom(
          "",
          "\u2069",
          "\u202E",
          "\u2069\u202E",
          "\u2066\u2067\u2068",
        ),
        (value, injected) => {
          const fenced = isolated(`${value}${injected}${value}`);
          const inside = fenced.slice(1, -1);

          expect(fenced.startsWith(FIRST_STRONG_ISOLATE)).toBe(true);
          expect(fenced.endsWith(POP_DIRECTIONAL_ISOLATE)).toBe(true);
          expect(BIDI_CONTROLS.test(inside)).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });
});
