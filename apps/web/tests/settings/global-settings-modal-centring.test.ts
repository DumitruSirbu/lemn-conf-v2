// **The file `global-settings.module.css:611` says pins the centred modal — and which did not
// exist.** The stylesheet's own words: *"`tests/settings/global-settings-modal-centring.test.ts`
// plus the desktop e2e pin the result, so a drift fails by name rather than by eye."* Only the
// desktop e2e existed, and that suite runs on merge and never on a pull request, so until this file
// the vertical anchor and its clamp were pinned by nothing a pull request runs. This is the named
// half, written to the claim the comment makes.
//
// **What it is about is the clamp's direction, not the number.** The owner ruled the settings
// surface centred on 2026-09-09 (*"center this modal"*), which took it off `.anchor` and therefore
// off the pill as a reference; the vertical was reproduced as arithmetic instead. M6-AUD-016's
// `max-height` was left measured from `--popover-top` (128 px), which is **not** where either
// surface now hangs. That is safe in exactly one direction: a surface that hangs **above**
// `--popover-top` is clamped shorter than it needs to be and still fits, and one that hangs below it
// is clamped longer than it fits and puts its footer off the screen — which is the defect M6-AUD-016
// was raised for, measured at 900 x 500 with *Aplică* at y = 639.
//
// So the invariant asserted here is `top ≤ --popover-top`, for **both** clamped surfaces, rather
// than the two heights either happens to have today.
//
// No type spans this arithmetic — it is a stylesheet — so the declarations are read back out as
// text and added up, which is the shape `top-bar-box.test.ts` and `price-bar-layout.test.ts` already
// use for the same reason.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = resolve(import.meta.dirname, "../../src");

const SETTINGS_CSS = read("settings/global-settings.module.css");
const BREAKDOWN_CSS = read("price/price-breakdown.module.css");
const CONFIGURE_CSS = read("app/configurator/configure/configure.module.css");
const GLOBALS_CSS = read("app/globals.css");

function read(relativePath: string): string {
  return readFileSync(resolve(SOURCE, relativePath), "utf8");
}

/** A `--name: 128px;` declaration, in pixels. Throws rather than defaulting: a token that has
 *  stopped being declared would otherwise make every comparison below pass against a zero. */
function pixelsOfCustomProperty(stylesheet: string, name: string): number {
  const match = new RegExp(`--${name}:\\s*(-?[\\d.]+)px\\s*;`).exec(stylesheet);
  if (!match?.[1]) {
    throw new Error(`No stylesheet here declares --${name} in pixels.`);
  }
  return Number(match[1]);
}

/** A plain `property: 12px;` declaration inside the block that starts at `selector`. */
function pixelsOfDeclaration(
  stylesheet: string,
  selector: string,
  property: string,
): number {
  const block = new RegExp(`\\${selector}\\s*\\{([^{}]*)\\}`, "g");
  for (const [, body] of stylesheet.matchAll(block)) {
    const match = new RegExp(`(?:^|[;{\\s])${property}:\\s*(-?[\\d.]+)px`).exec(
      body ?? "",
    );
    if (match?.[1]) return Number(match[1]);
  }
  throw new Error(`No ${selector} block declares ${property} in pixels.`);
}

/** The **last** block a class declares in a stylesheet — the cascade's answer at the widest branch,
 *  since both of these files draw a mobile sheet in the base rule and override it whole above
 *  900 px. Throws rather than returning nothing, so a renamed class fails by name. */
function lastBlockFor(stylesheet: string, selector: string): string {
  const blocks = [
    ...stylesheet.matchAll(new RegExp(`\\${selector}\\s*\\{[^{}]*\\}`, "g")),
  ].map(([block]) => block);
  const last = blocks.at(-1);
  if (last === undefined) {
    throw new Error(`No block in this stylesheet declares ${selector}.`);
  }
  return last;
}

/** The shared clamp both surfaces are cut to. */
const POPOVER_TOP_PX = pixelsOfCustomProperty(GLOBALS_CSS, "popover-top");

/** The four numbers the centred surface composes its own `top` from, each declared on `.surface`
 *  itself so a band that changes height is a visible edit in that file too. */
const BAND_HEIGHT_PX = pixelsOfCustomProperty(
  SETTINGS_CSS,
  "desktop-band-height",
);
const BAND_RULE_PX = pixelsOfCustomProperty(SETTINGS_CSS, "desktop-band-rule");
const PILL_HEIGHT_PX = pixelsOfCustomProperty(
  SETTINGS_CSS,
  "desktop-pill-height",
);
const HANG_GAP_PX = pixelsOfCustomProperty(SETTINGS_CSS, "frame-d2e-hang-gap");

/** The pill's own inset in the band, plus the pill, plus frame D2E's gap — the hang the centring
 *  reproduced rather than moved. */
const SETTINGS_SURFACE_TOP_PX =
  (BAND_HEIGHT_PX - BAND_RULE_PX - PILL_HEIGHT_PX) / 2 +
  PILL_HEIGHT_PX +
  HANG_GAP_PX;

/** The breakdown's popover hangs at `top: 100%` of the price cell — whose height **is** the band —
 *  plus its own `margin-top`. Composed the same way, from the same band. */
