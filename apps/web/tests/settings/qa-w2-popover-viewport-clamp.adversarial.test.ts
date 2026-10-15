// A clamp built on a declared constant: `--popover-top: 128px` is asserted, not measured, and the guarantee is
// arithmetic. The constant must stand above the surface's top in the viewport:
//
//     price-breakdown    anchor bottom + margin-top   ≤  --popover-top + --safe-gap
//     global-settings    its declared `top`           ≤  --popover-top + --safe-gap
//
// A node runtime cannot measure an anchor's bottom, so this holds what a stylesheet declares and refuses the shapes
// that break the guarantee: a clamp that is not a `min()` (it could make a surface taller than drawn), the two
// popovers taking different tokens, a footer that can shrink, and a bottom-anchored mobile sheet with no
// `env(safe-area-inset-bottom)`. What only a browser can settle is measured by e2e specs that cannot run here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

function readStylesheet(relativePath: string): string {
  return readFileSync(resolve(SOURCE_ROOT, relativePath), "utf8");
}

/** Declarations only: a comment that names a property is the false positive a text guard has to rule out. */
function declarationsOf(stylesheet: string): string {
  return stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

const globals = declarationsOf(readStylesheet("app/globals.css"));
const settings = declarationsOf(
  readStylesheet("settings/global-settings.module.css"),
);
const breakdown = declarationsOf(
  readStylesheet("price/price-breakdown.module.css"),
);

/** The two surfaces that share the failure, so they are swept together rather than one being fixed
 *  and the other left. */
const EVERY_POPOVER: readonly {
  readonly name: string;
  readonly stylesheet: string;
}[] = [
  { name: "global-settings", stylesheet: settings },
  { name: "price-breakdown", stylesheet: breakdown },
];

function readPixelToken(name: string): number {
  const declared = new RegExp(`--${name}:\\s*(\\d+)px`).exec(globals)?.[1];
  if (!declared) throw new Error(`globals.css declares no --${name} in px`);
  return Number(declared);
}

/** Every `.surface { ... }` block in a stylesheet, in source order: the base rule first, then the
 *  desktop override inside the `min-width: 900px` query. */
function surfaceRulesOf(stylesheet: string): readonly string[] {
  return [...stylesheet.matchAll(/\.surface\s*\{([^}]*)\}/g)].map(
    ([, body]) => body ?? "",
  );
}

/** How far below its anchor a surface hangs, in either spelling: a `margin-top`, or frame D2E's own
 *  `top: calc(100% + 33px)`. Reading only one would let the other change the geometry without moving the budget. */
function offsetBelowTheAnchorOf(name: string, desktopRule: string): number {
  const declared =
    /margin-top:\s*(\d+)px/.exec(desktopRule)?.[1] ??
    /top:\s*calc\(100% \+ (\d+)px\)/.exec(desktopRule)?.[1];
  if (!declared)
    throw new Error(
      `${name}'s desktop surface declares no offset below its anchor`,
    );
  return Number(declared);
}

