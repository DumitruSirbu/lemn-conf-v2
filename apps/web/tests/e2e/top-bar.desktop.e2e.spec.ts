import { expect, test } from "@playwright/test";

/**
 * The refreshed top bar on the desktop shell, measured at both ends of its branch (wave W4).
 *
 * **900 as well as 1440.** The header shares grid row 1 with the price cell across a
 * `minmax(0, 1fr)` column, so its tightest case is the first pixel of the `min-width: 900px` branch
 * and not the width the project happens to run at — the same reason
 * `settings-strip-containment.desktop.e2e.spec.ts` gives for measuring both. 900 x 500 is also the
 * short viewport `--popover-top` was introduced for.
 *
 * ## Frame D2A draws a 76 px bar and this asserts 55, deliberately
 *
 * The band is not free: `.screen` is a `100dvh` grid whose only flexible row is the stage, and
 * `price-bar.module.css` already tuned the desktop price cell's padding to "keep the figure's box
 * inside the 55 px the header row already measured". The frame affords 76 px because it carries the
 * settings chips, the price, the CTA **and** the locale chip in one band; ADR 0094 decision 2 moved
 * the chips into a full-width row of their own here, spending ~44 px of canvas to do it. Taking the
 * frame's height without the frame's contents would spend 21 px more and buy nothing.
 *
 * So this file asserts the frame's **arrangement and typography** inside the height the row already
 * had. Raising it to 76 is an owner's call about canvas, not an implementer's about fidelity, and
 * `docs/decisions/` records no ruling on it.
 */

const SCENE_SETTLE_MS = 2000;

/** The branch's own first pixel and the width the project runs at. The heights differ too: 500 is
 *  the short viewport, where a band that grew would be felt first. */
const DESKTOP_VIEWPORTS = [
  { width: 900, height: 500 },
  { width: 1440, height: 900 },
] as const;

/** What the header band measured at the base commit, and what the price cell beside it was tuned
 *  against. Not frame D2A's 76 — see the note above. */
const BAND_HEIGHT_AT_BASE_COMMIT_PX = 55;

const SUB_PIXEL_SLACK = 0.5;

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function measureScreen(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const boxOf = (selector: string): DOMRect => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${selector} on the page`);
      return element.getBoundingClientRect();
    };
    const strip = document.querySelector('[data-testid="global-settings"]');
    const band = strip?.parentElement;
    if (!band) throw new Error("the settings strip has no band around it");
    const header = boxOf("header");
    const chip = boxOf('[data-testid="top-bar-locale"]');

    return {
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      header: header.height,
      headerRight: header.right,
      settings: band.getBoundingClientRect().height,
      canvas: boxOf("canvas").height,
      chip: { right: chip.right, height: chip.height },
      // The wordmark takes the mobile back control's slot on this shell; both are addressed through
      // the row's own children rather than by a CSS-module hash no spec can name.
      clippedSpans: [...document.querySelectorAll("header span")]
        .filter((span) => span.textContent.trim().length > 0)
        .filter((span) => span.scrollWidth - span.clientWidth > 1)
        .map((span) => span.textContent),
    };
  });
}

for (const viewport of DESKTOP_VIEWPORTS)
  test.describe(`at ${String(viewport.width)} x ${String(viewport.height)}`, () => {
    test("keeps the band at the height the row already had", async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const measured = await measureScreen(page);

      expect(measured.header).toBe(BAND_HEIGHT_AT_BASE_COMMIT_PX);
      // Frame D2A's chip, at its own drawn height, inside that band.
      expect(measured.chip.height).toBe(40);
    });

    test("draws the locale chip at the row's right-hand end, inside the screen", async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const measured = await measureScreen(page);

      expect(measured.chip.right).toBeLessThanOrEqual(
        measured.viewport.width + SUB_PIXEL_SLACK,
      );
      // `margin-left: auto` puts it against the header cell's own right edge, which is what "pushed
      // right" means once the price cell takes the rest of the row.
      expect(measured.chip.right).toBeLessThanOrEqual(
        measured.headerRight + SUB_PIXEL_SLACK,
      );
      expect(measured.chip.right).toBeGreaterThan(measured.headerRight - 30);
    });

    test("cuts none of the row's own copy", async ({ page }) => {
      // The wordmark, the pill and the title all take `flex: 0 0 auto` on this shell, so the header
      // cell has to be wide enough for them beside the price cell. At 900 that is the tight case,
      // and this is the assertion that fails if it stops being true.
      await page.setViewportSize(viewport);
      const measured = await measureScreen(page);

      expect(measured.clippedSpans).toEqual([]);
    });

    test("leaves the scene's canvas no shorter than the base commit left it", async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const measured = await measureScreen(page);

      // Measured on the canvas, which is the thing the criterion is about. On this shell the price
      // shares the header's row, so the bands above the scene are the header row and the settings
      // strip and nothing else.
      const canvasAtBaseCommit =
        measured.viewport.height -
        BAND_HEIGHT_AT_BASE_COMMIT_PX -
        measured.settings;

      expect(measured.canvas).toBeGreaterThanOrEqual(canvasAtBaseCommit);
      expect(measured.header + measured.settings + measured.canvas).toBeCloseTo(
        measured.viewport.height,
        0,
      );
    });
  });
