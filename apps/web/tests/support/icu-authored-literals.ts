import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

/** Returns only authored ICU text. Runtime arguments and pound substitutions are not literals. */
export function authoredLiterals(message: string): readonly string[] {
  return literalsFromElements(parse(message));
}

/** Recursively collects authored literals from every message below a catalogue namespace. */
export function authoredLiteralsIn(section: unknown): readonly string[] {
  if (typeof section === "string") return authoredLiterals(section);
  if (typeof section !== "object" || section === null) return [];
  return Object.values(section).flatMap(authoredLiteralsIn);
}

function literalsFromElements(
  elements: readonly MessageFormatElement[],
): readonly string[] {
  return elements.flatMap((element) => {
    if (element.type === TYPE.literal) return [element.value];
    if (element.type === TYPE.tag)
      return literalsFromElements(element.children);
    if (element.type === TYPE.select || element.type === TYPE.plural) {
      return Object.values(element.options).flatMap((option) =>
        literalsFromElements(option.value),
      );
    }
    return [];
  });
}
