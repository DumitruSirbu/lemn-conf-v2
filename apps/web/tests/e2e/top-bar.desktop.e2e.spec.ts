import { expect } from "@playwright/test";

import { roAccountControl } from "../support/romanian-content.e2e";
import { paintedTextOf } from "./support/painted-text";
import { openSeededDesign, test } from "./support/seeded-design";

/**
 * The refreshed top bar on the desktop shell, measured at both ends of its branch (wave W4).
 *
 * **900 as well as 1440.** The header shares grid row 1 with the price cell across a
 * `minmax(0, 1fr)` column, so its tightest case is the first pixel of the `min-width: 900px` branch
 * and not the width the project happens to run at — the same reason
 * `top-bar-pill-containment.desktop.e2e.spec.ts` gives for measuring both. 900 x 500 is also the
 * short viewport `--popover-top` was introduced for.
 *
 * ## Frame D2A draws a 76 px bar, and since 2026-09-07 so does this
 *
 * The band is not free: `.screen` is a `100dvh` grid whose only flexible row is the stage, so every
 * pixel the band takes is a pixel of scene. Wave W4 asserted 55 here and recorded the deviation,
 * because raising the band to the frame's height is an owner's call about canvas rather than an
 * implementer's about fidelity, and nothing had ruled on it.
 *
 * **The owner has now ruled: on desktop a taller top bar is fine, and the 21 px is accepted.** So
 * this file asserts the frame's height beside its arrangement and typography, and asserts the cost
 * as a number.
 *
 * ## And since ADR 0104 there is **one** band, not two
 *
 * The settings strip's own row is withdrawn (decision 2), so the partition below has two terms
 * rather than three: the band and the canvas account for the whole viewport. That is the assertion
 * that catches a second band reappearing by accident — which is what this wave exists to remove.
 */

const SCENE_SETTLE_MS = 2000;

/** The branch's own first pixel and the width the project runs at. The heights differ too: 500 is
 *  the short viewport, where a band that grew would be felt first. */
const DESKTOP_VIEWPORTS = [
  { width: 900, height: 500 },
  { width: 1440, height: 900 },
] as const;

/** What the header band measured at the base commit, and what the price cell beside it was tuned
 *  against. Kept as the figure the ruled cost below is measured from. */
const BAND_HEIGHT_AT_BASE_COMMIT_PX = 55;

/** Frame D2A's own `height: 76px`, **declared rather than summed** since ADR 0104: the frame's
 *  `Verifică designul` is 48 px and does not fit inside the 40 px chip the old sum was built around
 *  (`configure.module.css`). */
const RULED_BAND_HEIGHT_PX = 76;

/** What the ruling spends. The stage is `.screen`'s only flexible row, so the band's gain is the
 *  canvas's loss, at every desktop width. */
const RULED_CANVAS_COST_PX =
  RULED_BAND_HEIGHT_PX - BAND_HEIGHT_AT_BASE_COMMIT_PX;

/** The withdrawn settings strip's own desktop band, measured at `6d53d38` before this wave: 45.00 px
 *  at 900, 1000, 1100, 1440 and 1920, with the canvas beginning at y = 121 at every one of them. */
const STRIP_BAND_AT_BASE_COMMIT_PX = 45;

const SUB_PIXEL_SLACK = 0.5;

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/**
 * **Waits for the resize the test just asked for to have reached the canvas.**
 *
 * `setViewportSize` resolves when the browser has been told the new size, not when the page has
 * laid out at it and not when R3F's `ResizeObserver` has re-sized the drawing buffer. Measuring
 * straight after it is a race, and it is the race that made this file's own 900 x 500 case
 * intermittent: caught on 2026-09-09, `measureScreen` reported `viewport.height` 500 — the document
 * had the new size — beside `canvas` **779**, the height the canvas still had from the 1440 x 900
 * case before it. Expected 379, received 779, and the 400 is exactly the 900 - 500 the canvas had
 * not yet given up.
 *
 * Two conditions, and neither is one of this file's assertions — waiting for the thing under test to
 * be true and then asserting it proves nothing. The first is that the **document** reports the size
 * that was asked for, which is layout having happened. The second is that the canvas's own height is
 * unchanged across three consecutive animation frames, which is the observer having delivered and
 * the renderer having stopped moving. A canvas that never settles times out here rather than being
 * measured mid-flight.
 */
