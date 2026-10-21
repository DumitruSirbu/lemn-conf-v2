// What the staff kitchen page says and where it says it from (wave L3-U3). The catalogue's parity and the Romanian lock are
// the project's own gates; these hold what they do not: every word of the `staffKitchen` namespace is used and every word
// the page asks for exists, the Russian is Russian and not the Romanian again, no message is spoilt by a bare quote, and the
// five source files hold no phrase of any language, Latin ones included (the owner's rule is that a word a person reads comes
// from the catalogue).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TYPE, parse } from "@formatjs/icu-messageformat-parser";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const COPY_NAMESPACE = "staffKitchen";
const SOURCE_FILES = [
  "staff/staff-kitchen-page.tsx",
  "staff/staff-kitchen-view.tsx",
  "staff/use-staff-kitchen.ts",
  "app/[locale]/staff/kitchens/[id]/page.tsx",
] as const;
const CYRILLIC = /\p{Script=Cyrillic}/u;
/** Words that are the same in both languages, or are names: they need no Cyrillic. */
const WORDS_THE_SAME_IN_BOTH = new Set(["profileEmail"]);
/** What a technical token never is: it holds no space (a test id, a CSS name, a header, a status word) and does not begin
 *  with a capital, a mark of a sentence. The two exceptions are a time zone's name and an HTTP method, and the symbol that
 *  joins two wall lengths. */
const TECHNICAL_EXCEPTIONS = new Set([
  "Europe/Chisinau",
  "GET",
  " \u00D7 ",
  "use client",
]);
const LOOKS_WRITTEN_FOR_A_PERSON = /\s|^\p{Lu}\p{Ll}/u;

function leavesOf(namespace: Record<string, unknown>): [string, string][] {
  return Object.entries(namespace).map(([key, value]) => {
    if (typeof value !== "string") throw new Error(`${key} is not a leaf`);
    return [key, value];
  });
}

const RO = leavesOf(roMessages[COPY_NAMESPACE]);
const RU = leavesOf(ruMessages[COPY_NAMESPACE]);

function sourceOf(relative: string): string {
  return readFileSync(join(SOURCE_ROOT, relative), "utf8");
}

function argumentsOf(message: string): string[] {
  const names: string[] = [];
  const visit = (nodes: ReturnType<typeof parse>): void => {
    for (const node of nodes) {
      if (node.type === TYPE.argument) names.push(node.value);
    }
  };
  visit(parse(message));
  return names.sort();
}

describe("the words of the namespace and the words the page asks for", () => {
  const resolver = sourceOf("i18n/content.ts");
  const asked = new Set(
    [
      ...resolver.matchAll(
        new RegExp(`"${COPY_NAMESPACE}\\.([A-Za-z0-9]+)"`, "g"),
      ),
    ].map((match) => match[1] ?? ""),
  );

  it("has every word the resolver asks for in both catalogues", () => {
    const roKeys = new Set(RO.map(([key]) => key));
    const ruKeys = new Set(RU.map(([key]) => key));

    expect([...asked].filter((key) => !roKeys.has(key))).toEqual([]);
    expect([...asked].filter((key) => !ruKeys.has(key))).toEqual([]);
  });

  it("asks for every word the catalogues hold, so none is left to rot unread", () => {
    expect(RO.map(([key]) => key).filter((key) => !asked.has(key))).toEqual([]);
  });
});

describe("each message", () => {
  it.each(RO.map(([key], index) => [key, index] as const))(
    "%s keeps the same arguments in both languages, written as ICU reads them",
    (key, index) => {
      const romanian = RO[index]?.[1] ?? "";
      const russian = RU.find(([ruKey]) => ruKey === key)?.[1] ?? "";

      expect(argumentsOf(russian), key).toEqual(argumentsOf(romanian));
    },
  );

  it("holds no straight apostrophe or quote that message syntax would read as an escape", () => {
    for (const [key, message] of [...RO, ...RU]) {
      expect(message.includes("'"), key).toBe(false);
    }
  });

  it("is written in its own language: Russian holds Cyrillic and Romanian holds none", () => {
    for (const [key, message] of RO) {
      expect(CYRILLIC.test(message), `ro ${key}`).toBe(false);
    }
    for (const [key, message] of RU) {
      if (WORDS_THE_SAME_IN_BOTH.has(key)) continue;
      expect(CYRILLIC.test(message), `ru ${key}`).toBe(true);
    }
  });

  it("is not the Romanian text again in the Russian catalogue", () => {
    for (const [key, message] of RU) {
      if (WORDS_THE_SAME_IN_BOTH.has(key)) continue;
      expect(message, key).not.toBe(RO.find(([roKey]) => roKey === key)?.[1]);
    }
  });

  it("has no space at either end, no doubled space, no line break and no invisible character", () => {
    for (const [key, message] of [...RO, ...RU]) {
      expect(message, key).toBe(message.trim());
      expect(message.includes("  "), key).toBe(false);
      expect(/[\n\r\t]/.test(message), key).toBe(false);
      expect(/\p{Cf}/u.test(message), key).toBe(false);
    }
  });

  it("ends its sentences with the same mark in both languages", () => {
    for (const [key, message] of RO) {
      const russian = RU.find(([ruKey]) => ruKey === key)?.[1] ?? "";
      const last = (text: string) => text.slice(-1);
      const isMark = (character: string) => /[.!?…]/.test(character);

      expect(isMark(last(russian)), key).toBe(isMark(last(message)));
    }
  });
});

describe.each(SOURCE_FILES)("%s", (relative) => {
  const file = ts.createSourceFile(
    relative,
    sourceOf(relative),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function literals(): { text: string; kind: string }[] {
    const found: { text: string; kind: string }[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) {
        found.push({ text: node.text, kind: "string" });
      } else if (ts.isTemplateExpression(node)) {
        for (const piece of [
          node.head.text,
          ...node.templateSpans.map((span) => span.literal.text),
        ]) {
          if (piece.trim() !== "")
            found.push({ text: piece, kind: "template" });
        }
      } else if (ts.isJsxText(node) && node.text.trim() !== "") {
        found.push({ text: node.text.trim(), kind: "jsx" });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  }

  it("writes no literal that reads as words for a person: a word a person reads comes from the catalogue", () => {
    const phrases = literals()
      .map(({ text }) => text)
      .filter((text) => LOOKS_WRITTEN_FOR_A_PERSON.test(text))
      .filter((text) => !TECHNICAL_EXCEPTIONS.has(text));

    expect(phrases).toEqual([]);
  });

  it("writes no sentence mark after a word in a literal, so no sentence is built from pieces", () => {
    const pieced = literals()
      .map(({ text }) => text)
      .filter(
        (text) => /\p{L}[.!?…:]\s*$/u.test(text) && !text.startsWith("@/"),
      );

    expect(pieced).toEqual([]);
  });

  it("asks the catalogue by a name the namespace holds, never by a name built at run time", () => {
    const calls = [
      ...sourceOf(relative).matchAll(/translate\(\s*([^"'`\s][^,)]*)/g),
    ];

    expect(calls.map((call) => call[0])).toEqual([]);
  });
});
