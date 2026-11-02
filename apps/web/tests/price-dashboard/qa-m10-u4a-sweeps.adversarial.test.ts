// Adversarial QA of M10 wave U4a, the values a person can type on the hardware screens held against the domain that judges
// them again: what the screen reads as a rate or as a class's words must be taken by `applyChanges`, or the screen offers a
// Save that the server refuses, and what the screen refuses must not be something the book would have held. Swept over the
// whole range of a rate, and over arbitrary text, rather than the boundaries a person thought of.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  MAX_BOOK_NAME_LENGTH,
  MAX_PRICE_COEFFICIENT_MINOR,
  SAMPLE_PRICE_BOOK,
  TEN_LEI_MINOR,
  applyChanges,
  judgeCreatedRowText,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { deriveHardware } from "@/price-dashboard/hardware-model";
import { plainLeiOf, readLeiInput } from "@/price-dashboard/price-field-input";

import { stateOf } from "./dashboard-state-fixture";

const NEW_CLASS = "hardware.sweep";
const LARGEST_TEN_LEI =
  Math.floor(MAX_PRICE_COEFFICIENT_MINOR / TEN_LEI_MINOR) * TEN_LEI_MINOR;

function creationOf(
  name: string,
  description: string,
  rateMinor: number,
): readonly DraftChange[] {
  return [
    {
      address: { kind: "hardware-tier-created", tierId: NEW_CLASS },
      value: { name, description },
    },
    ...HARDWARE_RATE_FIELDS.map(
      (field): DraftChange => ({
        address: { kind: "hardware", tierId: NEW_CLASS, field },
        value: rateMinor,
      }),
    ),
  ];
}

const aWholeTenLei = fc
  .oneof(
    fc.integer({ min: 0, max: LARGEST_TEN_LEI / TEN_LEI_MINOR }),
    fc.constantFrom(0, 1, 2, LARGEST_TEN_LEI / TEN_LEI_MINOR - 1),
  )
  .map((tens) => tens * TEN_LEI_MINOR);

describe("a rate over its whole range", () => {
  propertyTest.prop([aWholeTenLei], { numRuns: 400 })(
    "is read back exactly from the text the field shows for it, and is taken by the draft as a rate of a held class and of a created one",
    (rateMinor) => {
      const reading = readLeiInput(plainLeiOf(rateMinor));

      expect(reading).toEqual({ kind: "amount", minor: rateMinor });
      const held = applyChanges(SAMPLE_PRICE_BOOK, [
        {
          address: {
            kind: "hardware",
            tierId: "hardware.soft-close",
            field: "perLiftMinor",
          },
          value: rateMinor,
        },
      ]);
      expect(held.ok).toBe(true);
      expect(
        applyChanges(SAMPLE_PRICE_BOOK, creationOf("GTV", "", rateMinor)).ok,
      ).toBe(true);
    },
  );

  it("is refused by the screen one ten lei above the largest the book takes, and by the book one bani above its own bound", () => {
    expect(readLeiInput(plainLeiOf(LARGEST_TEN_LEI)).kind).toBe("amount");
    expect(readLeiInput(plainLeiOf(LARGEST_TEN_LEI + TEN_LEI_MINOR))).toEqual({
      kind: "refused",
      refusal: "tooBig",
    });
    const aboveTheBound = applyChanges(SAMPLE_PRICE_BOOK, [
      {
        address: {
          kind: "hardware",
          tierId: "hardware.soft-close",
          field: "perLiftMinor",
        },
        value: MAX_PRICE_COEFFICIENT_MINOR + 1,
      },
    ]);
    expect(aboveTheBound.ok).toBe(false);
  });

  propertyTest.prop(
    [
      fc
        .array(fc.constantFrom("0", "1", "5", "9", ",", ".", " ", "-", "a"), {
          maxLength: 14,
        })
        .map((chars) => chars.join("")),
    ],
    { numRuns: 800 },
  )(
    "is never read as an amount the draft would refuse, whatever is typed",
    (typed) => {
      const reading = readLeiInput(typed);
      if (reading.kind !== "amount") return;

      const applied = applyChanges(
        SAMPLE_PRICE_BOOK,
        creationOf("GTV", "", reading.minor),
      );

      expect(applied.ok).toBe(true);
    },
  );
});

