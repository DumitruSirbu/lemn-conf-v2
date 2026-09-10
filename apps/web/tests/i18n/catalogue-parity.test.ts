import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";
import ru from "@/messages/ru.json";

import { catalogueLeaves } from "../support/catalogues";

function signature(
  elements: readonly MessageFormatElement[],
  context = "root",
): readonly string[] {
  return elements.flatMap((element) => {
    if (element.type === TYPE.literal) return [];
    if (element.type === TYPE.pound) return [`${context}:pound`];
    if (element.type === TYPE.argument)
      return [`${context}:argument:${element.value}`];
    if (element.type === TYPE.number) {
      return [
        `${context}:number:${element.value}:${JSON.stringify(element.style ?? null)}`,
      ];
    }
    if (element.type === TYPE.date) {
      return [
        `${context}:date:${element.value}:${JSON.stringify(element.style ?? null)}`,
      ];
    }
    if (element.type === TYPE.time) {
      return [
        `${context}:time:${element.value}:${JSON.stringify(element.style ?? null)}`,
      ];
    }
    if (element.type === TYPE.tag) {
      return [
        `${context}:tag:${element.value}`,
        ...signature(element.children, `${context}/tag:${element.value}`),
      ];
    }

    const kind = element.type === TYPE.select ? "select" : "plural";
    const branches: string[] = Object.keys(element.options).sort();
    if (!branches.includes("other"))
      throw new Error(`${kind}:${element.value} has no other branch`);
    return [
      `${context}:${kind}:${element.value}:${element.type === TYPE.plural ? `${String(element.pluralType)}:${String(element.offset)}` : "-"}:${branches.join(",")}`,
      ...branches.flatMap((branch) => {
        const option = element.options[branch];
        if (option === undefined)
          throw new Error(`Missing parsed branch ${branch}`);
        return signature(
          option.value,
          `${context}/${kind}:${element.value}/${branch}`,
        );
      }),
    ];
  });
}

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
});
