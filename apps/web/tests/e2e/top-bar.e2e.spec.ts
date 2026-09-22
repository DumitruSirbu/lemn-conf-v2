import { expect } from "@playwright/test";

import { openSeededDesign, test } from "./support/seeded-design";

/**
 * The refreshed top bar at 390 x 844, measured (wave W4, mobile half).
 *
 * `tests/app/configurator/configure/top-bar-box.test.ts` adds the declared padding, borders and line
 * boxes up and asserts the band computes to frame 2A's own height. That arithmetic is only worth
 * anything if a browser agrees with it, and no type spans the gap — so this file measures the
 * rendered boxes.
 *
 * **The number this file defends is the canvas's, not the header's.** `.screen` is a `100dvh` grid
 * whose only flexible row is the stage, so the bands above and below the scene are what the scene
 * costs.
 *
 * ## ADR 0104 moves two of the three numbers, and the wave's report carries both
 *
 * The band grows from 48 to **53**: frame 2A's settings chip stands in this row now (decision 2) and
 * is its tallest child at 30 px, where the locale chip's 25 used to be. In exchange the **76 px
 * settings band beneath it is gone**. And frame 2A's own second bottom row — `Înapoi` beside
 * `Verifică designul` — arrives with it, which the price bar's reserved height does not cover.
 */

const SCENE_SETTLE_MS = 2000;

/** What the header band measured at the base commit: `16 + 14 + 9 + 3 + 12 + 1`, a caption row over
 *  a four-segment progress bar. Nothing may make the band taller than this, because the stage is the
 *  row that pays. */
const BAND_HEIGHT_AT_BASE_COMMIT_PX = 55;

/** Frame 2A's own arithmetic, re-derived by ADR 0104: `11` padding, the **settings chip's**
 *  `1 + 7 + 14 + 7 + 1`, `11` padding, and the 1 px rule beneath. The chip is the tallest thing in
 *  the row — its 14 px swatch is taller than its 11 px label — where the locale chip's 25 px box used
 *  to be. Read off `Lemnaria Configurator Mobil.dc.html`, frame 2A `:486`. */
const REFERENCE_BAND_HEIGHT_PX = 53;

/** The settings band frame 2A does not draw and ADR 0104 decision 2 withdrew, measured at `6d53d38`
 *  at 390 x 844: 76.00 px, between the header and the scene. */
const STRIP_BAND_AT_BASE_COMMIT_PX = 76;

/** What this wave's own base commit drew, measured the same day: a 48 px band, over that 76 px strip,
 *  over a 628 px canvas, over the 92 px price bar. The wave's before-column, so the trade below is
 *  measured against what was actually on screen rather than against a number from an older one. */
const BAND_HEIGHT_BEFORE_THIS_WAVE_PX = 48;
const CANVAS_BEFORE_THIS_WAVE_PX = 628;

/** Sub-pixel layout rounding: a box whose right edge lands at 390.0001 has not left the screen. */
const SUB_PIXEL_SLACK = 0.5;

/** Criterion 2's input: a title several times the longest the product ships. "Configurare" is 11
 *  characters; this is 78, which no shell has room for at 390 px. A metrics fixture rather than
 *  copy — Romanian because diacritics change a glyph run's measured width, so a Latin-only string
 *  would test the overflow at the wrong metrics. */
const OVERLONG_TITLE =
  // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a metrics fixture rather than copy — the note above rules it Romanian because diacritics change the measured glyph run.
  "Configurare completă a bucătăriei pe toți pereții, cu toate corpurile alese";

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
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
    const actions = document.querySelector(
      '[data-testid="review-cta"]',
    )?.parentElement;
    if (!actions) throw new Error("no actions row on the page");

    return {
      viewport: document.documentElement.clientHeight,
      header: boxOf("header").height,
      price: boxOf('[data-testid="price-bar"]').height,
      // Frame 2A `:515`'s second bottom row, which arrives with this wave: `Înapoi` and the review
      // CTA. It is a band of the screen like the others and the scene pays for it like the others.
      actions: actions.getBoundingClientRect().height,
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
      const pill = document.querySelector(
        '[data-testid="global-settings-trigger"]',
      );
      if (!pill) throw new Error("no settings pill on the page");

      return {
        headerHeight: header.getBoundingClientRect().height,
        // A wrapped title is a taller line box than the one line the rule declares.
        titleHeight: element.getBoundingClientRect().height,
        // The truncation itself: the text is wider than the box that shows it.
        clipped: element.scrollWidth - element.clientWidth,
        chipRight: chip.getBoundingClientRect().right,
        // The pill is in this row too since ADR 0104 decision 2, and a title that grew the row would
        // push it out before it reached the locale chip.
        pillRight: pill.getBoundingClientRect().right,
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
    expect(measured.pillRight).toBeLessThanOrEqual(
      measured.viewportWidth + SUB_PIXEL_SLACK,
    );
    expect(measured.pageOverflow).toBeLessThanOrEqual(1);
  });
});

test.describe("the scene's canvas, which is what the bands cost", () => {
  test("stays under the base commit's band, and the bands still partition the screen", async ({
    page,
  }) => {
    const measured = await measureScreen(page);

    // Asserted on the **canvas**, not on the header: the header could be any height at all and this
    // would still be the question. The bands and the scene partition the viewport, so a band that
    // stopped taking flow height and started painting over the scene fails here rather than looking
    // fine.
    expect(measured.header).toBeLessThanOrEqual(BAND_HEIGHT_AT_BASE_COMMIT_PX);
    expect(
      measured.header + measured.canvas + measured.price + measured.actions,
    ).toBeCloseTo(measured.viewport, 0);
  });

  test("gets the withdrawn settings band back, less what frame 2A's own rows cost", async ({
    page,
  }) => {
    // **The trade this wave makes on the phone, stated as arithmetic rather than as a hope.** The
    // scene is given the 76 px settings band ADR 0104 decision 2 withdrew, and pays for two things
    // frame 2A draws and this product did not: 5 px of header, because the settings chip is taller
    // than the locale chip it stands beside, and frame 2A's second bottom row.
    const measured = await measureScreen(page);

    // Non-vacuity first: the before-column is the viewport's own partition at the base commit, so a
    // constant that had gone stale would be caught here rather than absorbed.
    expect(
      CANVAS_BEFORE_THIS_WAVE_PX +
        BAND_HEIGHT_BEFORE_THIS_WAVE_PX +
        STRIP_BAND_AT_BASE_COMMIT_PX +
        measured.price,
    ).toBeCloseTo(measured.viewport, 0);

    expect(measured.canvas).toBeCloseTo(
      CANVAS_BEFORE_THIS_WAVE_PX +
        STRIP_BAND_AT_BASE_COMMIT_PX -
        (measured.header - BAND_HEIGHT_BEFORE_THIS_WAVE_PX) -
        measured.actions,
      0,
    );
  });
});
