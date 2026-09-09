import { expect, test, type Page } from "@playwright/test";

/**
 * **ADR 0082's containment, measured** — on the control that replaced the strip this file was
 * written for.
 *
 * ## What changed, and what did not
 *
 * [ADR 0104](../../../../docs/decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
 * decision 2 withdrew the settings strip and its band: frame 2A draws **one chip** in the header row
 * — swatch, `PAL melaminat`, `+N` — and that chip is also the trigger. So there is no chip count for
 * this file to sweep, and the sweep is not deleted but **re-aimed**: the axis that decides whether
 * anything is cut is the **width the pill is given**, and the rung it lands on is recorded at every
 * one of them, so a change that moves a rung boundary is visible rather than silent.
 *
 * **Every predicate ADR 0082 states is still asserted, of the new control**: nothing leaves the
 * viewport, nothing leaves its own band, nothing is clipped except the one label the ladder allows,
 * the control keeps `--touch-target`, the price bar stays reachable, and the row is a scroll
 * container in neither axis.
 *
 * ## The label-length axis lives in the unit tests, and that is a deliberate split
 *
 * ADR 0082 decision 1 is really about a **book-authored tier name** (ADR 0062 seam 1) — a label long
 * enough to drive the pill to its floor. A tier name cannot be changed from the page without writing
 * to the document, and a DOM-level override is wiped by the next render, so that axis is swept as a
 * **value** instead: `tests/settings/settings-pill-fit.test.ts` runs the ladder over randomised label
 * widths and orders, including sets no shipped book contains. What a browser adds — and what this
 * file is for — is that the drawing which follows that decision is contained.
 */

const SCENE_SETTLE_MS = 2000;

/** The phone widths the product is specified at and the two either side of it: 390 x 844 is M2's own
 *  gate, 320 is the narrowest phone still in use, and 430 is the widest the mobile shell serves. */
const PHONE_WIDTHS = [320, 360, 390, 430] as const;

const PHONE_HEIGHT_PX = 844;

/** `globals.css`'s `--touch-target`. Written out rather than read from the page, because reading the
 *  token the rule uses would make the assertion agree with any value the token took. */
const TOUCH_TARGET_PX = 44;

/** Sub-pixel layout rounding: a box whose right edge lands at 390.0001 has not left the screen. */
const SUB_PIXEL_SLACK = 0.5;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** Sets the phone width and waits for the pill to have settled at it: the ladder is decided from a
 *  `ResizeObserver`, so a measurement taken in the same tick as the resize is a race. */
