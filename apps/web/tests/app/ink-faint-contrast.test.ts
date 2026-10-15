// `--ink-faint` carries every quiet label in the application — the price bar's *De la*, §9's section
// titles and notes, the chip reasons, the step counter. At the mockups' `#7d7a72` the price label
// computed to **4.02:1**, under WCAG AA's 4.5:1 for normal text, and the owner ruled on 2026-09-03
// that the token is darkened everywhere rather than overridden on one surface.
//
// **Nothing here restates a colour or a ratio.** Both sides are read out of the stylesheets that
// declare them and the ratio is computed, because a pin that repeats "4.5" beside a literal hex
// passes for the wrong reason the moment either value moves — which is the failure this file exists
// to prevent, on a token nine places share.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG 2.1 SC 1.4.3, normal text. */
const AA_MINIMUM_RATIO = 4.5;

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

function readStylesheet(relativePath: string): string {
  return readFileSync(resolve(SOURCE_ROOT, relativePath), "utf8");
}

const globals = readStylesheet("app/globals.css");
const panelStylesheet = readStylesheet("panel/editor-panel.module.css");

function readToken(name: string): string {
  const declared = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(
    globals,
  )?.[1];
  if (!declared) throw new Error(`globals.css declares no --${name}`);
  return declared;
}

/** The background a rule paints, read from the rule rather than repeated here. */
function readRuleBackground(stylesheet: string, selector: string): string {
  const block = new RegExp(
    `${selector.replaceAll(/[.[\]"=^$]/g, "\\$&")}[^{]*\\{([^}]*)\\}`,
  ).exec(stylesheet)?.[1];
  if (!block) throw new Error(`no ${selector} rule to read`);
  const background = /background:\s*(#[0-9a-f]{3,6})/.exec(block)?.[1];
  if (!background) throw new Error(`${selector} paints no literal background`);
  return background;
}

function relativeLuminance(colour: string): number {
  const hex = colour.replace("#", "");
  const channels = [0, 2, 4].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16),
  );
  const linear = channels.map((value) => {
    const scaled = value / 255;
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (linear[0] ?? 0) +
    0.7152 * (linear[1] ?? 0) +
    0.0722 * (linear[2] ?? 0)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((first, second) => second - first);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** Every surface a `--ink-faint` label actually sits on, each read from where it is declared.
 *
 *  The last one is the worst case and the reason this list is not just the paper token: ADR 0049
 *  renders a fixed-width cabinet's single width chip **active and disabled**, carrying the engine's
 *  sentence — so `.chipReason` is painted over the active chip's own background, which is the
 *  darkest thing this token is ever read against. */
const BACKGROUNDS: readonly (readonly [string, string])[] = [
  ["--paper (the bar, the sheet, the header)", readToken("paper")],
  [
    "--surface (the notice, the WebGL fallback's footnote)",
    readToken("surface"),
  ],
  ["--stage (the scene's loading line)", readToken("stage")],
  [
    ".widthChip[data-state=active] (ADR 0049's disabled active chip)",
    readRuleBackground(panelStylesheet, '.widthChip[data-state="active"]'),
  ],
];

describe("the quiet-label token meets AA wherever it is read", () => {
  const inkFaint = readToken("ink-faint");

  it.each(BACKGROUNDS)("clears 4.5:1 on %s", (_site, background) => {
    expect(contrastRatio(inkFaint, background)).toBeGreaterThanOrEqual(
      AA_MINIMUM_RATIO,
    );
  });

  it("is darker than the value the mockups drew, which is why this file exists", () => {
    // The counterfactual, so the pin above cannot pass by accident on a token that never moved: the
    // mockups' own colour fails on the very background the ruling was taken for.
    const asDrawnInTheMockups = "#7d7a72";

    // Darker, not merely different: a lighter grey is also "not the mockups' value".
    expect(relativeLuminance(inkFaint)).toBeLessThan(
      relativeLuminance(asDrawnInTheMockups),
    );
    expect(contrastRatio(asDrawnInTheMockups, readToken("paper"))).toBeLessThan(
      AA_MINIMUM_RATIO,
    );
  });

  it("is read by every quiet label rather than overridden on one surface", () => {
    // The owner chose the token over a price-bar-only override, so no stylesheet may re-declare it
    // locally — an override is how the other eight sites quietly keep the failing value.
    for (const stylesheet of [
      "price/price-bar.module.css",
      "panel/editor-panel.module.css",
      "app/configurator/configure/configure.module.css",
      "components/webgl-unavailable.module.css",
    ]) {
      expect(readStylesheet(stylesheet), stylesheet).not.toMatch(
        /--ink-faint:\s*#/,
      );
    }
  });
});
