import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  parsePriceBook,
  SAMPLE_PRICE_BOOK,
  snapshotSubmission,
  type Design,
  type PriceBook,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  composeLeadNotice,
  NoticeLineError,
} from "@/lib/server/mail/lead-notification";

import { MEASURED_DEEPENING_ROWS } from "../../../support/deepening-rows";
import { NOTHING_DISABLED } from "../../../support/availability";
import { VARIED_L_ARM } from "../../../support/varied-kitchens";
import {
  designSubmission,
  noticeInput,
  sendableKitchensOf,
} from "./lead-notice-fixtures";

// M10 P4b, adversarial: the shop's notice refuses any line holding a control, line or paragraph separator
// (`oneLine` in lead-notification.ts). A created accessory's name and description reach the notice's appendix rows
// through the review, so a parsed name that could trip it would make every kitchen earning the accessory unsendable.
// The parser's character rule is what keeps that from happening; these tests drive parsed words through
// `composeLeadNotice` itself, and show with an unparsed book that the notice's check is live.

const LINKED_ROW = "base-sink";
const KITCHEN = firstKitchen();

function firstKitchen(): Design {
  const [first] = sendableKitchensOf(VARIED_L_ARM);
  if (first === undefined) throw new Error("the L arm has no sendable kitchen");
  return first.design;
}

function bookWith(name: string, description: string | undefined): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    linkedAccessories: [
      {
        accessoryId: "organiser",
        ruleId: "accessory.organiser",
        linkedBuildId: LINKED_ROW,
        perUnitMinor: 25_000,
        name,
        ...(description === undefined ? {} : { description }),
      },
    ],
  };
}

function snapshotUnder(book: PriceBook): SubmissionSnapshot | undefined {
  const result = snapshotSubmission({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design: KITCHEN,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN)),
    book,
    pricingVersion: book.version,
  });
  return result.ok ? result.snapshot : undefined;
}

function composedFor(snapshot: SubmissionSnapshot) {
  return composeLeadNotice(noticeInput(designSubmission({ snapshot })));
}

describe("a parsed created-row name travels through the shop's notice", () => {
  it("is written as a line of the notice, for names the parser accepts", () => {
    for (const name of [
      "Organizator",
      `Ünïcödé ${String.fromCodePoint(0x103, 0xe2, 0xee, 0x219, 0x21b)}`,
      "Органайзер",
      `Lamp${String.fromCodePoint(0x103)} ${String.fromCodePoint(0x1f642)}`,
      "1/2\u00a0inch",
      "ş",
      "a\u200bb",
    ]) {
      const parsed = parsePriceBook(bookWith(name, "Pentru un sertar."));
      if (!parsed.ok) throw new Error(`refused ${JSON.stringify(name)}`);
      const snapshot = snapshotUnder(parsed.book);
      if (snapshot === undefined) throw new Error("not sendable");

      const message = composedFor(snapshot);

      expect(message.text, name).toContain(name);
    }
  });

  it("never trips the notice's one-line check, for any string the parser lets through", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", minLength: 1, maxLength: 40 }),
        fc.option(fc.string({ unit: "binary", maxLength: 80 }), {
          nil: undefined,
        }),
        (name, description) => {
          const parsed = parsePriceBook(bookWith(name, description));
          if (!parsed.ok) return;
          const snapshot = snapshotUnder(parsed.book);
          if (snapshot === undefined) return;

          expect(() => composedFor(snapshot)).not.toThrow(NoticeLineError);
        },
      ),
      { numRuns: 1_500 },
    );
  });

  it("never trips it over strings drawn from the characters the notice's check turns on", () => {
    const turning = [
      "\n",
      "\r",
      "\u0000",
      "\u0085",
      "\u007f",
      "\u2028",
      "\u2029",
      "\u202e",
      "\u2066",
      "\u200b",
      "a",
      " ",
    ];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...turning), { maxLength: 10 }),
        (characters) => {
          const text = `n${characters.join("")}`;
          const parsed = parsePriceBook(bookWith(text, text));
          if (!parsed.ok) return;
          const snapshot = snapshotUnder(parsed.book);
          if (snapshot === undefined) return;

          expect(() => composedFor(snapshot)).not.toThrow(NoticeLineError);
        },
      ),
      { numRuns: 1_500 },
    );
  });
});

describe("the notice's check is live, so the parser's rule is what protects it", () => {
  it("throws once the stored name carries a line break, which the parser never lets into a book", () => {
    const parsed = parsePriceBook(bookWith("Organizator-7c41", undefined));
    if (!parsed.ok) throw new Error("the control book was refused");
    const snapshot = snapshotUnder(parsed.book);
    if (snapshot === undefined)
      throw new Error("the control book is not sendable");
    const stored = JSON.stringify(snapshot);
    expect(stored).toContain("Organizator-7c41");

    const tampered = JSON.parse(
      stored.replaceAll("Organizator-7c41", "Organizator\\nsertar"),
    ) as SubmissionSnapshot;

    expect(() => composedFor(tampered)).toThrow(NoticeLineError);
    expect(parsePriceBook(bookWith("Organizator\nsertar", undefined)).ok).toBe(
      false,
    );
  });
});
