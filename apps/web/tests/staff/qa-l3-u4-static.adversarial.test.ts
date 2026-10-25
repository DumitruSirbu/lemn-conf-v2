// Adversarial QA of wave L3-U4, read from text: what the staff writing files may never reach for (a console to log a client's
// note to, a second way out of the page, a browser store, a socket), and what the stylesheet promises the boxes a finger
// presses and the boxes that print a stranger's words. Nothing runs here. The developer's source scan covers timers, `fetch`,
// storage and the history; this one covers the rest of the ways a note could leave the page.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const WRITING_FILES = [
  "staff/use-note-composer.ts",
  "staff/use-status-control.ts",
  "staff/use-unhide.ts",
  "staff/use-one-write-at-a-time.ts",
  "staff/staff-session-expiry.ts",
  "staff/staff-notes.tsx",
  "staff/staff-status-control.tsx",
  "staff/unhide-banner.tsx",
  "staff/staff-session-sheet.tsx",
  "staff/staff-note-rules.ts",
] as const;
/** Dialogs and windows of the browser, which are only the browser's when reached through the window. */
const WINDOW_MEMBERS = new Set(["open", "print", "alert", "confirm", "prompt"]);
/** Names that carry what the page holds somewhere it should not go. */
const FORBIDDEN_NAMES = new Set([
  "console",
  "sendBeacon",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "BroadcastChannel",
  "postMessage",
  "caches",
  "cookieStore",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "clipboard",
  ...[...WINDOW_MEMBERS].map((member) => `window.${member}`),
  "FormData",
  "URLSearchParams",
]);
const TOUCH_TARGET_PX = 44;

function parse(relative: string): ts.SourceFile {
  return ts.createSourceFile(
    relative,
    readFileSync(join(SOURCE_ROOT, relative), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function namesUsedIn(file: ts.SourceFile): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.push(node.text);
    if (
      ts.isPropertyAccessExpression(node) &&
      ["window", "globalThis", "self"].includes(node.expression.getText()) &&
      WINDOW_MEMBERS.has(node.name.text)
    ) {
      names.push(`window.${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

describe.each(WRITING_FILES)("%s", (relative) => {
  it("names no console, beacon, socket, channel, store, clipboard, dialog of the browser or window to open", () => {
    const used = namesUsedIn(parse(relative));

    expect(used.filter((name) => FORBIDDEN_NAMES.has(name))).toEqual([]);
  });

  it("holds no string that reads like an address to send the page's words to", () => {
    const file = parse(relative);
    const literals: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) literals.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(file);

    expect(literals.filter((text) => /^(https?:)?\/\//.test(text))).toEqual([]);
  });
});

const staffCss = readFileSync(
  join(SOURCE_ROOT, "staff/staff-kitchen.module.css"),
  "utf8",
);
const accountCss = readFileSync(
  join(SOURCE_ROOT, "account/account.module.css"),
  "utf8",
);

function declaredMinHeightsOf(css: string, className: string): string[] {
  return [...valuesFor(css, className, "min-height")];
}

function isAtLeastTouchTarget(value: string): boolean {
  if (value === "var(--touch-target)") return true;
  const pixels = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return pixels !== null && Number(pixels[1]) >= TOUCH_TARGET_PX;
}

describe("the boxes the staff writes press or type into", () => {
  it.each([
    ["staff", staffCss, "bannerButton"],
    ["staff", staffCss, "statusButton"],
    ["staff", staffCss, "select"],
    ["staff", staffCss, "textarea"],
    ["account", accountCss, "dialogAction"],
    ["account", accountCss, "submit"],
  ])(
    "declare a height of at least 44 px, in every rule that sets one (the %s stylesheet, .%s)",
    (_, css, className) => {
      const heights = declaredMinHeightsOf(css, className);

      expect(heights.length).toBeGreaterThan(0);
      expect(heights.filter((value) => !isAtLeastTouchTarget(value))).toEqual(
        [],
      );
    },
  );

  it.each(["bannerButton", "statusButton", "select", "textarea"])(
    "have a visible ring for the keyboard: .%s:focus-visible",
    (className) => {
      const rings = declarationsFor(staffCss, className, "outline").filter(
        ({ selector }) => selector.includes(":focus-visible"),
      );

      expect(rings.length).toBeGreaterThan(0);
      for (const { value } of rings) expect(value).not.toMatch(/^(none|0)/);
    },
  );

  it("show the off state of the status button that the component marks with aria-disabled", () => {
    const rules = declarationsFor(staffCss, "statusButton", "cursor").filter(
      ({ selector }) => selector.includes('[aria-disabled="true"]'),
    );

    expect(rules.length).toBeGreaterThan(0);
  });
});

describe("the boxes that print a stranger's words", () => {
  it.each(["noteText", "noteAuthor"])(
    ".%s breaks anywhere and is isolated from what stands beside it",
    (className) => {
      expect(valuesFor(staffCss, className, "overflow-wrap")).toContain(
        "anywhere",
      );
      expect(valuesFor(staffCss, className, "unicode-bidi")).toContain(
        "isolate",
      );
    },
  );

  it(".noteText keeps the line feeds of a note", () => {
    expect(valuesFor(staffCss, "noteText", "white-space")).toContain(
      "pre-wrap",
    );
  });
});
