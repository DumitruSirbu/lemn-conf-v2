import { expect, test, type Page } from "@playwright/test";

import { ro } from "../../src/content/ro";

/**
 * **Frame 2D's sheet at 390 × 844, and its focus story.**
 *
 * The open/closed state and the focus that follows it are the only things `price-breakdown.tsx`
 * decides, and neither is reachable from a value: `renderToStaticMarkup` cannot press a button, and
 * this suite renders in `node`. So the model and the copy are asserted there and the interaction is
 * asserted here — a real browser, the real stylesheet, the real keyboard.
 *
 * What must hold, in the words the wave uses: focus moves in, Escape closes, focus returns to what
 * opened it. Plus the shell itself — a **full sheet** on this viewport, with its own close action.
 */

const SCENE_SETTLE_MS = 2000;

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** What the browser considers focused, named by its test id — enough to say *which* element without
 *  depending on the markup around it. */
async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

test("opens the breakdown from the control beside the price", async ({
  page,
}) => {
  const trigger = page.getByTestId("price-breakdown-trigger");

  await expect(trigger).toHaveText(new RegExp(ro.priceBreakdown.title));
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);

  await trigger.tap();

  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
});

test("stands beside the figure it explains, on the bar's own row", async ({
  page,
}) => {
  // Frame 2A draws the control at the right-hand end of the price bar, level with the total. It is
  // a sibling of the bar rather than a child of it, so this is the assertion that the two still read
  // as one band.
  const trigger = await page
    .getByTestId("price-breakdown-trigger")
    .boundingBox();
  const bar = await page.getByTestId("price-bar").boundingBox();
  const total = await page.getByTestId("price-bar-total").boundingBox();
  if (!trigger || !bar || !total)
    throw new Error("the price row is not laid out");

  expect(trigger.x).toBeGreaterThan(total.x + total.width);
  expect(trigger.y).toBeGreaterThanOrEqual(bar.y);
  expect(trigger.y + trigger.height).toBeLessThanOrEqual(bar.y + bar.height);
});

test("moves focus into the sheet when it opens", async ({ page }) => {
  await page.getByTestId("price-breakdown-trigger").tap();

  expect(await focusedTestId(page)).toBe("price-breakdown-surface");
});

test("closes on Escape and returns focus to the control that opened it", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").tap();
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});

test("closes from its own close action, and returns focus the same way", async ({
  page,
}) => {
  // The mobile sheet covers the bar it was opened from, so it must carry a way out of its own.
  await page.getByTestId("price-breakdown-trigger").tap();
  await page.getByTestId("price-breakdown-close").tap();

  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});

test("renders a full sheet, not a popover, at this viewport", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").tap();

  const sheet = await page.getByTestId("price-breakdown-surface").boundingBox();
  const viewport = page.viewportSize();
  if (!sheet || !viewport) throw new Error("the sheet is not laid out");

  expect(sheet.width).toBe(viewport.width);
  expect(Math.round(sheet.y + sheet.height)).toBe(viewport.height);
});

test("states the exclusions and the on-site measurement on the sheet", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").tap();

  await expect(page.getByTestId("price-breakdown-disclaimer")).toHaveText(
    ro.priceBreakdown.disclaimer,
  );
  await expect(page.getByTestId("price-breakdown-note")).toContainText(
    ro.priceBreakdown.note,
  );
});

test("lists the kitchen the scene is showing, grouped and in order", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").tap();

  // The order itself is asserted against the one comparator in
  // `tests/price/display-order-convergence.test.ts`; what this adds is that the list survives the
  // trip through a real stylesheet with real scrolling rather than existing only in markup.
  await expect(page.getByTestId("price-breakdown-group").first()).toContainText(
    ro.priceBreakdown.groupHeading("A", ro.priceBreakdown.bandHeadings.base),
  );
  await expect(page.getByTestId("price-breakdown-whole-kitchen")).toContainText(
    ro.priceBreakdown.included,
  );
});
