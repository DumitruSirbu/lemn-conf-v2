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

import {
  CATALOGUES,
  catalogueLeaves,
  contentFor,
  leafAt,
  type CatalogueLocale,
} from "../support/catalogues";
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

/**
 * **A keyed price-book text may not restate an amount, a delta or an earning rule** — ADR 0106
 * Amendment A decision 5, and the sweep that amendment says is still owed.
 *
 * Three shipped leaves once did: *"…inclus în preț"* restated `wholeKitchenMinor: 0` in words, and
 * two *"Inclus…"* clauses restated ADR 0070 decision 4's earning rule. The owner trimmed all three
 * on 2026-09-10.
 *
 * **Why the digit sweep above cannot be widened into this one, recorded so the wrong fix is not
 * reached for again.** That sweep filters `amount !== 0` and matches digits. Dropping the filter
 * looks like the fix — zero is exactly what these leaves asserted — and is not: `String(0)` occurs
 * inside every four-digit price, so every leaf beside a `9 000` would fail vacuously. The filter is
 * correct. Prose asserting inclusion carries **no digit at all**, so no widening of a digit search
 * reaches it. What was missing is a different sweep, and this is it.
 *
 * **It is a word check and therefore needs a policy**, which is what makes it an enforcement gate
 * rather than a tighter assertion: a legitimate description may one day want one of these words, and
 * the answer then is an entry below with the reason it is not a second copy of a fact.
 */
const INCLUSION_WORDS: Readonly<Record<CatalogueLocale, RegExp>> = {
  // The `inclus` family, widened one step past Amendment A's three spellings to reach `inclusiv` and
  // `incluzând` as well — the same claim in a different part of speech. `include` is outside it on
  // purpose: *"Nu include transport"* is an exclusion, and the leaf that says so is not a book text.
  ro: /\binclu[sz]\w*/iu,
  // No `\b` before Cyrillic: JavaScript's word boundary is ASCII-only, so it never matches in front
  // of `в`. Measured, not assumed — the anchored spelling silently matches nothing.
  ru: /(включ|входит|входят|входящ)/iu,
};

/** A leaf ruled to carry an inclusion word anyway, with the reason it is not a restatement.
 *
 *  **Empty, and empty is the correct state**: the owner trimmed all three claims before this sweep
 *  existed. The path is exercised against a fixture below rather than left to be discovered by
 *  whoever first needs it. */
interface RuledInclusionClaim {
  readonly key: string;
  readonly locale: CatalogueLocale;
  readonly reason: string;
}

const RULED_TO_STATE_INCLUSION: readonly RuledInclusionClaim[] = [];

/** Which of a catalogue's leaves state inclusion, minus the ones ruled to. One function, so the
 *  shipped sweep and the fixture that proves the exemption path are the same code. */
function unruledInclusionClaimsIn(
  leaves: readonly (readonly [string, string])[],
  locale: CatalogueLocale,
  ruled: readonly RuledInclusionClaim[],
): readonly string[] {
  return leaves
    .filter(([, text]) => INCLUSION_WORDS[locale].test(text))
    .map(([key]) => key)
    .filter(
      (key) =>
        !ruled.some((entry) => entry.key === key && entry.locale === locale),
    );
}

function priceBookLeavesOf(
  messages: (typeof CATALOGUES)[number][1],
): readonly (readonly [string, string])[] {
  return catalogueLeaves(messages.priceBook, "priceBook");
}

describe("a book text states no amount it is printed beside", () => {
  it.each(CATALOGUES)(
    "claims no inclusion in any %s book leaf",
    (locale, messages) => {
      const leaves = priceBookLeavesOf(messages);

      // Non-vacuity: 16 leaves ship, and a walk that found none would pass this silently.
      expect(leaves.length).toBeGreaterThan(10);
      expect(
        unruledInclusionClaimsIn(leaves, locale, RULED_TO_STATE_INCLUSION),
      ).toEqual([]);
    },
  );

  it("recognises each of the three claims the owner trimmed", () => {
    // The positive control, and it is what stops the sweep above passing because the pattern matches
    // nothing. These are the sentences ADR 0106 Amendment A tabulates, quoted as detector inputs.
    /* eslint-disable no-restricted-syntax -- 6B-j allow-list: the three trimmed claims, quoted as inputs to the detector rather than as copy — no leaf holds them any more, so nothing can supply them. */
    const trimmed = [
      "Materialul standard al bucătăriei, inclus în preț.",
      "Inclusă întotdeauna, în corpul spălătorului.",
      "Inclus unde există un corp suspendat.",
    ];
    /* eslint-enable no-restricted-syntax */

    for (const claim of trimmed)
      expect(INCLUSION_WORDS.ro.test(claim), claim).toBe(true);
    // A description that merely describes must still pass, or the sweep is a ban on the letter i.
    /* eslint-disable no-restricted-syntax -- 6B-j allow-list: the shipped leaves quoted as negative detector inputs. Reading them through the catalogue would make this pair agree with whatever the catalogue currently says, which is the tautology the control exists to avoid. */
    for (const kept of [
      "Materialul standard al bucătăriei.",
      "Montat în dulapul suspendat deasupra chiuvetei.",
    ])
      expect(INCLUSION_WORDS.ro.test(kept), kept).toBe(false);
    /* eslint-enable no-restricted-syntax */
  });

  it("recognises the same claim in Russian, where an ASCII word boundary does not", () => {
    // Detector fixtures, not owner wording — the strings below are written to exercise the pattern
    // and are not lifted from `ru.json`, whose 235 leaves the owner approved as drafted when Gate O2
    // closed on 2026-09-11 (`docs/STATUS.md`). What is asserted here is that the pattern reaches
    // Cyrillic at all.
    for (const claim of ["включено в цену", "Входит всегда", "включён в цену"])
      expect(INCLUSION_WORDS.ru.test(claim), claim).toBe(true);
    for (const kept of ["Стандартный материал кухни."])
      expect(INCLUSION_WORDS.ru.test(kept), kept).toBe(false);
  });

  it("lets a ruled leaf through, and only the leaf and locale it names", () => {
    // The exemption path, exercised against a fixture rather than left untried until the day
    // somebody needs it — an escape hatch nobody has opened is an escape hatch nobody has tested.
    const leaves = [
      ["priceBook.material.melamine.description", "Cant ABS inclusiv."],
      ["priceBook.material.veneer.description", "Lac mat inclusiv."],
    ] as const;
    const ruled: readonly RuledInclusionClaim[] = [
      {
        key: "priceBook.material.melamine.description",
        locale: "ro",
        reason: "fixture: names a component, not the row's own amount",
      },
    ];

    expect(unruledInclusionClaimsIn(leaves, "ro", ruled)).toEqual([
      "priceBook.material.veneer.description",
    ]);
    // The same entry does not travel to the other locale: a Russian leaf keeps its own ruling.
    expect(unruledInclusionClaimsIn(leaves, "ru", ruled)).toEqual([]);
    expect(unruledInclusionClaimsIn(leaves, "ro", [])).toEqual(
      leaves.map(([key]) => key),
    );
  });

  it("records a reason for every exemption it holds", () => {
    // The mitigation ADR 0106 Amendment A asks for, asserted rather than asked for: an entry with no
    // sentence beside it is indistinguishable from a suppression.
    for (const entry of RULED_TO_STATE_INCLUSION) {
      expect(entry.reason.length, entry.key).toBeGreaterThan(20);
      expect(
        leafAt(CATALOGUES[0][1], entry.key),
        `${entry.key} names no leaf`,
      ).toBeDefined();
    }
  });
});
