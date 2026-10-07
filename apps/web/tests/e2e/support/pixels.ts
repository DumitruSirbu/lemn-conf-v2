import type { Page } from "@playwright/test";

/**
 * Pixel measurement for specs that make a visual claim; no assertion lives here. A screenshot is evidence only after
 * inspection (`docs/best-practices/browser-and-visual-qa.md`), and `Buffer.compare` passes when one antialiased
 * pixel moved.
 *
 * `countChangedPixels` differences two captures of one rectangle in two states of the app: the customer's own colours
 * are in both frames, so no finish can be mistaken for the thing counted. `countPixels` identifies a thing by its
 * colour, which is sound only while the product's colours are closed, and MDF's picker admits every six-digit hex
 * (ADR 0078 decision 1). Its callers are the witness cases and the two things a difference cannot see (a void's
 * fill, ADR 0065's mark), each asserting the fixture property that makes the count sound.
 *
 * The decode runs in the page: this repository has no PNG decoder, and adding one is a supply-chain change.
 */

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One capture of one rectangle, kept as the PNG Playwright produced so it can be measured more than once on the
 *  very same bytes. */
export interface CapturedPatch {
  readonly encoded: string;
  readonly clip: PixelRect;
}

export type PixelTest =
  | {
      /** Within `tolerance` of `color` in RGB (Euclidean), never equality: the renderer antialiases every edge. A
       *  front painted the highlight's exact hex (reachable through MDF's picker) counts as whole-front highlight
       *  with nothing selected, so a caller paints one deliberately as a witness or asserts the fixture property
       *  that keeps the count sound. */
      readonly kind: "near";
      readonly color: readonly [number, number, number];
      readonly tolerance: number;
    }
  | {
      /** Blue by at least this much more than red. A measurement because the fill is not a state: an unselected
       *  void is blue too, so no difference sees it. Sound only where nothing but the void meshes reads blue; a
       *  front painted `#2d5fff` breaks that (ADR 0078 decision 1), so `editor-rail.desktop.e2e.spec.ts` asserts the
       *  premise against its document. */
      readonly kind: "blueTint";
      readonly minExcess: number;
    }
  | {
      /** Red by at least this much more than both other channels. The mark follows from `room.widthMm`, which no
       *  control changes, and the flagged total moves the canvas box, so two documents share no rectangle to
       *  difference. The mark is a 32 % wash, so its pixels are blends, never within counting distance of
       *  `OVERFLOW_MARK_COLOR` itself. Sound only with nothing selected (the outline's red core is red over both
       *  channels by 210) and on a document that wears no loud finish; see `MARK_MIN_RED_EXCESS_OVER_ANY_FINISH`
       *  for woods. */
      readonly kind: "redTint";
      readonly minExcess: number;
    };

/**
 * The red excess a pixel must carry before a spec that may be photographing a wood calls it ADR 0065's mark,
 * declared once so the witness specs agree on where the wash starts. An unmarked oak kitchen reaches 76 (walnut 51),
 * so 77 is the lowest separating threshold and 80 leaves headroom. The adversarial pixel-counter-witness spec
 * photographs oak and holds it here.
 *
 * It is not the only threshold: over a white kitchen the 32 % wash keeps only 252 marked pixels at 80, so
 * `overflow-mark.e2e.spec.ts`, which measures its own unmarked control through the same rectangle, keeps a lower one.
 */
export const MARK_MIN_RED_EXCESS_OVER_ANY_FINISH = 80;

/** Captures `clip` from the live page, for measuring now or later. */
export async function capturePatch(
  page: Page,
  clip: PixelRect,
): Promise<CapturedPatch> {
  const encoded = (await page.screenshot({ clip })).toString("base64");
  return { encoded, clip };
}

/**
 * Pixels of `after` that differ from the same pixel of `before` by more than `noiseFloor` (Euclidean RGB). The
 * captures must be the same rectangle of the same scene and identical in everything but the state under test
 * (camera, canvas size, design, hover). `noiseFloor` is measured, not chosen: the calling specs record it against two
 * captures with nothing changed, in every camera preset.
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
