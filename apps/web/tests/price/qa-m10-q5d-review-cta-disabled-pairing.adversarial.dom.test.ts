// @vitest-environment happy-dom
//
// M10 Q5d, adversarial: the disabled look and the disabled markup are two halves that only mean something together. The look
// is a CSS rule keyed on `[aria-disabled="true"]` (`configure.module.css`); the markup is the screen's `aria-disabled`. Neither
// half's own test sees the other: a screen that renders `aria-disabled="1"` or `aria-disabled` (empty) is correct markup to a
// DOM test and paints the enabled brown under the stylesheet's rule. This takes the selector out of the stylesheet's text and asks
// the rendered element whether it matches, while a choice is owed and after.
//
// What this cannot see: the painted result. happy-dom does not compute CSS-module rules, so a browser check at 390 and 1440 is
// what shows the grey.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import {
  beginTest,
  carryingMdf,
  chooseTier,
  endTest,
  hydrate,
  MELAMINE_NAME,
  mountEditor,
  notice,
  required,
  serveWorld,
} from "../support/replacement-sheet-world";

const stylesheet = readFileSync(
  resolve(
    import.meta.dirname,
    "../../src/app/configurator/configure/configure.module.css",
  ),
  "utf8",
);

/** The attribute selector the stylesheet's disabled rule hangs on, as written there: `[aria-disabled="true"]`. */
function disabledAttributeSelector(): string {
  const match = /\.reviewCta(\[[^\]]+\])\s*\{/.exec(stylesheet);
  if (match?.[1] === undefined) {
    throw new Error("the stylesheet has no attribute-keyed .reviewCta rule");
  }
  return match[1];
}

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  await endTest();
});

describe("the review control and the stylesheet's disabled rule", () => {
  it("matches the rule's own attribute selector while a choice is owed, and stops matching the moment none is", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor();
    const selector = disabledAttributeSelector();

    const whileOwed = required(editor, "review-cta");
    expect(selector).toBe('[aria-disabled="true"]');
    expect(whileOwed.matches(selector)).toBe(true);
    expect(whileOwed.className).toMatch(/reviewCta/);

    await chooseTier(editor, MELAMINE_NAME);

    const after = required(editor, "review-cta");
    expect(after.className).toMatch(/reviewCta/);
    expect(after.matches(selector)).toBe(false);
    expect(after.hasAttribute("aria-disabled")).toBe(false);
  });

  it("is still the same one control while owed: one review-cta, a span with role link, no href, no tabindex, no onclick path", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor();

    const controls = editor.container.querySelectorAll(
      '[data-testid="review-cta"]',
    );
    expect(controls).toHaveLength(1);
    const control = required(editor, "review-cta");
    expect(control.tagName).toBe("SPAN");
    expect(control.getAttribute("role")).toBe("link");
    expect(control.hasAttribute("href")).toBe(false);
    expect(control.hasAttribute("tabindex")).toBe(false);
    expect(control.querySelector("a, button")).toBeNull();
  });
});
