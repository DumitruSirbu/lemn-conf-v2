import type { Page } from "@playwright/test";

/**
 * Counting what is actually on screen, for the specs that make a *visual* claim.
 *
 * `docs/best-practices/browser-and-visual-qa.md`: a screenshot is evidence only after it has been
 * inspected. `Buffer.compare(a, b) !== 0` is not an inspection — it passes when one pixel of one
 * antialiased edge moved, which is how a selection highlight nobody could see shipped green. These
 * helpers decode a captured patch and count the pixels in it that match a colour, so a spec can
 * assert *how much* of something is on screen and *where*.
 *
 * The decode runs in the page rather than in Node: this repository has no PNG decoder among its
 * dependencies, and adding one to satisfy a test is a supply-chain change made for a test's
 * convenience. Chromium already has `createImageBitmap` and a 2D canvas, and the image being
 * decoded is one Playwright just captured from that same browser.
 *
 * No assertion lives here — only measurement.
 */

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type PixelTest =
  | {
      /** Within `tolerance` of `color` in RGB, as a Euclidean ball — never equality, because the
       *  renderer antialiases every edge it draws.
       *
       *  **Valid only on a fixture whose fronts wear no finish** (ADR 0091, finding 5). Its callers
       *  pass `SELECTION_HIGHLIGHT_COLOR`, and since wave 6R a customer can paint a front that
       *  exact hex through MDF's RAL picker, at which point this counts the whole front as
       *  selection pixels with nothing selected. Wave 6V replaces the measurement. */
      readonly kind: "near";
      readonly color: readonly [number, number, number];
      readonly tolerance: number;
    }
  | {
      /** Blue by at least this much more than red. The kitchen's *declared* palette is warm
       *  throughout — paper, the six PAL decors, the two veneer woods — so nothing in it but the
       *  void meshes reads blue, and a translucent fill's rendered colour cannot be named as a
       *  constant.
       *
       *  **The palette is no longer closed** (ADR 0091, finding 5). ADR 0078 decision 1 lets MDF
       *  wear any free colour, and a front painted `#2d5fff` measures blue-over-red 210 against a
       *  threshold of 25. Wave 6V replaces the measurement. */
      readonly kind: "blueTint";
      readonly minExcess: number;
    }
  | {
      /** Red by at least this much more than **both** other channels.
       *
       *  The same problem as `blueTint` and the same answer, for ADR 0065's overflow mark: the mark
       *  is a 32 % wash over whatever the body underneath is painted with, so the pixel it produces
       *  is a blend and is never within counting distance of `OVERFLOW_MARK_COLOR` itself. Measured
       *  on the real render, the nearest scene pixel to that constant moves only from 108.71 to
       *  62.32 when the wash covers thousands of pixels — so a `near` test would have to open its
       *  ball wider than the gap to the selection highlight, at which point it counts both.
       *
       *  It compares against **two** channels where `blueTint` compares against one, and that is
       *  forced by the same palette fact from the other side: the kitchen is warm, so oak and clay
       *  are already red-over-blue everywhere. Measured on the seeded design at 390 x 844: zero
       *  pixels clear 50 in any camera preset, in every one of the three presets, and 7 875 clear
       *  it once a body is marked.
       *
       *  **"Red over green *and* blue is what only the mark is" is false, and has been since M1**
       *  (ADR 0091, finding 5). An *unmarked* wood front reaches a red-excess of 78 — and every one
       *  of ADR 0071's five wood tints reaches further, to 137 — against a threshold of 50. The
       *  zero above is a true fact about the seeded fixture, which wears no finish, and not about
       *  the palette. Wave 6V replaces the measurement. */
      readonly kind: "redTint";
      readonly minExcess: number;
    };

/** Captures `clip` from the live page and counts the pixels in it that satisfy `test`. */
export async function countPixels(
  page: Page,
  clip: PixelRect,
  test: PixelTest,
): Promise<number> {
  const encoded = (await page.screenshot({ clip })).toString("base64");
  return page.evaluate(countMatchingPixelsInPage, { encoded, test });
}

/** Runs inside the browser: decodes the captured patch and counts matches. */
async function countMatchingPixelsInPage({
  encoded,
  test,
}: {
  encoded: string;
  test: PixelTest;
}): Promise<number> {
  const response = await fetch(`data:image/png;base64,${encoded}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot count pixels: no 2D canvas context");
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);

  let matches = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    if (test.kind === "near") {
      const [targetRed, targetGreen, targetBlue] = test.color;
      const distanceSquared =
        (red - targetRed) ** 2 +
        (green - targetGreen) ** 2 +
        (blue - targetBlue) ** 2;
      if (distanceSquared <= test.tolerance ** 2) matches += 1;
    } else if (test.kind === "blueTint") {
      if (blue - red >= test.minExcess) matches += 1;
    } else if (Math.min(red - green, red - blue) >= test.minExcess) {
      matches += 1;
    }
  }
  return matches;
}

/** Splits a packed hex colour into the triple `countPixels` compares against. */
export function toRgb(hex: number): readonly [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}
