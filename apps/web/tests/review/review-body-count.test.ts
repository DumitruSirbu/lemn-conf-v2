// Criterion 4's plurals: the body count at the end of the room line follows each locale's own CLDR categories.
// Romanian has one / few / other and Russian one / few / many / other, so a count that reads right in one
// language and wrong in the other is the defect this file exists to catch.
import { describe, expect, it } from "vitest";

import { CATALOGUES, contentFor } from "../support/catalogues";

const STRAIGHT_WALL_MM = 3600;

/** What each locale prints for a count, spelled out; the number is the leading digits. */
const EXPECTED_BODY_COUNT_WORDS: Readonly<
  Record<"ro" | "ru", readonly (readonly [number, string])[]>
> = {
  ro: [
    [0, "0 corpuri"],
    [1, "1 corp"],
    [2, "2 corpuri"],
    [19, "19 corpuri"],
    [20, "20 corpuri"],
    [21, "21 corpuri"],
    [101, "101 corpuri"],
  ],
  ru: [
    [0, "0 шкафов"],
    [1, "1 шкаф"],
    [2, "2 шкафа"],
    [4, "4 шкафа"],
    [5, "5 шкафов"],
    [11, "11 шкафов"],
    [12, "12 шкафов"],
    [21, "21 шкаф"],
    [22, "22 шкафа"],
    [25, "25 шкафов"],
    [101, "101 шкаф"],
  ],
};

describe.each(CATALOGUES)("the body count in %s", (locale, messages) => {
  const content = contentFor(locale, messages);
  const cases = EXPECTED_BODY_COUNT_WORDS[locale];
  const rules = new Intl.PluralRules(locale);

  it.each(cases)(
    "reads %i as the room line's last words",
    (bodyCount, words) => {
      const line = content.reviewRoomLine({
        shape: "linear",
        wallAMm: STRAIGHT_WALL_MM,
        bodyCount,
      });

      expect(line.endsWith(` · ${words}`)).toBe(true);
    },
  );

  it("is checked at every plural category a whole count can reach in the locale", () => {
    const reachable = new Set(
      Array.from({ length: 201 }, (_, count) => rules.select(count)),
    );
    const exercised = new Set(cases.map(([count]) => rules.select(count)));

    expect([...exercised].sort()).toEqual([...reachable].sort());
  });

  it("puts the count on every shape's line, the same words each time", () => {
    const wall = STRAIGHT_WALL_MM;
    const lines = [
      content.reviewRoomLine({ shape: "linear", wallAMm: wall, bodyCount: 5 }),
      content.reviewRoomLine({
        shape: "L",
        wallAMm: wall,
        wallBMm: wall,
        corner: "left",
        bodyCount: 5,
      }),
      content.reviewRoomLine({
        shape: "U",
        wallAMm: wall,
        wallBMm: wall,
        wallCMm: wall,
        bodyCount: 5,
      }),
    ];
    const tails = lines.map((line) => line.split(" · ").at(-1));

    expect(new Set(tails).size).toBe(1);
  });
});