const BREAKDOWN_SURFACE_TOP_PX =
  BAND_HEIGHT_PX + pixelsOfDeclaration(BREAKDOWN_CSS, ".surface", "margin-top");

describe("the vertical anchor, which the centring reproduced rather than moved", () => {
  /** **The declared band and the drawn band are the same number, or the arithmetic above is about a
   *  row that is not on the screen.** `configure.module.css`'s desktop `grid-template-rows` is the
   *  authority; `.surface` restates it as a token, and this is the line that keeps the restatement
   *  honest. */
  it("composes its hang from the band the top bar actually draws", () => {
    const declaredRows = /grid-template-rows:\s*(\d+)px minmax\(0, 1fr\)/.exec(
      CONFIGURE_CSS,
    )?.[1];

    expect(declaredRows).toBeDefined();
    expect(BAND_HEIGHT_PX).toBe(Number(declaredRows));
  });

  /** And from the pill's own declared height, for the same reason. */
  it("composes its hang from the pill's own declared height", () => {
    expect(PILL_HEIGHT_PX).toBe(
      pixelsOfDeclaration(SETTINGS_CSS, ".pill", "height"),
    );
  });

  /** Frame D2E `:961` draws the surface `calc(100% + 33px)` under the pill. The centring changed the
   *  horizontal only, so this number is still the frame's. */
  it("keeps frame D2E's own 33 px gap under the pill", () => {
    expect(HANG_GAP_PX).toBe(33);
  });

  /** The result, so a reader comparing this file against the browser has the one number to look
   *  for. **Derived above rather than pinned here** — this line only records what the derivation
   *  currently comes to. */
  it("hangs where it hung before the centring", () => {
    expect(SETTINGS_SURFACE_TOP_PX).toBeCloseTo(90.5, 6);
  });
});

describe("M6-AUD-016's clamp still binds, in the direction a clamp may fail in", () => {
  /**
   * **The invariant, and the whole reason this file exists.** `max-height` is
   * `min(drawn, 100dvh − --popover-top − --safe-gap)`, so a surface hanging at `top` leaves
   * `100dvh − top − max-height` below it. That is non-negative — the footer is on the screen —
   * exactly while `top ≤ --popover-top`.
   */
  it.each([
    ["the settings modal", () => SETTINGS_SURFACE_TOP_PX],
    ["the breakdown's popover", () => BREAKDOWN_SURFACE_TOP_PX],
  ])("cuts %s no longer than the screen under it", (_name, topPx) => {
    expect(topPx()).toBeLessThanOrEqual(POPOVER_TOP_PX);
  });

  /** Both surfaces read the **same** clamp expression, which is why the record says *"the two
   *  surfaces share the failure, so they share the rule."* A clamp copied and then edited on one
   *  side is how they stop sharing it. */
  it.each([
    ["the settings modal", SETTINGS_CSS],
    ["the breakdown's popover", BREAKDOWN_CSS],
  ])("measures %s against the same two tokens", (_name, stylesheet) => {
    const clamp =
      /max-height:\s*min\(\s*(\d+)px,\s*calc\(100dvh - var\(--popover-top\) - var\(--safe-gap\)\)\s*\)\s*;/.exec(
        stylesheet,
      );

    expect(
      clamp,
      "this surface no longer clamps against --popover-top and --safe-gap",
    ).not.toBeNull();
    // Non-vacuity: the drawn height the clamp is a `min` against is a real number, so the clamp is
    // the second arm of a real choice rather than the only one.
    expect(Number(clamp?.[1])).toBeGreaterThan(0);
  });
});

describe("the horizontal, which is what the owner's ruling moved", () => {
  /** *"center this modal"*, with the `max-width` guard still binding: `left: 0; right: 0` with
   *  `margin-inline: auto` centres the **used** width, so a viewport narrower than 948 px keeps
   *  exactly 24 px a side rather than centring a 900 px box that does not fit. */
  it("centres the settings modal on the screen and keeps its own width guard", () => {
    // **The last `.surface` block in the file**, which is the cascade's answer above 900 px: the
    // base rule draws frame 2E's bottom sheet and the desktop branch overrides it whole.
    const surface = lastBlockFor(SETTINGS_CSS, ".surface");

    expect(surface).toContain("position: fixed;");
    expect(surface).toContain("left: 0;");
    expect(surface).toContain("right: 0;");
    expect(surface).toContain("margin-inline: auto;");
    expect(surface).toContain("width: 900px;");
    expect(surface).toContain("max-width: calc(100vw - 48px);");
  });

  /** **And the breakdown is not centred with it** (M6-AUD-013). That surface is deliberately
   *  non-modal and stays hung from its own trigger, where a reader can see which figure it explains;
   *  copying the centring to it is the mistake the settings stylesheet warns against by name. */
  it("leaves the breakdown's popover hung from its own trigger", () => {
    const surface = lastBlockFor(BREAKDOWN_CSS, ".surface");

    expect(surface).toContain("position: absolute;");
    expect(surface).toContain("right: 24px;");
    expect(surface).toContain("left: auto;");
    expect(surface).not.toContain("margin-inline: auto;");
  });
});