describe("a class's words over arbitrary text", () => {
  const anyText = fc.oneof(
    fc.string({ unit: "binary", maxLength: 40 }),
    fc.string({ unit: "grapheme", maxLength: 40 }),
    fc.string({
      unit: "binary",
      minLength: MAX_BOOK_NAME_LENGTH - 2,
      maxLength: MAX_BOOK_NAME_LENGTH + 3,
    }),
  );

  propertyTest.prop([anyText, anyText], { numRuns: 1500 })(
    "that the form accepts is text the book takes, and trimmed text the form stores is text it would accept again",
    (name, description) => {
      const nameJudged = judgeCreatedRowText(name, "name");
      const descriptionJudged = judgeCreatedRowText(description, "description");
      if (!nameJudged.ok || !descriptionJudged.ok) return;

      const applied = applyChanges(
        SAMPLE_PRICE_BOOK,
        creationOf(nameJudged.text, descriptionJudged.text, 0),
      );

      expect(applied.ok).toBe(true);
      expect(judgeCreatedRowText(nameJudged.text, "name")).toEqual(nameJudged);
      expect(
        judgeCreatedRowText(descriptionJudged.text, "description"),
      ).toEqual(descriptionJudged);
    },
  );

  propertyTest.prop([anyText, anyText], { numRuns: 1500 })(
    "that the form refuses is never a class the list would draw: the creation as the screen would send it is refused whole",
    (name, description) => {
      const nameJudged = judgeCreatedRowText(name, "name");
      const descriptionJudged = judgeCreatedRowText(description, "description");
      if (nameJudged.ok && descriptionJudged.ok) return;

      const applied = applyChanges(
        SAMPLE_PRICE_BOOK,
        creationOf(name, description, 0),
      );

      expect(applied.ok).toBe(false);
    },
  );

  it("is bounded where the form says: the longest name and description are taken by the form and by the book, one more unit is taken by neither", () => {
    const longestDescription = largestLengthTaken("description");
    const longestName = "a".repeat(MAX_BOOK_NAME_LENGTH);

    expect(longestDescription).toBeGreaterThan(MAX_BOOK_NAME_LENGTH);
    expect(
      applyChanges(
        SAMPLE_PRICE_BOOK,
        creationOf(longestName, "b".repeat(longestDescription), 0),
      ).ok,
    ).toBe(true);
    expect(judgeCreatedRowText(`${longestName}a`, "name")).toEqual({
      ok: false,
      code: "TEXT_TOO_LONG",
    });
    expect(
      applyChanges(
        SAMPLE_PRICE_BOOK,
        creationOf(longestName, "b".repeat(longestDescription + 1), 0),
      ).ok,
    ).toBe(false);
  });

  it("counts a length in UTF-16 units, as the book does: the longest name made of astral characters is half as many characters", () => {
    const astral = "\u{1F600}";
    const characters = Math.floor(MAX_BOOK_NAME_LENGTH / 2);

    expect(judgeCreatedRowText(astral.repeat(characters), "name").ok).toBe(
      true,
    );
    expect(judgeCreatedRowText(astral.repeat(characters + 1), "name")).toEqual({
      ok: false,
      code: "TEXT_TOO_LONG",
    });
  });
});

/** The longest run of one letter the form takes as a description, found by asking it: the bound is not exported. */
function largestLengthTaken(field: "name" | "description"): number {
  let length = 1;
  while (judgeCreatedRowText("b".repeat(length * 2), field).ok) length *= 2;
  let low = length;
  let high = length * 2;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (judgeCreatedRowText("b".repeat(middle), field).ok) low = middle;
    else high = middle;
  }
  return low;
}

describe("a created class as the screens derive it", () => {
  propertyTest.prop([fc.subarray([...HARDWARE_RATE_FIELDS]), fc.boolean()], {
    numRuns: 200,
  })(
    "is drawn exactly when the draft applies: a creation owed a rate it was not given is not drawn, and one given all of them is",
    (givenRates, isRatesBeforeCreation) => {
      const [creation, ...rates] = creationOf("GTV", "", 2_000);
      const kept = rates.filter(
        (rate) =>
          rate.address.kind === "hardware" &&
          givenRates.includes(rate.address.field),
      );
      const changes =
        isRatesBeforeCreation && creation !== undefined
          ? [...kept, creation]
          : creation === undefined
            ? []
            : [creation, ...kept];

      const derivation = deriveHardware(stateOf(changes));

      const isWholeAndInOrder =
        givenRates.length === HARDWARE_RATE_FIELDS.length &&
        !isRatesBeforeCreation;
      expect(derivation.kind === "ready").toBe(isWholeAndInOrder);
      if (derivation.kind === "ready") {
        expect(derivation.classes.at(-1)?.tierId).toBe(NEW_CLASS);
        expect(derivation.classes.at(-1)?.isCreated).toBe(true);
      }
    },
  );
});
