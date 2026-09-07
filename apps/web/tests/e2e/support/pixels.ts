import type { Page } from "@playwright/test";

/**
 * Counting what is actually on screen, for the specs that make a *visual* claim.
 *
 * `docs/best-practices/browser-and-visual-qa.md`: a screenshot is evidence only after it has been
 * inspected. `Buffer.compare(a, b) !== 0` is not an inspection — it passes when one pixel of one
 * antialiased edge moved, which is how a selection highlight nobody could see shipped green.
 *
 * **Two instruments live here, and only one of them is a measurement of a thing.**
 *
 * `countChangedPixels` compares two captures of the *same* rectangle taken in two states of the
 * running app and counts the pixels that moved further than a measured noise floor. That is what
 * wave 6V made the primary instrument (ADR 0091 decision 6): the customer's own colours are in
 * **both** frames, so no finish, decor or free colour can be mistaken for the thing being counted.
 * It answers "how much of this patch changed when I selected that body", which is the question the
 * specs were always asking.
 *
 * `countPixels` counts pixels near a named colour. **It identifies a thing by its colour, which is
 * only sound while the product's colours are closed** — and since wave 6R they are not (ADR 0078
 * decision 1 gives MDF a picker that admits every six-digit hex). It survives for exactly one use:
 * as the **witness** in the cases that demonstrate the break, where a spec paints a front the
 * counter's own colour and records the large count it wrongly reports. Every `PixelTest` below
 * carries that use and the fixture property it would otherwise need.
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

/** One capture of one rectangle, kept as the PNG Playwright produced so it can be measured more
 *  than once — by the differencing counter and, in the witness cases, by the colour counter too,
 *  on the very same bytes. */
export interface CapturedPatch {
  readonly encoded: string;
  readonly clip: PixelRect;
}

export type PixelTest =
  | {
      /** Within `tolerance` of `color` in RGB, as a Euclidean ball — never equality, because the
       *  renderer antialiases every edge it draws.
       *
       *  **The witness instrument, retired from measurement by wave 6V.** Its callers passed
       *  `SELECTION_HIGHLIGHT_COLOR`, and since wave 6R a customer can paint a front that exact hex
       *  through MDF's RAL picker — at which point this counts the whole front as selection pixels
       *  with nothing selected. A spec that still uses it either paints such a front deliberately,
       *  to record what the counter reports, or asserts the fixture property that keeps it sound. */
      readonly kind: "near";
      readonly color: readonly [number, number, number];
      readonly tolerance: number;
    }
  | {
      /** Blue by at least this much more than red.
       *
       *  **The witness instrument for the void's fill, retired from measurement by wave 6V.** It
       *  rested on the kitchen's *declared* palette being warm throughout — paper, the six PAL
       *  decors, the two veneer woods — so that nothing in it but the void meshes read blue. ADR
       *  0078 decision 1 ended that: a front painted `#2d5fff` measures blue-over-red 210 against a
       *  threshold of 25, in a patch that contains no void at all. */
      readonly kind: "blueTint";
      readonly minExcess: number;
    }
  | {
      /** Red by at least this much more than **both** other channels.
       *
       *  **The witness instrument for ADR 0065's overflow mark, retired from measurement by wave
       *  6V.** The mark is a 32 % wash over whatever the body underneath is painted with, so the
       *  pixel it produces is a blend and is never within counting distance of `OVERFLOW_MARK_COLOR`
       *  itself — which is why it was a tint test rather than a `near` test in the first place.
       *
       *  It compares against **two** channels where `blueTint` compares against one because the
       *  kitchen is warm, so oak and clay are already red-over-blue everywhere. That is not enough:
       *  *"red over green **and** blue is what only the mark is"* has been false since M1
       *  (ADR 0091, finding 5). An **unmarked** wood front reaches a red-excess of 78, and every one
       *  of ADR 0071's five wood tints reaches further, to 137 — against a threshold of 50. */
      readonly kind: "redTint";
      readonly minExcess: number;
    };

/** Captures `clip` from the live page, for measuring now or later. */
export async function capturePatch(
  page: Page,
  clip: PixelRect,
): Promise<CapturedPatch> {
  const encoded = (await page.screenshot({ clip })).toString("base64");
  return { encoded, clip };
}

/**
 * **The instrument that survives an open palette**: pixels of `after` that differ from the same
 * pixel of `before` by more than `noiseFloor`, in Euclidean RGB.
 *
 * The two captures must be the same rectangle of the same scene in two states of the app, and
 * everything that is *not* the state under test must be identical between them — the camera, the
 * canvas size, the design, the hover state. What is left is what changed, and because the base
 * colours are present in both frames, a customer's finish cancels out however exotic it is.
 *
 * `noiseFloor` is a **measured** number, not a chosen one: the specs that call this record it
 * against a pair of captures taken with nothing changed at all, in every camera preset.
 */
export async function countChangedPixels(
  page: Page,
  before: CapturedPatch,
  after: CapturedPatch,
  noiseFloor: number,
): Promise<number> {
  requireComparableClips(before.clip, after.clip);
  return page.evaluate(countDifferingPixelsInPage, {
    before: before.encoded,
    after: after.encoded,
    noiseFloor,
  });
}

/** Counts the pixels of an already-taken capture that satisfy `test`. */
export async function countPixelsIn(
  page: Page,
  patch: CapturedPatch,
  test: PixelTest,
): Promise<number> {
  return page.evaluate(countMatchingPixelsInPage, {
    encoded: patch.encoded,
    test,
  });
}

/** Captures `clip` from the live page and counts the pixels in it that satisfy `test`. */
export async function countPixels(
  page: Page,
  clip: PixelRect,
  test: PixelTest,
): Promise<number> {
  return countPixelsIn(page, await capturePatch(page, clip), test);
}

/** A difference between two rectangles of different shapes is not a measurement of anything, and
 *  the failure is silent if the loop simply stops at the shorter one. */
function requireComparableClips(before: PixelRect, after: PixelRect): void {
  if (before.width === after.width && before.height === after.height) return;
  throw new Error(
    `Cannot difference a ${String(before.width)} x ${String(before.height)} patch against a ` +
      `${String(after.width)} x ${String(after.height)} one`,
  );
}

/** Runs inside the browser: decodes both captures and counts the pixels that moved. */
async function countDifferingPixelsInPage({
  before,
  after,
  noiseFloor,
}: {
  before: string;
  after: string;
  noiseFloor: number;
}): Promise<number> {
  const decode = async (encoded: string): Promise<Uint8ClampedArray> => {
    const response = await fetch(`data:image/png;base64,${encoded}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot count pixels: no 2D canvas context");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  };

  const first = await decode(before);
  const second = await decode(after);
  if (first.length !== second.length)
    throw new Error("Cannot difference two captures of different sizes");

  let changed = 0;
  const floorSquared = noiseFloor ** 2;
  for (let offset = 0; offset < first.length; offset += 4) {
    const red = (second[offset] ?? 0) - (first[offset] ?? 0);
    const green = (second[offset + 1] ?? 0) - (first[offset + 1] ?? 0);
    const blue = (second[offset + 2] ?? 0) - (first[offset + 2] ?? 0);
    if (red * red + green * green + blue * blue > floorSquared) changed += 1;
  }
  return changed;
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
