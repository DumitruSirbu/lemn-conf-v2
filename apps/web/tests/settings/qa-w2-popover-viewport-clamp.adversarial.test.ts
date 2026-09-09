// **Adversarial QA for wave W2, attack 5: a clamp built on a declared constant.**
//
// M6-AUD-016's mechanism was not that either popover was too tall in the abstract. It was that
// `.body` scrolled internally, so the box kept its full drawn height while the footer holding
// *Aplică* — a primary action with no scrim-click equivalent — was pushed below the screen and
// nothing inside the surface looked wrong. The fix clamps `max-height` to the viewport.
//
// **`--popover-top: 128px` is asserted, not measured**, and the shape of the guarantee is arithmetic
// rather than declarative. What the constant has to stand above is the **top of the surface in the
// viewport**, and since 2026-09-09 the two surfaces reach that top by different routes:
//
//     price-breakdown    anchor bottom + margin-top   ≤  --popover-top + --safe-gap
//     global-settings    its declared `top`           ≤  --popover-top + --safe-gap
//
// The settings modal is **viewport-positioned** since the owner's ruling of that date — *"center
// this modal"* — because centring in the viewport cannot be reached from a containing block that
// shrink-wraps the pill. That is a re-pointing of this file and not a weakening of it: the settings
// surface's top stopped being unmeasurable here and became a number this runtime can read, so the
// claim about it got **stronger**, while the breakdown's is unchanged.
//
// A node runtime still cannot measure an anchor's bottom. What it can do is hold every part of the
// right-hand side that a stylesheet declares, publish the budget the constant leaves for the one
// surface that still needs one, and refuse the shapes that would break the guarantee no matter what
// the measurement turns out to be:
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

/** How far below its anchor a surface hangs, in either spelling a stylesheet may use for it: a
 *  `margin-top`, or the offset inside frame D2E's own `top: calc(100% + 33px)`. The number is what
 *  `--popover-top` stands in for on an anchor-hung surface, so reading only one spelling would let
 *  the other change the geometry without moving the budget. */
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

/** A `--name: 42px` declaration inside one rule body. */
function pixelPropertyOf(rule: string, name: string): number {
  const declared = new RegExp(`--${name}:\\s*([\\d.]+)px`).exec(rule)?.[1];
  if (!declared) throw new Error(`the rule declares no --${name} in px`);
  return Number(declared);
}

/**
 * **Where the settings modal's top edge lands in the viewport**, computed from the four properties
 * its own rule declares rather than from a literal.
 *
 * It is viewport-positioned since the centring ruling, so unlike the breakdown there is no anchor
 * left to stand in for — the number is fully determined by the stylesheet and this runtime can have
 * it. The arithmetic is the rule's own, restated here rather than imported, because a guard that
 * evaluates the expression it is guarding agrees with whatever the expression says.
 */
function viewportTopOfTheSettingsModal(desktopRule: string): number {
  const band = pixelPropertyOf(desktopRule, "desktop-band-height");
  const rule = pixelPropertyOf(desktopRule, "desktop-band-rule");
  const pill = pixelPropertyOf(desktopRule, "desktop-pill-height");
  const gap = pixelPropertyOf(desktopRule, "frame-d2e-hang-gap");
  return (band - rule - pill) / 2 + pill + gap;
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
    // **The claim the whole clamp rests on, written as arithmetic rather than as prose.** An
    // anchor-hung surface's top is its anchor's bottom plus its own `margin-top`, so the constant is
    // only honest while the anchor's bottom stays under this budget. Published here so a later
    // reader measures against a number rather than re-deriving it, and so a change to either token
    // has to be a decision about the layout.
    //
    // **One surface, where there were two.** The settings modal left this claim on 2026-09-09 by
    // becoming viewport-positioned, and it left it *upwards*: its top is now declared outright and
    // is asserted directly below, which is a stronger statement than a budget for a number nobody
    // here can see. What remains anchor-hung is the breakdown's popover, whose 16 px margin is
    // frame D2D's own — so the budget widens from the settings surface's 33 px hang to that 16, and
    // the two literals below move with it.
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

  /** **And the surface that no longer needs a budget is held to the thing the budget stood for.**
   *  The clamp is correct exactly while a surface's top sits at or above `--popover-top`; for the
   *  settings modal that top is now a number this file can compute, so the guarantee is asserted
   *  rather than reasoned about. Measured in a browser at 90.5 at 900, 1100, 1440 and 1920 px wide
   *  by `global-settings-centred.desktop.e2e.spec.ts`, which is the same number this arithmetic
   *  gives. */
  it("keeps the centred modal's own top above the constant the clamp assumes", () => {
    const declaredTop = viewportTopOfTheSettingsModal(
      surfaceRulesOf(settings).at(-1) ?? "",
    );

    expect(declaredTop).toBe(90.5);
    expect(declaredTop).toBeLessThanOrEqual(readPixelToken("popover-top"));
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

  /** **The breakdown's popover still hangs from its own trigger, and that is now a rule about one
   *  surface rather than about both.** `--popover-top` stands in for this anchor's bottom, which
   *  only means anything while the surface is positioned against it: switched to `position: fixed`
   *  it would keep the clamp and lose the thing being clamped.
   *
   *  **It must not follow the settings modal to the viewport's centre** (M6-AUD-013). That surface
   *  is modal — a scrim, `aria-modal`, a focus trap — and centring a modal is ordinary; this one is
   *  deliberately non-modal and explains a figure the customer can still see beside it. The two
   *  diverged on purpose, so the divergence is asserted rather than left to a comment. */
  it("leaves the breakdown's popover hanging from its anchor rather than from the viewport", () => {
    const desktop = surfaceRulesOf(breakdown).at(-1) ?? "";

    expect(desktop).toContain("position: absolute");
    // Either spelling of *hanging from the anchor*: `top: 100%`, or frame D2E's own
    // `top: calc(100% + 33px)`. What is refused is a surface positioned against the viewport.
    expect(desktop).toMatch(/top:\s*(?:100%|calc\(100% \+ \d+px\));/);
  });

  /** The settings modal, from the other side: viewport-positioned and centred by the two halves that
   *  produce centring together. `margin-inline: auto` without `left`/`right` centres nothing, and
   *  `left: 0; right: 0` without the margin stretches the box — so a rule holding only one of them
   *  is a rule that has stopped centring. */
  it("positions the settings modal against the viewport and centres it there", () => {
    const desktop = surfaceRulesOf(settings).at(-1) ?? "";

    expect(desktop).toContain("position: fixed");
    expect(desktop).toMatch(/left:\s*0;/);
    expect(desktop).toMatch(/right:\s*0;/);
    expect(desktop).toMatch(/margin-inline:\s*auto;/);
    // The frame's own width and M6-AUD-016's guard, both kept: centring the **used** width is what
    // makes the two compatible, so the clamped box is centred rather than pinned to one side.
    expect(desktop).toMatch(/width:\s*900px;/);
    expect(desktop).toMatch(/max-width:\s*calc\(100vw - 48px\);/);
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
