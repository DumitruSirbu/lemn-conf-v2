// **Wave 6B-g's seam: the currency is joined to the amount by a catalogue leaf, and the digits are
// not.**
//
// ADR 0095 Amendment C. The join used to be `` `${amount} ${PRICE_BOOK_CURRENCY}` `` in
// `starting-price.ts`, which is a word order and a currency name written into TypeScript; `Intl` was
// rejected as the replacement because it *changes* the shipped figure — `"143.000"` under `ro`,
// `"L"` under `ro-MD`, U+00A0 under `ru`.
//
// **Every expectation below is read out of `ro.json` / `ru.json` by `requireLeafAt`, never through
// `resolveContent`.** This milestone has twice shipped a wiring test that mirrored production's own
// call — proving the resolver worked while nothing proved it was called — and reverting the call
// site left thousands of tests green. The half that catches that specifically — a catalogue whose
// leaf spells the join differently must change the rendered figure — is the note at the foot of
// this file.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type PricedDesign,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

import { describePriceBar } from "@/price/price-bar-model";

import {
  CATALOGUES,
  contentFor,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";
import { RULED_TO_CARRY_THE_CURRENCY } from "../support/ruled-price-copy";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

/** The mockups' own figure, and the one this file pins byte for byte. The seeded book's real total
 *  is drafted and moves with the price book, so it is asserted for *shape* below and never pinned —
 *  a pin on a drafted amount fails for a reason that has nothing to do with this seam. */
const MOCKUP_TOTAL_MINOR = 4_300_000;
const MOCKUP_GROUPED_AMOUNT = "43 000";

/** Each `Intl` constructor that resolves the process's default locale when it is given none. */
const LOCALE_AWARE_INTL_CONSTRUCTORS = [
  "NumberFormat",
  "DateTimeFormat",
  "PluralRules",
  "Collator",
] as const;

function priceSeededKitchen(): PricedDesign {
  const result = priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
  if (!result.ok) throw new Error("the seeded kitchen did not price");
  return result.priced;
}

const SEEDED = priceSeededKitchen();

function seededPricing(): PricingResult {
  return { ok: true, priced: SEEDED };
}

/** The seeded kitchen's own document with one field replaced, so the surface under test is the real
 *  one and the figure is the mockups' rather than a drafted book's. */
function pricingAt(totalMinor: number): PricingResult {
  return { ok: true, priced: { ...SEEDED, totalMinor } };
}

function amountTextIn(
  locale: CatalogueLocale,
  messages: Catalogue,
  pricing: PricingResult,
): string {
  const bar = describePriceBar({
    content: contentFor(locale, messages),
    pricing,
  });
  if (bar.kind !== "priced")
    throw new Error(`the ${locale} bar rendered ${bar.kind}`);
  return bar.figure.amountText;
}

describe("the amount and its currency are joined by a catalogue leaf", () => {
  it.each(CATALOGUES)(
    "renders %s's figure as that locale's authored join, filled with the grouped amount",
    (locale, messages) => {
      // The expectation is the authored template with `{amount}` substituted by hand. A resolver
      // defect that dropped the currency, or an `Intl` currency formatter that wrote `L`, fails
      // here; an assertion built by calling the resolver again could not.
      const authored = requireLeafAt(messages, RULED_TO_CARRY_THE_CURRENCY);

      expect(authored).toContain("{amount}");
      expect(
        amountTextIn(locale, messages, pricingAt(MOCKUP_TOTAL_MINOR)),
      ).toBe(authored.replace("{amount}", MOCKUP_GROUPED_AMOUNT));
    },
  );

  it("groups with U+0020 in both locales, asserted by codepoint", () => {
    // The risk the wave's own ruling names: a later "modernisation" into `Intl.NumberFormat` groups
    // Russian with U+00A0 and every price in the product changes by one character, invisibly. A
    // literal `" "` in an expectation is satisfied by a non-breaking space in a diff nobody reads;
    // a codepoint is not.
    for (const [locale, messages] of CATALOGUES) {
      const amountText = amountTextIn(
        locale,
        messages,
        pricingAt(MOCKUP_TOTAL_MINOR),
      );
      const separators = amountText.match(/\s/gu) ?? [];

      expect(separators.length, locale).toBeGreaterThan(0);
      for (const separator of separators) {
        expect(separator.codePointAt(0), `${locale}: ${amountText}`).toBe(0x20);
      }
    }
  });

  it("renders the seeded kitchen identically in both locales, digits and all", () => {
    // The currency code is the same word in both catalogues today, so this is currently a claim
    // about the digits: nothing between a priced document and a rendered figure consults a locale.
    // It is the assertion that fails the day somebody makes the *number* locale-dependent, which is
    // exactly what the ruling forbids and what the leaf deliberately cannot express.
    const [romanian, russian] = CATALOGUES;
    const pricing = seededPricing();

    expect(amountTextIn("ru", russian[1], pricing)).toBe(
      amountTextIn("ro", romanian[1], pricing),
    );
    expect(amountTextIn("ro", romanian[1], pricing)).toMatch(
      /^\d{1,3}( \d{3})* MDL$/,
    );
  });

  it("changes no minor-unit value when the locale changes", () => {
    // The other half, one layer down: a figure is a projection of a priced document, and the
    // document is priced without a locale ever being offered to it. Priced once per locale arm
    // rather than once and read twice — a shared document would agree with itself.
    const minorUnitsPerLocale = CATALOGUES.map(([locale, messages]) => {
      const priced = priceSeededKitchen();
      expect(
        describePriceBar({
          content: contentFor(locale, messages),
          pricing: { ok: true, priced },
        }).kind,
      ).toBe("priced");
      return {
        totalMinor: priced.totalMinor,
        lines: priced.lines.map((line) => [line.lineId, line.amountMinor]),
      };
    });

    const [romanian, russian] = minorUnitsPerLocale;
    expect(russian).toEqual(romanian);
    expect(romanian?.lines.length).toBeGreaterThan(0);
  });

  it("consults no locale while pricing, so there is none for a minor-unit value to follow", () => {
    // The case above prices twice in one process, where the ambient locale is the same both times and
    // two runs of anything agree. What it cannot see is pricing that asks the platform which locale it
    // is in. Every way `Intl` answers that question is watched here, and pricing must use none.
    const localeReads = LOCALE_AWARE_INTL_CONSTRUCTORS.map((name) =>
      vi.spyOn(Intl, name),
    );
    const numberToLocaleString = vi.spyOn(Number.prototype, "toLocaleString");

    const priced = priceSeededKitchen();
    const watched = [...localeReads, numberToLocaleString];
    const callsPerLocaleRead = watched.map((spy) => spy.mock.calls.length);
    for (const spy of watched) spy.mockRestore();

    expect(priced.lines.length).toBeGreaterThan(0);
    expect(callsPerLocaleRead).toEqual([0, 0, 0, 0, 0]);
  });
});

// **The non-vacuity arm lives in `qa-6bg-money-seam.adversarial.test.ts`, not here.** Every
// assertion above is satisfied by a formatter that ignored the leaf and appended a hard-coded
// `" MDL"`, because both shipped catalogues spell the join the same way. This file used to close
// that with one case moving the currency to the front of the figure; that wave's adversarial pass
// wrote a stronger form of the same claim — the currency's *word*, its *count* and its *absence*,
// against `catalogueJoining` — which subsumes the position-only case, so the weaker one was deleted
// rather than kept beside it.
