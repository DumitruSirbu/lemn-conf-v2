import { expect, test } from "@playwright/test";

/**
 * The refreshed top bar at 390 x 844, measured (wave W4, mobile half).
 *
 * `tests/app/configurator/configure/top-bar-box.test.ts` adds the declared padding, borders and line
 * boxes up and asserts the band computes to 48 px. That arithmetic is only worth anything if a
 * browser agrees with it, and no type spans the gap — so this file measures the rendered boxes.
 *
 * **The number this file defends is the canvas's, not the header's.** `.screen` is a `100dvh` grid
 * whose only flexible row is the stage, so the bands above and below the scene are what the scene
 * costs. The band measured 55 px before the refresh; the refreshed frame's own box is 48, and every
 * pixel of that difference belongs to the scene.
 */

const SCENE_SETTLE_MS = 2000;

/** What the header band measured at the base commit: `16 + 14 + 9 + 3 + 12 + 1`, a caption row over
 *  a four-segment progress bar. Nothing may make the band taller than this, because the stage is the
 *  row that pays. */
const BAND_HEIGHT_AT_BASE_COMMIT_PX = 55;

/** The refreshed frame 2A's own arithmetic: `11` padding, the locale chip's `1 + 6 + 11 + 6 + 1`,
 *  `11` padding, and the 1 px rule beneath. The chip is the tallest thing in the row.
 *
 *  **Not the "11 + 14 + 11" the punch list quotes.** `padding: 11px 14px` is 11 vertical and 14
 *  *horizontal*; the reference's own vertical box is the sum above, and 36 px would not fit the
 *  chip the same rule draws. Read off `Lemnaria Configurator Mobil.dc.html`, frame 2A. */
const REFERENCE_BAND_HEIGHT_PX = 48;

/** Sub-pixel layout rounding: a box whose right edge lands at 390.0001 has not left the screen. */
const SUB_PIXEL_SLACK = 0.5;

/** Criterion 2's input: a title several times the longest the product ships. "Configurare" is 11
 *  characters; this is 78, which no shell has room for at 390 px. */
const OVERLONG_TITLE =
  "Configurare completă a bucătăriei pe toți pereții, cu toate corpurile alese";

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** Every band the grid places, plus the scene's own canvas, in one read — so the partition below is
 *  measured at a single layout rather than across four round trips that could straddle a resize. */
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

    return {
      viewport: document.documentElement.clientHeight,
      header: boxOf("header").height,
      settings: band.getBoundingClientRect().height,
      price: boxOf('[data-testid="price-bar"]').height,
      canvas: boxOf("canvas").height,
    };
  });
}

test.describe("the band the refreshed frame draws", () => {
  test("is one row of the reference's own height, and carries no progress segments", async ({
    page,
  }) => {
    const band = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) throw new Error("no header on the page");
      const box = header.getBoundingClientRect();
      const visible = [...header.children]
        .map((child) => child.getBoundingClientRect())
        .filter((rect) => rect.height > 0);

      return {
        height: box.height,
        childCount: visible.length,
        // A column stacks its children, so their union is taller than any one of them. A row's
        // union is the tallest child, whatever the children are.
        union:
          Math.max(...visible.map((rect) => rect.bottom)) -
          Math.min(...visible.map((rect) => rect.top)),
        tallestChild: Math.max(...visible.map((rect) => rect.height)),
        // The four progress segments were the only empty spans this header ever had.
        emptySpans: [...header.querySelectorAll("span")].filter(
          (span) => span.textContent.trim().length === 0,
        ).length,
      };
    });

    expect(band.childCount).toBeGreaterThan(1);
    expect(band.union).toBeCloseTo(band.tallestChild, 0);
    expect(
      Math.abs(band.height - REFERENCE_BAND_HEIGHT_PX),
    ).toBeLessThanOrEqual(2);
    expect(band.emptySpans).toBe(0);
  });

  test("truncates a title three times the shipped one instead of wrapping or evicting the chip", async ({
    page,
  }) => {
    const before = await measureScreen(page);

    const measured = await page.evaluate((title) => {
      const element = document.querySelector('[data-testid="top-bar-title"]');
      if (!element) throw new Error("no top bar title on the page");
      element.textContent = title;
      const header = document.querySelector("header");
      if (!header) throw new Error("no header on the page");
      const chip = document.querySelector('[data-testid="top-bar-locale"]');
      if (!chip) throw new Error("no locale chip on the page");

      return {
        headerHeight: header.getBoundingClientRect().height,
        // A wrapped title is a taller line box than the one line the rule declares.
        titleHeight: element.getBoundingClientRect().height,
        // The truncation itself: the text is wider than the box that shows it.
        clipped: element.scrollWidth - element.clientWidth,
        chipRight: chip.getBoundingClientRect().right,
        viewportWidth: document.documentElement.clientWidth,
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    }, OVERLONG_TITLE);

    expect(measured.clipped).toBeGreaterThan(0);
    expect(measured.titleHeight).toBeLessThanOrEqual(20);
    expect(measured.headerHeight).toBeCloseTo(before.header, 0);
    expect(measured.chipRight).toBeLessThanOrEqual(
      measured.viewportWidth + SUB_PIXEL_SLACK,
    );
    expect(measured.pageOverflow).toBeLessThanOrEqual(1);
  });
});

test.describe("the scene's canvas, which is what the band costs", () => {
  test("loses no height to the refreshed band", async ({ page }) => {
    const measured = await measureScreen(page);

    // Asserted on the **canvas**, not on the header: the header could be any height at all and this
    // would still be the question. The three bands and the scene partition the viewport, so the
    // canvas is at least what it would be with the band at its base-commit 55 px.
    const canvasAtBaseCommit =
      measured.viewport -
      BAND_HEIGHT_AT_BASE_COMMIT_PX -
      measured.settings -
      measured.price;

    expect(measured.canvas).toBeGreaterThanOrEqual(canvasAtBaseCommit);
    expect(measured.header).toBeLessThanOrEqual(BAND_HEIGHT_AT_BASE_COMMIT_PX);
    // And the partition itself, so the comparison above cannot be satisfied by a band that stopped
    // taking flow height and started painting over the scene.
    expect(
      measured.header + measured.settings + measured.canvas + measured.price,
    ).toBeCloseTo(measured.viewport, 0);
  });
});
