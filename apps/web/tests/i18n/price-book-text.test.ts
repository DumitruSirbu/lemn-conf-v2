// **Every catalogue key the shipped price book names, resolved — enumerated and never sampled.**
//
// ADR 0106 decision 1 lets a book row name the leaf its rendered text is written in, and the
// resolver falls back to the row's own authored words for a key it has no arm for. That fallback is
// what makes a *missing* leaf silent: the row still renders, in Romanian, on a `/ru` screen — which
// is the same class of defect wave 6B-f shipped when a descriptor with no leaf rendered empty and
// no test noticed. So this file walks the book itself rather than a list somebody kept up to date,
// and asserts each key resolves to that leaf's own value in **both** locales.
//
// It also holds ADR 0062's line from the catalogue side: relocating a row's words must not relocate
// an amount, so no leaf under `priceBook.*` may carry a digit the book states as money.
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type AccessoryRule,
  type TierIdentity,
} from "@lemnaria/configurator-domain";

import { CATALOGUES, contentFor, leafAt } from "../support/catalogues";
import roMessages from "../../src/messages/ro.json";

/** One rendered field a book row publishes: what it was authored as, and the leaf it names. */
interface BookText {
  readonly row: string;
  readonly field: "name" | "description";
  readonly authored: string;
  readonly key: string | undefined;
}

function textsOf(
  row: TierIdentity | AccessoryRule,
  named: string,
): readonly BookText[] {
  return [
    { row: named, field: "name", authored: row.name, key: row.nameKey },
    {
      row: named,
      field: "description",
      authored: row.description,
      key: row.descriptionKey,
    },
  ];
}

/** Every text the shipped book renders, keyed or not — read off the book so a seventh tier is
 *  swept the day it is declared rather than the day somebody remembers this file. */
const EVERY_TEXT: readonly BookText[] = [
  ...SAMPLE_PRICE_BOOK.hardware.tiers.flatMap((tier) =>
    textsOf(tier, tier.tierId),
  ),
  ...SAMPLE_PRICE_BOOK.material.tiers.flatMap((tier) =>
    textsOf(tier, tier.tierId),
  ),
  ...textsOf(
    SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover,
    "sinkProtectiveCover",
  ),
  ...textsOf(SAMPLE_PRICE_BOOK.accessories.dishDryingRack, "dishDryingRack"),
];

const KEYED_TEXTS = EVERY_TEXT.filter((text) => text.key !== undefined);

describe("the shipped book's keys all name a leaf that exists", () => {
  it("declares 14 keyed texts and 2 that are deliberately unkeyed", () => {
    // Anti-vacuity for the sweeps below, and the ruling itself made falsifiable: *Hettich* and
    // *Blum* are proper nouns, a translated one is a defect, and ADR 0106's "the key wins when
    // present" localises them correctly by their naming no key. If a later wave keys all eight
    // names for symmetry, this fails and says which two it must not have.
    expect(EVERY_TEXT).toHaveLength(16);
    expect(KEYED_TEXTS).toHaveLength(14);
    expect(
      EVERY_TEXT.filter((text) => text.key === undefined).map(
        (text) => `${text.row}.${text.field}`,
      ),
    ).toEqual(["hardware.soft-close.name", "hardware.premium.name"]);
  });

  it.each(CATALOGUES)(
    "resolves every key through the %s catalogue",
    (locale, messages) => {
      const content = contentFor(locale, messages);

      for (const text of KEYED_TEXTS) {
        const { key } = text;
        if (key === undefined) throw new Error("filtered above");
        const leaf = leafAt(messages, key);
        // Two claims, and the second is the one the fallback would hide: the catalogue holds the leaf
        // at all, and the resolver reaches *that* leaf rather than falling back to the book's words.
        // Emptiness is not re-claimed here — the sweep over the `EVERY_TEXT` superset below owns it.
        expect(leaf, `${locale}:${key}`).toBeDefined();
        expect(content.bookText(text.authored, key), key).toBe(leaf);
      }
    },
  );

  it("renders the Romanian byte for byte, so the wave moved words and reworded none", () => {
    const content = contentFor("ro", roMessages);

    for (const text of KEYED_TEXTS) {
      expect(content.bookText(text.authored, text.key), text.key).toBe(
        text.authored,
      );
    }
  });

  it.each(CATALOGUES)(
    "says every book text in %s, keyed or not",
    (locale, messages) => {
      const content = contentFor(locale, messages);

      for (const text of EVERY_TEXT) {
        const rendered = content.bookText(text.authored, text.key);
        expect(rendered, `${locale}:${text.row}`).not.toBe("");
        expect(rendered, `${locale}:${text.row}`).not.toContain("priceBook.");
      }
    },
  );
});

describe("a book row that names no key still renders its own name", () => {
  // ADR 0106 decision 2, exercised rather than declared. A manufacturer types a name into the
  // dashboard ADR 0072 places after M8; they do not mint a catalogue key, and a row of theirs must
  // render in whatever language they typed.
  it.each(CATALOGUES)(
    "prints a dashboard-authored row verbatim in %s",
    (locale, messages) => {
      const content = contentFor(locale, messages);

      expect(
        content.bookText("Feronerie de la un alt furnizor", undefined),
        locale,
      ).toBe("Feronerie de la un alt furnizor");
      expect(
        content.bookText("Фурнитура другого поставщика", undefined),
        locale,
      ).toBe("Фурнитура другого поставщика");
    },
  );

  it.each(CATALOGUES)(
    "prints its own name for a key %s has no leaf for",
    (locale, messages) => {
      // Reachable rather than theoretical: a book arrives from outside TypeScript through ADR 0062's
      // seam, so a row may name a key this build has never heard of. It renders the book's words and
      // never the key path.
      const content = contentFor(locale, messages);

      expect(
        content.bookText("Un nivel nou", "priceBook.hardware.invented.name"),
      ).toBe("Un nivel nou");
    },
  );
});

describe("relocating a row's words relocated no amount", () => {
  it("keeps every figure the book states out of both catalogues", () => {
    // ADR 0062 decision 1 from the catalogue side. Falsified against the book's own amounts rather
    // than against a pattern: every minor-unit figure the shipped book states, in the major-unit
    // spelling a customer would read and in the raw minor one, must appear in no `priceBook.*` leaf.
    const minorAmounts = [
      ...SAMPLE_PRICE_BOOK.hardware.tiers.flatMap((tier) => [
        tier.perHingeMinor,
        tier.perDrawerMinor,
        tier.perPushToOpenMinor,
      ]),
      ...SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.wholeKitchenMinor),
      SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover.perUnitMinor,
      SAMPLE_PRICE_BOOK.accessories.dishDryingRack.perUnitMinor,
    ].filter((amount) => amount !== 0);
    const spellings = minorAmounts.flatMap((amount) =>
      amount % 100 === 0
        ? [String(amount), String(amount / 100)]
        : [String(amount)],
    );

    expect(minorAmounts.length).toBeGreaterThan(0);
    for (const [locale, messages] of CATALOGUES) {
      const leaves = KEYED_TEXTS.map((text) =>
        text.key === undefined ? "" : (leafAt(messages, text.key) ?? ""),
      ).join("\n");
      for (const spelling of spellings) {
        expect(leaves, `${locale}:${spelling}`).not.toContain(spelling);
      }
    }
  });
});
