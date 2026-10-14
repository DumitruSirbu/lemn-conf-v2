import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";
import ru from "@/messages/ru.json";

import {
  catalogueLeaves,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

/** Whole words, lower-cased. `va`, the future auxiliary, is deliberately absent: only the diacritic form `vă` is the
 *  formal pronoun. Verb endings are the advisory check's, below, because an ending also matches *pereți* (walls). */
/* eslint-disable no-restricted-syntax -- The deny-list names the formal Romanian words it forbids, so it must spell them; no catalogue leaf can supply a word the catalogue is forbidden to hold. */
const FORMAL_TOKENS: Readonly<Record<CatalogueLocale, readonly string[]>> = {
  ro: [
    "dumneavoastră",
    "dumneavoastra",
    "dvs",
    "vă",
    "ați",
    "reveniți",
    "încercați",
    "configurați",
    "generați",
    "contactați",
  ],
  ru: [
    "вы",
    "вас",
    "вам",
    "вами",
    "ваш",
    "ваша",
    "ваше",
    "ваши",
    "вашу",
    "вашей",
    "вашего",
    "вашему",
    "вашим",
    "вашем",
    "вашими",
    "ваших",
    "попробуйте",
    "скопируйте",
  ],
};

/** Formal second-person plural endings, the advisory net for a verb the whole-word list does not name. */
const FORMAL_SUFFIXES: Readonly<Record<CatalogueLocale, readonly string[]>> = {
  ro: ["ați", "iți", "eți"],
  ru: ["йте", "ьте", "ите", "ете"],
};

/** Words that end like a formal verb and are not one. */
const NOT_FORMAL_VERBS: Readonly<Record<CatalogueLocale, readonly string[]>> = {
  ro: ["pereți"],
  ru: [],
};
/* eslint-enable no-restricted-syntax */

/** Customer-voice leaves: the customer addresses the shop, so a plural *you* is correct there. */
const CUSTOMER_VOICE_KEYS: readonly string[] = [
  "submissionResult.whatsappMessageToShop",
  "webglUnavailable.contactLink",
];

const NOT_A_LETTER = /[^\p{L}\p{M}]+/u;

function wordsOf(text: string, locale: CatalogueLocale): readonly string[] {
  return text.toLocaleLowerCase(locale).split(NOT_A_LETTER);
}

function formalTokensIn(
  text: string,
  locale: CatalogueLocale,
): readonly string[] {
  const forbidden = new Set(FORMAL_TOKENS[locale]);
  return wordsOf(text, locale).filter((word) => forbidden.has(word));
}

function formalEndingsIn(
  text: string,
  locale: CatalogueLocale,
): readonly string[] {
  const allowed = new Set(NOT_FORMAL_VERBS[locale]);
  return wordsOf(text, locale).filter(
    (word) =>
      !allowed.has(word) &&
      FORMAL_SUFFIXES[locale].some((suffix) => word.endsWith(suffix)),
  );
}

type Detector = (text: string, locale: CatalogueLocale) => readonly string[];

interface FormalFinding {
  readonly key: string;
  readonly tokens: readonly string[];
}

function formalFindings(
  catalogue: Catalogue | Readonly<Record<string, unknown>>,
  locale: CatalogueLocale,
  exemptKeys: readonly string[],
  detect: Detector = formalTokensIn,
): readonly FormalFinding[] {
  return catalogueLeaves(catalogue)
    .filter(([key]) => !exemptKeys.includes(key))
    .map(([key, text]) => ({ key, tokens: detect(text, locale) }))
    .filter(({ tokens }) => tokens.length > 0);
}

const SHIPPED = [
  ["ro", ro],
  ["ru", ru],
] as const;

describe("the informal register of customer copy", () => {
  it.each(SHIPPED)(
    "leaves no formal word in the %s catalogue outside the customer-voice keys",
    (locale, messages) => {
      expect(formalFindings(messages, locale, CUSTOMER_VOICE_KEYS)).toEqual([]);
    },
  );

  it.each(SHIPPED)(
    "finds formal words in the %s catalogue only where the customer addresses the shop",
    (locale, messages) => {
      const findings = formalFindings(messages, locale, []);

      expect(findings.map(({ key }) => key)).toEqual([
        "webglUnavailable.contactLink",
      ]);
    },
  );

  it.each(SHIPPED)(
    "advisory: no word in the %s catalogue ends like a formal verb outside the customer-voice keys",
    (locale, messages) => {
      expect(
        formalFindings(messages, locale, CUSTOMER_VOICE_KEYS, formalEndingsIn),
      ).toEqual([]);
    },
  );

  it("names only keys that exist in both catalogues", () => {
    for (const [, messages] of SHIPPED) {
      const keys = catalogueLeaves(messages).map(([key]) => key);
      for (const exempt of CUSTOMER_VOICE_KEYS) {
        expect(keys, exempt).toContain(exempt);
      }
    }
  });

  it.each(["ro", "ru"] as const)(
    "lists %s tokens as single lower-case words, so each can match",
    (locale) => {
      for (const token of FORMAL_TOKENS[locale]) {
        expect(wordsOf(token, locale), token).toEqual([token]);
      }
    },
  );

  describe("the detector, fed both ways", () => {
    /* eslint-disable no-restricted-syntax -- The detector's inputs are the formal and the innocent Romanian words themselves (pereți, walls, is the word an ending pattern wrongly flags); a catalogue leaf cannot be used to prove the detector sees words the catalogue must not hold. */
    it("flags a formal Russian imperative put back into a leaf", () => {
      const sabotaged = { share: { error: "Не удалось. Попробуйте ещё раз." } };

      expect(formalFindings(sabotaged, "ru", CUSTOMER_VOICE_KEYS)).toEqual([
        { key: "share.error", tokens: ["попробуйте"] },
      ]);
    });

    it("flags a formal Romanian pronoun and verb form", () => {
      const sabotaged = {
        contact: { note: "Vă rugăm, ați încercat să reveniți?" },
      };

      expect(formalFindings(sabotaged, "ro", CUSTOMER_VOICE_KEYS)).toEqual([
        { key: "contact.note", tokens: ["vă", "ați", "reveniți"] },
      ]);
    });

    it("stays quiet on the Romanian word for walls, which ends like a formal verb", () => {
      const innocent = { room: { detail: "Doi pereți scurți, unul lung." } };

      expect(formalFindings(innocent, "ro", [])).toEqual([]);
    });

    it("stays quiet on the future auxiliary that differs from the formal pronoun by a diacritic", () => {
      const innocent = { share: { warning: "Linkul vechi va fi dezactivat." } };

      expect(formalFindings(innocent, "ro", [])).toEqual([]);
    });

    it("the ending check flags a formal verb the word list does not name", () => {
      const sabotaged = {
        contact: { note: "Verificați datele", other: "Нажмите кнопку" },
      };

      expect(
        formalFindings(sabotaged, "ro", [], formalEndingsIn).map(
          ({ tokens }) => tokens,
        ),
      ).toEqual([["verificați"]]);
      expect(
        formalFindings(sabotaged, "ru", [], formalEndingsIn).map(
          ({ tokens }) => tokens,
        ),
      ).toEqual([["нажмите"]]);
    });

    it("the ending check stays quiet on the allow-listed word for walls", () => {
      const innocent = { room: { detail: "Doi pereți scurți, unul lung." } };

      expect(formalFindings(innocent, "ro", [], formalEndingsIn)).toEqual([]);
    });
    /* eslint-enable no-restricted-syntax */

    it("stays quiet on a Russian word that merely contains a formal pronoun", () => {
      const innocent = { room: { detail: "Вышли, нашли, повторили." } };

      expect(formalFindings(innocent, "ru", [])).toEqual([]);
    });

    it("ignores a formal word in an exempt key and flags the same text in any other", () => {
      const catalogue = {
        webglUnavailable: { contactLink: "Хочу, чтобы вы со мной связались" },
        share: { error: "Хочу, чтобы вы со мной связались" },
      };

      expect(
        formalFindings(catalogue, "ru", CUSTOMER_VOICE_KEYS).map(
          ({ key }) => key,
        ),
      ).toEqual(["share.error"]);
    });
  });
});
