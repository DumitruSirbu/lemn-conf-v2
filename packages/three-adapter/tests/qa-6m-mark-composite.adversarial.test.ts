// What the overflow mark actually puts on screen, as opposed to what its constant declares.
//
// `overflow-mark.test.ts` pins `OVERFLOW_MARK_COLOR` at 90 units from `SELECTION_HIGHLIGHT_COLOR`
// and concludes that the mark can never be counted as a highlight. **That is arithmetic on two
// constants, and no pixel on screen is either of them.** The wash is translucent: every pixel it
// covers is `OVERFLOW_MARK_OPACITY` of the mark over `1 - OVERFLOW_MARK_OPACITY` of the body
// underneath, and it is that blend the desktop e2e's counter and `pixels.ts`'s void counter see. A
// wash over a warm, bright oak front composites much closer to signal red than the constant does.
//
// So the two predicates the marked pixels have to keep clear of are applied to the **composite**,
// swept over the kitchen's own palette and over the brightness range lighting and tone mapping put
// it through. The measured margins are recorded rather than merely compared, and the counterexample
// — the base colour at which the composite *does* enter the selection's ball — is named and pinned,
// because the argument that saves this wave is "the kitchen contains no such colour", not "the
// composite is always far away".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { FINISH_COLORS } from "../src/finishes.js";
import {
  OVERFLOW_MARK_COLOR,
  OVERFLOW_MARK_OPACITY,
} from "../src/overflow-mark.js";
import { SELECTION_HIGHLIGHT_COLOR } from "../src/selection-outline.js";

/** `editor-rail.desktop.e2e.spec.ts`'s `HIGHLIGHT_TOLERANCE`, and `pixels.ts`'s `near` test is a
 *  Euclidean RGB ball of exactly that radius around `SELECTION_HIGHLIGHT_COLOR`. */
const SELECTION_PIXEL_TOLERANCE = 60;

/** The same spec's `VOID_BLUE_EXCESS`: `pixels.ts` counts a void's translucent fill as any pixel
 *  whose blue exceeds its red by this much. */
const VOID_BLUE_EXCESS = 25;

type Rgb = readonly [number, number, number];

/** Oak has no publishable hex — `FINISH_COLORS` omits it, because it is a texture rather than a
 *  colour — so its two wood tones are read out of the call that builds them. Reading beats
 *  repeating: oak is the warmest thing in the kitchen and therefore the case that matters most, and
 *  a second copy of those hexes is how this sweep would stop tracking the material. */
function oakWoodColors(): readonly [Rgb, Rgb] {
  const source = readFileSync(
    resolve(import.meta.dirname, "../src/kitchen-parts.ts"),
    "utf8",
  );
  const call = /woodTex\("(#[0-9a-f]{6})",\s*"(#[0-9a-f]{6})",\s*7\)/.exec(
    source,
  );
  if (!call?.[1] || !call[2])
    throw new Error("kitchen-parts.ts declares no oak wood texture to read");
  return [rgbOfHex(call[1]), rgbOfHex(call[2])];
}