function ruleBodyOf(stylesheet: string, selector: string): string {
  const escaped = selector.replaceAll(/[.[\]"=^$:()-]/g, "\\$&");
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(stylesheet)?.[1];
  if (!body) throw new Error(`no ${selector} rule to read`);
  return body;
}

describe("the token the clamp is built on", () => {
  it("is declared once, on :root, so both stylesheets resolve the same number", () => {
    // A CSS module cannot see a custom property declared on another module's class. Declared anywhere but the root,
    // `min()` would fall back to the drawn height and the clamp would silently do nothing.
    const root = /:root\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

    expect(root).toContain("--popover-top:");
    expect(root).toContain("--safe-gap:");
    expect(globals.match(/--popover-top:/g)?.length).toBe(1);
    expect(globals.match(/--safe-gap:/g)?.length).toBe(1);
  });

  it("leaves a measurable budget for the anchor it is standing in for, and this is that number", () => {
    // An anchor-hung surface's top is its anchor's bottom plus its `margin-top`, so the constant is honest only while
    // the anchor's bottom stays under this budget; published as arithmetic so a change to either token is a decision
    // about the layout. Only the breakdown's popover is anchor-hung (its 16 px margin is frame D2D's own); the settings
    // modal's top is asserted directly below.
    const popoverTop = readPixelToken("popover-top");
    const safeGap = readPixelToken("safe-gap");
    const hang = offsetBelowTheAnchorOf(
      "price-breakdown",
      surfaceRulesOf(breakdown).at(-1) ?? "",
    );

    // The anchor's bottom may reach this far down the viewport before the clamped surface starts
    // eating into `--safe-gap`, and this far before it reaches past the screen entirely.
    expect(popoverTop - hang).toBe(112);
    expect(popoverTop + safeGap - hang).toBe(128);
  });
});

describe("both desktop popovers", () => {
  it("clamp to the viewport with the same two tokens, so neither is fixed alone", () => {
    for (const { name, stylesheet } of EVERY_POPOVER) {
      const desktop = surfaceRulesOf(stylesheet).at(-1) ?? "";
      const maxHeight = /max-height:\s*([^;]+);/.exec(desktop)?.[1]?.trim();

      expect(maxHeight, name).toMatch(
        /^min\(\d+px,\s*calc\(100dvh - var\(--popover-top\) - var\(--safe-gap\)\)\)$/,
      );
    }
  });

  it("take a min() rather than a bare viewport height, so the clamp can only ever shrink them", () => {
    // The direction a clamp must fail in: `calc(100dvh - …)` alone would let both surfaces grow past the height
    // frames D2D and D2E draw.
    for (const { name, stylesheet } of EVERY_POPOVER) {
      const desktop = surfaceRulesOf(stylesheet).at(-1) ?? "";
      const drawn = /min\((\d+)px/.exec(desktop)?.[1];

      expect(drawn, name).toBeDefined();
      expect(Number(drawn), name).toBeGreaterThan(0);
      // At the 900 × 500 viewport the audit measured, the clamp binds; at 900 tall it does not.
      const clampedAt = (viewportHeight: number) =>
        Math.min(
          Number(drawn),
          viewportHeight -
            readPixelToken("popover-top") -
            readPixelToken("safe-gap"),
        );
      expect(clampedAt(500), name).toBeLessThan(Number(drawn));
      expect(clampedAt(900), name).toBe(Number(drawn));
    }
  });

  /** `--popover-top` stands in for this anchor's bottom, which means something only while the surface is positioned
   *  against it: `position: fixed` would keep the clamp and lose the thing being clamped. It must not follow the
   *  settings modal to the viewport's centre: that surface is modal (scrim, `aria-modal`, focus trap) and this one is
   *  deliberately non-modal, explaining a figure still visible beside it. */
  it("leaves the breakdown's popover hanging from its anchor rather than from the viewport", () => {
    const desktop = surfaceRulesOf(breakdown).at(-1) ?? "";

    expect(desktop).toContain("position: absolute");
    // Either spelling of *hanging from the anchor*: `top: 100%`, or frame D2E's own
    // `top: calc(100% + 33px)`. What is refused is a surface positioned against the viewport.
    expect(desktop).toMatch(/top:\s*(?:100%|calc\(100% \+ \d+px\));/);
  });
});

describe("what the clamp does to the surface it clamps", () => {
  it("leaves the scrolling body as the only thing that flexes, so a clamped footer is not clipped", () => {
    // A footer free to shrink would be squeezed by the clamp instead of the body scrolling, the same disappearing
    // *Aplică* inside a box that fits the screen; `flex: 1` with a zero basis on `.body` sends all slack to the
    // scroller.
    for (const { name, stylesheet } of EVERY_POPOVER) {
      const body = ruleBodyOf(stylesheet, ".body");
      const footer = ruleBodyOf(stylesheet, ".footer");

      expect(body, name).toContain("flex: 1");
      expect(body, name).toContain("min-height: 0");
      expect(body, name).toContain("overflow-y: auto");
      expect(footer, name).not.toMatch(/\bflex(-grow|-shrink|-basis)?:/);
    }
  });

  it("keeps the surface a column, so the footer is below the body and not beside it", () => {
    for (const { name, stylesheet } of EVERY_POPOVER) {
      const base = surfaceRulesOf(stylesheet).at(0) ?? "";

      expect(base, name).toContain("display: flex");
      expect(base, name).toContain("flex-direction: column");
    }
  });
});

describe("both mobile sheets", () => {
  it("reserve the home indicator's strip, which appeared nowhere in this tree before wave W2", () => {
    // Both are `position: fixed; bottom: 0` measured in `dvh`, which on iOS Safari moves with the
    // toolbar. Declared on the sheet rather than on each control, so one element accounts for it.
    for (const { name, stylesheet } of EVERY_POPOVER) {
      const base = surfaceRulesOf(stylesheet).at(0) ?? "";

      expect(base, name).toContain("position: fixed");
      expect(base, name).toContain("bottom: 0");
      expect(base, name).toContain(
        "padding-bottom: env(safe-area-inset-bottom, 0px)",
      );
    }
  });

  it("carries a fallback in the env(), so a browser without the variable loses no height", () => {
    for (const { name, stylesheet } of EVERY_POPOVER) {
      const insets = [
        ...stylesheet.matchAll(/env\(safe-area-inset-[a-z]+[^)]*\)/g),
      ]
        .map(([one]) => one)
        .filter((one) => !one.includes(","));

      expect(insets, `${name} declares an inset with no fallback`).toEqual([]);
    }
  });

  it("measures the inset inside the sheet's own height, because the box is border-box", () => {
    // `padding-bottom` on a `max-height: 77dvh` box only lifts the footer if padding is inside that
    // height. The global reset is what makes that true, and it is read rather than assumed.
    expect(globals).toContain("box-sizing: border-box");
  });
});
