// Reads source and stylesheet. Three claims that a rendered page cannot make for itself: the form's memory is mounted in
// one place, no way to the review is a prefetch or a step back, and the stylesheet draws what the markup names and
// hides the honeypot without taking it out of the layout. The behaviour each protects is proved in the dom tests; this
// keeps the structure they cannot see from changing quietly.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const CONTACT_SOURCE_DIRECTORY = join(import.meta.dirname, "../../src/contact");
const RESULT_SOURCE_DIRECTORY = join(import.meta.dirname, "../../src/result");
const STYLESHEET = readFileSync(
  join(CONTACT_SOURCE_DIRECTORY, "contact.module.css"),
  "utf8",
);

function sourceFiles(): Record<string, string> {
  return Object.fromEntries(
    [CONTACT_SOURCE_DIRECTORY, RESULT_SOURCE_DIRECTORY].flatMap((directory) =>
      readdirSync(directory)
        .filter((name) => /\.tsx?$/.test(name))
        .map((name) => [name, readFileSync(join(directory, name), "utf8")]),
    ),
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

describe("timers and aborts", () => {
  it("has no abort on the request: its guard lasts until the fetch settles", () => {
    expect(filesContaining("AbortController")).toEqual([]);
    expect(filesContaining("AbortSignal")).toEqual([]);
    expect(filesContaining("signal:")).toEqual([]);
  });

  it("has one timer, the screen's, which ends a limited send's wait; the hook and the request have none", () => {
    expect(filesContaining("setTimeout(")).toEqual(["contact-outcome.tsx"]);
    expect(filesContaining("setInterval(")).toEqual([]);
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

  it("dims the body and the consent to half while a request is out, as frame 4C draws them", () => {
    expect(
      declarationsFor(STYLESHEET, "body", "opacity").map(({ value }) => value),
    ).toEqual(["0.5"]);
    expect(
      declarationsFor(STYLESHEET, "consent", "opacity").map(
        ({ value }) => value,
      ),
    ).toEqual(["0.5"]);
  });

  it("draws the frame's input and call-to-action boxes", () => {
    expect(valuesFor(STYLESHEET, "input", "height")).toEqual(["54px"]);
    expect(valuesFor(STYLESHEET, "cta", "min-height")).toEqual(["52px"]);
  });

  it("draws frame 5B's retry as the call to action's own button, whose height is a touch target", () => {
    expect(valuesFor(STYLESHEET, "failureRetry", "composes")).toEqual(["cta"]);
    expect(valuesFor(STYLESHEET, "failureRetry", "min-height")).toEqual([]);
    expect(valuesFor(STYLESHEET, "cta", "min-height")).toEqual(["52px"]);
    expect(valuesFor(STYLESHEET, "cta", "width")).toEqual(["100%"]);
  });

  it("draws 5B's disc by a mark of its own, so that no text carries it", () => {
    expect(
      declarationsFor(STYLESHEET, "failureDisc", "content").map(
        ({ value }) => value,
      ),
    ).toEqual(['"!"']);
  });
});

describe("the revision the page was loaded at", () => {
  function parse(source: string): ts.SourceFile {
    return ts.createSourceFile(
      "screen.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  }

  const screenFile = parse(
    readFileSync(join(CONTACT_SOURCE_DIRECTORY, "contact-screen.tsx"), "utf8"),
  );

  function attributesOfEvery(file: ts.SourceFile, tagName: string): string[][] {
    const found: string[][] = [];
    function visit(node: ts.Node): void {
      const isElement =
        ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node);
      if (isElement && node.tagName.getText(file) === tagName) {
        found.push(
          node.attributes.properties.map((attribute) =>
            attribute.getText(file).replace(/=[\s\S]*$/, ""),
          ),
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    return found;
  }

  function parameterTypeMembersOf(
    file: ts.SourceFile,
    functionName: string,
  ): string[] {
    let members: string[] = [];
    function visit(node: ts.Node): void {
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        const type = node.parameters[0]?.type;
        if (type !== undefined && ts.isTypeLiteralNode(type)) {
          members = type.members.map(
            (member) => member.name?.getText(file) ?? "",
          );
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    return members;
  }

  function membersOfInterface(file: ts.SourceFile, name: string): string[] {
    let names: string[] = [];
    ts.forEachChild(file, (node) => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
        names = node.members.map((member) => member.name?.getText(file) ?? "");
      }
    });
    return names;
  }

  it("is named for what it is on the screen's props, and the screen's props name no `revision`", () => {
    expect(membersOfInterface(screenFile, "ContactScreenProps")).toEqual([
      "designId",
      "loadedRevision",
      "isSendable",
      "sentReference",
    ]);
  });

  it("is handed to the form's page in no way: DesignContactPage is drawn with the design's id and nothing else", () => {
    expect(attributesOfEvery(screenFile, "DesignContactPage")).toEqual([
      ["designId"],
    ]);
    expect(parameterTypeMembersOf(screenFile, "DesignContactPage")).toEqual([
      "designId",
    ]);
  });

  it("sees a revision handed down: the same reads find an added attribute and an added member", () => {
    const mutant = parse(
      "function DesignContactPage({ designId }: { designId: string; loadedRevision: string }) { return null }\n" +
        "const a = <DesignContactPage designId={d} loadedRevision={r} />;",
    );

    expect(attributesOfEvery(mutant, "DesignContactPage")).toEqual([
      ["designId", "loadedRevision"],
    ]);
    expect(parameterTypeMembersOf(mutant, "DesignContactPage")).toEqual([
      "designId",
      "loadedRevision",
    ]);
  });
});
