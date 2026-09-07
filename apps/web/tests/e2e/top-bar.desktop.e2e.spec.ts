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
 * ## Frame D2A draws a 76 px bar, and since 2026-09-07 so does this
 *
 * The band is not free: `.screen` is a `100dvh` grid whose only flexible row is the stage, so every
 * pixel the band takes is a pixel of scene. Wave W4 asserted 55 here and recorded the deviation,
 * because raising the band to the frame's height is an owner's call about canvas rather than an
 * implementer's about fidelity, and nothing had ruled on it.
 *
 * **The owner has now ruled: on desktop a taller top bar is fine, and the 21 px is accepted.** So
 * this file asserts the frame's height beside its arrangement and typography, and asserts the cost
 * as a number — the canvas is the viewport less this band and the settings strip, 21 px shorter than
 * the base commit left it, with nothing unaccounted for in between.
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

/** Frame D2A's own bar, taken on the owner's 2026-09-07 ruling: `17.5 + 40 + 17.5` of padding around
 *  the locale chip, plus the band's 1 px rule (`configure.module.css`). */
const RULED_BAND_HEIGHT_PX = 76;

/** What the ruling spends. The stage is `.screen`'s only flexible row, so the band's gain is the
 *  canvas's loss, at every desktop width. */
const RULED_CANVAS_COST_PX =
  RULED_BAND_HEIGHT_PX - BAND_HEIGHT_AT_BASE_COMMIT_PX;

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
    test("draws the band at frame D2A's own 76 px, as the owner ruled", async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const measured = await measureScreen(page);

      expect(measured.header).toBe(RULED_BAND_HEIGHT_PX);
      // Frame D2A's chip, at its own drawn height, centred in that band. The chip is unchanged by
      // the ruling: the band grew around it, which is how the frame itself draws the two.
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
      //
      // **The 76 px ruling does not relieve this and does not worsen it.** The row is a single
      // `align-items: center` line: its min-content width is the three fixed items, two 20 px gaps,
      // the chip and the 36 px inset, none of which the ruling touches, and the band's extra height
      // is not a currency width can spend. If it ever does fail here, the wordmark is the item that
      // would have to give — it is the only child of the row that carries no state (the pill is the
      // step, the title is the screen, the chip is the locale) and it is 15 px of type at 0.22em
      // tracking, the widest fixed item after the title. Dropping it is a copy decision under the
      // owner's Gate O1, not an implementer's, so this stays an assertion rather than a workaround.
      await page.setViewportSize(viewport);
      const measured = await measureScreen(page);

      expect(measured.clippedSpans).toEqual([]);
    });

    test("leaves the scene the viewport less the two bands, 21 px shorter than the base commit by decision", async ({
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

      // An equality, not a floor: a floor is satisfied by any canvas at all once the band is allowed
      // to grow, and the ruling bought a **known** 21 px rather than an open-ended one.
      expect(measured.canvas).toBeCloseTo(
        canvasAtBaseCommit - RULED_CANVAS_COST_PX,
        0,
      );
      // And the partition, unchanged by the ruling and still the point: the canvas and the bands
      // account for the whole viewport, so a third band appearing by accident is caught here rather
      // than by someone noticing the scene looks short.
      expect(measured.header + measured.settings + measured.canvas).toBeCloseTo(
        measured.viewport.height,
        0,
      );
    });
  });
