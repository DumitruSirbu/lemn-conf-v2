import { parse } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";
import ru from "@/messages/ru.json";

import { catalogueLeaves, CATALOGUES } from "../support/catalogues";
import {
  cldrPluralCategories,
  isExactValueSwitch,
  keywordBranchesOf,
  pluralNodesOf,
  PLURAL_NODES_PER_CATALOGUE,
  signature,
} from "../support/icu-signature";

const EXPECTED_POUND_DIVERGENCES: Readonly<
  Record<
    string,
    {
      readonly romanianOnly: readonly string[];
      readonly russianOnly: readonly string[];
    }
  >
> = {
  "globalSettings.appliesTo": {
    romanianOnly: [],
    russianOnly: ["root/plural:bodyCount/one:pound"],
  },
};

function multisetDifference(
  source: readonly string[],
  against: readonly string[],
): readonly string[] {
  const unmatched = [...against];
  return source.filter((node) => {
    const matchIndex = unmatched.indexOf(node);
    if (matchIndex === -1) return true;
    unmatched.splice(matchIndex, 1);
    return false;
  });
}

describe("translation catalogue structural parity", () => {
  const romanian = catalogueLeaves(ro);
  const russian = catalogueLeaves(ru);

  it("has the same complete ordered key set and no blank leaves", () => {
    expect(russian.map(([key]) => key)).toEqual(romanian.map(([key]) => key));
    for (const [key, value] of [...romanian, ...russian]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("has identical ICU argument types and select/plural branches", () => {
    for (let index = 0; index < romanian.length; index += 1) {
      const roEntry = romanian[index];
      const ruEntry = russian[index];
      if (roEntry === undefined || ruEntry === undefined) {
        throw new Error(`Missing catalogue entry at index ${String(index)}`);
      }
      const [key, roMessage] = roEntry;
      const [, ruMessage] = ruEntry;
      const romanianSignature = [...signature(parse(roMessage))].sort();
      const russianSignature = [...signature(parse(ruMessage))].sort();
      expect(
        {
          romanianOnly: multisetDifference(romanianSignature, russianSignature),
          russianOnly: multisetDifference(russianSignature, romanianSignature),
        },
        key,
      ).toEqual(
        EXPECTED_POUND_DIVERGENCES[key] ?? {
          romanianOnly: [],
          russianOnly: [],
        },
      );
    }
    expect(Object.keys(EXPECTED_POUND_DIVERGENCES)).toEqual(
      romanian
        .map(([key]) => key)
        .filter((key) => Object.hasOwn(EXPECTED_POUND_DIVERGENCES, key)),
    );
  });

  // Gate O2's structural half, and the one claim the leaf-against-leaf comparison above cannot make:
  // a category set is right or wrong against its **own** locale's CLDR rules, not against the source
  // language's. Russian resolves 5 to `many`; a Russian leaf with no `many` renders through `other`,
  // which in Russian is the fractional form — right for `5 шкафов` only by coincidence.
  it.each(CATALOGUES)(
    "declares exactly %s's own CLDR plural categories on every plural leaf",
    (locale, messages) => {
      let pluralNodesSeen = 0;
      for (const [key, message] of catalogueLeaves(messages)) {
        for (const node of pluralNodesOf(parse(message))) {
          const branches = Object.keys(node.options).sort();
          if (isExactValueSwitch(branches)) continue;
          pluralNodesSeen += 1;
          expect(keywordBranchesOf(branches), `${locale} ${key}`).toEqual(
            cldrPluralCategories(locale, node.pluralType),
          );
        }
      }
      expect(pluralNodesSeen).toBe(PLURAL_NODES_PER_CATALOGUE);
    },
  );
});
