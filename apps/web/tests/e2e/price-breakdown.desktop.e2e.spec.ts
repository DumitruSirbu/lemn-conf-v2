import { expect, test, type Page } from "@playwright/test";

import { ro } from "../../src/content/ro";

/**
 * **Frame D2D's popover at 1440 × 900.** The same component and the same model as the mobile sheet;
 * what differs is the box, and the box is a stylesheet branch (§10.1's one permitted fork).
 *
 * The criterion is "a popover **anchored to the price**", which is a claim about where it is — so
 * this measures it against the price bar's own box rather than merely asserting it is visible.
 */

const SCENE_SETTLE_MS = 2000;

/** Frame D2D's popover width. Read from the shipped stylesheet would be better; it is written here
 *  because what is asserted is *not the number* but that the surface is far narrower than the
 *  screen — a sheet would span it. */
const POPOVER_MAX_SHARE_OF_VIEWPORT = 0.5;

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

test("hangs a popover from the price rather than covering the screen", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").click();

  const popover = await page
    .getByTestId("price-breakdown-surface")
    .boundingBox();
  const bar = await page.getByTestId("price-bar").boundingBox();
  const viewport = page.viewportSize();
  if (!popover || !bar || !viewport)
    throw new Error("the popover is not laid out");

  // Below the bar it belongs to, and inside the same right-hand end of the screen.
  expect(popover.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(popover.x + popover.width).toBeLessThanOrEqual(viewport.width);
  expect(popover.x).toBeGreaterThan(viewport.width / 2);
  expect(popover.width).toBeLessThan(
    viewport.width * POPOVER_MAX_SHARE_OF_VIEWPORT,
  );
});

test("renders the same model as the sheet does", async ({ page }) => {
  await page.getByTestId("price-breakdown-trigger").click();

  await expect(page.getByTestId("price-breakdown-disclaimer")).toHaveText(
    ro.priceBreakdown.disclaimer,
  );
  await expect(page.getByTestId("price-breakdown-whole-kitchen")).toContainText(
    ro.priceBreakdown.included,
  );
});

test("moves focus in, closes on Escape, and gives focus back", async ({
  page,
}) => {
  const trigger = page.getByTestId("price-breakdown-trigger");

  await trigger.click();
  expect(await focusedTestId(page)).toBe("price-breakdown-surface");

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});

test("dismisses when the screen behind it is clicked", async ({ page }) => {
  await page.getByTestId("price-breakdown-trigger").click();

  await page
    .getByTestId("price-breakdown-scrim")
    .click({ position: { x: 40, y: 400 } });

  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});
