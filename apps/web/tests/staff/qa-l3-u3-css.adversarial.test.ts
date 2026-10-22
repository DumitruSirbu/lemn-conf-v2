// What the stylesheet of the staff kitchen page declares, read as text (wave L3-U3). A style cannot be run here, but a promise
// the page makes with one can be held to its text: every box a finger or a pointer presses is at least 44 px tall and has a
// focus ring, every box that prints a string somebody typed breaks it anywhere and isolates it from its neighbours' reading
// order, and every cell of the grid can shrink below its content. The classes are found from the components, not listed here
// by hand, so a new button without its size is caught as well.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const COMPONENTS = [
  "staff/staff-kitchen-page.tsx",
  "staff/staff-kitchen-states.tsx",
  "staff/staff-kitchen-request.tsx",
  "staff/staff-kitchen-client.tsx",
  "staff/staff-kitchen-card.tsx",
  "staff/staff-kitchen-view.tsx",
] as const;
const TOUCH_TARGET =
  /min-height:\s*(var\(--touch-target\)|(4[4-9]|[5-9]\d|\d{3,})px)/;
/** Boxes that print a string somebody typed: a kitchen's name, an address, a phone, a reference, a colleague's name. */
const TYPED_TEXT_CLASSES = [
  "title",
  "sub",
  "factValue",
  "requestLine",
  "hint",
] as const;
const GRID_CELL_CLASSES = [
  "page",
  "header",
  "viewCell",
  "contactColumn",
  "summaryCell",
] as const;

function ruleOf(css: string, className: string): string {
  const match = new RegExp(`(?:^|\\n)\\.${className}\\s*\\{([^}]*)\\}`).exec(
    css,
  );
  if (match === null) throw new Error(`no rule for .${className}`);
  return match[1] ?? "";
}

function hasRule(css: string, selector: string): boolean {
  return css.includes(`${selector} {`);
}

function cssOf(
  componentPath: string,
  localName: string,
): { file: string; css: string } {
  const file = parse(componentPath);
  let address: string | undefined;
  file.forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.name?.text === localName &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      address = node.moduleSpecifier.text;
    }
  });
  if (address === undefined) throw new Error(`no import named ${localName}`);
  const path = join(dirname(join(SOURCE_ROOT, componentPath)), address);
  return { file: path, css: readFileSync(path, "utf8") };
}

function parse(componentPath: string): ts.SourceFile {
  return ts.createSourceFile(
    componentPath,
    readFileSync(join(SOURCE_ROOT, componentPath), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

interface PressedClass {
  readonly element: string;
  readonly localName: string;
  readonly className: string;
}

/** The style classes of every `<a>` and `<button>` the component draws: the boxes that are pressed. */
function pressedClassesOf(componentPath: string): PressedClass[] {
  const found: PressedClass[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      if (tag === "a" || tag === "button") {
        for (const attribute of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText() === "className" &&
            attribute.initializer !== undefined &&
            ts.isJsxExpression(attribute.initializer) &&
            attribute.initializer.expression !== undefined &&
            ts.isPropertyAccessExpression(attribute.initializer.expression)
          ) {
            found.push({
              element: tag,
              localName: attribute.initializer.expression.expression.getText(),
              className: attribute.initializer.expression.name.text,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(componentPath));
  return found;
}

describe("the boxes that are pressed", () => {
  const pressed = COMPONENTS.flatMap((componentPath) =>
    pressedClassesOf(componentPath).map((found) => ({
      componentPath,
      ...found,
    })),
  );

  it("are found, so the checks below are about something", () => {
    expect(pressed.map(({ className }) => className)).toEqual(
      expect.arrayContaining(["back", "cameraChip"]),
    );
  });

  it.each(
    COMPONENTS.flatMap((componentPath) =>
      pressedClassesOf(componentPath).map(
        ({ localName, className, element }) =>
          [
            `${element}.${localName}.${className}`,
            componentPath,
            localName,
            className,
          ] as const,
      ),
    ),
  )(
    "%s declares a height of at least 44 px",
    (_, componentPath, localName, className) => {
      const { css } = cssOf(componentPath, localName);

      expect(ruleOf(css, className)).toMatch(TOUCH_TARGET);
    },
  );

  it("is given a focus ring by the page's own stylesheet for the two it draws itself", () => {
    const { css } = cssOf("staff/staff-kitchen-view.tsx", "styles");

    expect(hasRule(css, ".back:focus-visible")).toBe(true);
    expect(hasRule(css, ".cameraChip:focus-visible")).toBe(true);
    expect(css).toMatch(/\.cameraChip:focus-visible\s*\{[^}]*outline:\s*2px/);
    expect(css).toMatch(/\.back:focus-visible\s*\{[^}]*outline:\s*2px/);
  });

  it("says which camera is on by more than a colour: the pressed chip is bold", () => {
    const { css } = cssOf("staff/staff-kitchen-view.tsx", "styles");

    expect(css).toMatch(
      /\.cameraChip\[aria-pressed="true"\]\s*\{[^}]*font-weight:\s*700/,
    );
  });

  it("leaves a gap between neighbouring chips, so two targets are not one", () => {
    const { css } = cssOf("staff/staff-kitchen-view.tsx", "styles");

    expect(ruleOf(css, "cameraChips")).toMatch(/gap:\s*[4-9]px|gap:\s*\d{2}px/);
  });
});

describe("the boxes that print what somebody typed", () => {
  const { css } = cssOf("staff/staff-kitchen-view.tsx", "styles");

  it.each(TYPED_TEXT_CLASSES)(
    ".%s breaks a string with no break in it, so ten thousand letters stay in the column",
    (className) => {
      expect(ruleOf(css, className)).toMatch(/overflow-wrap:\s*anywhere/);
    },
  );

  it.each(TYPED_TEXT_CLASSES)(
    ".%s keeps a right-to-left run from reordering the text around the box",
    (className) => {
      expect(ruleOf(css, className)).toMatch(/unicode-bidi:\s*isolate/);
    },
  );
});

describe("the grid", () => {
  const { css } = cssOf("staff/staff-kitchen-view.tsx", "styles");

  it.each(GRID_CELL_CLASSES)(
    ".%s can shrink below its content, so a long word does not push the page wide",
    (className) => {
      expect(ruleOf(css, className)).toMatch(/min-width:\s*0/);
    },
  );

  it("is a single column on a phone, in the order a person reads, and three columns from 900 px", () => {
    expect(ruleOf(css, "columns")).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(
      /@media \(min-width: 900px\)[\s\S]*grid-template-areas:[\s\S]*"view contact notes"[\s\S]*"summary contact notes"/,
    );
  });

  it("hides nothing from the eye or the ear by display or visibility, so a state is not drawn and then removed by style", () => {
    expect(css).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });
});
