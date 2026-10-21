// What the audit page's sources may not hold, read as syntax (wave L3-U6), beyond what the developer's source test asks of
// the hook alone: no timer, no listener and no transport of any kind in any of the five files, one GET with no referrer in
// the shared reader, every typed string passing through the isolating function at the sites that draw one, and every control
// the screen draws as tall as a thumb needs.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { declarationsFor } from "../support/css-declarations";

import { required } from "./qa-l3-u6-required.adversarial";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const AUDIT_FILES = [
  "app/[locale]/staff/audit/page.tsx",
  "staff/staff-audit-page.tsx",
  "staff/staff-audit-rows.tsx",
  "staff/staff-audit-filters.tsx",
  "staff/use-staff-audit.ts",
] as const;
const READER_FILE = "staff/staff-read-request.ts";
const TOUCH_TARGET_PX = 44;
const FORBIDDEN_NAMES = [
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
  "XMLHttpRequest",
  "sendBeacon",
  "WebSocket",
  "EventSource",
  "BroadcastChannel",
  "postMessage",
  "Worker",
  "SharedWorker",
  "ServiceWorker",
  "addEventListener",
  "history",
  "cookie",
  "caches",
  "navigator",
  "eval",
  "Function",
] as const;
const CONTROL_TAGS = new Set(["button", "select", "input", "textarea"]);

function parse(relative: string): ts.SourceFile {
  return ts.createSourceFile(
    relative,
    readFileSync(join(SOURCE_ROOT, relative), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function collect<Found>(
  file: ts.SourceFile,
  pick: (node: ts.Node) => Found | undefined,
): Found[] {
  const found: Found[] = [];
  const visit = (node: ts.Node): void => {
    const picked = pick(node);
    if (picked !== undefined) found.push(picked);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function identifiersIn(file: ts.SourceFile): string[] {
  return collect(file, (node) =>
    ts.isIdentifier(node) ? node.text : undefined,
  );
}

describe.each(AUDIT_FILES)("%s", (relative) => {
  const file = parse(relative);

  it("names no timer, listener, worker, transport, history, cookie or evaluator: nothing here can ask for a page nobody chose", () => {
    const names = identifiersIn(file);

    expect(
      names.filter((name) => FORBIDDEN_NAMES.includes(name as never)),
    ).toEqual([]);
  });

  it("names no fetch of its own: the log is read by the one shared reader", () => {
    expect(identifiersIn(file)).not.toContain("fetch");
  });

  it("changes the location of the document by nothing but a reload, and only in the page that has no staff frame to show", () => {
    const uses = collect(file, (node) =>
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText().endsWith("location")
        ? node.getText()
        : undefined,
    );

    expect(uses.every((use) => use === "window.location.reload")).toBe(true);
    if (relative !== "staff/staff-audit-page.tsx") expect(uses).toEqual([]);
  });

  it("writes no title: the title of the page is the brand and the filters are not in it", () => {
    const writes = collect(file, (node) =>
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText() === "document" &&
      node.name.text === "title"
        ? node.getText()
        : undefined,
    );

    expect(writes).toEqual([]);
  });
});

describe("the shared reader", () => {
  const file = parse(READER_FILE);

  it("makes one request, a GET, that names no referrer and carries nothing but the abort the caller holds", () => {
    const calls = collect(file, (node) =>
      ts.isCallExpression(node) && node.expression.getText() === "fetch"
        ? node
        : undefined,
    );

    expect(calls).toHaveLength(1);
    const options = calls[0]?.arguments[1];
    expect(options !== undefined && ts.isObjectLiteralExpression(options)).toBe(
      true,
    );
    const members = ts.isObjectLiteralExpression(options as ts.Node)
      ? (options as ts.ObjectLiteralExpression).properties.map((property) =>
          property.getText().replace(/\s+/gu, " "),
        )
      : [];
    expect(members).toEqual([
      'method: "GET"',
      "referrerPolicy: NO_REFERRER_POLICY",
      "signal",
    ]);
  });
});

describe("the sites that draw a string somebody typed", () => {
  it("pass it to the isolating function at every one of them: the actor and the client in the rows, the kitchen's name, an action code, and the person in the menu", () => {
    const rows = parse("staff/staff-audit-rows.tsx");
    const filters = parse("staff/staff-audit-filters.tsx");
    const argumentsOf = (file: ts.SourceFile): string[] =>
      collect(file, (node) =>
        ts.isCallExpression(node) && node.expression.getText() === "isolated"
          ? node.arguments.map((argument) => argument.getText()).join(",")
          : undefined,
      ).sort();

    expect(argumentsOf(rows)).toEqual(
      ["clientEmail", "entry.action", "event.actor.email", "name"].sort(),
    );
    expect(argumentsOf(filters)).toEqual(["email"]);
  });
});

describe("the controls the screen draws", () => {
  const SHEETS: Readonly<Record<string, string>> = {
    styles: "staff/staff-audit.module.css",
    listStyles: "staff/staff-kitchens.module.css",
  };

  function heightsDeclared(sheet: string, name: string): number[] {
    const css = readFileSync(
      join(SOURCE_ROOT, required(SHEETS[sheet])),
      "utf8",
    );
    return declarationsFor(css, name, "min-height").map(({ value }) =>
      value === "var(--touch-target)"
        ? TOUCH_TARGET_PX
        : Number.parseFloat(value),
    );
  }

  function controlClassesIn(relative: string): [string, string][] {
    return collect(parse(relative), (node) => {
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node))
        return undefined;
      if (!CONTROL_TAGS.has(node.tagName.getText())) return undefined;
      const className = node.attributes.properties.find(
        (property): property is ts.JsxAttribute =>
          ts.isJsxAttribute(property) &&
          property.name.getText() === "className",
      );
      const text =
        className?.initializer?.getText().replace(/[{}]/gu, "") ?? "";
      const match = /^(\w+)\.(\w+)$/u.exec(text);
      return match === null
        ? undefined
        : ([match[1], match[2]] as [string, string]);
    });
  }

  it("keeps the touch target the stylesheet names at 44 px", () => {
    const globals = readFileSync(join(SOURCE_ROOT, "app/globals.css"), "utf8");

    expect(globals).toContain(`--touch-target: ${String(TOUCH_TARGET_PX)}px`);
  });

  it.each(["staff/staff-audit-page.tsx", "staff/staff-audit-filters.tsx"])(
    "gives every button, select and field of %s a class that is at least 44 px tall wherever it is declared",
    (relative) => {
      const controls = controlClassesIn(relative);

      expect(controls.length).toBeGreaterThan(0);
      for (const [sheet, name] of controls) {
        const heights = heightsDeclared(sheet, name);
        expect(heights.length, `${sheet}.${name}`).toBeGreaterThan(0);
        expect(Math.min(...heights), `${sheet}.${name}`).toBeGreaterThanOrEqual(
          TOUCH_TARGET_PX,
        );
      }
    },
  );

  it("draws the page numbers and the 'more' button from classes of that size too", () => {
    for (const [sheet, name] of [
      ["listStyles", "pageButton"],
      ["listStyles", "moreButton"],
      ["listStyles", "stateAction"],
    ] as const) {
      expect(
        Math.min(...heightsDeclared(sheet, name)),
        name,
      ).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
    }
  });
});
