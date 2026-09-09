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
 * `countPixels` counts pixels near a named colour or past a named tint. **It identifies a thing by
 * its colour, which is only sound while the product's colours are closed** — and since wave 6R they
 * are not (ADR 0078 decision 1 gives MDF a picker that admits every six-digit hex). Wave 6V left it
 * two kinds of caller and no third:
 *
 * - the **witness** cases, where a spec paints a front the counter's own colour and records the
 *   large count it wrongly reports (`pixel-counter-witness.desktop.e2e.spec.ts`);
 * - the two things a difference cannot see, because they are in **both** frames rather than in one
 *   — a void's fill, which an unselected void carries too, and ADR 0065's mark, which follows from
 *   a room measurement no control in M6 changes. Each of those callers **asserts the fixture
 *   property that makes the count sound** before taking it (work item 3, ADR 0091 decision 4a).
 *
 * Every `PixelTest` below names its surviving use and the property it depends on. **`near` keeps
 * exactly one**: `overflow-mark.e2e.spec.ts` counts the selection highlight through the same
 * rectangle as the mark, to show the two are told apart — and that spec cannot difference, because
 * the flagged total moves the canvas box and the two documents share no rectangle. Everywhere the
 * selection *is* a state the design can be toggled into and out of, `near` has been replaced by
 * `countChangedPixels`.
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
       *  with nothing selected. Measured on the running app, not argued: a kitchen wearing
       *  `#ff2d2d` reports **16 061** pixels of highlight in `editor-rail.desktop.e2e.spec.ts`'s
       *  sink patch with that cabinet **not** selected, against the 3 603 the same counter reports
       *  on the seeded design when it really is. A spec that still uses it either paints such a
       *  front deliberately, to record what the counter reports, or asserts the fixture property
       *  that keeps it sound. */
      readonly kind: "near";
      readonly color: readonly [number, number, number];
      readonly tolerance: number;
    }
  | {
      /** Blue by at least this much more than red.
       *
       *  **Still a measurement, and the only one, because the fill is not a state.** An unselected
       *  void is blue too, so the fill is present in both frames of every pair and no difference can
       *  see it. It survives on the condition wave 6V's work item 3 attaches to every colour-keyed
       *  counter: the spec asserts the fixture property first.
       *
       *  The property is that nothing in the kitchen but the void meshes reads blue, and it used to
       *  rest on the *declared* palette being warm throughout — paper, the six PAL decors, the two
       *  veneer woods. ADR 0078 decision 1 ended that: a front painted `#2d5fff` is blue over red by
       *  210 in the model, and on the running app it puts **16 599** counted pixels into a patch
       *  that contains no void at all. So the premise is now a fact about which document is on
       *  screen, and `editor-rail.desktop.e2e.spec.ts` asserts it against that document. */
      readonly kind: "blueTint";
      readonly minExcess: number;
    }
  | {
      /** Red by at least this much more than **both** other channels.
       *
       *  **Still the mark's measurement, because the mark is not a state the app toggles.** It
       *  follows from `room.widthMm`, which no M6 control changes, so the only "before" is a second
       *  document — and the flagged total grows the price row, moving the canvas box, so the two do
       *  not share a rectangle to difference. `overflow-mark.e2e.spec.ts` carries the measurement
       *  and, under work item 3, the two premises below as assertions.
       *
       *  The mark is a 32 % wash over whatever the body underneath is painted with, so the pixel it
       *  produces is a blend and is never within counting distance of `OVERFLOW_MARK_COLOR` itself —
       *  which is why it was a tint test rather than a `near` test in the first place. It compares
       *  against **two** channels where `blueTint` compares against one because the kitchen is warm,
       *  so oak and clay are already red-over-blue everywhere.
       *
       *  **Three things other than a mark clear the old threshold of 50, and the counter is sound
       *  only where none of them is on screen.** A `SELECTION_HIGHLIGHT_COLOR` outline is red over
       *  both other channels by 210 and is counted as a wash — 6 454 pixels of one, measured on a
       *  body the document says is not marked — so the count is taken with nothing selected. A
       *  front painted `#ff2d2d` reports 16 416 with no mark anywhere, so the count is taken on a
       *  document that wears no finish.
       *
       *  The third is ADR 0091 finding 5's own: **the woods reach it, and the reading that said
       *  otherwise was of the wrong document.** See `MARK_MIN_RED_EXCESS_OVER_ANY_FINISH` below for
       *  what a counter that may meet a wood has to clear, and for why the one gate that photographs
       *  a white kitchen is allowed a lower number. */
      readonly kind: "redTint";
      readonly minExcess: number;
    };

/**
 * **The red excess a pixel has to carry before a spec that may be photographing a wood calls it
 * ADR 0065's mark**, declared once so the two witness specs cannot come to disagree about where the
 * wash starts.
 *
 * **It was 50, and 50 was never sound over a wood.** ADR 0091 finding 5 predicted the woods from the *model*
 * colours — untinted oak at 78 — and the renderer was said not to reach it, on the strength of a
 * walnut kitchen measuring 0, 0 and 3. That reading was taken through a fixture that wrote no
 * kitchen colour, so its structural bodies fell back to `material.veneer`'s declared default and it
 * was **oak** that was photographed, not walnut. Measured 2026-09-09 at 1440 × 900 on a genuinely
 * oak document with no mark anywhere on it: **194 041 / 193 783 / 278 066** pixels past 50 in the
 * three camera presets, against a ceiling of 40 — the instrument reporting a mark on a kitchen that
 * has none, nearly all of them ordinary door fronts.
 *
 * The separation the same sweep measured, over every document and preset:
 *
 * | document    | max excess unmarked | ≥ 77 unmarked | ≥ 77 marked            |
 * | ----------- | ------------------- | ------------- | ---------------------- |
 * | walnut      |                  51 |     0 / 0 / 0 | 58 222 / 57 048 / 90 079 |
 * | oak         |                  76 |     0 / 0 / 0 | 59 348 / 58 310 / 92 250 |
 *
 * 77 separates every document measured and 80 is that with headroom: the unmarked ceilings are dense
 * edges rather than sampling luck — walnut piles 27 879 pixels at exactly 45 and oak 51 841 at
 * exactly 72 — so nothing is sitting just under 80 waiting to cross it.
 * `pixel-counter-witness.adversarial.desktop.e2e.spec.ts` photographs the oak kitchen and holds it
 * here, so the gap cannot reopen silently.
 *
 * **It is not free, and it is therefore not the only threshold in the tree.** The wash is 32 % of
 * `OVERFLOW_MARK_COLOR` over whatever the body is painted, so over a **white** kitchen it carries
 * only its own share of the red and almost none of it survives 80. Measured 2026-09-09 at 390 × 844
 * through `overflow-mark.e2e.spec.ts`'s own rectangle, on that spec's own document — six bodies
 * genuinely marked, the control reading **0 at every one of these thresholds**:
 *
 * | min excess |    40 |    50 |    55 |    70 |    76 |    80 |
 * | ---------- | ----- | ----- | ----- | ----- | ----- | ----- |
 * | marked     | 27 865 | 7 494 | 1 404 | 1 136 |   311 |   252 |
 *
 * So no single number both stays silent on an unmarked oak kitchen (which reaches 76) and keeps the
 * wash's signal on a white one (which is down to 252 by 77). The threshold is a property of **what
 * the document under the wash is painted**, and the two callers differ in exactly that: the witness
 * specs photograph woods and take no per-document control, so they need this constant; the shipped
 * mark gate photographs one white document and measures its own unmarked control through the same
 * rectangle, so it keeps a lower threshold and says why beside it.
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