function rgbOfHex(hex: string): Rgb {
  const packed = new THREE.Color(hex).getHex();
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

function rgbOf(packed: number): Rgb {
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

/** The blend the framebuffer performs: a front-facing, `depthWrite: false` wash at its declared
 *  opacity over whatever the renderer already drew there. */
function composite(base: Rgb): Rgb {
  const mark = rgbOf(OVERFLOW_MARK_COLOR);
  const wash = OVERFLOW_MARK_OPACITY;
  return [0, 1, 2].map(
    (channel) =>
      wash * (mark[channel] ?? 0) + (1 - wash) * (base[channel] ?? 0),
  ) as unknown as Rgb;
}

function distanceTo(colour: Rgb, target: Rgb): number {
  return Math.hypot(
    colour[0] - target[0],
    colour[1] - target[1],
    colour[2] - target[2],
  );
}

/** Every surface colour the kitchen can put behind a marked front: §5.5's four solid finishes, oak's
 *  two wood tones, and the paper and stage greys `globals.css` sets behind the scene. */
const KITCHEN_PALETTE: readonly (readonly [string, Rgb])[] = [
  ...Object.entries(FINISH_COLORS).map(
    ([name, hex]) => [name, rgbOfHex(hex)] as const,
  ),
  ["oak base", oakWoodColors()[0]] as const,
  ["oak grain", oakWoodColors()[1]] as const,
  ["paper", rgbOfHex("#faf8f4")] as const,
  ["stage", rgbOfHex("#f2f0ea")] as const,
];

/** Lighting and ACES tone mapping move a material's declared colour a long way in both directions
 *  before it reaches the framebuffer, so each palette entry is **swept** rather than sampled at its
 *  nominal value — from deep shadow to a highlight that clamps every channel. Carried past the point
 *  where the minimum stops moving: the closest composite lies at 1.85, and extending the sweep to 8
 *  does not find a closer one, so this range contains the worst case rather than merely ending
 *  before it.
 *
 *  Per channel and clamped, which matters: red clamps first on a warm colour, so the far end of the
 *  sweep is not the near end scaled — it is a differently-hued colour, and that is where oak's
 *  composite comes nearest to the selection's red. */
const BRIGHTNESS_FACTORS = Array.from(
  { length: 78 },
  (_, step) => 0.15 + step * 0.05,
);

function litVariants(base: Rgb): Rgb[] {
  return BRIGHTNESS_FACTORS.map(
    (factor) =>
      base.map((channel) =>
        Math.min(255, Math.round(channel * factor)),
      ) as unknown as Rgb,
  );
}

describe("a washed pixel is never counted as a selection pixel", () => {
  const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);

  for (const [name, base] of KITCHEN_PALETTE) {
    it(`stays outside the ball over ${name}, at every brightness`, () => {
      for (const lit of litVariants(base)) {
        expect(
          distanceTo(composite(lit), selection),
          `${name} lit to ${JSON.stringify(lit)}`,
        ).toBeGreaterThan(SELECTION_PIXEL_TOLERANCE);
      }
    });
  }

  it("keeps a measured margin, and it is smaller than the constants' 90", () => {
    // Recorded so a later reader sees the real number rather than re-deriving it from two hexes.
    // The worst case is oak's grain lit to 1.85, where its red has clamped and its green has not:
    // 76.1 against a tolerance of 60. The constants alone are 90 apart, so **a third of the declared
    // headroom is spent by the blend** — which is the whole reason this file exists.
    const closest = Math.min(
      ...KITCHEN_PALETTE.flatMap(([, base]) =>
        litVariants(base).map((lit) => distanceTo(composite(lit), selection)),
      ),
    );

    expect(closest).toBeGreaterThan(SELECTION_PIXEL_TOLERANCE);
    expect(Math.round(closest * 10) / 10).toBe(76.1);
    expect(closest).toBeLessThan(
      distanceTo(rgbOf(OVERFLOW_MARK_COLOR), selection),
    );
  });
});

describe("a washed pixel is never counted as a void's blue fill", () => {
  for (const [name, base] of KITCHEN_PALETTE) {
    it(`reads redder than it is blue over ${name}, at every brightness`, () => {
      for (const lit of litVariants(base)) {
        const [red, , blue] = composite(lit);
        expect(
          blue - red,
          `${name} lit to ${JSON.stringify(lit)}`,
        ).toBeLessThan(VOID_BLUE_EXCESS);
      }
    });
  }
});

describe("the base colours that would break the count, and why the kitchen has none", () => {
  it("only reaches the selection's ball over a saturated red the palette does not contain", () => {
    // The honest statement of the constraint. The composite *can* be counted as a highlight — over a
    // base whose red runs far ahead of its green, which is the one hue `selection-outline.ts` says
    // this kitchen does not contain. Swept over the whole cube rather than argued, and the bound is
    // then compared against the palette's own warmest entry. A finish added inside this region is a
    // product change that has to reckon with the e2e's counter, and this is what says so.
    const selection = rgbOf(SELECTION_HIGHLIGHT_COLOR);
    const offending: Rgb[] = [];
    for (let red = 0; red < 256; red += 3)
      for (let green = 0; green < 256; green += 3)
        for (let blue = 0; blue < 256; blue += 3) {
          const base: Rgb = [red, green, blue];
          if (
            distanceTo(composite(base), selection) <= SELECTION_PIXEL_TOLERANCE
          )
            offending.push(base);
        }

    expect(offending.length).toBeGreaterThan(0);
    const leastSaturated = Math.min(
      ...offending.map((base) => base[0] - base[1]),
    );
    const palestRed = Math.min(...offending.map((base) => base[0]));
    expect(leastSaturated).toBe(102);
    expect(palestRed).toBe(204);

    const warmestInTheKitchen = Math.max(
      ...KITCHEN_PALETTE.flatMap(([, base]) =>
        litVariants(base).map((lit) => lit[0] - lit[1]),
      ),
    );
    expect(warmestInTheKitchen).toBeLessThan(leastSaturated);
  });
});
