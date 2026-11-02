// M10 M4 (b), (d): the words of a row the dashboard creates.
/* eslint-disable no-restricted-syntax -- the subject is Romanian text: these are the inputs the judgement must pass or refuse, and a letter, a word and a codepoint of them are the point */
import { describe, expect, it } from "vitest";

import { judgeCreatedRowText } from "../../src/price-dashboard/created-row-text.js";
import type { CreatedRowTextField } from "../../src/price-dashboard/book-field-address.js";

const FIELDS: readonly CreatedRowTextField[] = ["name", "description"];

const BREVE_A = "ă";
const CIRCUMFLEX_A = "â";

function codeOf(raw: unknown, field: CreatedRowTextField = "name"): string {
  const judged = judgeCreatedRowText(raw, field);
  return judged.ok ? "ok" : judged.code;
}

function codePoints(from: number, to: number): readonly string[] {
  return Array.from({ length: to - from + 1 }, (_, offset) =>
    String.fromCodePoint(from + offset),
  );
}

describe("a plain Romanian name passes", () => {
  it.each(FIELDS)("keeps a %s as typed, trimmed", (field) => {
    expect(judgeCreatedRowText(`  Glisiere Blum ${BREVE_A}  `, field)).toEqual({
      ok: true,
      text: `Glisiere Blum ${BREVE_A}`,
    });
  });

  it.each([
    "Blum 2000",
    "Sertar 60 cm",
    "Clasa 2",
    "Leitmotiv 5",
    "lei",
    "bani",
  ])(
    "does not take %s for an amount: a number or a unit alone states none",
    (name) => {
      expect(codeOf(name)).toBe("ok");
    },
  );
});

describe("a character a line of the lead notice cannot carry is refused", () => {
  const C0 = codePoints(0x00, 0x1f);
  const C1 = codePoints(0x7f, 0x9f);
  const BIDI = [
    ...codePoints(0x202a, 0x202e),
    ...codePoints(0x2066, 0x2069),
    "‎",
    "‏",
    "؜",
  ];
  const SEPARATORS = [" ", " "];
  const SWEPT = [...C0, ...C1, ...BIDI, ...SEPARATORS];

  it("sweeps a floor of characters in each arm, so the sweep is not vacuous", () => {
    expect(C0).toHaveLength(32);
    expect(C1).toHaveLength(33);
    expect(BIDI).toHaveLength(12);
  });

  it.each(FIELDS)(
    "refuses every control and direction control inside a %s, at the end and alone",
    (field) => {
      for (const character of SWEPT) {
        expect([
          codeOf(`Ab${character}cd`, field),
          codeOf(`Abcd${character}`, field),
          codeOf(character, field),
        ]).toEqual([
          "TEXT_FORBIDDEN_CHARACTER",
          "TEXT_FORBIDDEN_CHARACTER",
          "TEXT_FORBIDDEN_CHARACTER",
        ]);
      }
    },
  );

  it("refuses a line feed, which a note allows", () => {
    expect(codeOf("Prima\nA doua", "description")).toBe(
      "TEXT_FORBIDDEN_CHARACTER",
    );
  });

  it("refuses an unpaired surrogate", () => {
    expect(codeOf("Ab\ud800")).toBe("TEXT_FORBIDDEN_CHARACTER");
    expect(codeOf("\udc00Ab")).toBe("TEXT_FORBIDDEN_CHARACTER");
  });

  it("refuses text that is not in NFC rather than composing it", () => {
    expect(codeOf("Café")).toBe("TEXT_FORBIDDEN_CHARACTER");
    expect(codeOf("Café")).toBe("ok");
  });
});

describe("what is not text, or shows nothing", () => {
  it.each([undefined, null, 5, true, {}, ["a"]])(
    "refuses %j as a missing value",
    (raw) => {
      expect(codeOf(raw)).toBe("MISSING_VALUE");
      expect(codeOf(raw, "description")).toBe("MISSING_VALUE");
    },
  );

  it.each(["", "   ", "​", " ​  ", "ㅤᅟ"])(
    "refuses %j as a name, and reads it as an empty description",
    (blank) => {
      expect(codeOf(blank, "name")).toBe("TEXT_EMPTY");
      expect(judgeCreatedRowText(blank, "description")).toEqual({
        ok: true,
        text: "",
      });
    },
  );
});

describe("the bounds are the book's, in UTF-16 units, after trimming", () => {
  it.each([
    ["name", 80],
    ["description", 240],
  ] as const)(
    "accepts a %s of exactly %i and refuses one more",
    (field, max) => {
      expect(codeOf("a".repeat(max), field)).toBe("ok");
      expect(codeOf("a".repeat(max + 1), field)).toBe("TEXT_TOO_LONG");
      expect(codeOf(` ${"a".repeat(max)} `, field)).toBe("ok");
    },
  );

  it("counts a character outside the basic plane as two units, as the parser does", () => {
    expect(codeOf(`${"a".repeat(79)}\u{1F600}`)).toBe("TEXT_TOO_LONG");
    expect(codeOf(`${"a".repeat(78)}\u{1F600}`)).toBe("ok");
  });
});

describe("a text may not state an amount, a percentage or an inclusion (ADR 0106 Amendment A)", () => {
  it.each([
    "500 lei",
    "500lei",
    "5 LEI",
    "MDL 500",
    "mdl500",
    "1 200,50 MDL",
    "1.200 lei",
    "10 bani",
    "€5",
    "5 €",
    "$ 20",
    "20 USD",
    "٥٠٠ lei",
    "Preț: 99 RON",
  ])("refuses %j as an amount", (text) => {
    expect(codeOf(text)).toBe("TEXT_STATES_AN_AMOUNT");
    expect(codeOf(text, "description")).toBe("TEXT_STATES_AN_AMOUNT");
  });

  it.each([
    "10%",
    "10 %",
    "%",
    "10％",
    "10٪",
    "10﹪",
    "10‰",
    "Adaos de 30 procente",
    "Procent",
  ])("refuses %j as a percentage", (text) => {
    expect(codeOf(text)).toBe("TEXT_STATES_AN_AMOUNT");
  });

  it.each([
    "Inclus",
    `Inclus${BREVE_A}`,
    "Inclusa",
    "incluse",
    "INCLUSE",
    "Inclusiv montaj",
    `Incluz${CIRCUMFLEX_A}nd montaj`,
    "Incluzand montaj",
    `Montaj inclus${BREVE_A} în preț`,
    `INCLUS${BREVE_A.toUpperCase()}`,
  ])("refuses %j as an inclusion", (text) => {
    expect(codeOf(text)).toBe("TEXT_STATES_AN_AMOUNT");
  });

  it.each(["Include montaj", "Exclus", "Inclinat", "Reinclus"])(
    "lets %j through: it is not an inclusion word",
    (text) => {
      expect(codeOf(text)).toBe("ok");
    },
  );

  it("judges the length before the content, so an over-long amount is too long", () => {
    expect(codeOf(`${"a".repeat(90)} 500 lei`)).toBe("TEXT_TOO_LONG");
  });
});
