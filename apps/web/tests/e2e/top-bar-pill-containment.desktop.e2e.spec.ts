import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { expect, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  mintSeededDesign,
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

const SCENE_SETTLE_MS = 2000;

/** The widths the row is measured at. 1025 and 1035 straddle the width where the wordmark returns (about 1033);
 *  none is a threshold, they are widths a measurement is taken at (ADR 0104 decision 9). */
const DESKTOP_WIDTHS = [
  900, 930, 1025, 1035, 1100, 1200, 1300, 1440, 1920,
] as const;

const TOUCH_TARGET_PX = 44;
const SUB_PIXEL_SLACK = 0.5;

/** Covers the 135 s this sweep took on the CI runner. See ADR 0144 d2. */
const SAME_HEADER_SWEEP_TIMEOUT_MS = 300_000;

/** Frame D2A's declared band, at every width on every design (ADR 0104 decision 8b). */
const RULED_TOP_BAR_HEIGHT_PX = 76;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** Sets the width and waits for the row to settle: the pill's rung and the wordmark come from a `ResizeObserver`,
 *  so a measurement in the same tick as the resize is a race. */
async function atWidth(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForFunction(
    (expected) => document.documentElement.clientWidth === expected,
    width,
  );
  await page.waitForFunction(() => {
    const anchor = document.querySelector('[data-testid="global-settings"]');
    const cell = anchor?.parentElement;
    if (!cell) return false;
    // Watch the cell, quiet for a stretch, not the pill: the pill is content-sized and can look settled while
    // the row is still moving, and three frames pass with an observer update pending.
    const settled = window as unknown as {
      lastTrackWidth?: number;
      settledSince?: number;
    };
    const width = cell.getBoundingClientRect().width;
    const now = performance.now();
    if (settled.lastTrackWidth !== width) {
      settled.lastTrackWidth = width;
      settled.settledSince = now;
      return false;
    }
    return now - (settled.settledSince ?? now) > 200;
  });
}

async function boxesOf(page: Page, selector: string): Promise<readonly Box[]> {
  return page.evaluate(
    (css) =>
      [...document.querySelectorAll(css)].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }),
    selector,
  );
}

/** Which rung the pill is on, recorded at every width so a moved boundary shows up as a changed record. */
async function rungOf(page: Page): Promise<{
  readonly labels: readonly string[];
  readonly counter: string | null;
  readonly isWordmarkDrawn: boolean;
}> {
  return page.evaluate(() => {
    const wordmark = document.querySelector(
      "main > header > span:nth-child(2)",
    );
    return {
      labels: [
        ...document.querySelectorAll(
          '[data-testid="global-settings-pill-label"]',
        ),
      ].map((label) => label.textContent),
      counter:
        document.querySelector('[data-testid="global-settings-pill-count"]')
          ?.textContent ?? null,
      isWordmarkDrawn:
        wordmark !== null && getComputedStyle(wordmark).display !== "none",
    };
  });
}

/** The step nav's box and every label in it, read together; see the case that uses `nav.overflow`. */
async function readNav(page: Page): Promise<{
  readonly clipped: readonly {
    readonly text: string;
    readonly overflow: number;
  }[];
  readonly left: number;
  readonly overflow: number;
}> {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) throw new Error("no header on the page");
    const clipped = [...header.querySelectorAll("span")]
      .filter((text) => text.textContent.trim().length > 0)
      .map((text) => ({
        text: text.textContent,
        overflow: text.scrollWidth - text.clientWidth,
      }))
      .filter((text) => text.overflow > 1);
    const rect = header.getBoundingClientRect();
    return {
      clipped,
      left: rect.left,
      overflow: header.scrollWidth - header.clientWidth,
    };
  });
}