async function waitForTheViewportToReachTheCanvas(
  page: import("@playwright/test").Page,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  await page.waitForFunction(
    (expected) =>
      document.documentElement.clientWidth === expected.width &&
      document.documentElement.clientHeight === expected.height,
    viewport,
  );
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    const nextFrame = () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          resolve(canvas.getBoundingClientRect().height);
        });
      });
    return Promise.all([nextFrame(), nextFrame(), nextFrame()]).then(
      ([first, second, third]) => first === second && second === third,
    );
  });
}

async function measureScreen(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const boxOf = (selector: string): DOMRect => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${selector} on the page`);
      return element.getBoundingClientRect();
    };
    const header = boxOf("header");
    const chip = boxOf('[data-testid="top-bar-locale"]');
    const pill = boxOf('[data-testid="global-settings-trigger"]');
    const cta = boxOf('[data-testid="review-cta"]');

    return {
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      header: header.height,
      headerRight: header.right,
      canvas: boxOf("canvas").height,
      canvasTop: boxOf("canvas").top,
      chip: { right: chip.right, height: chip.height, left: chip.left },
      pill: { left: pill.left, right: pill.right, height: pill.height },
      cta: { left: cta.left, right: cta.right, height: cta.height },
      // **Every control in the row, not only the nav's own spans.** The row carries five cells since
      // ADR 0104 decision 2 — the pill, the price and the CTA joined the three that were here — and a
      // clip predicate that read one cell would be blind to the four that this wave added.
      clippedSpans: [
        ...document.querySelectorAll(
          "main header span, main [data-testid] span",
        ),
      ]
        .filter((span) => span.textContent.trim().length > 0)
        .filter((span) => span.scrollWidth - span.clientWidth > 1)
        .map((span) => span.textContent),
    };
  });
}

for (const viewport of DESKTOP_VIEWPORTS)
  test.describe(`at ${String(viewport.width)} x ${String(viewport.height)}`, () => {
    test("draws the band at frame D2A's own 76 px, as the owner ruled", async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await waitForTheViewportToReachTheCanvas(page, viewport);
      const measured = await measureScreen(page);

      expect(measured.header).toBe(RULED_BAND_HEIGHT_PX);
      // Frame D2A's chip, at its own drawn height, centred in that band. The chip is unchanged by
      // the ruling: the band grew around it, which is how the frame itself draws the two.
      expect(measured.chip.height).toBe(40);
      // The two controls the frame draws beside it, at their own declared heights — and the CTA's 48
      // is what killed the sum this band used to be (ADR 0104).
      expect(measured.pill.height).toBe(40);
      expect(measured.cta.height).toBe(48);
    });

    test("draws frame D2A's own order across the row: pill, price, CTA, locale", async ({
      page,
    }) => {
      // Criterion 7. The frame's arrangement is a fact about left edges, so that is what is
      // measured; the three dividers between them are `::before` pseudo-elements and are asserted by
      // the stylesheet gate rather than here.
      await page.setViewportSize(viewport);
      await waitForTheViewportToReachTheCanvas(page, viewport);
      const measured = await measureScreen(page);

      expect(measured.pill.left).toBeLessThan(measured.cta.left);
      expect(measured.cta.left).toBeLessThan(measured.chip.left);
      expect(measured.chip.right).toBeLessThanOrEqual(
        measured.viewport.width + SUB_PIXEL_SLACK,
      );
    });

    test("draws the locale chip at the row's right-hand end, inside the screen", async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await waitForTheViewportToReachTheCanvas(page, viewport);
      const measured = await measureScreen(page);

      expect(measured.chip.right).toBeLessThanOrEqual(
        measured.viewport.width + SUB_PIXEL_SLACK,
      );
      // **The chip is a cell of its own now** (ADR 0104 decision 2), placed after the CTA by the
      // grid rather than pushed by `margin-left: auto` inside the header — so what says "at the
      // row's right-hand end" is its distance from the screen's edge, not from the nav's.
      expect(measured.viewport.width - measured.chip.right).toBeLessThanOrEqual(
        28 + SUB_PIXEL_SLACK,
      );
      expect(measured.chip.left).toBeGreaterThan(measured.headerRight);
    });

    test("cuts none of the row's own copy", async ({ page }) => {
      // The wordmark, the pill and the title all take `flex: 0 0 auto` on this shell, so the header
      // cell has to be wide enough for them beside the price cell. At 900 that is the tight case,
      // and this is the assertion that fails if it stops being true.
      //
      // **The reservation this comment used to carry has been discharged by the owner.** It said:
      // *"If it ever does fail here, the wordmark is the item that would have to give … Dropping it
      // is a copy decision under the owner's Gate O1, not an implementer's, so this stays an
      // assertion rather than a workaround."* On 2026-09-09 the question went to the owner with a
      // measurement and **they ruled that the wordmark drops** below the width at which the pill can
      // still show one whole setting name (ADR 0104 decision 8, give C). So at 900 this row draws no
      // wordmark — and this assertion is stronger for it: nothing that *is* drawn may be cut, at
      // either width, and the pill's own label is the one exception the ladder allows and does not
      // need here.
      await page.setViewportSize(viewport);
      await waitForTheViewportToReachTheCanvas(page, viewport);
      const measured = await measureScreen(page);

      expect(measured.clippedSpans).toEqual([]);
    });

    test("leaves the scene the viewport less one band, and gains the withdrawn strip's row", async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await waitForTheViewportToReachTheCanvas(page, viewport);
      const measured = await measureScreen(page);

      // **The partition, and it now has two terms.** ADR 0104 decision 2 withdrew the settings
      // strip's row, so the band and the canvas account for the whole viewport — which is the
      // assertion that catches a second band reappearing, at any width, by any route.
      expect(measured.header + measured.canvas).toBeCloseTo(
        measured.viewport.height,
        0,
      );
      expect(measured.canvasTop).toBeCloseTo(RULED_BAND_HEIGHT_PX, 0);

      // The scene against the base commit: it pays the ruled 21 px for the frame's band and is given
      // back the 45 px strip band measured at `6d53d38`, so it is **24 px taller** than it was.
      const canvasAtBaseCommit =
        measured.viewport.height -
        BAND_HEIGHT_AT_BASE_COMMIT_PX -
        STRIP_BAND_AT_BASE_COMMIT_PX;

      expect(measured.canvas).toBeCloseTo(
        canvasAtBaseCommit +
          STRIP_BAND_AT_BASE_COMMIT_PX -
          RULED_CANVAS_COST_PX,
        0,
      );
      expect(measured.canvas).toBeGreaterThan(canvasAtBaseCommit);
    });
  });

/** The visitor's link is decided by the same measurement as the pill's ladder (ADR 0104 decision 8), so these two widths
 *  are chosen well clear of where it changes: 900 is the branch's first pixel, 1440 the width the project runs at. */
const VISITOR_LINK_FORMS = [
  { viewport: { width: 900, height: 500 }, form: "glyph" },
  { viewport: { width: 1440, height: 900 }, form: "words" },
] as const;

const TOUCH_TARGET_PX = 44;

for (const { viewport, form } of VISITOR_LINK_FORMS)
  test(`draws the visitor's link as ${form} at ${String(viewport.width)} x ${String(viewport.height)}, named by its words`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await waitForTheViewportToReachTheCanvas(page, viewport);
    const link = page.getByTestId("top-bar-account-sign-in");

    await expect(link).toHaveAccessibleName(roAccountControl.signIn);
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
    if (form === "glyph") {
      expect(box?.width ?? 0).toBeCloseTo(TOUCH_TARGET_PX, 0);
      expect(await paintedTextOf(link)).toBe("");
    } else {
      expect(box?.width ?? 0).toBeGreaterThan(TOUCH_TARGET_PX);
      expect(await paintedTextOf(link)).toBe(roAccountControl.signIn);
    }
  });
