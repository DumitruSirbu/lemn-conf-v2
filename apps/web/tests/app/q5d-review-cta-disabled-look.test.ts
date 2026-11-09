// M10 Q5d: the review control while a choice is owed wears the frame's disabled button (`Lemnaria Dashboard.dc.html`
// `btnOff`: background #ece7dd, border #dcd8ce, text #a89c8e) instead of the enabled button's brown with only the cursor to
// tell them apart. jsdom and happy-dom do not compute CSS-module rules, so this reads the stylesheet as text, as
// `top-bar-box.test.ts` does; the markup half (`role="link"`, `aria-disabled`) is pinned in `q3d-replacement-sheet.dom.test.ts`.
//
// What this cannot see: the painted result. A browser check of the owed state at 390 and 1440 is what shows that.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(
    import.meta.dirname,
    "../../src/app/configurator/configure/configure.module.css",
  ),
  "utf8",
);
const globalsStylesheet = readFileSync(
  resolve(import.meta.dirname, "../../src/app/globals.css"),
  "utf8",
);

const DISABLED_SELECTOR = '.reviewCta[aria-disabled="true"]';

function declarationsOf(selector: string): string {
  const start = stylesheet.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return stylesheet.slice(start, stylesheet.indexOf("}", start));
}

function valueOf(declarations: string, property: string): string {
  const match = new RegExp(`(?:^|\\s)${property}:\\s*([^;]+);`).exec(
    declarations,
  );
  if (match?.[1] === undefined) throw new Error(`no ${property}`);
  return match[1].trim();
}

describe("the review control while a choice is owed", () => {
  const disabled = declarationsOf(DISABLED_SELECTOR);

  it("is painted with the frame's disabled background and text, not the enabled accent", () => {
    expect(valueOf(disabled, "--review-cta-off-background")).toBe("#ece7dd");
    expect(valueOf(disabled, "--review-cta-off-text")).toBe("#a89c8e");
    expect(valueOf(disabled, "background")).toBe(
      "var(--review-cta-off-background)",
    );
    expect(valueOf(disabled, "color")).toBe("var(--review-cta-off-text)");
  });

  it("draws the frame's #dcd8ce border through the existing line token, without widening the box", () => {
    expect(globalsStylesheet).toMatch(/--line:\s*#dcd8ce;/);
    expect(valueOf(disabled, "box-shadow")).toBe("inset 0 0 0 1px var(--line)");
    expect(disabled).not.toMatch(/(?:^|\s)border:/);
  });

  it("says it cannot be used by its cursor and has no hover or active effect to suggest it can", () => {
    expect(valueOf(disabled, "cursor")).toBe("not-allowed");
    expect(stylesheet).not.toMatch(/\.reviewCta[^{]*:(hover|active)/);
  });

  it("is declared after the enabled rule and the desktop override sets no paint, so nothing re-colours it", () => {
    const enabledAt = stylesheet.indexOf(".reviewCta {");
    const disabledAt = stylesheet.indexOf(DISABLED_SELECTOR);
    expect(disabledAt).toBeGreaterThan(enabledAt);

    const desktopOverrideAt = stylesheet.lastIndexOf(".reviewCta {");
    expect(desktopOverrideAt).toBeGreaterThan(disabledAt);
    const desktopOverride = declarationsOf("  .reviewCta");
    expect(desktopOverride).not.toMatch(/(?:^|\s)(background|color):/);
  });
});