async function atWidth(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: PHONE_HEIGHT_PX });
  await page.waitForFunction(
    (expected) => document.documentElement.clientWidth === expected,
    width,
  );
  await page.waitForFunction(() => {
    const anchor = document.querySelector('[data-testid="global-settings"]');
    const cell = anchor?.parentElement;
    if (!cell) return false;
    /**
     * **The cell, quiet for a stretch — not the pill, and not merely for three frames.**
     *
     * Two mistakes were made here on 2026-09-09 and both read a rung the row had not taken yet. A
     * three-frame check passes while a state update from the observer is still pending; and watching
     * the *pill* passes instantly at any width where the pill's own width does not change, which is
     * most of them — the pill is content-sized and the row is what moves.
     */
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

async function viewport(
  page: Page,
): Promise<{ readonly width: number; readonly height: number }> {
  return page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
}

/** Which rung the pill is on, recorded at every width so a fix that moves a boundary is visible
 *  rather than silent. */
async function rungOf(page: Page): Promise<{
  readonly labels: readonly string[];
  readonly counter: string | null;
}> {
  return page.evaluate(() => ({
    labels: [
      ...document.querySelectorAll(
        '[data-testid="global-settings-pill-label"]',
      ),
    ].map((label) => label.textContent),
    counter:
      document.querySelector('[data-testid="global-settings-pill-count"]')
        ?.textContent ?? null,
  }));
}

/** The configure screen's bands, as layout rather than as elements. */
async function bandsOf(page: Page): Promise<{
  readonly header: Box;
  readonly priceBar: Box;
  readonly stageHeight: number;
}> {
  const [header] = await boxesOf(page, "main > header");
  const [priceBar] = await boxesOf(page, '[data-testid="price-bar"]');
  if (!header || !priceBar)
    throw new Error("the configure screen is missing one of its bands");
  return {
    header,
    priceBar,
    stageHeight: priceBar.y - (header.y + header.height),
  };
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

/**
 * Every part of the pill measured against **its own grid item's box**, on all four edges — ADR 0082
 * *Amendment A* predicate 2, raised by ADR 0094 criterion 4b and kept whole by ADR 0104.
 *
 * A control inside the viewport but outside its own band is standing on a surface that belongs to
 * something else, and the original predicate could not tell the two apart: on desktop at 900 px two
 * chips satisfied it while painting inside the step nav's column.
 *
 * The item is addressed as the anchor's parent because its class is a CSS-module hash no spec can
 * name; the structural fact — the settings cell holds this control and nothing else — is what
 * `configure-screen.tsx` renders.
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
      // **A part this shell does not draw has no box to contain.** Frame 2A draws no caret, so
      // `global-settings.module.css` gives `.caret` `display: none` — and a `display: none` element
      // reports an all-zero rect, whose `left: 0` reads as an escape from a cell that starts at
      // 105 px. Nothing leaves the cell; the part is simply not rendered.
      //
      // Skipped on width **and** height together, never on width alone: a zero-width box that still
      // has height is laid out somewhere, and where that somewhere is remains a real finding.
      if (rect.width === 0 && rect.height === 0) return;
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

test.describe("nothing on the top bar leaves the viewport", () => {
  for (const width of PHONE_WIDTHS)
    test(`contains every top-bar control at ${String(width)} px`, async ({
      page,
    }) => {
      await atWidth(page, width);

      // The rung, recorded before anything is asserted about it: frame 2A draws one whole label and
      // a counter, and its `max-width: 150px` is what holds the chip there.
      const rung = await rungOf(page);
      expect(
        rung.labels.length,
        `at ${String(width)} px`,
      ).toBeGreaterThanOrEqual(1);
      for (const label of rung.labels)
        expect(label.trim().length).toBeGreaterThan(0);
      if (rung.labels.length < 4) expect(rung.counter).toMatch(/^\+\d+$/);

      const bounds = await viewport(page);
      const document_ = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(document_.scrollWidth).toBe(document_.clientWidth);

      // **Every control in the row, not only the pill** — the four the header draws are what the
      // withdrawn band's containment was really about, and the pill now stands among them.
      for (const testId of [
        "top-bar-back",
        "top-bar-step",
        "top-bar-title",
        "global-settings-trigger",
        "top-bar-locale",
        "bottom-bar-back",
        "review-cta",
      ]) {
        const [box] = await boxesOf(page, `[data-testid="${testId}"]`);
        if (!box) throw new Error(`no ${testId} on the page`);
        expectInside(box, bounds, testId);
      }
    });

  for (const width of PHONE_WIDTHS)
    test(`keeps the pill inside its own cell at ${String(width)} px`, async ({
      page,
    }) => {
      await atWidth(page, width);

      expect(
        await bandContainmentFailures(page, SUB_PIXEL_SLACK),
        `at ${String(width)} px`,
      ).toEqual([]);
    });
});

test.describe("the pill counts rather than scrolling or cutting", () => {
  test("is a scroll container in neither axis", async ({ page }) => {
    await atWidth(page, 320);

    const style = await page.evaluate(() => {
      const pill = document.querySelector(
        '[data-testid="global-settings-trigger"]',
      );
      if (!pill) throw new Error("no settings pill on the page");
      const computed = getComputedStyle(pill);
      return {
        overflowX: computed.overflowX,
        overflowY: computed.overflowY,
        scrollSnapType: computed.scrollSnapType,
        scrollWidth: pill.scrollWidth,
        clientWidth: pill.clientWidth,
      };
    });

    expect(style.overflowX).not.toBe("auto");
    expect(style.overflowX).not.toBe("scroll");
    expect(style.overflowY).not.toBe("auto");
    expect(style.overflowY).not.toBe("scroll");
    expect(style.scrollSnapType).toBe("none");
    expect(style.scrollWidth).toBeLessThanOrEqual(
      style.clientWidth + SUB_PIXEL_SLACK,
    );
  });

  for (const width of PHONE_WIDTHS)
    test(`cuts at most the one label the ladder allows, at ${String(width)} px`, async ({
      page,
    }) => {
      // **ADR 0082 decision 3, tightened by ADR 0104 decision 3.** A label that does not fit is
      // *counted*, not cut — so at every rung but the floor the number of clipped elements is zero,
      // and at the floor it is exactly one and it is the first label. Anything else is the row of
      // stubs decision 3 refused.
      await atWidth(page, width);

      const clipped = await page.evaluate(() => {
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

      expect(clipped.length, `at ${String(width)} px`).toBeLessThanOrEqual(1);
      for (const part of clipped) {
        expect(part.testId).toBe("global-settings-pill-label");
        expect(part.index).toBe(1);
      }
    });

  test("puts the pill where the viewport puts it, and not where the price book does", async ({
    page,
  }) => {
    // **ADR 0082 decision 4, discharged rather than dropped** (ADR 0104 decision 4): there is no chip
    // count left for the control's position to depend on, because there is one control. What
    // replaces it is the property that decision was reaching for — the pill's right edge is a
    // function of the viewport, and of nothing a price-book author can write.
    const rights: number[] = [];
    for (const width of PHONE_WIDTHS) {
      await atWidth(page, width);
      const [pill] = await boxesOf(
        page,
        '[data-testid="global-settings-trigger"]',
      );
      if (!pill) throw new Error("no settings pill on the page");
      rights.push(Math.round(width - (pill.x + pill.width)));
    }

    expect(
      new Set(rights).size,
      `the pill's insets from the right were ${rights.join(", ")}`,
    ).toBe(1);
  });
});

test.describe("the pill is tappable, and the price bar stays reachable", () => {
  test("gives the pill the declared touch target without painting one", async ({
    page,
  }) => {
    // **ADR 0082 decision 8, with ADR 0104 decision 5's mechanism.** The painted box is frame 2A's
    // own 30 px chip and must stay that — a `min-height` here would make it the row's tallest child
    // and lift the band off the frame's height. So the target is measured where the requirement
    // always was: what a finger at the corners of a 44 px box actually reaches.
    for (const width of PHONE_WIDTHS) {
      await atWidth(page, width);

      const reached = await page.evaluate((target) => {
        const pill = document.querySelector(
          '[data-testid="global-settings-trigger"]',
        );
        if (!pill) throw new Error("no settings pill on the page");
        const rect = pill.getBoundingClientRect();
        const centreX = rect.x + rect.width / 2;
        const centreY = rect.y + rect.height / 2;
        const half = target / 2 - 1;
        return [
          [centreX - half, centreY - half],
          [centreX + half, centreY - half],
          [centreX - half, centreY + half],
          [centreX + half, centreY + half],
        ].map(([x, y]) => {
          const hit = document.elementFromPoint(x ?? 0, y ?? 0);
          return hit !== null && (pill === hit || pill.contains(hit));
        });
      }, TOUCH_TARGET_PX);

      expect(reached, `at ${String(width)} px`).toEqual([
        true,
        true,
        true,
        true,
      ]);
    }
  });

  test("keeps the painted pill at frame 2A's own height", async ({ page }) => {
    // Non-vacuity for the case above: the target must be met **without** changing the drawing, so
    // the painted box is asserted as well as the reach.
    await atWidth(page, 390);
    const [pill] = await boxesOf(
      page,
      '[data-testid="global-settings-trigger"]',
    );
    if (!pill) throw new Error("no settings pill on the page");

    expect(pill.height).toBeLessThan(TOUCH_TARGET_PX);
  });

  for (const width of PHONE_WIDTHS)
    test(`lets a tap reach the price bar's own control at ${String(width)} px`, async ({
      page,
    }) => {
      // The `z-index: 7` interception, asserted rather than inferred from the absence of red: wave
      // 6K-b3 reverted an overflowing chips subtree that painted over the price bar and swallowed
      // the pointer, taking 44 of 58 specs with it.
      await atWidth(page, width);

      const reached = await page.evaluate(() => {
        const control = document.querySelector(
          '[data-testid="price-breakdown-trigger"]',
        );
        if (!control) throw new Error("no price breakdown trigger on the page");
        const rect = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return {
          isTheControl: hit !== null && control.contains(hit),
          hitTestId:
            hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
        };
      });

      expect(reached.hitTestId).not.toBe("global-settings-trigger");
      expect(reached.isTheControl).toBe(true);

      await page.getByTestId("price-breakdown-trigger").click();
      await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();
    });

  test("takes no height from the stage as the row narrows", async ({
    page,
  }) => {
    // **ADR 0082 decision 5, and the wave's own improvement on it.** The strip used to grow by
    // wrapping and the stage absorbed it; the pill cannot grow at all — it counts instead — so what
    // is asserted is the stronger thing: the band is the same height at every width, and the stage
    // pays nothing.
    await atWidth(page, 430);
    const bounds = await viewport(page);
    const atWidest = await bandsOf(page);

    await atWidth(page, 320);
    const atNarrowest = await bandsOf(page);

    expect(atNarrowest.header.height).toBe(atWidest.header.height);
    expect(atNarrowest.priceBar.height).toBe(atWidest.priceBar.height);
    expect(atNarrowest.stageHeight).toBe(atWidest.stageHeight);
    expect(atNarrowest.stageHeight).toBeGreaterThan(0);
    expectInside(atNarrowest.priceBar, bounds, "the price bar");
    // The band is above the bar and does not overlay it: the two do not intersect.
    expect(
      atNarrowest.header.y + atNarrowest.header.height,
    ).toBeLessThanOrEqual(atNarrowest.priceBar.y + SUB_PIXEL_SLACK);
  });
});