/** Grid row 1: the header height, price cell and pill, compared between the flagged and the seeded design. */
async function readTopBar(page: Page): Promise<{
  readonly headerHeight: number;
  readonly priceCell: Box;
  readonly pill: Box;
}> {
  return page.evaluate(() => {
    const boxOf = (selector: string): Box => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${selector} on the page`);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const bar = document.querySelector('[data-testid="price-bar"]');
    const cell = bar?.parentElement?.parentElement;
    if (!cell) throw new Error("the price bar has no cell around it");
    const cellRect = cell.getBoundingClientRect();
    return {
      headerHeight: boxOf("main > header").height,
      priceCell: {
        x: cellRect.x,
        y: cellRect.y,
        width: cellRect.width,
        height: cellRect.height,
      },
      pill: boxOf('[data-testid="global-settings-trigger"]'),
    };
  });
}

function expectInside(
  box: Box,
  bounds: { readonly width: number; readonly height: number },
  what: string,
): void {
  expect(box.x, `${what} left`).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  expect(box.y, `${what} top`).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(
    bounds.width + SUB_PIXEL_SLACK,
  );
  expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(
    bounds.height + SUB_PIXEL_SLACK,
  );
}

/** Mints a row of its own beside the fixture's per-test one; call it fresh every test, never cached across
 *  tests (ADR 0114 decision 5). */
async function mintFlaggedRow(page: Page): Promise<SeededDesign> {
  const design = await mintSeededDesign(page);
  mintedDesignIds.push(design.id);
  return design;
}

/** Stores the seeded kitchen with wall A narrower than the run standing on it, which makes ADR 0065 flag the total. */
async function storeANarrowedRoom(
  page: Page,
  stored: SeededDesign,
): Promise<void> {
  const saved = await page.evaluate(
    async (target: SeededDesign & { readonly widthMm: number }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: { room: { widthMm: number } };
      };
      const response = await fetch(`/api/designs/${target.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": target.revision,
        },
        body: JSON.stringify({
          ...design,
          room: { ...design.room, widthMm: target.widthMm },
        }),
      });
      return response.status;
    },
    { ...stored, widthMm: NARROWED_ROOM_OVERFLOWING_DESIGN.room.widthMm },
  );

  // ADR 0065 decision 7 and ADR 0069: a design that does not fit still saves.
  expect(saved).toBe(200);
}

/**
 * Opens a design whose total carries ADR 0065's flag. Mints its own row in the caller's context every call: a
 * design opens only in the browser that owns it (ADR 0114 decision 5), so a row cached across tests is unreadable.
 * Not `openSeededDesign`, which throws without write access; this file never edits through the UI. The flag's
 * sentence is on the scene, so that is where its presence is confirmed (ADR 0104 decision 8b).
 */
