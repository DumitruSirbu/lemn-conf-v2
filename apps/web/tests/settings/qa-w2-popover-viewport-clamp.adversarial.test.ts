// **Adversarial QA for wave W2, attack 5: a clamp built on a declared constant.**
//
// M6-AUD-016's mechanism was not that either popover was too tall in the abstract. It was that
// `.body` scrolled internally, so the box kept its full drawn height while the footer holding
// *Aplică* — a primary action with no scrim-click equivalent — was pushed below the screen and
// nothing inside the surface looked wrong. The fix clamps `max-height` to the viewport.
//
// **`--popover-top: 128px` is asserted, not measured**, and the shape of the guarantee is arithmetic
// rather than declarative: the surface hangs at `top: 100%` of its anchor plus `margin-top`, so the
// clamp is only correct while
//
//     anchor bottom + margin-top  ≤  --popover-top + --safe-gap
//
// A node runtime cannot measure the left-hand side. What it can do is hold every part of the
// right-hand side that a stylesheet declares, publish the budget the constant leaves, and refuse the
// shapes that would break the guarantee no matter what the measurement turns out to be:
//
//   - a clamp that is not a `min()`, which could make a surface **taller** than its drawn height;
//   - the two popovers taking different tokens, which is how one gets fixed and the other rots;
//   - a footer that can shrink, which puts the mechanism back inside a correctly clamped box;
//   - a bottom-anchored mobile sheet with no `env(safe-area-inset-bottom)`.
//
// What only a browser can settle is named in the last block, and measured by the two e2e specs the
// wave added — which cannot run here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

function readStylesheet(relativePath: string): string {
  return readFileSync(resolve(SOURCE_ROOT, relativePath), "utf8");
}

/** Declarations only. Every one of these files argues with itself in comments, and a comment that
 *  names a property is exactly the false positive a text guard has to rule out. */
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

function ruleBodyOf(stylesheet: string, selector: string): string {
  const escaped = selector.replaceAll(/[.[\]"=^$:()-]/g, "\\$&");
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(stylesheet)?.[1];
  if (!body) throw new Error(`no ${selector} rule to read`);
  return body;
}

describe("the token the clamp is built on", () => {
  it("is declared once, on :root, so both stylesheets resolve the same number", () => {
    // A CSS module cannot see a custom property declared on another module's class. Declared
    // anywhere but the document root, `min()` would fall back to the drawn height and the clamp
    // would silently do nothing at all.
    const root = /:root\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

    expect(root).toContain("--popover-top:");
    expect(root).toContain("--safe-gap:");
    expect(globals.match(/--popover-top:/g)?.length).toBe(1);
    expect(globals.match(/--safe-gap:/g)?.length).toBe(1);
  });

  it("leaves a measurable budget for the anchor it is standing in for, and this is that number", () => {
    // **The claim the whole clamp rests on, written as arithmetic rather than as prose.** The
    // surface's top is its anchor's bottom plus its own `margin-top`, so the constant is only
    // honest while the anchor's bottom stays under this budget. Published here so a later reader
    // measures against a number rather than re-deriving it, and so a change to either token has to
    // be a decision about the layout.
    const popoverTop = readPixelToken("popover-top");
    const safeGap = readPixelToken("safe-gap");
    const marginTops = EVERY_POPOVER.map(({ name, stylesheet }) => {
      const desktop = surfaceRulesOf(stylesheet).at(-1) ?? "";
      const declared = /margin-top:\s*(\d+)px/.exec(desktop)?.[1];
      if (!declared)
        throw new Error(`${name}'s desktop surface declares no margin-top`);
      return Number(declared);
    });

    expect(new Set(marginTops).size, "the two popovers hang differently").toBe(
      1,
    );
    const marginTop = marginTops[0] ?? 0;
    // The anchor's bottom may reach this far down the viewport before the clamped surface starts
    // eating into `--safe-gap`, and this far before it reaches past the screen entirely.
    expect(popoverTop - marginTop).toBe(112);
    expect(popoverTop + safeGap - marginTop).toBe(128);
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
    // The direction a clamp must fail in. `calc(100dvh - …)` alone would make both surfaces *grow*
    // on a tall screen past the height frames D2D and D2E draw, which is a different regression
    // wearing the same fix.
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

  it("is anchored where the token assumes, hanging from its anchor rather than from the viewport", () => {
    // `--popover-top` stands in for the anchor's bottom, which only means anything while the surface
    // is positioned against that anchor. A surface switched to `position: fixed` here would keep the
    // clamp and lose the thing it is clamping.
    for (const { name, stylesheet } of EVERY_POPOVER) {
      const desktop = surfaceRulesOf(stylesheet).at(-1) ?? "";

      expect(desktop, name).toContain("position: absolute");
      expect(desktop, name).toContain("top: 100%");
    }
  });
});

describe("what the clamp does to the surface it clamps", () => {
  it("leaves the scrolling body as the only thing that flexes, so a clamped footer is not clipped", () => {
    // **The audit's own mechanism, guarded from the inside.** A footer free to shrink would be
    // squeezed by the clamp instead of the body scrolling — the same disappearing *Aplică*, now
    // inside a box that fits the screen. `flex: 1` with a zero basis on `.body` is what sends every
    // pixel of slack, positive or negative, to the scroller.
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
