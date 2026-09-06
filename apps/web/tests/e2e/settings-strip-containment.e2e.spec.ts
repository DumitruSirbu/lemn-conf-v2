import { expect, test, type Page } from "@playwright/test";

/**
 * **ADR 0082's containment, measured** — the spec `global-settings.module.css` names.
 *
 * That stylesheet's own comment already claims this file exists: *"the containment is asserted, at
 * two, three, four and five chips, by `apps/web/tests/e2e/settings-strip-containment.e2e.spec.ts`,
 * and the assertion is what a later reader should trust rather than this paragraph."* It did not.
 * The comment it replaced — *"a fourth chip narrows the three rather than breaking anything"* — was
 * a prediction that turned out measurably false and cost 44 of 58 e2e specs when wave 6K-b3 met it;
 * a second unbacked prediction in the same place is the same trap with a newer date on it.
 *
 * **A count above two is simulated**, which is how ADR 0082's own table was produced: the strip
 * declares two chips today and the entry's premise is that a third is a price-book edit away, since
 * a chip's label is a book-authored tier name (ADR 0062 seam 1). The simulation clones the real chip
 * nodes cyclically, so the labels measured are the labels the product actually renders rather than
 * strings chosen to fit.
 */

const SCENE_SETTLE_MS = 2000;

/** ADR 0082 decision 1: two, three, four and five. Two is the shipped count and is measured for the
 *  same reason the others are — the simulation must not be the only thing under test. */
const CHIP_COUNTS = [2, 3, 4, 5] as const;

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

/**
 * Grows the strip to `count` chips by cloning the ones the product rendered.
 *
 * Returns the labels now on screen, so a test that measured nothing new fails rather than passing
 * quietly — a clone that silently did not happen would otherwise turn every count into two.
 */