async function openFlaggedDesign(page: Page): Promise<void> {
  const flaggedDesign = await mintFlaggedRow(page);
  await storeANarrowedRoom(page, flaggedDesign);

  await page.goto(`/d/${flaggedDesign.id}`);
  await page.waitForSelector("canvas", { state: "attached" });
  await expect(page.getByTestId("price-bar-overflow")).toBeVisible();
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

/**
 * Every part of the pill measured against its own grid item's box on all four edges (ADR 0082 Amendment A,
 * predicate 2). The item is the anchor's parent because its CSS-module class has no stable name. Returns failures
 * rather than asserting, so one sweep reports every width that broke.
 */
async function bandContainmentFailures(
  page: Page,
  slack: number,
): Promise<readonly string[]> {
  return page.evaluate((allowed) => {
    const anchor = document.querySelector('[data-testid="global-settings"]');
    const cell = anchor?.parentElement;
    if (!cell) throw new Error("the settings pill has no cell around it");
    const cellRect = cell.getBoundingClientRect();

    const failures: string[] = [];
    const measure = (what: string, element: Element): void => {
      const rect = element.getBoundingClientRect();
      if (rect.left < cellRect.left - allowed)
        failures.push(
          `${what} left ${String(rect.left)} < ${String(cellRect.left)}`,
        );
      if (rect.top < cellRect.top - allowed)
        failures.push(
          `${what} top ${String(rect.top)} < ${String(cellRect.top)}`,
        );
      if (rect.right > cellRect.right + allowed)
        failures.push(
          `${what} right ${String(rect.right)} > ${String(cellRect.right)}`,
        );
      if (rect.bottom > cellRect.bottom + allowed)
        failures.push(
          `${what} bottom ${String(rect.bottom)} > ${String(cellRect.bottom)}`,
        );
    };

    const pill = document.querySelector(
      '[data-testid="global-settings-trigger"]',
    );
    if (!pill) throw new Error("no settings pill on the page");
    measure("the pill", pill);
    for (const [index, part] of [...pill.children].entries())
      measure(`part ${String(index)}`, part);

    return failures;
  }, slack);
}

/**
 * Anything on the pill cut by the box it stands in (ADR 0082 Amendment A, predicate 3). At most one is admitted:
 * the floor's material-name ellipsis, since a label that does not fit is counted rather than cut (ADR 0104 decision 3).
 */
async function clippedPillParts(page: Page): Promise<readonly unknown[]> {
  return page.evaluate(() => {
    const pill = document.querySelector(
      '[data-testid="global-settings-trigger"]',
    );
    if (!pill) throw new Error("no settings pill on the page");
    return [...pill.querySelectorAll("*")]
      .map((part, index) => ({
        index,
        text: part.textContent,
        testId: part.getAttribute("data-testid"),
        overflow: part.scrollWidth - part.clientWidth,
      }))
      .filter((part) => part.overflow > 1);
  });
}

test.describe("nothing on the top bar leaves the viewport", () => {
  for (const width of DESKTOP_WIDTHS)
    test(`contains every top-bar control at ${String(width)} px`, async ({
      page,
    }) => {
      await atWidth(page, width);

      // The ladder's two ends: a counter implies at least one named setting, and naming every setting draws
      // no counter.
      const rung = await rungOf(page);
      expect(
        rung.labels.length,
        `at ${String(width)} px`,
      ).toBeGreaterThanOrEqual(1);
      if (rung.labels.length < 4) expect(rung.counter).toMatch(/^\+\d+$/);
      else expect(rung.counter).toBeNull();

      const bounds = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(bounds.scrollWidth).toBe(bounds.width);
      // Every control in the row; the pill, price, CTA and locale are the four frame D2A says never give way.
      for (const testId of [
        "top-bar-step",
        "top-bar-title",
        "global-settings-trigger",
        "price-bar-total",
        "review-cta",
        "top-bar-locale",
      ]) {
        const [box] = await boxesOf(page, `[data-testid="${testId}"]`);
        if (!box) throw new Error(`no ${testId} on the page`);
        expectInside(box, bounds, `${testId} at ${String(width)} px`);
      }
    });

  for (const width of DESKTOP_WIDTHS)
    test(`keeps the pill inside its own cell at ${String(width)} px`, async ({
      page,
    }) => {
      await atWidth(page, width);

      expect(
        await bandContainmentFailures(page, SUB_PIXEL_SLACK),
        `seeded at ${String(width)} px`,
      ).toEqual([]);
    });

  test("cuts at most the one label the ladder allows, at every width", async ({
    page,
  }) => {
    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const clipped = await clippedPillParts(page);

      expect(
        clipped.length,
        `seeded at ${String(width)} px`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("gives the pill the declared touch target without painting one", async ({
    page,
  }) => {
    // ADR 0082 decision 8 with ADR 0104 decision 5: the painted pill is 40 px and the hit area is the 44 px token,
    // so the target is what a pointer at the corners of a 44 px box reaches.
    await atWidth(page, 900);

    const reached = await page.evaluate((target) => {
      const pill = document.querySelector(
        '[data-testid="global-settings-trigger"]',
      );
      if (!pill) throw new Error("no settings pill on the page");
      const rect = pill.getBoundingClientRect();
      const centreX = rect.x + rect.width / 2;
      const centreY = rect.y + rect.height / 2;
      const half = target / 2 - 1;
      return {
        paintedHeight: rect.height,
        corners: [
          [centreX - half, centreY - half],
          [centreX + half, centreY - half],
          [centreX - half, centreY + half],
          [centreX + half, centreY + half],
        ].map(([x, y]) => {
          const hit = document.elementFromPoint(x ?? 0, y ?? 0);
          return hit !== null && (pill === hit || pill.contains(hit));
        }),
      };
    }, TOUCH_TARGET_PX);

    expect(reached.corners).toEqual([true, true, true, true]);
    // Non-vacuity: the target is met **without** changing the drawing.
    expect(reached.paintedHeight).toBe(40);
  });
});

test.describe("the row gives way in the ruled order and no further", () => {
  test("keeps the four protected controls whole at every width", async ({
    page,
  }) => {
    // ADR 0104 decision 8: these four are `flex: 0 0 auto` in frame D2A; the pill's ladder, the gaps and the
    // wordmark give way first, never these.
    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);

      const whole = await page.evaluate(() =>
        ["top-bar-step", "price-bar-total", "review-cta", "top-bar-locale"].map(
          (testId) => {
            const element = document.querySelector(`[data-testid="${testId}"]`);
            if (!element) throw new Error(`no ${testId} on the page`);
            return {
              testId,
              overflow: element.scrollWidth - element.clientWidth,
            };
          },
        ),
      );

      for (const control of whole)
        expect(
          control.overflow,
          `${control.testId} at ${String(width)} px`,
        ).toBeLessThanOrEqual(1);
    }
  });

  test("settles at every width it is dragged through, and clips nothing on the way", async ({
    page,
  }) => {
    // 1 px sweep across the width where the wordmark returns. The answer at a width must be a property of that
    // width, so it is read twice and must agree: a track measured in one configuration and read in another holds
    // a label the row has no room for.
    const seen: string[] = [];
    for (let width = 1024; width <= 1044; width += 1) {
      await atWidth(page, width);
      const first = await rungOf(page);
      const clipped = await clippedPillParts(page);
      const again = await rungOf(page);

      expect(clipped.length, `at ${String(width)} px`).toBe(0);
      expect(
        first.labels.length,
        `at ${String(width)} px`,
      ).toBeGreaterThanOrEqual(1);
      if (first.labels.length < 4)
        expect(first.counter, `at ${String(width)} px`).toMatch(/^\+\d+$/);
      expect(again, `at ${String(width)} px`).toEqual(first);

      seen.push(
        `${String(width)}:${String(first.labels.length)}${first.isWordmarkDrawn ? "W" : "-"}`,
      );
    }

    // The label count never falls as the window widens (ADR 0104 decision 8); recorded as a sequence so a moved
    // boundary shows in the failure text.
    const counts = seen.map((entry) => Number(entry.split(":")[1]?.trim()[0]));

    expect(seen.length).toBe(21);
    for (const [index, count] of counts.entries())
      if (index > 0)
        expect(count, seen.join(" | ")).toBeGreaterThanOrEqual(
          counts[index - 1] ?? 0,
        );
  });

  test("draws the wordmark above the width two setting names need beside it, and not below", async ({
    page,
  }) => {
    // The wordmark returns where it fits beside two whole setting names (ADR 0104 decision 8). The boundary is
    // measured, not declared, so this asserts at two widths well clear of it.
    await atWidth(page, 900);
    expect((await rungOf(page)).isWordmarkDrawn).toBe(false);

    await atWidth(page, 1440);
    const wide = await rungOf(page);
    expect(wide.isWordmarkDrawn).toBe(true);
    await atWidth(page, 900);
    const narrow = await rungOf(page);
    expect(narrow.labels[0]).toBe("PAL melaminat");
    expect(narrow.counter).toMatch(/^\+\d+$/);
  });
});

test.describe("on a design carrying ADR 0065's overflow flag", () => {
  test("clips nothing on the pill, at any of the swept widths", async ({
    page,
  }) => {
    // The widths either side of 1150 fail a fix that moved a threshold rather than removing the cut.
    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);

      expect(
        (await clippedPillParts(page)).length,
        `flagged at ${String(width)} px`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("keeps the pill inside its own cell at every width", async ({
    page,
  }) => {
    // A chip inside the viewport but standing on the step nav must fail.
    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      expect(
        await bandContainmentFailures(page, SUB_PIXEL_SLACK),
        `flagged at ${String(width)} px`,
      ).toEqual([]);
    }
  });

  test("leaves the price bar's box and its hit test to itself at 900 px", async ({
    page,
  }) => {
    // 900 px is where the trigger once stood over the price bar and `elementFromPoint` at the total's left edge
    // returned `global-settings-trigger`; the pill now shares the price's row.
    await openFlaggedDesign(page);
    await atWidth(page, 900);

    const measured = await page.evaluate((slack) => {
      const rectOf = (testId: string): DOMRect => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (!element) throw new Error(`no ${testId} on the page`);
        return element.getBoundingClientRect();
      };
      const bar = rectOf("price-bar");
      const overlaps = (what: string, rect: DOMRect): string | null => {
        const width =
          Math.min(rect.right, bar.right) - Math.max(rect.left, bar.left);
        const height =
          Math.min(rect.bottom, bar.bottom) - Math.max(rect.top, bar.top);
        if (width <= slack || height <= slack) return null;
        return `${what} overlaps the price bar by ${String(width)} × ${String(height)}`;
      };

      const intersections: string[] = [];
      for (const testId of [
        "global-settings-trigger",
        "review-cta",
        "top-bar-locale",
        "top-bar-title",
      ]) {
        const found = overlaps(testId, rectOf(testId));
        if (found) intersections.push(found);
      }

      // Three probes, each half a pixel inside the box so a boundary point is not attributed to a neighbour.
      const total = rectOf("price-bar-total");
      const totalElement = document.querySelector(
        '[data-testid="price-bar-total"]',
      );
      const probe = (x: number): string => {
        const hit = document.elementFromPoint(x, total.top + total.height / 2);
        if (hit && totalElement?.contains(hit)) return "price-bar-total";
        return (
          hit?.closest("[data-testid]")?.getAttribute("data-testid") ??
          "nothing"
        );
      };

      return {
        intersections,
        hits: [
          probe(total.left + slack),
          probe(total.left + total.width / 2),
          probe(total.right - slack),
        ],
      };
    }, SUB_PIXEL_SLACK);

    expect(measured.intersections).toEqual([]);
    expect(measured.hits).toEqual([
      "price-bar-total",
      "price-bar-total",
      "price-bar-total",
    ]);

    await page.getByTestId("price-breakdown-trigger").click();
    await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();
  });

  /**
   * `nav.overflow` is the whole of this case: the header's own box cuts the spans from outside, which the per-span
   * `scrollWidth - clientWidth` probe behind `nav.clipped` cannot detect.
   */
  test("does not clip the step nav at 900 px", async ({ page }) => {
    await openFlaggedDesign(page);
    await atWidth(page, 900);

    const nav = await readNav(page);

    expect(nav.clipped).toEqual([]);
    expect(nav.overflow).toBeLessThanOrEqual(1);
    expect(nav.left).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  });

  /**
   * Criterion 12b: the header keeps the ruled band at every width. 900, 1025 and 1026 bracket the window in which
   * the retired top-bar growth was once spent (ADR 0104 decision 8b).
   */
  test("draws the ruled 76 px band at every width, flagged as well as seeded", async ({
    page,
  }) => {
    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const bar = await readTopBar(page);

      expect(bar.headerHeight, `flagged at ${String(width)} px`).toBeCloseTo(
        RULED_TOP_BAR_HEIGHT_PX,
        1,
      );
    }
  });

  /**
   * Criterion 12c: a flagged design draws the same header as a seeded one at every width, so the sentence cannot
   * return to the bar by any route.
   */
  test("draws the same header on a flagged design as on a seeded one", async ({
    page,
  }) => {
    test.setTimeout(SAME_HEADER_SWEEP_TIMEOUT_MS);
    const seeded: Record<string, unknown> = {};
    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const bar = await readTopBar(page);
      const rung = await rungOf(page);
      seeded[String(width)] = {
        headerHeight: bar.headerHeight,
        priceCell: bar.priceCell,
        pill: bar.pill,
        labels: rung.labels.length,
        counter: rung.counter,
        isWordmarkDrawn: rung.isWordmarkDrawn,
      };
    }

    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const bar = await readTopBar(page);
      const rung = await rungOf(page);

      expect(
        {
          headerHeight: bar.headerHeight,
          priceCell: bar.priceCell,
          pill: bar.pill,
          labels: rung.labels.length,
          counter: rung.counter,
          isWordmarkDrawn: rung.isWordmarkDrawn,
        },
        `at ${String(width)} px`,
      ).toEqual(seeded[String(width)]);
    }
  });

  test("keeps the flagged sentence on the scene, where the header does not pay for it", async ({
    page,
  }) => {
    // Non-vacuity for the two cases above: both would pass if the flag had simply stopped being drawn.
    await openFlaggedDesign(page);
    await atWidth(page, 900);

    const placed = await page.evaluate(() => {
      const warning = document.querySelector(
        '[data-testid="price-bar-overflow"]',
      );
      const canvas = document.querySelector("canvas");
      const bar = document.querySelector('[data-testid="price-bar"]');
      if (!warning || !canvas || !bar)
        throw new Error("the flagged screen is missing one of its parts");
      const warningRect = warning.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        insideTheScene:
          warningRect.top >= canvasRect.top - 1 &&
          warningRect.bottom <= canvasRect.bottom + 1,
        insideTheBar: bar.contains(warning),
      };
    });

    expect(placed.insideTheScene).toBe(true);
    expect(placed.insideTheBar).toBe(false);
  });
});
