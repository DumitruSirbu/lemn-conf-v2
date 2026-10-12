// Reads source and stylesheet. Three claims that a rendered page cannot make for itself: the form's memory is mounted in
// one place, no way to the review is a prefetch or a step back, and the stylesheet draws what the markup names and
// hides the honeypot without taking it out of the layout. The behaviour each protects is proved in the dom tests; this
// keeps the structure they cannot see from changing quietly.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const CONTACT_SOURCE_DIRECTORY = join(import.meta.dirname, "../../src/contact");
const STYLESHEET = readFileSync(
  join(CONTACT_SOURCE_DIRECTORY, "contact.module.css"),
  "utf8",
);

function sourceFiles(): Record<string, string> {
  return Object.fromEntries(
    readdirSync(CONTACT_SOURCE_DIRECTORY)
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => [
        name,
        readFileSync(join(CONTACT_SOURCE_DIRECTORY, name), "utf8"),
      ]),
  );
}

function filesContaining(text: string): string[] {
  return Object.entries(sourceFiles())
    .filter(([, source]) => source.includes(text))
    .map(([name]) => name);
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function classesDefinedIn(css: string): Set<string> {
  return new Set(
    [...withoutComments(css).matchAll(/\.([A-Za-z_][\w-]*)/g)].flatMap(
      (match) => (match[1] === undefined ? [] : [match[1]]),
    ),
  );
}

function classesNamedBy(sources: Record<string, string>): string[] {
  return Object.values(sources).flatMap((source) =>
    [...source.matchAll(/\bstyles\.([A-Za-z_]\w*)/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  );
}

describe("the form's memory", () => {
  it("is mounted in one file, once, with one form drawn from it", () => {
    const components = filesContaining("useContactSubmission(").filter((name) =>
      name.endsWith(".tsx"),
    );

    expect(components).toEqual(["contact-screen.tsx"]);
    expect(
      sourceFiles()["contact-screen.tsx"]?.match(/useContactSubmission\(/g),
    ).toHaveLength(1);
    expect(
      sourceFiles()["contact-screen.tsx"]?.match(/<ContactForm\b/g),
    ).toHaveLength(1);
  });
});

describe("the way to the review", () => {
  it.each([
    "prefetch={true}",
    "router.back",
    "history.back",
    "history.go",
    "useRouter",
  ])("names %j in no file", (text) => {
    expect(filesContaining(text)).toEqual([]);
  });

  it("is one link component, which is never prefetched", () => {
    const prefetchSettings = Object.values(sourceFiles()).flatMap((source) =>
      [...source.matchAll(/prefetch=\{[^}]*\}/g)].map((match) => match[0]),
    );

    expect(prefetchSettings).toEqual(["prefetch={false}"]);
    expect(filesContaining("@/i18n/navigation")).toEqual(["review-link.tsx"]);
  });
});

describe("the stylesheet", () => {
  it("defines every class the markup names", () => {
    const defined = classesDefinedIn(STYLESHEET);
    const named = classesNamedBy(sourceFiles());

    expect(named.length).toBeGreaterThan(30);
    expect(named.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("caps the page in a centred 640 px column, as the review does", () => {
    expect(valuesFor(STYLESHEET, "screen", "max-width")).toEqual(["640px"]);
    expect(valuesFor(STYLESHEET, "screen", "margin-inline")).toEqual(["auto"]);
  });

  it("pins the bottom region at the viewport's foot, in the flow", () => {
    expect(valuesFor(STYLESHEET, "bottom", "position")).toEqual(["sticky"]);
    expect(valuesFor(STYLESHEET, "bottom", "bottom")).toEqual(["0"]);
  });

  it("hides the honeypot by clipping its box, never by taking it out of the layout", () => {
    const declared = (property: string) =>
      declarationsFor(STYLESHEET, "honeypot", property).map(
        ({ value }) => value,
      );

    expect(declared("display")).toEqual([]);
    expect(declared("visibility")).toEqual([]);
    expect(declared("position")).toEqual(["absolute"]);
    expect(declared("clip-path")).toEqual(["inset(50%)"]);
    expect(declared("width")).toEqual(["1px"]);
    expect(declared("height")).toEqual(["1px"]);
  });

  it("draws the frame's input and call-to-action boxes", () => {
    expect(valuesFor(STYLESHEET, "input", "height")).toEqual(["54px"]);
    expect(valuesFor(STYLESHEET, "cta", "min-height")).toEqual(["52px"]);
  });
});
