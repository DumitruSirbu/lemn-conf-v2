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
       *  renderer antialiases every edge it draws. */
      readonly kind: "near";
      readonly color: readonly [number, number, number];
      readonly tolerance: number;
    }
  | {
      /** Blue by at least this much more than red. The kitchen's palette is warm throughout —
       *  paper, oak, clay, sage, white and graphite — so nothing in it but the void meshes reads
       *  blue, and a translucent fill's rendered colour cannot be named as a constant. */
      readonly kind: "blueTint";
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
    } else if (blue - red >= test.minExcess) {
      matches += 1;
    }
  }
  return matches;
}

/** Splits a packed hex colour into the triple `countPixels` compares against. */
export function toRgb(hex: number): readonly [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}