async function withChipCount(
  page: Page,
  count: number,
): Promise<readonly string[]> {
  return page.evaluate((wanted) => {
    const box = document.querySelector('[data-testid="global-settings-chips"]');
    if (!box) throw new Error("no settings chips box on the page");
    const declared = [...box.children];
    if (declared.length === 0) throw new Error("the strip declares no chips");
    while (box.children.length > declared.length)
      box.lastElementChild?.remove();
    while (box.children.length < wanted) {
      const source = declared[box.children.length % declared.length];
      if (source) box.append(source.cloneNode(true));
    }
    return [...box.children].map((chip) => chip.textContent);
  }, count);
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

/** The configure screen's three bands, as layout rather than as elements: the strip, the price bar,
 *  and the stage that is whatever vertical space the two of them leave. */
async function bandsOf(page: Page): Promise<{
  readonly strip: Box;
  readonly priceBar: Box;
  readonly stageHeight: number;
}> {
  const [strip] = await boxesOf(page, '[data-testid="global-settings"]');
  const [priceBar] = await boxesOf(page, '[data-testid="price-bar"]');
  if (!strip || !priceBar)
    throw new Error("the configure screen is missing one of its bands");
  return {
    strip,
    priceBar,
    stageHeight: priceBar.y - (strip.y + strip.height),
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
 * Every chip and the trigger measured against **`.settingsRow`'s own box**, on all four edges —
 * ADR 0082's *Amendment A*, predicate 2, raised by ADR 0094 (criterion 4b).
 *
 * A control inside the viewport but outside its own band is standing on a surface that belongs to
 * something else, and the original predicate could not tell the two apart: on desktop at 900 px two
 * chips satisfied it while painting inside the step nav's column. Nothing here reproduces at 390 —
 * the strip has had its own row on this shell all along, which is, read backwards, why it passes —
 * and the assertion is made anyway, because ADR 0082 decision 6 gives both shells one rule.
 *
 * The band is addressed as the strip's parent element because its class is a CSS-module hash no spec
 * can name; the structural fact — `.settingsRow` holds the strip and nothing else — is what
 * `configure-screen.tsx` renders.
 */
async function bandContainmentFailures(
  page: Page,
  slack: number,
): Promise<readonly string[]> {
  return page.evaluate((allowed) => {
    const strip = document.querySelector('[data-testid="global-settings"]');
    const band = strip?.parentElement;
    if (!band) throw new Error("the settings strip has no band around it");
    const bandRect = band.getBoundingClientRect();

    const failures: string[] = [];
    const measure = (what: string, element: Element): void => {
      const rect = element.getBoundingClientRect();
      if (rect.left < bandRect.left - allowed)
        failures.push(
          `${what} left ${String(rect.left)} < ${String(bandRect.left)}`,
        );
      if (rect.top < bandRect.top - allowed)
        failures.push(
          `${what} top ${String(rect.top)} < ${String(bandRect.top)}`,
        );
      if (rect.right > bandRect.right + allowed)
        failures.push(
          `${what} right ${String(rect.right)} > ${String(bandRect.right)}`,
        );
      if (rect.bottom > bandRect.bottom + allowed)
        failures.push(
          `${what} bottom ${String(rect.bottom)} > ${String(bandRect.bottom)}`,
        );
    };

    const chips = [
      ...document.querySelectorAll('[data-testid="global-settings-chips"] > *'),
    ];
    for (const [index, chip] of chips.entries())
      measure(`chip ${String(index)}`, chip);

    const trigger = document.querySelector(
      '[data-testid="global-settings-trigger"]',
    );
    if (!trigger) throw new Error("no settings trigger on the page");
    measure("the trigger", trigger);

    return failures;
  }, slack);
}

test.describe("nothing on the settings strip leaves the viewport", () => {
  for (const count of CHIP_COUNTS)
    test(`contains every chip and the trigger at ${String(count)} chips`, async ({
      page,
    }) => {
      const labels = await withChipCount(page, count);
      expect(labels).toHaveLength(count);
      for (const label of labels)
        expect(label.trim().length).toBeGreaterThan(0);

      const bounds = await viewport(page);
      const document_ = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(document_.scrollWidth).toBe(document_.clientWidth);
      const chips = await boxesOf(
        page,
        '[data-testid="global-settings-chips"] > *',
      );
      expect(chips).toHaveLength(count);
      for (const [index, chip] of chips.entries())
        expectInside(chip, bounds, `chip ${String(index)}`);

      const [trigger] = await boxesOf(
        page,
        '[data-testid="global-settings-trigger"]',
      );
      if (!trigger) throw new Error("no settings trigger on the page");
      expectInside(trigger, bounds, "the trigger");
    });

  for (const count of CHIP_COUNTS)
    test(`keeps every chip and the trigger inside the strip's own band at ${String(count)} chips`, async ({
      page,
    }) => {
      await withChipCount(page, count);

      expect(
        await bandContainmentFailures(page, SUB_PIXEL_SLACK),
        `at ${String(count)} chips`,
      ).toEqual([]);
    });
});

test.describe("the strip wraps rather than scrolling or shrinking", () => {
  test("is a scroll container in neither axis", async ({ page }) => {
    await withChipCount(page, 5);

    const style = await page.evaluate(() => {
      const box = document.querySelector(
        '[data-testid="global-settings-chips"]',
      );
      if (!box) throw new Error("no settings chips box on the page");
      const computed = getComputedStyle(box);
      return {
        overflowX: computed.overflowX,
        overflowY: computed.overflowY,
        flexWrap: computed.flexWrap,
        scrollSnapType: computed.scrollSnapType,
        scrollWidth: box.scrollWidth,
        clientWidth: box.clientWidth,
      };
    });

    expect(style.overflowX).not.toBe("auto");
    expect(style.overflowX).not.toBe("scroll");
    expect(style.overflowY).not.toBe("auto");
    expect(style.overflowY).not.toBe("scroll");
    expect(style.scrollSnapType).toBe("none");
    expect(style.flexWrap).toBe("wrap");
    expect(style.scrollWidth).toBeLessThanOrEqual(style.clientWidth);
  });

  for (const count of [4, 5] as const)
    test(`truncates no chip a wrap could have shown, at ${String(count)} chips`, async ({
      page,
    }) => {
      // ADR 0082 decision 3. The ellipsis survives for exactly one case — a label longer than a
      // whole line — and every chip here is a real label that fits one, so none of them may be cut.
      await withChipCount(page, count);

      const truncated = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="global-settings-chips"] > *',
          ),
        ]
          .map((chip, index) => ({
            index,
            text: chip.textContent,
            overflow: chip.scrollWidth - chip.clientWidth,
          }))
          .filter((chip) => chip.overflow > 1),
      );

      expect(truncated).toEqual([]);
    });

  test("keeps the trigger's position a function of the viewport, not the chip count", async ({
    page,
  }) => {
    // ADR 0082 decision 4: the trigger does not join the wrap. Its left edge is the number that
    // moves if it ever does, so it is the number compared across every count.
    const lefts: number[] = [];
    for (const count of CHIP_COUNTS) {
      await withChipCount(page, count);
      const [trigger] = await boxesOf(
        page,
        '[data-testid="global-settings-trigger"]',
      );
      if (!trigger) throw new Error("no settings trigger on the page");
      lefts.push(Math.round(trigger.x));
    }

    expect(new Set(lefts).size, `trigger lefts were ${lefts.join(", ")}`).toBe(
      1,
    );
  });
});

