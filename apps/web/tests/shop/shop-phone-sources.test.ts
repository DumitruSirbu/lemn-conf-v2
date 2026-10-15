// Reads the source tree and both catalogues: the shop's number is typed once, and everything that dials or messages it
// is built from that one place.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { catalogueLeaves, CATALOGUES } from "../support/catalogues";
import { filesUnder } from "../support/files-under";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");

/** Each scheme's holders: the module that derives the shop's addresses holds both, and the one anchor that opens
 *  WhatsApp holds its own. */
const SCHEMES = {
  "tel:": { pattern: /\btel:/, holders: ["shop/shop-phone.ts"] },
  "wa.me/": {
    pattern: /\bwa\.me\//,
    holders: ["done/send-on-whatsapp.tsx", "shop/shop-phone.ts"],
  },
} as const;

/** A run of digits long enough to be a phone number; `\p{Nd}` so a number in any script is caught. */
const PHONE_LENGTH_DIGIT_RUN = /\p{Nd}{7,}/u;

const TEXT_FILE = /\.(?:tsx?|css|json)$/;

function relativeToSource(path: string): string {
  return path.slice(SOURCE_ROOT.length + 1).replaceAll("\\", "/");
}

function holdersOf(
  scheme: keyof typeof SCHEMES,
  files: ReadonlyMap<string, string>,
): readonly string[] {
  return [...files]
    .filter(([, text]) => SCHEMES[scheme].pattern.test(text))
    .map(([path]) => path)
    .sort();
}

function leavesWithPhoneLengthDigitRun(
  tree: Readonly<Record<string, unknown>>,
): readonly string[] {
  return catalogueLeaves(tree)
    .filter(([, text]) => PHONE_LENGTH_DIGIT_RUN.test(text))
    .map(([key]) => key);
}

describe("where the shop's address schemes are written (criterion 1)", () => {
  const SCHEME_NAMES = Object.keys(SCHEMES) as (keyof typeof SCHEMES)[];

  it.each(SCHEME_NAMES)("names `%s` only in its own holders", (scheme) => {
    const files = new Map(
      filesUnder(SOURCE_ROOT, TEXT_FILE).map((path) => [
        relativeToSource(path),
        readFileSync(path, "utf8"),
      ]),
    );

    expect(files.size).toBeGreaterThan(100);
    expect(holdersOf(scheme, files)).toEqual(SCHEMES[scheme].holders);
  });

  it("sees a scheme written into any other file, and a file that merely names a telephone", () => {
    const files = new Map([
      ["done/send-on-whatsapp.tsx", 'const a = "https://wa.me/?text=";'],
      ["shop/shop-phone.ts", "return `tel:${e164}`; // https://wa.me/"],
      ["contact/other.tsx", '<a href="tel:+37322123456">'],
      ["contact/chat.tsx", 'const b = "https://wa.me/37322123456";'],
      ["contact/telephone.tsx", "const telephone = 1; // hotel: a word"],
    ]);

    expect(holdersOf("tel:", files)).toEqual([
      "contact/other.tsx",
      "shop/shop-phone.ts",
    ]);
    expect(holdersOf("wa.me/", files)).toEqual([
      "contact/chat.tsx",
      "done/send-on-whatsapp.tsx",
      "shop/shop-phone.ts",
    ]);
  });
});

describe("no message leaf holds a phone number", () => {
  it.each(CATALOGUES)(
    "holds no run of seven or more digits in the %s catalogue",
    (_locale, messages) => {
      expect(leavesWithPhoneLengthDigitRun(messages)).toEqual([]);
    },
  );

  it("sees a number written into a leaf, whatever its script, and not a spaced figure or a placeholder", () => {
    const tree = {
      typed: "Call 37322123456.",
      arabicIndic: "Call ٣٧٣٢٢١٢٣٤٥٦.",
      spaced: "1 000 000 MDL",
      shortRun: "Request 123456",
      placeholder: "Call us on {phone}.",
    };

    expect(leavesWithPhoneLengthDigitRun(tree)).toEqual([
      "typed",
      "arabicIndic",
    ]);
  });
});