test.describe("the trigger is tappable, and the price bar stays reachable", () => {
  test("gives the trigger at least the declared touch target", async ({
    page,
  }) => {
    // `docs/BACKLOG.md` entry 33, closed by ADR 0082 decision 8: with `padding: 0` this button's own
    // box was a 13 px text line box inside a 40 px pill drawn by a different element.
    for (const count of CHIP_COUNTS) {
      await withChipCount(page, count);
      const [trigger] = await boxesOf(
        page,
        '[data-testid="global-settings-trigger"]',
      );
      if (!trigger) throw new Error("no settings trigger on the page");

      expect(
        trigger.height,
        `at ${String(count)} chips`,
      ).toBeGreaterThanOrEqual(TOUCH_TARGET_PX - SUB_PIXEL_SLACK);
    }
  });

  for (const count of CHIP_COUNTS)
    test(`lets a tap reach the price bar's own control at ${String(count)} chips`, async ({
      page,
    }) => {
      // The `z-index: 7` interception, asserted rather than inferred from the absence of red: wave
      // 6K-b3 reverted an overflowing chips subtree that painted over the price bar and swallowed
      // the pointer, taking 44 of 58 specs with it.
      await withChipCount(page, count);

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

      expect(reached.hitTestId).not.toBe("global-settings-chips");
      expect(reached.isTheControl).toBe(true);

      await page.getByTestId("price-breakdown-trigger").click();
      await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();
    });

  test("absorbs the strip's growth in the stage and nowhere else", async ({
    page,
  }) => {
    // ADR 0082 decision 5. The stage is measured as the gap the other two bands leave rather than
    // off the canvas element: `<Canvas>` sizes its own drawing surface from a resize observer, so a
    // canvas read one tick after a reflow measures the observer's latency and not the layout.
    await withChipCount(page, 2);
    const bounds = await viewport(page);
    const atTwo = await bandsOf(page);

    await withChipCount(page, 5);
    const atFive = await bandsOf(page);

    expect(atFive.strip.height).toBeGreaterThan(atTwo.strip.height);
    expect(atFive.stageHeight).toBeGreaterThan(0);
    expectInside(atFive.priceBar, bounds, "the price bar");
    // The strip is above the bar and does not overlay it: the two bands do not intersect.
    expect(atFive.strip.y + atFive.strip.height).toBeLessThanOrEqual(
      atFive.priceBar.y + SUB_PIXEL_SLACK,
    );
    // The bar pays nothing for the growth; the stage pays all of it.
    expect(atFive.priceBar.height).toBe(atTwo.priceBar.height);
    expect(atFive.stageHeight).toBeLessThan(atTwo.stageHeight);
  });
});
